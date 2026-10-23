import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('./migrate-contract-identifiers');

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE contracting_authorities (id TEXT PRIMARY KEY, placsp_id TEXT, active INTEGER, name TEXT);
    INSERT INTO contracting_authorities VALUES ('authority-1', '31052930149053', 1, 'Authority');

    CREATE TABLE contracts (
      id TEXT,
      case_number TEXT,
      contracting_authority_id TEXT,
      contracting_authority_name TEXT,
      object_description TEXT,
      awardee TEXT,
      placsp_id TEXT,
      organo_contratante TEXT,
      organismo_id TEXT,
      awarded_amount REAL
    );
    CREATE TABLE contract_lots (
      id TEXT PRIMARY KEY, contract_id TEXT, case_number TEXT, lot_number TEXT, awarded_amount REAL
    );
    CREATE TABLE modifications (
      id TEXT PRIMARY KEY, contract_id TEXT, case_number TEXT, modification_number INTEGER
    );
    CREATE TABLE contract_documents (
      id TEXT PRIMARY KEY, contract_id TEXT, case_number TEXT, title TEXT, source_url TEXT
    );
    CREATE TABLE contract_awards (
      id TEXT PRIMARY KEY, contract_id TEXT, case_number TEXT, award_index INTEGER
    );
    CREATE TABLE lot_awards (
      id TEXT PRIMARY KEY, contract_id TEXT, case_number TEXT, lot_number TEXT, award_index INTEGER
    );
    CREATE TABLE alerts (id TEXT PRIMARY KEY);
    CREATE TABLE alert_contracts (alert_id TEXT, contract_id TEXT);
    CREATE TABLE related_contracts (
      group_id TEXT,
      contract_id TEXT,
      similarity_score REAL,
      accumulated_amount REAL,
      reasons_json TEXT
    );
    CREATE TABLE verified_contract_metadata (
      legacy_id TEXT PRIMARY KEY,
      contract_id TEXT UNIQUE,
      explicit_end_date TEXT,
      source TEXT,
      reason TEXT
    );
  `);
  return db;
}

describe('migrate-contract-identifiers', () => {
  it('rejects duplicate logical identities after normalizing case-number whitespace', () => {
    const db = makeDb();

    db.prepare('INSERT INTO contracts(id, case_number, contracting_authority_id, contracting_authority_name, placsp_id, organo_contratante) VALUES (?, ?, ?, ?, ?, ?)')
      .run('legacy-1', ' 12/2022   Patrimonial ', 'authority-1', 'Authority', null, 'Authority');
    db.prepare('INSERT INTO contracts(id, case_number, contracting_authority_id, contracting_authority_name, placsp_id, organo_contratante) VALUES (?, ?, ?, ?, ?, ?)')
      .run('legacy-2', '12/2022 Patrimonial', 'authority-1', 'Authority', null, 'Authority');

    expect(() => migrate(db)).toThrow('Identidad lógica duplicada');
    db.close();
  });


  it('rolls back schema changes when a legacy migration is rejected', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracting_authorities (id TEXT PRIMARY KEY, placsp_id TEXT, active INTEGER, name TEXT);
      INSERT INTO contracting_authorities VALUES ('authority-1', '31052930149053', 1, 'Authority');
      CREATE TABLE contracts (id TEXT, case_number TEXT, organo_contratante TEXT, placsp_id TEXT);
      CREATE TABLE contract_lots (id TEXT PRIMARY KEY, contract_id TEXT, case_number TEXT, lot_number TEXT, awarded_amount REAL);
      CREATE TABLE modifications (id TEXT PRIMARY KEY, contract_id TEXT, case_number TEXT, modification_number INTEGER);
      CREATE TABLE contract_documents (id TEXT PRIMARY KEY, contract_id TEXT, case_number TEXT, title TEXT, source_url TEXT);
      CREATE TABLE alerts (id TEXT PRIMARY KEY);
      CREATE TABLE alert_contracts (alert_id TEXT, contract_id TEXT);
    `);
    db.prepare('INSERT INTO contracts(id, case_number, organo_contratante) VALUES (?, ?, ?)').run('legacy-1', '12/2022 Patrimonial', 'Authority');
    db.prepare('INSERT INTO contracts(id, case_number, organo_contratante) VALUES (?, ?, ?)').run('legacy-2', '12/2022   Patrimonial', 'Authority');

    expect(() => migrate(db)).toThrow('Identidad lógica duplicada');
    expect(db.prepare("PRAGMA table_info(contracts)").all().map(c => c.name)).toEqual([
      'id', 'case_number', 'organo_contratante', 'placsp_id'
    ]);
    db.close();
  });

  it('rebuilds the FTS index after contract IDs are normalized', () => {
    const db = makeDb();
    db.exec(`
      CREATE VIRTUAL TABLE contracts_fts USING fts5(
        id UNINDEXED, case_number, object_description, contracting_authority_name, awardee
      );
    `);
    db.prepare('INSERT INTO contracts(id, case_number, contracting_authority_id, contracting_authority_name, placsp_id, object_description, awardee) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('legacy-fts', '15/2024 Servicios', 'authority-1', 'Authority', 'source-15', 'Servicio de mantenimiento', 'Empresa FTS');
    db.prepare('INSERT INTO contracts_fts(id, case_number, object_description, contracting_authority_name, awardee) VALUES (?, ?, ?, ?, ?)')
      .run('legacy-fts', '15/2024 Servicios', 'Servicio de mantenimiento', 'Authority', 'Empresa FTS');

    migrate(db);

    const currentId = db.prepare('SELECT id FROM contracts WHERE case_number = ?').get('15/2024 Servicios').id;
    expect(db.prepare('SELECT id FROM contracts_fts').all()).toEqual([{ id: currentId }]);
    expect(db.prepare('SELECT id FROM contracts_fts WHERE contracts_fts MATCH ?').all('"Empresa FTS"')).toEqual([{ id: currentId }]);
    db.close();
  });

  it('moves verified contract metadata when a unique contract identity changes', () => {
    const db = makeDb();
    db.prepare('INSERT INTO contracts(id, case_number, contracting_authority_id, contracting_authority_name, placsp_id, organo_contratante) VALUES (?, ?, ?, ?, ?, ?)')
      .run('legacy-unique', '15/2024 Servicios', 'authority-1', 'Authority', 'source-15', 'Authority');
    db.prepare('INSERT INTO verified_contract_metadata(legacy_id, contract_id, explicit_end_date, source) VALUES (?, ?, ?, ?)')
      .run('legacy-metadata-15', 'legacy-unique', '2027-06-30', 'test');
    db.prepare('INSERT INTO alerts(id) VALUES (?)').run('alert-old');
    db.prepare('INSERT INTO related_contracts(group_id, contract_id, similarity_score, accumulated_amount, reasons_json) VALUES (?, ?, ?, ?, ?)')
      .run('alert-old', 'legacy-unique', 0.9, 100, '[]');

    migrate(db);

    const currentId = db.prepare('SELECT id FROM contracts WHERE case_number = ?').get('15/2024 Servicios').id;
    expect(db.prepare('SELECT contract_id, explicit_end_date FROM verified_contract_metadata WHERE legacy_id = ?')
      .get('legacy-metadata-15')).toEqual({
        contract_id: currentId,
        explicit_end_date: '2027-06-30',
      });
    expect(db.prepare('SELECT count(*) AS n FROM related_contracts').get().n).toBe(0);
    expect(db.prepare('SELECT count(*) AS n FROM alerts').get().n).toBe(0);
    db.close();
  });

  it('rejects ambiguous old IDs referenced by verified contract metadata', () => {
    const db = makeDb();
    db.prepare('INSERT INTO contracts(id, case_number, contracting_authority_id, contracting_authority_name, placsp_id, organo_contratante) VALUES (?, ?, ?, ?, ?, ?)')
      .run('shared-legacy', '15/2024 Servicios', 'authority-1', 'Authority', null, 'Authority');
    db.prepare('INSERT INTO contracts(id, case_number, contracting_authority_id, contracting_authority_name, placsp_id, organo_contratante) VALUES (?, ?, ?, ?, ?, ?)')
      .run('shared-legacy', '16/2024 Servicios', 'authority-1', 'Authority', null, 'Authority');
    db.prepare('INSERT INTO verified_contract_metadata(legacy_id, contract_id, explicit_end_date, source) VALUES (?, ?, ?, ?)')
      .run('legacy-metadata-shared', 'shared-legacy', '2027-06-30', 'test');

    expect(() => migrate(db)).toThrow(/Metadatos contractuales verificados asociados a IDs de contrato ambiguos/);
    expect(db.prepare('SELECT contract_id FROM verified_contract_metadata WHERE legacy_id = ?')
      .get('legacy-metadata-shared').contract_id).toBe('shared-legacy');
    db.close();
  });

  it('migrates shared PLACSP ids without mixing child records', () => {
    const db = makeDb();

    db.prepare('INSERT INTO contracts(id, case_number, contracting_authority_id, contracting_authority_name, placsp_id, organo_contratante) VALUES (?, ?, ?, ?, ?, ?)')
      .run('12345', '12/2022 Patrimonial', 'authority-1', 'Authority', null, 'Authority');
    db.prepare('INSERT INTO contracts(id, case_number, contracting_authority_id, contracting_authority_name, placsp_id, organo_contratante) VALUES (?, ?, ?, ?, ?, ?)')
      .run('12345', '3/2023 Patrimonial', 'authority-1', 'Authority', null, 'Authority');

    db.prepare('INSERT INTO contract_lots VALUES (?, ?, ?, ?, ?)').run('12345_lote_1', '12345', '12/2022 Patrimonial', '1', 10);
    db.prepare('INSERT INTO contract_lots VALUES (?, ?, ?, ?, ?)').run('12345_lote_1_b', '12345', '3/2023 Patrimonial', '1', 20);
    db.prepare('INSERT INTO contract_awards VALUES (?, ?, ?, ?)').run('12345_award_1', '12345', '12/2022 Patrimonial', 1);
    db.prepare('INSERT INTO contract_awards VALUES (?, ?, ?, ?)').run('12345_award_2', '12345', '3/2023 Patrimonial', 2);
    db.prepare('INSERT INTO lot_awards VALUES (?, ?, ?, ?, ?)').run('12345_lot_1_award_1', '12345', '12/2022 Patrimonial', '1', 1);
    db.prepare('INSERT INTO lot_awards VALUES (?, ?, ?, ?, ?)').run('12345_lot_1_award_2', '12345', '3/2023 Patrimonial', '1', 2);
    db.prepare('INSERT INTO modifications VALUES (?, ?, ?, ?)').run('12345|mod-1', '12345', '12/2022 Patrimonial', 1);
    db.prepare('INSERT INTO contract_documents VALUES (?, ?, ?, ?, ?)').run('12345_doc_1', '12345', '3/2023 Patrimonial', 'doc', 'url');
    db.prepare('INSERT INTO related_contracts VALUES (?, ?, ?, ?, ?)').run('group-2022', '12345', 0.9, 10, '[]');
    db.prepare('INSERT INTO related_contracts VALUES (?, ?, ?, ?, ?)').run('group-2023', '12345', 0.8, 20, '[]');

    const result = migrate(db);
    expect(result.contracts).toBe(2);

    const parents = db.prepare('SELECT id, placsp_id FROM contracts ORDER BY case_number').all();
    expect(parents[0].id).toMatch(/^ctr_[a-f0-9]{24}$/);
    expect(parents[1].id).toMatch(/^ctr_[a-f0-9]{24}$/);
    expect(parents[0].id).not.toBe(parents[1].id);
    expect(parents.map(r => r.placsp_id)).toEqual(['12345', '12345']);

    const lotParents = db.prepare('SELECT DISTINCT contract_id FROM contract_lots').all();
    const awardParents = db.prepare('SELECT contract_id FROM contract_awards ORDER BY case_number').all();
    expect(awardParents.map(r => r.contract_id)).toEqual(expect.arrayContaining(parents.map(r => r.id)));
    const lotAwardParents = db.prepare('SELECT contract_id FROM lot_awards ORDER BY case_number').all();
    expect(lotAwardParents.map(r => r.contract_id)).toEqual(expect.arrayContaining(parents.map(r => r.id)));
    expect(lotParents).toHaveLength(2);
    expect(db.prepare('SELECT contract_id FROM modifications').get().contract_id).toBe(parents[0].id);
    expect(db.prepare('SELECT contract_id FROM contract_documents').get().contract_id).toBe(parents[1].id);
    // The legacy ID was shared by both contracts, so related_contracts cannot
    // be attributed safely to either canonical contract. Ambiguous derived
    // references are discarded and regenerated by the rebuild pipeline.
    const relatedParents = db.prepare('SELECT group_id, contract_id FROM related_contracts ORDER BY group_id').all();
    expect(relatedParents).toEqual([]);
    db.close();
  });

  it('remaps child rows with stale case numbers when the legacy parent ID is unique', () => {
    const db = makeDb();
    db.prepare('INSERT INTO contracts(id, case_number, contracting_authority_id, contracting_authority_name, placsp_id, organo_contratante) VALUES (?, ?, ?, ?, ?, ?)')
      .run('legacy-unique', '15/2024 Servicios', 'authority-1', 'Authority', 'source-15', 'Authority');
    db.prepare('INSERT INTO contract_lots VALUES (?, ?, ?, ?, ?)').run(
      'legacy-unique_lote_1', 'legacy-unique', '15/2024  Servicios antiguo', '1', 100
    );

    migrate(db);

    const currentId = db.prepare('SELECT id FROM contracts WHERE case_number = ?').get('15/2024 Servicios').id;
    expect(db.prepare('SELECT contract_id FROM contract_lots').get().contract_id).toBe(currentId);
    db.close();
  });

  it('rejects ambiguous child references without a unique case-number match and rolls back', () => {
    const db = makeDb();
    db.prepare('INSERT INTO contracts(id, case_number, contracting_authority_id, contracting_authority_name, placsp_id, organo_contratante) VALUES (?, ?, ?, ?, ?, ?)')
      .run('shared-legacy', '15/2024 Servicios', 'authority-1', 'Authority', null, 'Authority');
    db.prepare('INSERT INTO contracts(id, case_number, contracting_authority_id, contracting_authority_name, placsp_id, organo_contratante) VALUES (?, ?, ?, ?, ?, ?)')
      .run('shared-legacy', '16/2024 Servicios', 'authority-1', 'Authority', null, 'Authority');
    db.prepare('INSERT INTO contract_lots VALUES (?, ?, ?, ?, ?)').run(
      'legacy-lote-1', 'shared-legacy', null, '1', 100
    );

    expect(() => migrate(db)).toThrow(/ID legado ambiguo shared-legacy/);
    expect(db.prepare('SELECT id FROM contracts ORDER BY case_number').all().map(row => row.id))
      .toEqual(['shared-legacy', 'shared-legacy']);
    expect(db.prepare('SELECT contract_id FROM contract_lots').get().contract_id).toBe('shared-legacy');
    db.close();
  });

});
