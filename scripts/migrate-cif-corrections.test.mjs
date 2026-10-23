import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { migrateCifCorrections } = require('./migrate-cif-corrections');

describe('migrate-cif-corrections', () => {
  it('loads the complete catalog and is idempotent', () => {
    const dbPath = path.join(os.tmpdir(), `cif_corrections_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    const db = new DatabaseSync(dbPath);
    try {
      const count = migrateCifCorrections(db);
      expect(count).toBe(9);
      expect(db.prepare('SELECT corrected_cif FROM cif_corrections WHERE raw_cif = ?').get('B13567950').corrected_cif).toBe('B13597950');
      expect(migrateCifCorrections(db)).toBe(count);
      expect(db.prepare('SELECT count(*) AS n FROM cif_corrections').get().n).toBe(count);
    } finally {
      db.close();
      try { fs.unlinkSync(dbPath); } catch {}
    }
  });

  it('rolls back schema creation when the catalog cannot be inserted', () => {
    const dbPath = path.join(os.tmpdir(), `cif_corrections_atomic_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    const db = new DatabaseSync(dbPath);
    const catalogPath = path.join(os.tmpdir(), `cif_corrections_invalid_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);

    try {
      fs.writeFileSync(catalogPath, JSON.stringify({ B13567950: null }));

      expect(() => migrateCifCorrections(db, catalogPath)).toThrow('NOT NULL constraint failed');

      const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cif_corrections'").get();
      expect(table).toBeUndefined();
    } finally {
      db.close();
      try { fs.unlinkSync(dbPath); } catch {}
      try { fs.unlinkSync(catalogPath); } catch {}
    }
  });
});
