import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

import { rebuildDatabase } from './rebuild-db.js';

const require = createRequire(import.meta.url);
const { buildNspLotCountQuery, buildNspLotsQuery, buildNspAwardeeEvidence, hasZeroDiscountWithComparableSingleAward, hasZeroDiscountWithCompleteLotCoverage, hasSingleOfferWithCompleteLotCoverage } = require('./build-db.js');
const { TERMINAL_NO_AWARD_LOT_STATUS_PATTERNS, isEligibleAwardLotStatus, eligibleAwardLotStatusSql, excludeAwardWhenLegacyLotTerminalSql } = require('../src/lib/lot-status.js');

const REBUILD_PATH = path.resolve(import.meta.dirname, './rebuild-db.js');
const WEEKLY_WORKFLOW_PATH = path.resolve(import.meta.dirname, '../.github/workflows/update-contracts.yml');
const SCHEDULED_WORKFLOWS = [
  WEEKLY_WORKFLOW_PATH,
  path.resolve(import.meta.dirname, '../.github/workflows/update-historical-contracts.yml'),
  path.resolve(import.meta.dirname, '../.github/workflows/update-subvenciones.yml'),
  path.resolve(import.meta.dirname, '../.github/workflows/maintenance-db.yml'),
];

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebuild-db-'));
  return {
    dir,
    dbPath: path.join(dir, 'licitaciones_alcazar.db'),
    backupPath: path.join(dir, 'licitaciones_alcazar.db.rebuild-backup'),
    lotCachePath: path.join(dir, 'lotes_cache.json'),
  };
}

describe('single-contract zero-discount comparability', () => {
  it('does not treat a unit price or unknown award amount as a zero-discount total', () => {
    const base = { amount_excl_vat: 1000, awarded_amount: 1000 };
    expect(hasZeroDiscountWithComparableSingleAward({ ...base, award_amount_type: 'unitario' })).toBe(false);
    expect(hasZeroDiscountWithComparableSingleAward({ ...base, award_amount_type: 'desconocido' })).toBe(false);
  });

  it('keeps the zero-discount signal for comparable total amounts', () => {
    expect(hasZeroDiscountWithComparableSingleAward({
      amount_excl_vat: 1000,
      awarded_amount: 1000,
      award_amount_type: 'total',
    })).toBe(true);
    expect(hasZeroDiscountWithComparableSingleAward({
      amount_excl_vat: 1000,
      awarded_amount: 1000,
      award_amount_type: null,
    })).toBe(true);
  });
  it('uses the comparability helper in the precomputed zero-discount signal', () => {
    const source = fs.readFileSync(new URL('./build-db.js', import.meta.url), 'utf8');
    expect(source).toContain('signalC = hasZeroDiscountWithComparableSingleAward(n);');
  });
});

describe('rebuild-db pipeline', () => {
  it('refuses partial-year rebuilds before touching the database or cache', () => {
    const fixture = createFixture();
    fs.writeFileSync(fixture.dbPath, 'known-good');
    fs.writeFileSync(fixture.lotCachePath, 'derived-cache');
    let calls = 0;

    try {
      expect(() => rebuildDatabase({
        ...fixture,
        years: ['--year=2026'],
        runStep: () => { calls++; },
      })).toThrow('La reconstrucción limpia debe abarcar todos los años');

      expect(fs.readFileSync(fixture.dbPath, 'utf8')).toBe('known-good');
      expect(fs.readFileSync(fixture.lotCachePath, 'utf8')).toBe('derived-cache');
      expect(fs.existsSync(fixture.backupPath)).toBe(false);
      expect(calls).toBe(0);
    } finally {
      fs.rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('restores the previous database when a rebuild step fails', () => {
    const fixture = createFixture();
    fs.writeFileSync(fixture.dbPath, 'known-good');
    fs.writeFileSync(fixture.lotCachePath, 'derived-cache');

    try {
      expect(() => rebuildDatabase({
        ...fixture,
        runStep: (script) => {
          if (script === 'init-db.js') fs.writeFileSync(fixture.dbPath, 'partial-rebuild');
          if (script === 'sync.js') throw new Error('forced rebuild failure');
        },
      })).toThrow('forced rebuild failure');

      expect(fs.readFileSync(fixture.dbPath, 'utf8')).toBe('known-good');
      expect(fs.existsSync(fixture.backupPath)).toBe(false);
      expect(fs.existsSync(fixture.lotCachePath)).toBe(false);
    } finally {
      fs.rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('removes a partial database when there was no previous database', () => {
    const fixture = createFixture();

    try {
      expect(() => rebuildDatabase({
        ...fixture,
        runStep: (script) => {
          if (script === 'init-db.js') fs.writeFileSync(fixture.dbPath, 'partial-rebuild');
          if (script === 'sync.js') throw new Error('forced rebuild failure');
        },
      })).toThrow('forced rebuild failure');

      expect(fs.existsSync(fixture.dbPath)).toBe(false);
      expect(fs.existsSync(fixture.backupPath)).toBe(false);
    } finally {
      fs.rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('runs the TypeScript resolution script with Node strip-types support', () => {
    const source = fs.readFileSync(REBUILD_PATH, 'utf8');
    const packageSource = fs.readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf8');

    expect(source).toContain("runStep('refresh-resolution.js');");
    expect(packageSource).toContain('node --experimental-strip-types scripts/refresh-resolution.js');
  });

  it('keeps TypeScript resolution imports explicit for Node ESM', () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, '../src/lib/db-corporate.ts'),
      'utf8'
    );

    expect(source).toMatch(/from ['"]\.\/corporate\.ts['"];?/);
    expect(source).toMatch(/from ['"]\.\/format\.ts['"];?/);
    expect(source).not.toMatch(/^\s*import\s+(?!type\s)[^;\n]*?from ['"]\.\/corporate['"];?/m);
    expect(source).not.toMatch(/^\s*import\s+(?!type\s)[^;\n]*?from ['"]\.\/format['"];?/m);
  });

  it('applies verified contract seeds after syncing official feeds', () => {
    const source = fs.readFileSync(REBUILD_PATH, 'utf8');
    const syncIndex = source.indexOf("runStep('sync.js'");
    const seedsIndex = source.indexOf("runStep('migrate-verified-contract-seeds.js'");
    const repairsIndex = source.indexOf("runStep('migrate-verified-repairs.js'");

    expect(syncIndex).toBeGreaterThanOrEqual(0);
    expect(seedsIndex).toBeGreaterThan(syncIndex);
    expect(repairsIndex).toBeGreaterThan(seedsIndex);
  });

  it('can import build-db without opening or rebuilding the checked-in database', async () => {
    const buildPath = path.resolve(import.meta.dirname, './build-db.js');
    const source = fs.readFileSync(buildPath, 'utf8');

    expect(source).toContain('if (require.main === module)');
    expect(source).toMatch(/module\.exports\s*=\s*\{[^}]*\bmain\b[^}]*\bbuildNspLotsQuery\b[^}]*\}/s);
    expect(source).not.toMatch(/\nmain\(\)\.catch\(err =>/);
  });

  it('closes the database it opens when the build fails', async () => {
    const buildPath = path.resolve(import.meta.dirname, './build-db.js');
    const source = fs.readFileSync(buildPath, 'utf8');
    const openIndex = source.indexOf('const db = suppliedDb || new DatabaseSync(dbPath);');
    const tryIndex = source.indexOf('try {', openIndex);
    const finallyIndex = source.indexOf('} finally {', tryIndex);
    const closeIndex = source.indexOf('if (!suppliedDb) db.close();', finallyIndex);

    expect(openIndex).toBeGreaterThanOrEqual(0);
    expect(tryIndex).toBeGreaterThan(openIndex);
    expect(finallyIndex).toBeGreaterThan(tryIndex);
    expect(closeIndex).toBeGreaterThan(finallyIndex);
  });

  it('starts the derived rebuild transaction before destructive FTS and alert resets', async () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, './build-db.js'),
      'utf8'
    );

    const transactionIndex = source.indexOf("db.exec('BEGIN TRANSACTION;')");
    const ftsDeleteIndex = source.indexOf('DELETE FROM contracts_fts;');
    const alertsDropIndex = source.indexOf('DROP TABLE IF EXISTS alerts;');
    const legacyInnerTransactionIndex = source.indexOf(
      "db.exec('BEGIN TRANSACTION;');\n  for (let idx = 0; idx < casos.length; idx++)"
    );

    expect(transactionIndex).toBeGreaterThanOrEqual(0);
    expect(transactionIndex).toBeLessThan(ftsDeleteIndex);
    expect(transactionIndex).toBeLessThan(alertsDropIndex);
    expect(legacyInnerTransactionIndex).toBe(-1);
  });

  it('classifies document-backed award amounts before rebuilding audit data in the weekly workflow', () => {
    const source = fs.readFileSync(WEEKLY_WORKFLOW_PATH, 'utf8');
    const documentsIndex = source.indexOf('pnpm run sync-documentos');
    const classifyIndex = source.indexOf('scripts/classify-award-amount-documents.js');
    const optimizeIndex = source.indexOf('pnpm run optimize-db');

    expect(documentsIndex).toBeGreaterThanOrEqual(0);
    expect(classifyIndex).toBeGreaterThan(documentsIndex);
    expect(optimizeIndex).toBeGreaterThan(classifyIndex);
  });

  it('applies pending DB schema migrations before scheduled database work', () => {
    for (const workflowPath of SCHEDULED_WORKFLOWS) {
      const source = fs.readFileSync(workflowPath, 'utf8');
      const migrationIndex = source.indexOf('pnpm run migrate-db');
      const metadataIndex = source.indexOf('pnpm run migrate-verified-contract-metadata');
      const firstWorkIndex = Math.min(
        ...['pnpm run sync ', 'pnpm run sync-subvenciones', 'pnpm run vacuum-db'].map((needle) => {
          const index = source.indexOf(needle);
          return index >= 0 ? index : Number.POSITIVE_INFINITY;
        })
      );

      expect(migrationIndex).toBeGreaterThanOrEqual(0);
      expect(migrationIndex).toBeLessThan(firstWorkIndex);

      if (workflowPath.endsWith('maintenance-db.yml')) {
        const initIndex = source.indexOf('pnpm run init-db');
        const vacuumIndex = source.indexOf('pnpm run vacuum-db');
        const validateIndex = source.indexOf('pnpm run validate-db');

        expect(initIndex).toBeGreaterThan(migrationIndex);
        expect(initIndex).toBeLessThan(vacuumIndex);
        expect(vacuumIndex).toBeLessThan(validateIndex);
      }

      // migrate-db does not currently create verified_contract_metadata.
      // Workflows that call the canonical DB validator must apply its dedicated
      // migration before data changes and validation.
      if (workflowPath.endsWith('update-subvenciones.yml') ||
          workflowPath.endsWith('maintenance-db.yml')) {
        expect(metadataIndex).toBeGreaterThan(migrationIndex);
        expect(metadataIndex).toBeLessThan(firstWorkIndex);
      }
    }
  });


  it('shares terminal lot status rules across sync and generated database queries', () => {
    const terminalStatuses = [
      'Desierto', 'Deserted', 'Anulada', 'Annulled', 'Cancelado', 'Cancelled',
      'Renunciado', 'Renounced', 'Desestimado', 'Rejected', 'Desistido',
      'Retirado', 'Withdrawn',
    ];

    expect(TERMINAL_NO_AWARD_LOT_STATUS_PATTERNS.length).toBeGreaterThan(0);
    for (const status of terminalStatuses) {
      expect(isEligibleAwardLotStatus(status)).toBe(false);
    }
    for (const status of ['Adjudicado', 'Formalizada', 'Resuelta', '', null]) {
      expect(isEligibleAwardLotStatus(status)).toBe(true);
    }

    expect(eligibleAwardLotStatusSql('lot')).toContain("lower(coalesce(lot.lot_status, ''))");
    expect(eligibleAwardLotStatusSql()).toContain("lower(coalesce(lot_status, ''))");

    const source = fs.readFileSync(path.resolve(import.meta.dirname, './build-db.js'), 'utf8');
    expect(fs.readFileSync(path.resolve(import.meta.dirname, '../src/lib/lot-status.js'), 'utf8')).toContain('legacy_lot.lot_number =');
    expect(source).toContain("excludeAwardWhenLegacyLotTerminalSql('award')");
    expect(excludeAwardWhenLegacyLotTerminalSql('award')).toContain('legacy_lot.lot_number = award.lot_number');
    expect(source).toContain("isEligibleAwardLotStatus(l.lot_status)");
    expect(source).not.toContain("NOT LIKE '%anulad%'");
  });


  it('counts distinct NSP lots even when awardee data is missing', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contract_lots (contract_id TEXT, lot_number TEXT);
        CREATE TABLE lot_awards (contract_id TEXT, lot_number TEXT);
      `);
      db.prepare('INSERT INTO contract_lots VALUES (?, ?)').run('contract-1', '1');
      db.prepare('INSERT INTO contract_lots VALUES (?, ?)').run('contract-1', '2');
      db.prepare('INSERT INTO lot_awards VALUES (?, ?)').run('contract-1', '2');
      db.prepare('INSERT INTO contract_lots VALUES (?, ?)').run('contract-2', '1');

      const countLots = db.prepare(buildNspLotCountQuery());
      expect(countLots.get('contract-1', 'contract-1').lot_count).toBe(2);
      expect(countLots.get('contract-2', 'contract-2').lot_count).toBe(1);
      expect(countLots.get('missing-contract', 'missing-contract').lot_count).toBe(0);
    } finally {
      db.close();
    }
  });

  it('does not flag zero discount when an eligible lot lacks an award amount', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contract_lots (
          id TEXT, contract_id TEXT, lot_number TEXT, lot_name TEXT,
          awarded_amount REAL, amount_excl_vat REAL, budget_excl_vat REAL,
          lot_status TEXT, awardee TEXT, awardee_nif TEXT, offer_count INTEGER
        );
        CREATE TABLE lot_awards (
          id TEXT, contract_id TEXT, lot_number TEXT, awarded_amount REAL,
          result_state TEXT, awardee TEXT, awardee_nif TEXT, offer_count INTEGER
        );
      `);

      const insertLot = db.prepare('INSERT INTO contract_lots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      insertLot.run('lot-1', 'C1', '1', 'Lote 1', 100, 100, 100, 'Adjudicado', 'Empresa A', 'B00000001', 2);
      insertLot.run('lot-2', 'C1', '2', 'Lote 2', 200, 200, 200, 'Adjudicado', 'Empresa C', 'B00000003', 2);

      const insertAward = db.prepare('INSERT INTO lot_awards VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      insertAward.run('award-1', 'C1', '1', 40, 'AWARDED', 'Empresa A', 'B00000001', 2);
      insertAward.run('award-2', 'C1', '1', 60, 'AWARDED', 'Empresa B', 'B00000002', 2);
      insertAward.run('award-3', 'C1', '2', null, 'AWARDED', 'Empresa C', 'B00000003', 2);

      const query = db.prepare(buildNspLotsQuery());
      const partialCoverage = query.all('C1', 'C1');
      expect(partialCoverage).toHaveLength(3);
      expect(hasZeroDiscountWithCompleteLotCoverage(partialCoverage)).toBe(false);

      db.prepare("UPDATE lot_awards SET awarded_amount = 200 WHERE id = 'award-3'").run();
      const completeCoverage = query.all('C1', 'C1');
      expect(hasZeroDiscountWithCompleteLotCoverage(completeCoverage)).toBe(true);
    } finally {
      db.close();
    }
  });

  it('requires complete per-lot award coverage before flagging zero discount', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contract_lots (
          id TEXT, contract_id TEXT, lot_number TEXT, lot_name TEXT,
          awarded_amount REAL, amount_excl_vat REAL, budget_excl_vat REAL,
          lot_status TEXT, awardee TEXT, awardee_nif TEXT, offer_count INTEGER
        );
        CREATE TABLE lot_awards (
          id TEXT, contract_id TEXT, lot_number TEXT, awarded_amount REAL,
          result_state TEXT, awardee TEXT, awardee_nif TEXT, offer_count INTEGER
        );
      `);

      const insertLot = db.prepare('INSERT INTO contract_lots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      insertLot.run('lot-1', 'C1', '1', 'Lote 1', 100, 100, 100, 'Adjudicado', 'Empresa A', 'B00000001', 2);
      insertLot.run('lot-2', 'C1', '2', 'Lote 2', 200, 200, 200, 'Adjudicado', 'Empresa C', 'B00000003', 2);

      const insertAward = db.prepare('INSERT INTO lot_awards VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      insertAward.run('award-1', 'C1', '1', 40, 'AWARDED', 'Empresa A', 'B00000001', 2);
      insertAward.run('award-2', 'C1', '1', 60, 'AWARDED', 'Empresa B', 'B00000002', 2);
      insertAward.run('award-3', 'C1', '2', null, 'AWARDED', 'Empresa C', 'B00000003', 2);

      const query = db.prepare(buildNspLotsQuery());
      const partialCoverage = query.all('C1', 'C1');
      expect(partialCoverage).toHaveLength(3);
      expect(hasZeroDiscountWithCompleteLotCoverage(partialCoverage)).toBe(false);

      db.prepare("UPDATE lot_awards SET awarded_amount = 200 WHERE id = 'award-3'").run();
      const completeCoverage = query.all('C1', 'C1');
      expect(hasZeroDiscountWithCompleteLotCoverage(completeCoverage)).toBe(true);
    } finally {
      db.close();
    }
  });

  it('reports lot awardees instead of the parent awardee in multi-lot NSP evidence', () => {
    const contract = { awardee: 'Empresa del contrato padre' };
    const awardedLots = [
      { lot_number: '2', lot_status: 'AWARDED', awardee: 'Empresa B', awarded_amount: 200 },
      { lot_number: '1', lot_status: 'AWARDED', awardee: 'Empresa A', awarded_amount: 100 },
      { lot_number: '1', lot_status: 'AWARDED', awardee: 'Empresa A', awarded_amount: 100 },
      { lot_number: '3', lot_status: 'AWARDED', awardee: 'Empresa C', awarded_amount: null },
      { lot_number: '4', lot_status: 'CANCELLED', awardee: 'Empresa D', awarded_amount: 400 },
    ];

    expect(buildNspAwardeeEvidence(contract, awardedLots, true)).toBe(
      'Adjudicatarios por lote: lote 1: Empresa A; lote 2: Empresa B; lote 3: Empresa C',
    );
    expect(buildNspAwardeeEvidence(contract, awardedLots, true)).not.toContain('Empresa del contrato padre');
    expect(buildNspAwardeeEvidence(contract, [], true)).toBe(
      'Adjudicatarios por lote: No constan en los datos disponibles',
    );
    expect(buildNspAwardeeEvidence(contract, awardedLots, false)).toBe(
      'Adjudicatarios por lote: lote 1: Empresa A; lote 2: Empresa B; lote 3: Empresa C',
    );
    expect(buildNspAwardeeEvidence(contract, [], false)).toBe(
      'Adjudicatario: Empresa del contrato padre',
    );
    expect(buildNspAwardeeEvidence(contract, [
      { lot_number: '1', lot_status: 'AWARDED', awardee: 'Empresa A' },
      { lot_number: '1', lot_status: 'AWARDED', awardee: 'Empresa B' },
    ], false)).toBe(
      'Adjudicatarios por lote: lote 1: Empresa A, Empresa B',
    );
  });

  it('requires explicit single-offer data for every eligible lot', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contract_lots (
          id TEXT, contract_id TEXT, lot_number TEXT, lot_name TEXT,
          awarded_amount REAL, amount_excl_vat REAL, budget_excl_vat REAL,
          lot_status TEXT, awardee TEXT, awardee_nif TEXT, offer_count INTEGER
        );
        CREATE TABLE lot_awards (
          id TEXT, contract_id TEXT, lot_number TEXT, awarded_amount REAL,
          result_state TEXT, awardee TEXT, awardee_nif TEXT, offer_count INTEGER
        );
      `);

      const insertLot = db.prepare('INSERT INTO contract_lots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      insertLot.run('lot-1', 'C1', '1', 'Lote 1', 100, 100, 100, 'Adjudicado', 'Empresa A', 'B00000001', 1);
      insertLot.run('lot-2', 'C1', '2', 'Lote 2', 200, 200, 200, 'Adjudicado', 'Empresa B', 'B00000002', null);

      const query = db.prepare(buildNspLotsQuery());
      const partialCoverage = query.all('C1', 'C1');
      expect(partialCoverage).toHaveLength(2);
      expect(hasSingleOfferWithCompleteLotCoverage(partialCoverage)).toBe(false);

      db.prepare("UPDATE contract_lots SET offer_count = 1 WHERE id = 'lot-2'").run();
      const completeCoverage = query.all('C1', 'C1');
      expect(hasSingleOfferWithCompleteLotCoverage(completeCoverage)).toBe(true);
    } finally {
      db.close();
    }
  });

  it('falls back per uncovered lot in negotiated-procedure alerts', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contract_lots (
          id TEXT, contract_id TEXT, lot_number TEXT, lot_name TEXT,
          awarded_amount REAL, amount_excl_vat REAL, budget_excl_vat REAL,
          lot_status TEXT, awardee TEXT, awardee_nif TEXT, offer_count INTEGER
        );
        CREATE TABLE lot_awards (
          id TEXT, contract_id TEXT, lot_number TEXT, awarded_amount REAL,
          result_state TEXT, awardee TEXT, awardee_nif TEXT, offer_count INTEGER
        );
      `);

      const insertLot = db.prepare('INSERT INTO contract_lots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const insertAward = db.prepare('INSERT INTO lot_awards VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

      insertLot.run('legacy-1', 'C1', '1', 'Lote 1', 100, 120, 150, 'Adjudicado', 'Empresa antigua 1', 'B00000001', 2);
      insertLot.run('legacy-2', 'C1', '2', 'Lote 2', 200, 220, 250, 'Adjudicado', 'Empresa antigua 2', 'B00000002', 3);
      insertLot.run('legacy-3', 'C1', '3', 'Lote 3', 300, 320, 350, 'Cancelado', 'Empresa cancelada', 'B00000003', 1);
      insertLot.run('legacy-4', 'C1', '4', 'Lote 4', 400, 420, 450, 'Adjudicado', 'Empresa fallback provisional', 'B00000004', 2);

      insertAward.run('award-1', 'C1', '1', 110, 'AWARDED', 'Empresa estructurada', 'B11111111', 2);
      insertAward.run('award-3', 'C1', '3', 300, 'AWARDED', 'Empresa estructurada cancelada', 'B33333333', 1);
      insertAward.run('award-4', 'C1', '4', null, 'DESERTED_PROVISIONALLY', null, null, null);

      const rows = db.prepare(buildNspLotsQuery()).all('C1', 'C1');
      expect(rows).toHaveLength(3);
      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ lot_number: '1', awardee: 'Empresa estructurada', awarded_amount: 110 }),
        expect.objectContaining({ lot_number: '2', awardee: 'Empresa antigua 2', awarded_amount: 200 }),
        expect.objectContaining({ lot_number: '4', awardee: 'Empresa fallback provisional', awarded_amount: 400 }),
      ]));
      expect(rows).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ lot_number: '3' }),
      ]));
    } finally {
      db.close();
    }
  });

  it('rechaza padres lotizados sin filas de lotes', () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, './validate-rebuilt-db.js'),
      'utf8'
    );

    expect(source).toMatch(/issues\.push\(\{ code:\s*['"]LOTIZED_PARENT_WITHOUT_LOTS['"]/);
    expect(source).toContain('WHERE l.is_lotized = 1');
    expect(source).toContain('HAVING count(ll.id) = 0');
  });

  it('resuelve la acumulación de negociados también a través de adjudicatarios de lotes', () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, './build-db.js'), 'utf8');

    expect(source).toContain('OR EXISTS (');
    expect(source).toContain('FROM contract_lots ll');
    expect(source).toContain('ll.contract_id = c.id');
    expect(source).toContain("eligibleAwardLotStatusSql('ll')");
  });

  it('mantiene la migración CODICE alineada con los códigos de lotes desiertos', () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, './migrate-lotes-codice.js'),
      'utf8'
    );

    expect(source).toContain("/^\\d+$/.test");
    expect(source).toContain('isDesertedTenderResult(tr.resultCode, tr.resultCodeListUri)');
    expect(source).not.toContain("resultCode === '2' || resultCode === '3'");
  });

  it('incluye adjudicaciones secundarias de lot_awards en las alertas precalculadas', () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, './build-db.js'), 'utf8');

    const minorSourceIndex = source.indexOf('const menoresRows = db.prepare');
    const unicasIndex = source.indexOf('const unicasRows = db.prepare');
    const minorSource = source.slice(minorSourceIndex, unicasIndex);

    expect(minorSource).toContain('JOIN lot_awards la ON la.contract_id = l.id');
    expect(minorSource).toContain('la.awardee');
    expect(minorSource).toContain('la.awarded_amount');
    expect(minorSource).toContain('NOT EXISTS (');
    expect(minorSource).toContain('award_parent.contract_id = l.id');
    expect(minorSource).toContain('award_parent.lot_number = ll.lot_number');
    expect(minorSource).not.toContain('count(DISTINCT award_parent.lot_number)');
    expect(minorSource).not.toContain('count(DISTINCT lot_parent.lot_number)');
    expect(minorSource).toContain("excludeLegacyLotWhenStructuredTerminalResultSql('ll')");
    expect(minorSource).toContain('award_parent.awarded_amount IS NOT NULL');
    expect(minorSource).not.toContain('FROM lot_awards award_parent\n          WHERE award_parent.contract_id = l.id\n        )');


    const signalDIndex = source.indexOf('const lotConditions = []');
    const signalDSource = source.slice(signalDIndex, source.indexOf('const senalesVerificables', signalDIndex));

    expect(signalDSource).toContain('FROM lot_awards la');
    expect(signalDSource).toContain('la.contract_id = c.id');
    expect(signalDSource).toContain('la.awardee_nif');
    expect(signalDSource).toContain('la.awardee');
  });

  it('applies minor-contract fallback per lot without duplicating structured awards', () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, './build-db.js'), 'utf8');
    const minorSourceIndex = source.indexOf('const menoresRows = db.prepare');
    const unicasIndex = source.indexOf('const unicasRows = db.prepare');
    const minorSource = source.slice(minorSourceIndex, unicasIndex);
    const legacyLotIndex = minorSource.indexOf('JOIN contract_lots ll ON ll.contract_id = l.id');
    const structuredAwardsIndex = minorSource.indexOf('JOIN lot_awards la ON la.contract_id = l.id', legacyLotIndex);
    const legacyLotSource = minorSource.slice(legacyLotIndex, structuredAwardsIndex);

    expect(legacyLotSource).toContain('award_parent.lot_number = ll.lot_number');
    expect(legacyLotSource).toContain("excludeAwardWhenLegacyLotTerminalSql('award_parent')");
    expect(legacyLotSource).toContain("excludeLegacyLotWhenStructuredTerminalResultSql('ll')");
    expect(legacyLotSource).not.toContain('FROM contract_lots lot_parent');
  });

  it('genera oferta única cuando la concurrencia solo consta en un lote', () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, './build-db.js'), 'utf8');
    const unicasIndex = source.indexOf('const unicasRows = db.prepare');
    const bajasIndex = source.indexOf('const bajasRows = db.prepare');
    const unicasSource = source.slice(unicasIndex, bajasIndex);

    expect(unicasSource).toContain('offer_count = 1');
    expect(unicasSource).toContain('FROM contract_lots lot');
    expect(unicasSource).toContain('lot.contract_id = contracts.id');
    expect(unicasSource).toContain('FROM lot_awards award');
    expect(unicasSource).toContain('award.contract_id = contracts.id');
  });

  it('calcula el importe económico de oferta única con adjudicaciones de lotes', () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, './build-db.js'), 'utf8');

    const unicasIndex = source.indexOf('const unicasRows = db.prepare');
    const bajasIndex = source.indexOf('const bajasRows = db.prepare');

    expect(unicasIndex).toBeGreaterThanOrEqual(0);
    expect(bajasIndex).toBeGreaterThan(unicasIndex);

    const unicasSource = source.slice(unicasIndex, bajasIndex);
    expect(unicasSource).toContain('SELECT round(sum(award.awarded_amount), 2)');
    expect(unicasSource).toContain("lotAwardsAmountCoverageSql('contracts')");
    expect(unicasSource).not.toContain('count(DISTINCT award.lot_number)');
    expect(unicasSource).not.toContain('count(DISTINCT lot.lot_number)');
    expect(unicasSource).toContain('award.contract_id = contracts.id');
    expect(unicasSource).toContain("eligibleAwardResultStateSql('award')");
    expect(unicasSource).toContain('SELECT round(sum(lot.awarded_amount), 2)');
    expect(unicasSource).toContain('ELSE awarded_amount');
    expect(unicasSource).toContain('FROM lot_awards award');
    expect(unicasSource).toContain('FROM contract_lots lot');
  });

  it('calcula la baja acusada con importes de lotes cuando el padre no tiene adjudicación', () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, './build-db.js'), 'utf8');
    const lowBidQuerySource = source.slice(
      source.indexOf('function buildBajasRowsQuery'),
      source.indexOf('async function main'),
    );

    expect(source).toContain('const lotesBajaStmt = db.prepare');
    expect(source).toContain("sum(CASE WHEN ${eligibleAwardLotStatusSql('lot')}");
    expect(source).toContain('const awardedLotes = Number(lotesRow?.awarded_lotes || 0);');
    expect(source).toContain('FROM lot_awards award');
    expect(source).toContain('SELECT round(sum(award.awarded_amount), 2)');
    expect(source).toContain("lotAwardsAmountCoverageSql('current_contract', 'coverage_lot', 'coverage_award', 'coverage_award_null')");
    expect(lowBidQuerySource).not.toContain('count(DISTINCT award.lot_number)');
    expect(lowBidQuerySource).not.toContain('count(DISTINCT lot.lot_number)');
    expect(source).toContain('if (lotes > 0)');
    expect(source).toContain('if (!(awardedLotes > 0 && pblLotes > 0)) continue;');
    expect(source).toContain('pbl = pblLotes;');
    expect(source).toContain('adj = awardedLotes;');
    expect(source).toContain('else if (awardedLotes > 0)');
    expect(source).toContain('if (!(pbl > 0 && adj > 0 && adj < pbl)) continue;');
    expect(source).toContain('lotAwardsAmountCoverageSql');
    expect(source).toContain("eligibleAwardLotStatusSql('lot')");

  });

  it('usa lot_awards en las señales de negociados sin publicidad', () => {
    const nspSource = buildNspLotsQuery();

    expect(nspSource).toContain('FROM lot_awards award');
    expect(nspSource).toContain('award.result_state AS lot_status');
    expect(nspSource).toContain('award.awardee_nif');
    expect(nspSource).toContain('NOT EXISTS (');
    expect(nspSource).toContain('award.lot_number = lot.lot_number');
    expect(nspSource).toContain("lower(coalesce(award.result_state, '')) LIKE '%desiert%'");
  });

  it('validates related-contract references back to their alert', () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, './validate-rebuilt-db.js'),
      'utf8'
    );

    expect(source).toContain("code: 'ORPHAN_RELATED_ALERT'");
    expect(source).toContain('FROM related_contracts d LEFT JOIN alerts a ON a.id = d.group_id');
  });

  it('keeps weekly and historical workflows aligned with rebuild for verified seeds and document classification', () => {
    const weekly = fs.readFileSync(WEEKLY_WORKFLOW_PATH, 'utf8');
    const historical = fs.readFileSync(
      path.resolve(process.cwd(), '.github/workflows/update-historical-contracts.yml'),
      'utf8'
    );

    for (const source of [weekly, historical]) {
      const syncIndex = source.indexOf('pnpm run sync --');
      const seedsIndex = source.indexOf('pnpm run migrate-verified-contract-seeds');
      const documentsIndex = source.indexOf('pnpm run sync-documentos');
      const classifyIndex = source.indexOf('scripts/classify-award-amount-documents.js');

      expect(seedsIndex).toBeGreaterThan(syncIndex);
      expect(classifyIndex).toBeGreaterThan(documentsIndex);
    }
  });
});


describe('rebuild-db recovery failures', () => {
  it('preserves the recovery backup when restoring it fails', () => {
    const fixture = createFixture();
    fs.writeFileSync(fixture.dbPath, 'known-good');
    const realFs = fs;
    const fsImpl = {
      existsSync: realFs.existsSync.bind(realFs),
      writeFileSync: realFs.writeFileSync.bind(realFs),
      readFileSync: realFs.readFileSync.bind(realFs),
      unlinkSync: realFs.unlinkSync.bind(realFs),
      renameSync(from, to) {
        if (from === fixture.backupPath && to === fixture.dbPath) {
          throw new Error('forced restore failure');
        }
        return realFs.renameSync(from, to);
      },
    };

    try {
      expect(() => rebuildDatabase({
        ...fixture,
        fsImpl,
        runStep: (script) => {
          if (script === 'init-db.js') fs.writeFileSync(fixture.dbPath, 'partial-rebuild');
          if (script === 'sync.js') throw new Error('forced rebuild failure');
        },
      })).toThrow(/forced restore failure/);

      expect(fs.existsSync(fixture.dbPath)).toBe(false);
      expect(fs.readFileSync(fixture.backupPath, 'utf8')).toBe('known-good');
    } finally {
      fs.rmSync(fixture.dir, { recursive: true, force: true });
    }
  });
});
