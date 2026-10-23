import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrateVerifiedContractMetadata } from './migrate-verified-contract-metadata.js';

describe('migrateVerifiedContractMetadata', () => {
  it('resuelve un expediente PLACSP y persiste su fecha final explícita', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        placsp_id TEXT
      );
    `);
    db.prepare('INSERT INTO contracts VALUES (?, ?)').run('ctr_7-2025-obras', '31618340205594');

    migrateVerifiedContractMetadata(db, [{
      entity_id: '17354524',
      placsp_id: '31618340205594',
      explicit_end_date: '2027-01-09',
      source: 'test',
      reason: 'Fecha verificada.'
    }]);

    expect(db.prepare('SELECT * FROM verified_contract_metadata').get()).toEqual({
      legacy_id: '17354524',
      contract_id: 'ctr_7-2025-obras',
      explicit_end_date: '2027-01-09',
      source: 'test',
      reason: 'Fecha verificada.'
    });
    db.close();
  });
});
