import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const {
  TERMINAL_NO_AWARD_LOT_STATUS_PATTERNS,
  isEligibleAwardLotStatus,
  eligibleAwardLotStatusSql,
  isEligibleAwardResultState,
  eligibleAwardResultStateSql,
  isTerminalNoAwardResultState,
  terminalNoAwardResultStateSql,
  allowLegacyLotAwardFallbackSql,
  lotAwardsAmountCoverageSql,
  eligibleLegacyLotAwardAmountSql,
  allowParentAwardAmountFallbackSql,
} = require('./lot-status.js');

describe('legacy lot status eligibility', () => {
  it('rejects terminal/no-award states in Spanish and English', () => {
    const terminalStatuses = [
      'Desierto', 'Deserted', 'Anulada', 'Annulled', 'Cancelado', 'Cancelled',
      'Renunciado', 'Renounced', 'Desestimado', 'Rechazado', 'Rejected', 'Desistido',
      'Retirado', 'Withdrawn',
    ];

    expect(TERMINAL_NO_AWARD_LOT_STATUS_PATTERNS.length).toBeGreaterThan(0);
    for (const status of terminalStatuses) {
      expect(isEligibleAwardLotStatus(status)).toBe(false);
    }
    for (const status of ['Adjudicado', 'Formalizada', 'Resuelta', '', null]) {
      expect(isEligibleAwardLotStatus(status)).toBe(true);
    }
  });

  it('keeps the generated SQLite predicate aligned with the JavaScript rule', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE contract_lots (lot_status TEXT)');
      const insert = db.prepare('INSERT INTO contract_lots (lot_status) VALUES (?)');
      const statuses = [
        'Adjudicado', 'Desierto', 'Deserted', 'Anulada', 'Annulled',
        'Cancelado', 'Cancelled', 'Renunciado', 'Renounced', 'Desestimado', 'Rechazado',
        'Rejected', 'Desistido', 'Retirado', 'Withdrawn',
      ];
      statuses.forEach((status) => insert.run(status));

      const eligible = db.prepare(`SELECT lot_status FROM contract_lots WHERE ${eligibleAwardLotStatusSql()} ORDER BY rowid`)
        .all()
        .map((row) => row.lot_status);

      expect(eligible).toEqual(['Adjudicado']);
      expect(eligible.filter(isEligibleAwardLotStatus)).toEqual(eligible);
    } finally {
      db.close();
    }
  });

  it('excludes residual amounts and awardees from Cancelled lots in SQLite', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`CREATE TABLE contract_lots (
        contract_id TEXT NOT NULL,
        lot_status TEXT,
        awarded_amount REAL,
        awardee TEXT
      )`);
      const insert = db.prepare(
        'INSERT INTO contract_lots (contract_id, lot_status, awarded_amount, awardee) VALUES (?, ?, ?, ?)',
      );
      insert.run('contract-1', 'Cancelled', 6000, 'Empresa residual');
      insert.run('contract-1', 'Adjudicado', 4000, 'Empresa válida');

      const result = db.prepare(`
        SELECT sum(awarded_amount) AS amount, group_concat(DISTINCT awardee) AS awardee
        FROM contract_lots lot
        WHERE lot.contract_id = ?
          AND ${eligibleAwardLotStatusSql('lot')}
      `).get('contract-1') as { amount: number | null; awardee: string | null };

      expect(result.amount).toBe(4000);
      expect(result.awardee).toBe('Empresa válida');
    } finally {
      db.close();
    }
  });

  it('requires complete amount coverage for every eligible lot, including legacy lots with null amounts', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contract_lots (
          contract_id TEXT, lot_number TEXT, lot_status TEXT, awarded_amount REAL
        );
        CREATE TABLE lot_awards (
          contract_id TEXT, lot_number TEXT, awarded_amount REAL, result_state TEXT
        );
        INSERT INTO contract_lots VALUES
          ('C1', '1', 'Adjudicado', 1000),
          ('C1', '2', 'Adjudicado', NULL),
          ('C1', '3', 'Adjudicado', 6000);
        INSERT INTO lot_awards VALUES
          ('C1', '1', 900, 'AWARDED'),
          ('C1', '3', 6000, 'CANCELLED');
      `);

      const coverage = () => (db.prepare(
        `SELECT ${lotAwardsAmountCoverageSql('contract')} AS covered FROM (SELECT 'C1' AS id) contract`,
      ).get() as { covered: number }).covered === 1;

      expect(coverage()).toBe(false);
      db.prepare('INSERT INTO lot_awards VALUES (?, ?, ?, ?)').run('C1', '2', 800, 'AWARDED');
      expect(coverage()).toBe(true);
      const eligibleLegacyLots = db.prepare(
        `SELECT lot_number FROM contract_lots lot WHERE ${eligibleLegacyLotAwardAmountSql('lot')} ORDER BY lot_number`,
      ).all().map((row) => row.lot_number);
      expect(eligibleLegacyLots).toEqual(['1', '2']);
      expect(eligibleLegacyLotAwardAmountSql('lot', false)).not.toContain('lot_awards');
      db.prepare('UPDATE lot_awards SET awarded_amount = NULL WHERE lot_number = ?').run('2');
      expect(coverage()).toBe(false);

      db.prepare('DELETE FROM contract_lots').run();
      db.prepare('DELETE FROM lot_awards').run();
      db.prepare('INSERT INTO lot_awards VALUES (?, ?, ?, ?)').run('C1', '1', 900, 'AWARDED');
      db.prepare('INSERT INTO lot_awards VALUES (?, ?, ?, ?)').run('C1', '2', null, 'AWARDED');
      expect(coverage()).toBe(false);

      db.prepare('UPDATE lot_awards SET awarded_amount = ? WHERE lot_number = ?').run(800, '2');
      expect(coverage()).toBe(true);
      db.prepare("UPDATE lot_awards SET awarded_amount = NULL, result_state = 'CANCELLED' WHERE lot_number = ?").run('2');
      expect(coverage()).toBe(true);
    } finally {
      db.close();
    }
  });

  it('rejects terminal structured award result states in JavaScript and SQLite', () => {
    const terminalStates = ['DESERTED', 'DESERTED_PROVISIONALLY', 'WITHDRAWN', 'RENOUNCED', 'CANCELLED', 'Desistimiento', 'Rechazado', 'BEST_RATED_TENDERER', 'Licitador mejor valorado'];
    for (const state of terminalStates) expect(isEligibleAwardResultState(state)).toBe(false);
    expect(isEligibleAwardResultState('AWARDED')).toBe(true);

    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE lot_awards (result_state TEXT)');
      const insert = db.prepare('INSERT INTO lot_awards (result_state) VALUES (?)');
      ['AWARDED', 'DESERTED', 'DESERTED_PROVISIONALLY', 'WITHDRAWN', 'RENOUNCED', 'CANCELLED', 'Desistimiento', 'Rechazado', 'BEST_RATED_TENDERER', 'Licitador mejor valorado'].forEach((state) => insert.run(state));
      const eligible = db.prepare(`SELECT result_state FROM lot_awards WHERE ${eligibleAwardResultStateSql()} ORDER BY rowid`).all().map((row) => row.result_state);
      expect(eligible).toEqual(['AWARDED']);
      expect(eligible.filter(isEligibleAwardResultState)).toEqual(eligible);
    } finally {
      db.close();
    }
  });

  it('recognizes terminal no-award result states without treating provisional desertion as final', () => {
    const terminalStates = [
      'DESERTED', 'WITHDRAWN', 'RENOUNCED', 'CANCELLED', 'ANNULLED',
      'Cancelado', 'Anulada', 'Renunciado', 'Renounced', 'Withdrawn',
    ];
    const nonTerminalStates = [
      'DESERTED_PROVISIONALLY', 'BEST_RATED_TENDERER',
      'Licitador mejor valorado', 'AWARDED', 'REJECTED',
      'Desistimiento', 'DESISTIDO', 'Retirado',
    ];

    for (const state of terminalStates) expect(isTerminalNoAwardResultState(state)).toBe(true);
    for (const state of nonTerminalStates) expect(isTerminalNoAwardResultState(state)).toBe(false);

    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE lot_awards (result_state TEXT)');
      const insert = db.prepare('INSERT INTO lot_awards (result_state) VALUES (?)');
      [...terminalStates, ...nonTerminalStates].forEach((state) => insert.run(state));
      const actual = db.prepare(
        `SELECT result_state FROM lot_awards WHERE ${terminalNoAwardResultStateSql()} ORDER BY rowid`,
      ).all().map((row) => row.result_state);
      expect(actual).toEqual(terminalStates);
      expect(actual.filter(isTerminalNoAwardResultState)).toEqual(actual);
    } finally {
      db.close();
    }
  });


  it('blocks parent fallback when structured awards are incomplete and legacy amounts are missing', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contracts (id TEXT PRIMARY KEY, awarded_amount REAL);
        CREATE TABLE lot_awards (
          contract_id TEXT, lot_number TEXT, awarded_amount REAL, result_state TEXT
        );
        CREATE TABLE contract_lots (
          contract_id TEXT, lot_number TEXT, lot_status TEXT, awarded_amount REAL
        );
        INSERT INTO contracts VALUES ('partial', 9000), ('complete', 9000);
        INSERT INTO contract_lots VALUES
          ('partial', '1', 'Adjudicado', NULL),
          ('partial', '2', 'Adjudicado', NULL),
          ('complete', '1', 'Adjudicado', NULL),
          ('complete', '2', 'Adjudicado', NULL);
        INSERT INTO lot_awards VALUES
          ('partial', '1', 2500, 'AWARDED'),
          ('complete', '1', 2500, 'AWARDED'),
          ('complete', '2', 3500, 'AWARDED');
      `);

      const eligible = db.prepare(`
        SELECT id
        FROM contracts
        WHERE ${allowParentAwardAmountFallbackSql('contracts')}
        ORDER BY id
      `).all().map(row => row.id);

      expect(eligible).toEqual(['complete']);
    } finally {
      db.close();
    }
  });

  it('blocks parent amount fallback after structured or legacy terminal lot results', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contracts (id TEXT PRIMARY KEY, awarded_amount REAL);
        CREATE TABLE lot_awards (contract_id TEXT, lot_number TEXT, awarded_amount REAL, result_state TEXT);
        CREATE TABLE contract_lots (contract_id TEXT, lot_number TEXT, lot_status TEXT, awarded_amount REAL);
        INSERT INTO contracts VALUES
          ('cancelled-contract', 6000),
          ('active-contract', 4000),
          ('legacy-cancelled-contract', 7000),
          ('eligible-legacy-contract', 5000);
        INSERT INTO lot_awards VALUES ('cancelled-contract', '1', 6000, 'CANCELLED');
        INSERT INTO contract_lots VALUES
          ('legacy-cancelled-contract', '1', 'Cancelled', 7000),
          ('eligible-legacy-contract', '1', 'Adjudicado', 5000);
      `);

      const eligible = db.prepare(`
        SELECT id, awarded_amount
        FROM contracts
        WHERE ${allowParentAwardAmountFallbackSql('contracts')}
        ORDER BY id
      `).all();

      expect(eligible).toEqual([
        { id: 'active-contract', awarded_amount: 4000 },
        { id: 'eligible-legacy-contract', awarded_amount: 5000 },
      ]);
      expect(allowParentAwardAmountFallbackSql('contracts', false, false)).toBe('1');
    } finally {
      db.close();
    }
  });

  it('blocks legacy awardee fallback for cancelled structured results but keeps provisional fallback', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contract_lots (
          contract_id TEXT, lot_number TEXT, lot_status TEXT, awardee TEXT
        );
        CREATE TABLE lot_awards (
          contract_id TEXT, lot_number TEXT, awardee TEXT, result_state TEXT
        );
        INSERT INTO contract_lots VALUES
          ('C1', '1', 'Adjudicado', 'Empresa antigua cancelada'),
          ('C1', '2', 'Adjudicado', 'Empresa vigente provisional'),
          ('C1', '3', 'Adjudicado', 'Empresa antigua estructurada'),
          ('C1', '4', 'Adjudicado', 'Empresa antigua rechazada');
        INSERT INTO lot_awards VALUES
          ('C1', '1', NULL, 'CANCELLED'),
          ('C1', '2', NULL, 'DESERTED_PROVISIONALLY'),
          ('C1', '3', 'Empresa estructurada', 'AWARDED'),
          ('C1', '4', NULL, 'REJECTED');
      `);

      const rows = db.prepare(`
        SELECT lot.lot_number
        FROM contract_lots lot
        WHERE ${allowLegacyLotAwardFallbackSql('lot')}
        ORDER BY lot.lot_number
      `).all().map((row) => row.lot_number);

      expect(rows).toEqual(['2', '4']);
    } finally {
      db.close();
    }
  });

  it('uses terminal result-state eligibility for structured awardee lookup paths', () => {
    const source = fs.readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
    const quickSearch = source.slice(source.indexOf('export function searchQuick'), source.indexOf('export function getLicitaciones'));
    const listFilters = source.slice(source.indexOf('export function getLicitaciones'), source.indexOf('export function getLicitacionById'));
    const contractAlerts = source.slice(source.indexOf('export function getAlertasForContract'), source.indexOf('export function getAlertasForEmpresa'));
    const companyAlerts = source.slice(source.indexOf('export function getAlertasForEmpresa'));

    expect(quickSearch).toContain("eligibleAwardResultStateSql('award')");
    expect(listFilters).toContain("eligibleAwardResultStateSql('award')");
    expect(companyAlerts).toContain("eligibleAwardResultStateSql('la')");
    expect(quickSearch).toContain("lotAwardsAmountCoverageSql('contracts')");
    expect(quickSearch).toContain("lotAwardsAmountCoverageSql('l')");
    expect(listFilters).toContain("lotAwardsAmountCoverageSql('contracts')");
    expect(contractAlerts).toContain("lotAwardsAmountCoverageSql('l')");

    expect(source).not.toContain("upper(coalesce(award.result_state, '')) NOT IN ('DESERTED', 'DESERTED_PROVISIONALLY', 'WITHDRAWN', 'RENOUNCED')");
    const buildDb = fs.readFileSync(new URL('../../scripts/build-db.js', import.meta.url), 'utf8');
    expect(buildDb).toContain("eligibleAwardResultStateSql('award')");
    expect(buildDb).toContain("lotAwardsAmountCoverageSql('contracts')");
    expect(buildDb).toContain("eligibleLegacyLotAwardAmountSql('lot')");
    expect(buildDb).toContain("terminalNoAwardResultStateSql('terminal_award')");


    const parentFallbackSources = [
      fs.readFileSync(new URL('./db.ts', import.meta.url), 'utf8'),
      fs.readFileSync(new URL('./contratos-vivos.ts', import.meta.url), 'utf8'),
      fs.readFileSync(new URL('./discrepancias.ts', import.meta.url), 'utf8'),
      fs.readFileSync(new URL('./duracion-efectiva.ts', import.meta.url), 'utf8'),
      fs.readFileSync(new URL('./export.ts', import.meta.url), 'utf8'),
      fs.readFileSync(new URL('./modificados.ts', import.meta.url), 'utf8'),
      fs.readFileSync(new URL('../app/api/sync/route.ts', import.meta.url), 'utf8'),
    ];
    for (const source of parentFallbackSources) {
      expect(source).toContain('allowParentAwardAmountFallbackSql');
    }

    const corporateSource = fs.readFileSync(new URL('./db-corporate.ts', import.meta.url), 'utf8');
    expect(corporateSource).toContain("excludeLegacyLotWhenStructuredTerminalResultSql('ll')");

    const auditLotsSource = fs.readFileSync(new URL('../../scripts/audit-and-fix-lotes.js', import.meta.url), 'utf8');
    expect(auditLotsSource).toContain("eligibleLegacyLotAwardAmountSql('lot', hasLotAwardsTable)");
  });

  it('guards legacy awardee fallback after structured terminal results across query paths', () => {
    const sourcePaths = [
      '../lib/export.ts',
      './db.ts',
      './discrepancias.ts',
      './modificados.ts',
      './duracion-efectiva.ts',
      './contratos-vivos.ts',
    ];
    const sources = sourcePaths.map((sourcePath) =>
      fs.readFileSync(new URL(sourcePath, import.meta.url), 'utf8'),
    );

    for (const source of sources) {
      expect(source).toContain('excludeLegacyLotWhenStructuredTerminalResultSql');
    }
    expect(sources[0]).toContain("excludeLegacyLotWhenStructuredTerminalResultSql('lot')");
    expect(sources[1]).toContain("excludeLegacyLotWhenStructuredTerminalResultSql('lot')");
    expect(sources[2]).toContain("excludeLegacyLotWhenStructuredTerminalResultSql('lot')");
    expect(sources[3]).toContain("excludeLegacyLotWhenStructuredTerminalResultSql('lot')");
    expect(sources[4]).toContain("excludeLegacyLotWhenStructuredTerminalResultSql('lot')");
    expect(sources[5]).toContain("excludeLegacyLotWhenStructuredTerminalResultSql('lot')");
  });

  it('uses terminal status eligibility for amounts and awardees on contract detail pages', () => {
    const source = fs.readFileSync(new URL('../app/licitaciones/[id]/page.tsx', import.meta.url), 'utf8');

    expect(source).toContain("import { isEligibleAwardLotStatus } from '@/lib/lot-status.js';");
    expect(source).toContain('if (!isEligibleAwardLotStatus(l.estadoLote)) continue;');
    expect(source).toContain('const adj = estadoLoteElegible ? lote.importeAdjudicacion : null;');
    expect(source).toContain('const pblBaseAhorro = lotesList.length > 0 ? pblAdjudicados : pblTotal;');
    expect(source).toContain('const lotesSinAdjudicar = lotesList.filter((l: any) => !isEligibleAwardLotStatus(l.estadoLote)');
    expect(source).toContain('const sinAdjudicarCount = lotes.filter(l => !isEligibleAwardLotStatus(l.estadoLote)');
    expect(source).toContain('const lotesSinAdjudicar = lotes.filter((l: any) => !isEligibleAwardLotStatus(l.estadoLote)');
    expect(source).toContain('lotes sin adjudicar');
    expect(source).not.toContain("const lotesDesiertos = lotesList.filter");
    expect(source).toContain("const isDesierta = contractStatus.code === 'DESERTED';");
    expect(source).toContain("const isCancelada = contractStatus.code === 'CANCELED';");
    expect(source).toContain('if (isCancelada || diasCalculados === null || diasCalculados <= 0) return null;');
    expect(source).not.toContain("const isDesierta = lic.estado.toLowerCase().includes('desiert');");
  });
});
