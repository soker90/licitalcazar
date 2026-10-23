#!/usr/bin/env node
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const CATALOG_PATH = path.resolve(__dirname, '../src/data/verified-person-mappings.json');

function migrateVerifiedPersonMappings(db, catalogPath = CATALOG_PATH) {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

  db.exec('BEGIN TRANSACTION');
  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS verified_person_mappings (
      person_id TEXT PRIMARY KEY,
      person_name TEXT NOT NULL,
      masked_variants_json TEXT NOT NULL DEFAULT '[]'
      );
    `);

    db.exec('DELETE FROM verified_person_mappings');
    const insert = db.prepare(
      'INSERT INTO verified_person_mappings(person_id, person_name, masked_variants_json) VALUES (?, ?, ?)'
    );
    for (const entry of Object.values(catalog)) {
      if (!/^pf-[0-9a-f]{12}$/.test(entry.canonicalId)) {
        throw new Error(`Invalid opaque person id: ${entry.canonicalId}`);
      }
      if (/^\d{8}[A-Z]$/i.test(entry.canonicalId)) {
        throw new Error('Clear personal identifier detected in person catalog');
      }
      insert.run(entry.canonicalId, entry.nombre, JSON.stringify(entry.variantesEnmascaradas || []));
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
    console.log(`Verified person mappings synced: ${migrateVerifiedPersonMappings(db)}`);
  } finally {
    db.close();
  }
}

module.exports = { migrateVerifiedPersonMappings };
