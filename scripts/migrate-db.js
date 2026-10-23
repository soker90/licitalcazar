#!/usr/bin/env node
/**
 * Applies schema migrations to an existing generated database.
 *
 * Initialization belongs to init-db.js. This script is for databases that
 * already exist (for example the versioned DB used by CI).
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');

function migrateDb(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec("CREATE TABLE IF NOT EXISTS lot_awards (" +
      "id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, case_number TEXT, " +
      "lot_number TEXT NOT NULL, award_index INTEGER NOT NULL, awardee TEXT, awardee_nif TEXT, " +
      "awarded_amount REAL, awarded_amount_incl_vat REAL, offer_count INTEGER, award_date TEXT, " +
      "result_code TEXT, result_code_list_uri TEXT, result_state TEXT, description TEXT" +
      ");");
    db.exec('CREATE INDEX IF NOT EXISTS idx_lot_awards_contract_id ON lot_awards(contract_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_lot_awards_case_number ON lot_awards(case_number)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_lot_awards_lot_number ON lot_awards(contract_id, lot_number)');
    let columns = db.prepare("PRAGMA table_info('contracts')").all();

    if (!columns.some((column) => column.name === 'documents_empty_confirmation_count')) {
      console.log('Adding contracts.documents_empty_confirmation_count...');
      db.exec("ALTER TABLE contracts ADD COLUMN documents_empty_confirmation_count INTEGER NOT NULL DEFAULT 0");
      db.exec("CREATE INDEX IF NOT EXISTS idx_contracts_documents_empty_confirmation_count ON contracts(documents_empty_confirmation_count)");
      console.log('contracts.documents_empty_confirmation_count added.');
      columns = db.prepare("PRAGMA table_info('contracts')").all();
    }


    for (const [name, type] of [
      ['status_code', 'TEXT'],
      ['status_code_list_uri', 'TEXT'],
      ['result_code', 'TEXT'],
      ['result_code_list_uri', 'TEXT'],
    ]) {
      if (!columns.some((column) => column.name === name)) {
        console.log('Adding contracts.' + name + '...');
        db.exec('ALTER TABLE contracts ADD COLUMN ' + name + ' ' + type);
        columns = db.prepare("PRAGMA table_info('contracts')").all();
      }
    }

    for (const [name, type, defaultValue] of [
      ['is_lotized', 'INTEGER', '0'],
      ['lot_count', 'INTEGER', '1'],
      ['lots_source', 'TEXT', null],
    ]) {
      if (!columns.some((column) => column.name === name)) {
        console.log('Adding contracts.' + name + '...');
        const defaultClause = defaultValue === null ? '' : ' DEFAULT ' + defaultValue;
        db.exec('ALTER TABLE contracts ADD COLUMN ' + name + ' ' + type + defaultClause);
        columns = db.prepare("PRAGMA table_info('contracts')").all();
      }
    }

    const hasContractLots = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='contract_lots'").get().n > 0;
    let lotColumns = hasContractLots ? db.prepare("PRAGMA table_info('contract_lots')").all() : [];

    for (const [name, type] of [
      ['result_code', 'TEXT'],
      ['result_code_list_uri', 'TEXT'],
    ]) {
      if (hasContractLots && !lotColumns.some((column) => column.name === name)) {
        console.log('Adding contract_lots.' + name + '...');
        db.exec('ALTER TABLE contract_lots ADD COLUMN ' + name + ' ' + type);
        lotColumns = db.prepare("PRAGMA table_info('contract_lots')").all();
      }
    }

    if (hasContractLots) {
      db.exec(`
        UPDATE contracts
        SET is_lotized = 1,
            lot_count = (
              SELECT count(*)
              FROM contract_lots lot
              WHERE lot.contract_id = contracts.id
            )
        WHERE EXISTS (
          SELECT 1
          FROM contract_lots lot
          WHERE lot.contract_id = contracts.id
        );
      `);
    }

    if (!columns.some((column) => column.name === 'award_amount_type')) {
      console.log('Adding contracts.award_amount_type...');
      db.exec("ALTER TABLE contracts ADD COLUMN award_amount_type TEXT NOT NULL DEFAULT 'desconocido'");
      console.log('contracts.award_amount_type added.');
    } else {
      console.log('contracts.award_amount_type already exists.');
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
if (require.main === module) {
  const db = new DatabaseSync(DB_PATH);
  try {
    migrateDb(db);
    console.log('Database migrations completed.');
  } finally {
    db.close();
  }
}

module.exports = { migrateDb, DB_PATH };
