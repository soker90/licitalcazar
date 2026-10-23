import { describe, expect, it } from 'vitest';
import { createGeneratedTestDb } from './test-db';
import { getBajaTemerariaStats } from './db';
import { setDbForTests } from './db';

describe('getBajaTemerariaStats', () => {
  it.each(['Anulada', 'Cancelled', 'Desierta', 'Deserted'])(
    'does not calculate low-bid risk from terminal contract %s residuals',
    (status) => {
      const db = createGeneratedTestDb(20261015, 1);
      db.prepare(`
        UPDATE contracts
        SET year = 2024,
            procedure = 'Abierto',
            dataset = 'licitaciones',
            amount_excl_vat = 10000,
            awarded_amount = 1000,
            award_amount_type = 'total',
            awardee = 'Empresa residual',
            status = ?,
            economic_nature = 'gasto'
        WHERE id = 'generated-20261015-1'
      `).run(status);

      setDbForTests(db);
      try {
        const stats = getBajaTemerariaStats(2024);

        expect(stats.resumen.totalEvaluados).toBe(0);
        expect(stats.resumen.bajasExtremasCount).toBe(0);
        expect(stats.topBajas).toHaveLength(0);
        expect(stats.rankingEmpresas).toHaveLength(0);
      } finally {
        setDbForTests(null);
        db.close();
      }
    }
  );

  it('incluye adjudicaciones secundarias de lot_awards', () => {
    const db = createGeneratedTestDb(20260930, 1);

    db.prepare(`UPDATE contracts
      SET year = 2024, procedure = 'Abierto', dataset = 'licitaciones',
          amount_excl_vat = 10000, award_amount_type = 'total', offer_count = 1, status = 'Adjudicada',
          awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          is_lotized = 1, lot_count = 1
      WHERE id = 'generated-20260930-1'`).run();

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, lot_status,
      budget_excl_vat, budget_incl_vat, offer_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'baja-awards-lot', 'generated-20260930-1', 'GEN/2024/1', '1',
      'Lote único', 'Adjudicado', 10000, 12100, 1
    );

    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
      offer_count, award_date, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    insertAward.run(
      'baja-award-a', 'generated-20260930-1', 'GEN/2024/1', '1', 0,
      'Empresa B', 'B10000002', 5000, 6050, 1, '2024-04-01', 'Adjudicado'
    );

    setDbForTests(db);
    try {
      const stats = getBajaTemerariaStats(2024);

      expect(stats.resumen.totalEvaluados).toBe(1);
      expect(stats.resumen.bajasExtremasCount).toBe(1);
      expect(stats.rankingEmpresas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            awardee: 'Empresa B',
            totalContratos: 1,
            bajasExtremas: 1,
            volumenTotal: 5000,
          }),
        ])
      );
      expect(stats.topBajas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            awardee: 'Empresa B',
            awarded_amount: 5000,
            baja_pct: 50,
            esLicitadorUnico: true,
          }),
        ])
      );
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});
