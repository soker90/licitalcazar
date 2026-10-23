import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import migrateModule from './migrate-db.js';

const { migrateDb } = migrateModule;

describe('migrate-db', () => {

  it('adds PLACSP status and result provenance columns to existing contracts tables', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY)');

    migrateDb(db);

    const columns = db.prepare("PRAGMA table_info('contracts')").all();
    expect(columns.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      'status_code',
      'status_code_list_uri',
      'result_code',
      'result_code_list_uri',
    ]));

    db.close();
  });

  it('adds documents_empty_confirmation_count to an existing contracts table', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY)');

    migrateDb(db);

    const columns = db.prepare("PRAGMA table_info('contracts')").all();
    const column = columns.find((entry) => entry.name === 'documents_empty_confirmation_count');

    expect(column).toBeDefined();
    expect(column.notnull).toBe(1);
    expect(column.dflt_value).toBe('0');

    db.close();
  });

  it('adds PLACSP result provenance columns to existing contract_lots tables', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY)');
    db.exec('CREATE TABLE contract_lots (id TEXT PRIMARY KEY, contract_id TEXT NOT NULL)');

    migrateDb(db);

    const columns = db.prepare("PRAGMA table_info('contract_lots')").all();
    expect(columns.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      'result_code',
      'result_code_list_uri',
    ]));

    db.close();
  });

  it('creates the lot_awards table and indexes for existing databases', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY)');

    migrateDb(db);

    const columns = db.prepare("PRAGMA table_info('lot_awards')").all();
    expect(columns.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      'contract_id',
      'case_number',
      'lot_number',
      'award_index',
      'awardee',
      'awardee_nif',
      'awarded_amount',
      'awarded_amount_incl_vat',
      'offer_count',
      'award_date',
      'result_code',
      'result_code_list_uri',
      'result_state',
      'description',
    ]));
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_lot_awards_lot_number'").get()).toBeDefined();

    db.close();
  });

  it('adds award_amount_type to an existing contracts table', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY)');

    migrateDb(db);

    const columns = db.prepare("PRAGMA table_info('contracts')").all();
    const column = columns.find((entry) => entry.name === 'award_amount_type');

    expect(column).toBeDefined();
    expect(column.notnull).toBe(1);
    expect(column.dflt_value).toBe("'desconocido'");

    db.close();
  });

  it('rolls back schema changes when a migration step fails', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY)');

    const originalExec = db.exec.bind(db);
    const failingDb = new Proxy(db, {
      get(target, property) {
        if (property === 'exec') {
          return (sql) => {
            if (sql.includes('CREATE INDEX IF NOT EXISTS idx_contracts_documents_empty_confirmation_count')) {
              throw new Error('forced migration failure');
            }
            return originalExec(sql);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    expect(() => migrateDb(failingDb)).toThrow('forced migration failure');
    expect(db.prepare("PRAGMA table_info('contracts')").all().map((entry) => entry.name)).toEqual(['id']);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_contracts_documents_empty_confirmation_count'").get()).toBeUndefined();
    db.close();
  });

  it('is idempotent when migrations already exist', () => {
    const db = new DatabaseSync(':memory:');
    db.exec("CREATE TABLE contracts (id TEXT PRIMARY KEY, documents_empty_confirmation_count INTEGER NOT NULL DEFAULT 0, award_amount_type TEXT NOT NULL DEFAULT 'desconocido')");

    migrateDb(db);
    migrateDb(db);

    const columns = db.prepare("PRAGMA table_info('contracts')").all();
    expect(columns.filter((entry) => entry.name === 'documents_empty_confirmation_count')).toHaveLength(1);
    expect(columns.filter((entry) => entry.name === 'award_amount_type')).toHaveLength(1);

    db.close();
  });
});

describe('migrateDb lot columns', () => {

  it('reconstruye is_lotized y lot_count para expedientes que ya tienen contract_lots', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec("CREATE TABLE contracts (id TEXT PRIMARY KEY, awarded_amount REAL); CREATE TABLE contract_lots (id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, lot_number TEXT NOT NULL);");
      db.exec("INSERT INTO contracts (id, awarded_amount) VALUES ('contract-1', 99999); INSERT INTO contract_lots (id, contract_id, lot_number) VALUES ('lot-1', 'contract-1', '1'); INSERT INTO contract_lots (id, contract_id, lot_number) VALUES ('lot-2', 'contract-1', '2');");

      migrateDb(db);

      const row = db.prepare('SELECT is_lotized, lot_count FROM contracts WHERE id = ?').get('contract-1');
      expect(row).toEqual({ is_lotized: 1, lot_count: 2 });
    } finally {
      db.close();
    }
  });

  it('añade las columnas de lotes a una base existente', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY, awarded_amount REAL);');
      migrateDb(db);
      const columns = db.prepare('PRAGMA table_info(contracts)').all().map((column) => column.name);
      expect(columns).toEqual(expect.arrayContaining(['is_lotized', 'lot_count', 'lots_source']));
    } finally {
      db.close();
    }
  });
});
