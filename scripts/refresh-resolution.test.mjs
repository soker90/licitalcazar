import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildPairsQuery } = require('./refresh-resolution.js');
const { DatabaseSync } = require('node:sqlite');

const SCRIPT_PATH = path.resolve(import.meta.dirname, './refresh-resolution.js');

describe('refresh-resolution catalog source', () => {
  it('uses awarded lot awardees for every lotized contract', () => {
    const source = fs.readFileSync(SCRIPT_PATH, 'utf8');

    expect(source).toContain('FROM contract_lots ll');
    expect(source).toContain("eligibleAwardLotStatusSql('ll')");
    expect(source).toContain('NOT EXISTS (');
    expect(source).toContain('parent_lot.contract_id = contracts.id');
    expect(source).not.toContain("c.awardee = 'Varios adjudicatarios'");
    expect(buildPairsQuery(true)).toContain('FROM lot_awards award');
  });

  it('builds a working legacy fallback query without referencing a missing lot_awards table', () => {
    const query = buildPairsQuery(false);

    expect(query).not.toContain('lot_awards');
    expect(query).toContain('FROM contract_lots ll');
    expect(query).toContain("lower(coalesce(ll.lot_status, '')) NOT LIKE '%cancel%'");
  });

  it('executes the legacy fallback query against a schema without lot_awards', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (id TEXT, awardee_nif TEXT, awardee TEXT);
      CREATE TABLE contract_lots (
        contract_id TEXT, awardee_nif TEXT, awardee TEXT, lot_status TEXT
      );
      INSERT INTO contracts VALUES ('parent', 'B12345678', 'Empresa principal');
      INSERT INTO contract_lots VALUES ('lot-parent', 'B87654321', 'Empresa lote', 'Adjudicado');
    `);

    const pairs = db.prepare(buildPairsQuery(false)).all();
    expect(pairs).toHaveLength(2);
    expect(pairs).toEqual(expect.arrayContaining([
      { raw_nif: 'B12345678', raw_name: 'Empresa principal' },
      { raw_nif: 'B87654321', raw_name: 'Empresa lote' },
    ]));
    db.close();
  });

  it('includes lot_awards and falls back to contract_lots when unavailable', () => {
    const source = fs.readFileSync(SCRIPT_PATH, 'utf8');

    expect(source).toContain("name = 'lot_awards'");
    expect(source).toContain('FROM lot_awards award');
    const query = buildPairsQuery(true);
    expect(query).toContain('award.contract_id = contracts.id');
    expect(query).toContain('award.result_state');
    expect(query).toContain('FROM lot_awards award');
  });

  it('uses current lot awards while falling back only for uncovered lots', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (id TEXT, awardee_nif TEXT, awardee TEXT);
      CREATE TABLE contract_lots (
        contract_id TEXT, lot_number TEXT, awardee_nif TEXT, awardee TEXT, lot_status TEXT
      );
      CREATE TABLE lot_awards (
        contract_id TEXT, lot_number TEXT, awardee_nif TEXT, awardee TEXT, result_state TEXT
      );
      INSERT INTO contracts VALUES ('C1', NULL, NULL);
      INSERT INTO contract_lots VALUES ('C1', '1', 'OLD1', 'Empresa antigua', 'Adjudicado');
      INSERT INTO contract_lots VALUES ('C1', '2', 'LEG2', 'Empresa legado', 'Adjudicado');
      INSERT INTO lot_awards VALUES ('C1', '1', 'NEW1', 'Empresa actual', 'AWARDED');
    `);

    const pairs = db.prepare(buildPairsQuery(true)).all();
    expect(pairs).toEqual(expect.arrayContaining([
      { raw_nif: 'NEW1', raw_name: 'Empresa actual' },
      { raw_nif: 'LEG2', raw_name: 'Empresa legado' },
    ]));
    expect(pairs).not.toContainEqual({ raw_nif: 'OLD1', raw_name: 'Empresa antigua' });
    db.close();
  });

  it('does not revive an old awardee when the structured lot is deserted', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (id TEXT, awardee_nif TEXT, awardee TEXT);
      CREATE TABLE contract_lots (
        contract_id TEXT, lot_number TEXT, awardee_nif TEXT, awardee TEXT, lot_status TEXT
      );
      CREATE TABLE lot_awards (
        contract_id TEXT, lot_number TEXT, awardee_nif TEXT, awardee TEXT, result_state TEXT
      );
      INSERT INTO contracts VALUES ('C1', NULL, NULL);
      INSERT INTO contract_lots VALUES ('C1', '1', 'OLD1', 'Empresa antigua', 'Desierto');
      INSERT INTO lot_awards VALUES ('C1', '1', 'OLD1', 'Empresa antigua', 'AWARDED');
    `);

    const pairs = db.prepare(buildPairsQuery(true)).all();
    expect(pairs).not.toContainEqual({ raw_nif: 'OLD1', raw_name: 'Empresa antigua' });
    db.close();
  });

  it('does not revive a legacy awardee for a terminal structured result state', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (id TEXT, awardee_nif TEXT, awardee TEXT);
      CREATE TABLE contract_lots (
        contract_id TEXT, lot_number TEXT, awardee_nif TEXT, awardee TEXT, lot_status TEXT
      );
      CREATE TABLE lot_awards (
        contract_id TEXT, lot_number TEXT, awardee_nif TEXT, awardee TEXT, result_state TEXT
      );
      INSERT INTO contracts VALUES ('C1', NULL, NULL);
      INSERT INTO contract_lots VALUES
        ('C1', '1', 'OLD1', 'Empresa antigua cancelada', 'Adjudicado'),
        ('C1', '2', 'OLD2', 'Empresa antigua rechazada', 'Adjudicado');
      INSERT INTO lot_awards VALUES
        ('C1', '1', NULL, NULL, 'CANCELLED'),
        ('C1', '2', NULL, NULL, 'REJECTED');
    `);

    const pairs = db.prepare(buildPairsQuery(true)).all();
    expect(pairs).not.toContainEqual({ raw_nif: 'OLD1', raw_name: 'Empresa antigua cancelada' });
    expect(pairs).toContainEqual({ raw_nif: 'OLD2', raw_name: 'Empresa antigua rechazada' });
    db.close();
  });

  it('falls back to the prior lot awardee for a provisional desertion notice', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (id TEXT, awardee_nif TEXT, awardee TEXT);
      CREATE TABLE contract_lots (
        contract_id TEXT, lot_number TEXT, awardee_nif TEXT, awardee TEXT, lot_status TEXT
      );
      CREATE TABLE lot_awards (
        contract_id TEXT, lot_number TEXT, awardee_nif TEXT, awardee TEXT, result_state TEXT
      );
      INSERT INTO contracts VALUES ('C1', NULL, NULL);
      INSERT INTO contract_lots VALUES ('C1', '1', 'OLD1', 'Empresa vigente', 'Adjudicado');
      INSERT INTO lot_awards VALUES ('C1', '1', NULL, NULL, 'DESERTED_PROVISIONALLY');
    `);

    const pairs = db.prepare(buildPairsQuery(true)).all();
    expect(pairs).toContainEqual({ raw_nif: 'OLD1', raw_name: 'Empresa vigente' });
    db.close();
  });

  it('excludes pre-award tenderers from the resolution catalog', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (id TEXT, awardee_nif TEXT, awardee TEXT);
      CREATE TABLE contract_lots (
        contract_id TEXT, lot_number TEXT, awardee_nif TEXT, awardee TEXT, lot_status TEXT
      );
      CREATE TABLE lot_awards (
        contract_id TEXT, lot_number TEXT, awardee_nif TEXT, awardee TEXT, result_state TEXT
      );
      CREATE TABLE contract_awards (
        contract_id TEXT, awardee_nif TEXT, awardee TEXT, result_state TEXT
      );
      INSERT INTO contracts VALUES ('C1', NULL, NULL);
      INSERT INTO contract_lots VALUES ('C1', '1', 'LEGACY1', 'Empresa adjudicada', 'Adjudicado');
      INSERT INTO lot_awards VALUES ('C1', '1', 'PROVISIONAL1', 'Licitador mejor valorado', 'BEST_RATED_TENDERER');
      INSERT INTO contract_awards VALUES ('C2', 'PROVISIONAL2', 'Otra empresa provisional', 'BEST_RATED_TENDERER');
    `);

    const pairs = db.prepare(buildPairsQuery(true, true)).all();
    expect(pairs).toContainEqual({ raw_nif: 'LEGACY1', raw_name: 'Empresa adjudicada' });
    expect(pairs).not.toContainEqual({ raw_nif: 'PROVISIONAL1', raw_name: 'Licitador mejor valorado' });
    expect(pairs).not.toContainEqual({ raw_nif: 'PROVISIONAL2', raw_name: 'Otra empresa provisional' });
    db.close();
  });

  it('includes every contract-level awardee instead of the parent summary only', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (id TEXT, awardee_nif TEXT, awardee TEXT);
      CREATE TABLE contract_lots (
        contract_id TEXT, lot_number TEXT, awardee_nif TEXT, awardee TEXT, lot_status TEXT
      );
      CREATE TABLE lot_awards (
        contract_id TEXT, lot_number TEXT, awardee_nif TEXT, awardee TEXT, result_state TEXT
      );
      CREATE TABLE contract_awards (
        contract_id TEXT, awardee_nif TEXT, awardee TEXT, result_state TEXT
      );
      INSERT INTO contracts VALUES ('C1', NULL, 'Varios adjudicatarios');
      INSERT INTO contract_awards VALUES ('C1', 'A1', 'Empresa A', 'AWARDED');
      INSERT INTO contract_awards VALUES ('C1', 'B2', 'Empresa B', 'FORMALIZED');
    `);

    const pairs = db.prepare(buildPairsQuery(true, true)).all();
    expect(pairs).toEqual(expect.arrayContaining([
      { raw_nif: 'A1', raw_name: 'Empresa A' },
      { raw_nif: 'B2', raw_name: 'Empresa B' },
    ]));
    expect(pairs).not.toContainEqual({ raw_nif: '', raw_name: 'Varios adjudicatarios' });
    db.close();
  });

  it('uses the SQLite-backed resolver so catalog mappings are preserved', () => {
    const source = fs.readFileSync(SCRIPT_PATH, 'utf8');

    expect(source).toContain("import('../src/lib/db-corporate.ts')");
    expect(source).toContain('resolveEntityFromDb(db, pair.raw_nif, pair.raw_name)');
    expect(source).not.toContain("import('../src/lib/corporate.ts')");
    expect(source).not.toContain('resolveEntity(pair.raw_nif, pair.raw_name)');
  });

  it('reconcilia lot_awards por lote, sin depender de la cobertura completa del expediente', () => {
    const source = fs.readFileSync(SCRIPT_PATH, 'utf8');

    const query = buildPairsQuery(true);
    expect(query).toContain('award.lot_number = ll.lot_number');
    expect(query).toContain('AND NOT EXISTS (');
    expect(query).not.toContain('count(DISTINCT award.lot_number)');
    expect(query).not.toContain('count(DISTINCT lot.lot_number)');
  });
  it('no exige awardee en contract_lots para considerar cubierto un lote con lot_awards', () => {
    const query = buildPairsQuery(true);

    expect(query).not.toContain('lot.awardee IS NOT NULL');
    expect(query).not.toContain("trim(lot.awardee) <> ''");
    expect(query).toContain('lot.lot_status');
    expect(query).toContain('award.awardee IS NOT NULL');
  });

  it('excludes terminal legacy lots and does not revive their structured awardees', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (id TEXT, awardee_nif TEXT, awardee TEXT);
      CREATE TABLE contract_lots (
        contract_id TEXT, lot_number TEXT, awardee_nif TEXT, awardee TEXT, lot_status TEXT
      );
      CREATE TABLE lot_awards (
        contract_id TEXT, lot_number TEXT, awardee_nif TEXT, awardee TEXT, result_state TEXT
      );
      INSERT INTO contracts VALUES ('C1', NULL, NULL);
    `);

    const statuses = [
      'Desierto', 'Anulada', 'Cancelado', 'Renunciado',
      'Desestimado', 'Desistido', 'Retirado', 'Withdrawn',
      'Deserted', 'Annulled', 'Cancelled', 'Renounced', 'Rejected',
    ];
    const insertLot = db.prepare(`
      INSERT INTO contract_lots VALUES ('C1', ?, ?, ?, ?)
    `);
    const insertAward = db.prepare(`
      INSERT INTO lot_awards VALUES ('C1', ?, ?, ?, 'AWARDED')
    `);

    statuses.forEach((status, index) => {
      const lotNumber = String(index + 1);
      insertLot.run(lotNumber, `NIF${index}`, `Empresa terminal ${index}`, status);
      insertAward.run(lotNumber, `NIF${index}`, `Empresa terminal ${index}`);
    });
    insertLot.run(String(statuses.length + 1), 'ACTIVE', 'Empresa activa', 'Adjudicado');
    insertAward.run(String(statuses.length + 1), 'ACTIVE', 'Empresa activa');

    const pairs = db.prepare(buildPairsQuery(true)).all();
    expect(pairs).toContainEqual({ raw_nif: 'ACTIVE', raw_name: 'Empresa activa' });
    for (let index = 0; index < statuses.length; index++) {
      expect(pairs).not.toContainEqual({
        raw_nif: `NIF${index}`,
        raw_name: `Empresa terminal ${index}`,
      });
    }
    db.close();
  });

});
