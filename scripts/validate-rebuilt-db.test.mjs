import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateDatabase } from './validate-rebuilt-db.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

function runValidator(dbPath) {
  const result = validateDatabase(dbPath);
  return { ...result, exitCode: result.ok ? 0 : 1 };
}

function buildCanonicalDb(filePath) {
  const db = new DatabaseSync(filePath);
  const { initDb } = require('./init-db');
  initDb(db);
  db.prepare(
    `INSERT INTO contracting_authorities(id, name, scope, active)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(id) DO NOTHING`
  ).run('auth-1', 'Test Authority', 'Directa Municipal');
  db.prepare(
    `INSERT INTO contracts(id, case_number, contracting_authority_id, contracting_authority_name, year, scope)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('ctr_abc123', '1/2024 Servicios', 'auth-1', 'ayuntamiento-junta-gobierno', 2024, 'Directa Municipal');
  db.exec(`CREATE VIRTUAL TABLE contracts_fts USING fts5(id UNINDEXED, case_number, object_description, contracting_authority_name, awardee, tokenize='porter unicode61')`);
  db.exec(`INSERT INTO contracts_fts(id, case_number, object_description, contracting_authority_name, awardee) SELECT id, case_number, object_description, contracting_authority_name, awardee FROM contracts`);
  db.close();
}

function buildLegacyDb(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    CREATE TABLE organismos_objetivo (
      id TEXT PRIMARY KEY,
      placsp_id TEXT UNIQUE,
      nombre TEXT NOT NULL,
      nif TEXT,
      dir3 TEXT,
      ambito TEXT,
      organo_agrupado TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      historical_names_json TEXT NOT NULL DEFAULT '[]'
    );
    INSERT INTO organismos_objetivo(id, nombre, ambito, activo, historical_names_json)
    VALUES ('auth-1', 'Test Authority', 'Directa Municipal', 1, '[]');

    CREATE TABLE contracts (
      id TEXT PRIMARY KEY,
      expediente TEXT,
      organismo_id TEXT,
      organo_agrupado TEXT,
      organo_contratante TEXT,
      nif_organo TEXT,
      dir3_organo TEXT,
      ciudad_organo TEXT,
      ano INTEGER,
      ambito TEXT
    );
    INSERT INTO contracts(id, expediente, organismo_id, organo_contratante, ano, ambito)
    VALUES ('ctr_abc123', '1/2024 Servicios', 'auth-1', 'Test Authority', 2024, 'Directa Municipal');

    CREATE TABLE modifications (
      id TEXT PRIMARY KEY,
      contract_id TEXT,
      case_number TEXT,
      documento_name TEXT
    );

    CREATE TABLE licitaciones_lotes (
      id TEXT PRIMARY KEY,
      licitacion_id TEXT NOT NULL,
      expediente TEXT,
      numero_lote TEXT NOT NULL
    );

    CREATE TABLE licitaciones_documentos (
      id TEXT PRIMARY KEY,
      licitacion_id TEXT NOT NULL,
      expediente TEXT,
      titulo TEXT NOT NULL,
      url TEXT NOT NULL
    );

    CREATE TABLE alertas (
      id TEXT PRIMARY KEY,
      tipo TEXT NOT NULL,
      severidad TEXT NOT NULL,
      score_escala REAL NOT NULL DEFAULT 0,
      confianza REAL NOT NULL,
      titulo TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      evidencia TEXT NOT NULL,
      factores_json TEXT NOT NULL,
      fecha_creacion TEXT NOT NULL
    );

    CREATE TABLE alertas_contratos (
      alerta_id TEXT NOT NULL,
      contrato_id TEXT NOT NULL,
      PRIMARY KEY (alerta_id, contrato_id)
    );
  `);
  db.close();
}

const tmpFiles = [];
const templateFiles = [];
let canonicalTemplatePath;
let legacyTemplatePath;

function createCanonicalDb(filePath) {
  fs.copyFileSync(canonicalTemplatePath, filePath);
}

function createLegacyDb(filePath) {
  fs.copyFileSync(legacyTemplatePath, filePath);
}

function makeTemplatePath(suffix) {
  return path.join(
    os.tmpdir(),
    'validate_test_template_' + process.pid + '_' + Math.random().toString(36).slice(2) + suffix + '.db'
  );
}

function makeTmpDb(suffix = '') {
  const p = path.join(os.tmpdir(), `validate_test_${Date.now()}_${Math.random().toString(36).slice(2)}${suffix}.db`);
  tmpFiles.push(p);
  return p;
}

beforeAll(() => {
  canonicalTemplatePath = makeTemplatePath('-canonical');
  legacyTemplatePath = makeTemplatePath('-legacy');
  templateFiles.push(canonicalTemplatePath, legacyTemplatePath);
  buildCanonicalDb(canonicalTemplatePath);
  buildLegacyDb(legacyTemplatePath);
});

afterEach(() => {
  for (const f of tmpFiles.splice(0)) {
    try { fs.unlinkSync(f); } catch { /* best-effort */ }
  }
});

afterAll(() => {
  for (const f of templateFiles.splice(0)) {
    try { fs.unlinkSync(f); } catch { /* best-effort */ }
  }
});

describe('validate-rebuilt-db (canonical schema enforcement)', () => {
  it('accepts a fully canonical database and exits 0 with ok:true', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const result = runValidator(dbPath);
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.issues).toEqual([]);
    expect(result.summary.contracts).toBe(1);
  });

  it('rejects a fully legacy database and exits 1 with ok:false', () => {
    const dbPath = makeTmpDb();
    createLegacyDb(dbPath);
    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.summary).toBeNull();
  });

  it('reports LEGACY_TABLE_ORGANISMOS_OBJETIVO_PRESENT when legacy table exists', () => {
    const dbPath = makeTmpDb();
    createLegacyDb(dbPath);
    const result = runValidator(dbPath);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('LEGACY_TABLE_ORGANISMOS_OBJETIVO_PRESENT');
  });

  it('reports MISSING_CONTRACTING_AUTHORITIES_TABLE when the canonical table is absent', () => {
    const dbPath = makeTmpDb();
    createLegacyDb(dbPath);
    const result = runValidator(dbPath);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('MISSING_CONTRACTING_AUTHORITIES_TABLE');
  });

  it('reports MISSING_CANONICAL_COLUMN for each missing canonical contracts column', () => {
    const dbPath = makeTmpDb();
    createLegacyDb(dbPath);
    const result = runValidator(dbPath);
    const missingCols = result.issues
      .filter((i) => i.code === 'MISSING_CANONICAL_COLUMN' && i.table === 'contracts')
      .map((i) => i.column);
    expect(missingCols).toContain('contracting_authority_id');
    expect(missingCols).toContain('contracting_authority_name');
    expect(missingCols).toContain('year');
    expect(missingCols).toContain('scope');
  });

  it('reports LEGACY_COLUMN_PRESENT for each legacy column in contracts', () => {
    const dbPath = makeTmpDb();
    createLegacyDb(dbPath);
    const result = runValidator(dbPath);
    const legacyCols = result.issues
      .filter((i) => i.code === 'LEGACY_COLUMN_PRESENT' && i.table === 'contracts')
      .map((i) => i.column);
    expect(legacyCols).toContain('ano');
    expect(legacyCols).toContain('ambito');
    expect(legacyCols).toContain('organismo_id');
    expect(legacyCols).toContain('organo_contratante');
    expect(legacyCols).toContain('organo_agrupado');
  });

  it('reports MISSING_CANONICAL_COLUMN(document_name) and LEGACY_COLUMN_PRESENT(documento_name) for modifications', () => {
    const dbPath = makeTmpDb();
    createLegacyDb(dbPath);
    const result = runValidator(dbPath);
    const codes = result.issues.map((i) => `${i.code}:${i.table}:${i.column}`);
    expect(codes).toContain('MISSING_CANONICAL_COLUMN:modifications:document_name');
    expect(codes).toContain('LEGACY_COLUMN_PRESENT:modifications:documento_name');
  });

  it('does NOT run business checks (summary is null) when schema issues are present', () => {
    const dbPath = makeTmpDb();
    createLegacyDb(dbPath);
    const result = runValidator(dbPath);
    expect(result.summary).toBeNull();
  });

  it('reports missing FTS table', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.exec('DROP TABLE contracts_fts');
    db.close();
    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'MISSING_CONTRACTS_FTS_TABLE' }));
  });

  it('reports FTS rows that do not match contracts', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.prepare('INSERT INTO contracts_fts(id, case_number) VALUES (?, ?)').run('ctr_missing', 'missing');
    db.close();
    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'FTS_CONTRACT_COUNT_MISMATCH' }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'ORPHAN_FTS_CONTRACT', contract_id: 'ctr_missing' }));
  });

  it('reports contracts missing from FTS', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.exec('DELETE FROM contracts_fts');
    db.close();
    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'MISSING_FTS_CONTRACT', contract_id: 'ctr_abc123' }));
  });

  it('reports contracts that reference a missing contracting authority', () => {
    const dbPath = makeTmpDb();
    const db = new DatabaseSync(dbPath);
    const { initDb } = require('./init-db');
    initDb(db);
    db.prepare('INSERT INTO contracts(id, case_number, contracting_authority_id) VALUES (?, ?, ?)').run('ctr-orphan-auth', '1/2024', 'auth-missing');
    db.exec(`CREATE VIRTUAL TABLE contracts_fts USING fts5(id UNINDEXED, case_number, object_description, contracting_authority_name, awardee, tokenize='porter unicode61')`);
    db.exec('INSERT INTO contracts_fts(id, case_number, object_description, contracting_authority_name, awardee) SELECT id, case_number, object_description, contracting_authority_name, awardee FROM contracts');
    db.close();
    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'ORPHAN_CONTRACTING_AUTHORITY_REFERENCE', id: 'ctr-orphan-auth', contracting_authority_id: 'auth-missing' }));
  });

  it('reports company resolution rows that reference a missing corporate group', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.prepare('INSERT INTO company_resolution(raw_nif, raw_name, group_id) VALUES (?, ?, ?)').run('B12345678', 'Test Company', 'group-missing');
    db.close();
    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'ORPHAN_COMPANY_GROUP_REFERENCE', group_id: 'group-missing' }));
  });

  it('reports CONTRACTS_WITHOUT_CONTRACTING_AUTHORITY_ID when FK column is NULL', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.exec(`INSERT INTO contracts(id, case_number, contracting_authority_id, contracting_authority_name, year, scope)
       VALUES ('ctr_noid', '99/2024', NULL, 'Unknown', 2024, 'Directa Municipal')`);
    db.close();
    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('CONTRACTS_WITHOUT_CONTRACTING_AUTHORITY_ID');
  });

  it('reports NO_ACTIVE_CONTRACTING_AUTHORITIES when all authorities are inactive', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.exec(`UPDATE contracting_authorities SET active = 0`);
    db.close();
    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('NO_ACTIVE_CONTRACTING_AUTHORITIES');
  });

  it('detects contract duplicates after normalizing case-number whitespace', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.prepare(
      `INSERT INTO contracts(id, case_number, contracting_authority_id, contracting_authority_name, year, scope)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('ctr_abc456', ' 1/2024   Servicios ', 'auth-1', 'ayuntamiento-junta-gobierno', 2024, 'Directa Municipal');
    db.close();

    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'DUPLICATE_CONTRACT_LOGICAL_KEY',
      contracting_authority_id: 'auth-1',
      contract_ids: ['ctr_abc123', 'ctr_abc456'],
      n: 2,
    }));
  });

  it('detects alert references whose alert record is missing', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.prepare(
      `INSERT INTO alert_contracts(alert_id, contract_id) VALUES (?, ?)`
    ).run('alert-missing', 'ctr_abc123');
    db.close();

    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'ORPHAN_ALERT_REFERENCE',
      alert_id: 'alert-missing',
    }));
  });

  it('detects orphan contract-level awards', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.prepare(
      'INSERT INTO contract_awards(id, contract_id, case_number, award_index) VALUES (?, ?, ?, ?)'
    ).run('orphan-contract-award', 'missing-contract', '1/2024 Servicios', 1);
    db.close();

    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'ORPHAN_CONTRACT_AWARD',
      contract_id: 'missing-contract',
      case_number: '1/2024 Servicios',
      award_index: 1,
    }));
  });

  it('detects orphan verified contract metadata', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.prepare(
      'INSERT INTO verified_contract_metadata(legacy_id, contract_id, explicit_end_date, source) VALUES (?, ?, ?, ?)'
    ).run('legacy-metadata', 'missing-contract', '2027-01-09', 'test');
    db.close();

    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'ORPHAN_VERIFIED_CONTRACT_METADATA',
      legacy_id: 'legacy-metadata',
      contract_id: 'missing-contract',
    }));
  });

  it('detects orphan lot awards', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.prepare(
      'INSERT INTO lot_awards(id, contract_id, case_number, lot_number, award_index) VALUES (?, ?, ?, ?, ?)'
    ).run('orphan-award', 'missing-contract', '1/2024 Servicios', '1', 0);
    db.close();

    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'ORPHAN_LOT_AWARD',
      contract_id: 'missing-contract',
      case_number: '1/2024 Servicios',
      lot_number: '1',
      award_index: 0,
    }));
  });

  it.each([
    ['contract_lots', 'ORPHAN_LOT_CASE_NUMBER_MISMATCH', `INSERT INTO contract_lots (id, contract_id, case_number, lot_number) VALUES ('lot-mismatch', 'ctr_abc123', '9/2024 Otros servicios', '1')`],
    ['contract_awards', 'ORPHAN_CONTRACT_AWARD_CASE_NUMBER_MISMATCH', `INSERT INTO contract_awards (id, contract_id, case_number, award_index) VALUES ('award-mismatch', 'ctr_abc123', '9/2024 Otros servicios', 1)`],
    ['modifications', 'ORPHAN_MODIFICATION_CASE_NUMBER_MISMATCH', `INSERT INTO modifications (id, contract_id, case_number, modification_number) VALUES ('mod-mismatch', 'ctr_abc123', '9/2024 Otros servicios', 1)`],
    ['contract_documents', 'ORPHAN_DOCUMENT_CASE_NUMBER_MISMATCH', `INSERT INTO contract_documents (id, contract_id, case_number, title, source_url) VALUES ('doc-mismatch', 'ctr_abc123', '9/2024 Otros servicios', 'Documento', 'https://example.test/doc')`],
  ])('detects denormalized case-number mismatches in %s', (_table, code, insertSql) => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.exec(insertSql);
    db.close();

    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code,
      contract_id: 'ctr_abc123',
      child_case_number: '9/2024 Otros servicios',
      parent_case_number: '1/2024 Servicios',
    }));
  });

  it('detects company resolution rows with missing canonical identity fields', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.prepare('INSERT INTO company_resolution(raw_nif, raw_name, canonical_id, canonical_name) VALUES (?, ?, ?, ?)').run('B12345678', 'Test Company', '', '');
    db.close();

    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'INVALID_COMPANY_RESOLUTION_CANONICAL_FIELDS',
      raw_nif: 'B12345678',
      raw_name: 'Test Company',
    }));
  });

  it('detects company group names that diverge from the corporate group catalog', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.prepare('INSERT INTO corporate_groups(group_id, group_name, associated_nifs_json) VALUES (?, ?, ?)').run('group-1', 'Canonical Group', '[]');
    db.prepare('INSERT INTO company_resolution(raw_nif, raw_name, group_id, group_name) VALUES (?, ?, ?, ?)').run('B12345678', 'Test Company', 'group-1', 'Stale Group Name');
    db.close();

    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'COMPANY_GROUP_NAME_MISMATCH',
      group_id: 'group-1',
      group_name: 'Stale Group Name',
      canonical_group_name: 'Canonical Group',
    }));
  });

  it('ignores partial lot_awards when validating parent awarded amount coherence', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);

    db.prepare(`
      UPDATE contracts
      SET is_lotized = 1,
          lot_count = 2,
          lots_source = 'CODICE_PROJECT_LOT',
          awarded_amount = 800,
          award_amount_type = 'total'
      WHERE id = 'ctr_abc123'
    `).run();
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, awarded_amount, lot_status
      ) VALUES
        ('lot-1', 'ctr_abc123', '1/2024 Servicios', '1', 500, 'Adjudicado'),
        ('lot-2', 'ctr_abc123', '1/2024 Servicios', '2', 300, 'Adjudicado')
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awarded_amount, result_state
      ) VALUES ('award-1', 'ctr_abc123', '1/2024 Servicios', '1', 0, 500, 'Adjudicado')
    `).run();
    db.close();

    const result = runValidator(dbPath);
    expect(result.issues.some((issue) => issue.code === 'PARENT_AWARD_MISMATCH')).toBe(false);
  });

  it('excludes cancelled lots from parent award coherence and flags stale lot amounts', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);

    db.exec(`UPDATE contracts
      SET is_lotized = 1, lot_count = 3, lots_source = 'CODICE_PROJECT_LOT',
          awarded_amount = 500, award_amount_type = 'total'
      WHERE id = 'ctr_abc123'`);
    db.exec(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, awarded_amount, lot_status
    ) VALUES
      ('lot-valid', 'ctr_abc123', '1/2024 Servicios', '1', 500, 'Adjudicado'),
      ('lot-cancelled', 'ctr_abc123', '1/2024 Servicios', '2', 300, 'Cancelled'),
      ('lot-renounced', 'ctr_abc123', '1/2024 Servicios', '3', 200, 'Renunciado')`);
    db.exec(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awarded_amount, result_state
    ) VALUES ('award-cancelled', 'ctr_abc123', '1/2024 Servicios', '2', 0, 300, 'Adjudicado')`);
    db.close();

    const result = runValidator(dbPath);
    expect(result.issues.some((issue) => issue.code === 'PARENT_AWARD_MISMATCH')).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'INVALID_LOT_STATUS_HAS_AWARD',
      id: 'ctr_abc123',
      lot_number: '2',
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'INVALID_LOT_STATUS_HAS_AWARD',
      id: 'ctr_abc123',
      lot_number: '3',
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'INVALID_LOT_STATUS_HAS_STRUCTURED_AWARD',
      id: 'ctr_abc123',
      lot_number: '2',
      awarded_amount: 300,
    }));
  });

  it('ignores structured residual awards when every legacy lot is terminal', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);

    db.exec(`UPDATE contracts
      SET is_lotized = 1, lot_count = 1, lots_source = 'CODICE_PROJECT_LOT',
          awarded_amount = 500, award_amount_type = 'total'
      WHERE id = 'ctr_abc123'`);
    db.exec(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, awarded_amount, lot_status
    ) VALUES ('lot-cancelled-only', 'ctr_abc123', '1/2024 Servicios', '1', NULL, 'Cancelled')`);
    db.exec(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awarded_amount, result_state
    ) VALUES ('award-cancelled-only', 'ctr_abc123', '1/2024 Servicios', '1', 0, 500, 'Adjudicado')`);
    db.close();

    const result = runValidator(dbPath);
    expect(result.issues.some((issue) => issue.code === 'PARENT_AWARD_MISMATCH')).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'INVALID_LOT_STATUS_HAS_STRUCTURED_AWARD',
      id: 'ctr_abc123',
      lot_number: '1',
      awarded_amount: 500,
    }));
  });

  it('detects parent awarded amount mismatch when lot awards fully cover lots', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.exec(`UPDATE contracts SET is_lotized = 1, lot_count = 2, lots_source = 'CODICE_PROJECT_LOT', awarded_amount = 800, award_amount_type = 'total' WHERE id = 'ctr_abc123'`);
    db.exec(`INSERT INTO contract_lots (id, contract_id, case_number, lot_number, lot_status) VALUES ('lot-1', 'ctr_abc123', '1/2024 Servicios', '1', 'Adjudicado'), ('lot-2', 'ctr_abc123', '1/2024 Servicios', '2', 'Adjudicado')`);
    db.exec(`INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awarded_amount, result_state) VALUES ('award-1', 'ctr_abc123', '1/2024 Servicios', '1', 0, 500, 'Adjudicado'), ('award-2', 'ctr_abc123', '1/2024 Servicios', '2', 0, 100, 'Adjudicado')`);
    db.close();
    const result = runValidator(dbPath);
    expect(result.issues.some((issue) => issue.code === 'PARENT_AWARD_MISMATCH')).toBe(true);
  });

  it('uses a complete per-lot award snapshot and sums multiple awardees within one lot', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);

    db.exec(`UPDATE contracts
      SET is_lotized = 1, lot_count = 2, lots_source = 'CODICE_PROJECT_LOT',
          awarded_amount = 800, award_amount_type = 'total'
      WHERE id = 'ctr_abc123'`);
    db.exec(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_status
    ) VALUES
      ('lot-1', 'ctr_abc123', '1/2024 Servicios', '1', 'Adjudicado'),
      ('lot-2', 'ctr_abc123', '1/2024 Servicios', '2', 'Adjudicado')`);
    db.exec(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awarded_amount, result_state
    ) VALUES
      ('award-1', 'ctr_abc123', '1/2024 Servicios', '1', 0, 200, 'Adjudicado'),
      ('award-2', 'ctr_abc123', '1/2024 Servicios', '1', 1, 300, 'Formalizado'),
      ('award-3', 'ctr_abc123', '1/2024 Servicios', '2', 0, 300, 'Adjudicado')`);
    db.close();

    const result = runValidator(dbPath);
    expect(result.issues.some((issue) => issue.code === 'PARENT_AWARD_MISMATCH')).toBe(false);
  });

  it('flags a parent mismatch when the award snapshot fully covers every lot with a different total', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);

    db.exec(`UPDATE contracts
      SET is_lotized = 1, lot_count = 2, lots_source = 'CODICE_PROJECT_LOT',
          awarded_amount = 900, award_amount_type = 'total'
      WHERE id = 'ctr_abc123'`);
    db.exec(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_status
    ) VALUES
      ('lot-1', 'ctr_abc123', '1/2024 Servicios', '1', 'Adjudicado'),
      ('lot-2', 'ctr_abc123', '1/2024 Servicios', '2', 'Adjudicado')`);
    db.exec(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awarded_amount, result_state
    ) VALUES
      ('award-1', 'ctr_abc123', '1/2024 Servicios', '1', 0, 200, 'Adjudicado'),
      ('award-2', 'ctr_abc123', '1/2024 Servicios', '1', 1, 300, 'Formalizado'),
      ('award-3', 'ctr_abc123', '1/2024 Servicios', '2', 0, 300, 'Adjudicado')`);
    db.close();

    const result = runValidator(dbPath);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'PARENT_AWARD_MISMATCH',
      id: 'ctr_abc123',
      parent_award: 900,
      lot_award: 800,
    }));
  });

  it('detects parent awarded amount mismatch when lot awards fully cover lots', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.exec(`UPDATE contracts SET is_lotized = 1, lot_count = 2, lots_source = 'CODICE_PROJECT_LOT', awarded_amount = 800, award_amount_type = 'total' WHERE id = 'ctr_abc123'`);
    db.exec(`INSERT INTO contract_lots (id, contract_id, case_number, lot_number, lot_status) VALUES ('lot-1', 'ctr_abc123', '1/2024 Servicios', '1', 'Adjudicado'), ('lot-2', 'ctr_abc123', '1/2024 Servicios', '2', 'Adjudicado')`);
    db.exec(`INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awarded_amount, result_state) VALUES ('award-1', 'ctr_abc123', '1/2024 Servicios', '1', 0, 500, 'Adjudicado'), ('award-2', 'ctr_abc123', '1/2024 Servicios', '2', 0, 100, 'Adjudicado')`);
    db.close();
    const result = runValidator(dbPath);
    expect(result.issues.some((issue) => issue.code === 'PARENT_AWARD_MISMATCH')).toBe(true);
  });

  it('flags positive lot awards whose lot number is absent from the structured lot set', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);

    db.exec(`UPDATE contracts
      SET is_lotized = 1, lot_count = 1, lots_source = 'CODICE_PROJECT_LOT',
          awarded_amount = 500, award_amount_type = 'total'
      WHERE id = 'ctr_abc123'`);
    db.exec(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, awarded_amount, lot_status
    ) VALUES ('lot-1', 'ctr_abc123', '1/2024 Servicios', '1', 500, 'Adjudicado')`);
    db.exec(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awarded_amount, result_state
    ) VALUES ('award-unknown-lot', 'ctr_abc123', '1/2024 Servicios', '99', 0, 250, 'Adjudicado')`);
    db.close();

    const result = runValidator(dbPath);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'ORPHAN_LOT_AWARD_AMOUNT',
      contract_id: 'ctr_abc123',
      lot_number: '99',
      orphaned_award_amount: 250,
    }));
  });

  it('detects lot duplicates after the same normalization used by the rebuild pipeline', () => {
    const dbPath = makeTmpDb();
    createCanonicalDb(dbPath);
    const db = new DatabaseSync(dbPath);
    db.exec(`
      INSERT INTO contract_lots (id, contract_id, case_number, lot_number)
      VALUES
        ('lot_1', 'ctr_abc123', '1/2024 Servicios', ' 1 '),
        ('lot_2', 'ctr_abc123', '1/2024 Servicios', '1');
    `);
    db.close();

    const result = runValidator(dbPath);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'DUPLICATE_LOT_KEY',
      lot_number: ' 1 ',
      n: 2,
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'DUPLICATE_LOT_NUMBER',
      lot_number: ' 1 ',
      n: 2,
    }));
  });
});

describe('validateDatabase connection lifecycle', () => {
  it('closes its SQLite connection when an early schema check returns issues', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-rebuilt-db-lifecycle-'));
    const dbPath = path.join(dir, 'partial.db');
    const db = new DatabaseSync(dbPath);
    try {
      db.exec('CREATE TABLE unrelated (id TEXT PRIMARY KEY);');
    } finally {
      db.close();
    }

    const closeSpy = vi.spyOn(DatabaseSync.prototype, 'close');
    try {
      const result = validateDatabase(dbPath);
      expect(result.ok).toBe(false);
      expect(result.issues.some((issue) => issue.code === 'MISSING_CANONICAL_TABLE')).toBe(true);
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      closeSpy.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('closes its SQLite connection when schema inspection throws', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-rebuilt-db-error-'));
    const dbPath = path.join(dir, 'unreadable-schema.db');
    fs.writeFileSync(dbPath, 'not a SQLite database');

    const closeSpy = vi.spyOn(DatabaseSync.prototype, 'close');
    try {
      expect(() => validateDatabase(dbPath)).toThrow();
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      closeSpy.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
