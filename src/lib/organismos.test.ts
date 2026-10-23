import { describe, it, expect, afterEach } from 'vitest';
import { createGeneratedTestDb } from './test-db';
import { setDbForTests, getContractingAuthorities, getContractingAuthorityDetail } from './db';

describe('Detalle de organismo y adjudicatarios de lotes', () => {
  afterEach(() => {
    setDbForTests(null);
  });

  it('does not resolve a shared authority display name to an arbitrary profile', () => {
    const db = createGeneratedTestDb(20261021, 2);
    db.prepare("UPDATE contracting_authorities SET name = 'Autoridad homónima', placsp_id = NULL").run();
    setDbForTests(db);

    try {
      expect(getContractingAuthorityDetail('Autoridad homónima')).toBeNull();
      expect(getContractingAuthorityDetail('generated-authority-1')?.id).toBe('generated-authority-1');
      expect(getContractingAuthorityDetail('generated-authority-2')?.id).toBe('generated-authority-2');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('includes unknown parent totals when complete awarded lot amounts are available', () => {
    const db = createGeneratedTestDb(20261023, 1);
    db.prepare(`
      UPDATE contracts
      SET status = 'Formalizada', procedure = 'Abierto', economic_nature = 'gasto',
          award_amount_type = 'desconocido', awarded_amount = NULL,
          awardee = 'Varios adjudicatarios', is_lotized = 1, lot_count = 2, year = 2026
      WHERE id = 'generated-20261023-1'
    `).run();
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('authority-volume-lot-1', 'generated-20261023-1', '1', 2000, NULL, 'Lot Vendor A', 'Adjudicado'),
        ('authority-volume-lot-2', 'generated-20261023-1', '2', 3000, NULL, 'Lot Vendor B', 'Adjudicado')
    `).run();
    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES
        ('authority-volume-award-1', 'generated-20261023-1', '1', 0, 'Lot Vendor A', 1800, 'Adjudicado'),
        ('authority-volume-award-2', 'generated-20261023-1', '2', 0, 'Lot Vendor B', 2700, 'Adjudicado')
    `).run();
    setDbForTests(db);

    try {
      const listItem = getContractingAuthorities().find((item: any) => item.id === 'generated-authority-1');
      const detail = getContractingAuthorityDetail('generated-authority-1');

      expect(listItem?.volumen_total).toBe(4500);
      expect(detail?.volumen_total).toBe(4500);
      expect(listItem?.gasto_adjudicado).toBe(4500);
      expect(detail?.gasto_adjudicado).toBe(4500);
      expect(detail?.topAdjudicatarios).toEqual(expect.arrayContaining([
        expect.objectContaining({ adjudicatario: 'Lot Vendor A', volumen: 1800 }),
        expect.objectContaining({ adjudicatario: 'Lot Vendor B', volumen: 2700 }),
      ]));
      expect(detail?.evolucion).toEqual(expect.arrayContaining([
        expect.objectContaining({ year: 2026, volumen: 4500 }),
      ]));
      expect(detail?.porTipo.reduce((sum: number, item: any) => sum + item.volumen, 0)).toBe(4500);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('excludes unknown parent totals when an awarded lot amount is missing', () => {
    const db = createGeneratedTestDb(20261024, 1);
    db.prepare(`
      UPDATE contracts
      SET status = 'Formalizada', procedure = 'Abierto', economic_nature = 'gasto',
          award_amount_type = 'desconocido', awarded_amount = NULL,
          awardee = 'Varios adjudicatarios', is_lotized = 1, lot_count = 2
      WHERE id = 'generated-20261024-1'
    `).run();
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('authority-partial-lot-1', 'generated-20261024-1', '1', 2000, NULL, 'Lot Vendor A', 'Adjudicado'),
        ('authority-partial-lot-2', 'generated-20261024-1', '2', 3000, NULL, 'Lot Vendor B', 'Adjudicado')
    `).run();
    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES
        ('authority-partial-award-1', 'generated-20261024-1', '1', 0, 'Lot Vendor A', 1800, 'Adjudicado'),
        ('authority-partial-award-2', 'generated-20261024-1', '2', 0, 'Lot Vendor B', NULL, 'Adjudicado')
    `).run();
    setDbForTests(db);

    try {
      const listItem = getContractingAuthorities().find((item: any) => item.id === 'generated-authority-1');
      const detail = getContractingAuthorityDetail('generated-authority-1');

      expect(listItem?.volumen_total).toBe(0);
      expect(detail?.volumen_total).toBe(0);
      expect(detail?.topAdjudicatarios.reduce((sum: number, item: any) => sum + item.volumen, 0)).toBe(0);
      expect(detail?.evolucion.reduce((sum: number, item: any) => sum + item.volumen, 0)).toBe(0);
      expect(detail?.porTipo.reduce((sum: number, item: any) => sum + item.volumen, 0)).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('atribuye un expediente multiganador a los proveedores reales en la ficha del organismo', () => {
    const db = createGeneratedTestDb(20261001, 2);

    db.prepare(`
      INSERT INTO contracting_authorities (id, placsp_id, name, nif, dir3, scope, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'authority-test',
      'AUTH-TEST',
      'Organismo Test',
      'P0000000A',
      null,
      'Directa Municipal',
      1,
    );

    db.prepare(`
      UPDATE contracts
      SET contracting_authority_id = ?,
          contracting_authority_name = ?,
          contracting_authority_nif = ?,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          awarded_amount = 9999,
          award_amount_type = 'total',
          status = 'Formalizada'
      WHERE id = ?
    `).run('authority-test', 'Organismo Test', 'P0000000A', 'generated-20261001-1');

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, budget_incl_vat, awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'lot-test-1',
      'generated-20261001-1',
      'GEN/2024/1',
      '1',
      'Lote local',
      2000,
      2420,
      1500,
      'Empresa Lote A',
      'B10000001',
      'Adjudicado',
    );

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, budget_incl_vat, awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'lot-test-2',
      'generated-20261001-1',
      'GEN/2024/1',
      '2',
      'Lote regional',
      3000,
      3630,
      2500,
      'Empresa Lote B',
      'B10000002',
      'Adjudicado',
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        offer_count, award_date, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'award-test-1', 'generated-20261001-1', 'GEN/2024/1', '1', 1,
      'Empresa Lote A', 'B10000001', 1000, 1210, 1, '2021-12-01', 'Adjudicado',
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        offer_count, award_date, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'award-test-2', 'generated-20261001-1', 'GEN/2024/1', '1', 2,
      'Empresa Lote C', 'B10000003', 500, 605, 1, '2021-12-01', 'Adjudicado',
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        offer_count, award_date, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'award-test-1-duplicate', 'generated-20261001-1', 'GEN/2024/1', '1', 3,
      'Empresa Lote A', 'B10000001', 250, 302.5, 1, '2021-12-01', 'Adjudicado',
    );

    setDbForTests(db);

    const list = getContractingAuthorities();
    const listed = list.find((row: any) => row.id === 'authority-test');

    expect(listed).toBeDefined();
    expect(listed?.total_adjudicatarios).toBe(2);
    expect(listed?.total_adjudicatarios).not.toBe(1);
    expect(listed?.gasto_adjudicado).toBe(4000);
    expect(listed?.volumen_total).toBe(4000);

    const detail = getContractingAuthorityDetail('AUTH-TEST');

    expect(detail).toBeDefined();
    expect(detail?.total_adjudicatarios).toBe(2);
    expect(detail?.total_adjudicatarios).not.toBe(1);
    expect(detail?.gasto_adjudicado).toBe(4000);
    expect(detail?.volumen_total).toBe(4000);
    expect(detail?.evolucion).toEqual(expect.arrayContaining([expect.objectContaining({ year: 2021, contratos: 1, volumen: 4000 })]));
    expect(detail?.porTipo).toEqual(expect.arrayContaining([expect.objectContaining({ contratos: 1, volumen: 4000 })]));
    expect(detail?.topAdjudicatarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ adjudicatario: 'Empresa Lote A', contratos: 1 }),
      ]),
    );
    expect(detail?.topAdjudicatarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ adjudicatario: 'Empresa Lote A', volumen: 1500 }),
        expect.objectContaining({ adjudicatario: 'Empresa Lote B', volumen: 2500 }),
      ]),
    );
    expect(detail?.topAdjudicatarios).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ adjudicatario: 'Varios adjudicatarios' }),
      ]),
    );

    db.close();
  });
  it('excluye adjudicatarios e importes residuales de expedientes terminales', () => {
    const db = createGeneratedTestDb(20261020, 2);
    db.prepare(`
      INSERT INTO contracting_authorities (id, placsp_id, name, nif, dir3, scope, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'authority-terminal-test',
      'AUTH-TERMINAL',
      'Organismo Terminal',
      'P0000000B',
      null,
      'Directa Municipal',
      1,
    );
    const updateContract = db.prepare(`
      UPDATE contracts
      SET contracting_authority_id = 'authority-terminal-test',
          contracting_authority_name = 'Organismo Terminal',
          status = ?,
          procedure = 'Abierto',
          dataset = 'licitaciones',
          year = 2026,
          economic_nature = 'gasto',
          award_amount_type = 'total',
          amount_excl_vat = 10000,
          awarded_amount = 1000,
          awardee = ?,
          awardee_nif = 'B99999999',
          award_date = '2026-09-01'
      WHERE id = ?
    `);
    updateContract.run('Cancelled', 'Empresa cancelada residual', 'generated-20261020-1');
    updateContract.run('Desierto', 'Empresa desierta residual', 'generated-20261020-2');

    setDbForTests(db);
    try {
      const listed = getContractingAuthorities().find((item: any) => item.id === 'authority-terminal-test');
      const detail = getContractingAuthorityDetail('AUTH-TERMINAL');

      expect(listed).toMatchObject({
        gasto_adjudicado: 0,
        volumen_total: 0,
        total_adjudicatarios: 0,
      });
      expect(detail).toMatchObject({
        gasto_adjudicado: 0,
        volumen_total: 0,
        total_adjudicatarios: 0,
        topAdjudicatarios: [],
      });
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('counts deserted lot budgets in contracting authority summaries', () => {
    const db = createGeneratedTestDb(20261027, 1);
    db.prepare(`
      UPDATE contracts
      SET status = 'Formalizada',
          procedure = 'Abierto',
          economic_nature = 'gasto',
          amount_excl_vat = 21000,
          awarded_amount = 6500,
          award_amount_type = 'total',
          awardee = 'Vendor A',
          is_lotized = 1,
          lot_count = 5
      WHERE id = 'generated-20261027-1'
    `).run();
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('authority-deserted-awarded-lot', 'generated-20261027-1', '1', 7000, 6500, 'Vendor A', 'Adjudicado'),
        ('authority-deserted-terminal-lot', 'generated-20261027-1', '2', 5000, 5000, 'Residual Vendor', 'Desierto'),
        ('authority-deserted-structured-lot', 'generated-20261027-1', '3', 3000, NULL, NULL, 'Adjudicado'),
        ('authority-deserted-cancelled-lot', 'generated-20261027-1', '4', 4000, 4000, 'Cancelled Vendor', 'Cancelado'),
        ('authority-deserted-overridden-lot', 'generated-20261027-1', '5', 2000, 1800, 'Vendor B', 'Desierto')
    `).run();
    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES
        ('authority-deserted-structured-result', 'generated-20261027-1', '3', 0, NULL, NULL, 'DESERTED'),
        ('authority-deserted-overriding-award', 'generated-20261027-1', '5', 0, 'Vendor B', 1800, 'Adjudicado')
    `).run();
    setDbForTests(db);

    try {
      const listItem = getContractingAuthorities().find((item: any) => item.id === 'generated-authority-1');
      const detail = getContractingAuthorityDetail('generated-authority-1');
      expect(listItem?.gasto_desierto).toBe(8000);
      expect(detail?.gasto_desierto).toBe(8000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

});
