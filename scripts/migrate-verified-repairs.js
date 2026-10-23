#!/usr/bin/env node
/**
 * Migración de correcciones verificadas a la base de datos.
 *
 * Las correcciones históricas son DATOS, no lógica de aplicación:
 * quedan persistidas en verified_data_repairs y repair-verified-data.js
 * únicamente las aplica de forma genérica.
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const VERIFIED_REPAIRS_PATH = path.resolve(__dirname, '../data/verified-repairs.json');

function loadSeedRepairs() {
  if (!fs.existsSync(VERIFIED_REPAIRS_PATH)) return [];
  const raw = fs.readFileSync(VERIFIED_REPAIRS_PATH, 'utf8');
  const repairs = JSON.parse(raw);
  if (!Array.isArray(repairs)) {
    throw new Error('data/verified-repairs.json debe contener un array');
  }
  return repairs;
}

function migrateVerifiedRepairs(db, repairs = loadSeedRepairs()) {
  db.exec('BEGIN TRANSACTION');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS verified_data_repairs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      corrected_value TEXT,
      source TEXT NOT NULL,
      reason TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_type, entity_id, field_name)
    );
      CREATE INDEX IF NOT EXISTS idx_verified_repairs_entity
        ON verified_data_repairs(entity_type, entity_id, active);
    `);

    const insert = db.prepare(`
    INSERT INTO verified_data_repairs
      (id, entity_type, entity_id, field_name, corrected_value, source, reason, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(entity_type, entity_id, field_name) DO UPDATE SET
      corrected_value = excluded.corrected_value,
      source = excluded.source,
      reason = excluded.reason,
      active = 1
  `);

    // 1. Carga las correcciones verificadas declaradas como datos.
    // El JSON es la fuente de verdad: una corrección retirada debe dejar de
    // estar activa también en una BD ya existente.
    const seeds = repairs;
    const activeIds = new Set();
    for (const repair of seeds) {
      if (!repair.entity_id || !repair.field_name || repair.corrected_value === undefined) {
        throw new Error('Corrección inválida en data/verified-repairs.json');
      }
      const id = `licitacion/${repair.entity_id}/${repair.field_name}`;
      activeIds.add(id);
      insert.run(
        id,
        'licitacion',
        String(repair.entity_id),
        String(repair.field_name),
        String(repair.corrected_value),
        String(repair.source || 'VERIFICADO_PLACSP'),
        String(repair.reason || 'Corrección verificada.')
      );
    }

    // Desactiva correcciones que ya no forman parte del catálogo versionado.
    // No borramos filas para conservar trazabilidad histórica.
    const existing = db.prepare(`
      SELECT id FROM verified_data_repairs
      WHERE entity_type = 'licitacion'
    `).all();
    const deactivate = db.prepare(
      'UPDATE verified_data_repairs SET active = 0 WHERE id = ?'
    );
    for (const row of existing) {
      if (!activeIds.has(row.id)) deactivate.run(row.id);
    }

    // Las correcciones verificadas proceden exclusivamente de
    // data/verified-repairs.json. La BD generada no es fuente de verdad.
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

if (require.main === module) {
  const db = new DatabaseSync(DB_PATH);
  try {
    migrateVerifiedRepairs(db);
    console.log('Correcciones verificadas migradas a verified_data_repairs.');
  } finally {
    db.close();
  }
}

module.exports = { migrateVerifiedRepairs, loadSeedRepairs };
