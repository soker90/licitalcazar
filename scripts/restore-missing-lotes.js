#!/usr/bin/env node
/**
 * Recupera lotes que fueron eliminados durante una sincronización cuando el
 * snapshot anterior tenía lotes y la BD actual tiene cero, sin sobrescribir
 * lotes actuales ni correcciones verificadas.
 *
 * Uso:
 *   node scripts/restore-missing-lotes.js --before=data/licitaciones_alcazar.before.db
 *   node scripts/restore-missing-lotes.js --before=... --apply
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { resolveCurrentContract, buildRestoredLotRow } = require('./restore-missing-lotes-match');

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function openDb(file, readOnly = false) {
  if (!file || !fs.existsSync(file)) throw new Error(`No existe la BD: ${file || '(sin ruta)'}`);
  return new DatabaseSync(file, readOnly ? { readOnly: true } : undefined);
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function rowsByParent(db) {
  return db.prepare(`
    SELECT *
    FROM contract_lots
    ORDER BY contract_id, lot_number
  `).all();
}

function normalizeId(value) {
  return String(value ?? '').trim().replace(/\.0$/, '');
}

const REQUIRED_RESTORED_LOT_COLUMNS = [
  'id', 'contract_id', 'case_number', 'lot_number', 'lot_name', 'amount_excl_vat',
  'amount_incl_vat', 'estimated_value', 'awardee', 'awardee_nif', 'lot_status',
  'award_date', 'cpv', 'budget_excl_vat', 'budget_incl_vat', 'awarded_amount',
  'awarded_amount_incl_vat', 'offer_count',
];
const OPTIONAL_RESTORED_LOT_COLUMNS = ['result_code', 'result_code_list_uri'];

function prepareRestoredLotInsert(db) {
  const availableColumns = new Set(
    db.prepare("PRAGMA table_info('contract_lots')").all().map((column) => column.name)
  );
  const missingColumns = REQUIRED_RESTORED_LOT_COLUMNS.filter((column) => !availableColumns.has(column));
  if (missingColumns.length > 0) {
    throw new Error(`contract_lots no contiene columnas necesarias para restaurar lotes: ${missingColumns.join(', ')}`);
  }

  // Result codes were added after the original lot schema. Preserve them when
  // the destination supports them, while remaining compatible with older DBs.
  const columns = [
    ...REQUIRED_RESTORED_LOT_COLUMNS,
    ...OPTIONAL_RESTORED_LOT_COLUMNS.filter((column) => availableColumns.has(column)),
  ];
  const statement = db.prepare(`
    INSERT OR IGNORE INTO contract_lots (${columns.join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})
  `);

  return (lot) => statement.run(...columns.map((column) => lot[column] ?? null));
}

function buildContractIndex(db) {
  const rows = db.prepare('SELECT id, case_number, contracting_authority_id, is_lotized, lot_count, lots_source FROM contracts').all();
  const byId = new Map(rows.map(r => [normalizeId(r.id), r]));
  const byExpediente = new Map();
  for (const row of rows) {
    const key = String(row.case_number ?? '').trim().replace(/\.0$/, '').replace(/\s+/g, ' ');
    if (!key) continue;
    const candidates = byExpediente.get(key) || [];
    candidates.push(row);
    byExpediente.set(key, candidates);
  }
  return { byId, byExpediente, total: rows.length };
}

function main({
  beforePath = arg('before'),
  currentPath = arg('after') || path.resolve(__dirname, '../data/licitaciones_alcazar.db'),
  apply = process.argv.includes('--apply'),
  openDatabase = openDb,
} = {}) {
  let before;
  let current;
  try {
    before = openDatabase(beforePath, true);
    current = openDatabase(currentPath, !apply);

  if (!tableExists(before, 'contract_lots') || !tableExists(current, 'contract_lots')) {
    throw new Error('Ambas BDs deben contener contract_lots');
  }

  const beforeParents = new Map();
  for (const row of rowsByParent(before)) {
    const list = beforeParents.get(row.contract_id) || [];
    list.push(row);
    beforeParents.set(row.contract_id, list);
  }

  const currentCounts = new Map(
    current.prepare('SELECT contract_id, count(*) total FROM contract_lots GROUP BY contract_id')
      .all()
      .map(r => [normalizeId(r.contract_id), Number(r.total)])
  );
  const beforeIndex = buildContractIndex(before);
  const currentIndex = buildContractIndex(current);

  const diagnostics = {
    previousLotParents: beforeParents.size,
    matchedCurrentContracts: 0,
    unmatchedCurrentContracts: 0,
    alreadyHaveLots: 0,
    explicitlyNonLotized: 0,
    candidates: 0,
  };

  const candidates = [];
  for (const [rawLicitacionId, oldLots] of beforeParents) {
    const licitacionId = normalizeId(rawLicitacionId);
    // Primero por ID; como respaldo, por el expediente del contrato anterior.
    const previousContract = beforeIndex.byId.get(licitacionId);
    const currentContract = resolveCurrentContract(previousContract, currentIndex, licitacionId);

    if (!currentContract) {
      diagnostics.unmatchedCurrentContracts++;
      continue;
    }
    diagnostics.matchedCurrentContracts++;

    // Check the resolved current ID, not the historical ID: internal IDs can
    // change, and restoring by the old ID could duplicate an existing snapshot.
    if ((currentCounts.get(normalizeId(currentContract.id)) || 0) !== 0) {
      diagnostics.alreadyHaveLots++;
      continue;
    }

    // Nunca recuperar automáticamente cuando la BD actual afirma explícitamente
    // que el expediente no está lotizado.
    if (Number(currentContract.is_lotized) === 0) {
      diagnostics.explicitlyNonLotized++;
      continue;
    }

    candidates.push({
      licitacionId: currentContract.id,
      expediente: currentContract.case_number,
      oldLotCount: oldLots.length,
      oldAward: Number(oldLots.reduce((s, r) => s + Number(r.awarded_amount || 0), 0).toFixed(2)),
      oldPbl: Number(oldLots.reduce((s, r) => s + Number(r.budget_excl_vat ?? r.amount_excl_vat ?? 0), 0).toFixed(2)),
      lots: oldLots,
    });
  }

  diagnostics.candidates = candidates.length;
  console.log('Diagnóstico:');
  console.log(JSON.stringify(diagnostics, null, 2));
  console.log(`Candidatos de recuperación: ${candidates.length}`);
  console.log(`Modo: ${apply ? 'APLICAR' : 'DRY-RUN'}`);
  for (const c of candidates) {
    console.log(`  • ${c.licitacionId} | ${c.expediente || '-'} | ${c.oldLotCount} lotes | PBL ${c.oldPbl} | adjudicación ${c.oldAward}`);
  }

  if (apply && candidates.length) {
    const insertRestoredLot = prepareRestoredLotInsert(current);
    current.exec('BEGIN');
    try {
      for (const c of candidates) {
        for (const r of c.lots) {
          const restoredLot = buildRestoredLotRow(r, {
            id: c.licitacionId,
            case_number: c.expediente,
          });
          insertRestoredLot(restoredLot);
        }
      }
      current.exec('COMMIT');
      console.log(`Recuperados ${candidates.reduce((s,c)=>s+c.oldLotCount,0)} lotes.`);
    } catch (error) {
      current.exec('ROLLBACK');
      throw error;
    }
  }

  } finally {
    before?.close();
    current?.close();
  }
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, buildContractIndex, prepareRestoredLotInsert };
