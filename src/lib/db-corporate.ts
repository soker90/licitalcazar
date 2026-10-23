import { eligibleAwardLotStatusSql, eligibleAwardResultStateSql, excludeAwardWhenLegacyLotTerminalSql, excludeLegacyLotWhenStructuredTerminalResultSql } from './lot-status.js';
import { canceledContractStatusSql, desertedContractStatusSql } from './contract-status-sql';
import { DatabaseSync } from 'node:sqlite';
import {
  resolveEntity,
  getClusterKey,
  getOpaqueEmpresaId,
  normalizeCif,
  getCorporateGroupForCif,
  cleanNameForMatch,
} from './corporate.ts';
import type { CorporateResolutionCatalog, CorporateGroup } from './corporate';
import { maskDniNie, isPersonaFisicaNif } from './format.ts';

export interface DenominacionHistorica {
  nombre: string;
  cif: string;
  cifs?: string[];
  clusterKey: string;
  totalContratos: number;
  volumen: number;
  primerContrato: string | null;
  ultimoContrato: string | null;
  esNombreActual: boolean;
  status: 'activa_principal' | 'activa_division' | 'historica_anterior';
  estadoLabel: string;
  reason?: string;
  variantes: string[];
}

export interface DniRegistrado {
  cif: string;
  tipo: 'verificado' | 'enmascarado_rgpd' | 'errata_normalizada';
  totalContratos: number;
  volumen: number;
}

export interface FilialGrupo {
  id?: string;
  cif: string;
  nombre: string;
  contratos: number;
  volumen: number;
  esEstaEmpresa: boolean;
}

export interface GrupoCorporativoDetalle extends CorporateGroup {
  volumenConsolidadoGrupo: number;
  contratosConsolidadoGrupo: number;
  filiales: FilialGrupo[];
}

export interface CruceDatosEmpresa {
  tieneCambios: boolean;
  tipoPrincipal: 'cambio_denominacion' | 'dni_enmascarado' | 'grupo_empresarial' | 'variante_cif' | 'estandar';
  motivoGeneral: string;
  divisionesActivasCount: number;
  denominacionesRegistradas: DenominacionHistorica[];
  dnisRegistrados: DniRegistrado[];
  grupoCorporativo?: GrupoCorporativoDetalle;
  esDniEnmascarado: boolean;
  dniVerificado?: string;
}

let initialized = false;

export function loadCorporateResolutionCatalog(db: DatabaseSync): CorporateResolutionCatalog {
  const columns = new Set(
    (db.prepare('PRAGMA table_info(corporate_groups)').all() as Array<{ name: string }>).map((row) => row.name),
  );
  const sedeColumn = columns.has('sede') ? 'sede' : 'NULL AS sede';
  const colorColumn = columns.has('color') ? 'color' : 'NULL AS color';
  const groups = db.prepare(`
    SELECT group_id, group_name, associated_nifs_json, scope, description, ${sedeColumn}, ${colorColumn}
    FROM corporate_groups
    ORDER BY group_id ASC
  `).all() as any[];

  const corporateGroups = Object.fromEntries(groups.map((row) => {
    let cifs: string[] = [];
    try {
      cifs = JSON.parse(row.associated_nifs_json || '[]');
    } catch {
      cifs = [];
    }
    return [row.group_id, {
      id: row.group_id,
      nombre: row.group_name,
      name: row.group_name,
      description: row.description || '',
      ambito: row.scope || '',
      scope: row.scope || '',
      cifs,
      sede: row.sede || undefined,
      color: row.color || undefined,
    }];
  }));

  const rebrandings = db.prepare(`
    SELECT cif, current_name, active_divisions_json, previous_names_json, general_reason, type
    FROM corporate_rebrandings
    ORDER BY cif ASC
  `).all() as any[];

  const correctionRows = db.prepare('SELECT raw_cif, corrected_cif FROM cif_corrections ORDER BY raw_cif ASC').all() as any[];
  const cifCorrections = Object.fromEntries(correctionRows.map((row) => [row.raw_cif, row.corrected_cif]));

  const personRows = db.prepare('SELECT person_id, person_name, masked_variants_json FROM verified_person_mappings ORDER BY person_id ASC').all() as any[];
  const verifiedPersons = Object.fromEntries(personRows.map((row) => {
    let variantesEnmascaradas = [];
    try {
      variantesEnmascaradas = JSON.parse(row.masked_variants_json || '[]');
    } catch {
      variantesEnmascaradas = [];
    }
    return [row.person_name, {
      canonicalId: row.person_id,
      variantesEnmascaradas,
      nombre: row.person_name,
      dniVerificado: row.person_id,
    }];
  }));

  const knownRebrandings = Object.fromEntries(rebrandings.map((row) => {
    let divisionesActivas = [];
    let nombresAnteriores = [];
    try {
      divisionesActivas = JSON.parse(row.active_divisions_json || '[]');
      nombresAnteriores = JSON.parse(row.previous_names_json || '[]');
    } catch {
      divisionesActivas = [];
      nombresAnteriores = [];
    }
    return [row.cif, {
      cif: row.cif,
      nombreActual: row.current_name,
      divisionesActivas,
      nombresAnteriores,
      motivoGeneral: row.general_reason,
      tipo: row.type,
    }];
  }));

  return {
    corporateGroups,
    knownRebrandings,
    cifCorrections,
    verifiedPersons,
  } as CorporateResolutionCatalog;
}

/**
 * Inicializa la tabla de resolución corporativa en SQLite si no existe
 */
export function ensureCorporateResolutionTable(db: DatabaseSync): void {
  if (initialized) return;

  try {
    const tableExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='company_resolution'").get();
    if (tableExists) {
      initialized = true;
      return;
    }
  } catch {
    // If check fails, try creation below
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS company_resolution (
        raw_nif TEXT,
        raw_name TEXT,
        canonical_id TEXT,
        canonical_nif TEXT,
        canonical_name TEXT,
        group_id TEXT,
        group_name TEXT,
        link_type TEXT,
        link_reason TEXT,
        PRIMARY KEY (raw_nif, raw_name)
      );
      CREATE INDEX IF NOT EXISTS idx_company_resolution_canonical_id ON company_resolution(canonical_id);
      CREATE INDEX IF NOT EXISTS idx_company_resolution_group_id ON company_resolution(group_id);
    `);

    const count = (db.prepare('SELECT count(*) as cnt FROM company_resolution').get() as any)?.cnt || 0;
    if (count === 0) {
      const sourceTables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('contracts', 'contract_lots')"
      ).all() as Array<{ name: string }>;
      const hasContractsSource = sourceTables.some((row) => row.name === 'contracts');
      const hasLotsSource = sourceTables.some((row) => row.name === 'contract_lots');

      // Resolver-only/read-only databases may intentionally contain only the
      // corporate reference tables. Without the source tables there is
      // nothing to refresh, so leave the resolution table empty and let the
      // catalog-based resolver continue without emitting a SQLite error.
      if (hasContractsSource && hasLotsSource) {
        refreshCorporateResolutionTable(db);
      }
    }
  } catch (err) {
    console.warn('Could not ensure corporate resolution table in read-only environment:', err);
  }

  initialized = true;
}

/**
 * Consulta unificada de contratos que consolida contratos individuales y lotes de contratos multi-awardee
 */
export const UNIFIED_CONTRACT_SOURCE = `(
  SELECT 
    l.id, l.contracting_authority_id, l.case_number, l.object_description, l.contracting_authority_name, l.contracting_authority_nif, l.contracting_authority_dir3, l.contracting_authority_city, l.department,
    l.contract_type, l.contract_type_code, l.procedure, l.procedure_code, l.procedure_source, l.economic_nature, l.status,
    l.amount_excl_vat, l.amount_incl_vat, l.awarded_amount, l.awarded_amount_incl_vat, l.award_amount_type,
    l.awardee, l.awardee_nif, l.offer_count, l.is_sme, l.primary_cpv, l.cpvs, l.location, l.nuts,
    l.duration, l.duration_unit, l.eu_funding, l.urgency, l.deadline_date, l.award_date, l.publication_date,
    l.source_url, l.dataset, l.year, l.contracting_authority_name, l.scope, l.formalization_date, l.is_lotized, l.lot_count, l.lots_source,
    l.estimated_value, l.updated_at, l.documents_synced_at,
    NULL as lot_number, NULL as lot_name
  FROM contracts l
  WHERE l.awardee IS NOT NULL AND l.awardee != ''
    AND NOT ${canceledContractStatusSql('l')}
    AND NOT ${desertedContractStatusSql('l')}
    AND NOT EXISTS (SELECT 1 FROM contract_lots lot WHERE lot.contract_id = l.id)

  UNION ALL

  SELECT 
    l.id, l.contracting_authority_id, l.case_number, 
    l.object_description || ' (Lote ' || ll.lot_number || coalesce(': ' || ll.lot_name, '') || ')' as object_description,
    l.contracting_authority_name, l.contracting_authority_nif, l.contracting_authority_dir3, l.contracting_authority_city, l.department,
    l.contract_type, l.contract_type_code, l.procedure, l.procedure_code, l.procedure_source, l.economic_nature,
    CASE WHEN ${canceledContractStatusSql('l')} THEN l.status ELSE ll.lot_status END,
    ll.budget_excl_vat as amount_excl_vat,
    ll.budget_incl_vat as amount_incl_vat,
    ll.awarded_amount,
    ll.awarded_amount_incl_vat,
    l.award_amount_type,
    ll.awardee,
    ll.awardee_nif,
    ll.offer_count,
    l.is_sme,
    coalesce(ll.cpv, l.primary_cpv) as primary_cpv,
    l.cpvs, l.location, l.nuts,
    l.duration, l.duration_unit, l.eu_funding, l.urgency,
    l.deadline_date,
    coalesce(ll.award_date, l.award_date) as award_date,
    l.publication_date,
    l.source_url, l.dataset, l.year, l.contracting_authority_name, l.scope, l.formalization_date, l.is_lotized, l.lot_count, l.lots_source,
    ll.estimated_value, l.updated_at, l.documents_synced_at,
    ll.lot_number, ll.lot_name
  FROM contract_lots ll
  JOIN contracts l ON l.id = ll.contract_id
  WHERE ll.awardee IS NOT NULL AND ll.awardee != ''
    AND ${eligibleAwardLotStatusSql('ll')}
)`;

function hasLotAwardsTable(db: DatabaseSync): boolean {
  try {
    const rows = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
    ).all();
    return rows.length > 0;
  } catch {
    return false;
  }
}

export function getCorporateContractSource(db: DatabaseSync): string {
  if (!hasLotAwardsTable(db)) return UNIFIED_CONTRACT_SOURCE;

  const lotAwardsCoverContract = `(
    NOT EXISTS (
      SELECT 1 FROM contract_lots lot
      WHERE lot.contract_id = l.id
        AND ${eligibleAwardLotStatusSql('lot')}
    )
    OR NOT EXISTS (
      SELECT 1 FROM contract_lots lot
      WHERE lot.contract_id = l.id
        AND ${eligibleAwardLotStatusSql('lot')}
        AND NOT EXISTS (
          SELECT 1 FROM lot_awards award
          WHERE award.contract_id = lot.contract_id
            AND award.lot_number = lot.lot_number
            AND award.awardee IS NOT NULL
            AND trim(award.awardee) <> ''
            AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
        )
    )
  )`;
  return `(
    SELECT
      l.id, l.contracting_authority_id, l.case_number, l.object_description,
      l.contracting_authority_name, l.contracting_authority_nif, l.contracting_authority_dir3,
      l.contracting_authority_city, l.department, l.contract_type, l.contract_type_code,
      l.procedure, l.procedure_code, l.procedure_source, l.economic_nature, l.status,
      l.amount_excl_vat, l.amount_incl_vat, l.awarded_amount, l.awarded_amount_incl_vat,
      l.award_amount_type, l.awardee, l.awardee_nif, l.offer_count, l.is_sme,
      l.primary_cpv, l.cpvs, l.location, l.nuts, l.duration, l.duration_unit,
      l.eu_funding, l.urgency, l.deadline_date, l.award_date, l.publication_date,
      l.source_url, l.dataset, l.year, l.scope, l.formalization_date, l.is_lotized,
      l.lot_count, l.lots_source, l.estimated_value, l.updated_at, l.documents_synced_at,
      NULL as lot_number, NULL as lot_name
    FROM contracts l
    WHERE l.awardee IS NOT NULL AND l.awardee != ''
      AND NOT EXISTS (SELECT 1 FROM contract_lots lot WHERE lot.contract_id = l.id)
      AND NOT EXISTS (SELECT 1 FROM lot_awards award WHERE award.contract_id = l.id)
      AND NOT ${canceledContractStatusSql('l')}
      AND NOT ${desertedContractStatusSql('l')}

    UNION ALL

    SELECT
      l.id, l.contracting_authority_id, l.case_number,
      l.object_description || ' (Lote ' || ll.lot_number || coalesce(': ' || ll.lot_name, '') || ')',
      l.contracting_authority_name, l.contracting_authority_nif, l.contracting_authority_dir3,
      l.contracting_authority_city, l.department, l.contract_type, l.contract_type_code,
      l.procedure, l.procedure_code, l.procedure_source, l.economic_nature,
      CASE WHEN ${canceledContractStatusSql('l')} THEN l.status ELSE ll.lot_status END,
      ll.budget_excl_vat, ll.budget_incl_vat, ll.awarded_amount, ll.awarded_amount_incl_vat,
      l.award_amount_type, ll.awardee, ll.awardee_nif, ll.offer_count, l.is_sme,
      coalesce(ll.cpv, l.primary_cpv), l.cpvs, l.location, l.nuts, l.duration, l.duration_unit,
      l.eu_funding, l.urgency, l.deadline_date, coalesce(ll.award_date, l.award_date),
      l.publication_date, l.source_url, l.dataset, l.year, l.scope, l.formalization_date,
      l.is_lotized, l.lot_count, l.lots_source, ll.estimated_value, l.updated_at,
      l.documents_synced_at, ll.lot_number, ll.lot_name
    FROM contract_lots ll
    JOIN contracts l ON l.id = ll.contract_id
    WHERE ll.awardee IS NOT NULL AND ll.awardee != ''
      AND ${eligibleAwardLotStatusSql('ll')}
      AND ${excludeLegacyLotWhenStructuredTerminalResultSql('ll')}
      AND NOT (
        ${lotAwardsCoverContract}
      )

    UNION ALL

    SELECT
      l.id, l.contracting_authority_id, l.case_number,
      l.object_description || ' (Lote ' || award.lot_number || coalesce(': ' || lot.lot_name, '') || ')',
      l.contracting_authority_name, l.contracting_authority_nif, l.contracting_authority_dir3,
      l.contracting_authority_city, l.department, l.contract_type, l.contract_type_code,
      l.procedure, l.procedure_code, l.procedure_source, l.economic_nature,
      CASE WHEN ${canceledContractStatusSql('l')} THEN l.status ELSE award.result_state END,
      lot.budget_excl_vat, lot.budget_incl_vat,
      CASE
        WHEN award.awarded_amount IS NOT NULL THEN award.awarded_amount
        WHEN (
          SELECT count(*)
          FROM lot_awards award_amount
          WHERE award_amount.contract_id = award.contract_id
            AND award_amount.lot_number = award.lot_number
            AND award_amount.awardee IS NOT NULL
            AND trim(award_amount.awardee) <> ''
            AND ${eligibleAwardResultStateSql('award_amount')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award_amount')}
        ) = 1 THEN lot.awarded_amount
        ELSE NULL
      END,
      award.awarded_amount_incl_vat, l.award_amount_type, award.awardee,
      coalesce(
        award.awardee_nif,
        CASE WHEN (
          SELECT count(*)
          FROM lot_awards award_nif
          WHERE award_nif.contract_id = award.contract_id
            AND award_nif.lot_number = award.lot_number
            AND award_nif.awardee IS NOT NULL
            AND trim(award_nif.awardee) <> ''
            AND ${eligibleAwardResultStateSql('award_nif')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award_nif')}
        ) = 1 THEN lot.awardee_nif ELSE NULL END
      ),
      award.offer_count, l.is_sme, coalesce(lot.cpv, l.primary_cpv), l.cpvs, l.location,
      l.nuts, l.duration, l.duration_unit, l.eu_funding, l.urgency, l.deadline_date,
      coalesce(award.award_date, lot.award_date, l.award_date), l.publication_date,
      l.source_url, l.dataset, l.year, l.scope, l.formalization_date, l.is_lotized,
      l.lot_count, l.lots_source, lot.estimated_value, l.updated_at, l.documents_synced_at,
      award.lot_number, lot.lot_name
    FROM lot_awards award
    JOIN contracts l ON l.id = award.contract_id
    LEFT JOIN contract_lots lot
      ON lot.contract_id = award.contract_id
     AND lot.lot_number = award.lot_number
    WHERE award.awardee IS NOT NULL AND trim(award.awardee) != ''
      AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
      AND ${lotAwardsCoverContract}
  )`;
}

export function resolveEntityFromDb(
  db: DatabaseSync,
  rawCif: string | null | undefined,
  rawNombre: string | null | undefined
) {
  ensureCorporateResolutionTable(db);
  return resolveEntity(rawCif, rawNombre, loadCorporateResolutionCatalog(db));
}

/**
 * Regenera completamente la tabla de resolución corporativa analizando los datos actuales de contracts y lotes
 */
export function refreshCorporateResolutionTable(db: DatabaseSync): void {
  // 1. Obtener los pares únicos con su contrato más reciente para determinar el nombre más actualizado
  const corporateContractSource = getCorporateContractSource(db);
  const pairs = db.prepare(`
    SELECT
      coalesce(awardee_nif, '') as raw_nif,
      coalesce(awardee, '') as raw_name,
      max(coalesce(publication_date, award_date)) as ultima_fecha,
      count(*) as contratos,
      sum(CASE
        WHEN award_amount_type IS NULL OR award_amount_type IN ('total', 'desconocido')
        THEN coalesce(awarded_amount, 0)
        ELSE 0
      END) as volumen
    FROM ${corporateContractSource}
    WHERE awardee IS NOT NULL AND trim(awardee) != ''
    GROUP BY coalesce(awardee_nif, ''), coalesce(awardee, '')
  `).all() as any[];

  const catalog = loadCorporateResolutionCatalog(db);

  // 2. Determinar por cada CIF el nombre más reciente como nombre canónico por defecto si no está en KNOWN_REBRANDINGS
  const latestNameByCif = new Map<string, string>();
  const pairsSorted = [...pairs].sort((a, b) => (b.ultima_fecha || '').localeCompare(a.ultima_fecha || ''));
  for (const p of pairsSorted) {
    const norm = normalizeCif(p.raw_nif, catalog.cifCorrections);
    if (norm && !latestNameByCif.has(norm)) {
      latestNameByCif.set(norm, p.raw_name);
    }
  }

  db.exec('BEGIN TRANSACTION;');
  db.exec('DELETE FROM company_resolution;');

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO company_resolution (
      raw_nif, raw_name, canonical_id, canonical_nif, canonical_name, group_id, group_name, link_type, link_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of pairs) {
    const resolved = resolveEntity(p.raw_nif, p.raw_name, catalog);
    
    // Si no tiene rebranding explícito pero el CIF tiene un nombre más reciente oficial
    let canonicalNombre = resolved.canonicalNombre;
    if (resolved.canonicalCif && !resolved.rebrandingInfo && latestNameByCif.has(resolved.canonicalCif)) {
      canonicalNombre = latestNameByCif.get(resolved.canonicalCif)!;
    }

    insertStmt.run(
      p.raw_nif,
      p.raw_name,
      resolved.canonicalId,
      resolved.canonicalCif,
      canonicalNombre,
      resolved.grupo?.id || null,
      resolved.grupo?.nombre || null,
      resolved.tipoVinculo,
      resolved.motivoVinculo || null
    );
  }
  db.exec('COMMIT;');
}

/**
 * Obtiene el cruce completo de datos de una empresa canónica (todas sus denominaciones históricas,
 * todos sus CIFs y DNIs, y el grupo empresarial si procede).
 */
export function getCorporateProfile(db: DatabaseSync, canonicalId: string): CruceDatosEmpresa {
  ensureCorporateResolutionTable(db);
  const corporateContractSource = getCorporateContractSource(db);

  // 0. Detectar si canonicalId es un grupo o pertenece a un grupo empresarial
  const cleanId = (canonicalId || '').trim();
  const catalog = loadCorporateResolutionCatalog(db);
  const normCleanCif = normalizeCif(cleanId, catalog.cifCorrections);
  let detectedGroupDef: CorporateGroup | undefined = catalog.corporateGroups[cleanId] || (normCleanCif ? getCorporateGroupForCif(normCleanCif, catalog.corporateGroups) || undefined : undefined);

  if (!detectedGroupDef) {
    const row = db.prepare(`
      SELECT group_id FROM company_resolution 
      WHERE canonical_id = ? OR canonical_nif = ? OR raw_nif = ? OR raw_name = ?
      LIMIT 1
    `).get(cleanId, cleanId, cleanId, cleanId) as any;
    if (row?.group_id && catalog.corporateGroups[row.group_id]) {
      detectedGroupDef = catalog.corporateGroups[row.group_id];
    }
  }

  const conds: string[] = [];
  const params: any[] = [];

  if (detectedGroupDef) {
    conds.push(`r.group_id = ?`);
    params.push(detectedGroupDef.id);

    if (detectedGroupDef.cifs.length > 0) {
      conds.push(`l.awardee_nif IN (${detectedGroupDef.cifs.map(() => '?').join(',')})`);
      params.push(...detectedGroupDef.cifs);
    }
  }

  conds.push(`r.canonical_id = ? OR r.canonical_nif = ? OR r.raw_nif = ? OR l.awardee_nif = ? OR l.awardee = ?`);
  params.push(cleanId, cleanId, cleanId, cleanId, cleanId);

  const whereClause = `(${conds.join(' OR ')})`;

  const records = db.prepare(`
    SELECT 
      l.awardee as raw_name,
      coalesce(l.awardee_nif, '') as raw_nif,
      count(DISTINCT l.id) as total_contratos,
      round(sum(CASE WHEN l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido') THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen,
      min(coalesce(l.publication_date, l.award_date)) as primer_contrato,
      max(coalesce(l.publication_date, l.award_date)) as ultimo_contrato,
      r.link_type,
      r.link_reason,
      r.canonical_nif,
      r.canonical_name,
      r.group_id,
      r.group_name
    FROM ${corporateContractSource} l
    LEFT JOIN company_resolution r 
      ON coalesce(l.awardee_nif, '') = r.raw_nif 
     AND coalesce(l.awardee, '') = r.raw_name
    WHERE ${whereClause}
    GROUP BY l.awardee, coalesce(l.awardee_nif, '')
    ORDER BY volumen DESC;
  `).all(...params) as any[];

  if (records.length === 0 && cleanId.startsWith('pf-')) {
    const allPairs = db.prepare(`
      SELECT DISTINCT coalesce(awardee_nif, '') as raw_nif, coalesce(awardee, '') as raw_name 
      FROM ${corporateContractSource} l
    `).all() as any[];
    const match = allPairs.find(p => getOpaqueEmpresaId(p.raw_nif, p.raw_name) === cleanId);
    if (match) {
      return getCorporateProfile(db, match.raw_nif || match.raw_name);
    }
  }

  // Identificar el canonicalCif canónico real
  const sample = records[0];
  const rawCanonicalCif = sample?.canonical_nif || (sample?.raw_nif && !sample?.raw_nif.includes('*') ? sample?.raw_nif : '') || '';
  const canonicalCif = normalizeCif(rawCanonicalCif) || rawCanonicalCif;
  const grupoId = sample?.group_id;

  const rebranding = catalog.knownRebrandings[canonicalCif];

  // 1. Agrupación y clustering de variantes ortográficas
  interface ClusterAcc {
    clusterKey: string;
    bestName: string;
    cif: string;
    cifs: string[];
    totalContratos: number;
    volumen: number;
    primerContrato: string | null;
    ultimoContrato: string | null;
    variantes: string[];
    maxVolumeVariant: number;
  }

  const clustersMap = new Map<string, ClusterAcc>();
  for (const r of records) {
    const key = getClusterKey(r.raw_name) || r.raw_name.toUpperCase();
    if (!clustersMap.has(key)) {
      clustersMap.set(key, {
        clusterKey: key,
        bestName: r.raw_name,
        cif: r.raw_nif,
        cifs: r.raw_nif ? [r.raw_nif] : [],
        totalContratos: 0,
        volumen: 0,
        primerContrato: r.primer_contrato,
        ultimoContrato: r.ultimo_contrato,
        variantes: [],
        maxVolumeVariant: r.volumen || 0,
      });
    }
    const c = clustersMap.get(key)!;
    c.totalContratos += r.total_contratos;
    c.volumen = Math.round((c.volumen + r.volumen) * 100) / 100;
    if (r.primer_contrato && (!c.primerContrato || r.primer_contrato < c.primerContrato)) {
      c.primerContrato = r.primer_contrato;
    }
    if (r.ultimo_contrato && (!c.ultimoContrato || r.ultimo_contrato > c.ultimoContrato)) {
      c.ultimoContrato = r.ultimo_contrato;
    }
    if (r.volumen > c.maxVolumeVariant) {
      c.maxVolumeVariant = r.volumen;
      c.bestName = r.raw_name;
    }
    if (!c.variantes.includes(r.raw_name)) {
      c.variantes.push(r.raw_name);
    }
    if (r.raw_nif && !c.cifs.includes(r.raw_nif)) {
      c.cifs.push(r.raw_nif);
    }
  }

  const clusters = Array.from(clustersMap.values());
  const latestDateOverall = clusters.reduce((max: string, c) => {
    if (c.ultimoContrato && c.ultimoContrato > max) return c.ultimoContrato;
    return max;
  }, '');

  // Clasificar cada cluster
  const denominacionesRegistradas: DenominacionHistorica[] = clusters.map((c) => {
    let status: 'activa_principal' | 'activa_division' | 'historica_anterior' = 'activa_division';
    let estadoLabel = 'División Comercial Activa';
    let reason = 'Variante o división registrada en expedientes de contratación.';
    let nombre = c.bestName;

    const formerMatch = rebranding?.nombresAnteriores.find(n => getClusterKey(n.nombre) === c.clusterKey);
    const activeDivMatch = rebranding?.divisionesActivas?.find(d => getClusterKey(d.nombre) === c.clusterKey);
    const isPrimaryRebranding = rebranding && getClusterKey(rebranding.nombreActual) === c.clusterKey;

    if (formerMatch) {
      status = 'historica_anterior';
      estadoLabel = 'Denominación Histórica Anterior';
      reason = formerMatch.reason || formerMatch.motivo || 'Denominación mercantil anterior a la reestructuración corporativa.';
      nombre = formerMatch.nombre;
    } else if (isPrimaryRebranding) {
      status = 'activa_principal';
      estadoLabel = 'Denominación Principal Activa';
      reason = activeDivMatch?.description || activeDivMatch?.descripcion || rebranding.motivoGeneral;
      nombre = rebranding.nombreActual;
    } else if (activeDivMatch) {
      status = 'activa_division';
      estadoLabel = 'División Comercial Activa';
      reason = activeDivMatch.description || activeDivMatch.descripcion || 'División comercial activa especializada.';
      nombre = activeDivMatch.nombre;
    } else if (c.ultimoContrato === latestDateOverall) {
      status = 'activa_principal';
      estadoLabel = 'Denominación Principal Activa';
      reason = 'Denominación mercantil más reciente y activa en contrataciones municipales.';
    } else {
      const latestYear = latestDateOverall ? parseInt(latestDateOverall.substring(0, 4), 10) : 2026;
      const clusterYear = c.ultimoContrato ? parseInt(c.ultimoContrato.substring(0, 4), 10) : 2020;
      if (latestYear - clusterYear <= 2) {
        status = 'activa_division';
        estadoLabel = 'División Comercial Activa';
        reason = 'Marca o división comercial concurrente en ejercicios recientes.';
      } else {
        status = 'historica_anterior';
        estadoLabel = 'Denominación Histórica Anterior';
        reason = 'Denominación anterior no utilizada en los últimos ejercicios.';
      }
    }

    return {
      nombre,
      cif: c.cif,
      cifs: c.cifs,
      clusterKey: c.clusterKey,
      totalContratos: c.totalContratos,
      volumen: c.volumen,
      primerContrato: c.primerContrato,
      ultimoContrato: c.ultimoContrato,
      esNombreActual: status === 'activa_principal',
      status,
      estadoLabel,
      reason,
      variantes: c.variantes,
    };
  });

  // Ordenar: activa_principal primero, luego activa_division (por volumen desc), luego historica_anterior (por ultimoContrato desc)
  denominacionesRegistradas.sort((a, b) => {
    const rank = { activa_principal: 0, activa_division: 1, historica_anterior: 2 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.status === 'activa_division') return b.volumen - a.volumen;
    return (b.ultimoContrato || '').localeCompare(a.ultimoContrato || '');
  });

  // Establecer el nombre canónico principal
  const canonicalNombre = denominacionesRegistradas[0]?.nombre || sample?.canonical_name || sample?.raw_name || canonicalId;
  const dniMapping = Object.entries(catalog.verifiedPersons).find(([name]) =>
    cleanNameForMatch(name) === cleanNameForMatch(canonicalNombre)
  )?.[1];

  // 2. Desglose de DNIs y CIFs registrados
  const dnisMap = new Map<string, { cif: string; tipo: 'verificado' | 'enmascarado_rgpd' | 'errata_normalizada'; totalContratos: number; volumen: number }>();
  for (const r of records) {
    const cif = r.raw_nif || 'Sin CIF registrado';
    const isMasked = cif.includes('*');
    const isErrata = normalizeCif(cif) !== cif && !isMasked;
    const tipo = isMasked ? 'enmascarado_rgpd' : isErrata ? 'errata_normalizada' : 'verificado';

    if (!dnisMap.has(cif)) {
      dnisMap.set(cif, { cif, tipo, totalContratos: 0, volumen: 0 });
    }
    const entry = dnisMap.get(cif)!;
    entry.totalContratos += r.total_contratos;
    entry.volumen = Math.round((entry.volumen + r.volumen) * 100) / 100;
  }
  const dnisRegistrados = Array.from(dnisMap.values()).sort((a, b) => b.volumen - a.volumen);

  // 3. Grupo Empresarial
  let grupoCorporativo: GrupoCorporativoDetalle | undefined;
  const targetGroupDef = detectedGroupDef || (grupoId ? catalog.corporateGroups[grupoId] : (canonicalCif ? catalog.corporateGroups[getCorporateGroupForCif(canonicalCif, catalog.corporateGroups)?.id || ''] : undefined));

  if (targetGroupDef) {
    // Obtener todas las filiales del grupo con contratos en Alcázar
    const filialesRows = db.prepare(`
      SELECT 
        coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee) as id,
        coalesce(r.canonical_nif, l.awardee_nif) as cif,
        coalesce(r.canonical_name, l.awardee) as nombre,
        count(DISTINCT l.id) as contratos,
        round(sum(CASE WHEN l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido') THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen
      FROM ${corporateContractSource} l
      LEFT JOIN company_resolution r 
        ON coalesce(l.awardee_nif, '') = r.raw_nif 
       AND coalesce(l.awardee, '') = r.raw_name
      WHERE r.group_id = ? OR l.awardee_nif IN (${targetGroupDef.cifs.map(() => '?').join(',')})
      GROUP BY coalesce(r.canonical_nif, l.awardee_nif)
      ORDER BY volumen DESC;
    `).all(targetGroupDef.id, ...targetGroupDef.cifs) as any[];

    let volumenConsolidado = 0;
    let contratosConsolidado = 0;

    const filiales: FilialGrupo[] = filialesRows.map((f) => {
      volumenConsolidado += f.volumen;
      contratosConsolidado += f.contratos;
      const filialId = f.id ? (isPersonaFisicaNif(f.id) ? getOpaqueEmpresaId(f.id, f.nombre) : f.id) : getOpaqueEmpresaId(f.cif, f.nombre);
      return {
        id: filialId,
        cif: f.cif,
        nombre: f.nombre,
        contratos: f.contratos,
        volumen: f.volumen,
        esEstaEmpresa: f.cif === canonicalCif || f.nombre === canonicalNombre,
      };
    });

    grupoCorporativo = {
      ...targetGroupDef,
      volumenConsolidadoGrupo: Math.round(volumenConsolidado * 100) / 100,
      contratosConsolidadoGrupo: contratosConsolidado,
      filiales,
    };
  }

  // Comprobar si tiene cambios relevantes
  const hasMultipleClusters = denominacionesRegistradas.length > 1;
  const divisionesActivasCount = denominacionesRegistradas.filter(d => d.status !== 'historica_anterior').length;
  const hasMultipleDivisions = divisionesActivasCount > 1;
  const hasFormer = denominacionesRegistradas.some(d => d.status === 'historica_anterior');
  const hasMultipleDnis = dnisRegistrados.length > 1;
  const hasGroup = !!grupoCorporativo;
  const isMaskedDni = !!dniMapping || dnisRegistrados.some(d => d.tipo === 'enmascarado_rgpd');

  const tieneCambios = hasMultipleClusters || hasMultipleDnis || hasGroup || isMaskedDni || !!rebranding;

  let tipoPrincipal: 'cambio_denominacion' | 'dni_enmascarado' | 'grupo_empresarial' | 'variante_cif' | 'estandar' = 'estandar';
  let motivoGeneral = 'Entidad contratista con identidad estándar.';

  if (rebranding) {
    tipoPrincipal = 'cambio_denominacion';
    motivoGeneral = rebranding.motivoGeneral;
    if (hasMultipleDivisions) {
      const activeNames = denominacionesRegistradas.filter(d => d.status !== 'historica_anterior').map(d => d.nombre).join(' y ');
      motivoGeneral += ` Opera activamente con divisiones comerciales especializadas (${activeNames}).`;
    }
  } else if (hasFormer) {
    tipoPrincipal = 'cambio_denominacion';
    motivoGeneral = 'Esta empresa ha concurrido a contracts públicas bajo diferentes nombres o razones sociales a lo largo del tiempo.';
  } else if (hasMultipleDivisions) {
    tipoPrincipal = 'cambio_denominacion';
    const activeNames = denominacionesRegistradas.map(d => d.nombre).join(' y ');
    motivoGeneral = `Esta entidad opera y concurre a contracts a través de ${divisionesActivasCount} divisiones comerciales o marcas activas simultáneas (${activeNames}).`;
  } else if (isMaskedDni) {
    tipoPrincipal = 'dni_enmascarado';
    motivoGeneral = `Cruce analítico de persona física: contratos asociados a personas físicas consolidados para análisis estadístico (${maskDniNie(canonicalCif || dniMapping?.canonicalId)}).`;
  } else if (hasGroup) {
    tipoPrincipal = 'grupo_empresarial';
    motivoGeneral = `Esta empresa forma parte del ${grupoCorporativo?.nombre}, operando junto a otras filiales del mismo grupo corporativo.`;
  } else if (hasMultipleDnis) {
    tipoPrincipal = 'variante_cif';
    motivoGeneral = 'Se han unificado variantes de escritura y códigos de identificación de la empresa.';
  }

  return {
    tieneCambios,
    tipoPrincipal,
    motivoGeneral,
    divisionesActivasCount,
    denominacionesRegistradas,
    dnisRegistrados,
    grupoCorporativo,
    esDniEnmascarado: isMaskedDni,
    dniVerificado: dniMapping?.canonicalId || (canonicalCif && !canonicalCif.includes('*') ? canonicalCif : undefined),
  };
}
