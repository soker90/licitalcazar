import { afterEach, describe, expect, it } from 'vitest';
import { createGeneratedTestDb } from './test-db';
import { getEmpresasList, setDbForTests } from './db';

describe('Grupos empresariales y lot_awards', () => {
  afterEach(() => {
    setDbForTests(null);
  });

  it('incluye como filiales las adjudicaciones que solo existen en lot_awards', () => {
    const db = createGeneratedTestDb(20261003, 1);

    db.prepare(`
      INSERT INTO corporate_groups (
        group_id, group_name, associated_nifs_json, scope, description, sede, color
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'grupo-test-multi-award',
      'Grupo Test Multiganador',
      JSON.stringify(['B10000001', 'B10000003']),
      'Directa Municipal',
      'Grupo de prueba',
      'Alcázar de San Juan',
      null,
    );

    const contractId = 'generated-20261003-1';

    db.prepare(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          awarded_amount = NULL,
          awarded_amount_incl_vat = NULL,
          award_amount_type = 'total'
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, budget_incl_vat, awarded_amount,
        awarded_amount_incl_vat, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'group-test-lot', contractId, 'GEN/2026/1', '1', 'Lote multiganador',
      2000, 2420, 1500, 1815, 'Empresa Lote A', 'B10000001', 'Adjudicado',
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        offer_count, award_date, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'group-test-award-1', contractId, 'GEN/2026/1', '1', 1,
      'Empresa Lote A', 'B10000001', 1000, 1210, 1, '2026-12-01', 'Adjudicado',
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        offer_count, award_date, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'group-test-award-2', contractId, 'GEN/2026/1', '1', 2,
      'Empresa Lote C', 'B10000003', 500, 605, 1, '2026-12-01', 'Adjudicado',
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        offer_count, award_date, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'group-test-award-duplicate', contractId, 'GEN/2026/1', '1', 3,
      'Empresa Lote A', 'B10000001', 250, 302.5, 1, '2026-12-01', 'Adjudicado',
    );

    setDbForTests(db);

    try {
      const result = getEmpresasList({ view: 'grupos', limit: 100 });
      const group = result.data.find((row: any) => row.id === 'grupo-test-multi-award');

      expect(group).toBeDefined();
      expect(group?.num_filiales).toBe(2);
      expect(group?.total_contratos).toBe(2);
      expect(group?.volumen_total).toBe(1750);
      expect(group?.filiales).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ cif: 'B10000001', volumen: 1250 }),
          expect.objectContaining({ cif: 'B10000003', volumen: 500 }),
        ]),
      );
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});
