import { describe, expect, it } from 'vitest';
import { getConcurrenciaStats, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';

describe('getConcurrenciaStats y expedientes lotizados', () => {
  it('usa las ofertas del lote cuando difieren de offer_count del contrato', () => {
    const db = createGeneratedTestDb(20261005, 1);

    db.prepare(`
      UPDATE contracts
      SET procedure = 'Abierto',
          status = 'Awarded',
          dataset = 'licitaciones',
          year = 2026,
          offer_count = 2,
          awardee = 'Empresa Lote',
          is_lotized = 1
      WHERE id = 'generated-20261005-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_status, awardee, offer_count
      ) VALUES ('concurrencia-lot-1', 'generated-20261005-1', '1', 'Adjudicado', 'Empresa Lote', 1)
    `).run();

    setDbForTests(db);

    try {
      const stats = getConcurrenciaStats();
      expect(stats.totalEvaluadas).toBe(1);
      expect(stats.unaOferta).toBe(1);
      expect(stats.masDeUnaOferta).toBe(0);
      expect(stats.mediaOfertas).toBe(1);
      expect(stats.distribucionOfertas?.una).toBe(1);
      expect(stats.distribucionOfertas?.dos).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
  it('usa lot_awards como fallback cuando contract_lots no tiene offer_count', () => {
    const db = createGeneratedTestDb(20261011, 1);

    db.prepare(`
      UPDATE contracts
      SET procedure = 'Abierto', status = 'Adjudicada', dataset = 'licitaciones',
          year = 2026, offer_count = 2, awardee = 'Empresa Lote', is_lotized = 1
      WHERE id = 'generated-20261011-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_status, awardee, offer_count
      ) VALUES ('concurrencia-award-fallback-1', 'generated-20261011-1', '1', 'Adjudicado', 'Empresa Lote', NULL)
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awardee, offer_count, result_state
      ) VALUES ('concurrencia-award-fallback-1', 'generated-20261011-1', 'GEN/2026/11', '1', 0, 'Empresa Lote', 1, 'Adjudicado')
    `).run();

    setDbForTests(db);
    try {
      const stats = getConcurrenciaStats();
      expect(stats.totalEvaluadas).toBe(1);
      expect(stats.unaOferta).toBe(1);
      expect(stats.masDeUnaOferta).toBe(0);
      expect(stats.mediaOfertas).toBe(1);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('excluye ofertas de lotes terminales al usar lot_awards como fallback', () => {
    const db = createGeneratedTestDb(20261014, 1);

    db.prepare(`
      UPDATE contracts
      SET procedure = 'Abierto', status = 'Adjudicada', dataset = 'licitaciones',
          year = 2026, offer_count = 2, awardee = 'Empresa Lote', is_lotized = 1
      WHERE id = 'generated-20261014-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_status, awardee, offer_count
      ) VALUES
        ('concurrencia-active-14', 'generated-20261014-1', '1', 'Adjudicado', 'Empresa Activa', NULL),
        ('concurrencia-cancelled-14', 'generated-20261014-1', '2', 'Cancelled', 'Empresa Cancelada', NULL)
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awardee, offer_count, result_state
      ) VALUES
        ('concurrencia-active-award-14', 'generated-20261014-1', 'GEN/2026/14', '1', 0, 'Empresa Activa', 1, 'Adjudicado'),
        ('concurrencia-cancelled-award-14', 'generated-20261014-1', 'GEN/2026/14', '2', 0, 'Empresa Cancelada', 5, 'Adjudicado')
    `).run();

    setDbForTests(db);
    try {
      const stats = getConcurrenciaStats();
      expect(stats.totalEvaluadas).toBe(1);
      expect(stats.unaOferta).toBe(1);
      expect(stats.masDeUnaOferta).toBe(0);
      expect(stats.mediaOfertas).toBe(1);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

});
