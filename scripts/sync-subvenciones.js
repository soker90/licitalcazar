/**
 * Sincronizador de Subvenciones y Concesiones Públicas (BDNS / SNPSAP)
 * 
 * Consulta la Base de Datos Nacional de Subvenciones (IGAE - Ministerio de Hacienda)
 * para los NIFs de empresas y adjudicatarios registrados en el Ayuntamiento de Alcázar de San Juan.
 * 
 * Uso:
 *   node scripts/sync-grants.js                # Sincroniza todos los NIFs de contratistas
 *   node scripts/sync-grants.js --top=50       # Sincroniza los 50 mayores contratistas por volumen
 *   node scripts/sync-grants.js --nif=B13016415 # Sincroniza una empresa concreta
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { sanitizeNifForStorage, isPersonaFisicaNif } = require('./nif-privacy');
const { eligibleAwardLotStatusSql, eligibleAwardResultStateSql, excludeAwardWhenLegacyLotTerminalSql, allowLegacyLotAwardFallbackSql } = require('../src/lib/lot-status');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const BDNS_API_BASE = 'https://www.pap.hacienda.gob.es/bdnstrans/api';
const DEFAULT_DELAY_MS = 120;
const BDNS_TIMEOUT_MS = 30_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns a storage-safe identifier for diagnostics: personal DNI/NIE values
 * become opaque pf-* IDs while company CIFs remain usable for troubleshooting.
 */
function getNifLogLabel(nif) {
  return sanitizeNifForStorage(nif);
}

function getAwardeeLogLabel(nif, awardee) {
  if (!nif || isPersonaFisicaNif(nif) || String(nif).trim().toLowerCase().startsWith('pf-')) {
    return 'Adjudicatario oculto';
  }
  return String(awardee || '').slice(0, 30) || 'Adjudicatario sin nombre';
}

function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bdns_id INTEGER UNIQUE,
      award_code TEXT,
      beneficiary_nif TEXT NOT NULL,
      beneficiary TEXT,
      granting_authority TEXT,
      granting_authority_level_1 TEXT,
      granting_authority_level_2 TEXT,
      granting_authority_level_3 TEXT,
      amount REAL DEFAULT 0,
      equivalent_aid REAL DEFAULT 0,
      grant_date TEXT,
      instrument TEXT,
      call TEXT,
      call_number TEXT,
      terms_url TEXT,
      is_alcazar INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_grants_beneficiary_nif ON grants(beneficiary_nif);
    CREATE INDEX IF NOT EXISTS idx_grants_is_alcazar ON grants(is_alcazar);
    CREATE INDEX IF NOT EXISTS idx_grants_grant_date ON grants(grant_date);
  `);
}

function normalizeMatchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function isTargetOrgan(c, targetPatterns) {
  const nivel1 = normalizeMatchText(c.nivel1);
  const organValues = [c.nivel2, c.nivel3, c.organoConcedente, c.organo_concedente]
    .map(normalizeMatchText)
    .filter(Boolean);
  const callValues = [c.call, c.convocatoria]
    .map(normalizeMatchText)
    .filter(Boolean);

  return targetPatterns.some(pattern => {
    const normalizedPattern = normalizeMatchText(pattern);
    if (!normalizedPattern) return false;

    if (organValues.some(value => value.includes(normalizedPattern))) {
      return true;
    }

    // BDNS representa las ayudas municipales con nivel1=LOCAL y suele usar
    // el municipio en la convocatoria, aunque el órgano no incluya el nombre
    // completo configurado en contracting-authorities.json.
    return nivel1 === 'LOCAL' && callValues.some(value => value.includes(normalizedPattern));
  });
}

function buildTargetPatterns(targetRows) {
  const patterns = [];

  for (const row of targetRows) {
    const name = normalizeMatchText(row.name);
    if (name) patterns.push(name);

    // Derivar "AYUNTAMIENTO DE X" y "X" permite casar la nomenclatura
    // administrativa de PLACSP con la jerarquía de órganos de BDNS.
    const match = name.match(/\bAYUNTAMIENTO DE (.+)$/);
    if (match) {
      patterns.push(`AYUNTAMIENTO DE ${match[1]}`);
      patterns.push(match[1]);
    }
  }

  return [...new Set(patterns.filter(Boolean))];
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BDNS_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
    },
    });

    if (res.status === 204) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }

    const text = await res.text();
    if (!text || !text.trim()) {
      return null;
    }

    return JSON.parse(text);
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`BDNS request timed out after ${BDNS_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function syncNif(db, nif, adjudicatarioNom = '', targetPatterns = [], { fetchJsonImpl = fetchJson } = {}) {
  const cleanNif = nif.trim().toUpperCase();
  if (cleanNif.includes('*') || cleanNif.startsWith('pf-') || cleanNif.length < 8) {
    return { nif: getNifLogLabel(cleanNif), status: 'skipped_invalid_nif' };
  }

  const pageSize = 1000;
  const concessions = [];
  let page = 0;
  let totalElements = null;

  try {
    while (true) {
      const concUrl = BDNS_API_BASE + '/concesiones/busqueda?vpd=GE&nifCif='
        + encodeURIComponent(cleanNif) + '&page=' + page + '&pageSize=' + pageSize;
      const concData = await fetchJsonImpl(concUrl);
      if (!concData || typeof concData !== 'object' || !Array.isArray(concData.content)) {
        throw new Error(`BDNS returned an invalid response for page ${page}`);
      }
      const content = concData.content;
      if (
        totalElements == null &&
        concData.totalElements != null &&
        Number.isFinite(Number(concData.totalElements))
      ) {
        totalElements = Number(concData.totalElements);
      }

      if (page === 0 && totalElements != null && totalElements > 100000) {
        throw new Error(
          `BDNS beneficiary filter returned an implausibly large result set (${totalElements.toLocaleString('es-ES')})`
        );
      }

      concessions.push(...content);

      if (content.length === 0) break;
      if (totalElements != null) {
        if (concessions.length >= totalElements) break;
      } else if (content.length < pageSize) {
        break;
      }
      page++;
      await sleep(60);
    }

    if (totalElements != null && concessions.length !== totalElements) {
      throw new Error(
        `BDNS pagination incomplete: retrieved ${concessions.length} of ${totalElements} concessions`
      );
    }

    const missingIds = concessions.filter(
      (concession) =>
        !concession ||
        typeof concession !== 'object' ||
        concession.id == null ||
        String(concession.id).trim() === ''
    );
    if (missingIds.length > 0) {
      throw new Error(`BDNS response contains ${missingIds.length} concession(s) without an ID`);
    }
  } catch (err) {
    return { nif: getNifLogLabel(cleanNif), status: 'error_concessions', error: err.message };
  }

  if (concessions.length === 0) {
    return { nif: getNifLogLabel(cleanNif), status: 'no_grants', grantsCount: 0 };
  }

  const insertStmt = db.prepare(`
    INSERT INTO grants (
      bdns_id, award_code, beneficiary_nif, beneficiary,
      granting_authority, granting_authority_level_1, granting_authority_level_2, granting_authority_level_3,
      amount, equivalent_aid, grant_date, instrument,
      call, call_number, terms_url, is_alcazar
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?
    )
    ON CONFLICT(bdns_id) DO UPDATE SET
      award_code = excluded.award_code,
      beneficiary_nif = excluded.beneficiary_nif,
      beneficiary = excluded.beneficiary,
      granting_authority = excluded.granting_authority,
      granting_authority_level_1 = excluded.granting_authority_level_1,
      granting_authority_level_2 = excluded.granting_authority_level_2,
      granting_authority_level_3 = excluded.granting_authority_level_3,
      amount = excluded.amount,
      equivalent_aid = excluded.equivalent_aid,
      grant_date = excluded.grant_date,
      instrument = excluded.instrument,
      call = excluded.call,
      call_number = excluded.call_number,
      terms_url = excluded.terms_url,
      is_alcazar = excluded.is_alcazar
  `);

  let insertedCount = 0;
  let alcazarCount = 0;
  const supportsTransactions = typeof db.exec === 'function';
  let transactionStarted = false;

  try {
    if (supportsTransactions) {
      db.exec('BEGIN IMMEDIATE');
      transactionStarted = true;
    }

    for (const c of concessions) {
      const esAlc = isTargetOrgan(c, targetPatterns) ? 1 : 0;
      if (esAlc) alcazarCount++;

      const organoConcedente = c.nivel3 || c.nivel2 || c.nivel1 || 'Órgano Público';

      insertStmt.run(
        c.id,
        c.codConcesion || String(c.id),
        sanitizeNifForStorage(cleanNif),
        c.beneficiario || adjudicatarioNom || null,
        organoConcedente,
        c.nivel1 || null,
        c.nivel2 || null,
        c.nivel3 || null,
        typeof c.importe === 'number' ? c.importe : 0,
        typeof c.ayudaEquivalente === 'number' ? c.ayudaEquivalente : 0,
        c.fechaConcesion || null,
        c.instrumento ? c.instrumento.trim() : null,
        c.convocatoria ? c.convocatoria.trim() : null,
        c.numeroConvocatoria || null,
        c.urlBR || null,
        esAlc
      );
      insertedCount++;
    }

    if (transactionStarted) db.exec('COMMIT');
  } catch (error) {
    if (transactionStarted) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Preserve the persistence error that caused the rollback.
      }
    }
    return {
      nif: getNifLogLabel(cleanNif),
      status: 'error_persistence',
      error: error.message,
    };
  }

  return {
    nif: getNifLogLabel(cleanNif),
    status: 'synced',
    grantsCount: insertedCount,
    alcazarCount,
    totalReported: totalElements ?? insertedCount,
  };
}

async function syncNifsWithRetries(db, nifList, targetPatterns, {
  syncNifImpl = syncNif,
  sleepImpl = sleep,
  maxAttempts = 3,
} = {}) {
  let pending = nifList;
  const results = new Map();

  for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt++) {
    const nextPending = [];

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      const result = await syncNifImpl(db, item.awardee_nif, item.awardee, targetPatterns);
      results.set(item.awardee_nif, result);

      if (result.status.startsWith('error_') && attempt < maxAttempts) {
        nextPending.push(item);
      }

      if (i < pending.length - 1) {
        await sleepImpl(DEFAULT_DELAY_MS);
      }
    }

    if (nextPending.length === 0) break;

    console.warn(
      `⚠️ BDNS: ${nextPending.length} NIF(s) fallaron en el intento ${attempt}/${maxAttempts}; se reintentará solo esos NIFs.`
    );
    await sleepImpl(DEFAULT_DELAY_MS * 2);
    pending = nextPending;
  }

  return {
    results: nifList.map(item => results.get(item.awardee_nif)),
    failures: nifList
      .map(item => results.get(item.awardee_nif))
      .filter(result => result?.status.startsWith('error_')),
  };
}

function assertSuccessfulSync(results) {
  const failures = results.filter((result) => result.status.startsWith('error_'));
  if (failures.length === 0) return;
  const details = failures
    .map(({ nif, status, error }) => `${nif}: ${status} — ${error || 'sin detalle'}`)
    .join('; ');
  throw new Error(`BDNS sync incomplete: ${failures.length} NIF(s) failed: ${details}`);
}


function buildContractorRankingQuery(hasLotAwards, topFilter = null) {
  const lotAwardCoverage = hasLotAwards
    ? `AND ${allowLegacyLotAwardFallbackSql('ll')}`
    : '';

  const lotAwardsSelect = hasLotAwards
    ? `
        UNION ALL

        SELECT award.awardee_nif, award.awardee, c.award_amount_type, award.awarded_amount
        FROM lot_awards award
        JOIN contracts c ON c.id = award.contract_id
        WHERE trim(coalesce(award.awardee, '')) <> ''
          AND ${eligibleAwardResultStateSql('award')}
          AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
        `
    : '';

  let query = `
      SELECT
        awardee_nif,
        max(awardee) as awardee,
        count(*) as contratos,
        sum(CASE WHEN award_amount_type IS NULL OR award_amount_type IN ('total', 'desconocido') THEN coalesce(awarded_amount, 0) ELSE 0 END) as volumen
      FROM (
        SELECT awardee_nif, awardee, award_amount_type, awarded_amount
        FROM contracts
        WHERE trim(coalesce(awardee, '')) <> ''
          AND NOT EXISTS (
            SELECT 1
            FROM contract_lots parent_lot
            WHERE parent_lot.contract_id = contracts.id
          )

        UNION ALL

        SELECT ll.awardee_nif, ll.awardee, c.award_amount_type, ll.awarded_amount
        FROM contract_lots ll
        JOIN contracts c ON c.id = ll.contract_id
        WHERE trim(coalesce(ll.awardee, '')) <> ''
          AND ${eligibleAwardLotStatusSql('ll')}
          ${lotAwardCoverage}
        ${lotAwardsSelect}
      )
      WHERE awardee_nif IS NOT NULL
        AND awardee_nif NOT LIKE '%*%'
        AND awardee_nif NOT LIKE 'pf-%'
        AND length(awardee_nif) >= 8
      GROUP BY upper(awardee_nif)
      ORDER BY volumen DESC
    `;
  if (topFilter && topFilter > 0) {
    query += ` LIMIT ${topFilter}`;
  }
  return query;
}

async function main({ dbPath = DB_PATH, argv = process.argv.slice(2), db: suppliedDb = null, closeDb = !suppliedDb } = {}) {
  const args = argv;
  let topFilter = null;
  let nifFilter = null;

  for (const arg of args) {
    if (arg.startsWith('--top=')) {
      topFilter = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--nif=')) {
      nifFilter = arg.split('=')[1].trim().toUpperCase();
    }
  }

  const db = suppliedDb || new DatabaseSync(dbPath);
  try {
    initDb(db);
  const targetRows = db.prepare('SELECT name FROM contracting_authorities WHERE active = 1').all();
  const targetPatterns = buildTargetPatterns(targetRows);

  console.log('🏛️  Iniciando sincronización con BDNS (Base de Datos Nacional de Subvenciones)...');

  let nifList = [];

  if (nifFilter) {
    nifList = [{ awardee_nif: nifFilter, awardee: 'Empresa individual' }];
  } else {
    const hasLotAwards = Boolean(db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
    ).get());

    const query = buildContractorRankingQuery(hasLotAwards, topFilter);
    nifList = db.prepare(query).all();

  }

  console.log(`📊 Se van a consultar ${nifList.length} NIFs de empresas contratistas en BDNS...`);

  const { results, failures } = await syncNifsWithRetries(db, nifList, targetPatterns);

  for (let i = 0; i < results.length; i++) {
    const item = nifList[i];
    const res = results[i];
    const progress = `[${i + 1}/${nifList.length}]`;

    if (res.status === 'synced') {
      console.log(`${progress} ✓ ${getNifLogLabel(item.awardee_nif)} (${getAwardeeLogLabel(item.awardee_nif, item.awardee)}): ${res.grantsCount} subvenciones de BDNS ${res.alcazarCount > 0 ? `(${res.alcazarCount} de Alcázar)` : ''}`);
    } else if (res.status === 'not_found_in_bdns' || res.status === 'no_grants') {
      console.log(`${progress} · ${getNifLogLabel(item.awardee_nif)} (${getAwardeeLogLabel(item.awardee_nif, item.awardee)}): Sin subvenciones en BDNS`);
    } else {
      console.log(`${progress} ⚠ ${getNifLogLabel(item.awardee_nif)}: ${res.status} ${res.error || ''}`);
    }
  }

  if (failures.length > 0) {
    console.warn(
      `⚠️ Sincronización BDNS completada parcialmente: ${failures.length} NIF(s) siguen fallando después de varios intentos.`
    );
    for (const failure of failures) {
      console.warn(`   - ${failure.nif}: ${failure.error || failure.status}`);
    }
  }

  // A partial run must exit non-zero so scheduled jobs and operators can detect
  // that some NIFs still need a successful retry.
  assertSuccessfulSync(results);

  const finalStats = db.prepare(`
    SELECT 
      count(*) as total_registros,
      count(DISTINCT beneficiary_nif) as empresas_con_subvencion,
      sum(amount) as importe_total,
      sum(CASE WHEN is_alcazar = 1 THEN 1 ELSE 0 END) as total_alcazar
    FROM grants
  `).get();

  console.log('\\n✅ Sincronización completada con éxito:');
  console.log(`   - Registros totales en BD: ${finalStats.total_registros}`);
  console.log(`   - Empresas con ayudas: ${finalStats.empresas_con_subvencion}`);
  console.log(`   - Importe total concedido: ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(finalStats.importe_total || 0)}`);
  console.log(`   - Ayudas directas de Alcázar: ${finalStats.total_alcazar}`);
  } finally {
    if (closeDb) db.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Error fatal en la sincronización BDNS:', err);
    process.exitCode = 1;
  });
}

module.exports = {
  syncNif,
  buildContractorRankingQuery,
  initDb,
  isTargetOrgan,
  normalizeMatchText,
  buildTargetPatterns,
  assertSuccessfulSync,
  syncNifsWithRetries,
  main,
  getNifLogLabel,
  getAwardeeLogLabel,
};
