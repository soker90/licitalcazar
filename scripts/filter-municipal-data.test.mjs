import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { filterMunicipalData, main } = require('./filter-municipal-data.js');

function createDb(contractColumns = `
  id TEXT PRIMARY KEY,
  contracting_authority_id TEXT,
  scope TEXT,
  case_number TEXT,
  object_description TEXT,
  contracting_authority_name TEXT,
  awardee TEXT,
  awardee_nif TEXT,
  year INTEGER,
  contract_type TEXT,
  procedure TEXT,
  status TEXT,
  publication_date TEXT
`) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE contracting_authorities (
      id TEXT PRIMARY KEY,
      active INTEGER NOT NULL,
      scope TEXT NOT NULL
    );
    CREATE TABLE contracts (${contractColumns});
  `);
  return db;
}

describe('filter municipal data safety', () => {
  it('preserves an existing recovery backup and leaves the database untouched', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-municipal-backup-'));
    const dbPath = path.join(dir, 'source.db');
    const backupPath = path.join(dir, 'recovery.db');
    fs.writeFileSync(dbPath, 'known-good-database');
    fs.writeFileSync(backupPath, 'previous-recovery-copy');

    try {
      expect(() => main({ dbPath, backupPath })).toThrow(/sobrescribirlo/);
      expect(fs.readFileSync(dbPath, 'utf8')).toBe('known-good-database');
      expect(fs.readFileSync(backupPath, 'utf8')).toBe('previous-recovery-copy');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to delete contracts when no municipal authorities are active', () => {
    const db = createDb('id TEXT PRIMARY KEY');
    db.prepare('INSERT INTO contracts(id) VALUES (?)').run('contract-1');

    expect(() => filterMunicipalData(db)).toThrow('No hay organismos municipales activos');
    expect(db.prepare('SELECT id FROM contracts').all()).toEqual([{ id: 'contract-1' }]);
    db.close();
  });

  it('rolls back contract deletions if rebuilding the FTS index fails', () => {
    const db = createDb(`
      id TEXT PRIMARY KEY,
      contracting_authority_id TEXT,
      scope TEXT
    `);
    db.prepare('INSERT INTO contracting_authorities VALUES (?, ?, ?)').run('municipal', 1, 'Directa Municipal');
    db.prepare('INSERT INTO contracts VALUES (?, ?, ?)').run('municipal-contract', 'municipal', 'legacy');
    db.prepare('INSERT INTO contracts VALUES (?, ?, ?)').run('external-contract', 'external', 'legacy');

    expect(() => filterMunicipalData(db)).toThrow(/no such column: case_number/i);
    expect(db.prepare('SELECT id FROM contracts ORDER BY id').all()).toEqual([
      { id: 'external-contract' },
      { id: 'municipal-contract' },
    ]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'contracts_fts'").get()).toBeUndefined();
    db.close();
  });

  it('keeps only municipal contracts and rebuilds the search index on success', () => {
    const db = createDb();
    db.prepare('INSERT INTO contracting_authorities VALUES (?, ?, ?)').run('municipal', 1, 'Directa Municipal');
    db.prepare('INSERT INTO contracting_authorities VALUES (?, ?, ?)').run('external', 1, 'Otra entidad');
    db.prepare('INSERT INTO contracts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'municipal-contract', 'municipal', 'legacy', 'EXP/1', 'Servicio municipal',
      'Ayuntamiento', 'Empresa', 'B12345678', 2026, 'Servicios', 'Abierto', 'Adjudicado', '2026-01-01'
    );
    db.prepare('INSERT INTO contracts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'external-contract', 'external', 'legacy', 'EXP/2', 'Servicio externo',
      'Otra entidad', 'Empresa', 'B87654321', 2026, 'Servicios', 'Abierto', 'Adjudicado', '2026-01-02'
    );

    const result = filterMunicipalData(db);

    expect(result).toEqual({ initialCount: 2, finalCount: 1, removedCount: 1 });
    expect(db.prepare('SELECT id, scope FROM contracts').all()).toEqual([
      { id: 'municipal-contract', scope: 'Directa Municipal' },
    ]);
    expect(db.prepare('SELECT id FROM contracts_fts').all()).toEqual([{ id: 'municipal-contract' }]);
    db.close();
  });

  it('removes dependent rows for filtered contracts and prunes orphan alerts', () => {
    const db = createDb();
    db.prepare('INSERT INTO contracting_authorities VALUES (?, ?, ?)').run('municipal', 1, 'Directa Municipal');
    db.prepare('INSERT INTO contracting_authorities VALUES (?, ?, ?)').run('external', 1, 'Otra entidad');
    const insertContract = db.prepare('INSERT INTO contracts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    insertContract.run('municipal-contract', 'municipal', 'legacy', 'EXP/1', 'Servicio municipal', 'Ayuntamiento', 'Empresa', 'B12345678', 2026, 'Servicios', 'Abierto', 'Adjudicado', '2026-01-01');
    insertContract.run('external-contract', 'external', 'legacy', 'EXP/2', 'Servicio externo', 'Otra entidad', 'Empresa', 'B87654321', 2026, 'Servicios', 'Abierto', 'Adjudicado', '2026-01-02');

    const childTables = [
      'contract_lots',
      'modifications',
      'contract_documents',
      'contract_awards',
      'lot_awards',
      'verified_contract_metadata',
    ];
    for (const table of childTables) {
      db.exec(`CREATE TABLE "${table}" (id TEXT, contract_id TEXT)`);
      db.prepare(`INSERT INTO "${table}" VALUES (?, ?), (?, ?)`).run(
        'municipal-child', 'municipal-contract', 'external-child', 'external-contract'
      );
    }
    db.exec('CREATE TABLE related_contracts (group_id TEXT, contract_id TEXT)');
    db.prepare('INSERT INTO related_contracts VALUES (?, ?), (?, ?)').run(
      'municipal-group', 'municipal-contract', 'external-group', 'external-contract'
    );
    db.exec('CREATE TABLE alerts (id TEXT PRIMARY KEY)');
    db.exec('CREATE TABLE alert_contracts (alert_id TEXT, contract_id TEXT)');
    db.prepare('INSERT INTO alerts VALUES (?), (?)').run('municipal-alert', 'external-alert');
    db.prepare('INSERT INTO alert_contracts VALUES (?, ?), (?, ?)').run(
      'municipal-alert', 'municipal-contract', 'external-alert', 'external-contract'
    );

    filterMunicipalData(db);

    for (const table of childTables) {
      expect(db.prepare(`SELECT contract_id FROM "${table}"`).all()).toEqual([
        { contract_id: 'municipal-contract' },
      ]);
    }
    expect(db.prepare('SELECT contract_id FROM related_contracts').all()).toEqual([
      { contract_id: 'municipal-contract' },
    ]);
    expect(db.prepare('SELECT alert_id, contract_id FROM alert_contracts').all()).toEqual([
      { alert_id: 'municipal-alert', contract_id: 'municipal-contract' },
    ]);
    expect(db.prepare('SELECT id FROM alerts').all()).toEqual([{ id: 'municipal-alert' }]);
    db.close();
  });

});
