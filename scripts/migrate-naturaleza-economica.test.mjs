import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { migrateEconomicNature, main } = require('./migrate-naturaleza-economica');

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE contracts (
      id TEXT PRIMARY KEY,
      placsp_id TEXT,
      case_number TEXT,
      object_description TEXT,
      contract_type_code TEXT,
      contract_type TEXT
    );
    INSERT INTO contracts (id, case_number) VALUES ('one', 'EXP-1'), ('two', 'EXP-2');
  `);
  return db;
}

describe('migrate-naturaleza-economica', () => {
  it('reports unclassified contracts with a missing description without crashing after commit', () => {
    const db = makeDb();
    db.prepare('UPDATE contracts SET contract_type_code = ?, object_description = NULL WHERE id = ?')
      .run('21', 'one');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

    try {
      expect(() => main(db)).not.toThrow();
      expect(db.prepare('SELECT economic_nature FROM contracts WHERE id = ?').get('one').economic_nature)
        .toBe('sin_clasificar');
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      tableSpy.mockRestore();
      db.close();
    }
  });

  it('revierte todas las clasificaciones si una clasificación posterior falla', () => {
    const db = makeDb();
    let calls = 0;

    expect(() => migrateEconomicNature(db, () => {
      calls += 1;
      if (calls === 2) throw new Error('classifier failure');
      return 'ingreso';
    })).toThrow('classifier failure');

    expect(db.prepare("PRAGMA table_info('contracts')").all().some(c => c.name === 'economic_nature')).toBe(false);
    expect(db.prepare('SELECT id, case_number FROM contracts ORDER BY id').all()).toEqual([
      { id: 'one', case_number: 'EXP-1' },
      { id: 'two', case_number: 'EXP-2' }
    ]);
    db.close();
  });
});
