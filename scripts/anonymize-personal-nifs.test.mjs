import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { anonymizePersonalNifs } = require('./anonymize-personal-nifs.js');

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE contracts (id TEXT PRIMARY KEY, awardee_nif TEXT);
    CREATE TABLE contract_lots (id TEXT PRIMARY KEY, awardee_nif TEXT);
    CREATE TABLE lot_awards (id TEXT PRIMARY KEY, awardee_nif TEXT);
    CREATE TABLE grants (id INTEGER PRIMARY KEY, beneficiary_nif TEXT);
    INSERT INTO contracts VALUES ('contract-1', '12345678Z');
    INSERT INTO contract_lots VALUES ('lot-1', '12345678Z');
    INSERT INTO lot_awards VALUES ('award-1', 'B12345678');
    INSERT INTO grants VALUES (1, '12345678Z');
  `);
  return db;
}

describe('anonymize-personal-nifs', () => {
  it('anonymizes physical-person NIFs while preserving corporate CIFs', () => {
    const db = makeDb();

    try {
      const result = anonymizePersonalNifs(db);

      expect(result).toEqual([
        { table: 'contracts', column: 'awardee_nif', rows: 1 },
        { table: 'contract_lots', column: 'awardee_nif', rows: 1 },
        { table: 'lot_awards', column: 'awardee_nif', rows: 0 },
        { table: 'grants', column: 'beneficiary_nif', rows: 1 },
      ]);
      expect(db.prepare('SELECT awardee_nif FROM contracts').get().awardee_nif).toMatch(/^pf-[0-9a-f]{12}$/);
      expect(db.prepare('SELECT awardee_nif FROM contract_lots').get().awardee_nif).toMatch(/^pf-[0-9a-f]{12}$/);
      expect(db.prepare('SELECT awardee_nif FROM lot_awards').get().awardee_nif).toBe('B12345678');
      expect(db.prepare('SELECT beneficiary_nif FROM grants').get().beneficiary_nif).toMatch(/^pf-[0-9a-f]{12}$/);
    } finally {
      db.close();
    }
  });

  it('rolls back all tables if a later table is missing', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (id TEXT PRIMARY KEY, awardee_nif TEXT);
      INSERT INTO contracts VALUES ('contract-1', '12345678Z');
    `);

    try {
      expect(() => anonymizePersonalNifs(db)).toThrow(/no such table: contract_lots/i);
      expect(db.prepare('SELECT awardee_nif FROM contracts').get().awardee_nif).toBe('12345678Z');
    } finally {
      db.close();
    }
  });
});
