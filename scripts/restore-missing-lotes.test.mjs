import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { main, prepareRestoredLotInsert } = require('./restore-missing-lotes');

const requiredColumns = `
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  case_number TEXT,
  lot_number TEXT NOT NULL,
  lot_name TEXT,
  amount_excl_vat REAL,
  amount_incl_vat REAL,
  estimated_value REAL,
  awardee TEXT,
  awardee_nif TEXT,
  lot_status TEXT,
  award_date TEXT,
  cpv TEXT,
  budget_excl_vat REAL,
  budget_incl_vat REAL,
  awarded_amount REAL,
  awarded_amount_incl_vat REAL,
  offer_count INTEGER
`;

function makeDb(withResultCodes = true) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE contract_lots (
      ${requiredColumns}
      ${withResultCodes ? ', result_code TEXT, result_code_list_uri TEXT' : ''}
    );
  `);
  return db;
}

describe('restore-missing-lotes insert', () => {
  it('inserts the correct number of values and preserves PLACSP result codes', () => {
    const db = makeDb();
    const insert = prepareRestoredLotInsert(db);

    insert({
      id: 'ctr_current_lote_3',
      contract_id: 'ctr_current',
      case_number: '3/2026 Obras',
      lot_number: '3',
      lot_name: 'Obras',
      amount_excl_vat: 1000,
      amount_incl_vat: 1210,
      estimated_value: 1100,
      awardee: 'Empresa',
      awardee_nif: 'B12345678',
      lot_status: 'Adjudicado',
      award_date: '2026-05-10',
      cpv: '45000000',
      budget_excl_vat: 1200,
      budget_incl_vat: 1452,
      awarded_amount: 1000,
      awarded_amount_incl_vat: 1210,
      offer_count: 3,
      result_code: '2.04',
      result_code_list_uri: 'https://example.test/codice/2.04',
    });

    expect(db.prepare('SELECT * FROM contract_lots').get()).toMatchObject({
      id: 'ctr_current_lote_3',
      contract_id: 'ctr_current',
      result_code: '2.04',
      result_code_list_uri: 'https://example.test/codice/2.04',
    });
    db.close();
  });

  it('remains compatible with destination schemas predating result-code columns', () => {
    const db = makeDb(false);
    const insert = prepareRestoredLotInsert(db);

    expect(() => insert({
      id: 'ctr_current_lote_1',
      contract_id: 'ctr_current',
      case_number: '1/2026',
      lot_number: '1',
      result_code: '2.04',
      result_code_list_uri: 'https://example.test/codice/2.04',
    })).not.toThrow();

    expect(db.prepare('SELECT id, contract_id FROM contract_lots').get()).toEqual({
      id: 'ctr_current_lote_1',
      contract_id: 'ctr_current',
    });
    db.close();
  });
});


describe('restore-missing-lotes database lifecycle', () => {
  it('closes both databases when validation fails after opening them', () => {
    const before = new DatabaseSync(':memory:');
    const current = new DatabaseSync(':memory:');
    current.exec('CREATE TABLE contract_lots (id TEXT)');
    const openDatabase = (file) => file === 'before' ? before : current;

    expect(() => main({
      beforePath: 'before',
      currentPath: 'current',
      openDatabase,
    })).toThrow('Ambas BDs deben contener contract_lots');

    expect(() => before.prepare('SELECT 1').get()).toThrow();
    expect(() => current.prepare('SELECT 1').get()).toThrow();
  });

  it('closes the first database if opening the second database fails', () => {
    const before = new DatabaseSync(':memory:');
    const openDatabase = (file) => {
      if (file === 'before') return before;
      throw new Error('forced second database open failure');
    };

    expect(() => main({
      beforePath: 'before',
      currentPath: 'current',
      openDatabase,
    })).toThrow('forced second database open failure');

    expect(() => before.prepare('SELECT 1').get()).toThrow();
  });
});

