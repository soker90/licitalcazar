import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('./migrate-contracting-authorities-config');

describe('contracting authorities catalog migration', () => {
  it('rejects duplicate authority identifiers before changing SQLite state', () => {
    const db = new DatabaseSync(':memory:');
    expect(() => migrate(db, [
      { id: 'authority-1', placsp_id: 'placsp-1', dir3: 'DIR3-1', name: 'Authority 1' },
      { id: 'authority-1', placsp_id: 'placsp-2', dir3: 'DIR3-2', name: 'Authority 2' },
    ])).toThrow('Duplicate contracting authority id');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'contracting_authorities'").get()).toBeUndefined();
    db.close();
  });

  it('rolls back schema and data when the catalog write fails', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracting_authorities (
        id TEXT PRIMARY KEY,
        placsp_id TEXT UNIQUE,
        nif TEXT,
        name TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'Directa Municipal',
        active INTEGER NOT NULL DEFAULT 1,
        historical_names_json TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TRIGGER reject_authority_insert
      BEFORE INSERT ON contracting_authorities
      BEGIN
        SELECT RAISE(ABORT, 'forced migration failure');
      END;
    `);

    expect(() => migrate(db, [
      { id: 'authority-1', placsp_id: 'placsp-1', dir3: 'DIR3-1', name: 'Authority 1' },
    ])).toThrow('forced migration failure');

    expect(db.prepare("PRAGMA table_info(contracting_authorities)").all().map(c => c.name)).toEqual([
      'id', 'placsp_id', 'nif', 'name', 'scope', 'active', 'historical_names_json'
    ]);
    expect(db.prepare('SELECT count(*) AS n FROM contracting_authorities').get().n).toBe(0);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_contracting_authorities_active'").get()).toBeUndefined();
    db.close();
  });

  it('rejects an empty catalog without creating or modifying schema', () => {
    const db = new DatabaseSync(':memory:');
    expect(() => migrate(db, [])).toThrow('El catálogo de contracting_authorities está vacío');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'contracting_authorities'").get()).toBeUndefined();
    db.close();
  });
});
