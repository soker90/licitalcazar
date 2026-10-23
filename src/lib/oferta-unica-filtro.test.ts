import { describe, expect, it } from 'vitest';
import { createGeneratedTestDb } from './test-db';
import { getLicitaciones, setDbForTests } from './db';

describe('filtro de oferta única', () => {
  it('incluye expedientes cuyo único licitador está en un lote', () => {
    const db = createGeneratedTestDb(20261005, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2026,
          procedure = 'Abierto',
          dataset = 'licitaciones',
          status = 'Adjudicada',
          awardee = 'Varios adjudicatarios',
          offer_count = 0,
          is_lotized = 1,
          lot_count = 1
      WHERE id = 'generated-20261005-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        lot_status, awardee, offer_count, budget_excl_vat, awarded_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'oferta-unica-lot',
      'generated-20261005-1',
      'GEN/2026/1',
      '1',
      'Lote único',
      'Adjudicado',
      'Empresa Lote',
      1,
      10000,
      9000
    );

    setDbForTests(db);
    try {
      const result = getLicitaciones({
        ofertaUnica: true,
        year: 2026,
        limit: 100,
      });

      expect(result.data.some((row: any) => row.id === 'generated-20261005-1')).toBe(true);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});

  it('incluye expedientes con alerta de oferta única registrada solo en un lote', () => {
    const db = createGeneratedTestDb(20261005, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2026,
          procedure = 'Abierto',
          dataset = 'licitaciones',
          status = 'Adjudicada',
          awardee = 'Varios adjudicatarios',
          offer_count = 2,
          is_lotized = 1,
          lot_count = 1
      WHERE id = 'generated-20261005-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        lot_status, awardee, offer_count, budget_excl_vat, awarded_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'con-alertas-lot',
      'generated-20261005-1',
      'GEN/2026/1',
      '1',
      'Lote único',
      'Adjudicado',
      'Empresa Lote',
      1,
      10000,
      9000
    );

    setDbForTests(db);
    try {
      const result = getLicitaciones({
        conAlertas: true,
        year: 2026,
        limit: 100,
      });

      expect(result.data.some((row: any) => row.id === 'generated-20261005-1')).toBe(true);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });


  it('no usa un snapshot parcial de lot_awards para marcar oferta única', () => {
    const db = createGeneratedTestDb(20261008, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2026,
          procedure = 'Abierto',
          dataset = 'licitaciones',
          status = 'Adjudicada',
          awardee = 'Varios adjudicatarios',
          offer_count = 0,
          is_lotized = 1,
          lot_count = 2
      WHERE id = 'generated-20261008-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        lot_status, awardee, offer_count, budget_excl_vat, awarded_amount
      ) VALUES
        ('oferta-unica-parcial-lot-1', 'generated-20261008-1', 'GEN/2026/2', '1', 'Lote 1', 'Adjudicado', 'Empresa A', 2, 5000, 4500),
        ('oferta-unica-parcial-lot-2', 'generated-20261008-1', 'GEN/2026/2', '2', 'Lote 2', 'Adjudicado', 'Empresa B', 3, 6000, 5500)
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, offer_count, awarded_amount, result_state
      ) VALUES
        ('oferta-unica-parcial-award-1', 'generated-20261008-1', 'GEN/2026/2', '1', 0, 'Empresa A', 1, 4500, 'Adjudicado')
    `).run();

    setDbForTests(db);
    try {
      const result = getLicitaciones({
        ofertaUnica: true,
        year: 2026,
        limit: 100,
      });

      expect(result.data.some((row: any) => row.id === 'generated-20261008-1')).toBe(false);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });



  it('no usa un snapshot parcial de lot_awards para generar alerta de oferta única', () => {
    const db = createGeneratedTestDb(20261008, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2026,
          procedure = 'Abierto',
          dataset = 'licitaciones',
          status = 'Adjudicada',
          awardee = 'Varios adjudicatarios',
          offer_count = 0,
          is_lotized = 1,
          lot_count = 2
      WHERE id = 'generated-20261008-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        lot_status, awardee, offer_count, budget_excl_vat, awarded_amount
      ) VALUES
        ('con-alertas-parcial-lot-1', 'generated-20261008-1', 'GEN/2026/3', '1', 'Lote 1', 'Adjudicado', 'Empresa A', 2, 5000, 4500),
        ('con-alertas-parcial-lot-2', 'generated-20261008-1', 'GEN/2026/3', '2', 'Lote 2', 'Adjudicado', 'Empresa B', 3, 6000, 5500)
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, offer_count, awarded_amount, result_state
      ) VALUES
        ('con-alertas-parcial-award-1', 'generated-20261008-1', 'GEN/2026/3', '1', 0, 'Empresa A', 1, 4500, 'Adjudicado')
    `).run();

    setDbForTests(db);
    try {
      const result = getLicitaciones({
        conAlertas: true,
        year: 2026,
        limit: 100,
      });

      expect(result.data.some((row: any) => row.id === 'generated-20261008-1')).toBe(false);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

