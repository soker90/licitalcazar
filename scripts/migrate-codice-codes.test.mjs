import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { migrateCodiceCodes } = require('./migrate-codice-codes');

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE contracts (
      id TEXT PRIMARY KEY,
      procedure TEXT,
      contract_type TEXT,
      dataset TEXT
    );
    INSERT INTO contracts (id, procedure, contract_type, dataset)
    VALUES
      ('one', 'Abierto', 'Suministros', 'licitaciones'),
      ('two', 'Abierto', 'Tipo desconocido', 'licitaciones');
  `);
  return db;
}

describe('migrate-codice-codes', () => {
  it('rejects a null procedure instead of treating SQL NULL as an allowed encargo', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        procedure TEXT,
        contract_type TEXT,
        dataset TEXT
      );
      INSERT INTO contracts (id, procedure, contract_type, dataset)
      VALUES ('null-procedure', NULL, 'Suministros', 'licitaciones');
    `);

    expect(() => migrateCodiceCodes(db)).toThrow('Integrity check failed');
    expect(db.prepare('PRAGMA table_info(contracts)').all().map(c => c.name)).toEqual([
      'id', 'procedure', 'contract_type', 'dataset'
    ]);
    expect(db.prepare('SELECT procedure FROM contracts WHERE id = ?').get('null-procedure').procedure).toBeNull();
    db.close();
  });

  it('revierte datos y cambios de esquema si falla la validación final', () => {
    const db = makeDb();

    expect(() => migrateCodiceCodes(db)).toThrow('Integrity check failed');

    expect(db.prepare('PRAGMA table_info(contracts)').all().map(c => c.name)).toEqual([
      'id', 'procedure', 'contract_type', 'dataset'
    ]);
    expect(db.prepare('SELECT procedure, contract_type FROM contracts ORDER BY id').all()).toEqual([
      { procedure: 'Abierto', contract_type: 'Suministros' },
      { procedure: 'Abierto', contract_type: 'Tipo desconocido' }
    ]);

    db.close();
  });
});
