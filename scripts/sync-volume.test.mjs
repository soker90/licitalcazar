import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { buildAwardedVolumeSql, buildAwardAmountEligibilitySql } = require('./award-volume-sql.js');

describe('Sync volume semantics', () => {
  it('no usa el PBL como volumen adjudicado en el sincronizador', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts/sync.js'), 'utf8');

    const volumeSource = fs.readFileSync(path.resolve(process.cwd(), 'scripts/award-volume-sql.js'), 'utf8');
    expect(source).toContain("require('./award-volume-sql')");
    expect(source.match(/\$\{awardedVolumeSql\}/g)).toHaveLength(2);
    expect(source.match(/\$\{awardAmountEligibilitySql\}/g)).toHaveLength(2);
    expect(volumeSource).toContain('function buildAwardedVolumeSql(contractAlias = \'contracts\'');
    expect(volumeSource).toContain('lotAwardsAmountCoverageSql(contractAlias)');
    expect(volumeSource).toContain('eligibleLegacyLotAwardAmountSql(\'lot\', hasLotAwardsTable)');
    expect(volumeSource).toContain('allowParentAwardAmountFallbackSql(contractAlias, hasLotAwardsTable, hasContractLotsTable)');
    expect(source).not.toContain(
      "sum(CASE WHEN award_amount_type IS NULL OR award_amount_type = 'total' THEN coalesce(awarded_amount, 0) ELSE 0 END) as volumen",
    );
  });


  it('summarizes structured awards, partial legacy snapshots, and parent fallback consistently', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contracts (
          id TEXT PRIMARY KEY, status TEXT, award_amount_type TEXT,
          is_lotized INTEGER, awarded_amount REAL
        );
        CREATE TABLE contract_lots (
          id TEXT PRIMARY KEY, contract_id TEXT, lot_number TEXT,
          lot_status TEXT, awarded_amount REAL
        );
        CREATE TABLE lot_awards (
          id TEXT PRIMARY KEY, contract_id TEXT, lot_number TEXT,
          awardee TEXT, awarded_amount REAL, result_state TEXT
        );
        INSERT INTO contracts VALUES
          ('terminal', 'Adjudicada', 'total', 1, 6000),
          ('structured', 'Adjudicada', 'total', 1, 9000),
          ('partial', 'Adjudicada', 'total', 1, 9000),
          ('plain', 'Adjudicada', 'total', 0, 700),
          ('unknown', 'Awarded', 'desconocido', 0, 400);
        INSERT INTO lot_awards VALUES
          ('terminal-award', 'terminal', '1', NULL, 6000, 'CANCELLED'),
          ('structured-award-1', 'structured', '1', 'Empresa A', 3000, 'Adjudicado'),
          ('structured-award-2', 'structured', '2', 'Empresa B', 2000, 'Adjudicado'),
          ('partial-award', 'partial', '1', 'Empresa C', 2500, 'Adjudicado');
        INSERT INTO contract_lots VALUES
          ('structured-lot-1', 'structured', '1', 'Adjudicado', 6000),
          ('structured-lot-2', 'structured', '2', 'Adjudicado', 4000),
          ('partial-lot-1', 'partial', '1', 'Adjudicado', 5000),
          ('partial-lot-2', 'partial', '2', 'Adjudicado', NULL);
      `);

      const awardedVolumeSql = buildAwardedVolumeSql('contracts');
      const result = db.prepare(`
        SELECT round(sum(CASE
          WHEN contracts.status NOT IN ('Desierta', 'Anulada')
          AND ${buildAwardAmountEligibilitySql('contracts')}
          THEN ${awardedVolumeSql}
          ELSE 0
        END), 2) AS volume
        FROM contracts
      `).get();

      expect(result.volume).toBe(11100);
    } finally {
      db.close();
    }
  });

  it('does not fall back to parent volume when structured lot amounts are incomplete', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contracts (
          id TEXT PRIMARY KEY, status TEXT, award_amount_type TEXT,
          is_lotized INTEGER, awarded_amount REAL
        );
        CREATE TABLE contract_lots (
          id TEXT PRIMARY KEY, contract_id TEXT, lot_number TEXT,
          lot_status TEXT, awarded_amount REAL
        );
        CREATE TABLE lot_awards (
          id TEXT PRIMARY KEY, contract_id TEXT, lot_number TEXT,
          awardee TEXT, awarded_amount REAL, result_state TEXT
        );
        INSERT INTO contracts VALUES ('partial', 'Adjudicada', 'total', 1, 9000);
        INSERT INTO contract_lots VALUES
          ('lot-1', 'partial', '1', 'Adjudicado', NULL),
          ('lot-2', 'partial', '2', 'Adjudicado', NULL);
        INSERT INTO lot_awards VALUES
          ('award-1', 'partial', '1', 'Empresa A', 2500, 'AWARDED');
      `);

      const sql = buildAwardedVolumeSql('contracts');
      const result = db.prepare(`
        SELECT ${sql} AS volume FROM contracts WHERE id = 'partial'
      `).get();

      expect(result.volume).toBe(0);
    } finally {
      db.close();
    }
  });

  it('no usa el PBL como volumen adjudicado en la API de sincronización', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/api/sync/route.ts'),
      'utf8',
    );

    expect(source).toContain('SELECT round(sum(lot.awarded_amount), 2)');
    expect(source).toContain('lot.contract_id = contracts.id');
    expect(source).toContain("eligibleAwardLotStatusSql('lot')");
    expect(source).not.toContain(
      "sum(CASE WHEN award_amount_type IS NULL OR award_amount_type = 'total' THEN coalesce(awarded_amount, amount_excl_vat, 0) ELSE 0 END) as volumen",
    );
  });
});
