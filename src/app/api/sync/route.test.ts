import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import { GET, POST } from './route';
import { setDbForTests } from '../../../lib/db';
import { createGeneratedTestDb } from '../../../lib/test-db';

describe('estadísticas del endpoint de sync', () => {
  let db: ReturnType<typeof createGeneratedTestDb> | null = null;

  afterEach(() => {
    setDbForTests(null);
    db?.close();
    db = null;
  });

  it('calcula el volumen adjudicado con lotes cuando existen adjudicaciones por lote', () => {
    const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');

    expect(source).toContain('SELECT round(sum(lot.awarded_amount), 2)');
    expect(source).toContain('lot.contract_id = contracts.id');
    expect(source).toContain('lotAwardsAmountCoverageSql');
    expect(source).not.toContain('count(DISTINCT lot.lot_number)');
    expect(source).toContain("eligibleAwardLotStatusSql('lot')");
    expect(source).toContain("allowParentAwardAmountFallbackSql('contracts', hasLotAwardsTable)");
    expect(source).not.toContain('coalesce(awarded_amount, amount_excl_vat, 0)');
  });

  it('ignora resultados previos a la adjudicación al calcular el volumen público', async () => {
    db = createGeneratedTestDb(20261031, 1);
    setDbForTests(db);

    const contractId = 'generated-20261031-1';
    db.prepare(`
      UPDATE contracts
      SET procedure = 'Abierto', award_amount_type = 'total',
          awarded_amount = NULL, awarded_amount_incl_vat = NULL,
          awardee = 'Varios adjudicatarios', is_lotized = 1, lot_count = 1
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awarded_amount_incl_vat, lot_status, awardee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sync-pre-award-lot', contractId, 'GEN/2024/31', '1',
      'Lote único', 1000, 1210, 'Adjudicado', 'Empresa adjudicada');

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, awarded_amount_incl_vat, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sync-pre-award-result', contractId, 'GEN/2024/31', '1', 0,
      'Licitador mejor valorado', 900, 1089, 'BEST_RATED_TENDERER');

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Number(body.volumenTotalEuros)).toBeCloseTo(1000, 6);
  });

  it('no suma adjudicaciones estructuradas de lotes legacy cancelados', async () => {
    db = createGeneratedTestDb(20261030, 1);
    setDbForTests(db);

    const contractId = 'generated-20261030-1';
    db.prepare(`
      UPDATE contracts
      SET procedure = 'Abierto', award_amount_type = 'total',
          awarded_amount = NULL, awardee = 'Varios adjudicatarios'
      WHERE id = ?
    `).run(contractId);

    const insertLot = db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name, awarded_amount, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertLot.run('sync-active-lot-30', contractId, 'GEN/2024/30', '1', 'Lote activo', 100, 'Adjudicado');
    insertLot.run('sync-cancelled-lot-30', contractId, 'GEN/2024/30', '2', 'Lote cancelado', 200, 'Cancelado');

    const insertAward = db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAward.run('sync-award-active-30', contractId, 'GEN/2024/30', '1', 0, 'Empresa Activa', 100, 'Adjudicado');
    insertAward.run('sync-award-cancelled-30', contractId, 'GEN/2024/30', '2', 0, 'Empresa Cancelada', 200, 'Adjudicado');

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Number(body.volumenTotalEuros)).toBeCloseTo(100, 6);
  });

  it('excluye importes residuales de lotes legacy Cancelled del volumen público', async () => {
    db = createGeneratedTestDb(20261013, 1);
    setDbForTests(db);

    const contractId = 'generated-20261013-1';
    db.prepare(`
      UPDATE contracts
      SET procedure = 'Abierto', award_amount_type = 'total', awarded_amount = NULL
      WHERE id = ?
    `).run(contractId);

    const insertLot = db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name, awarded_amount, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertLot.run('sync-active-lot-13', contractId, 'GEN/2024/13', '1', 'Lote activo', 100, 'Adjudicado');
    insertLot.run('sync-cancelled-lot-13', contractId, 'GEN/2024/13', '2', 'Lote cancelado', 200, 'Cancelled');

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Number(body.volumenTotalEuros)).toBeCloseTo(100, 6);
  });

  it('mantiene contract_lots cuando la cardinalidad de awards coincide pero los lotes no', async () => {
    db = createGeneratedTestDb(20261003, 1);
    setDbForTests(db);

    const contractId = 'generated-20261003-1';
    db.prepare(`UPDATE contracts SET procedure = 'Abierto', award_amount_type = 'total', awarded_amount = NULL WHERE id = ?`).run(contractId);

    const insertLot = db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, awarded_amount, lot_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insertLot.run('sync-set-lot-1', contractId, 'GEN/2024/2', '1', 'Lote 1', 100, 'Adjudicado');
    insertLot.run('sync-set-lot-2', contractId, 'GEN/2024/2', '2', 'Lote 2', 200, 'Adjudicado');

    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertAward.run('sync-set-award-1', contractId, 'GEN/2024/2', '1', 0, 'Empresa Award 1', 90, 'Adjudicado');
    insertAward.run('sync-set-award-3', contractId, 'GEN/2024/2', '3', 0, 'Empresa Award 3', 180, 'Adjudicado');

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Number(body.volumenTotalEuros)).toBeCloseTo(300, 6);
  });

  it('mantiene contract_lots con cobertura parcial y usa lot_awards con cobertura completa', async () => {
    db = createGeneratedTestDb(20261003, 1);
    setDbForTests(db);

    const contractId = 'generated-20261003-1';
    db.prepare(`
      UPDATE contracts
      SET procedure = 'Abierto',
          award_amount_type = 'total',
          awarded_amount = NULL
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'sync-stats-lot-1', contractId, 'GEN/2024/1', '1', 'Lote 1', 100, 'Adjudicado',
    );
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'sync-stats-lot-2', contractId, 'GEN/2024/1', '2', 'Lote 2', 200, 'Adjudicado',
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'sync-stats-award-1', contractId, 'GEN/2024/1', '1', 0,
      'Empresa Canonica A', 90, 'Adjudicado',
    );

    const partialResponse = await GET();
    expect(partialResponse.status).toBe(200);
    const partialBody = await partialResponse.json();
    expect(Number(partialBody.volumenTotalEuros)).toBeCloseTo(300, 6);

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'sync-stats-award-2', contractId, 'GEN/2024/1', '2', 0,
      'Empresa Canonica B', 180, 'Adjudicado',
    );

    const completeResponse = await GET();
    expect(completeResponse.status).toBe(200);
    const completeBody = await completeResponse.json();
    expect(Number(completeBody.volumenTotalEuros)).toBeCloseTo(270, 6);
  });
  it('mantiene contract_lots cuando un lote sin importe deja parcial el snapshot de lot_awards', async () => {
    db = createGeneratedTestDb(20261012, 1);
    setDbForTests(db);

    const contractId = 'generated-20261012-1';
    db.prepare(`
      UPDATE contracts
      SET procedure = 'Abierto',
          award_amount_type = 'total',
          awarded_amount = NULL
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('sync-null-lot-1', contractId, 'GEN/2024/1', '1', 'Lote 1', 100, 'Adjudicado');
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('sync-null-lot-2', contractId, 'GEN/2024/1', '2', 'Lote 2', null, 'Pendiente');

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'sync-null-award-1', contractId, 'GEN/2024/1', '1', 0,
      'Empresa Award', 90, 'Adjudicado',
    );

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Number(body.volumenTotalEuros)).toBeCloseTo(100, 6);
  });

  it('no afirma que ha sincronizado datos cuando POST no ejecuta la ingesta', async () => {
    const response = await POST();
    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('no está disponible'),
    });
  });

});
