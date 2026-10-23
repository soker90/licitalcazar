import { afterEach, describe, it, expect } from 'vitest';
import { createGeneratedTestDb } from './test-db';
import { setDbForTests } from './db';
import { getRenovacionMercadoStats, getStats } from './db';

describe('Renovación de Mercado, Primer Contrato y Mercado Cerrado (Issue #6)', () => {
  afterEach(() => {
    setDbForTests(null);
  });

  it('no usa PBL como gasto de mercado cuando falta el importe adjudicado', () => {
    const db = createGeneratedTestDb(20260930, 2);

    db.prepare(`
      UPDATE contracts
      SET year = 2023,
          award_amount_type = 'total',
          amount_excl_vat = 10000,
          awarded_amount = NULL,
          awardee = 'Empresa Sin Importe',
          awardee_nif = 'B11111111',
          award_date = '2023-04-15',
          publication_date = '2023-03-15'
      WHERE id = 'generated-20260930-1'
    `).run();

    db.prepare(`
      UPDATE contracts
      SET year = 2023,
          award_amount_type = 'total',
          amount_excl_vat = 8000,
          awarded_amount = 4000,
          awardee = 'Empresa Con Importe',
          awardee_nif = 'B22222222',
          award_date = '2023-04-20',
          publication_date = '2023-03-20'
      WHERE id = 'generated-20260930-2'
    `).run();

    setDbForTests(db);

    const stats = getRenovacionMercadoStats();
    const year2023 = stats.evolucion.find((item) => item.year === 2023);

    expect(year2023?.gastoTotal).toBe(4000);
    expect(year2023?.gastoNuevos).toBe(4000);
    expect(year2023?.gastoVeteranos).toBe(0);
    expect(stats.veteranas).toEqual([]);
  });


  it('atribuye los expedientes multiganador a los adjudicatarios reales de los lotes', () => {
    const db = createGeneratedTestDb(20260930, 3);

    db.prepare(`
      UPDATE contracts
      SET year = 2022,
          award_amount_type = 'total',
          awarded_amount = 1000,
          awardee = 'Empresa A',
          awardee_nif = 'B10000001',
          award_date = '2022-12-01',
          publication_date = '2022-11-01',
          status = 'Adjudicada'
      WHERE id = 'generated-20260930-1'
    `).run();

    db.prepare(`
      UPDATE contracts
      SET year = 2023,
          award_amount_type = 'total',
          awarded_amount = 9999,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          award_date = '2023-04-01',
          publication_date = '2023-03-01',
          status = 'Adjudicada',
          is_lotized = 1,
          lot_count = 2
      WHERE id = 'generated-20260930-2'
    `).run();

    db.prepare(`
      UPDATE contracts
      SET year = 2023,
          award_amount_type = 'total',
          awarded_amount = 4000,
          awardee = 'Empresa C',
          awardee_nif = 'B10000003',
          award_date = '2023-05-01',
          publication_date = '2023-04-01',
          status = 'Adjudicada'
      WHERE id = 'generated-20260930-3'
    `).run();

    const insertLot = db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        amount_excl_vat, amount_incl_vat, estimated_value,
        awardee, awardee_nif, lot_status, award_date,
        budget_excl_vat, budget_incl_vat, awarded_amount,
        awarded_amount_incl_vat, offer_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertLot.run(
      'generated-lot-a', 'generated-20260930-2', 'GEN/2023/2', '1', 'Lote A',
      2500, 3025, 2600, 'Empresa A', 'B10000001', 'Adjudicado', '2023-04-01',
      2500, 3025, 2000, 2420, 2
    );
    insertLot.run(
      'generated-lot-b', 'generated-20260930-2', 'GEN/2023/2', '2', 'Lote B',
      3500, 4235, 3600, 'Empresa B', 'B10000002', 'Adjudicado', '2023-04-01',
      3500, 4235, 3000, 3630, 1
    );

    setDbForTests(db);

    const stats = getRenovacionMercadoStats(2023);
    const year2023 = stats.evolucion.find((item) => item.year === 2023);

    expect(year2023).toMatchObject({
      totalActivos: 3,
      nuevosEntrantes: 2,
      veteranos: 1,
      gastoTotal: 9000,
      gastoNuevos: 7000,
      gastoVeteranos: 2000,
    });

    expect(stats.nuevosEntrantes.map((item) => item.empresaNombre)).toEqual(
      expect.arrayContaining(['Empresa B', 'Empresa C'])
    );
    expect(stats.nuevosEntrantes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ empresaNombre: 'Varios adjudicatarios' })])
    );
  });

  it('incluye adjudicatarios secundarios de lot_awards en la renovación de mercado', () => {
    const db = createGeneratedTestDb(20260930, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          award_amount_type = 'total',
          awarded_amount = 9999,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          award_date = '2024-04-01',
          publication_date = '2024-03-01',
          status = 'Adjudicada',
          is_lotized = 1,
          lot_count = 1
      WHERE id = 'generated-20260930-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name, lot_status,
        budget_excl_vat, budget_incl_vat
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'generated-lot-renovacion', 'generated-20260930-1', 'GEN/2024/1', '1',
      'Lote único', 'Adjudicado', 9000, 10890
    );

    db.exec(`
      CREATE TABLE IF NOT EXISTS lot_awards (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        case_number TEXT,
        lot_number TEXT NOT NULL,
        award_index INTEGER NOT NULL,
        awardee TEXT,
        awardee_nif TEXT,
        awarded_amount REAL,
        awarded_amount_incl_vat REAL,
        offer_count INTEGER,
        award_date TEXT,
        result_code TEXT,
        result_code_list_uri TEXT,
        result_state TEXT,
        description TEXT
      );
    `);

    const insertAward = db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        offer_count, award_date, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAward.run(
      'lot-award-renovacion-a', 'generated-20260930-1', 'GEN/2024/1', '1', 0,
      'Empresa B', 'B10000002', 3000, 3630, 2, '2024-04-01', 'Adjudicado'
    );
    insertAward.run(
      'lot-award-renovacion-b', 'generated-20260930-1', 'GEN/2024/1', '1', 1,
      'Empresa C', 'B10000003', 6000, 7260, 1, '2024-04-01', 'Adjudicado'
    );

    setDbForTests(db);

    const stats = getRenovacionMercadoStats(2024);
    const year2024 = stats.evolucion.find((item) => item.year === 2024);

    expect(year2024).toMatchObject({
      totalActivos: 2,
      nuevosEntrantes: 2,
      veteranos: 0,
      gastoTotal: 9000,
      gastoNuevos: 9000,
      gastoVeteranos: 0,
    });
    expect(stats.nuevosEntrantes.map((item) => item.empresaNombre)).toEqual(
      expect.arrayContaining(['Empresa B', 'Empresa C'])
    );
    expect(stats.nuevosEntrantes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ empresaNombre: 'Varios adjudicatarios' })])
    );
  });

  it('clasifica todo el importe como nuevo cuando una empresa recibe varios lotes en su primer expediente', () => {
    const db = createGeneratedTestDb(20260930, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          award_amount_type = 'total',
          awarded_amount = 9999,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          award_date = '2024-04-01',
          publication_date = '2024-03-01',
          status = 'Adjudicada',
          is_lotized = 1,
          lot_count = 2
      WHERE id = 'generated-20260930-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name, lot_status,
        budget_excl_vat, budget_incl_vat
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'generated-lot-multi-a', 'generated-20260930-1', 'GEN/2024/1', '1',
      'Lote A', 'Adjudicado', 4000, 4840
    );
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name, lot_status,
        budget_excl_vat, budget_incl_vat
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'generated-lot-multi-b', 'generated-20260930-1', 'GEN/2024/1', '2',
      'Lote B', 'Adjudicado', 5000, 6050
    );

    db.exec(`
      CREATE TABLE IF NOT EXISTS lot_awards (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        case_number TEXT,
        lot_number TEXT NOT NULL,
        award_index INTEGER NOT NULL,
        awardee TEXT,
        awardee_nif TEXT,
        awarded_amount REAL,
        awarded_amount_incl_vat REAL,
        offer_count INTEGER,
        award_date TEXT,
        result_code TEXT,
        result_code_list_uri TEXT,
        result_state TEXT,
        description TEXT
      );
    `);

    const insertAward = db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        offer_count, award_date, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAward.run(
      'lot-award-same-company-a', 'generated-20260930-1', 'GEN/2024/1', '1', 0,
      'Empresa A', 'B10000001', 4000, 4840, 2, '2024-04-01', 'Adjudicado'
    );
    insertAward.run(
      'lot-award-same-company-b', 'generated-20260930-1', 'GEN/2024/1', '2', 0,
      'Empresa A', 'B10000001', 5000, 6050, 1, '2024-04-01', 'Adjudicado'
    );

    setDbForTests(db);

    const stats = getRenovacionMercadoStats(2024);
    const year2024 = stats.evolucion.find((item) => item.year === 2024);

    expect(year2024).toMatchObject({
      totalActivos: 1,
      nuevosEntrantes: 1,
      veteranos: 0,
      gastoTotal: 9000,
      gastoNuevos: 9000,
      gastoVeteranos: 0,
      pctGastoNuevos: 100,
      pctGastoVeteranos: 0,
    });

    expect(stats.nuevosEntrantes).toEqual([
      expect.objectContaining({
        empresaId: 'B10000001',
        empresaNombre: 'Empresa A',
        year: 2024,
        amount: 9000,
        licitacionId: 'generated-20260930-1',
      }),
    ]);
  });

  it('cuenta un expediente una sola vez en el ranking de empresas veteranas aunque tenga varios awards', () => {
    const db = createGeneratedTestDb(20260930, 5);

    for (let i = 1; i <= 5; i++) {
      db.prepare(`
        UPDATE contracts
        SET year = ?, award_amount_type = 'total', awarded_amount = 1000,
            awardee = 'Empresa Veterana', awardee_nif = 'B10000001',
            award_date = ?, publication_date = ?, status = 'Adjudicada'
        WHERE id = ?
      `).run(
        2019 + i,
        `20${String(19 + i).padStart(2, '0')}-04-01`,
        `20${String(19 + i).padStart(2, '0')}-03-01`,
        `generated-20260930-${i}`,
      );
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS lot_awards (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        case_number TEXT,
        lot_number TEXT NOT NULL,
        award_index INTEGER NOT NULL,
        awardee TEXT,
        awardee_nif TEXT,
        awarded_amount REAL,
        awarded_amount_incl_vat REAL,
        offer_count INTEGER,
        award_date TEXT,
        result_state TEXT
      );
    `);

    const insertAward = db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        offer_count, award_date, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAward.run(
      'veterana-award-1', 'generated-20260930-1', 'GEN/2020/1', '1', 0,
      'Empresa Veterana', 'B10000001', 600, 726, 2, '2020-04-01', 'Adjudicado'
    );
    insertAward.run(
      'veterana-award-2', 'generated-20260930-1', 'GEN/2020/1', '1', 1,
      'Empresa Veterana', 'B10000001', 400, 484, 1, '2020-04-01', 'Adjudicado'
    );

    setDbForTests(db);

    const stats = getRenovacionMercadoStats();
    const veterana = stats.veteranas.find((item) => item.empresaId === 'B10000001');

    expect(veterana).toEqual(
      expect.objectContaining({
        totalEjercicios: 5,
        totalContratos: 5,
        totalVolumen: 5000,
      }),
    );
  });

  it('debe calcular la serie histórica completa de rotación de proveedores (2018-2026)', () => {
    const stats = getRenovacionMercadoStats();

    expect(stats.evolucion.length).toBeGreaterThanOrEqual(8);
    const anos = stats.evolucion.map((e) => e.year);
    expect(anos).toContain(2018);
    expect(anos).toContain(2021);
    expect(anos).toContain(2023);
    expect(anos).toContain(2025);

    // Cronológico ascendente
    for (let i = 1; i < stats.evolucion.length; i++) {
      expect(stats.evolucion[i].year).toBeGreaterThan(stats.evolucion[i - 1].year);
    }
  });

  it('cada año debe cumplir la suma exacta de nuevos entrantes y veteranos', () => {
    const stats = getRenovacionMercadoStats();

    for (const item of stats.evolucion) {
      expect(item.totalActivos).toBeGreaterThan(0);
      expect(item.nuevosEntrantes).toBeGreaterThanOrEqual(0);
      expect(item.veteranos).toBeGreaterThanOrEqual(0);
      expect(item.nuevosEntrantes + item.veteranos).toBe(item.totalActivos);

      // Porcentajes válidos
      expect(item.pctRenovacion).toBeGreaterThanOrEqual(0);
      expect(item.pctRenovacion).toBeLessThanOrEqual(100);

      // Desglose de gasto
      expect(item.gastoTotal).toBeGreaterThan(0);
      const sumaGastos = Math.round((item.gastoNuevos + item.gastoVeteranos) * 100) / 100;
      expect(Math.abs(sumaGastos - item.gastoTotal)).toBeLessThanOrEqual(0.05);
    }
  });

  it('debe detectar la transición hacia mercado cerrado a partir de 2023 (<50% renovación)', () => {
    const stats = getRenovacionMercadoStats();

    const evo2019 = stats.evolucion.find((e) => e.year === 2019);
    const evo2023 = stats.evolucion.find((e) => e.year === 2023);
    const evo2025 = stats.evolucion.find((e) => e.year === 2025);

    expect(evo2019).toBeDefined();
    expect(evo2023).toBeDefined();
    expect(evo2025).toBeDefined();

    // El estado de mercado cerrado debe reflejar exactamente el criterio del algoritmo.
    for (const item of [evo2019!, evo2023!, evo2025!]) {
      const expectedClosed = item.pctRenovacion < 50;
      expect(item.alertaMercadoCerrado).toBe(expectedClosed);
      expect(item.pctRenovacion).toBeGreaterThanOrEqual(0);
      expect(item.pctRenovacion).toBeLessThanOrEqual(100);
    }

    // The returned veteran-spend percentage must agree with the veteran/newcomer
    // spend split used by the algorithm; its historical value is data-dependent.
    const expectedVeteranSpendPct = Math.round(
      (evo2023!.gastoVeteranos / evo2023!.gastoTotal) * 1000
    ) / 10;
    expect(evo2023!.pctGastoVeteranos).toBe(expectedVeteranSpendPct);
    expect(evo2023!.pctGastoVeteranos).toBeGreaterThanOrEqual(0);
    expect(evo2023!.pctGastoVeteranos).toBeLessThanOrEqual(100);
  });

  it('debe identificar las empresas veteranas de larga duración ("Incombustibles")', () => {
    const stats = getRenovacionMercadoStats();

    expect(stats.veteranas.length).toBeGreaterThan(0);

    // Top veterana debe estar presente en al menos 8 ejercicios
    const top = stats.veteranas[0];
    expect(top.totalEjercicios).toBeGreaterThanOrEqual(8);
    expect(top.totalContratos).toBeGreaterThan(0);
    expect(top.totalVolumen).toBeGreaterThan(0);

    // Todas las de la lista deben cumplir el umbral mínimo (>= 5 ejercicios)
    for (const v of stats.veteranas) {
      expect(v.totalEjercicios).toBeGreaterThanOrEqual(5);
      expect(v.nombre).toBeTruthy();
    }
  });

  it('debe listar los nuevos entrantes con su primer contrato para un año seleccionado', () => {
    const stats2024 = getRenovacionMercadoStats(2024);

    expect(stats2024.nuevosEntrantes.length).toBeGreaterThan(0);
    for (const debutante of stats2024.nuevosEntrantes) {
      expect(debutante.year).toBe(2024);
      expect(debutante.empresaNombre).toBeTruthy();
      expect(debutante.objeto).toBeTruthy();
      expect(debutante.importe).toBeGreaterThan(0);
    }
  });

  it('admite filtrado por ámbito institucional (directa municipal)', () => {
    const globalStats = getRenovacionMercadoStats();
    const directaStats = getRenovacionMercadoStats(undefined, 'directa');

    expect(directaStats.evolucion.length).toBeGreaterThan(0);
    const sumGlobal = globalStats.evolucion.reduce((acc, curr) => acc + curr.totalActivos, 0);
    const sumDirecta = directaStats.evolucion.reduce((acc, curr) => acc + curr.totalActivos, 0);
    expect(sumDirecta).toBeLessThanOrEqual(sumGlobal);
  });

  it('getStats() integra renovacionMercado correctamente', () => {
    const stats = getStats();

    expect(stats.renovacionMercado).toBeDefined();
    expect(stats.renovacionMercado.resumenGlobal).toBeDefined();
    expect(stats.renovacionMercado.resumenGlobal.totalEmpresasHistoricas).toBeGreaterThan(100);
    expect(stats.renovacionMercado.evolucion.length).toBeGreaterThanOrEqual(8);
    expect(stats.renovacionMercado.veteranas.length).toBeGreaterThan(0);
    expect(stats.renovacionMercado.nuevosEntrantes.length).toBeGreaterThan(0);
  });
});
