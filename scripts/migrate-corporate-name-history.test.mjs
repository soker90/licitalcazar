import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { migrateCorporateRebrandings } = require('./migrate-corporate-name-history');

describe('migrate-corporate-rebrandings', () => {
  it('creates the catalog, replaces stale rows and is idempotent', () => {
    const dbPath = path.join(os.tmpdir(), `corporate_rebrandings_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    const db = new DatabaseSync(dbPath);

    try {
      const firstCount = migrateCorporateRebrandings(db);
      const rows = db.prepare('SELECT cif, current_name, active_divisions_json, previous_names_json FROM corporate_rebrandings ORDER BY cif').all();

      expect(firstCount).toBeGreaterThan(0);
      expect(rows).toHaveLength(firstCount);
      expect(rows.some((row) => row.cif === 'A80241789' && row.current_name === 'SERVEO SERVICIOS, S.A.U.')).toBe(true);

      db.prepare('UPDATE corporate_rebrandings SET current_name = ? WHERE cif = ?').run('Stale name', 'A80241789');
      const secondCount = migrateCorporateRebrandings(db);
      const restored = db.prepare('SELECT current_name FROM corporate_rebrandings WHERE cif = ?').get('A80241789');

      expect(secondCount).toBe(firstCount);
      expect(restored.current_name).toBe('SERVEO SERVICIOS, S.A.U.');
    } finally {
      db.close();
      try { fs.unlinkSync(dbPath); } catch {}
    }
  });
  it('rolls back schema changes when catalog writes fail', () => {
    const dbPath = path.join(os.tmpdir(), `corporate_rebrandings_atomic_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    const db = new DatabaseSync(dbPath);

    try {
      db.exec(`
        CREATE TABLE corporate_rebrandings (
          cif TEXT PRIMARY KEY,
          current_name TEXT NOT NULL,
          active_divisions_json TEXT NOT NULL DEFAULT '[]',
          previous_names_json TEXT NOT NULL DEFAULT '[]',
          general_reason TEXT NOT NULL,
          type TEXT NOT NULL
        );
        INSERT INTO corporate_rebrandings(cif, current_name, active_divisions_json, previous_names_json, general_reason, type)
        VALUES ('stale-cif', 'Stale name', '[]', '[]', 'Existing', 'existing');
        CREATE TRIGGER fail_corporate_rebranding_insert
        BEFORE INSERT ON corporate_rebrandings
        BEGIN
          SELECT RAISE(ABORT, 'forced catalog failure');
        END;
      `);

      expect(() => migrateCorporateRebrandings(db)).toThrow('forced catalog failure');

      const rows = db.prepare('SELECT cif, current_name FROM corporate_rebrandings').all();
      expect(rows).toEqual([{ cif: 'stale-cif', current_name: 'Stale name' }]);
    } finally {
      db.close();
      try { fs.unlinkSync(dbPath); } catch {}
    }
  });

});
