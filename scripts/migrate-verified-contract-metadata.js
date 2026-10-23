#!/usr/bin/env node
/**
 * Carga metadatos contractuales verificados que no deben depender de que
 * una reconstrucción concreta conserve una fila histórica de modificaciones.
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const METADATA_PATH = path.resolve(__dirname, '../data/verified-contract-metadata.json');

function loadMetadata() {
  if (!fs.existsSync(METADATA_PATH)) return [];
  const data = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
  if (!Array.isArray(data)) throw new Error('data/verified-contract-metadata.json debe contener un array');
  return data;
}

function migrateVerifiedContractMetadata(db, metadata = loadMetadata()) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS verified_contract_metadata (
      legacy_id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL UNIQUE,
      explicit_end_date TEXT,
      source TEXT NOT NULL,
      reason TEXT
    );
  `);

  const stmt = db.prepare(`
    INSERT INTO verified_contract_metadata
      (legacy_id, contract_id, explicit_end_date, source, reason)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(legacy_id) DO UPDATE SET
      contract_id = excluded.contract_id,
      explicit_end_date = excluded.explicit_end_date,
      source = excluded.source,
      reason = excluded.reason
  `);

  db.exec('BEGIN');
  try {
    const active = new Set();
    for (const item of metadata) {
      if (!item.entity_id || !item.explicit_end_date || !item.source) {
        throw new Error('Metadato contractual verificado inválido');
      }

      if (!item.placsp_id) throw new Error(`El metadato ${item.entity_id} no tiene placsp_id.`);
      const rows = db.prepare(
        'SELECT id FROM contracts WHERE placsp_id = ? OR placsp_id LIKE \'%/\' || ?'
      ).all(String(item.placsp_id), String(item.placsp_id));

      if (rows.length !== 1) {
        throw new Error(`El identificador PLACSP ${item.entity_id} no resuelve unívocamente un contrato.`);
      }

      const contractId = rows[0].id;
      active.add(String(item.entity_id));
      stmt.run(String(item.entity_id), contractId, item.explicit_end_date, item.source, item.reason || null);
    }

    const existing = db.prepare('SELECT legacy_id FROM verified_contract_metadata').all();
    const remove = db.prepare('DELETE FROM verified_contract_metadata WHERE legacy_id = ?');
    for (const row of existing) {
      if (!active.has(row.legacy_id)) remove.run(row.legacy_id);
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

if (require.main === module) {
  const db = new DatabaseSync(DB_PATH);
  try {
    migrateVerifiedContractMetadata(db);
    console.log('Metadatos contractuales verificados migrados.');
  } finally {
    db.close();
  }
}

module.exports = { loadMetadata, migrateVerifiedContractMetadata };
