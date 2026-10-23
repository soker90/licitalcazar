import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { migrateProcedures, main } = require('./migrate-procedimientos.js');

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE contracts (
      id TEXT PRIMARY KEY,
      case_number TEXT,
      object_description TEXT,
      contracting_authority_name TEXT,
      awardee TEXT,
      procedure TEXT,
      dataset TEXT
    );
    INSERT INTO contracts (id, case_number, object_description, contracting_authority_name, awardee, procedure, dataset)
    VALUES
      ('contract-1', '1/2026 Servicios', 'Mantenimiento', 'Authority', 'Empresa', 'Menor', 'contratos_menores'),
      ('contract-2', '2/2026 Servicios', 'Limpieza', 'Authority', 'Otra empresa', NULL, 'encargos');
  `);
  return db;
}

describe('migrate-procedimientos', () => {
  it('preserves an existing recovery backup and leaves the database untouched', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-procedures-backup-'));
    const dbPath = path.join(dir, 'source.db');
    const backupPath = path.join(dir, 'recovery.db');
    fs.writeFileSync(dbPath, 'known-good-database');
    fs.writeFileSync(backupPath, 'previous-recovery-copy');

    try {
      expect(() => main({ dbPath, backupPath })).toThrow(/sobrescribirlo/);
      expect(fs.readFileSync(dbPath, 'utf8')).toBe('known-good-database');
      expect(fs.readFileSync(backupPath, 'utf8')).toBe('previous-recovery-copy');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('updates procedure and dataset values and rebuilds the FTS index atomically', () => {
    const db = makeDb();

    try {
      const result = migrateProcedures(db);

      expect(result).toEqual({ procedures: 1, datasets: 1, nullProcedures: 1 });
      expect(db.prepare('SELECT procedure, dataset FROM contracts WHERE id = ?').get('contract-1'))
        .toEqual({ procedure: 'Contrato menor', dataset: 'menores' });
      expect(db.prepare('SELECT procedure FROM contracts WHERE id = ?').get('contract-2').procedure)
        .toBe('Encargo a medio propio');
      expect(db.prepare('SELECT count(*) AS count FROM contracts_fts').get().count).toBe(2);
      expect(db.prepare('SELECT id FROM contracts_fts WHERE contracts_fts MATCH ?').all('Mantenimiento'))
        .toEqual([{ id: 'contract-1' }]);
    } finally {
      db.close();
    }
  });

  it('rolls back earlier updates if a later migration step fails', () => {
    const db = makeDb();
    db.exec(`
      CREATE TRIGGER reject_dataset_update
      BEFORE UPDATE OF dataset ON contracts
      WHEN NEW.dataset = 'menores'
      BEGIN
        SELECT RAISE(ABORT, 'forced failure');
      END;
    `);

    try {
      expect(() => migrateProcedures(db)).toThrow(/forced failure/);
      expect(db.prepare('SELECT procedure, dataset FROM contracts WHERE id = ?').get('contract-1'))
        .toEqual({ procedure: 'Menor', dataset: 'contratos_menores' });
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'contracts_fts'").get())
        .toBeUndefined();
    } finally {
      db.close();
    }
  });
});
