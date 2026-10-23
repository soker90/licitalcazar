import { afterEach, describe, expect, it } from 'vitest';
import { getConcentracionStats, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';

describe('concentración empresarial lot-aware', () => {
  const databases: ReturnType<typeof createGeneratedTestDb>[] = [];

  afterEach(() => {
    for (const db of databases.splice(0)) db.close();
    setDbForTests(null);
  });

  it('usa todos los adjudicatarios de los lotes aunque la cabecera tenga otro adjudicatario', () => {
    const db = createGeneratedTestDb(86423, 1);
    databases.push(db);

    db.prepare(`
      UPDATE contracts
      SET year = 2026,
          status = 'Adjudicada',
          award_amount_type = 'total',
          awarded_amount = 9999,
          awardee = 'Empresa Cabecera',
          awardee_nif = 'B99999990',
          is_lotized = 1
      WHERE id = 'generated-86423-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES
        ('concentracion-lot-a', 'generated-86423-1', 'GEN/2026/1', '1', 'Lote A', 1000, 1000, 'Empresa A', 'B99999991', 'Adjudicado'),
        ('concentracion-lot-b', 'generated-86423-1', 'GEN/2026/1', '2', 'Lote B', 2000, 2000, 'Empresa B', 'B99999992', 'Adjudicado')
    `).run();

    setDbForTests(db);

    const stats = getConcentracionStats(2026);
    const nombres = stats.global.top5Empresas.map((item) => item.nombre);

    expect(stats.global.totalVolumen).toBe(3000);
    expect(nombres).toContain('Empresa A');
    expect(nombres).toContain('Empresa B');
    expect(nombres).not.toContain('Empresa Cabecera');
  });
});
