import { afterEach, describe, it, expect } from 'vitest';
import { createGeneratedTestDb } from './test-db';
import { setDbForTests } from './db';
import { getEvolucionAnualStats, getStats } from './db';

describe('Evolución Temporal Anual de Indicadores Clave (Issue #11)', () => {
  afterEach(() => {
    setDbForTests(null);
  });

  it('excluye adjudicaciones de lotes terminales del volumen anual', () => {
    const db = createGeneratedTestDb(20261001, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Awarded',
          award_amount_type = 'total',
          awarded_amount = NULL,
          awardee = 'Varios adjudicatarios',
          is_lotized = 1
      WHERE id = 'generated-20261001-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        amount_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('lot-1', 'generated-20261001-1', 'GEN/2024/1', '1', 'Lote 1', 6000, 6000, 'Empresa Lote 1', 'Adjudicado'),
        ('lot-2', 'generated-20261001-1', 'GEN/2024/1', '2', 'Lote 2', 5000, 5000, 'Empresa Lote 2', 'Cancelled')
    `).run();

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'award-evolucion-1', 'generated-20261001-1', 'GEN/2024/1', '1', 0, 'Empresa Award', 7000, 'Adjudicado',
    );

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES ('award-evolucion-cancelled', 'generated-20261001-1', 'GEN/2024/1', '2', 0, 'Empresa Cancelada', 5000, 'Adjudicado')
    `).run();

    setDbForTests(db);

    const item = getEvolucionAnualStats().find((entry) => entry.year === 2024);

    expect(item?.contratos).toBe(1);
    expect(item?.volumen).toBe(7000);
  });

  it('prioriza lot_awards en la baja media anual', () => {
    const db = createGeneratedTestDb(20261005, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Adjudicada',
          award_amount_type = 'total',
          amount_excl_vat = 15000,
          awarded_amount = 14000,
          is_lotized = 1
      WHERE id = 'generated-20261005-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('evo-baja-lot-1', 'generated-20261005-1', 'GEN/2024/1', '1', 'Lote 1', 6000, 1000, 'Empresa Lote 1', 'Adjudicado'),
        ('evo-baja-lot-2', 'generated-20261005-1', 'GEN/2024/1', '2', 'Lote 2', 4000, 1000, 'Empresa Lote 2', 'Adjudicado')
    `).run();

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES
      ('evo-baja-award-1', 'generated-20261005-1', 'GEN/2024/1', '1', 0, 'Empresa Award 1', 3000, 'Adjudicado'),
      ('evo-baja-award-2', 'generated-20261005-1', 'GEN/2024/1', '2', 0, 'Empresa Award 2', 2000, 'Adjudicado')
    `).run();

    setDbForTests(db);

    const item = getEvolucionAnualStats().find((entry) => entry.year === 2024);

    expect(item?.contratos).toBe(1);
    expect(item?.bajaMediaPct).toBe(50);
  });

  it('mantiene el volumen de contract_lots cuando lot_awards solo cubre parte de los lotes', () => {
    const db = createGeneratedTestDb(20261007, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Adjudicada',
          award_amount_type = 'total',
          amount_excl_vat = 10000,
          awarded_amount = 8000,
          is_lotized = 1
      WHERE id = 'generated-20261007-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('evo-volume-partial-lot-1', 'generated-20261007-1', 'GEN/2024/1', '1', 'Lote 1', 6000, 5000, 'Empresa Lote 1', 'Adjudicado'),
        ('evo-volume-partial-lot-2', 'generated-20261007-1', 'GEN/2024/1', '2', 'Lote 2', 4000, 3000, 'Empresa Lote 2', 'Adjudicado')
    `).run();

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES ('evo-volume-partial-award-1', 'generated-20261007-1', 'GEN/2024/1', '1', 0, 'Empresa Award', 2500, 'Adjudicado')
    `).run();

    setDbForTests(db);
    try {
      const item = getEvolucionAnualStats().find((entry) => entry.year === 2024);
      expect(item?.contratos).toBe(1);
      expect(item?.volumen).toBe(8000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('mantiene contract_lots cuando lot_awards no cubre todos los lotes', () => {
    const db = createGeneratedTestDb(20261006, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Adjudicada',
          award_amount_type = 'total',
          amount_excl_vat = 10000,
          awarded_amount = 8000,
          is_lotized = 1
      WHERE id = 'generated-20261006-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, awarded_amount, lot_status
      ) VALUES
        ('evo-baja-partial-lot-1', 'generated-20261006-1', 'GEN/2024/1', '1', 'Lote 1', 6000, 5000, 'Adjudicado'),
        ('evo-baja-partial-lot-2', 'generated-20261006-1', 'GEN/2024/1', '2', 'Lote 2', 4000, 3000, 'Adjudicado')
    `).run();

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awarded_amount, result_state
    ) VALUES ('evo-baja-partial-award-1', 'generated-20261006-1', 'GEN/2024/1', '1', 0, 2500, 'Adjudicado')
    `).run();

    setDbForTests(db);
    try {
      const item = getEvolucionAnualStats().find((entry) => entry.year === 2024);
      expect(item?.bajaMediaPct).toBe(20);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('mantiene contract_lots cuando un lote sin importe hace parcial el snapshot de lot_awards', () => {
    const db = createGeneratedTestDb(20261012, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Adjudicada',
          award_amount_type = 'total',
          amount_excl_vat = 10000,
          awarded_amount = 8000,
          is_lotized = 1
      WHERE id = 'generated-20261012-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('evo-volume-null-lot-1', 'generated-20261012-1', 'GEN/2024/1', '1', 'Lote 1', 6000, 5000, 'Empresa Lote 1', 'Adjudicado'),
        ('evo-volume-null-lot-2', 'generated-20261012-1', 'GEN/2024/1', '2', 'Lote 2', 4000, NULL, NULL, 'Pendiente')
    `).run();

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES ('evo-volume-null-award-1', 'generated-20261012-1', 'GEN/2024/1', '1', 0, 'Empresa Award', 2500, 'Adjudicado')
    `).run();

    setDbForTests(db);
    try {
      const item = getEvolucionAnualStats().find((entry) => entry.year === 2024);
      expect(item?.contratos).toBe(1);
      expect(item?.volumen).toBe(5000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('calcula la baja media anual con PBL e importes de lotes', () => {
    const db = createGeneratedTestDb(20261002, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Adjudicada',
          award_amount_type = 'total',
          amount_excl_vat = 9600,
          awarded_amount = 2000,
          is_lotized = 1
      WHERE id = 'generated-20261002-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('baja-lot-1', 'generated-20261002-1', 'GEN/2024/1', '1', 'Lote 1', 6000, 1000, 'Empresa Lote 1', 'Adjudicado'),
        ('baja-lot-2', 'generated-20261002-1', 'GEN/2024/1', '2', 'Lote 2', 4000, 1000, 'Empresa Lote 2', 'Adjudicado')
    `).run();

    setDbForTests(db);

    const item = getEvolucionAnualStats().find((entry) => entry.year === 2024);

    expect(item?.contratos).toBe(1);
    expect(item?.bajaMediaPct).toBe(80);
  });

  it('incluye la baja de lotes aunque la cabecera parezca un sobrecoste', () => {
    const db = createGeneratedTestDb(20261003, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Adjudicada',
          award_amount_type = 'total',
          amount_excl_vat = 10000,
          awarded_amount = 15000,
          awardee = 'Varios adjudicatarios',
          is_lotized = 1
      WHERE id = 'generated-20261003-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('filtro-lot-1', 'generated-20261003-1', 'GEN/2024/1', '1', 'Lote 1', 6000, 3000, 'Empresa Lote 1', 'Adjudicado'),
        ('filtro-lot-2', 'generated-20261003-1', 'GEN/2024/1', '2', 'Lote 2', 4000, 2000, 'Empresa Lote 2', 'Adjudicado')
    `).run();

    setDbForTests(db);

    const item = getEvolucionAnualStats().find((entry) => entry.year === 2024);

    expect(item?.bajaMediaPct).toBe(50);
  });

  it('el volumen anual solo incluye importes de adjudicación conocidos', () => {
    const db = createGeneratedTestDb(20260930, 2);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Adjudicada',
          award_amount_type = 'total',
          amount_excl_vat = 10000,
          awarded_amount = NULL,
          awardee = 'Empresa Sin Importe',
          awardee_nif = 'B11111111'
      WHERE id = 'generated-20260930-1'
    `).run();

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Adjudicada',
          award_amount_type = 'total',
          amount_excl_vat = 8000,
          awarded_amount = 4000,
          awardee = 'Empresa Con Importe',
          awardee_nif = 'B22222222'
      WHERE id = 'generated-20260930-2'
    `).run();

    setDbForTests(db);

    const item = getEvolucionAnualStats().find((entry) => entry.year === 2024);

    expect(item?.contratos).toBe(2);
    expect(item?.volumen).toBe(4000);
  });


  it('usa las ofertas de los lotes para calcular oferta única anual', () => {
    const db = createGeneratedTestDb(20261008, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Adjudicada',
          procedure = 'Abierto',
          dataset = 'licitaciones',
          awardee = 'Empresa Lote',
          offer_count = 2,
          is_lotized = 1
      WHERE id = 'generated-20261008-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_status, awardee, offer_count
      ) VALUES ('evo-oferta-lot-1', 'generated-20261008-1', 'GEN/2024/1', '1', 'Adjudicado', 'Empresa Lote', 1)
    `).run();

    setDbForTests(db);
    try {
      const item = getEvolucionAnualStats().find((entry) => entry.year === 2024);
      expect(item?.pctOfertaUnica).toBe(100);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('usa lot_awards para calcular oferta única anual cuando falta el dato del lote', () => {
    const db = createGeneratedTestDb(20261011, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024, status = 'Adjudicada', procedure = 'Abierto',
          dataset = 'licitaciones', awardee = 'Empresa Award',
          offer_count = 2, is_lotized = 1
      WHERE id = 'generated-20261011-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_status, awardee, offer_count
      ) VALUES ('evo-oferta-award-lot-1', 'generated-20261011-1', 'GEN/2024/1', '1', 'Adjudicado', 'Empresa Award', NULL)
    `).run();

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, offer_count, result_state
    ) VALUES ('evo-oferta-award-1', 'generated-20261011-1', 'GEN/2024/1', '1', 0, 'Empresa Award', 1, 'Adjudicado')
    `).run();

    setDbForTests(db);
    try {
      const item = getEvolucionAnualStats().find((entry) => entry.year === 2024);
      expect(item?.totalEvaluadasOferta).toBe(1);
      expect(item?.pctOfertaUnica).toBe(100);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('incluye expedientes lotizados aunque el adjudicatario del padre no sea válido', () => {
    const db = createGeneratedTestDb(20261009, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          status = 'Adjudicada',
          procedure = 'Abierto',
          dataset = 'licitaciones',
          awardee = NULL,
          offer_count = 1,
          is_lotized = 1
      WHERE id = 'generated-20261009-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_status, awardee, offer_count
      ) VALUES ('evo-adjudicatario-lot-1', 'generated-20261009-1', 'GEN/2024/1', '1', 'Adjudicado', 'Empresa Lote', 1)
    `).run();

    setDbForTests(db);
    try {
      const item = getEvolucionAnualStats().find((entry) => entry.year === 2024);
      expect(item?.totalEvaluadasOferta).toBe(1);
      expect(item?.pctOfertaUnica).toBe(100);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('debe devolver la serie histórica completa de ejercicios con todos los indicadores clave', () => {
    const evolucion = getEvolucionAnualStats();

    expect(evolucion.length).toBeGreaterThanOrEqual(8);

    // Debe estar ordenado cronológicamente
    for (let i = 1; i < evolucion.length; i++) {
      expect(evolucion[i].year).toBeGreaterThan(evolucion[i - 1].year);
    }

    // Los años con cobertura completa LCSP (>= 2018) deben estar presentes
    const anos = evolucion.map((e) => e.year);
    expect(anos).toContain(2018);
    expect(anos).toContain(2019);
    expect(anos).toContain(2020);
    expect(anos).toContain(2021);
    expect(anos).toContain(2022);
    expect(anos).toContain(2023);
    expect(anos).toContain(2024);
    expect(anos).toContain(2025);
    expect(anos).toContain(2026);
  });

  it('cada ejercicio anual debe contener valores numéricos válidos en los 6 indicadores clave', () => {
    const evolucion = getEvolucionAnualStats();

    for (const item of evolucion) {
      // 1. Contratos y volumen
      expect(item.contratos).toBeGreaterThan(0);
      expect(item.volumen).toBeGreaterThan(0);

      // 2. Oferta única (% entre 0 y 100)
      expect(item.pctOfertaUnica).toBeGreaterThanOrEqual(0);
      expect(item.pctOfertaUnica).toBeLessThanOrEqual(100);

      // 3. Baja media (% entre 0 y 100)
      expect(item.bajaMediaPct).toBeGreaterThanOrEqual(0);
      expect(item.bajaMediaPct).toBeLessThanOrEqual(100);

      // 4. Tiempos de tramitación (días >= 0)
      expect(item.tiempoMedioDias).toBeGreaterThanOrEqual(0);
      expect(item.tiempoMedianaDias).toBeGreaterThanOrEqual(0);

      // 5. Proveedores distintos (> 0 y <= contratos)
      expect(item.empresasDistintas).toBeGreaterThan(0);
      expect(item.empresasDistintas).toBeLessThanOrEqual(item.contratos);
    }
  });

  it('debe reflejar la tendencia de concurrencia y oferta única descrita en los datos', () => {
    const evolucion = getEvolucionAnualStats();
    const ano2019 = evolucion.find((e) => e.year === 2019);
    const ano2022 = evolucion.find((e) => e.year === 2022);

    expect(ano2019).toBeDefined();
    expect(ano2022).toBeDefined();

    // En procedimientos competitivos (excluidos contratos menores), la oferta única se sitúa en ~51.6% (2019) y ~58.4% (2022)
    expect(ano2019!.pctOfertaUnica).toBeLessThan(70);
    expect(ano2022!.pctOfertaUnica).toBeGreaterThan(50);
  });

  it('admite filtrado por ámbito institucional (directa municipal vs mancomunidad)', () => {
    const evoGlobal = getEvolucionAnualStats();
    const evoDirecta = getEvolucionAnualStats('directa');
    const evoMancomunidad = getEvolucionAnualStats('mancomunidad');

    expect(evoDirecta.length).toBeGreaterThan(0);
    expect(evoMancomunidad.length).toBeGreaterThan(0);

    const totalGlobalContratos = evoGlobal.reduce((acc, curr) => acc + curr.contratos, 0);
    const totalDirectaContratos = evoDirecta.reduce((acc, curr) => acc + curr.contratos, 0);
    const totalMancomunidadContratos = evoMancomunidad.reduce((acc, curr) => acc + curr.contratos, 0);

    expect(totalDirectaContratos + totalMancomunidadContratos).toBe(totalGlobalContratos);
  });

  it('getStats() integra evolucionAnual con el modelo multiserie completo', () => {
    const stats = getStats();

    expect(stats.evolucionAnual).toBeDefined();
    expect(stats.evolucionAnual.length).toBeGreaterThanOrEqual(8);

    const first = stats.evolucionAnual[0];
    expect(first).toHaveProperty('year');
    expect(first).toHaveProperty('contratos');
    expect(first).toHaveProperty('volumen');
    expect(first).toHaveProperty('pctOfertaUnica');
    expect(first).toHaveProperty('bajaMediaPct');
    expect(first).toHaveProperty('tiempoMedioDias');
    expect(first).toHaveProperty('tiempoMedianaDias');
    expect(first).toHaveProperty('empresasDistintas');
  });
});
