import { afterEach, describe, expect, it } from 'vitest';
import { getContractingAuthorityDetail, getOrganismosList, getStats, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';

describe('gasto en curso con lotes parciales', () => {
  afterEach(() => setDbForTests(null));

  it('cuenta los lotes pendientes cuando lot_awards solo cubre parte del expediente', () => {
    const db = createGeneratedTestDb(20261022, 1);
    setDbForTests(db);
    try {
      const contractId = 'generated-20261022-1';
      db.prepare(`UPDATE contracts SET status = 'Published', award_amount_type = 'total',
        amount_excl_vat = 10000, awarded_amount = NULL, awardee = NULL,
        is_lotized = 1, lot_count = 2, economic_nature = 'gasto' WHERE id = ?`).run(contractId);
      const insertLot = db.prepare(`INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      insertLot.run('org-curso-partial-lot-1', contractId, '1', 6000, null, 'Empresa Adjudicataria', 'Adjudicado');
      insertLot.run('org-curso-partial-lot-2', contractId, '2', 4000, null, null, 'Pendiente');
      db.prepare(`INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'org-curso-partial-award-1', contractId, 'GEN/2026/1', '1', 0,
        'Empresa Adjudicataria', null, 'Adjudicado'
      );
      const contract = db.prepare(`SELECT contracting_authority_id FROM contracts WHERE id = ?`).get(contractId) as any;
      const org = getOrganismosList().find((o: any) => o.id === contract?.contracting_authority_id);
      const detail = getContractingAuthorityDetail(contract?.contracting_authority_id);
      expect(org?.gasto_en_curso).toBe(4000);
      expect(detail?.gasto_en_curso).toBe(4000);
      expect(getStats().gastoEnCurso).toBe(4000);
    } finally {
      db.close();
    }
  });
  it('no cuenta el presupuesto de lotes Cancelled como gasto en curso en organismos', () => {
    const db = createGeneratedTestDb(20261013, 1);
    setDbForTests(db);
    try {
      const contractId = 'generated-20261013-1';
      db.prepare(`UPDATE contracts SET status = 'Publicada', award_amount_type = 'total',
        amount_excl_vat = 10000, awarded_amount = NULL, awardee = NULL,
        is_lotized = 1, lot_count = 1, economic_nature = 'gasto' WHERE id = ?`).run(contractId);
      db.prepare(`INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        'org-curso-cancelled-lot', contractId, '1', 10000, null, null, 'Cancelled'
      );

      const contract = db.prepare(
        'SELECT contracting_authority_id FROM contracts WHERE id = ?',
      ).get(contractId) as { contracting_authority_id: string };
      const authority = getOrganismosList().find((row: any) => row.id === contract.contracting_authority_id);
      const detail = getContractingAuthorityDetail(contract.contracting_authority_id);

      expect(authority?.gasto_en_curso).toBe(0);
      expect(detail?.gasto_en_curso).toBe(0);
    } finally {
      db.close();
    }
  });

  it('excludes pending budgets when the structured lot result is Cancelled', () => {
    const db = createGeneratedTestDb(20261020, 1);
    setDbForTests(db);
    try {
      const contractId = 'generated-20261020-1';
      db.prepare(`UPDATE contracts SET status = 'Publicada', award_amount_type = 'total',
        amount_excl_vat = 10000, awarded_amount = NULL, awardee = NULL,
        is_lotized = 1, lot_count = 1, economic_nature = 'gasto' WHERE id = ?`).run(contractId);
      db.prepare(`INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        'org-curso-structured-cancelled-lot', contractId, '1', 10000, null, 'Empresa residual', 'Adjudicado'
      );
      db.prepare(`INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'org-curso-structured-cancelled-award', contractId, 'GEN/2024/20', '1', 0,
        null, 10000, 'CANCELLED'
      );

      const contract = db.prepare(
        'SELECT contracting_authority_id FROM contracts WHERE id = ?',
      ).get(contractId) as { contracting_authority_id: string };
      const authority = getOrganismosList().find((row: any) => row.id === contract.contracting_authority_id);
      const detail = getContractingAuthorityDetail(contract.contracting_authority_id);

      expect(authority?.gasto_en_curso).toBe(0);
      expect(detail?.gasto_en_curso).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

});
