import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { explicitlyAwardedContractStatusSql, flowContractStatusSql, resolvedContractStatusSql, resolvedUnawardedContractSql, terminalContractStatusSql } from './contract-status-sql';

describe('explicitly awarded contract status SQL', () => {
  it('recognizes awarded and formalized statuses independently of winner metadata', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE contracts (id TEXT, status TEXT)');
      const insert = db.prepare('INSERT INTO contracts (id, status) VALUES (?, ?)');
      insert.run('awarded-es', 'Adjudicada');
      insert.run('awarded-en', 'Awarded');
      insert.run('formalized-es', 'Formalizada');
      insert.run('formalized-en', 'Formalized');
      insert.run('published', 'Publicada');
      insert.run('not-awarded', 'No adjudicado');

      const rows = db.prepare(`
        SELECT id FROM contracts
        WHERE ${explicitlyAwardedContractStatusSql('contracts')}
        ORDER BY id
      `).all() as { id: string }[];

      expect(rows.map((row) => row.id)).toEqual([
        'awarded-en',
        'awarded-es',
        'formalized-en',
        'formalized-es',
      ]);

      const source = readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
      expect(source).toContain("flowContractStatusSql('c', { hasLotAwardsTable, hasContractLotsTable: true })");
    } finally {
      db.close();
    }
  });
});

describe('economic flow status classification SQL', () => {
  it('assigns one exclusive state when winner metadata conflicts with the contract status', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE contracts (
          id TEXT PRIMARY KEY, status TEXT, offer_count INTEGER, awardee TEXT
        );
        CREATE TABLE contract_lots (
          id TEXT PRIMARY KEY, contract_id TEXT, lot_number TEXT, lot_status TEXT,
          awardee TEXT, awarded_amount REAL
        );
        CREATE TABLE lot_awards (
          id TEXT PRIMARY KEY, contract_id TEXT, lot_number TEXT,
          awardee TEXT, awarded_amount REAL, result_state TEXT
        );
        INSERT INTO contracts (id, status, offer_count, awardee) VALUES
          ('awarded-no-awardee', 'Adjudicada', 1, NULL),
          ('cancelled-residual', 'Cancelled', 1, 'Empresa residual'),
          ('deserted-residual', 'Desierta', 1, 'Empresa residual'),
          ('formalized-no-awardee', 'Formalizada', 1, NULL),
          ('published-residual', ' publicada ', 1, 'Empresa residual'),
          ('published-english', 'Published', 1, 'Empresa residual'),
          ('evaluation-english', 'Under evaluation', 1, NULL),
          ('evaluation-unaccented', 'En evaluacion', 1, NULL),
          ('resolved-unawarded', 'Resuelta', 0, NULL),
          ('unknown-no-awardee', 'Pendiente', 0, NULL);
      `);

      const rows = db.prepare(`
        SELECT id, ${flowContractStatusSql('contracts')}
        AS flow_state FROM contracts ORDER BY id
      `).all() as { id: string; flow_state: string }[];

      expect(rows).toEqual([
        { id: 'awarded-no-awardee', flow_state: 'adjudicada' },
        { id: 'cancelled-residual', flow_state: 'anulada' },
        { id: 'deserted-residual', flow_state: 'desierta' },
        { id: 'evaluation-english', flow_state: 'en_curso' },
        { id: 'evaluation-unaccented', flow_state: 'en_curso' },
        { id: 'formalized-no-awardee', flow_state: 'adjudicada' },
        { id: 'published-english', flow_state: 'en_curso' },
        { id: 'published-residual', flow_state: 'en_curso' },
        { id: 'resolved-unawarded', flow_state: 'desierta' },
        { id: 'unknown-no-awardee', flow_state: 'desierta' },
      ]);

      const source = readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
      expect(source).toContain("flowContractStatusSql('c', { hasLotAwardsTable, hasContractLotsTable: true })");
      expect(source).toContain("inCourseContractStatusSql('c')");
      expect(source).toContain("sum(CASE WHEN flow_state = 'adjudicada' THEN 1 ELSE 0 END) as adj_count");
      expect(source).toContain("sum(CASE WHEN flow_state = 'desierta' THEN 1 ELSE 0 END) as des_count");
      expect(source).toContain("sum(CASE WHEN flow_state = 'en_curso' THEN 1 ELSE 0 END) as cur_count");
      expect(source).toContain("sum(CASE WHEN flow_state = 'anulada' THEN 1 ELSE 0 END) as anu_count");
      expect(source).not.toContain("sum(CASE WHEN status IN ('Publicada', 'En evaluación') THEN 1 ELSE 0 END) as cur_count");
    } finally {
      db.close();
    }
  });
});

describe('resolved contract status SQL', () => {
  it('recognizes resolved statuses in English and Spanish without matching unresolved phrases', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        status TEXT,
        offer_count INTEGER,
        awardee TEXT
      );
      CREATE TABLE contract_lots (
        id TEXT PRIMARY KEY,
        contract_id TEXT,
        lot_number TEXT,
        lot_status TEXT,
        awardee TEXT,
        awarded_amount REAL
      );
      CREATE TABLE lot_awards (
        id TEXT PRIMARY KEY,
        contract_id TEXT,
        lot_number TEXT,
        awardee TEXT,
        awarded_amount REAL,
        result_state TEXT
      );`);
      const insert = db.prepare('INSERT INTO contracts (id, status, offer_count, awardee) VALUES (?, ?, ?, ?)');
      insert.run('es-no-award', 'Resuelta', 0, null);
      insert.run('en-no-award', 'Resolved', 0, null);
      insert.run('en-resolved-prefix', 'Resolved - no award', 2, 'Empresa válida');
      insert.run('unresolved', 'Unresolved', 0, null);
      insert.run('no-resuelta', 'No resuelta', 0, null);
      insert.run('cancelled', 'Cancelled', 0, null);
      insert.run('deserted', 'Deserted', 0, null);
      insert.run('multi-lot-awarded', 'Resuelta', 0, 'Varios adjudicatarios');
      db.prepare(`
        INSERT INTO contract_lots (id, contract_id, lot_number, lot_status, awardee, awarded_amount)
        VALUES ('valid-lot', 'multi-lot-awarded', '1', 'Adjudicado', 'Empresa válida', 1000)
      `).run();
      db.prepare(`
        INSERT INTO lot_awards (id, contract_id, lot_number, awardee, awarded_amount, result_state)
        VALUES ('valid-award', 'multi-lot-awarded', '1', 'Empresa válida', 1000, 'Adjudicado')
      `).run();

      const resolved = db.prepare(`
        SELECT id FROM contracts c
        WHERE ${resolvedContractStatusSql('c')}
        ORDER BY id
      `).all() as { id: string }[];
      expect(resolved.map((row) => row.id)).toEqual([
        'en-no-award',
        'en-resolved-prefix',
        'es-no-award',
        'multi-lot-awarded',
      ]);

      const terminal = db.prepare(`
        SELECT id FROM contracts c
        WHERE ${terminalContractStatusSql('c')}
        ORDER BY id
      `).all() as { id: string }[];
      expect(terminal.map((row) => row.id)).toEqual(['cancelled', 'deserted', 'en-no-award', 'es-no-award']);

      const unawarded = db.prepare(`
        SELECT id FROM contracts c
        WHERE ${resolvedUnawardedContractSql('c')}
        ORDER BY id
      `).all() as { id: string }[];
      expect(unawarded.map((row) => row.id)).toEqual(['en-no-award', 'es-no-award']);
    } finally {
      db.close();
    }
  });

  it('uses shared status predicates across economic-flow and aggregate queries', () => {
    const source = readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
    expect(source).toContain('resolvedContractStatusSql');
    expect(source).toContain("resolvedContractStatusSql('')");
    expect(source).toContain("resolvedContractStatusSql('cs')");
    expect(source).toContain('resolvedUnawardedContractSql');
    expect(source).toContain("NOT ${terminalContractStatusSql('u')}");
    expect(source).toContain("NOT ${terminalContractStatusSql('l')}");
    expect(source).toContain("NOT ${terminalContractStatusSql('minor_source')}");
    expect(source).not.toContain("status = 'Resuelta' AND (offer_count = 0");
    expect(source).not.toContain("lower(coalesce(status, '')) LIKE '%resuelta%'");
    expect(source).not.toContain("status NOT IN ('Desierta', 'Anulada')");
    expect(source).not.toContain("l.status = 'Desierta'");

    const buildSource = readFileSync(new URL('../../scripts/build-db.js', import.meta.url), 'utf8');
    expect(buildSource).toContain("resolvedContractStatusSql('contracts')");
    expect(buildSource).toContain("terminalContractStatusSql('contracts')");
    expect(buildSource).not.toContain("status IN ('Adjudicada', 'Formalizada', 'Resuelta')");

    const modifiedSource = readFileSync(new URL('./modificados.ts', import.meta.url), 'utf8');
    expect(modifiedSource).toContain("NOT ${terminalContractStatusSql('l')}");
    expect(modifiedSource).not.toContain("l.status NOT IN ('Desierta', 'Anulada')");

    const syncSource = readFileSync(new URL('../../scripts/sync.js', import.meta.url), 'utf8');
    expect(syncSource).toContain("NOT ${terminalContractStatusSql('contracts')}");
    expect(syncSource).not.toContain("contracts.status NOT IN ('Desierta', 'Anulada')");

    const snapshotSource = readFileSync(new URL('../../scripts/compare-db-snapshots.js', import.meta.url), 'utf8');
    expect(snapshotSource).toContain("terminalContractStatusSql('contracts', { hasLotAwardsTable, hasContractLotsTable })");
    expect(snapshotSource).toContain('hasStatusColumn');
    expect(snapshotSource).toContain('hasOfferCountColumn && hasAwardeeColumn');
    expect(snapshotSource).toContain("NOT (${desertedContractStatusSql('contracts')} OR ${canceledContractStatusSql('contracts')})");
    expect(snapshotSource).not.toContain("contracts.status NOT IN ('Desierta', 'Anulada')");
  });
});
