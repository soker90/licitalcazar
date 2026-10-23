const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const { initDb } = require('./init-db');
const { getOfertaUnicaEconomicAssessment } = require('./oferta-unica-economia');
const { isEligibleAwardLotStatus, eligibleAwardLotStatusSql, eligibleAwardResultStateSql, excludeAwardWhenLegacyLotTerminalSql, excludeLegacyLotWhenStructuredTerminalResultSql, allowLegacyLotAwardFallbackSql, lotAwardsAmountCoverageSql, eligibleLegacyLotAwardAmountSql, terminalNoAwardResultStateSql } = require('../src/lib/lot-status');
const { terminalContractStatusSql, canceledContractStatusSql, resolvedContractStatusSql, explicitlyAwardedContractStatusSql } = require('../src/lib/contract-status-sql.ts');
const path = require('node:path');

function buildNspAwardeeEvidence(contract, awardedLots, hasMultipleLots) {
  if (!hasMultipleLots && awardedLots.length === 0) {
    return `Adjudicatario: ${contract.awardee || 'Desconocido'}`;
  }

  const awardeesByLot = new Map();
  for (const lot of awardedLots) {
    if (!isEligibleAwardLotStatus(lot.lot_status)) continue;
    const awardee = String(lot.awardee ?? '').trim();
    const lotNumber = String(lot.lot_number ?? '').trim();
    if (!awardee || !lotNumber) continue;
    const awardees = awardeesByLot.get(lotNumber) ?? new Set();
    awardees.add(awardee);
    awardeesByLot.set(lotNumber, awardees);
  }

  if (awardeesByLot.size === 0) return 'Adjudicatarios por lote: No constan en los datos disponibles';

  const details = [...awardeesByLot.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
    .map(([lotNumber, awardees]) => `lote ${lotNumber}: ${[...awardees].sort((a, b) => a.localeCompare(b, 'es')).join(', ')}`);

  return `Adjudicatarios por lote: ${details.join('; ')}`;
}

function buildNspLotCountQuery() {
  return `
    SELECT COUNT(DISTINCT lot_number) AS lot_count
    FROM (
      SELECT lot_number FROM contract_lots WHERE contract_id = ?
      UNION
      SELECT lot_number FROM lot_awards WHERE contract_id = ?
    )
  `;
}

function buildNspLotsQuery() {
  return `
      SELECT
        award.id,
        award.lot_number,
        lot.lot_name,
        award.awarded_amount,
        lot.amount_excl_vat,
        lot.budget_excl_vat,
        award.result_state AS lot_status,
        award.awardee,
        award.awardee_nif,
        award.offer_count
      FROM lot_awards award
      LEFT JOIN contract_lots lot
        ON lot.contract_id = award.contract_id
       AND lot.lot_number = award.lot_number
      WHERE award.contract_id = ?
        AND trim(coalesce(award.awardee, '')) <> ''
        AND ${eligibleAwardResultStateSql('award')}
        AND ${excludeAwardWhenLegacyLotTerminalSql('award')}

      UNION ALL

      SELECT
        lot.id,
        lot.lot_number,
        lot.lot_name,
        lot.awarded_amount,
        lot.amount_excl_vat,
        lot.budget_excl_vat,
        lot.lot_status,
        lot.awardee,
        lot.awardee_nif,
        lot.offer_count
      FROM contract_lots lot
      WHERE lot.contract_id = ?
        AND ${eligibleAwardLotStatusSql('lot')}
        AND ${allowLegacyLotAwardFallbackSql('lot')}
    `;
}

function hasZeroDiscountWithCompleteLotCoverage(lotes) {
  const lotsByNumber = new Map();

  for (const lot of lotes) {
    if (!isEligibleAwardLotStatus(lot.lot_status)) continue;

    const lotNumber = String(lot.lot_number ?? '').trim();
    if (!lotNumber) return false;

    const budget = Number(lot.budget_excl_vat ?? lot.amount_excl_vat);
    if (!Number.isFinite(budget) || budget <= 0) return false;

    if (lot.awarded_amount == null) return false;
    const awarded = Number(lot.awarded_amount);
    if (!Number.isFinite(awarded) || awarded <= 0) return false;

    const current = lotsByNumber.get(lotNumber);
    if (current && Math.abs(current.budget - budget) > 0.05) return false;

    lotsByNumber.set(lotNumber, {
      budget,
      awarded: (current?.awarded ?? 0) + awarded,
    });
  }

  return lotsByNumber.size > 1 && [...lotsByNumber.values()].every(lot =>
    Math.abs(lot.budget - lot.awarded) <= 0.05
  );
}

function hasZeroDiscountWithComparableSingleAward(contract) {
  const budget = Number(contract.amount_excl_vat) || 0;
  const awarded = Number(contract.awarded_amount) || 0;
  const comparable = contract.award_amount_type == null || contract.award_amount_type === 'total';

  return comparable && budget > 0 && awarded > 0 && Math.abs(budget - awarded) <= 0.05;
}

function hasSingleOfferWithCompleteLotCoverage(lotes) {
  const offersByLot = new Map();

  for (const lot of lotes) {
    if (!isEligibleAwardLotStatus(lot.lot_status)) continue;

    const lotNumber = String(lot.lot_number ?? '').trim();
    if (!lotNumber) return false;

    // Without an awardee or award amount, this row does not confirm an awarded lot.
    if (!String(lot.awardee ?? '').trim() && lot.awarded_amount == null) return false;

    if (lot.offer_count == null || String(lot.offer_count).trim() === '') return false;
    const offerCount = Number(lot.offer_count);
    if (!Number.isInteger(offerCount) || offerCount < 1) return false;

    const existing = offersByLot.get(lotNumber);
    if (existing != null && existing !== offerCount) return false;
    offersByLot.set(lotNumber, offerCount);
  }

  return offersByLot.size > 1 && [...offersByLot.values()].every(count => count === 1);
}

function hasSingleOfferWithCompleteLotCoverageSql(contractAlias = 'contracts') {
  const contractId = `${contractAlias}.id`;
  const offerCount = `coalesce(lot.offer_count, (
    SELECT max(award.offer_count)
    FROM lot_awards award
    WHERE award.contract_id = lot.contract_id
      AND award.lot_number = lot.lot_number
      AND award.offer_count IS NOT NULL
      AND ${eligibleAwardResultStateSql('award')}
      AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
  ))`;
  const structuredAwardEvidence = `EXISTS (
    SELECT 1
    FROM lot_awards award
    WHERE award.contract_id = lot.contract_id
      AND award.lot_number = lot.lot_number
      AND ${eligibleAwardResultStateSql('award')}
      AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
      AND (trim(coalesce(award.awardee, '')) <> '' OR award.awarded_amount IS NOT NULL)
  )`;
  const structuredAwardAmountEvidence = `EXISTS (
    SELECT 1
    FROM lot_awards award
    WHERE award.contract_id = lot.contract_id
      AND award.lot_number = lot.lot_number
      AND award.awarded_amount IS NOT NULL
      AND ${eligibleAwardResultStateSql('award')}
      AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
  )`;
  const eligibleLots = `lot.contract_id = ${contractId}
    AND ${eligibleAwardLotStatusSql('lot')}
    AND ${excludeLegacyLotWhenStructuredTerminalResultSql('lot')}`;
  const hasCompleteLegacyCoverage = `(
    (SELECT count(DISTINCT lot.lot_number)
     FROM contract_lots lot
     WHERE ${eligibleLots}) > 1
    AND (SELECT count(DISTINCT lot.lot_number)
         FROM contract_lots lot
         WHERE ${eligibleLots}
           AND (lot.awarded_amount IS NOT NULL OR ${structuredAwardAmountEvidence})) <= 1
    AND NOT EXISTS (
      SELECT 1
      FROM contract_lots lot
      WHERE ${eligibleLots}
        AND (
          trim(coalesce(lot.lot_number, '')) = ''
          OR (trim(coalesce(lot.awardee, '')) = '' AND lot.awarded_amount IS NULL AND NOT ${structuredAwardEvidence})
          OR ${offerCount} IS NULL
          OR ${offerCount} <> 1
        )
    )
  )`;
  const hasCompleteStructuredCoverage = `(
    NOT EXISTS (
      SELECT 1 FROM contract_lots lot WHERE lot.contract_id = ${contractId}
    )
    AND (SELECT count(DISTINCT award.lot_number)
         FROM lot_awards award
         WHERE award.contract_id = ${contractId}
           AND ${eligibleAwardResultStateSql('award')}
           AND (trim(coalesce(award.awardee, '')) <> '' OR award.awarded_amount IS NOT NULL)) > 1
    AND (SELECT count(DISTINCT award.lot_number)
         FROM lot_awards award
         WHERE award.contract_id = ${contractId}
           AND award.awarded_amount IS NOT NULL
           AND ${eligibleAwardResultStateSql('award')}) <= 1
    AND NOT EXISTS (
      SELECT 1
      FROM lot_awards award
      WHERE award.contract_id = ${contractId}
        AND ${eligibleAwardResultStateSql('award')}
        AND (trim(coalesce(award.awardee, '')) <> '' OR award.awarded_amount IS NOT NULL)
      GROUP BY award.lot_number
      HAVING count(award.offer_count) <> count(*)
        OR min(award.offer_count) <> 1
        OR max(award.offer_count) <> 1
    )
  )`;

  return `(
    ${hasCompleteLegacyCoverage}
    OR ${hasCompleteStructuredCoverage}
  )`;
}

function buildBajasRowsQuery() {
  return `
      SELECT id, source_url AS url, case_number, object_description, contracting_authority_name, procedure AS procedimiento,
             amount_excl_vat, awarded_amount, awardee,
             contract_type, contract_type_code
      FROM contracts
      WHERE amount_excl_vat > 0
        AND (
          (awarded_amount IS NULL OR awarded_amount > 0)
          OR EXISTS (
            SELECT 1
            FROM lot_awards award
            WHERE award.contract_id = contracts.id
              AND award.awarded_amount > 0
              AND ${eligibleAwardResultStateSql('award')}
              AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          )
        )
        AND (
          awarded_amount IS NULL
          OR awarded_amount < amount_excl_vat
          OR EXISTS (
            SELECT 1
            FROM lot_awards award
            WHERE award.contract_id = contracts.id
              AND award.awarded_amount > 0
              AND ${eligibleAwardResultStateSql('award')}
              AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          )
        )
        AND (
          NOT ${terminalContractStatusSql('contracts', { hasLotAwardsTable: true, hasContractLotsTable: true })}
          OR EXISTS (
            SELECT 1
            FROM contract_lots lot
            WHERE lot.contract_id = contracts.id
              AND lot.awarded_amount > 0
              AND ${eligibleLegacyLotAwardAmountSql('lot', true)}
          )
        )
        AND (award_amount_type IS NULL OR award_amount_type = 'total')
        AND procedimiento NOT IN ('Contrato menor', 'Menor')
        AND economic_nature = 'gasto'
        AND coalesce(lower(contract_type), '') NOT LIKE '%patrimonial%'
        AND coalesce(lower(contract_type), '') NOT LIKE '%privado%'
        AND coalesce(trim(contract_type_code), '') <> '50';
  `;
}

function buildLotesBajaQuery() {
  const structuredAwardAmountCoverage = `(
    ${lotAwardsAmountCoverageSql('current_contract', 'coverage_lot', 'coverage_award', 'coverage_award_null')}
    AND EXISTS (
      SELECT 1
      FROM lot_awards award
      WHERE award.contract_id = current_contract.id
        AND award.awarded_amount IS NOT NULL
        AND ${eligibleAwardResultStateSql('award')}
        AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
    )
  )`;

  return `
      WITH current_contract AS (SELECT ? AS id)
      SELECT
        CASE
          WHEN ${structuredAwardAmountCoverage}
          THEN (
            SELECT round(sum(award.awarded_amount), 2)
            FROM lot_awards award
            WHERE award.contract_id = current_contract.id
              AND award.awarded_amount IS NOT NULL
              AND ${eligibleAwardResultStateSql('award')}
              AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          )
          ELSE sum(CASE WHEN ${eligibleAwardLotStatusSql('lot')}
            AND lot.awarded_amount IS NOT NULL
            THEN coalesce(lot.awarded_amount, 0) ELSE 0 END)
        END as awarded_lotes,
        CASE
          WHEN ${structuredAwardAmountCoverage}
          THEN sum(CASE WHEN ${eligibleAwardLotStatusSql('lot')}
            THEN coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0) ELSE 0 END)
          ELSE sum(CASE WHEN ${eligibleAwardLotStatusSql('lot')}
            AND lot.awarded_amount IS NOT NULL
            THEN coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0) ELSE 0 END)
        END as pbl_lotes,
        count(lot.id) as lotes
      FROM current_contract
      LEFT JOIN contract_lots lot ON lot.contract_id = current_contract.id`;
}

async function main({ dbPath = path.resolve(__dirname, '../data/licitaciones_alcazar.db'), db: suppliedDb = null, argv = process.argv } = {}) {
  const db = suppliedDb || new DatabaseSync(dbPath);
  try {
    // init-db.js is the single physical-schema source of truth. Keep build-db
    // usable on a fresh database without maintaining a second divergent schema.
    initDb(db);

    console.log('1. Creando tablas e índices FTS5...');
    // Toda la reconstrucción derivada es atómica: un fallo no debe dejar FTS,
    // alertas o relaciones vaciados parcialmente.
    db.exec('BEGIN TRANSACTION;');
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS contracts_fts USING fts5(
        id UNINDEXED, 
        case_number, 
        object_description, 
        contracting_authority_name, 
        awardee, 
        tokenize='porter unicode61'
      );

      -- FTS5 no tiene una clave UNIQUE sobre id: INSERT OR REPLACE no evita
      -- duplicados. Vaciar el índice antes de reconstruirlo hace la operación
      -- realmente idempotente cuando build-db.js se ejecuta varias veces.
      DELETE FROM contracts_fts;
      INSERT INTO contracts_fts(id, case_number, object_description, contracting_authority_name, awardee)
      SELECT id, case_number, object_description, contracting_authority_name, awardee FROM contracts;

      CREATE INDEX IF NOT EXISTS idx_contracts_contracting_authority_name ON contracts(contracting_authority_name);
      CREATE INDEX IF NOT EXISTS idx_contracts_awardee ON contracts(awardee);
      CREATE INDEX IF NOT EXISTS idx_contracts_awardee_nif ON contracts(awardee_nif);
      CREATE INDEX IF NOT EXISTS idx_contracts_year ON contracts(year);
      CREATE INDEX IF NOT EXISTS idx_contracts_contract_type ON contracts(contract_type);
      CREATE INDEX IF NOT EXISTS idx_contracts_procedure ON contracts(procedure);
      CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
      CREATE INDEX IF NOT EXISTS idx_contracts_publication_date ON contracts(publication_date);
      CREATE INDEX IF NOT EXISTS idx_contracts_scope ON contracts(scope);
    `);

    console.log('4. Precalculando alerts de auditoría...');
    // Limpiar alerts precalculadas para regeneración idempotente
    db.exec(`
      DROP TABLE IF EXISTS alerts;
      CREATE TABLE alerts (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        level TEXT NOT NULL,
        scale_score REAL NOT NULL DEFAULT 0,
        confidence REAL NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        target_data TEXT NOT NULL,
        source TEXT NOT NULL,
        source_url TEXT NOT NULL,
        extracted_at TEXT NOT NULL,
        applied_rule TEXT NOT NULL,
        methodology_version TEXT NOT NULL,
        limitations TEXT NOT NULL,
        alternative_explanation TEXT NOT NULL,
        requires_human_review INTEGER NOT NULL DEFAULT 1,
        evidence TEXT NOT NULL,
        factors_json TEXT NOT NULL,
        continuity_pattern TEXT,
        explanations_json TEXT,
        documents_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
      CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
      CREATE INDEX IF NOT EXISTS idx_alerts_scale_score ON alerts(scale_score);
      CREATE INDEX IF NOT EXISTS idx_alerts_category ON alerts(category);
      DELETE FROM alert_contracts;
      DELETE FROM related_contracts;
    `);

    const insertAlerta = db.prepare(`
      INSERT OR REPLACE INTO alerts(
        id, category, type, severity, level, scale_score, confidence, title, description,
        target_data, source, source_url, extracted_at, applied_rule, methodology_version,
        limitations, alternative_explanation, requires_human_review,
        evidence, factors_json, continuity_pattern, explanations_json, documents_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAlertaContrato = db.prepare(`
      INSERT OR IGNORE INTO alert_contracts(alert_id, contract_id)
      VALUES (?, ?)
    `);
    const insertRelacionado = db.prepare(`
      INSERT OR REPLACE INTO related_contracts(group_id, contract_id, similarity_score, accumulated_amount, reasons_json)
      VALUES (?, ?, ?, ?, ?)
    `);

    const nowIso = new Date().toISOString();

    // A. Alertas de Contratos Menores Relacionados (Fraccionamiento / Acumulación)
    const { detectarFraccionamiento } = await import('../src/lib/fraccionamiento.ts');
    const menoresRows = db.prepare(`
      WITH minor_source AS (
        SELECT
          l.id,
          l.source_url,
          l.awardee,
          l.awardee_nif,
          l.contracting_authority_id,
          l.contracting_authority_name,
          l.contract_type,
          l.object_description,
          l.primary_cpv,
          l.awarded_amount,
          l.award_date,
          l.scope
        FROM contracts l
        WHERE l.procedure IN ('Contrato menor', 'Menor')
          AND l.awardee IS NOT NULL AND trim(l.awardee) <> ''
          AND l.award_date IS NOT NULL
          AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total')
          AND NOT ${terminalContractStatusSql('l')}
          AND NOT EXISTS (
            SELECT 1 FROM contract_lots lot_parent
            WHERE lot_parent.contract_id = l.id
          )

        UNION ALL

        SELECT
          l.id,
          l.source_url,
          ll.awardee,
          ll.awardee_nif,
          l.contracting_authority_id,
          l.contracting_authority_name,
          l.contract_type,
          l.object_description,
          coalesce(nullif(ll.cpv, ''), l.primary_cpv),
          ll.awarded_amount,
          coalesce(ll.award_date, l.award_date),
          l.scope
        FROM contracts l
        JOIN contract_lots ll ON ll.contract_id = l.id
        WHERE l.procedure IN ('Contrato menor', 'Menor')
          AND trim(coalesce(ll.awardee, '')) <> ''
          AND coalesce(ll.award_date, l.award_date) IS NOT NULL
          AND ll.awarded_amount IS NOT NULL
          AND ${eligibleAwardLotStatusSql('ll')}
          AND NOT ${canceledContractStatusSql('l')}
          AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido'))
          AND NOT EXISTS (
            SELECT 1
            FROM lot_awards award_parent
            WHERE award_parent.contract_id = l.id
              AND award_parent.lot_number = ll.lot_number
              AND award_parent.awardee IS NOT NULL
              AND trim(award_parent.awardee) <> ''
              AND award_parent.award_date IS NOT NULL
              AND award_parent.awarded_amount IS NOT NULL
              AND ${eligibleAwardResultStateSql('award_parent')}
              AND ${excludeAwardWhenLegacyLotTerminalSql('award_parent')}
          )
          AND ${excludeLegacyLotWhenStructuredTerminalResultSql('ll')}

        UNION ALL

        SELECT
          l.id,
          l.source_url,
          la.awardee,
          la.awardee_nif,
          l.contracting_authority_id,
          l.contracting_authority_name,
          l.contract_type,
          l.object_description,
          l.primary_cpv,
          la.awarded_amount,
          la.award_date,
          l.scope
        FROM contracts l
        JOIN lot_awards la ON la.contract_id = l.id
        WHERE l.procedure IN ('Contrato menor', 'Menor')
          AND trim(coalesce(la.awardee, '')) <> ''
          AND la.award_date IS NOT NULL
          AND la.awarded_amount IS NOT NULL
          AND ${eligibleAwardResultStateSql('la')}
          AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
          AND NOT ${canceledContractStatusSql('l')}
          AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido'))
      )
      SELECT
        l.id,
        l.source_url,
        l.awardee,
        nullif(l.awardee_nif, '') as awardee_nif,
        r.canonical_id,
        r.group_id,
        r.group_name,
        l.contracting_authority_id,
        l.contracting_authority_name,
        l.contract_type,
        l.object_description,
        nullif(l.primary_cpv, '') as primary_cpv,
        l.awarded_amount,
        l.award_date
      FROM minor_source l
      LEFT JOIN company_resolution r
        ON coalesce(l.awardee_nif, '') = r.raw_nif
       AND coalesce(l.awardee, '') = r.raw_name
      WHERE 1 = 1;
    `).all();

    const menoresUrlMap = new Map(menoresRows.map((r) => [r.id, r.source_url]));

    const menoresContratos = menoresRows.map((r) => ({
      id: r.id,
      canonicalId: r.canonical_id || null,
      adjudicatario: r.awardee,
      nif: r.awardee_nif || null,
      grupoId: r.group_id || null,
      grupoNombre: r.group_name || null,
      authorityId: r.contracting_authority_id || null,
      organo: r.contracting_authority_name,
      tipoContrato: r.contract_type || '',
      objeto: r.object_description || '',
      cpv: r.primary_cpv || null,
      importeSinIva: Number(r.awarded_amount) || 0,
      fechaAdjudicacion: (r.award_date || '').slice(0, 10),
    }));

    const { casos } = detectarFraccionamiento(menoresContratos);
    const getMinorAlertId = (caso) => {
      const contractIds = [...(caso.contratoIds || [])].sort();
      const identity = contractIds.length > 0
        ? contractIds.join('\\0')
        : [caso.adjudicatario, caso.organo, caso.fechaInicio, caso.fechaFin, caso.bucketUmbral, caso.canonicalId || '', caso.grupoNombre || ''].join('\\0');
      return 'ALERT-MENOR-' + createHash('sha256').update(identity, 'utf8').digest('hex').slice(0, 24);
    };
    let menorAlertCount = 0;
    for (let idx = 0; idx < casos.length; idx++) {
      const c = casos[idx];
      const alertaId = getMinorAlertId(c);
      const severity = c.severidad === 'alta' ? 'ALTA' : c.severidad === 'media' ? 'MEDIA' : 'INFORMATIVA';
      const confidence = Math.min(98, Math.max(50, Math.round(50 + (c.similitudObjetos * 30) + (c.excesoPct > 20 ? 18 : 0))));
      const title = `Acumulación de contratos menores: ${c.adjudicatario} (${c.numContratos} contratos)`;
      const desc = `Se ha detectado una acumulación de contratos menores con elementos coincidentes en el periodo analizado (${c.numContratos} contratos menores adjudicados a ${c.adjudicatario} ante ${c.organo} que suman ${c.suma.toLocaleString('es-ES')} € en ${c.spanDias} días). Este resultado es una señal analítica y no acredita por sí mismo un fraccionamiento indebido. Para valorar esa cuestión debe examinarse la unidad funcional, la previsibilidad de la necesidad y el contenido de los expedientes.`;
      const evidence = `Objetos: ${c.objetos.slice(0, 3).join(' // ')}${c.objetos.length > 3 ? ` (+${c.objetos.length - 3} contratos más)` : ''}. Periodo: ${c.fechaInicio} a ${c.fechaFin}.`;
      const factores = [
        { label: 'Mismo awardee ante el mismo órgano de contratación', scoreContribution: 20 },
        { label: `Similitud léxica o CPV entre prestaciones (${Math.round(c.similitudObjetos * 100)}%)`, scoreContribution: Math.round(c.similitudObjetos * 25) },
        { label: `Importe acumulado supera el umbral analítico de referencia (+${c.excesoPct}% s/umbral)`, scoreContribution: Math.min(25, c.excesoPct) },
        { label: c.spanDias <= 90 ? `Concentración temporal estrecha (${c.spanDias} días)` : `Distribución temporal en el periodo (${c.spanDias} días)`, scoreContribution: c.spanDias <= 90 ? 20 : 10 }
      ];

      const firstCid = c.contratoIds && c.contratoIds[0];
      const rawUrl = firstCid ? menoresUrlMap.get(firstCid) : null;
      const urlFuente = rawUrl && rawUrl.startsWith('http') ? rawUrl.trim() : 'Enlace oficial no disponible en los datos consultados';
      const datoObjetivo = `${c.numContratos} contratos menores adjudicados a ${c.adjudicatario} ante ${c.organo} por un amount total acumulado de ${c.suma.toLocaleString('es-ES')} € en ${c.spanDias} días.`;
      const reglaAplicada = 'Art. 118.2 y 99.2 LCSP (Contratos menores y prohibición de fraccionamiento del object_description)';
      const versionMetodologia = 'v2.1';
      const limitations = 'Cálculo algorítmico sobre metadatos estructurados de PLACSP. No incluye acceso a los expedientes administrativos completos ni a los informes de necesidad.';
      const explicacionAlternativa = 'Prestaciones de distinta naturaleza técnica o imprevistos sobrevenidos que justifican contrataciones menores independientes.';

      insertAlerta.run(
        alertaId,
        'D', // Categoria D: Requiere revisión y cotejo del case_number
        'CONTRATOS_RELACIONADOS',
        severity,
        severity.toLowerCase(),
        c.scoreEscala,
        confidence,
        title,
        desc,
        datoObjetivo,
        'Plataforma de Contratación del Sector Público (PLACSP)',
        urlFuente,
        nowIso,
        reglaAplicada,
        versionMetodologia,
        limitations,
        explicacionAlternativa,
        1, // requiereRevisionHumana
        evidence,
        JSON.stringify(factores),
        c.patronContinuidad || null,
        JSON.stringify(c.explicacionesAlternativas || []),
        JSON.stringify(c.documentosInvestigacion || []),
        nowIso
      );

      if (c.contratoIds && c.contratoIds.length > 0) {
        for (const cid of c.contratoIds) {
          insertAlertaContrato.run(alertaId, cid);
          insertRelacionado.run(alertaId, cid, c.similitudObjetos, c.suma, JSON.stringify(factores));
        }
      }
      menorAlertCount++;
    }

    // B. Alertas de Oferta Única (procedimiento competitivo con concurrencia limitada a 1 licitador)
    const unicasRows = db.prepare(`
      SELECT id, source_url AS url, case_number, object_description, contracting_authority_name, procedure AS procedimiento,
             CASE
               WHEN award_amount_type IS NULL OR award_amount_type = 'total'
               THEN CASE
                 WHEN (
                    ${lotAwardsAmountCoverageSql('contracts')}
                    AND EXISTS (
                      SELECT 1
                      FROM lot_awards award
                      WHERE award.contract_id = contracts.id
                        AND award.awarded_amount IS NOT NULL
                        AND ${eligibleAwardResultStateSql('award')}
                        AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                    )
                  )
                  THEN (
                   SELECT round(sum(award.awarded_amount), 2)
                   FROM lot_awards award
                   WHERE award.contract_id = contracts.id
                     AND award.awarded_amount IS NOT NULL
                     AND ${eligibleAwardResultStateSql('award')}
                     AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                 )
                 WHEN EXISTS (
                    SELECT 1
                    FROM contract_lots lot
                    WHERE lot.contract_id = contracts.id
                      AND lot.awarded_amount IS NOT NULL
                      AND ${eligibleLegacyLotAwardAmountSql('lot')}
                  )
                  THEN (
                    SELECT round(sum(lot.awarded_amount), 2)
                    FROM contract_lots lot
                    WHERE lot.contract_id = contracts.id
                      AND lot.awarded_amount IS NOT NULL
                      AND ${eligibleLegacyLotAwardAmountSql('lot')}
                  )
                  ELSE CASE
                    WHEN EXISTS (
                      SELECT 1
                      FROM lot_awards terminal_award
                      WHERE terminal_award.contract_id = contracts.id
                        AND ${terminalNoAwardResultStateSql('terminal_award')}
                    ) THEN NULL
                    ELSE awarded_amount
                  END
               END
               ELSE NULL
             END AS awarded_amount,
             awardee, economic_nature, award_amount_type
      FROM contracts
      WHERE procedure IN ('Abierto', 'Abierto simplificado', 'Abierto supersimplificado', 'Restringido')
        AND (${explicitlyAwardedContractStatusSql('contracts')} OR ${resolvedContractStatusSql('contracts')})
        AND NOT ${terminalContractStatusSql('contracts')}
        AND (
          (
            offer_count = 1
            AND awardee IS NOT NULL
            AND trim(awardee) != ''
            AND awardee != 'Sin awardee'
            AND NOT EXISTS (
              SELECT 1 FROM contract_lots lot WHERE lot.contract_id = contracts.id
            )
            AND NOT EXISTS (
              SELECT 1 FROM lot_awards award
              WHERE award.contract_id = contracts.id
                AND ${eligibleAwardResultStateSql('award')}
            )
          )
          OR ${hasSingleOfferWithCompleteLotCoverageSql('contracts')}
        )
        AND (
          awarded_amount > 0
          OR EXISTS (
            SELECT 1
            FROM lot_awards award
            WHERE award.contract_id = contracts.id
              AND award.awarded_amount > 0
              AND ${eligibleAwardResultStateSql('award')}
              AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          )
          OR EXISTS (
            SELECT 1
            FROM contract_lots lot
            WHERE lot.contract_id = contracts.id
              AND lot.awarded_amount > 0
              AND ${eligibleAwardLotStatusSql('lot')}
          )
        );
    `).all();

    let unicaAlertCount = 0;
    for (const u of unicasRows) {
      const alertaId = `ALERT-UNICA-${u.id}`;
      const title = `Oferta única en concurso público (${u.case_number || 'Sin exp'})`;
      const desc = `Se ha registrado una única oferta admitida en el procedimiento (${u.procedimiento}, case_number ${u.case_number || 'Sin exp'}). Este dato puede justificar la consulta de los pliegos, del plazo de licitación y de las condiciones de solvencia, pero no acredita por sí mismo una restricción indebida de la competencia.`;
      const imp = Number(u.awarded_amount || 0);
      const economicAssessment = getOfertaUnicaEconomicAssessment(imp, u.economic_nature, u.award_amount_type);
      const { severidad, scoreEscala } = economicAssessment;
      const importeComparable = u.award_amount_type == null || u.award_amount_type === 'total';
      const evidenceImporte = importeComparable
        ? `Importe: ${imp.toLocaleString('es-ES')} €`
        : 'Importe: no comparable (precio unitario/canon)';
      const evidence = `Órgano: ${u.contracting_authority_name} · Adjudicatario: ${u.awardee || 'Desconocido'} · ${evidenceImporte} · Num. ofertas recibidas: 1`;
      const factores = [
        { label: 'Procedimiento competitivo con concurrencia limitada a un único licitador', scoreContribution: 40 },
        { label: 'Solo consta una oferta admisible registrada en PLACSP', scoreContribution: 40 },
        { label: economicAssessment.factorEconomico, scoreContribution: economicAssessment.factorEconomicoScore }
      ];
      const explicaciones = [
        'Alta especialización técnica del object_description o estrechez de mercado donde operan pocas empresas certificadas.',
        'Criterios de solvencia técnica o económica rigurosos pero proporcionales a la complejidad del contrato.',
        'Falta de capacidad coyuntural o desinterés comercial de competidores en las fechas del concurso.'
      ];
      const documentos = [
        'Pliego de Cláusulas Administrativas Particulares (PCAP) para examinar solvencias mínimas y criterios de adjudicación.',
        'Actas de la Mesa de Contratación y certificado de recepción de plicas en el portal de licitación.',
        'Informe técnico de valoración y justificación del precio admisible emitido por el técnico municipal.'
      ];

      const urlFuente = u.url && u.url.startsWith('http') ? u.url.trim() : 'Enlace oficial no disponible en los datos consultados';
      const datoObjetivo = `Concurrencia de 1 única oferta admitida en procedimiento ${u.procedimiento} por amount de ${imp.toLocaleString('es-ES')} €.`;
      const reglaAplicada = 'Art. 132 y 157 LCSP (Principios de concurrencia e igualdad de trato)';
      const versionMetodologia = 'v2.1';
      const limitations = 'La plataforma refleja exclusivamente las ofertas formalmente admitidas registradas en el perfil de contratante de PLACSP.';
      const explicacionAlternativa = 'Alta especialización técnica del object_description o condiciones de solvencia rigurosas pero proporcionales a la prestación.';

      insertAlerta.run(
        alertaId,
        'A', // Categoria A: Hecho objetivo verificado en source oficial
        'OFERTA_UNICA',
        severidad,
        severidad.toLowerCase(),
        scoreEscala,
        100,
        title,
        desc,
        datoObjetivo,
        'Plataforma de Contratación del Sector Público (PLACSP)',
        urlFuente,
        nowIso,
        reglaAplicada,
        versionMetodologia,
        limitations,
        explicacionAlternativa,
        1, // requiereRevisionHumana
        evidence,
        JSON.stringify(factores),
        'oferta_unica',
        JSON.stringify(explicaciones),
        JSON.stringify(documentos),
        nowIso
      );
      insertAlertaContrato.run(alertaId, u.id);
      unicaAlertCount++;
    }

    // C. Alertas de Baja Acusada (Descuento muy elevado s/PBL - Señal Art. 149 LCSP)
    const docAnormalidadStmt = db.prepare(`
      SELECT id, title, source_url AS url, document_date
      FROM contract_documents
      WHERE contract_id = ?
        AND is_abnormally_low_bid_justification = 1
      ORDER BY document_date DESC, id ASC
      LIMIT 1
    `);

    const bajasRows = db.prepare(buildBajasRowsQuery()).all();

    const lotesBajaStmt = db.prepare(buildLotesBajaQuery());

    let bajaAlertCount = 0;
    let bajaJustificadaCount = 0;
    for (const b of bajasRows) {
      let pbl = Number(b.amount_excl_vat);
      let adj = Number(b.awarded_amount);

      // En expedientes multilote, la adjudicación puede vivir solo en los lotes.
      // Cuando hay estructura de lotes válida, usar sus importes no desiertos evita
      // perder la señal por un padre con awarded_amount NULL y evita contar lotes desiertos.
      const lotesRow = lotesBajaStmt.get(b.id);
      const lotes = Number(lotesRow?.lotes || 0);
      const pblLotes = Number(lotesRow?.pbl_lotes || 0);
      const awardedLotes = Number(lotesRow?.awarded_lotes || 0);
      if (lotes > 0) {
        // For lotized contracts, never fall back to parent totals when the
        // eligible lot-level comparison is incomplete or all lots are terminal.
        if (!(awardedLotes > 0 && pblLotes > 0)) continue;
        pbl = pblLotes;
        adj = awardedLotes;
      } else if (awardedLotes > 0) {
        // Structured lot awards can exist before a legacy contract_lots snapshot.
        // In that case use their total against the parent PBL.
        adj = awardedLotes;
      }

      if (!(pbl > 0 && adj > 0 && adj < pbl)) continue;

      const pct = Math.round(((pbl - adj) / pbl) * 1000) / 10;
      if (pct >= 25) {
        const alertaId = `ALERT-BAJA-${b.id}`;

        // Check if there is an official justification document attached in PLACSP
        const docAnormalidad = docAnormalidadStmt.get(b.id);
        const esJustificada = Boolean(docAnormalidad);
        if (esJustificada) {
          bajaJustificadaCount++;
        }

        const severity = esJustificada ? 'INFORMATIVA' : (pct >= 40 ? 'ALTA' : 'MEDIA');
        const scoreEscala = esJustificada
          ? 1.5
          : (pct >= 40
            ? Math.min(9.2, Math.round((5.5 + ((pct - 40) / 20) * 2.5) * 10) / 10)
            : Math.min(4.9, Math.round((3.2 + ((pct - 25) / 15) * 1.5) * 10) / 10));

        const title = esJustificada
          ? `Señal analítica de baja justificada y admitida (-${pct}% s/PBL - Art. 149.4 LCSP)`
          : `Señal analítica de descuento significativo (-${pct}% s/PBL)`;

        const desc = esJustificada
          ? `Se ha detectado un descuento significativo (-${pct}%) respecto al presupuesto base de licitación (${pbl.toLocaleString('es-ES')} € vs adjudicación de ${adj.toLocaleString('es-ES')} €). El porcentaje utilizado por la plataforma es un indicador estadístico y no determina por sí solo que una oferta sea anormal. La Mesa de Contratación tramitó el procedimiento de justificación conforme al art. 149 LCSP y consta en PLACSP el informe técnico municipal acreditativo, concluyendo favorablemente sobre la viabilidad económica de la oferta.`
          : `Se ha detectado un descuento significativo (-${pct}%) respecto al presupuesto base de licitación (${pbl.toLocaleString('es-ES')} € vs adjudicación de ${adj.toLocaleString('es-ES')} €). El porcentaje utilizado por la plataforma es un indicador estadístico y no determina por sí solo que una oferta sea anormal. La valoración exige consultar los parámetros fijados en los pliegos y, en su caso, la justificación de la oferta conforme al art. 149 LCSP.`;

        const evidence = `PBL: ${pbl.toLocaleString('es-ES')} € · Adjudicación: ${adj.toLocaleString('es-ES')} € · Descuento total: ${(pbl - adj).toLocaleString('es-ES')} € (-${pct}%)`;

        const factores = esJustificada
          ? [
              { label: `Rebaja acusada del precio (-${pct}% respecto al presupuesto base)`, scoreContribution: 30 },
              { label: 'Informe técnico municipal validando la justificación de costes', scoreContribution: -30 },
              { label: 'Viabilidad económica acreditada mediante memoria y desglose (Art. 149.4 LCSP)', scoreContribution: 0 }
            ]
          : [
              { label: `Rebaja acusada del precio (-${pct}% respecto al presupuesto base)`, scoreContribution: Math.min(60, Math.round(pct)) },
              { label: 'Riesgo de desviaciones de plazo o solicitud de modificados futuros', scoreContribution: 30 },
              { label: 'Conviene verificar si se aplicó el trámite de justificación de viabilidad económica (Art. 149 LCSP)', scoreContribution: 10 }
            ];

        const explicaciones = esJustificada
          ? [
              'Oferta examinada y aceptada por los servicios técnicos municipales mediante informe formal de viabilidad económica.',
              'Economías de escala, innovación tecnológica o aprovisionamiento eficiente justificado documentalmente por el contratista.',
              'Presupuesto base de licitación holgado con costes de despliegue inferiores para licitadores con soluciones ya operativas.'
            ]
          : [
              'Economías de escala, innovación tecnológica o aprovisionamiento eficiente del contratista que abaratan costes.',
              'Estrategia de posicionamiento comercial agresivo del licitador para consolidar presencia en la zona.',
              'Presupuesto base de licitación holgado con precios unitarios superiores a los reales del mercado.'
            ];

        const documentos = esJustificada
          ? [
              `${docAnormalidad.title} (Documento oficial adjunto en PLACSP): ${docAnormalidad.url}`,
              'Informe técnico del servicio responsable aceptando la justificación de la oferta (Art. 149.4 LCSP).',
              'Memoria de costes y desglose económico presentado por el contratista en trámite de audiencia.'
            ]
          : [
              'Informe técnico del servicio responsable aceptando la justificación de la oferta (Art. 149.4 LCSP).',
              'Memoria de costes y desglose económico presentado por el contratista en trámite de audiencia.',
              'Decreto o acuerdo de adjudicación donde se valida motivadamente la viabilidad económica.'
            ];

        const urlFuente = b.url && b.url.startsWith('http') ? b.url.trim() : 'Enlace oficial no disponible en los datos consultados';
        const datoObjetivo = esJustificada
          ? `Descuento del ${pct}% entre PBL (${pbl.toLocaleString('es-ES')} €) y adjudicación (${adj.toLocaleString('es-ES')} €), validado por el informe técnico "${docAnormalidad.title}".`
          : `Descuento del ${pct}% entre el presupuesto base de licitación (${pbl.toLocaleString('es-ES')} €) y la adjudicación (${adj.toLocaleString('es-ES')} €).`;

        const reglaAplicada = 'Art. 149 LCSP (Ofertas con valores anormales o desproporcionados)';
        const versionMetodologia = 'v2.1';
        const limitations = 'El porcentaje utilizado es un indicador analítico sobre PBL. La anormalidad formal solo puede apreciarse conforme a la fórmula y criterios específicos de los pliegos.';
        const explicacionAlternativa = esJustificada
          ? 'Ahorro solvente verificado por los servicios técnicos municipales.'
          : 'Economías de escala del contratista, aprovisionamiento eficiente o márgenes comerciales ajustados legítimos.';

        insertAlerta.run(
          alertaId,
          'C', // Categoria C: Indicador analítico de riesgo
          'BAJA_ACUSADA',
          severity,
          severity.toLowerCase(),
          scoreEscala,
          90,
          title,
          desc,
          datoObjetivo,
          'Plataforma de Contratación del Sector Público (PLACSP)',
          urlFuente,
          nowIso,
          reglaAplicada,
          versionMetodologia,
          limitations,
          explicacionAlternativa,
          esJustificada ? 0 : 1, // requiereRevisionHumana
          evidence,
          JSON.stringify(factores),
          esJustificada ? 'baja_justificada' : 'baja_acusada',
          JSON.stringify(explicaciones),
          JSON.stringify(documentos),
          nowIso
        );
        insertAlertaContrato.run(alertaId, b.id);
        bajaAlertCount++;
      }
    }

    // D. Alertas de Procedimiento Negociado sin Publicidad (Art. 168 y 170.2 LCSP)
    const nspRows = db.prepare(`
      SELECT id, source_url AS url, case_number, object_description, contracting_authority_name, contracting_authority_name, procedure AS procedimiento,
             amount_excl_vat, awarded_amount, awardee, awardee_nif, offer_count, urgency, dataset AS conjunto,
             contract_type, contract_type_code, economic_nature
      FROM contracts
      WHERE lower(procedure) LIKE '%negociado%'
        AND lower(procedimiento) LIKE '%sin publicidad%'
        AND coalesce(lower(economic_nature), 'gasto') = 'gasto'
        AND coalesce(lower(contract_type), '') NOT LIKE '%patrimonial%'
        AND coalesce(lower(contract_type), '') NOT LIKE '%privado%'
        AND coalesce(trim(contract_type_code), '') <> '50';
    `).all();

    const docPliegoStmt = db.prepare(`
      SELECT document_type, title
      FROM contract_documents
      WHERE contract_id = ?
    `);

    const lotesNspStmt = db.prepare(buildNspLotsQuery());
    const lotCountNspStmt = db.prepare(buildNspLotCountQuery());

    let nspAlertCount = 0;
    for (const n of nspRows) {
      const docs = docPliegoStmt.all(n.id);
      const lotes = lotesNspStmt.all(n.id, n.id);
      // Count actual distinct lots independently from awardee rows: lots with
      // missing awardee data may be absent from buildNspLotsQuery().
      const lotCount = lotCountNspStmt.get(n.id, n.id).lot_count;
      const hasMultipleLots = lotCount > 1;
      const lotesAdjudicados = hasMultipleLots
        ? lotes.filter(l => l.awarded_amount != null && isEligibleAwardLotStatus(l.lot_status))
        : [];

      // a) No constan pliegos ni memoria
      const tienePliegoOJustificacion = docs.some(d => {
        const tDoc = (d.document_type || '').toUpperCase();
        const tit = (d.title || '').toLowerCase();
        return (
          tDoc === 'PLIEGO' ||
          (tDoc === 'INFORME_TECNICO' && /(memoria|justific|insuficiencia)/i.test(tit)) ||
          /(pliego|pcap|ppt|prescripci|cl[aá]usul|memoria.*justific)/i.test(tit)
        );
      });
      const signalA = !tienePliegoOJustificacion;

      // b) Oferta única: exige dato explícito y coherente en todos los lotes.
      let signalB = false;
      if (hasMultipleLots) {
        signalB = hasSingleOfferWithCompleteLotCoverage(lotes);
      } else {
        signalB = n.offer_count != null && !isNaN(Number(n.offer_count)) && Number(n.offer_count) === 1;
      }

      // c) 0 % de baja: exige cobertura completa y suma importes por lote,
      // porque una fila de lot_awards representa un adjudicatario, no un lote.
      let signalC = false;
      if (hasMultipleLots) {
        signalC = hasZeroDiscountWithCompleteLotCoverage(lotes);
      } else {
        signalC = hasZeroDiscountWithComparableSingleAward(n);
      }

      // d) Acumulación con el mismo órgano
      let signalD = false;
      const organo = n.contracting_authority_name;
      const cifsToCheck = [];
      const namesToCheck = [];
      if (hasMultipleLots) {
        for (const l of lotesAdjudicados) {
          if (l.awardee_nif) cifsToCheck.push(l.awardee_nif);
          if (l.awardee) namesToCheck.push(l.awardee);
        }
      } else {
        if (n.awardee_nif) cifsToCheck.push(n.awardee_nif);
        if (n.awardee) namesToCheck.push(n.awardee);
      }
      if (organo && (cifsToCheck.length > 0 || namesToCheck.length > 0)) {
        const conds = [];
        const params = [organo, organo, n.id];
        if (cifsToCheck.length > 0) {
          conds.push(`awardee_nif IN (${cifsToCheck.map(() => '?').join(',')})`);
          params.push(...cifsToCheck);
        }
        if (namesToCheck.length > 0) {
          conds.push(`awardee IN (${namesToCheck.map(() => '?').join(',')})`);
          params.push(...namesToCheck);
        }
        const lotConditions = [];
        if (cifsToCheck.length > 0) lotConditions.push(`ll.awardee_nif IN (${cifsToCheck.map(() => '?').join(',')})`);
        if (namesToCheck.length > 0) lotConditions.push(`ll.awardee IN (${namesToCheck.map(() => '?').join(',')})`);
        const lotAwardConditions = [];
        if (cifsToCheck.length > 0) lotAwardConditions.push(`la.awardee_nif IN (${cifsToCheck.map(() => '?').join(',')})`);
        if (namesToCheck.length > 0) lotAwardConditions.push(`la.awardee IN (${namesToCheck.map(() => '?').join(',')})`);
        const parentConditions = conds.map((condition) => condition.replace(/\bawardee(_nif)?\b/g, 'c.awardee$1'));
        const rel = db.prepare(`
          SELECT 1
          FROM contracts c
          WHERE (c.contracting_authority_name = ? OR c.contracting_authority_name = ?)
            AND c.id != ?
            AND (
              ${parentConditions.join(' OR ')}
              OR EXISTS (
                SELECT 1
                FROM contract_lots ll
                WHERE ll.contract_id = c.id
                  AND ${eligibleAwardLotStatusSql('ll')}
                  AND (${lotConditions.join(' OR ')})
              )
              OR EXISTS (
                SELECT 1
                FROM lot_awards la
                WHERE la.contract_id = c.id
                  AND ${eligibleAwardResultStateSql('la')}
                  AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
                  AND (${lotAwardConditions.join(' OR ')})
              )
            )
          LIMIT 1;
        `).get(
          ...params,
          ...cifsToCheck,
          ...namesToCheck,
          ...cifsToCheck,
          ...namesToCheck
        );
        signalD = !!rel;
      }

      const senalesVerificables = [];
      if (signalA) senalesVerificables.push('No constan en los datos publicados pliegos ni memoria de justificación del procedimiento.');
      if (signalB) senalesVerificables.push(hasMultipleLots ? 'Concurrencia de una única oferta confirmada por dato explícito en los lotes adjudicados.' : 'Concurrencia de una única oferta confirmada por dato explícito en el registro.');
      if (signalC) senalesVerificables.push(hasMultipleLots ? '0 % de baja sobre el presupuesto en los lotes adjudicados.' : '0 % de baja sobre el presupuesto de licitación.');
      if (signalD) senalesVerificables.push('El awardee acumula otros contratos registrados con el mismo órgano.');

      const numSenales = senalesVerificables.length;
      const isAlerta = numSenales >= 2;
      const severity = isAlerta ? 'ALTA' : 'MEDIA';
      const scoreEscala = isAlerta ? 7.5 : 4.0;
      const alertaId = `ALERT-NEG-SIN-PUB-${n.id}`;
      const title = isAlerta
        ? `Procedimiento Negociado sin Publicidad — Señal de Verificación Reforzada (${n.case_number || 'Sin exp'})`
        : `Procedimiento Negociado sin Publicidad (${n.case_number || 'Sin exp'})`;

      const hecho = 'Según PLACSP, el contrato se tramitó como negociado sin publicidad, sin anuncio previo de licitación.';
      const norma = 'El [art. 168 LCSP](https://www.boe.es/buscar/act.php?id=BOE-A-2017-12902#a168) limita este procedimiento a supuestos tasados y el [art. 170.2 LCSP](https://www.boe.es/buscar/act.php?id=BOE-A-2017-12902#a170) prevé, como regla general, invitar al menos a tres empresarios.';
      const queComprobar = 'Consultar en el case_number el supuesto invocado y las invitaciones enviadas.';
      const explicacionAlternativa = 'En publicidad en medios concretos puede invocarse exclusividad (solo el titular del medio puede insertar en él), siempre que el case_number lo acredite.';
      const cierre = 'Esta señal no implica por sí misma irregularidad.';

      const descParts = [
        `Hecho: ${hecho}`,
        `Norma: ${norma}`,
        `Qué comprobar: ${queComprobar}`,
        `Explicación alternativa: ${explicacionAlternativa}`,
        `Aviso de neutralidad: ${cierre}`
      ];
      if (senalesVerificables.length > 0) {
        descParts.push(`Señales verificables detectadas (${numSenales}): ${senalesVerificables.join(' ')}`);
      }

      const awardeeEvidence = buildNspAwardeeEvidence(n, lotes, hasMultipleLots);
      const evidence = `Órgano: ${organo || 'No especificado'} · ${awardeeEvidence} · Procedimiento: ${n.procedimiento} · Señales concurrentes: ${numSenales}/4`;
      const factores = senalesVerificables.map(s => ({ label: s, scoreContribution: Math.round(100 / (senalesVerificables.length || 1)) }));
      const explicaciones = [explicacionAlternativa];
      const documentos = [
        'Memoria justificativa del procedimiento y acreditación del supuesto legal (art. 168 LCSP).',
        'Invitaciones cursadas a empresarios y ofertas recibidas (art. 170.2 LCSP).',
        'Pliegos de cláusulas administrativas y prescripciones técnicas.'
      ];

      const urlFuente = n.url && n.url.startsWith('http') ? n.url.trim() : 'Enlace oficial no disponible en los datos consultados';
      const datoObjetivo = hecho;
      const reglaAplicada = 'Art. 168 y 170.2 LCSP (Procedimiento Negociado sin Publicidad)';
      const versionMetodologia = 'v2.2';
      const limitations = 'Basado en los datos y documentos publicados en PLACSP. Es indispensable cotejar el case_number administrativo completo.';

      insertAlerta.run(
        alertaId,
        'D', // Categoria D: Requiere examinar case_number
        'NEGOCIADO_SIN_PUBLICIDAD',
        severity,
        severity.toLowerCase(),
        scoreEscala,
        95,
        title,
        descParts.join(' '),
        datoObjetivo,
        'Plataforma de Contratación del Sector Público (PLACSP)',
        urlFuente,
        nowIso,
        reglaAplicada,
        versionMetodologia,
        limitations,
        explicacionAlternativa,
        1,
        evidence,
        JSON.stringify(factores),
        'negociado_sin_publicidad',
        JSON.stringify(explicaciones),
        JSON.stringify(documentos),
        nowIso
      );
      insertAlertaContrato.run(alertaId, n.id);
      nspAlertCount++;
    }

    db.exec('COMMIT;');

    console.log(`✅ Tablas de auditoría precalculadas con éxito:`);
    console.log(`   - Contratos menores relacionados: ${menorAlertCount} alerts`);
    console.log(`   - Ofertas únicas en contracts abiertas: ${unicaAlertCount} alerts`);
    console.log(`   - Bajas acusadas (Art. 149 LCSP): ${bajaAlertCount} alerts (${bajaJustificadaCount} justificadas con informe oficial)`);
    console.log(`   - Negociados sin publicidad (Art. 168 LCSP): ${nspAlertCount} alerts`);

    // Asegurar modo DELETE y compactar base de datos para despliegue serverless de solo lectura
    if (!argv.includes('--skip-vacuum')) {
      db.exec('PRAGMA journal_mode = DELETE; VACUUM;');
    }

    const countLic = db.prepare('SELECT count(*) as c FROM contracts').get();
    const countAlertas = db.prepare('SELECT count(*) as c FROM alerts').get();
    console.log(`✅ Base de datos optimizada con éxito. Total contracts: ${countLic.c} | Total alerts: ${countAlertas.c}${argv.includes('--skip-vacuum') ? ' | VACUUM omitido' : ''}`);
  } finally {
    if (!suppliedDb) db.close();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Error optimizando la base de datos:', err);
    process.exitCode = 1;
  });
}

module.exports = { main, buildNspLotCountQuery, buildNspLotsQuery, buildLotesBajaQuery, buildBajasRowsQuery, buildNspAwardeeEvidence, hasZeroDiscountWithComparableSingleAward, hasZeroDiscountWithCompleteLotCoverage, hasSingleOfferWithCompleteLotCoverage, hasSingleOfferWithCompleteLotCoverageSql };
