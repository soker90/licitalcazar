import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { contractStats } = require('./compare-db-snapshots.js');

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/compare-db-snapshots.js');

describe('compare-db-snapshots awarded volume', () => {

  it('adds a canonical lot-aware volume without changing the raw parent volume metric', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contracts (
          id TEXT PRIMARY KEY, status TEXT, award_amount_type TEXT,
          is_lotized INTEGER, awarded_amount REAL, publication_date TEXT,
          source_url TEXT, documents_synced_at TEXT
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
          ('terminal', 'Adjudicada', 'total', 1, 6000, '2026-01-01', NULL, NULL),
          ('legacy-terminal', 'Adjudicada', 'total', 1, 8000, '2026-01-01B', NULL, NULL),
          ('structured', 'Adjudicada', 'total', 1, 9000, '2026-01-02', NULL, NULL),
          ('partial', 'Adjudicada', 'total', 1, 9000, '2026-01-03', NULL, NULL),
          ('plain', 'Adjudicada', 'total', 0, 700, '2026-01-04', NULL, NULL),
          ('desierta', 'Desierta', 'total', 1, 1000, '2026-01-05', NULL, NULL),
          ('unknown', 'Awarded', 'desconocido', 0, 400, '2026-01-06', NULL, NULL);
        INSERT INTO lot_awards VALUES
          ('terminal-award', 'terminal', '1', NULL, 6000, 'CANCELLED'),
          ('structured-award-1', 'structured', '1', 'Empresa A', 3000, 'Adjudicado'),
          ('structured-award-2', 'structured', '2', 'Empresa B', 2000, 'Adjudicado'),
          ('partial-award', 'partial', '1', 'Empresa C', 2500, 'Adjudicado');
        INSERT INTO contract_lots VALUES
          ('structured-lot-1', 'structured', '1', 'Adjudicado', 6000),
          ('structured-lot-2', 'structured', '2', 'Adjudicado', 4000),
          ('partial-lot-1', 'partial', '1', 'Adjudicado', 5000),
          ('partial-lot-2', 'partial', '2', 'Adjudicado', NULL),
          ('legacy-terminal-lot', 'legacy-terminal', '1', 'Cancelled', 6000);
      `);

      const stats = contractStats(db);
      expect(stats.awardedVolume).toBe(34100);
      expect(stats.canonicalAwardedVolume).toBe(11100);
    } finally {
      db.close();
    }
  });


  it('uses available lot tables when an older snapshot lacks the lotization flag', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contracts (
          id TEXT PRIMARY KEY, status TEXT, award_amount_type TEXT,
          awarded_amount REAL, publication_date TEXT, source_url TEXT,
          documents_synced_at TEXT
        );
        CREATE TABLE contract_lots (
          id TEXT PRIMARY KEY, contract_id TEXT, lot_number TEXT,
          lot_status TEXT, awarded_amount REAL
        );
        CREATE TABLE lot_awards (
          id TEXT PRIMARY KEY, contract_id TEXT, lot_number TEXT,
          awardee TEXT, awarded_amount REAL, result_state TEXT
        );
        INSERT INTO contracts VALUES ('legacy-schema', 'Adjudicada', 'total', 9000, '2026-01-01', NULL, NULL);
        INSERT INTO contract_lots VALUES
          ('legacy-schema-lot-1', 'legacy-schema', '1', 'Adjudicado', 6000),
          ('legacy-schema-lot-2', 'legacy-schema', '2', 'Adjudicado', 4000);
        INSERT INTO lot_awards VALUES
          ('legacy-schema-award-1', 'legacy-schema', '1', 'Empresa A', 3000, 'Adjudicado'),
          ('legacy-schema-award-2', 'legacy-schema', '2', 'Empresa B', 2000, 'Adjudicado');
      `);

      expect(contractStats(db).canonicalAwardedVolume).toBe(5000);
    } finally {
      db.close();
    }
  });

  it('falls back to parent amounts for snapshots without lot tables', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contracts (
          id TEXT PRIMARY KEY, status TEXT, award_amount_type TEXT,
          is_lotized INTEGER, awarded_amount REAL, publication_date TEXT,
          source_url TEXT, documents_synced_at TEXT
        );
        INSERT INTO contracts VALUES ('plain', 'Adjudicada', 'total', 0, 700, '2026-01-01', NULL, NULL);
      `);

      const stats = contractStats(db);
      expect(stats.canonicalAwardedVolume).toBe(700);
    } finally {
      db.close();
    }
  });

  it('excludes unitary awarded amounts from awarded volume', () => {
    const source = fs.readFileSync(SCRIPT_PATH, 'utf8');

    expect(source).toContain("hasColumn(db, 'contracts', 'award_amount_type')");
    expect(source).toContain('coalesce(awarded_amount, 0) ELSE 0 END');
    expect(source).toContain("award_amount_type IN ('total', 'desconocido')");
  });
});
