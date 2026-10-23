#!/usr/bin/env node
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { sanitizeNifForStorage } = require('./nif-privacy');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');

function sanitizeColumn(db, table, column) {
  const rows = db.prepare(`SELECT rowid AS record_id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND trim(${column}) <> ''`).all();
  const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`);
  let changed = 0;
  for (const row of rows) {
    const sanitized = sanitizeNifForStorage(row.value);
    if (sanitized !== row.value) {
      update.run(sanitized, row.record_id);
      changed++;
    }
  }
  return changed;
}

function anonymizePersonalNifs(db) {
  db.exec('BEGIN TRANSACTION;');
  try {
    const changed = [
      ['contracts', 'awardee_nif'],
      ['contract_lots', 'awardee_nif'],
      ['lot_awards', 'awardee_nif'],
      ['grants', 'beneficiary_nif'],
    ].map(([table, column]) => ({ table, column, rows: sanitizeColumn(db, table, column) }));
    db.exec('COMMIT;');
    return changed;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* transaction may already have rolled back */ }
    throw error;
  }
}

function main() {
  const db = new DatabaseSync(DB_PATH);
  try {
    for (const item of anonymizePersonalNifs(db)) {
      console.log(`${item.table}.${item.column}: ${item.rows} filas anonimizadas`);
    }
  } finally {
    db.close();
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Error al anonimizar identificadores personales:', error);
    process.exitCode = 1;
  }
}

module.exports = { anonymizePersonalNifs, sanitizeColumn };
