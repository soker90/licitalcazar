import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createGeneratedTestDb } from './test-db';
import { setDbForTests } from './db';
import { getContratosVivosStats } from './contratos-vivos';

afterEach(() => setDbForTests(null));

describe('Contratos Vivos: adjudicatarios de lotes', () => {
  it('resuelve los adjudicatarios reales de expedientes multiganador sin duplicar el expediente', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/contratos-vivos.ts'), 'utf8');
    const start = source.indexOf('export function getContratosVivosStats');
    const end = source.indexOf('\n}', start);
    const query = source.slice(start, end);

    expect(query).toContain('const lotAwardsAwardeeCovered = hasLotAwardsTable');
    expect(query).toContain('CASE WHEN ${lotAwardsAwardeeCovered}');
    expect(query).toContain('FROM contract_lots lot');
    expect(query).toContain('lot.contract_id = contracts.id');
    expect(query).toContain("eligibleAwardLotStatusSql('lot')");
    expect(query).toContain("eligibleAwardResultStateSql('award')");
    expect(query).toContain('award.lot_number = lot.lot_number');
    expect(query).toContain('group_concat(DISTINCT lot.awardee)');
    expect(query).toContain('const lotAwardsAmountCovered = hasLotAwardsTable');
  });
  it('usa el volumen adjudicado de los lotes no desiertos sin duplicar el expediente', () => {
    const db = createGeneratedTestDb(20261001, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Formalizada',
          award_amount_type = 'total',
          awarded_amount = NULL,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          is_lotized = 1,
          lot_count = 3,
          award_date = '2024-01-01',
          formalization_date = '2024-01-01',
          publication_date = '2024-01-02',
          duration = '36',
          duration_unit = 'MON'
      WHERE id = 'generated-20261001-1'
    `).run();

    const insertLot = db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awardee, lot_status, awarded_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertLot.run('vivos-lot-1', 'generated-20261001-1', 'GEN/2024/1', '1', 'Lote 1', 'Empresa A', 'Adjudicado', 6000);
    insertLot.run('vivos-lot-2', 'generated-20261001-1', 'GEN/2024/1', '2', 'Lote 2', 'Empresa B', 'Adjudicado', 4000);
    insertLot.run('vivos-lot-3', 'generated-20261001-1', 'GEN/2024/1', '3', 'Lote 3', 'Empresa C', 'Desierta', 5000);

    const stats = getContratosVivosStats(() => db, undefined, new Date('2025-01-01'));

    expect(stats.kpis.totalVivos).toBe(1);
    expect(stats.todosVivos[0]?.amount).toBe(10000);
  });
  it('usa los adjudicatarios de los lotes aunque el padre tenga un adjudicatario distinto', () => {
    const db = createGeneratedTestDb(20261001, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Formalizada',
          award_amount_type = 'total',
          awarded_amount = NULL,
          awardee = 'Adjudicatario cabecera',
          awardee_nif = 'B00000000',
          is_lotized = 1,
          lot_count = 2,
          award_date = '2024-01-01',
          formalization_date = '2024-01-01',
          publication_date = '2024-01-02',
          duration = '36',
          duration_unit = 'MON'
      WHERE id = 'generated-20261001-1'
    `).run();

    const insertLot = db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awardee, awardee_nif, lot_status, awarded_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertLot.run('vivos-parent-lot-1', 'generated-20261001-1', 'GEN/2024/1', '1', 'Lote 1', 'Empresa Lote A', 'B11111111', 'Adjudicado', 6000);
    insertLot.run('vivos-parent-lot-2', 'generated-20261001-1', 'GEN/2024/1', '2', 'Lote 2', 'Empresa Lote B', 'B22222222', 'Adjudicado', 4000);

    const stats = getContratosVivosStats(() => db, undefined, new Date('2025-01-01'));

    expect(stats.kpis.totalVivos).toBe(1);
    expect(stats.todosVivos[0]?.awardee).toBe('Empresa Lote A,Empresa Lote B');
    expect(stats.todosVivos[0]?.nifAdjudicatario).toBeNull();
  });

  it('prefiere los adjudicatarios de lot_awards cuando existen', () => {
    const db = createGeneratedTestDb(20261001, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Formalizada',
          award_amount_type = 'total',
          awarded_amount = NULL,
          awardee = '',
          awardee_nif = 'B00000000',
          is_lotized = 1,
          lot_count = 2,
          award_date = '2024-01-01',
          formalization_date = '2024-01-01',
          publication_date = '2024-01-02',
          duration = '36',
          duration_unit = 'MON'
      WHERE id = 'generated-20261001-1'
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'vivos-award-1',
      'generated-20261001-1',
      'GEN/2024/1',
      '1',
      0,
      'Empresa Award A',
      'B33333333',
      'Adjudicado'
    );
    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'vivos-award-2',
      'generated-20261001-1',
      'GEN/2024/1',
      '2',
      0,
      'Empresa Award B',
      'B44444444',
      'Adjudicado'
    );

    const stats = getContratosVivosStats(() => db, undefined, new Date('2025-01-01'));

    expect(stats.kpis.totalVivos).toBe(1);
    expect(stats.todosVivos[0]?.awardee).toBe('Empresa Award A,Empresa Award B');
    expect(stats.todosVivos[0]?.nifAdjudicatario).toBeNull();
  });

  it('mantiene contract_lots cuando lot_awards solo cubre parte de los lotes', () => {
    const db = createGeneratedTestDb(20261001, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Formalizada',
          award_amount_type = 'total',
          awarded_amount = NULL,
          awardee = '',
          is_lotized = 1,
          lot_count = 2,
          award_date = '2024-01-01',
          formalization_date = '2024-01-01',
          publication_date = '2024-01-02',
          duration = '36',
          duration_unit = 'MON'
      WHERE id = 'generated-20261001-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awardee, lot_status, awarded_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('vivos-amount-lot-1', 'generated-20261001-1', 'GEN/2024/1', '1', 'Lote 1', 'Empresa Lote A', 'Adjudicado', 9000);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awardee, lot_status, awarded_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('vivos-amount-lot-2', 'generated-20261001-1', 'GEN/2024/1', '2', 'Lote 2', 'Empresa Lote B', 'Adjudicado', 1000);

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('vivos-amount-award-1', 'generated-20261001-1', 'GEN/2024/1', '1', 0, 'Empresa Award A', 400, 'Adjudicado');
    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('vivos-amount-award-2', 'generated-20261001-1', 'GEN/2024/1', '1', 1, 'Empresa Award B', 600, 'Adjudicado');

    const stats = getContratosVivosStats(() => db, undefined, new Date('2025-01-01'));

    expect(stats.kpis.totalVivos).toBe(1);
    expect(stats.todosVivos[0]?.amount).toBe(10000);
  });

  it('mantiene contract_lots cuando un lote sin importe deja parcial el snapshot de lot_awards', () => {
    const db = createGeneratedTestDb(20261012, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Formalizada',
          award_amount_type = 'total',
          awarded_amount = NULL,
          awardee = '',
          is_lotized = 1,
          lot_count = 2,
          award_date = '2024-01-01',
          formalization_date = '2024-01-01',
          publication_date = '2024-01-02',
          duration = '36',
          duration_unit = 'MON'
      WHERE id = 'generated-20261012-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awardee, lot_status, awarded_amount
      ) VALUES
        ('vivos-null-amount-lot-1', 'generated-20261012-1', 'GEN/2024/1', '1', 'Lote 1', 'Empresa Lote A', 'Adjudicado', 9000),
        ('vivos-null-amount-lot-2', 'generated-20261012-1', 'GEN/2024/1', '2', 'Lote 2', 'Empresa Lote B', 'Pendiente', NULL)
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, result_state
      ) VALUES ('vivos-null-amount-award-1', 'generated-20261012-1', 'GEN/2024/1', '1', 0, 'Empresa Award A', 400, 'Adjudicado')
    `).run();

    const stats = getContratosVivosStats(() => db, undefined, new Date('2025-01-01'));

    expect(stats.kpis.totalVivos).toBe(1);
    expect(stats.todosVivos[0]?.amount).toBe(9000);
  });


});
