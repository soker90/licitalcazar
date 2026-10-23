import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { compareContracts, compareDocuments, compareLotes, contractIds, tableNames, contractStats } = require('./compare-db-snapshots.js');

describe('compare-db-snapshots identity keys', () => {
  it('normalizes case numbers and authority IDs for contract comparisons', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/compare-db-snapshots.js'),
      'utf8'
    );

    expect(source).toContain("const { normalizeIdentityPart } = require('./contract-identity');");
    expect(source).toContain('function contractIdentity(row)');
    expect(source).toContain('JSON.stringify([expediente, authorityId])');
  });

  it('uses contracting_authority_id instead of authority name for contract comparisons', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/compare-db-snapshots.js'),
      'utf8'
    );

    expect(source).toContain("const identityCols = ['id','case_number','contracting_authority_id','contracting_authority_name']");
    expect(source).toContain("hasColumn(before, 'contracts', column) && hasColumn(after, 'contracts', column)");
    expect(source).toContain('const selectCols = [...new Set([...identityCols, ...cols])].join(\', \');');
    expect(source).toContain('const key = contractIdentity;');
  });

  it('uses contracting_authority_id for lot parent comparisons', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/compare-db-snapshots.js'),
      'utf8'
    );

    expect(source).toContain(
      'GROUP BY l.id, l.case_number, l.contracting_authority_id, l.contracting_authority_name'
    );
    expect(source).toContain('const parentKey = contractIdentity;');
  });
});


describe('compare-db-snapshots award amount semantics', () => {
  it('excludes unitary parent awards from contract deltas', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts/compare-db-snapshots.js'), 'utf8');
    expect(source).toContain('function comparableAwardAmount(row)');
    expect(source).toContain("row.award_amount_type === 'total'");
  });

  it('excludes unitary parent awards from lot deltas', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts/compare-db-snapshots.js'), 'utf8');
    expect(source).toContain("const amountTypeFilter = hasColumn(db, 'contracts', 'award_amount_type')");
    expect(source).toContain('sum(CASE WHEN ${amountTypeFilter} THEN coalesce(ll.awarded_amount,0) ELSE 0 END) award');
  });
});


describe('compare-db-snapshots award amount type', () => {
  it('selects award_amount_type when comparing contracts', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts/compare-db-snapshots.js'), 'utf8');
    expect(source).toContain("const candidateCols = ['amount_excl_vat','awarded_amount','award_amount_type'");
    expect(source).toContain("hasColumn(before, 'contracts', column) && hasColumn(after, 'contracts', column)");
  });
});


function makeSnapshotDb(contractId, caseNumber = '15/2024 Servicios', authorityId = 'authority-1') {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE contracts (
      id TEXT PRIMARY KEY,
      case_number TEXT,
      contracting_authority_id TEXT,
      contracting_authority_name TEXT,
      amount_excl_vat REAL,
      awarded_amount REAL,
      award_amount_type TEXT,
      procedure TEXT,
      contract_type TEXT,
      economic_nature TEXT,
      is_lotized INTEGER,
      lot_count INTEGER,
      lots_source TEXT,
      awardee TEXT,
      awardee_nif TEXT
    );
    CREATE TABLE contract_documents (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      title TEXT NOT NULL,
      document_date TEXT,
      document_type TEXT,
      is_abnormally_low_bid_justification INTEGER DEFAULT 0,
      created_at TEXT
    );
  `);
  db.prepare(`
    INSERT INTO contracts (
      id, case_number, contracting_authority_id, contracting_authority_name,
      amount_excl_vat, awarded_amount, award_amount_type, procedure, contract_type,
      economic_nature, is_lotized, lot_count, lots_source, awardee, awardee_nif
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(contractId, caseNumber, authorityId, 'Authority', 1000, 900, 'total', 'Abierto', 'Servicios', 'gasto', 0, 0, null, 'Empresa', 'B12345678');
  db.prepare(`
    INSERT INTO contract_documents (
      id, contract_id, source_url, title, document_date, document_type,
      is_abnormally_low_bid_justification, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(contractId + '_doc_1', contractId, 'https://example.test/document.pdf', 'Pliego', '2026-01-01', 'Pliego', 0, '2026-01-02');
  return db;
}

describe('compare-db-snapshots logical identity', () => {
  it('does not report contracts or documents as added/removed when internal IDs change', () => {
    const before = makeSnapshotDb('legacy-contract');
    const after = makeSnapshotDb('canonical-contract');

    try {
      const contracts = compareContracts(before, after);
      const documents = compareDocuments(before, after);

      expect(contracts.added).toEqual([]);
      expect(contracts.removed).toEqual([]);
      expect(contracts.changedCount).toBe(0);
      expect(contractIds(before)).toEqual(contractIds(after));
      expect(documents.sampleNewDocuments).toEqual([]);
      expect(documents.sampleMissingDocuments).toEqual([]);
    } finally {
      before.close();
      after.close();
    }
  });

  it('keeps contracts with incomplete logical identity distinct by internal ID', () => {
    const before = makeSnapshotDb('legacy-contract', null, null);
    const after = makeSnapshotDb('canonical-contract', null, null);

    try {
      const result = compareContracts(before, after);

      expect(result.added).toEqual(['id:canonical-contract']);
      expect(result.removed).toEqual(['id:legacy-contract']);
      expect(contractIds(before)).not.toEqual(contractIds(after));
    } finally {
      before.close();
      after.close();
    }
  });
});


function makeOlderSchemaSnapshotDb(id = 'legacy-contract') {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE contracts (
      id TEXT PRIMARY KEY,
      case_number TEXT,
      contracting_authority_id TEXT,
      contracting_authority_name TEXT,
      amount_excl_vat REAL,
      awarded_amount REAL,
      procedure TEXT,
      contract_type TEXT,
      economic_nature TEXT,
      awardee TEXT,
      awardee_nif TEXT,
      status TEXT,
      publication_date TEXT,
      source_url TEXT,
      documents_synced_at TEXT
    );
    INSERT INTO contracts VALUES (
      '${id}', '15/2024 Servicios', 'authority-1', 'Authority',
      1000, 900, 'Abierto', 'Servicios', 'gasto', 'Empresa',
      'B12345678', 'Adjudicada', '2026-01-01', 'https://example.test', NULL
    );
  `);
  return db;
}

function makeLotSnapshotDb({ id, awardAmountType }) {
  const db = new DatabaseSync(':memory:');
  const typeColumn = awardAmountType === undefined ? '' : ', award_amount_type TEXT';
  const typeInsertColumn = awardAmountType === undefined ? '' : ', award_amount_type';
  const typeValue = awardAmountType === undefined ? '' : `, '${awardAmountType}'`;
  db.exec(`
    CREATE TABLE contracts (
      id TEXT PRIMARY KEY, case_number TEXT, contracting_authority_id TEXT,
      contracting_authority_name TEXT${typeColumn}
    );
    CREATE TABLE contract_lots (
      id TEXT PRIMARY KEY, contract_id TEXT, awarded_amount REAL,
      budget_excl_vat REAL, amount_excl_vat REAL
    );
    INSERT INTO contracts (id, case_number, contracting_authority_id, contracting_authority_name${typeInsertColumn})
      VALUES ('${id}', '15/2024 Servicios', 'authority-1', 'Authority'${typeValue});
    INSERT INTO contract_lots VALUES ('lot-1', '${id}', 100, 1000, 1000);
  `);
  return db;
}

describe('compare-db-snapshots older schema compatibility', () => {
  it('keeps raw volume and contract comparisons working when newer columns are absent', () => {
    const older = makeOlderSchemaSnapshotDb();
    const current = makeSnapshotDb('current-contract');
    try {
      const stats = contractStats(older);
      const comparison = compareContracts(older, current);

      expect(stats.awardedVolume).toBe(900);
      expect(stats.canonicalAwardedVolume).toBe(900);
      expect(comparison.added).toEqual([]);
      expect(comparison.removed).toEqual([]);
      expect(comparison.changedCount).toBe(0);
    } finally {
      older.close();
      current.close();
    }
  });

  it('compares lot deltas when the older contracts table lacks award_amount_type', () => {
    const older = makeLotSnapshotDb({ id: 'old-contract' });
    const current = makeLotSnapshotDb({ id: 'new-contract', awardAmountType: 'unitario' });
    try {
      const result = compareLotes(older, current);
      expect(result.parentsChanged).toBe(1);
      expect(result.biggestChanges[0].before.award).toBe(100);
      expect(result.biggestChanges[0].after.award).toBe(0);
    } finally {
      older.close();
      current.close();
    }
  });
});

describe('compare-db-snapshots table counts', () => {
  it('excludes FTS5 shadow tables from reported physical table counts', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (id TEXT PRIMARY KEY);
      CREATE VIRTUAL TABLE contracts_fts USING fts5(id UNINDEXED, object_description);
      INSERT INTO contracts_fts(id, object_description) VALUES ('ctr-1', 'Mantenimiento');
    `);

    try {
      const names = tableNames(db);
      expect(names).toContain('contracts');
      expect(names).toContain('contracts_fts');
      expect(names.some(name => name.startsWith('contracts_fts_'))).toBe(false);
    } finally {
      db.close();
    }
  });
});
