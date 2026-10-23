import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { migrateVerifiedRepairs } = require('./migrate-verified-repairs');

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE verified_data_repairs (
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
  `);
  return db;
}

describe('migrate-verified-repairs', () => {
  it('desactiva correcciones retiradas del catálogo versionado', () => {
    const db = makeDb();
    db.prepare(`
      INSERT INTO verified_data_repairs
        (id, entity_type, entity_id, field_name, corrected_value, source, reason, active)
      VALUES (?, 'licitacion', ?, ?, ?, 'old', 'old repair', 1)
    `).run('licitacion/legacy/awarded_amount', 'legacy', 'awarded_amount', '100');

    migrateVerifiedRepairs(db, [{
      entity_id: 'current',
      field_name: 'awarded_amount',
      corrected_value: 200,
      source: 'current',
      reason: 'current repair'
    }]);

    expect(db.prepare('SELECT active FROM verified_data_repairs WHERE id = ?')
      .get('licitacion/legacy/awarded_amount').active).toBe(0);
    expect(db.prepare('SELECT active, corrected_value FROM verified_data_repairs WHERE id = ?')
      .get('licitacion/current/awarded_amount')).toEqual({ active: 1, corrected_value: '200' });
    db.close();
  });

  it('revierte toda la migración si una corrección posterior es inválida', () => {
    const db = makeDb();
    db.prepare(`
      INSERT INTO verified_data_repairs
        (id, entity_type, entity_id, field_name, corrected_value, source, reason, active)
      VALUES ('licitacion/legacy/awarded_amount', 'licitacion', 'legacy', 'awarded_amount', '100', 'old', 'old repair', 1)
    `).run();

    expect(() => migrateVerifiedRepairs(db, [
      {
        entity_id: 'current',
        field_name: 'awarded_amount',
        corrected_value: 200,
        source: 'current',
        reason: 'current repair'
      },
      {
        entity_id: '',
        field_name: 'awarded_amount_incl_vat',
        corrected_value: 240,
        source: 'invalid',
        reason: 'invalid repair'
      }
    ])).toThrow(/Corrección inválida/);

    expect(db.prepare('SELECT active FROM verified_data_repairs WHERE id = ?')
      .get('licitacion/legacy/awarded_amount').active).toBe(1);
    expect(db.prepare('SELECT id FROM verified_data_repairs WHERE id = ?')
      .get('licitacion/current/awarded_amount')).toBeUndefined();
    db.close();
  });

  it('mantiene una corrección declarada como activa', () => {
    const db = makeDb();
    migrateVerifiedRepairs(db, [{
      entity_id: 'current',
      field_name: 'awarded_amount',
      corrected_value: 200,
      source: 'current',
      reason: 'current repair'
    }]);
    migrateVerifiedRepairs(db, [{
      entity_id: 'current',
      field_name: 'awarded_amount',
      corrected_value: 250,
      source: 'current',
      reason: 'updated repair'
    }]);

    expect(db.prepare('SELECT active, corrected_value FROM verified_data_repairs WHERE id = ?')
      .get('licitacion/current/awarded_amount')).toEqual({ active: 1, corrected_value: '250' });
    db.close();
  });
  it('revierte también la creación de esquema cuando la carga falla en una BD nueva', () => {
    const db = new DatabaseSync(':memory:');

    expect(() => migrateVerifiedRepairs(db, [{
      entity_id: '',
      field_name: 'awarded_amount',
      corrected_value: 200,
      source: 'invalid',
      reason: 'invalid repair'
    }])).toThrow(/Corrección inválida/);

    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'verified_data_repairs'").get())
      .toBeUndefined();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_verified_repairs_entity'").get())
      .toBeUndefined();
    db.close();
  });

});
