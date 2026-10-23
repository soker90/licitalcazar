import { afterEach, describe, it, expect } from 'vitest';
import { createGeneratedTestDb } from './test-db';
import {
  getNivelHHI,
  getConcentracionStats,
  getStats,
  setDbForTests,
} from './db';

describe('getNivelHHI helper', () => {
  it('classifies HHI < 1500 as competitivo', () => {
    expect(getNivelHHI(0)).toBe('competitivo');
    expect(getNivelHHI(800)).toBe('competitivo');
    expect(getNivelHHI(1499)).toBe('competitivo');
  });

  it('classifies 1500 <= HHI <= 2500 as moderado', () => {
    expect(getNivelHHI(1500)).toBe('moderado');
    expect(getNivelHHI(2000)).toBe('moderado');
    expect(getNivelHHI(2500)).toBe('moderado');
  });

  it('classifies HHI > 2500 as concentrado', () => {
    expect(getNivelHHI(2501)).toBe('concentrado');
    expect(getNivelHHI(4500)).toBe('concentrado');
    expect(getNivelHHI(10000)).toBe('concentrado');
  });
});

describe('getConcentracionStats (Issue #5: HHI & CR5)', () => {
  afterEach(() => {
    setDbForTests(null);
  });

  it('does not use PBL as awarded volume when an awarded amount is missing', () => {
    const db = createGeneratedTestDb(20260930, 2);

    db.prepare(`
      UPDATE contracts
      SET contract_type = 'Servicios',
          year = 2026,
          scope = 'Directa Municipal',
          award_amount_type = 'total',
          amount_excl_vat = 10000,
          awarded_amount = NULL,
          awardee = 'Empresa Sin Importe',
          awardee_nif = 'B11111111'
      WHERE id = 'generated-20260930-1'
    `).run();

    db.prepare(`
      UPDATE contracts
      SET contract_type = 'Servicios',
          year = 2026,
          scope = 'Directa Municipal',
          award_amount_type = 'total',
          amount_excl_vat = 8000,
          awarded_amount = 4000,
          awardee = 'Empresa Con Importe',
          awardee_nif = 'B22222222'
      WHERE id = 'generated-20260930-2'
    `).run();

    setDbForTests(db);

    const stats = getConcentracionStats();

    expect(stats.global.totalVolumen).toBe(4000);
    expect(stats.global.top5Empresas[0]).toMatchObject({
      nombre: 'Empresa Con Importe',
      volumen: 4000,
    });
    expect(stats.global.top5Empresas[1]).toMatchObject({
      nombre: 'Empresa Sin Importe',
      volumen: 0,
    });
    expect(stats.porTipo.find((row) => row.nombre === 'Servicios')?.volumen).toBe(4000);
    expect(stats.porOrganismo.reduce((sum, row) => sum + row.volumen, 0)).toBe(4000);
    expect(stats.evolucion.find((row) => row.year === 2026)?.volumen).toBe(4000);
  });

  it('keeps contracting authorities with the same display name separate by internal ID', () => {
    const db = createGeneratedTestDb(20261015, 2);

    db.prepare("UPDATE contracts SET award_amount_type = 'unitario'").run();
    db.prepare("UPDATE contracting_authorities SET name = 'Organismo con nombre compartido'").run();
    db.prepare(`UPDATE contracts
      SET contracting_authority_name = 'Organismo con nombre compartido',
          year = 2026, award_amount_type = 'total', awarded_amount = 1000,
          awardee = 'Empresa Autoridad Uno', awardee_nif = 'B11111111', status = 'Adjudicada'
      WHERE id = 'generated-20261015-1'`).run();
    db.prepare(`UPDATE contracts
      SET contracting_authority_name = 'Organismo con nombre compartido',
          year = 2026, award_amount_type = 'total', awarded_amount = 3000,
          awardee = 'Empresa Autoridad Dos', awardee_nif = 'B22222222', status = 'Adjudicada'
      WHERE id = 'generated-20261015-2'`).run();
    setDbForTests(db);

    try {
      const rows = getConcentracionStats(2026).porOrganismo;

      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.nombre)).toEqual([
        'Organismo con nombre compartido',
        'Organismo con nombre compartido',
      ]);
      expect(rows.map((row) => row.authorityKey)).toEqual([
        'generated-authority-2',
        'generated-authority-1',
      ]);
      expect(rows.map((row) => row.volumen)).toEqual([3000, 1000]);
      expect(rows.map((row) => row.hhi)).toEqual([10000, 10000]);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('reparte el volumen de expedientes multiganador entre sus adjudicatarios por lote', () => {
    const db = createGeneratedTestDb(20260930, 2);

    db.prepare(`
      UPDATE contracts
      SET contract_type = 'Servicios',
          year = 2026,
          contracting_authority_id = 'generated-authority-1',
          scope = 'Directa Municipal',
          contracting_authority_name = 'Ayuntamiento de Alcázar de San Juan',
          award_amount_type = 'total',
          amount_excl_vat = 14000,
          awarded_amount = 12000,
          awardee = 'Varios adjudicatarios',
          awardee_nif = NULL
      WHERE id = 'generated-20260930-1'
    `).run();

    db.prepare(`
      UPDATE contracts
      SET contract_type = 'Servicios',
          year = 2026,
          contracting_authority_id = 'generated-authority-1',
          scope = 'Directa Municipal',
          contracting_authority_name = 'Ayuntamiento de Alcázar de San Juan',
          award_amount_type = 'total',
          amount_excl_vat = 5000,
          awarded_amount = 4000,
          awardee = 'Empresa Independiente',
          awardee_nif = 'B99999999'
      WHERE id = 'generated-20260930-2'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES
        ('multi-lot-1', 'generated-20260930-1', 'GEN/2026/1', '1', 'Lote 1',
         7000, 'Empresa Lote A', 'B11111111', 'Adjudicado'),
        ('multi-lot-2', 'generated-20260930-1', 'GEN/2026/1', '2', 'Lote 2',
         5000, 'Empresa Lote B', 'B22222222', 'Adjudicado')
    `).run();

    setDbForTests(db);

    const stats = getConcentracionStats();

    expect(stats.global.totalVolumen).toBe(16000);
    expect(stats.global.top5Empresas.map((row) => row.nombre)).toEqual([
      'Empresa Lote A',
      'Empresa Lote B',
      'Empresa Independiente',
    ]);
    expect(stats.global.top5Empresas.find((row) => row.nombre === 'Varios adjudicatarios')).toBeUndefined();

    expect(stats.porTipo.find((row) => row.nombre === 'Servicios')?.volumen).toBe(16000);
    expect(stats.porOrganismo.find((row) => row.nombre === 'Ayuntamiento de Alcázar de San Juan')?.volumen).toBe(16000);
    expect(stats.evolucion.find((row) => row.year === 2026)?.volumen).toBe(16000);
  });

  it('reparte el volumen de lot_awards entre adjudicatarios en expedientes multiganador', () => {
    const db = createGeneratedTestDb(20260931, 1);
    db.prepare(`UPDATE contracts
      SET contract_type = 'Servicios', year = 2026, scope = 'Directa Municipal',
          contracting_authority_name = 'Ayuntamiento de Alcázar de San Juan',
          award_amount_type = 'total', amount_excl_vat = 12000,
          awarded_amount = 12000, awardee = 'Varios adjudicatarios', awardee_nif = NULL
      WHERE id = 'generated-20260931-1'`).run();

    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awardee_nif,
      awarded_amount, awarded_amount_incl_vat, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertAward.run('award-conc-1', 'generated-20260931-1', 'GEN/2026/1', '1', 0, 'Empresa Award A', 'B33333331', 7000, 8470, 'Adjudicado');
    insertAward.run('award-conc-2', 'generated-20260931-1', 'GEN/2026/1', '2', 0, 'Empresa Award B', 'B33333332', 5000, 6050, 'Adjudicado');

    setDbForTests(db);
    const stats = getConcentracionStats();

    expect(stats.global.totalVolumen).toBe(12000);
    expect(stats.global.top5Empresas.map((row) => row.nombre)).toContain('Empresa Award A');
    expect(stats.global.top5Empresas.map((row) => row.nombre)).toContain('Empresa Award B');
    expect(stats.global.top5Empresas.find((row) => row.nombre === 'Varios adjudicatarios')).toBeUndefined();
  });

  it('calculates global market concentration metrics correctly', () => {
    const stats = getConcentracionStats();

    expect(stats.global).toBeDefined();
    expect(stats.global.hhi).toBeGreaterThan(0);
    expect(stats.global.hhi).toBeLessThan(10000);
    expect(stats.global.cr5).toBeGreaterThan(0);
    expect(stats.global.cr5).toBeLessThanOrEqual(100);
    expect(stats.global.cr1).toBeGreaterThan(0);
    expect(stats.global.cr1).toBeLessThanOrEqual(stats.global.cr5);
    expect(stats.global.totalEmpresas).toBeGreaterThan(500);
    expect(stats.global.top5Empresas.length).toBeLessThanOrEqual(5);

    // Consolidated global market in Alcázar is moderately dispersed (HHI around 382)
    expect(stats.global.nivel).toBe('competitivo');
  });

  it('provides breakdown by contract type (Obras, Servicios, Suministros)', () => {
    const stats = getConcentracionStats();
    expect(stats.porTipo.length).toBeGreaterThan(0);

    const obras = stats.porTipo.find(t => t.nombre.toLowerCase().includes('obra'));
    expect(obras).toBeDefined();
    expect(obras!.volumen).toBeGreaterThan(0);
    expect(obras!.numEmpresas).toBeGreaterThan(0);
    expect(obras!.cr5).toBeGreaterThan(0);
    expect(obras!.hhi).toBeGreaterThan(0);
    expect(obras!.topEmpresa).toBeTruthy();

    const servicios = stats.porTipo.find(t => t.nombre.toLowerCase().includes('servicio'));
    expect(servicios).toBeDefined();
    expect(servicios!.volumen).toBeGreaterThan(0);
  });

  it('provides breakdown by contracting organism', () => {
    const stats = getConcentracionStats();
    expect(stats.porOrganismo.length).toBeGreaterThan(0);

    const ayto = stats.porOrganismo.find(o => o.nombre.includes('Ayuntamiento'));
    expect(ayto).toBeDefined();
    expect(ayto!.volumen).toBeGreaterThan(0);
    expect(ayto!.hhi).toBeGreaterThan(0);
    expect(ayto!.cr5).toBeGreaterThan(0);

    const aguas = stats.porOrganismo.find(o => o.nombre.includes('Aguas'));
    expect(aguas).toBeDefined();
  });

  it('provides historical evolution of HHI and CR5', () => {
    const stats = getConcentracionStats();
    expect(stats.evolucion.length).toBeGreaterThan(4);

    for (const item of stats.evolucion) {
      expect(item.year).toBeGreaterThanOrEqual(2018);
      expect(item.volumen).toBeGreaterThan(0);
      expect(item.hhi).toBeGreaterThan(0);
      expect(item.cr5).toBeGreaterThan(0);
      expect(item.topEmpresa).toBeTruthy();
    }
  });

  it('filters concentration metrics when year is specified', () => {
    const stats2020 = getConcentracionStats(2020);
    // The exact concentration level is data-dependent. Verify the
    // filtered calculation and that its label is derived from the returned HHI.
    expect(stats2020.global.hhi).toBeGreaterThan(0);
    expect(stats2020.global.hhi).toBeLessThanOrEqual(10000);
    expect(stats2020.global.nivel).toBe(getNivelHHI(stats2020.global.hhi));
  });

  it('filters concentration metrics when institutional scope (ambito) is specified', () => {
    const statsDirecta = getConcentracionStats(undefined, 'directa');
    const statsMancomunidad = getConcentracionStats(undefined, 'mancomunidad');

    expect(statsDirecta.global.totalVolumen).toBeGreaterThan(0);
    expect(statsMancomunidad.global.totalVolumen).toBeGreaterThan(0);
    expect(statsDirecta.global.totalVolumen).toBeLessThan(getConcentracionStats().global.totalVolumen);

    // Organisms in mancomunidad scope should be exclusively Comsermancha
    for (const org of statsMancomunidad.porOrganismo) {
      expect(org.nombre).toContain('COMSERMANCHA');
    }
  });

  it('is integrated inside GlobalStats returned by getStats', () => {
    const globalStats = getStats();
    expect(globalStats.concentracion).toBeDefined();
    expect(globalStats.concentracion.global.hhi).toBe(getConcentracionStats().global.hhi);
  });
});
