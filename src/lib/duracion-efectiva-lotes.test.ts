import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createGeneratedTestDb } from './test-db';
import { setDbForTests } from './db';
import { getDuracionEfectivaStats } from './duracion-efectiva';

afterEach(() => setDbForTests(null));

describe('Duración Efectiva: adjudicatarios de lotes', () => {
  it('resuelve los adjudicatarios reales de expedientes multiganador aunque el padre tenga otro adjudicatario', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/duracion-efectiva.ts'), 'utf8');
    const start = source.indexOf('export function getDuracionEfectivaStats');
    const end = source.indexOf('\n}', start);
    const query = source.slice(start, end);

    expect(query).toContain('const lotAwardsAwardeeCovered = hasLotAwardsTable');
    expect(query).toContain('CASE WHEN ${lotAwardsAwardeeCovered}');
    expect(query).toContain('FROM contract_lots lot');
    expect(query).toContain('lot.contract_id = contracts.id');
    expect(query).toContain("eligibleAwardLotStatusSql('lot')");
    expect(query).toContain('award.lot_number = lot.lot_number');
    expect(query).toContain('group_concat(DISTINCT lot.awardee)');
    expect(query).not.toContain("WHEN awardee = 'Varios adjudicatarios'");
  });

  it('usa el volumen adjudicado de los lotes aunque el padre no tenga adjudicatario', () => {
    const db = createGeneratedTestDb(20261001, 1);
    setDbForTests(db);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Formalizada',
          award_amount_type = 'total',
          awarded_amount = NULL,
          awardee = '',
          awardee_nif = NULL,
          is_lotized = 1,
          lot_count = 2,
          award_date = '2024-01-01',
          publication_date = '2027-06-01',
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

    insertLot.run('duracion-lot-1', 'generated-20261001-1', 'GEN/2024/1', '1', 'Lote 1', 'Empresa Fallback A', 'B11111111', 'Adjudicado', 6000);
    insertLot.run('duracion-lot-2', 'generated-20261001-1', 'GEN/2024/1', '2', 'Lote 2', 'Empresa Fallback B', 'B22222222', 'Adjudicado', 4000);

    db.prepare("INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awardee, awardee_nif, result_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run('duracion-award-1', 'generated-20261001-1', 'GEN/2024/1', '1', 0, 'Empresa Award A', 'B33333333', 'Adjudicado');
    db.prepare("INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awardee, awardee_nif, result_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run('duracion-award-2', 'generated-20261001-1', 'GEN/2024/1', '2', 0, 'Empresa Award B', 'B44444444', 'Adjudicado');

    const stats = getDuracionEfectivaStats();
    expect(stats.resumen.totalEvaluados).toBe(1);
    expect(stats.rankingObrasDemora[0]).toBeUndefined();
    expect(stats.porTipoContrato.length).toBeGreaterThan(0);

    const item = stats.contratosConDilacion[0] ?? stats.topDesviacionesGlobales[0];
    expect(item?.awardee).toBe('Empresa Award A,Empresa Award B');
    expect(item?.nifAdjudicatario).toBeNull();
    expect(item?.amount).toBe(10000);
  });
});