import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { migrateVerifiedContractSeeds } = require('./migrate-verified-contract-seeds');

describe('migrate-verified-contract-seeds', () => {
  it('no retrocede un snapshot más reciente con un seed antiguo', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE contracts (
      id TEXT PRIMARY KEY, placsp_id TEXT, case_number TEXT, object_description TEXT, contracting_authority_id TEXT, contracting_authority_name TEXT,
      contracting_authority_nif TEXT, contracting_authority_dir3 TEXT, contracting_authority_city TEXT, department TEXT, contract_type TEXT, contract_type_code TEXT,
      procedure TEXT, procedure_code TEXT, procedure_source TEXT, economic_nature TEXT, status TEXT,
      amount_excl_vat REAL, amount_incl_vat REAL, estimated_value REAL, awarded_amount REAL, awarded_amount_incl_vat REAL, award_amount_type TEXT,
      awardee TEXT, awardee_nif TEXT, offer_count INTEGER, is_sme INTEGER, primary_cpv TEXT, cpvs TEXT,
      location TEXT, nuts TEXT, duration TEXT, duration_unit TEXT, eu_funding TEXT, urgencia TEXT, deadline_date TEXT,
      award_date TEXT, formalization_date TEXT, publication_date TEXT, updated_at TEXT, source_url TEXT, dataset TEXT,
      urgency TEXT, year INTEGER, scope TEXT, is_lotized INTEGER, lot_count INTEGER, lots_source TEXT
    );`);
    db.prepare(`INSERT INTO contracts (
      id, placsp_id, case_number, contracting_authority_id, updated_at, awarded_amount, awardee
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'ctr_existing', '31618340205594', '7/2025 Obras', 'ayuntamiento-junta-gobierno', '2026-09-20 10:00:00', 2000000, 'ADJUDICATARIO NUEVO'
    );

    migrateVerifiedContractSeeds(db);

    const actual = db.prepare('SELECT updated_at, awarded_amount, awardee FROM contracts WHERE placsp_id = ?').get('31618340205594');
    expect(actual.updated_at).toBe('2026-09-20 10:00:00');
    expect(actual.awarded_amount).toBe(2000000);
    expect(actual.awardee).toBe('ADJUDICATARIO NUEVO');
    db.close();
  });

  it('crea el contrato con identidad interna determinista y clasifica su importe', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE contracts (
      id TEXT PRIMARY KEY, placsp_id TEXT, case_number TEXT, object_description TEXT, contracting_authority_id TEXT, contracting_authority_name TEXT,
      contracting_authority_nif TEXT, contracting_authority_dir3 TEXT, contracting_authority_city TEXT, department TEXT, contract_type TEXT, contract_type_code TEXT,
      procedure TEXT, procedure_code TEXT, procedure_source TEXT, economic_nature TEXT, status TEXT,
      amount_excl_vat REAL, amount_incl_vat REAL, estimated_value REAL, awarded_amount REAL, awarded_amount_incl_vat REAL, award_amount_type TEXT,
      awardee TEXT, awardee_nif TEXT, offer_count INTEGER, is_sme INTEGER, primary_cpv TEXT, cpvs TEXT,
      location TEXT, nuts TEXT, duration TEXT, duration_unit TEXT, eu_funding TEXT, urgencia TEXT, deadline_date TEXT,
      award_date TEXT, formalization_date TEXT, publication_date TEXT, updated_at TEXT, source_url TEXT, dataset TEXT,
      urgency TEXT, year INTEGER, scope TEXT, is_lotized INTEGER, lot_count INTEGER, lots_source TEXT
    );`);
    const n = migrateVerifiedContractSeeds(db);
    expect(n).toBeGreaterThan(0);
    const row = db.prepare('SELECT id, placsp_id, case_number, awarded_amount, award_amount_type, urgency FROM contracts').get();
    expect(row.id).toMatch(/^ctr_[a-f0-9]{24}$/);
    expect(row.placsp_id).toBe('31618340205594');
    expect(row.case_number).toBe('7/2025 Obras');
    expect(row.awarded_amount).toBe(1870406.94);
    expect(row.award_amount_type).toBe('total');
    expect(row.urgency).toBe('1');
    db.close();
  });
});
