#!/usr/bin/env node
/**
 * Synchronizes the versioned corporate-rebranding catalog into SQLite.
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const CATALOG_PATH = path.resolve(__dirname, '../src/data/corporate-name-history.json');

function migrateCorporateRebrandings(db) {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(`Missing corporate rebranding catalog: ${CATALOG_PATH}`);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const entries = Object.entries(catalog);

  db.exec('BEGIN TRANSACTION');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS corporate_rebrandings (
      cif TEXT PRIMARY KEY,
      current_name TEXT NOT NULL,
      active_divisions_json TEXT NOT NULL DEFAULT '[]',
      previous_names_json TEXT NOT NULL DEFAULT '[]',
      general_reason TEXT NOT NULL,
        type TEXT NOT NULL
      );
    `);

    db.exec('DELETE FROM corporate_rebrandings');

    const insert = db.prepare(`
      INSERT INTO corporate_rebrandings(
        cif, current_name, active_divisions_json, previous_names_json, general_reason, type
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const [cif, entry] of entries) {
      if (entry.cif !== cif) {
        throw new Error(`Corporate rebranding catalog key/cif mismatch: ${cif} != ${entry.cif}`);
      }
      insert.run(
        cif,
        entry.nombreActual,
        JSON.stringify(entry.divisionesActivas || []),
        JSON.stringify(entry.nombresAnteriores || []),
        entry.motivoGeneral,
        entry.tipo
      );
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return entries.length;
}

if (require.main === module) {
  const db = new DatabaseSync(DB_PATH);
  try {
    const count = migrateCorporateRebrandings(db);
    console.log(`✅ Catálogo de rebrandings corporativos sincronizado: ${count} entradas`);
  } finally {
    db.close();
  }
}

module.exports = { migrateCorporateRebrandings };
