import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { repairVerifiedData } = require('./repair-verified-data');
const { getContractIdentityKey } = require('./contract-identity');

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE contracts (
      id TEXT PRIMARY KEY,
      placsp_id TEXT,
      contracting_authority_id TEXT,
      case_number TEXT,
      awarded_amount REAL
    );
    CREATE TABLE contract_lots (
      id TEXT PRIMARY KEY,
      contract_id TEXT,
      case_number TEXT,
      lot_number TEXT
    );
    CREATE TABLE contract_awards (
      id TEXT PRIMARY KEY,
      contract_id TEXT,
      award_index INTEGER
    );
    CREATE TABLE lot_awards (
      id TEXT PRIMARY KEY,
      contract_id TEXT,
      lot_number TEXT,
      award_index INTEGER
    );
    CREATE TABLE modifications (
      id TEXT PRIMARY KEY,
      contract_id TEXT,
      modification_number INTEGER
    );
    CREATE TABLE contract_documents (
      id TEXT PRIMARY KEY,
      contract_id TEXT
    );
    CREATE TABLE alert_contracts (
      alert_id TEXT,
      contract_id TEXT
    );
    CREATE TABLE related_contracts (
      group_id TEXT,
      contract_id TEXT,
      similarity_score REAL,
      accumulated_amount REAL,
      reasons_json TEXT
    );
    CREATE TABLE verified_contract_metadata (
      legacy_id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL UNIQUE,
      explicit_end_date TEXT,
      source TEXT NOT NULL,
      reason TEXT
    );
    CREATE TABLE verified_data_repairs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      corrected_value TEXT,
      source TEXT NOT NULL,
      reason TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_type, entity_id, field_name)
    );
  `);
  return db;
}

describe('repair-verified-data authority scoping', () => {
  it('usa la autoridad corregida para resolver un PLACSP compartido', () => {
    const db = makeDb();
    db.prepare('INSERT INTO contracts(id, placsp_id, contracting_authority_id, case_number, awarded_amount) VALUES (?, ?, ?, ?, ?)')
      .run('ctr_wrong', '11906668', 'authority-wrong', '1/2026', 10);
    db.prepare('INSERT INTO contracts(id, placsp_id, contracting_authority_id, case_number, awarded_amount) VALUES (?, ?, ?, ?, ?)')
      .run('ctr_right', '11906668', 'authority-right', '1/2026', 20);
    db.prepare('INSERT INTO verified_data_repairs(entity_type, entity_id, field_name, corrected_value, source, reason) VALUES (?, ?, ?, ?, ?, ?)')
      .run('licitacion', '11906668', 'contracting_authority_id', 'authority-right', 'test', 'autoridad verificada');

    const result = repairVerifiedData(db);
    expect(result[0].antes.id).toBe('ctr_right');
    expect(result[0].despues.id).toBe('ctr_right');
    expect(result[0].despues.contracting_authority_id).toBe('authority-right');
    db.close();
  });
});

describe('repair-verified-data FTS synchronization', () => {
  it('actualiza el identificador FTS al cambiar el organismo', () => {
    const db = makeDb();
    db.exec(`
      CREATE TABLE contracts_fts (
        id TEXT,
        case_number TEXT,
        object_description TEXT,
        contracting_authority_name TEXT,
        awardee TEXT
      );
    `);
    db.prepare('INSERT INTO contracts(id, placsp_id, case_number, contracting_authority_id) VALUES (?, ?, ?, ?)').run('ctr_old', '11906668', '12/2022 Patrimonial', 'authority-old');
    db.prepare('INSERT INTO contracts_fts(id, case_number) VALUES (?, ?)').run('ctr_old', '12/2022 Patrimonial');
    db.prepare(`
      INSERT INTO verified_data_repairs(id, entity_type, entity_id, field_name, corrected_value, source)
      VALUES ('r-authority', 'licitacion', 'ctr_old', 'contracting_authority_id', 'authority-new', 'test')
    `).run();

    const result = repairVerifiedData(db);
    const nextId = result[0].id;
    expect(db.prepare('SELECT id FROM contracts_fts').get().id).toBe(nextId);
    db.close();
  });
});

describe('repair-verified-data', () => {
  it('rechaza un ID PLACSP compartido entre case_numbers', () => {
    const db = makeDb();
    db.prepare('INSERT INTO contracts(id, placsp_id, case_number) VALUES (?, ?, ?)').run('ctr_a', '11906668', '12/2022 Patrimonial');
    db.prepare('INSERT INTO contracts(id, placsp_id, case_number) VALUES (?, ?, ?)').run('ctr_b', '11906668', '3/2023 Patrimonial');
    db.prepare(`
      INSERT INTO verified_data_repairs(id, entity_type, entity_id, field_name, corrected_value, source)
      VALUES ('r1', 'licitacion', '11906668', 'awarded_amount', '100', 'test')
    `).run();

    expect(() => repairVerifiedData(db)).toThrow(/ambiguo/);
    db.close();
  });

  it('recalcula la identidad y mueve los hijos al cambiar de organismo', () => {
    const db = makeDb();
    db.prepare('INSERT INTO contracts(id, placsp_id, case_number, contracting_authority_id) VALUES (?, ?, ?, ?)').run('ctr_old', '11906668', '12/2022 Patrimonial', 'authority-old');
    db.prepare('INSERT INTO contract_lots(id, contract_id, case_number, lot_number) VALUES (?, ?, ?, ?)').run('ctr_old_lote_1', 'ctr_old', '12/2022 Patrimonial', '1');
    db.prepare('INSERT INTO contract_awards(id, contract_id, award_index) VALUES (?, ?, ?)').run('ctr_old_award_1', 'ctr_old', 1);
    db.prepare('INSERT INTO verified_contract_metadata(legacy_id, contract_id, explicit_end_date, source) VALUES (?, ?, ?, ?)').run('legacy-1', 'ctr_old', '2027-01-09', 'test');
    db.prepare('INSERT INTO lot_awards(id, contract_id, lot_number, award_index) VALUES (?, ?, ?, ?)').run('ctr_old_lot_1_award_0', 'ctr_old', '1', 0);
    db.prepare('INSERT INTO modifications(id, contract_id, modification_number) VALUES (?, ?, ?)').run('ctr_old|mod-1', 'ctr_old', 1);
    db.prepare('INSERT INTO contract_documents(id, contract_id) VALUES (?, ?)').run('ctr_old_doc_1', 'ctr_old');
    db.prepare('INSERT INTO alert_contracts(alert_id, contract_id) VALUES (?, ?)').run('alert-1', 'ctr_old');
    db.prepare('INSERT INTO related_contracts(group_id, contract_id, similarity_score, accumulated_amount, reasons_json) VALUES (?, ?, ?, ?, ?)').run('group-1', 'ctr_old', 0.9, 100, '[]');
    db.prepare(`
      INSERT INTO verified_data_repairs(id, entity_type, entity_id, field_name, corrected_value, source)
      VALUES ('r-authority', 'licitacion', 'ctr_old', 'contracting_authority_id', 'authority-new', 'test')
    `).run();

    const result = repairVerifiedData(db);
    const nextId = result[0].id;
    expect(nextId).not.toBe('ctr_old');
    expect(db.prepare('SELECT contracting_authority_id FROM contracts WHERE id = ?').get(nextId).contracting_authority_id).toBe('authority-new');
    expect(result[0].despues.id).toBe(nextId);
    expect(db.prepare('SELECT contract_id FROM contract_lots WHERE id = ?').get(nextId + '_lote_1').contract_id).toBe(nextId);
    expect(db.prepare('SELECT contract_id FROM contract_awards WHERE id = ?').get(nextId + '_award_1').contract_id).toBe(nextId);
    expect(db.prepare('SELECT contract_id FROM verified_contract_metadata WHERE legacy_id = ?').get('legacy-1').contract_id).toBe(nextId);
    expect(db.prepare('SELECT contract_id FROM lot_awards WHERE id = ?').get(nextId + '_lot_1_award_0').contract_id).toBe(nextId);
    expect(db.prepare('SELECT contract_id FROM modifications WHERE id = ?').get(nextId + '|mod-1').contract_id).toBe(nextId);
    expect(db.prepare('SELECT contract_id FROM contract_documents WHERE id = ?').get(nextId + '_doc_1').contract_id).toBe(nextId);
    expect(db.prepare('SELECT contract_id FROM alert_contracts WHERE alert_id = ?').get('alert-1').contract_id).toBe(nextId);
    expect(db.prepare('SELECT contract_id FROM related_contracts WHERE group_id = ?').get('group-1').contract_id).toBe(nextId);
    db.close();
  });

  it('rechaza una identidad destino con filas hijas existentes y revierte la transacción', () => {
    const db = makeDb();
    db.prepare('INSERT INTO contracts(id, placsp_id, case_number, contracting_authority_id) VALUES (?, ?, ?, ?)')
      .run('ctr_old', '11906668', '12/2022 Patrimonial', 'authority-old');
    const destinationId = getContractIdentityKey('12/2022 Patrimonial', 'authority-new');
    db.prepare('INSERT INTO contract_lots(id, contract_id, case_number, lot_number) VALUES (?, ?, ?, ?)')
      .run(destinationId + '_lote_1', destinationId, '12/2022 Patrimonial', '1');
    db.prepare(`
      INSERT INTO verified_data_repairs(id, entity_type, entity_id, field_name, corrected_value, source)
      VALUES ('r-authority', 'licitacion', 'ctr_old', 'contracting_authority_id', 'authority-new', 'test')
    `).run();

    expect(() => repairVerifiedData(db)).toThrow(/filas hijas ya existentes en contract_lots/);
    expect(db.prepare('SELECT id, contracting_authority_id FROM contracts WHERE id = ?').get('ctr_old').contracting_authority_id)
      .toBe('authority-old');
    expect(db.prepare('SELECT contract_id FROM contract_lots WHERE id = ?').get(destinationId + '_lote_1').contract_id)
      .toBe(destinationId);
    expect(db.prepare('SELECT id FROM contracts WHERE id LIKE ?').all('ctr_%').map((row) => row.id))
      .toEqual(['ctr_old']);
    db.close();
  });

  it('rechaza una identidad destino con adjudicaciones contractuales existentes', () => {
    const db = makeDb();
    db.prepare('INSERT INTO contracts(id, placsp_id, case_number, contracting_authority_id) VALUES (?, ?, ?, ?)')
      .run('ctr_old', '11906668', '12/2022 Patrimonial', 'authority-old');
    const destinationId = getContractIdentityKey('12/2022 Patrimonial', 'authority-new');
    db.prepare('INSERT INTO contract_awards(id, contract_id, award_index) VALUES (?, ?, ?)')
      .run(destinationId + '_award_1', destinationId, 1);
    db.prepare(`
      INSERT INTO verified_data_repairs(id, entity_type, entity_id, field_name, corrected_value, source)
      VALUES ('r-authority', 'licitacion', 'ctr_old', 'contracting_authority_id', 'authority-new', 'test')
    `).run();

    expect(() => repairVerifiedData(db)).toThrow(/filas hijas ya existentes en contract_awards/);
    expect(db.prepare('SELECT contracting_authority_id FROM contracts WHERE id = ?').get('ctr_old').contracting_authority_id)
      .toBe('authority-old');
    db.close();
  });

  it('elimina adjudicaciones de lotes cuando una corrección marca el contrato como no lotizado', () => {
    const db = makeDb();
    db.exec('ALTER TABLE contracts ADD COLUMN is_lotized INTEGER');
    db.prepare('INSERT INTO contracts(id, placsp_id, case_number, awarded_amount, is_lotized) VALUES (?, ?, ?, ?, ?)')
      .run('ctr_non_lotized', '11906668', '12/2022 Patrimonial', 100, 1);
    db.prepare('INSERT INTO contract_lots(id, contract_id, case_number, lot_number) VALUES (?, ?, ?, ?)')
      .run('ctr_non_lotized_lote_1', 'ctr_non_lotized', '12/2022 Patrimonial', '1');
    db.prepare('INSERT INTO lot_awards(id, contract_id, lot_number, award_index) VALUES (?, ?, ?, ?)')
      .run('ctr_non_lotized_lot_1_award_0', 'ctr_non_lotized', '1', 0);
    db.prepare('INSERT INTO contract_awards(id, contract_id, award_index) VALUES (?, ?, ?)')
      .run('ctr_non_lotized_award_0', 'ctr_non_lotized', 0);
    db.prepare(`
      INSERT INTO verified_data_repairs(id, entity_type, entity_id, field_name, corrected_value, source)
      VALUES ('r-not-lotized', 'licitacion', 'ctr_non_lotized', 'is_lotized', '0', 'test')
    `).run();

    repairVerifiedData(db);

    expect(db.prepare('SELECT id FROM contract_lots WHERE contract_id = ?').all('ctr_non_lotized')).toEqual([]);
    expect(db.prepare('SELECT id FROM lot_awards WHERE contract_id = ?').all('ctr_non_lotized')).toEqual([]);
    expect(db.prepare('SELECT id FROM contract_awards WHERE contract_id = ?').all('ctr_non_lotized')).toEqual([{ id: 'ctr_non_lotized_award_0' }]);
    db.close();
  });
  it('permite una corrección dirigida al ID interno', () => {
    const db = makeDb();
    db.prepare('INSERT INTO contracts(id, placsp_id, case_number, awarded_amount) VALUES (?, ?, ?, ?)').run('ctr_a', '11906668', '12/2022 Patrimonial', 10);
    db.prepare(`
      INSERT INTO verified_data_repairs(id, entity_type, entity_id, field_name, corrected_value, source)
      VALUES ('r1', 'licitacion', 'ctr_a', 'awarded_amount', '100', 'test')
    `).run();

    const result = repairVerifiedData(db);
    expect(result[0].despues.awarded_amount).toBe(100);
    db.close();
  });
});
