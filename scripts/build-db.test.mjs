import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildLotesBajaQuery, buildBajasRowsQuery, main } = require('./build-db.js');
const { initDb } = require('./init-db.js');

describe('build-db minor-contract alert materialization', () => {
  it('excludes terminal standalone minor contracts from accumulated alerts', async () => {
    const db = new DatabaseSync(':memory:');
    try {
      initDb(db);
      db.prepare(`
        INSERT INTO contracts (
          id, contracting_authority_id, contracting_authority_name, procedure, status,
          awardee, awardee_nif, contract_type, object_description, awarded_amount,
          award_amount_type, award_date, source_url, scope
        ) VALUES (?, 'authority-1', 'Ayuntamiento de prueba', 'Contrato menor', ?,
          'Empresa recurrente', 'B11111111', 'Servicios', 'Mantenimiento de red municipal',
          8000, 'total', ?, 'https://example.test/contract', 'Directa Municipal')
      `).run('cancelled-minor', 'Cancelled', '2024-04-01');
      db.prepare(`
        INSERT INTO contracts (
          id, contracting_authority_id, contracting_authority_name, procedure, status,
          awardee, awardee_nif, contract_type, object_description, awarded_amount,
          award_amount_type, award_date, source_url, scope
        ) VALUES (?, 'authority-1', 'Ayuntamiento de prueba', 'Contrato menor', ?,
          'Empresa recurrente', 'B11111111', 'Servicios', 'Mantenimiento de red municipal',
          8000, 'total', ?, 'https://example.test/contract', 'Directa Municipal')
      `).run('active-minor', 'Adjudicada', '2024-05-01');

      await main({ db, argv: ['node', 'build-db.js', '--skip-vacuum'] });

      const alertCount = db.prepare(`
        SELECT count(*) AS count
        FROM alerts alert
        JOIN alert_contracts link ON link.alert_id = alert.id
        WHERE alert.type = 'CONTRATOS_RELACIONADOS'
      `).get().count;
      expect(alertCount).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe('build-db single-offer alert materialization', () => {
  it('requires complete single-offer evidence across every awarded lot', async () => {
    const db = new DatabaseSync(':memory:');
    try {
      initDb(db);
      const insertContract = db.prepare(`
        INSERT INTO contracts (
          id, procedure, status, awardee, offer_count, amount_excl_vat,
          is_lotized, lot_count, year, dataset, source_url
        ) VALUES (?, 'Abierto', 'Adjudicada', 'Varios adjudicatarios', 0,
          20000, 1, 2, 2026, 'licitaciones', 'https://example.test/contract')
      `);
      insertContract.run('partial-mixed-offers');
      insertContract.run('partial-unknown-offers');
      insertContract.run('complete-single-offers');
      insertContract.run('structured-partial-offers');
      insertContract.run('structured-complete-offers');
      insertContract.run('parent-single-offer');
      db.prepare("UPDATE contracts SET offer_count = 1 WHERE id = 'partial-mixed-offers'").run();
      db.prepare("UPDATE contracts SET offer_count = 1, awardee = 'Empresa directa', awarded_amount = 20000 WHERE id = 'parent-single-offer'").run();

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_status, awardee, offer_count, awarded_amount
        ) VALUES
          ('mixed-lot-1', 'partial-mixed-offers', '1', 'Adjudicado', 'Empresa A', 1, 8000),
          ('mixed-lot-2', 'partial-mixed-offers', '2', 'Adjudicado', 'Empresa B', 2, 9000),
          ('unknown-lot-1', 'partial-unknown-offers', '1', 'Adjudicado', 'Empresa A', 1, 8000),
          ('unknown-lot-2', 'partial-unknown-offers', '2', 'Adjudicado', 'Empresa B', NULL, 9000),
          ('complete-lot-1', 'complete-single-offers', '1', 'Adjudicado', 'Empresa A', 1, 8000),
          ('complete-lot-2', 'complete-single-offers', '2', 'Adjudicado', 'Empresa B', 1, 9000)
      `).run();
      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, offer_count, awarded_amount, result_state
        ) VALUES
          ('structured-partial-1', 'structured-partial-offers', 'CASE/1', '1', 0, 'Empresa A', 1, 8000, 'Adjudicado'),
          ('structured-partial-2', 'structured-partial-offers', 'CASE/1', '2', 0, 'Empresa B', 2, 9000, 'Adjudicado'),
          ('structured-complete-1', 'structured-complete-offers', 'CASE/2', '1', 0, 'Empresa A', 1, 8000, 'Adjudicado'),
          ('structured-complete-2', 'structured-complete-offers', 'CASE/2', '2', 0, 'Empresa B', 1, 9000, 'Adjudicado')
      `).run();

      await main({ db, argv: ['node', 'build-db.js', '--skip-vacuum'] });

      const alertContractIds = db.prepare(`
        SELECT link.contract_id
        FROM alerts alert
        JOIN alert_contracts link ON link.alert_id = alert.id
        WHERE alert.type = 'OFERTA_UNICA'
        ORDER BY link.contract_id
      `).all().map((row) => row.contract_id);
      expect(alertContractIds).toEqual(['parent-single-offer']);
    } finally {
      db.close();
    }
  });
});

describe('build-db low-bid candidate selection', () => {
  it('excludes terminal parent residuals but retains terminal parents with a valid awarded lot', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contracts (
          id TEXT PRIMARY KEY, status TEXT, offer_count INTEGER, awardee TEXT,
          source_url TEXT, case_number TEXT, object_description TEXT,
          contracting_authority_name TEXT, procedure TEXT,
          amount_excl_vat REAL, awarded_amount REAL, award_amount_type TEXT,
          economic_nature TEXT, contract_type TEXT, contract_type_code TEXT
        );
        CREATE TABLE contract_lots (
          id TEXT PRIMARY KEY, contract_id TEXT, lot_number TEXT, lot_status TEXT,
          awardee TEXT, awarded_amount REAL, budget_excl_vat REAL, amount_excl_vat REAL
        );
        CREATE TABLE lot_awards (
          id TEXT PRIMARY KEY, contract_id TEXT, lot_number TEXT,
          awardee TEXT, awarded_amount REAL, result_state TEXT
        );

        INSERT INTO contracts VALUES
          ('cancelled-parent', 'Cancelled', 1, 'Empresa residual', 'https://example.test/1', 'EXP/1',
           'Servicio cancelado', 'Ayuntamiento', 'Abierto', 10000, 6000, 'total', 'gasto', 'Servicios', '70'),
          ('mixed-deserted-parent', 'Desierta', 2, 'Varios adjudicatarios', 'https://example.test/2', 'EXP/2',
           'Servicio por lotes', 'Ayuntamiento', 'Abierto', 15000, NULL, 'total', 'gasto', 'Servicios', '70'),
          ('cancelled-parent-terminal-lot', 'Cancelled', 1, 'Empresa residual', 'https://example.test/3', 'EXP/3',
           'Lote cancelado', 'Ayuntamiento', 'Abierto', 2000, 1000, 'total', 'gasto', 'Servicios', '70'),
          ('awarded-english-parent', 'Awarded', 1, 'Empresa válida', 'https://example.test/4', 'EXP/4',
           'Contrato adjudicado', 'Ayuntamiento', 'Abierto', 10000, 6000, 'total', 'gasto', 'Servicios', '70');

        INSERT INTO contract_lots
          (id, contract_id, lot_number, lot_status, awardee, awarded_amount, budget_excl_vat, amount_excl_vat)
        VALUES
          ('mixed-awarded-lot', 'mixed-deserted-parent', '1', 'Adjudicado', 'Empresa válida', 6000, 10000, 10000),
          ('mixed-deserted-lot', 'mixed-deserted-parent', '2', 'Desierto', 'Empresa residual', 5000, 5000, 5000),
          ('cancelled-lot', 'cancelled-parent-terminal-lot', '1', 'Cancelled', 'Empresa residual', 1000, 2000, 2000);

        INSERT INTO contract_lots
          (id, contract_id, lot_number, lot_status, awardee, awarded_amount, budget_excl_vat, amount_excl_vat)
        VALUES
          ('english-awarded-lot', 'awarded-english-parent', '1', 'Awarded', 'Empresa válida', 6000, 10000, 10000);

        INSERT INTO lot_awards
          (id, contract_id, lot_number, awardee, awarded_amount, result_state)
        VALUES
          ('mixed-valid-award', 'mixed-deserted-parent', '1', 'Empresa válida', 6000, 'AWARDED'),
          ('cancelled-residual-award', 'cancelled-parent-terminal-lot', '1', 'Empresa residual', 1000, 'AWARDED');
      `);

      const rows = db.prepare(buildBajasRowsQuery()).all();
      expect(rows.map((row) => row.id)).toEqual(['mixed-deserted-parent', 'awarded-english-parent']);
    } finally {
      db.close();
    }
  });
});

describe('build-db lot award bindings', () => {
  it('executes the low-bid lot summary using a single contract identifier', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contract_lots (
          id TEXT, contract_id TEXT, lot_number TEXT, lot_status TEXT,
          awardee TEXT, awarded_amount REAL, budget_excl_vat REAL, amount_excl_vat REAL
        );
        CREATE TABLE lot_awards (
          id TEXT, contract_id TEXT, lot_number TEXT, awarded_amount REAL, result_state TEXT
        );
        INSERT INTO contract_lots
          (id, contract_id, lot_number, lot_status, awardee, awarded_amount, budget_excl_vat, amount_excl_vat)
        VALUES ('legacy-1', 'C1', '1', 'Adjudicado', 'Empresa', 80, 100, 100);
        INSERT INTO lot_awards (id, contract_id, lot_number, awarded_amount, result_state)
        VALUES ('award-1', 'C1', '1', 80, 'AWARDED');
      `);

      const statement = db.prepare(buildLotesBajaQuery());
      const result = statement.get('C1');

      expect(result.lotes).toBe(1);
      expect(result.awarded_lotes).toBe(80);
      expect(result.pbl_lotes).toBe(100);
    } finally {
      db.close();
    }
  });
  it('requires complete structured award amounts for every eligible lot', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contract_lots (
          id TEXT, contract_id TEXT, lot_number TEXT, lot_status TEXT,
          awardee TEXT, awarded_amount REAL, budget_excl_vat REAL, amount_excl_vat REAL
        );
        CREATE TABLE lot_awards (
          id TEXT, contract_id TEXT, lot_number TEXT, awarded_amount REAL, result_state TEXT
        );
        INSERT INTO contract_lots
          (id, contract_id, lot_number, lot_status, awardee, awarded_amount, budget_excl_vat, amount_excl_vat)
        VALUES
          ('legacy-1', 'C1', '1', 'Adjudicado', 'Empresa A', 80, 100, 100),
          ('legacy-2', 'C1', '2', 'Adjudicado', 'Empresa B', NULL, 100, 100);
        INSERT INTO lot_awards (id, contract_id, lot_number, awarded_amount, result_state)
        VALUES ('award-1', 'C1', '1', 60, 'AWARDED');
      `);

      const statement = db.prepare(buildLotesBajaQuery());
      const partial = statement.get('C1');
      expect(partial.awarded_lotes).toBe(80);
      expect(partial.pbl_lotes).toBe(100);

      db.prepare('INSERT INTO lot_awards VALUES (?, ?, ?, ?, ?)').run(
        'award-2', 'C1', '2', 70, 'AWARDED',
      );
      const complete = statement.get('C1');
      expect(complete.awarded_lotes).toBe(130);
      expect(complete.pbl_lotes).toBe(200);
    } finally {
      db.close();
    }
  });

  it('excludes cancelled and annulled residual amounts from the low-bid lot summary', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contract_lots (
          id TEXT, contract_id TEXT, lot_number TEXT, lot_status TEXT,
          awardee TEXT, awarded_amount REAL, budget_excl_vat REAL, amount_excl_vat REAL
        );
        CREATE TABLE lot_awards (
          id TEXT, contract_id TEXT, lot_number TEXT, awarded_amount REAL, result_state TEXT
        );
        INSERT INTO contract_lots
          (id, contract_id, lot_number, lot_status, awardee, awarded_amount, budget_excl_vat, amount_excl_vat)
        VALUES
          ('cancelled-1', 'C1', '1', 'Cancelled', 'Empresa residual A', 50, 100, 100),
          ('annulled-2', 'C1', '2', 'Annulled', 'Empresa residual B', 50, 100, 100);
        INSERT INTO lot_awards (id, contract_id, lot_number, awarded_amount, result_state)
        VALUES
          ('award-cancelled', 'C1', '1', 50, 'AWARDED'),
          ('award-annulled', 'C1', '2', 50, 'AWARDED');
      `);

      const result = db.prepare(buildLotesBajaQuery()).get('C1');
      expect(result.lotes).toBe(2);
      expect(result.awarded_lotes).toBe(0);
      expect(result.pbl_lotes).toBe(0);
    } finally {
      db.close();
    }
  });

  it('uses structured lot amounts when no legacy lot snapshot exists', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contract_lots (
          id TEXT, contract_id TEXT, lot_number TEXT, lot_status TEXT,
          awardee TEXT, awarded_amount REAL, budget_excl_vat REAL, amount_excl_vat REAL
        );
        CREATE TABLE lot_awards (
          id TEXT, contract_id TEXT, lot_number TEXT, awarded_amount REAL, result_state TEXT
        );
        INSERT INTO lot_awards (id, contract_id, lot_number, awarded_amount, result_state)
        VALUES ('award-1', 'C1', '1', 80, 'AWARDED');
      `);

      const statement = db.prepare(buildLotesBajaQuery());
      const result = statement.get('C1');
      expect(result.lotes).toBe(0);
      expect(result.awarded_lotes).toBe(80);

      db.prepare('INSERT INTO lot_awards VALUES (?, ?, ?, ?, ?)').run(
        'award-2', 'C1', '2', null, 'AWARDED',
      );
      const incomplete = statement.get('C1');
      expect(incomplete.lotes).toBe(0);
      expect(incomplete.awarded_lotes).toBe(0);
    } finally {
      db.close();
    }
  });

  it('keeps unknown-parent minor lot awards in precomputed fraccionamiento candidates', () => {
    const source = fs.readFileSync(new URL('./build-db.js', import.meta.url), 'utf8');
    const start = source.indexOf('const menoresRows = db.prepare(`');
    const end = source.indexOf('const menoresUrlMap', start);
    const query = source.slice(start, end);

    expect((query.match(/IN \('total', 'desconocido'\)/g) || [])).toHaveLength(2);
    expect(query).toContain("AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total')");
  });

  it('uses complete amount coverage for precomputed single-offer alerts', () => {
    const source = fs.readFileSync(new URL('./build-db.js', import.meta.url), 'utf8');
    const start = source.indexOf('const unicasRows = db.prepare(`');
    const end = source.indexOf('let unicaAlertCount', start);
    const query = source.slice(start, end);

    expect(query).toContain("lotAwardsAmountCoverageSql('contracts')");
    expect(source).toContain('if (!(awardedLotes > 0 && pblLotes > 0)) continue;');
    expect(source).toContain('else if (awardedLotes > 0)');
  });

});
