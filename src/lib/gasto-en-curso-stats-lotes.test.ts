import { afterEach, describe, expect, it } from 'vitest';
import { getStats, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';

describe('gasto en curso global con lotes parciales', () => {
  afterEach(() => setDbForTests(null));

  it('mantiene como gasto en curso los lotes pendientes de un expediente parcialmente adjudicado', () => {
    const db = createGeneratedTestDb(20261023, 1);
    setDbForTests(db);
    try {
      const contractId = 'generated-20261023-1';
      db.prepare(`UPDATE contracts SET status = 'Publicada', award_amount_type = 'total',
        amount_excl_vat = 10000, awarded_amount = NULL, awardee = NULL,
        is_lotized = 1, lot_count = 2, economic_nature = 'gasto' WHERE id = ?`).run(contractId);
      const insertLot = db.prepare(`INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      insertLot.run('stats-curso-partial-lot-1', contractId, '1', 6000, 5000, 'Empresa Adjudicataria', 'Adjudicado');
      insertLot.run('stats-curso-partial-lot-2', contractId, '2', 4000, null, null, 'Pendiente');
      const stats = getStats();
      expect(stats.gastoEnCurso).toBe(4000);
    } finally {
      db.close();
    }
  });

  it('excluye el presupuesto residual de lotes terminales en inglés del gasto en curso', () => {
    const db = createGeneratedTestDb(20261024, 1);
    setDbForTests(db);
    try {
      const contractId = 'generated-20261024-1';
      db.prepare(`UPDATE contracts SET status = 'Publicada', award_amount_type = 'total',
        amount_excl_vat = 10000, awarded_amount = NULL, awardee = NULL,
        is_lotized = 1, lot_count = 2, economic_nature = 'gasto' WHERE id = ?`).run(contractId);
      const insertLot = db.prepare(`INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      insertLot.run('stats-curso-cancelled-lot', contractId, '1', 6000, null, null, 'Cancelled');
      insertLot.run('stats-curso-pending-lot', contractId, '2', 4000, null, null, 'Pendiente');
      const stats = getStats();
      expect(stats.gastoEnCurso).toBe(4000);
    } finally {
      db.close();
    }
  });

});
