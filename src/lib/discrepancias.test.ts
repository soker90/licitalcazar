import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { createGeneratedTestDb } from './test-db';
import { setDbForTests } from './db';
import { getDiscrepancias } from './discrepancias';
import fs from 'node:fs';

  it('usa los adjudicatarios reales de los lotes en el detalle de discrepancias', () => {
    const source = fs.readFileSync(new URL('./discrepancias.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export function getDiscrepancias');
    const query = source.slice(start);
    expect(query).not.toContain('NaN');
    expect(query).toContain('const lotAwardsAwardeeCovered = hasLotAwardsTable');
    expect(query).toContain('NOT EXISTS (');
    expect(query).toContain('award.lot_number = lot.lot_number');
    expect(query).not.toContain('count(DISTINCT award.lot_number)');
    expect(query).toContain('FROM lot_awards award');
    expect(query).toContain('group_concat(DISTINCT lot.awardee)');
    expect(query).toContain('lot.contract_id = contracts.id');
    expect(query).toContain("eligibleAwardLotStatusSql('lot')");
  });

describe('Sistema de Auditoría de Discrepancias', () => {
  it('usa la suma de lot_awards como importe de la discrepancia cuando existe', () => {
    const db = createGeneratedTestDb(20261003, 1);
    const contractId = 'generated-20261003-1';

    db.prepare(`
      UPDATE contracts
      SET award_amount_type = 'total',
          awarded_amount = 9999,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          publication_date = '2026-01-01',
          deadline_date = '2026-03-01',
          award_date = '2026-02-01'
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, lot_status, awardee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('disc-amount-lot', contractId, 'GEN/2026/1', '1', 'Lote', 1000, 'Adjudicado', 'Empresa A');

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('disc-amount-award-1', contractId, 'GEN/2026/1', '1', 1, 'Empresa A', 'A10000001', 400, 'Adjudicado');

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('disc-amount-award-2', contractId, 'GEN/2026/1', '1', 2, 'Empresa B', 'B10000002', 600, 'Adjudicado');

    setDbForTests(db);
    try {
      const stats = getDiscrepancias();
      const item = stats.items.find((entry) => entry.licitacionId === contractId);
      expect(item).toBeDefined();
      expect(item?.amount).toBe(1000);
      expect(item?.awardee).toContain('Empresa A');
      expect(item?.awardee).toContain('Empresa B');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('mantiene contract_lots cuando lot_awards solo cubre parte de los lotes', () => {
    const db = createGeneratedTestDb(20261003, 1);
    const contractId = 'generated-20261003-1';

    db.prepare(`UPDATE contracts
      SET award_amount_type = 'total',
          awarded_amount = 9999,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          publication_date = '2026-01-01',
          deadline_date = '2026-03-01',
          award_date = '2026-02-01'
      WHERE id = ?`).run(contractId);

    const insertLot = db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      awarded_amount, lot_status, awardee
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertLot.run('disc-partial-lot-a', contractId, 'GEN/2026/1', '1', 'Lote A', 1000, 'Adjudicado', 'Empresa Lote A');
    insertLot.run('disc-partial-lot-b', contractId, 'GEN/2026/1', '2', 'Lote B', 2000, 'Adjudicado', 'Empresa Lote B');

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'disc-partial-award', contractId, 'GEN/2026/1', '1', 1,
      'Empresa Award', 400, 'Adjudicado'
    );

    setDbForTests(db);
    try {
      const stats = getDiscrepancias();
      const item = stats.items.find((entry) => entry.licitacionId === contractId);
      expect(item).toBeDefined();
      expect(item?.amount).toBe(3000);
      expect(item?.awardee).toContain('Empresa Lote A');
      expect(item?.awardee).toContain('Empresa Lote B');
      expect(item?.awardee).not.toContain('Empresa Award');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('rechaza cobertura de lot_awards con la misma cardinalidad pero lotes distintos', () => {
    const db = createGeneratedTestDb(20261003, 1);
    const contractId = 'generated-20261003-1';

    db.prepare(`UPDATE contracts
      SET award_amount_type = 'total',
          awarded_amount = 9999,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          publication_date = '2026-01-01',
          deadline_date = '2026-03-01',
          award_date = '2026-02-01'
      WHERE id = ?`).run(contractId);

    const insertLot = db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      awarded_amount, lot_status, awardee
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertLot.run('disc-set-lot-a', contractId, 'GEN/2026/1', '1', 'Lote A', 1000, 'Adjudicado', 'Empresa Lote A');
    insertLot.run('disc-set-lot-b', contractId, 'GEN/2026/1', '2', 'Lote B', 2000, 'Adjudicado', 'Empresa Lote B');

    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertAward.run('disc-set-award-a', contractId, 'GEN/2026/1', '1', 1, 'Empresa Award A', 400, 'Adjudicado');
    insertAward.run('disc-set-award-c', contractId, 'GEN/2026/1', '3', 1, 'Empresa Award C', 900, 'Adjudicado');

    setDbForTests(db);
    try {
      const stats = getDiscrepancias();
      const item = stats.items.find((entry) => entry.licitacionId === contractId);
      expect(item).toBeDefined();
      expect(item?.amount).toBe(3000);
      expect(item?.awardee).toContain('Empresa Lote A');
      expect(item?.awardee).toContain('Empresa Lote B');
      expect(item?.awardee).not.toContain('Empresa Award A');
      expect(item?.awardee).not.toContain('Empresa Award C');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('no usa un snapshot parcial de lot_awards cuando otro lote no tiene importe adjudicado', () => {
    const db = createGeneratedTestDb(20261022, 1);
    const contractId = 'generated-20261022-1';

    db.prepare(`UPDATE contracts
      SET award_amount_type = 'total',
          awarded_amount = 2000,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          publication_date = '2026-01-01',
          deadline_date = '2026-03-01',
          award_date = '2026-02-01'
      WHERE id = ?`).run(contractId);

    const insertLot = db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      awarded_amount, lot_status, awardee
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertLot.run('disc-partial-amount-lot-a', contractId, 'GEN/2026/1', '1', 'Lote A', 1000, 'Adjudicado', 'Empresa A');
    insertLot.run('disc-partial-amount-lot-b', contractId, 'GEN/2026/1', '2', 'Lote B', null, 'Adjudicado', 'Empresa B');

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'disc-partial-amount-award', contractId, 'GEN/2026/1', '1', 1,
      'Empresa A', 900, 'Adjudicado'
    );

    setDbForTests(db);
    try {
      const stats = getDiscrepancias();
      const item = stats.items.find((entry) => entry.licitacionId === contractId);
      expect(item).toBeDefined();
      expect(item?.amount).toBe(1000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('obtiene el listado completo y clasifica las discrepancias por gravedad y categoría', () => {
    const stats = getDiscrepancias();
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.conteoPorGravedad.media).toBeGreaterThan(0);
    expect(stats.conteoPorCategoria.REGISTRAL).toBeGreaterThan(0);
    expect(stats.conteoPorCategoria.TEMPORAL).toBeGreaterThan(0);
    expect(stats.items.length).toBe(stats.total);
  });

  it('permite filtrar por categoría REGISTRAL', () => {
    const registradas = getDiscrepancias({ categoria: 'REGISTRAL' });
    expect(registradas.total).toBeGreaterThan(0)
    for (const item of registradas.items) {
      expect(item.categoria).toBe('REGISTRAL');
      expect(item.promptIa).toBeDefined();
      expect(item.promptIa.length).toBeGreaterThan(20);
    }
  });

  it('permite buscar por término de texto', () => {
    const all = getDiscrepancias();
    const sample = all.items.find((item) => item.objeto.trim().length > 0);
    expect(sample).toBeDefined();
    const term = sample!.objeto.trim().split(/\s+/).find((word) => word.length >= 5);
    expect(term).toBeDefined();
    const busqueda = getDiscrepancias({ search: term });
    expect(busqueda.total).toBeGreaterThanOrEqual(1);
    expect(busqueda.items.some((item) => item.objeto.toLowerCase().includes(term!.toLowerCase()))).toBe(true);
  });

  it('ignora resultados previos a la adjudicación en las discrepancias', () => {
    const db = createGeneratedTestDb(20261031, 1);
    const contractId = 'generated-20261031-1';

    db.prepare(`
      UPDATE contracts
      SET award_amount_type = 'total',
          awarded_amount = NULL,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          publication_date = '2026-01-01',
          deadline_date = '2026-03-01',
          award_date = '2026-02-01'
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, lot_status, awardee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('disc-pre-award-lot', contractId, 'GEN/2026/31', '1',
      'Lote único', 1000, 'Adjudicado', 'Empresa adjudicada');

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('disc-pre-award-result', contractId, 'GEN/2026/31', '1', 0,
      'Licitador mejor valorado', 'B12345678', 900, 'BEST_RATED_TENDERER');

    setDbForTests(db);
    try {
      const item = getDiscrepancias().items.find((entry) => entry.licitacionId === contractId);
      expect(item).toBeDefined();
      expect(item?.amount).toBe(1000);
      expect(item?.awardee).toBe('Empresa adjudicada');
      expect(item?.awardee).not.toContain('Licitador mejor valorado');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('no usa el PBL como fallback del importe de las discrepancias', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/lib/discrepancias.ts'), 'utf8');

    expect(source).toContain('SELECT round(sum(lot.awarded_amount), 2)');
    expect(source).toContain("lot.contract_id = contracts.id");
    expect(source).toContain("eligibleAwardLotStatusSql('lot')");
    expect(source).not.toContain('coalesce(awarded_amount, amount_excl_vat, 0)');
  });

  it('no usa el adjudicatario padre como fallback cuando hay lotes sin adjudicatario', () => {
    const db = createGeneratedTestDb(20261024, 1);
    const contractId = 'generated-20261024-1';

    db.prepare(`UPDATE contracts
      SET awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          publication_date = '2026-01-01',
          deadline_date = '2026-03-01',
          award_date = '2026-02-01'
      WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      awarded_amount, lot_status, awardee
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'disc-parent-fallback-lot', contractId, 'GEN/2026/1', '1',
      'Lote sin adjudicatario', 1000, 'Adjudicado', null
    );

    setDbForTests(db);
    try {
      const item = getDiscrepancias().items.find((entry) => entry.licitacionId === contractId);
      expect(item).toBeDefined();
      expect(item?.awardee).toBeNull();
    } finally {
      setDbForTests(null);
      db.close();
    }
  });


  it('ignora adjudicaciones estructuradas asociadas a lotes legacy cancelados', () => {
    const db = createGeneratedTestDb(20261030, 1);
    const contractId = 'generated-20261030-1';
    db.prepare(`
      UPDATE contracts
      SET award_amount_type = 'total', awarded_amount = NULL,
          awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          publication_date = '2026-01-01', deadline_date = '2026-03-01',
          award_date = '2026-02-01'
      WHERE id = ?
    `).run(contractId);

    const insertLot = db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, lot_status, awardee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertLot.run('disc-active-30', contractId, 'GEN/2026/30', '1',
      'Lote activo', 1000, 'Adjudicado', 'Empresa Activa');
    insertLot.run('disc-cancelled-30', contractId, 'GEN/2026/30', '2',
      'Lote cancelado', 5000, 'Cancelado', 'Empresa Cancelada');

    const insertAward = db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAward.run('disc-award-active-30', contractId, 'GEN/2026/30', '1', 0,
      'Empresa Activa', 1000, 'Adjudicado');
    insertAward.run('disc-award-cancelled-30', contractId, 'GEN/2026/30', '2', 0,
      'Empresa Cancelada', 5000, 'Adjudicado');

    setDbForTests(db);
    try {
      const item = getDiscrepancias().items.find((entry) => entry.licitacionId === contractId);
      expect(item).toBeDefined();
      expect(item?.amount).toBe(1000);
      expect(item?.awardee).toBe('Empresa Activa');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('excluye lotes cancelados y otros resultados terminales del importe y adjudicatario de discrepancias', () => {
    const db = createGeneratedTestDb(20261029, 1);
    const contractId = 'generated-20261029-1';

    db.prepare(`
      UPDATE contracts
      SET award_amount_type = 'total',
          awarded_amount = NULL,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          publication_date = '2026-01-01',
          deadline_date = '2026-03-01',
          award_date = '2026-02-01'
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, lot_status, awardee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('disc-cancelled-lot', contractId, 'GEN/2026/29', '1',
      'Lote cancelado', 5000, 'Cancelado', 'Empresa Cancelada');

    setDbForTests(db);
    try {
      const item = getDiscrepancias().items.find((entry) => entry.licitacionId === contractId);
      expect(item).toBeDefined();
      expect(item?.amount).toBeNull();
      expect(item?.awardee).toBeNull();
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

});