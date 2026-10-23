#!/usr/bin/env node
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const CATALOG_PATH = path.resolve(__dirname, '../src/data/cif-corrections.json');

function migrateCifCorrections(db, catalogPath = CATALOG_PATH) {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

  db.exec('BEGIN TRANSACTION');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cif_corrections (
      raw_cif TEXT PRIMARY KEY,
        corrected_cif TEXT NOT NULL
      );
    `);

    db.exec('DELETE FROM cif_corrections');
    const insert = db.prepare('INSERT INTO cif_corrections(raw_cif, corrected_cif) VALUES (?, ?)');
    for (const [rawCif, correctedCif] of Object.entries(catalog)) {
      insert.run(rawCif, correctedCif);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return Object.keys(catalog).length;
}

if (require.main === module) {
  const db = new DatabaseSync(DB_PATH);
  try {
    console.log(`✅ Correcciones CIF sincronizadas: ${migrateCifCorrections(db)}`);
  } finally {
    db.close();
  }
}

module.exports = { migrateCifCorrections };
