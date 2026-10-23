import { afterEach, describe, expect, it } from 'vitest';
import { createGeneratedTestDb } from './test-db';
import { getEmpresasList, getEmpresaDetail, setDbForTests } from './db';

describe('Listado de empresas y lot_awards', () => {
  afterEach(() => {
    setDbForTests(null);
  });

  it('excludes companies backed only by terminal contracts', () => {
    const db = createGeneratedTestDb(20261028, 2);
    const updateContract = db.prepare(`
      UPDATE contracts
      SET status = ?,
          awardee = ?,
          awardee_nif = ?,
          awarded_amount = 1200,
          award_amount_type = 'total'
      WHERE id = ?
    `);
    updateContract.run('Cancelled', 'Terminal Cancelled Vendor', 'B90000001', 'generated-20261028-1');
    updateContract.run('Desierto', 'Terminal Deserted Vendor', 'B90000002', 'generated-20261028-2');
    setDbForTests(db);

    try {
      expect(getEmpresasList({ q: 'Terminal ', limit: 100 })).toMatchObject({ total: 0, data: [] });
      expect(getEmpresaDetail('B90000001')).toBeNull();
      expect(getEmpresaDetail('B90000002')).toBeNull();

      db.exec('DROP TABLE lot_awards');
      expect(getEmpresasList({ q: 'Terminal ', limit: 100 })).toMatchObject({ total: 0, data: [] });
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('incluye empresas adjudicatarias que solo aparecen en lot_awards', () => {
    const db = createGeneratedTestDb(20261003, 1);
    const contractId = 'generated-20261003-1';

    db.prepare(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          awarded_amount = NULL,
          awarded_amount_incl_vat = NULL,
          award_amount_type = 'desconocido'
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, budget_incl_vat, awarded_amount,
        awarded_amount_incl_vat, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'company-list-lot', contractId, 'GEN/2026/1', '1', 'Lote multiganador',
      2000, 2420, 1000, 1210, 'Empresa Lote A', 'B10000001', 'Adjudicado',
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        offer_count, award_date, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'company-list-award', contractId, 'GEN/2026/1', '1', 1,
      'Empresa Lote C', 'B10000003', 500, 605, 1, '2026-12-01', 'Adjudicado',
    );

    setDbForTests(db);

    try {
      const result = getEmpresasList({ q: 'Empresa Lote C', limit: 100 });
      expect(result.total).toBe(1);
      expect(result.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            nombre: 'Empresa Lote C',
            nif: 'B10000003',
            total_contratos: 1,
            volumen_total: 500,
          }),
        ]),
      );
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

it('cuenta un contrato una sola vez aunque tenga varias adjudicaciones para la misma empresa', () => {
    const db = createGeneratedTestDb(20261004, 1);
    const contractId = 'generated-20261004-1';

    db.prepare(`
      UPDATE contracts
      SET status = 'Resuelta',
          offer_count = 0,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          awarded_amount = NULL,
          awarded_amount_incl_vat = NULL,
          award_amount_type = 'total',
          is_lotized = 1
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awarded_amount_incl_vat, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'company-count-lot', contractId, 'GEN/2026/2', '1', 'Lote multiganador',
      1000, 1210, 'Empresa Repetida', 'B10000020', 'Adjudicado',
    );

    const insertAward = db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        award_date, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAward.run(
      'company-count-award-a', contractId, 'GEN/2026/2', '1', 0,
      'Empresa Repetida', 'B10000020', 400, 484, '2026-10-01', 'Adjudicado',
    );
    insertAward.run(
      'company-count-award-b', contractId, 'GEN/2026/2', '1', 1,
      'Empresa Repetida', 'B10000020', 600, 726, '2026-10-01', 'Adjudicado',
    );

    setDbForTests(db);

    try {
      const result = getEmpresasList({ q: 'Empresa Repetida', limit: 100 });
      expect(result.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            nombre: 'Empresa Repetida',
            nif: 'B10000020',
            total_contratos: 1,
            gasto_adjudicado: 1000,
            volumen_total: 1000,
          }),
        ]),
      );
    } finally {
      setDbForTests(null);
      db.close();
    }
  
});


  it('excluye importes de lot_awards cuando el expediente padre está cancelado', () => {
    const db = createGeneratedTestDb(20261005, 1);
    const contractId = 'generated-20261005-1';

    db.prepare(`
      UPDATE contracts
      SET status = 'Cancelled',
          offer_count = 0,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          awarded_amount = NULL,
          award_amount_type = 'total',
          is_lotized = 1
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'cancelled-parent-lot', contractId, 'GEN/2026/3', '1', 'Lote cancelado',
      1000, 'Empresa Cancelada', 'B10000030', 'Adjudicado',
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'cancelled-parent-award', contractId, 'GEN/2026/3', '1', 0,
      'Empresa Cancelada', 'B10000030', 1000, 'Adjudicado',
    );

    setDbForTests(db);
    try {
      const result = getEmpresasList({ q: 'Empresa Cancelada', limit: 100 });
      expect(result.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            nombre: 'Empresa Cancelada',
            total_contratos: 1,
            gasto_adjudicado: 0,
            volumen_total: 0,
          }),
        ]),
      );
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('cuenta lotes adjudicados aunque la cabecera figure como desierta por otros lotes', () => {
    const db = createGeneratedTestDb(20261006, 1);
    const contractId = 'generated-20261006-1';

    db.prepare(`
      UPDATE contracts
      SET status = 'Desierta',
          offer_count = 0,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          awarded_amount = 1000,
          award_amount_type = 'total',
          is_lotized = 1
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES
        ('mixed-awarded-lot', ?, 'GEN/2026/4', '1', 'Lote adjudicado', 1000, 'Empresa Mixta', 'B10000040', 'Adjudicado'),
        ('mixed-deserted-lot', ?, 'GEN/2026/4', '2', 'Lote desierto', NULL, NULL, NULL, 'Desierto')
    `).run(contractId, contractId);

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, offer_count, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'mixed-award', contractId, 'GEN/2026/4', '1', 0,
      'Empresa Mixta', 'B10000040', 1000, 1, 'Adjudicado',
    );

    setDbForTests(db);
    try {
      const result = getEmpresasList({ q: 'Empresa Mixta', limit: 100 });
      expect(result.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            nombre: 'Empresa Mixta',
            total_contratos: 1,
            gasto_adjudicado: 1000,
            volumen_total: 1000,
          }),
        ]),
      );
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('mantiene la adjudicación por lote en el fallback sin tabla lot_awards', () => {
    const db = createGeneratedTestDb(20261007, 1);
    const contractId = 'generated-20261007-1';

    db.prepare(`
      UPDATE contracts
      SET status = 'Desierta',
          offer_count = 0,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          awarded_amount = 1000,
          award_amount_type = 'total',
          is_lotized = 1
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES
        ('legacy-mixed-awarded-lot', ?, 'GEN/2026/5', '1', 'Lote adjudicado', 1000, 'Empresa Legacy Mixta', 'B10000050', 'Resuelto'),
        ('legacy-mixed-deserted-lot', ?, 'GEN/2026/5', '2', 'Lote desierto', NULL, NULL, NULL, 'Desierto')
    `).run(contractId, contractId);
    db.exec('DROP TABLE lot_awards');

    setDbForTests(db);
    try {
      const result = getEmpresasList({ q: 'Empresa Legacy Mixta', limit: 100 });
      expect(result.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            nombre: 'Empresa Legacy Mixta',
            total_contratos: 1,
            gasto_adjudicado: 1000,
            volumen_total: 1000,
          }),
        ]),
      );
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});
