#!/usr/bin/env node
/**
 * Creates the empty SQLite schema used by the data pipeline.
 * The database is a generated artifact and must be reproducible from feeds.
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const CONTRACTING_AUTHORITIES_PATH = path.resolve(__dirname, '../data/contracting-authorities.json');
const { migrateCorporateGroups } = require('./migrate-corporate-groups');
const { migrateCorporateRebrandings } = require('./migrate-corporate-name-history');
const { migrateCifCorrections } = require('./migrate-cif-corrections');
const { migrateVerifiedPersonMappings } = require('./migrate-verified-person-mappings');

function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contracts (
      id VARCHAR PRIMARY KEY, contracting_authority_id TEXT, placsp_id VARCHAR, case_number VARCHAR, object_description VARCHAR, contracting_authority_name VARCHAR,
      contracting_authority_nif VARCHAR, contracting_authority_dir3 VARCHAR, contracting_authority_city VARCHAR, department VARCHAR,
      contract_type VARCHAR, contract_type_code VARCHAR, procedure VARCHAR, procedure_code VARCHAR,
      procedure_source VARCHAR DEFAULT 'codigo', economic_nature TEXT DEFAULT 'gasto',
      status VARCHAR, amount_excl_vat DOUBLE, amount_incl_vat DOUBLE, estimated_value REAL,
      awarded_amount DOUBLE, awarded_amount_incl_vat DOUBLE, award_amount_type TEXT NOT NULL DEFAULT 'desconocido', awardee VARCHAR,
      awardee_nif VARCHAR, offer_count DOUBLE, is_sme BIGINT, primary_cpv VARCHAR,
      cpvs VARCHAR, location VARCHAR, nuts VARCHAR, duration VARCHAR, duration_unit VARCHAR,
      eu_funding VARCHAR, urgency VARCHAR, deadline_date VARCHAR, award_date VARCHAR,
      formalization_date VARCHAR, publication_date VARCHAR, updated_at TEXT,
      documents_synced_at TEXT, documents_empty_confirmation_count INTEGER NOT NULL DEFAULT 0,
      source_url VARCHAR, dataset VARCHAR, year DOUBLE,
      scope VARCHAR, is_lotized INTEGER DEFAULT 0,
      lot_count INTEGER DEFAULT 1, lots_source TEXT,
      status_code TEXT, status_code_list_uri TEXT, result_code TEXT, result_code_list_uri TEXT
    );
    CREATE TABLE IF NOT EXISTS contract_lots (
      id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, case_number TEXT, lot_number TEXT NOT NULL,
      lot_name TEXT, amount_excl_vat REAL, amount_incl_vat REAL, estimated_value REAL,
      awardee TEXT, awardee_nif TEXT, lot_status TEXT, award_date TEXT,
      cpv TEXT, budget_excl_vat REAL, budget_incl_vat REAL,
      awarded_amount REAL, awarded_amount_incl_vat REAL, offer_count INTEGER,
      result_code TEXT, result_code_list_uri TEXT
    );
    CREATE TABLE IF NOT EXISTS contract_awards (
      id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, case_number TEXT,
      award_index INTEGER NOT NULL, awardee TEXT, awardee_nif TEXT,
      awarded_amount REAL, awarded_amount_incl_vat REAL, offer_count INTEGER,
      award_date TEXT, result_code TEXT, result_code_list_uri TEXT,
      result_state TEXT, description TEXT
    );
    CREATE TABLE IF NOT EXISTS lot_awards (
      id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, case_number TEXT,
      lot_number TEXT NOT NULL, award_index INTEGER NOT NULL,
      awardee TEXT, awardee_nif TEXT,
      awarded_amount REAL, awarded_amount_incl_vat REAL, offer_count INTEGER,
      award_date TEXT, result_code TEXT, result_code_list_uri TEXT,
      result_state TEXT, description TEXT
    );
    CREATE TABLE IF NOT EXISTS modifications (
      id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, case_number TEXT, modification_number INTEGER,
      modification_date TEXT, reason TEXT, modification_type TEXT, duration_value REAL,
      duration_unit TEXT, duration_months REAL, duration_days REAL, modification_amount REAL,
      final_amount REAL, document_url TEXT, document_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS contract_documents (
      id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, case_number TEXT, document_date TEXT,
      title TEXT NOT NULL, source_url TEXT NOT NULL, document_type TEXT,
      is_abnormally_low_bid_justification INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT, bdns_id INTEGER UNIQUE, award_code TEXT,
      beneficiary_nif TEXT NOT NULL, beneficiary TEXT, granting_authority TEXT,
      granting_authority_level_1 TEXT, granting_authority_level_2 TEXT, granting_authority_level_3 TEXT, amount REAL DEFAULT 0,
      equivalent_aid REAL DEFAULT 0, grant_date TEXT, instrument TEXT,
      call TEXT, call_number TEXT, terms_url TEXT,
      is_alcazar INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS company_resolution (
      raw_nif TEXT, raw_name TEXT, canonical_id TEXT, canonical_nif TEXT,
      canonical_name TEXT, group_id TEXT, group_name TEXT, link_type TEXT,
      link_reason TEXT, PRIMARY KEY (raw_nif, raw_name)
    );
    CREATE TABLE IF NOT EXISTS corporate_groups (
      group_id TEXT PRIMARY KEY, group_name TEXT NOT NULL, associated_nifs_json TEXT NOT NULL,
      scope TEXT, description TEXT, sede TEXT, color TEXT
    );
    CREATE TABLE IF NOT EXISTS corporate_rebrandings (
      cif TEXT PRIMARY KEY, current_name TEXT NOT NULL,
      active_divisions_json TEXT NOT NULL DEFAULT '[]',
      previous_names_json TEXT NOT NULL DEFAULT '[]',
      general_reason TEXT NOT NULL, type TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS verified_person_mappings (
      person_id TEXT PRIMARY KEY, person_name TEXT NOT NULL,
      masked_variants_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS verified_contract_metadata (
      legacy_id TEXT PRIMARY KEY, contract_id TEXT NOT NULL UNIQUE,
      explicit_end_date TEXT, source TEXT NOT NULL, reason TEXT
    );
    CREATE TABLE IF NOT EXISTS verified_data_repairs (
      id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      field_name TEXT NOT NULL, corrected_value TEXT, source TEXT NOT NULL, reason TEXT,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_type, entity_id, field_name)
    );
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contracting_authorities (
      id TEXT PRIMARY KEY,
      placsp_id TEXT UNIQUE,
      dir3 TEXT,
      nif TEXT,
      name TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'Directa Municipal',
      active INTEGER NOT NULL DEFAULT 1,
      historical_names_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_contracts_authority_id ON contracts(contracting_authority_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_contracts_case_authority ON contracts(case_number, contracting_authority_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_placsp_id ON contracts(placsp_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_contracting_authority_name ON contracts(contracting_authority_name);
    CREATE INDEX IF NOT EXISTS idx_contracts_awardee ON contracts(awardee);
    CREATE INDEX IF NOT EXISTS idx_contracts_awardee_nif ON contracts(awardee_nif);
    CREATE INDEX IF NOT EXISTS idx_contracts_year ON contracts(year);
    CREATE INDEX IF NOT EXISTS idx_contracts_contract_type ON contracts(contract_type);
    CREATE INDEX IF NOT EXISTS idx_contracts_contract_type_code ON contracts(contract_type_code);
    CREATE INDEX IF NOT EXISTS idx_contracts_procedure ON contracts(procedure);
    CREATE INDEX IF NOT EXISTS idx_contracts_procedure_code ON contracts(procedure_code);
    CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
    CREATE INDEX IF NOT EXISTS idx_contracts_publication_date ON contracts(publication_date);
    CREATE INDEX IF NOT EXISTS idx_contracts_documents_empty_confirmation_count ON contracts(documents_empty_confirmation_count);
    CREATE INDEX IF NOT EXISTS idx_contracts_updated_at ON contracts(updated_at);
    CREATE INDEX IF NOT EXISTS idx_contracts_documents_synced_at ON contracts(documents_synced_at);
    CREATE INDEX IF NOT EXISTS idx_contracts_scope ON contracts(scope);
    CREATE INDEX IF NOT EXISTS idx_contracts_economic_nature ON contracts(economic_nature);
    CREATE INDEX IF NOT EXISTS idx_contracts_awarded_amount ON contracts(awarded_amount);
    CREATE INDEX IF NOT EXISTS idx_contract_lots_contract_id ON contract_lots(contract_id);
    CREATE INDEX IF NOT EXISTS idx_contract_lots_case_number ON contract_lots(case_number);
    CREATE INDEX IF NOT EXISTS idx_contract_awards_contract_id ON contract_awards(contract_id);
    CREATE INDEX IF NOT EXISTS idx_contract_awards_case_number ON contract_awards(case_number);
    CREATE INDEX IF NOT EXISTS idx_lot_awards_contract_id ON lot_awards(contract_id);
    CREATE INDEX IF NOT EXISTS idx_lot_awards_case_number ON lot_awards(case_number);
    CREATE INDEX IF NOT EXISTS idx_lot_awards_lot_number ON lot_awards(contract_id, lot_number);
    CREATE INDEX IF NOT EXISTS idx_modifications_contract_id ON modifications(contract_id);
    CREATE INDEX IF NOT EXISTS idx_modifications_case_number ON modifications(case_number);
    CREATE INDEX IF NOT EXISTS idx_contract_documents_contract_id ON contract_documents(contract_id);
    CREATE INDEX IF NOT EXISTS idx_contract_documents_abnormality ON contract_documents(is_abnormally_low_bid_justification);
    CREATE INDEX IF NOT EXISTS idx_grants_beneficiary_nif ON grants(beneficiary_nif);
    CREATE INDEX IF NOT EXISTS idx_grants_is_alcazar ON grants(is_alcazar);
    CREATE INDEX IF NOT EXISTS idx_grants_grant_date ON grants(grant_date);
    CREATE INDEX IF NOT EXISTS idx_company_resolution_canonical_id ON company_resolution(canonical_id);
    CREATE INDEX IF NOT EXISTS idx_company_resolution_group_id ON company_resolution(group_id);
    CREATE INDEX IF NOT EXISTS idx_verified_repairs_entity ON verified_data_repairs(entity_type, entity_id, active);
    CREATE INDEX IF NOT EXISTS idx_contracting_authorities_active ON contracting_authorities(active);
    CREATE INDEX IF NOT EXISTS idx_contracting_authorities_dir3 ON contracting_authorities(dir3);
    CREATE INDEX IF NOT EXISTS idx_contracting_authorities_nif ON contracting_authorities(nif);
    CREATE INDEX IF NOT EXISTS idx_contracting_authorities_placsp ON contracting_authorities(placsp_id);
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      level TEXT NOT NULL,
      scale_score REAL NOT NULL DEFAULT 0,
      confidence REAL NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      target_data TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      extracted_at TEXT NOT NULL,
      applied_rule TEXT NOT NULL,
      methodology_version TEXT NOT NULL,
      limitations TEXT NOT NULL,
      alternative_explanation TEXT NOT NULL,
      requires_human_review INTEGER NOT NULL DEFAULT 1,
      evidence TEXT NOT NULL,
      factors_json TEXT NOT NULL,
      continuity_pattern TEXT,
      explanations_json TEXT,
      documents_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alert_contracts (
      alert_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      PRIMARY KEY (alert_id, contract_id)
    );
    CREATE TABLE IF NOT EXISTS related_contracts (
      group_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      similarity_score REAL NOT NULL,
      accumulated_amount REAL NOT NULL,
      reasons_json TEXT NOT NULL,
      PRIMARY KEY (group_id, contract_id)
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
    CREATE INDEX IF NOT EXISTS idx_alerts_scale_score ON alerts(scale_score);
    CREATE INDEX IF NOT EXISTS idx_alerts_category ON alerts(category);
    CREATE INDEX IF NOT EXISTS idx_alert_contracts_contract_id ON alert_contracts(contract_id);
    CREATE INDEX IF NOT EXISTS idx_related_contracts_group_id ON related_contracts(group_id);
  `);
  if (!fs.existsSync(CONTRACTING_AUTHORITIES_PATH)) {
    throw new Error(`Missing contracting authority configuration: ${CONTRACTING_AUTHORITIES_PATH}`);
  }
  const config = JSON.parse(fs.readFileSync(CONTRACTING_AUTHORITIES_PATH, 'utf8'));
  const seed = db.prepare(`
    INSERT INTO contracting_authorities(id, placsp_id, dir3, nif, name, scope, active, historical_names_json)
    VALUES (?,?,?,?,?, ?,1,?)
    ON CONFLICT(id) DO UPDATE SET
      placsp_id=excluded.placsp_id,
      dir3=excluded.dir3,
      nif=excluded.nif,
      name=excluded.name,
      scope=excluded.scope,
      historical_names_json=excluded.historical_names_json,
      active=excluded.active
  `);
  for (const row of config.contracting_authorities || []) {
    seed.run(
      row.id,
      row.placsp_id || null,
      row.dir3 || null,
      row.nif || null,
      row.name,
      row.scope || 'Directa Municipal',
      JSON.stringify(row.historical_names || [])
    );
  }

  migrateCorporateGroups(db);
  migrateCorporateRebrandings(db);
  migrateCifCorrections(db);
  migrateVerifiedPersonMappings(db);
}

if (require.main === module) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  try { initDb(db); console.log(`✅ Base de datos inicializada: ${DB_PATH}`); }
  finally { db.close(); }
}
module.exports = { initDb, DB_PATH };
