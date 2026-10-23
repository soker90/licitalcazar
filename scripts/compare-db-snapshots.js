#!/usr/bin/env node
/**
 * Compare two SQLite snapshots of the procurement database.
 *
 * Usage:
 *   node scripts/compare-db-snapshots.js --before=/path/old.db --after=/path/new.db
 *
 * The output is intentionally compact so it can be pasted/uploaded without
 * sharing the full database.
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const { normalizeIdentityPart } = require('./contract-identity');
const { buildAwardedVolumeSql } = require('./award-volume-sql');
const { terminalContractStatusSql, desertedContractStatusSql, canceledContractStatusSql } = require('../src/lib/contract-status-sql.ts');

function arg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find(a => a.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

function openDb(path) {
  if (!path || !fs.existsSync(path)) throw new Error(`No existe la BD: ${path || '(sin ruta)'}`);
  return new DatabaseSync(path, { readOnly: true });
}

function contractIdentity(row) {
  const expediente = normalizeIdentityPart(row.case_number);
  const authorityId = normalizeIdentityPart(row.contracting_authority_id);
  return expediente && authorityId
    ? JSON.stringify([expediente, authorityId])
    : `id:${row.id}`;
}

function tableNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map(r => r.name)
    .filter(name => !name.startsWith('contracts_fts_'));
}

function hasTable(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function hasColumn(db, table, column) {
  try {
    return db.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all()
      .some((row) => row.name === column);
  } catch {
    return false;
  }
}

function scalar(db, sql, fallback = 0) {
  try {
    const row = db.prepare(sql).get();
    const value = row && Object.values(row)[0];
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function contractStats(db) {
  const hasLotAwardsTable = hasTable(db, 'lot_awards');
  const hasContractLotsTable = hasTable(db, 'contract_lots');
  const hasLotizedColumn = hasColumn(db, 'contracts', 'is_lotized');
  const hasStatusColumn = hasColumn(db, 'contracts', 'status');
  const hasOfferCountColumn = hasColumn(db, 'contracts', 'offer_count');
  const hasAwardeeColumn = hasColumn(db, 'contracts', 'awardee');
  const statusFilter = !hasStatusColumn
    ? '1'
    : hasOfferCountColumn && hasAwardeeColumn
    ? `NOT ${terminalContractStatusSql('contracts', { hasLotAwardsTable, hasContractLotsTable })}`
    : `NOT (${desertedContractStatusSql('contracts')} OR ${canceledContractStatusSql('contracts')})`;
  const amountTypeFilter = hasColumn(db, 'contracts', 'award_amount_type')
    ? "(contracts.award_amount_type IS NULL OR contracts.award_amount_type IN ('total', 'desconocido'))"
    : '1';
  const canonicalAwardedAmountSql = buildAwardedVolumeSql(
    'contracts',
    hasLotAwardsTable,
    hasContractLotsTable,
    hasLotizedColumn,
  );
  const canonicalAwardedVolume = scalar(db, `
    SELECT round(sum(CASE
      WHEN ${statusFilter} AND ${amountTypeFilter}
      THEN ${canonicalAwardedAmountSql}
      ELSE 0
    END), 2)
    FROM contracts
  `);

  return {
    total: scalar(db, 'SELECT count(*) FROM contracts'),
    minPublicacion: scalar(db, 'SELECT min(publication_date) FROM contracts', null),
    maxPublicacion: scalar(db, 'SELECT max(publication_date) FROM contracts', null),
    awardedVolume: scalar(db, `SELECT round(sum(CASE WHEN ${hasColumn(db, 'contracts', 'award_amount_type') ? "(award_amount_type IS NULL OR award_amount_type IN ('total', 'desconocido'))" : '1'} THEN coalesce(awarded_amount, 0) ELSE 0 END), 2) FROM contracts`),
    canonicalAwardedVolume,
    contractsWithAward: scalar(db, 'SELECT count(*) FROM contracts WHERE awarded_amount IS NOT NULL'),
    contractsWithUrl: scalar(db, "SELECT count(*) FROM contracts WHERE source_url IS NOT NULL AND source_url <> ''"),
    contractsWithFechaSyncDocs: hasTable(db, 'contracts') && (() => {
      try { return scalar(db, "SELECT count(*) FROM contracts WHERE documents_synced_at IS NOT NULL"); } catch { return 0; }
    })(),
    contractsNeverSyncedDocs: (() => {
      try { return scalar(db, "SELECT count(*) FROM contracts WHERE documents_synced_at IS NULL"); } catch { return null; }
    })(),
  };
}

function documentStats(db) {
  if (!hasTable(db, 'contract_documents')) {
    return { table: false };
  }
  return {
    table: true,
    total: scalar(db, 'SELECT count(*) FROM contract_documents'),
    contractsWithDocs: scalar(db, 'SELECT count(DISTINCT contract_id) FROM contract_documents'),
    abnormalityDocs: scalar(db, 'SELECT count(*) FROM contract_documents WHERE is_abnormally_low_bid_justification = 1'),
    types: db.prepare('SELECT coalesce(document_type, \'(NULL)\') tipo, count(*) total FROM contract_documents GROUP BY document_type ORDER BY total DESC').all(),
    latestCreated: scalar(db, 'SELECT max(created_at) FROM contract_documents', null),
  };
}

function tableCounts(db) {
  const result = {};
  for (const name of tableNames(db)) {
    try { result[name] = scalar(db, `SELECT count(*) FROM "${name.replace(/"/g, '""')}"`); } catch { result[name] = null; }
  }
  return result;
}

function contractIds(db) {
  return new Set(db.prepare('SELECT id, case_number, contracting_authority_id FROM contracts').all().map(contractIdentity));
}

function compareDocuments(before, after) {
  const out = {
    before: documentStats(before),
    after: documentStats(after),
    delta: {},
    coverageDelta: {},
    sampleNewDocuments: [],
    sampleMissingDocuments: [],
  };
  if (!out.before.table || !out.after.table) return out;

  out.delta.total = out.after.total - out.before.total;
  out.delta.contractsWithDocs = out.after.contractsWithDocs - out.before.contractsWithDocs;
  out.delta.abnormalityDocs = out.after.abnormalityDocs - out.before.abnormalityDocs;

  const beforeIds = contractIds(before);
  const afterIds = contractIds(after);
  const docContractKeys = db => new Set(db.prepare('SELECT DISTINCT l.id, l.case_number, l.contracting_authority_id FROM contract_documents d JOIN contracts l ON l.id = d.contract_id').all().map(contractIdentity));
  const beforeDocContracts = docContractKeys(before);
  const afterDocContracts = docContractKeys(after);

  let newlyCovered = 0, lostCoverage = 0;
  for (const id of afterIds) {
    if (!beforeDocContracts.has(id) && afterDocContracts.has(id)) newlyCovered++;
  }
  for (const id of beforeIds) {
    if (beforeDocContracts.has(id) && !afterDocContracts.has(id)) lostCoverage++;
  }
  out.coverageDelta = { newlyCovered, lostCoverage };

  const documentRecords = db => db.prepare(`
    SELECT d.id, d.contract_id, d.source_url, d.title, d.document_date, d.document_type,
           c.id AS parent_id, c.case_number, c.contracting_authority_id
    FROM contract_documents d
    LEFT JOIN contracts c ON c.id = d.contract_id
  `).all().map(document => {
    const parentIdentity = contractIdentity({
      id: document.contract_id,
      case_number: document.case_number,
      contracting_authority_id: document.contracting_authority_id,
    });
    const sourceUrl = String(document.source_url ?? '').trim();
    const key = sourceUrl
      ? JSON.stringify([parentIdentity, sourceUrl])
      : JSON.stringify([parentIdentity, document.title ?? '', document.document_date ?? '', document.document_type ?? '']);
    return { key, ...document };
  });
  const beforeDocs = new Map(documentRecords(before).map(document => [document.key, document]));
  const afterDocs = new Map(documentRecords(after).map(document => [document.key, document]));
  for (const [key, document] of afterDocs) {
    if (!beforeDocs.has(key) && out.sampleNewDocuments.length < 20) {
      out.sampleNewDocuments.push({ id: document.id, contractId: document.contract_id, sourceUrl: document.source_url, title: document.title });
    }
  }
  for (const [key, document] of beforeDocs) {
    if (!afterDocs.has(key) && out.sampleMissingDocuments.length < 20) {
      out.sampleMissingDocuments.push({ id: document.id, contractId: document.contract_id, sourceUrl: document.source_url, title: document.title });
    }
  }
  return out;
}


function groupedCounts(db, table, groupColumn) {
  if (!hasTable(db, table)) return [];
  try {
    return db.prepare(`SELECT coalesce(${groupColumn}, '(NULL)') as clave, count(*) as total FROM ${table} GROUP BY ${groupColumn} ORDER BY total DESC, clave`).all();
  } catch { return []; }
}

function comparableAwardAmount(row) {
  return row?.award_amount_type == null || row.award_amount_type === 'total'
    ? Number(row?.awarded_amount || 0)
    : 0;
}

function compareContracts(before, after) {
  const candidateCols = ['amount_excl_vat','awarded_amount','award_amount_type','procedure','contract_type','economic_nature','is_lotized','lot_count','lots_source','awardee','awardee_nif'];
  const cols = candidateCols.filter((column) =>
    hasColumn(before, 'contracts', column) && hasColumn(after, 'contracts', column)
  );
  const identityCols = ['id','case_number','contracting_authority_id','contracting_authority_name']
    .filter((column) => hasColumn(before, 'contracts', column) && hasColumn(after, 'contracts', column));
  if (!identityCols.includes('id')) throw new Error('No se puede comparar contracts sin la columna id');
  const selectCols = [...new Set([...identityCols, ...cols])].join(', ');
  const oldRows = before.prepare(`SELECT ${selectCols} FROM contracts`).all();
  const newRows = after.prepare(`SELECT ${selectCols} FROM contracts`).all();
  const key = contractIdentity;
  const oldMap = new Map(oldRows.map(r => [key(r), r]));
  const newMap = new Map(newRows.map(r => [key(r), r]));
  const added = [...newMap.keys()].filter(id => !oldMap.has(id));
  const removed = [...oldMap.keys()].filter(id => !newMap.has(id));
  const changed = [];
  let awardDelta = 0;
  let pblDelta = 0;
  for (const [logicalKey, n] of newMap) {
    const o = oldMap.get(logicalKey);
    if (!o) continue;
    const oa = comparableAwardAmount(o), na = comparableAwardAmount(n);
    const op = Number(o.amount_excl_vat || 0), np = Number(n.amount_excl_vat || 0);
    awardDelta += na - oa; pblDelta += np - op;
    const diffs = {};
    for (const col of cols) if (String(o[col] ?? '') !== String(n[col] ?? '')) diffs[col] = { before:o[col], after:n[col] };
    if (Object.keys(diffs).length) changed.push({id:n.id, logicalKey, case_number:n.case_number, diffs});
  }
  const biggestAwardChanges = changed.map(x => {
    const o=oldMap.get(x.logicalKey), n=newMap.get(x.logicalKey);
    const beforeAmount = comparableAwardAmount(o);
    const afterAmount = comparableAwardAmount(n);
    return {id:x.id, case_number:n?.case_number, before:beforeAmount, after:afterAmount, delta:Number((afterAmount - beforeAmount).toFixed(2))};
  }).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,30);
  return {added, removed, changedCount:changed.length, awardDelta:Number(awardDelta.toFixed(2)), pblDelta:Number(pblDelta.toFixed(2)), biggestAwardChanges};
}

function compareLotes(before, after) {
  if (!hasTable(before,'contract_lots') || !hasTable(after,'contract_lots')) return {};
  const byParent = db => {
    const amountTypeFilter = hasColumn(db, 'contracts', 'award_amount_type')
      ? "(l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido'))"
      : '1';
    return db.prepare(`SELECT l.id, l.case_number, l.contracting_authority_id, l.contracting_authority_name, count(ll.id) total, sum(CASE WHEN ${amountTypeFilter} THEN coalesce(ll.awarded_amount,0) ELSE 0 END) award, sum(coalesce(ll.budget_excl_vat,ll.amount_excl_vat,0)) pbl FROM contract_lots ll JOIN contracts l ON l.id = ll.contract_id GROUP BY l.id, l.case_number, l.contracting_authority_id, l.contracting_authority_name`).all();
  };
  const parentKey = contractIdentity;
  const old = new Map(byParent(before).map(r=>[parentKey(r),r]));
  const neu = new Map(byParent(after).map(r=>[parentKey(r),r]));
  const changed=[];
  for(const id of new Set([...old.keys(),...neu.keys()])){
    const o=old.get(id)||{total:0,award:0,pbl:0}, n=neu.get(id)||{total:0,award:0,pbl:0};
    if(Number(o.total)!==Number(n.total)||Math.abs(Number(o.award)-Number(n.award))>.01||Math.abs(Number(o.pbl)-Number(n.pbl))>.01) changed.push({id,before:o,after:n});
  }
  return {beforeRows:scalar(before,'SELECT count(*) FROM contract_lots'),afterRows:scalar(after,'SELECT count(*) FROM contract_lots'),parentsChanged:changed.length,biggestChanges:changed.map(x=>({...x,awardDelta:Number((Number(x.after.award)-Number(x.before.award)).toFixed(2))})).sort((a,b)=>Math.abs(b.awardDelta)-Math.abs(a.awardDelta)).slice(0,30)};
}

function printSection(title, value) {
  console.log(`\\n=== ${title} ===`);
  console.log(JSON.stringify(value, null, 2));
}

function main() {
  const beforePath = arg('before');
  const afterPath = arg('after') || 'data/licitaciones_alcazar.db';
  if (!beforePath) {
    console.error('Uso: node scripts/compare-db-snapshots.js --before=/ruta/old.db --after=/ruta/new.db');
    process.exitCode = 2;
    return;
  }

  let before;
  let after;
  try {
    before = openDb(beforePath);
    after = openDb(afterPath);

    const result = {
  generatedAt: new Date().toISOString(),
  before: { path: beforePath, contracts: contractStats(before), tables: tableCounts(before), documents: documentStats(before) },
  after: { path: afterPath, contracts: contractStats(after), tables: tableCounts(after), documents: documentStats(after) },
  documentComparison: compareDocuments(before, after),
  contractComparison: compareContracts(before, after),
  lotComparison: compareLotes(before, after),
  alertsByType: { before: groupedCounts(before, 'alerts', 'type'), after: groupedCounts(after, 'alerts', 'type') },
  alertsBySeverity: { before: groupedCounts(before, 'alerts', 'severity'), after: groupedCounts(after, 'alerts', 'severity') },
};

printSection('RESUMEN COMPARATIVO', {
  contracts: {
    before: result.before.contracts,
    after: result.after.contracts,
    delta: {
      total: result.after.contracts.total - result.before.contracts.total,
      awardedVolume: Number((result.after.contracts.awardedVolume - result.before.contracts.awardedVolume).toFixed(2)),
      canonicalAwardedVolume: Number((result.after.contracts.canonicalAwardedVolume - result.before.contracts.canonicalAwardedVolume).toFixed(2)),
      withDocsSyncTimestamp: result.after.contracts.contractsWithFechaSyncDocs - result.before.contracts.contractsWithFechaSyncDocs,
      neverSyncedDocs: result.after.contracts.contractsNeverSyncedDocs,
    }
  },
  documents: result.documentComparison,
  tables: { before: result.before.tables, after: result.after.tables }
});

console.log('\\n=== JSON COMPLETO ===');
console.log(JSON.stringify(result, null, 2));

  } finally {
    before?.close();
    after?.close();
  }
}

if (require.main === module) main();

module.exports = { contractIdentity, contractIds, tableNames, compareDocuments, compareContracts, compareLotes, documentStats, contractStats };
