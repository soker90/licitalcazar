import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {
  cleanWords,
  jaccardSimilarity,
  detectarReadjudicaciones,
} from './flujo';
import { getFlujoStats, getStats, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';

describe('Flujo text helpers', () => {
  it('cleanWords extracts normalized meaningful tokens', () => {
    const tokens = cleanWords('Servicio de mantenimiento del alumbrado público de Alcázar de San Juan');
    expect(tokens).toContain('mantenimiento');
    expect(tokens).toContain('alumbrado');
    expect(tokens).toContain('publico');
    // Stop words should be removed
    expect(tokens).not.toContain('servicio');
    expect(tokens).not.toContain('de');
    expect(tokens).not.toContain('del');
    expect(tokens).not.toContain('alcazar');
    expect(tokens).not.toContain('juan');
  });

  it('jaccardSimilarity calculates word overlap correctly', () => {
    const a = ['rehabilitacion', 'antigua', 'fonda', 'estacion'];
    const b = ['rehabilitacion', 'antigua', 'fonda', 'estacion', 'obras'];
    const sim = jaccardSimilarity(a, b);
    expect(sim).toBeCloseTo(4 / 5, 2);

    expect(jaccardSimilarity([], b)).toBe(0);
    expect(jaccardSimilarity(['completamente', 'distinto'], b)).toBe(0);
  });
});

describe('detectarReadjudicaciones', () => {
  it('detects deserted tender followed by awarded tender on matching object and organism', () => {
    const desiertas = [
      {
        id: 'd1',
        expediente: '4/2021',
        objeto: 'Rehabilitación de la antigua Fonda de la Estación de Alcázar',
        tipo: 'Obras',
        procedimiento: 'Abierto',
        organo: 'Ayuntamiento de Alcázar de San Juan',
        year: 2021,
        fecha: '2021-08-19',
        importe: 400000,
      },
    ];

    const adjudicadas = [
      {
        id: 'a1',
        expediente: '5/2021',
        objeto: 'Rehabilitación de la antigua Fonda de la Estación de Alcázar',
        tipo: 'Obras',
        procedimiento: 'Abierto',
        organo: 'Ayuntamiento de Alcázar de San Juan',
        year: 2021,
        fecha: '2021-11-02',
        importe: 420000,
        adjudicatario: 'GENERA QUATRO S.L.',
      },
    ];

    const pairs = detectarReadjudicaciones(desiertas, adjudicadas);
    expect(pairs.length).toBe(1);
    expect(pairs[0].desierta.id).toBe('d1');
    expect(pairs[0].posterior.id).toBe('a1');
    expect(pairs[0].posterior.adjudicatario).toBe('GENERA QUATRO S.L.');
    expect(pairs[0].diasTranscurridos).toBe(75);
    expect(pairs[0].diferenciaImporte).toBe(20000);
    expect(pairs[0].pctVariacionImporte).toBe(5);
    expect(pairs[0].confianza).toBe('alta');
  });

  it('rejects pairs from different organisms', () => {
    const desiertas = [
      {
        id: 'd1',
        expediente: '1/2022',
        objeto: 'Suministro de vehículos para limpieza',
        tipo: 'Suministros',
        procedimiento: 'Abierto',
        organo: 'Ayuntamiento de Alcázar de San Juan',
        year: 2022,
        fecha: '2022-01-01',
        importe: 50000,
      },
    ];

    const adjudicadas = [
      {
        id: 'a1',
        expediente: '2/2022',
        objeto: 'Suministro de vehículos para limpieza',
        tipo: 'Suministros',
        procedimiento: 'Abierto',
        organo: 'Mancomunidad COMSERMANCHA',
        year: 2022,
        fecha: '2022-03-01',
        importe: 50000,
        adjudicatario: 'Empresa X',
      },
    ];

    const pairs = detectarReadjudicaciones(desiertas, adjudicadas);
    expect(pairs.length).toBe(0);
  });
});

describe('getFlujoStats (Issue #14)', () => {
  afterEach(() => {
    setDbForTests(null);
  });

  it('does not use the PBL as awarded volume in dimension breakdowns', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        status TEXT,
        awardee TEXT,
        award_amount_type TEXT,
        awarded_amount REAL,
        amount_excl_vat REAL,
        amount_incl_vat REAL,
        procedure TEXT,
        contract_type TEXT,
        contracting_authority_name TEXT,
        contracting_authority_id TEXT,
        offer_count INTEGER,
        year INTEGER,
        scope TEXT,
        case_number TEXT,
        object_description TEXT,
        publication_date TEXT,
        award_date TEXT,
        is_lotized INTEGER
      );

      CREATE TABLE contract_lots (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        lot_number TEXT,
        amount_excl_vat REAL,
        budget_excl_vat REAL,
        awarded_amount REAL,
        awardee TEXT,
        lot_status TEXT
      );

      CREATE TABLE lot_awards (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        lot_number TEXT,
        awarded_amount REAL,
        awardee TEXT,
        result_state TEXT
      );

      INSERT INTO contracts (
        id, status, awardee, award_amount_type, awarded_amount, amount_excl_vat,
        procedure, contract_type, contracting_authority_name, contracting_authority_id,
        offer_count, year, scope, case_number, object_description, publication_date, award_date, is_lotized
      ) VALUES
        ('awarded-without-amount', 'Adjudicada', 'Empresa sin importe', 'total', NULL, 12000,
         'Abierto', 'Servicios', 'Ayuntamiento de Alcázar de San Juan', 'ayto', 1, 2026,
         'Directa Municipal', 'exp-1', 'Servicio de prueba sin importe adjudicado', '2026-01-01', '2026-02-01', 0),
        ('awarded-with-amount', 'Adjudicada', 'Empresa con importe', 'total', 5000, 7000,
         'Abierto', 'Servicios', 'Ayuntamiento de Alcázar de San Juan', 'ayto', 2, 2026,
         'Directa Municipal', 'exp-2', 'Servicio de prueba adjudicado', '2026-01-02', '2026-02-02', 0),
        ('awarded-by-lots', 'Adjudicada', 'Varios adjudicatarios', 'total', NULL, 12000,
         'Abierto', 'Servicios', 'Ayuntamiento de Alcázar de San Juan', 'ayto', 2, 2026,
         'Directa Municipal', 'exp-lotes', 'Servicio de prueba adjudicado por lotes', '2026-01-04', '2026-02-04', 1),
        ('in-course', 'Publicada', NULL, 'total', NULL, 9000,
         'Abierto', 'Servicios', 'Ayuntamiento de Alcázar de San Juan', 'ayto', NULL, 2026,
         'Directa Municipal', 'exp-3', 'Servicio de prueba en curso', '2026-01-03', NULL, 0);

      INSERT INTO contract_lots (id, contract_id, awarded_amount, lot_status, awardee) VALUES
        ('lot-1', 'awarded-by-lots', 6000, 'Adjudicado', 'Empresa lote 1'),
        ('lot-2', 'awarded-by-lots', 4000, 'Adjudicado', 'Empresa lote 2'),
        ('lot-3', 'awarded-by-lots', 3000, 'Desierto', NULL);
    `);
    setDbForTests(db);

    const flujo = getFlujoStats();

    expect(flujo.kpis.adjudicadas.volumen).toBe(15000);
    expect(flujo.porTipo.find((row) => row.nombre === 'Servicios')?.adjudicadasVol).toBe(15000);
    expect(flujo.porProcedimiento.find((row) => row.nombre === 'Abierto')?.adjudicadasVol).toBe(15000);
    expect(flujo.porOrganismo.find((row) => row.nombre === 'Ayuntamiento de Alcázar de San Juan')?.adjudicadasVol).toBe(15000);
    expect(flujo.porTipo.find((row) => row.nombre === 'Servicios')?.totalVol).toBe(24000);
  });

  it('keeps same-name contracting authorities separate in flow breakdowns', () => {
    const db = createGeneratedTestDb(20261021, 2);
    db.prepare("UPDATE contracts SET award_amount_type = 'unitario', year = 2026").run();
    db.prepare("UPDATE contracting_authorities SET name = 'Organismo con nombre compartido'").run();
    db.prepare(`UPDATE contracts
      SET contracting_authority_name = 'Organismo con nombre compartido',
          award_amount_type = 'total', awarded_amount = 1000, status = 'Adjudicada'
      WHERE id = 'generated-20261021-1'`).run();
    db.prepare(`UPDATE contracts
      SET contracting_authority_name = 'Organismo con nombre compartido',
          award_amount_type = 'total', awarded_amount = 3000, status = 'Adjudicada'
      WHERE id = 'generated-20261021-2'`).run();
    setDbForTests(db);

    try {
      const rows = getFlujoStats(2026).porOrganismo;
      const volumeByAuthority = new Map(rows.map((row) => [row.authorityKey, row.adjudicadasVol]));

      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.nombre)).toEqual([
        'Organismo con nombre compartido',
        'Organismo con nombre compartido',
      ]);
      expect(volumeByAuthority.get('generated-authority-1')).toBe(1000);
      expect(volumeByAuthority.get('generated-authority-2')).toBe(3000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('classifies English terminal parent statuses before residual awardees and amounts', () => {
    const db = createGeneratedTestDb(20261018, 2);
    setDbForTests(db);
    try {
      db.prepare(`
        UPDATE contracts
        SET year = 2026,
            procedure = 'Abierto',
            contract_type = 'Servicios',
            economic_nature = 'gasto',
            scope = 'Directa Municipal',
            award_amount_type = 'total',
            awardee = CASE
              WHEN id = 'generated-20261018-1' THEN 'Empresa residual desierta'
              ELSE 'Empresa residual cancelada'
            END,
            awarded_amount = CASE
              WHEN id = 'generated-20261018-1' THEN 1000
              ELSE 2000
            END,
            amount_excl_vat = CASE
              WHEN id = 'generated-20261018-1' THEN 10000
              ELSE 15000
            END,
            status = CASE
              WHEN id = 'generated-20261018-1' THEN 'Deserted'
              ELSE 'Cancelled'
            END,
            is_lotized = 0,
            lot_count = 0
      `).run();

      const flujo = getFlujoStats();

      expect(flujo.kpis.adjudicadas.contratos).toBe(0);
      expect(flujo.kpis.adjudicadas.volumen).toBe(0);
      expect(flujo.kpis.desiertas.contratos).toBe(1);
      expect(flujo.kpis.desiertas.volumen).toBe(10000);
      expect(flujo.kpis.anuladas.contratos).toBe(1);
      expect(flujo.kpis.anuladas.volumen).toBe(15000);
      expect(flujo.porTipo.find((row) => row.nombre === 'Servicios')?.adjudicadasVol).toBe(0);
      expect(flujo.porTipo.find((row) => row.nombre === 'Servicios')?.desiertasVol).toBe(10000);
      expect(flujo.porTipo.find((row) => row.nombre === 'Servicios')?.anuladasVol).toBe(15000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('counts only unawarded lot budgets for a mixed deserted parent contract', () => {
    const db = createGeneratedTestDb(20261014, 1);
    const contractId = 'generated-20261014-1';

    db.prepare(`UPDATE contracts SET
      status = 'Desierta',
      awardee = 'Varios adjudicatarios',
      offer_count = 0,
      award_amount_type = 'total',
      awarded_amount = 10000,
      amount_excl_vat = 15000,
      is_lotized = 1,
      lot_count = 2,
      lots_source = 'CODICE_PROJECT_LOT',
      year = 2026,
      scope = 'Directa Municipal',
      procedure = 'Abierto',
      contract_type = 'Servicios',
      economic_nature = 'gasto'
      WHERE id = ?`).run(contractId);

    db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(contractId);
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, amount_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('mixed-flow-awarded', ?, 'GEN/2026/6', '1', 'Lote adjudicado', 10000, 10000, 10000, 'Empresa Flujo Mixto', 'Resuelto'),
        ('mixed-flow-deserted', ?, 'GEN/2026/6', '2', 'Lote desierto', 5000, 5000, NULL, NULL, 'Desierto')
    `).run(contractId, contractId);

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES ('mixed-flow-award', ?, 'GEN/2026/6', '1', 0, 'Empresa Flujo Mixto', 10000, 'Adjudicado')
    `).run(contractId);

    setDbForTests(db);
    try {
      const flujo = getFlujoStats();
      expect(flujo.kpis.desiertas.contratos).toBe(1);
      expect(flujo.kpis.desiertas.volumen).toBe(5000);
      expect(flujo.kpis.adjudicadas.volumen).toBe(10000);
      expect(flujo.kpis.totalVolumen).toBe(15000);
      const servicios = flujo.porTipo.find((row) => row.nombre === 'Servicios');
      expect(servicios?.desiertasVol).toBe(5000);
      expect(servicios?.adjudicadasVol).toBe(10000);
      expect(servicios?.totalVol).toBe(15000);
      expect(flujo.evolucion.find((row) => row.year === 2026)?.volumenDesiertas).toBe(5000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('uses lot_awards as awarded flow volume when present', () => {
    const db = createGeneratedTestDb(20260931, 1);
    db.prepare(`UPDATE contracts SET
      status = 'Adjudicada', awardee = 'Varios adjudicatarios', award_amount_type = 'total',
      awarded_amount = 999, amount_excl_vat = 20000, is_lotized = 1, lot_count = 3, year = 2026,
      scope = 'Directa Municipal', procedure = 'Abierto'
      WHERE id = 'generated-20260931-1'`).run();
    db.prepare(`DELETE FROM contract_lots WHERE contract_id = 'generated-20260931-1'`).run();
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee
      ) VALUES
        ('flujo-lot-1', 'generated-20260931-1', '1', 'Lote 1', 7000, 'Adjudicado', 'Empresa Flujo A'),
        ('flujo-lot-2', 'generated-20260931-1', '2', 'Lote 2', NULL, 'Adjudicado', 'Empresa Flujo B'),
        ('flujo-lot-cancelled', 'generated-20260931-1', '3', 'Lote cancelado', 3000, 'Cancelled', 'Empresa Flujo C')
    `).run();
    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertAward.run('flujo-award-1', 'generated-20260931-1', 'GEN/2026/1', '1', 0, 'Empresa Flujo A', 6000, 'Adjudicado');
    insertAward.run('flujo-award-cancelled', 'generated-20260931-1', 'GEN/2026/1', '3', 0, 'Empresa Flujo C', 3000, 'Adjudicado');

    setDbForTests(db);
    const partial = getFlujoStats();
    expect(partial.kpis.adjudicadas.volumen).toBe(7000);

    insertAward.run('flujo-award-2', 'generated-20260931-1', 'GEN/2026/1', '2', 0, 'Empresa Flujo B', 4000, 'Adjudicado');

    const complete = getFlujoStats();
    expect(complete.kpis.adjudicadas.volumen).toBe(10000);
  });

  it('does not classify unknown awarded lot budgets as deserted volume', () => {
    const db = createGeneratedTestDb(20261015, 1);
    const contractId = 'generated-20261015-1';

    db.prepare(`UPDATE contracts SET
      status = 'Adjudicada',
      awardee = 'Varios adjudicatarios',
      award_amount_type = 'total',
      awarded_amount = NULL,
      amount_excl_vat = 15000,
      is_lotized = 1,
      lot_count = 2,
      year = 2026,
      scope = 'Directa Municipal',
      procedure = 'Abierto',
      contract_type = 'Servicios'
      WHERE id = ?`).run(contractId);

    db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(contractId);
    db.prepare('DELETE FROM lot_awards WHERE contract_id = ?').run(contractId);
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, amount_excl_vat,
        awarded_amount, awardee, lot_status
      ) VALUES
        ('unknown-award-lot-1', ?, '1', 10000, 10000, NULL, 'Empresa A', 'Adjudicado'),
        ('unknown-award-lot-2', ?, '2', 5000, 5000, NULL, 'Empresa B', 'Adjudicado')
    `).run(contractId, contractId);
    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES ('unknown-award-row', ?, 'GEN/2026/15', '1', 0, 'Empresa A', NULL, 'AWARDED')
    `).run(contractId);

    setDbForTests(db);
    try {
      const flujo = getFlujoStats();
      const servicios = flujo.porTipo.find((row) => row.nombre === 'Servicios');

      expect(flujo.kpis.adjudicadas.contratos).toBe(1);
      expect(flujo.kpis.adjudicadas.volumen).toBe(0);
      expect(flujo.kpis.desiertas.volumen).toBe(0);
      expect(flujo.kpis.totalVolumen).toBe(0);
      expect(servicios?.desiertasVol).toBe(0);
      expect(servicios?.totalVol).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('does not use PBL as awarded volume when the awarded amount is missing', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/db.ts'), 'utf8');
    expect(source).toContain('FROM contract_lots lot');
    expect(source).toContain('sum(lot.awarded_amount)');
    expect(source).toContain("eligibleAwardLotStatusSql('lot')");
  });

  it('computes global KPIs covering 100% of tenders in DB', () => {
    const flujo = getFlujoStats();
    expect(flujo.kpis).toBeDefined();

    const { adjudicadas, desiertas, enCurso, anuladas, totalLicitaciones } = flujo.kpis;
    expect(adjudicadas.contratos).toBeGreaterThan(1800);
    expect(desiertas.contratos).toBeGreaterThan(0);
    expect(enCurso.contratos).toBeGreaterThan(10);
    expect(anuladas.contratos).toBeGreaterThanOrEqual(1);

    expect(adjudicadas.contratos + desiertas.contratos + enCurso.contratos + anuladas.contratos)
      .toBe(totalLicitaciones);

    expect(flujo.kpis.tasaDesiertasPct).toBeGreaterThan(0);
    expect(flujo.kpis.tasaDesiertasPct).toBeLessThan(100);
  });

  it('computes breakdown by contract type, procedure, and organism', () => {
    const flujo = getFlujoStats();

    expect(flujo.porTipo.length).toBeGreaterThan(0);
    const obras = flujo.porTipo.find((t) => t.nombre.toLowerCase().includes('obra'));
    expect(obras).toBeDefined();
    expect(obras!.adjudicadas).toBeGreaterThan(0);
    expect(obras!.total).toBeGreaterThan(0);

    expect(flujo.porProcedimiento.length).toBeGreaterThan(0);
    const menor = flujo.porProcedimiento.find((p) => p.nombre.toLowerCase().includes('menor'));
    expect(menor).toBeDefined();

    expect(flujo.porOrganismo.length).toBeGreaterThan(0);
    const ayto = flujo.porOrganismo.find((o) => o.nombre.toLowerCase().includes('ayuntamiento'));
    expect(ayto).toBeDefined();
    expect(ayto!.total).toBeGreaterThan(0);
  });

  it('detects real deserted-to-awarded pairs in Alcázar database', () => {
    const flujo = getFlujoStats();
    expect(flujo.readjudicaciones.length).toBeGreaterThan(10);

    // Verify properties of detected pairs
    for (const r of flujo.readjudicaciones) {
      expect(r.desierta.id).toBeTruthy();
      expect(r.posterior.id).toBeTruthy();
      expect(r.posterior.adjudicatario).toBeTruthy();
      expect(r.desierta.organo).toBe(r.posterior.organo);
      if (r.diasTranscurridos !== null) {
        expect(r.diasTranscurridos).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('filters by year correctly', () => {
    const flujo2024 = getFlujoStats(2024);
    expect(flujo2024.kpis.totalLicitaciones).toBeGreaterThan(0);
    expect(flujo2024.kpis.totalLicitaciones).toBeLessThan(getFlujoStats().kpis.totalLicitaciones);

    for (const r of flujo2024.readjudicaciones) {
      expect(r.desierta.year === 2024 || r.posterior.year === 2024).toBe(true);
    }
  });

  it('filters by ambito correctly', () => {
    const flujoDirecta = getFlujoStats(undefined, 'directa');
    const flujoComser = getFlujoStats(undefined, 'mancomunidad');

    expect(flujoDirecta.kpis.totalLicitaciones).toBeGreaterThan(0);
    expect(flujoComser.kpis.totalLicitaciones).toBeGreaterThan(0);

    for (const o of flujoDirecta.porOrganismo) {
      expect(o.nombre).not.toContain('COMSERMANCHA');
    }
    for (const o of flujoComser.porOrganismo) {
      expect(o.nombre).toContain('COMSERMANCHA');
    }
  });

  it('is integrated into global getStats', () => {
    const stats = getStats();
    expect(stats.flujo).toBeDefined();
    expect(stats.flujo.kpis.totalLicitaciones).toBe(stats.totalLicitaciones);
  });
});  it('uses canonical lot_awards amount in readjudication pairs', () => {
    const db = createGeneratedTestDb(20261006, 2);

    db.prepare(`UPDATE contracts SET
      status = 'Desierta', awardee = NULL, awarded_amount = NULL, award_amount_type = 'total',
      amount_excl_vat = 50000, amount_incl_vat = 60500,
      case_number = 'DESIERTA/2026', object_description = 'Servicio de mantenimiento de prueba',
      contract_type = 'Servicios', procedure = 'Abierto',
      contracting_authority_name = 'Ayuntamiento de Alcázar de San Juan',
      publication_date = '2026-01-10', award_date = NULL, offer_count = 0, year = 2026
      WHERE id = 'generated-20261006-1'`).run();

    db.prepare(`UPDATE contracts SET
      status = 'Adjudicada', awardee = 'Empresa Readjudicada', award_amount_type = 'total',
      awarded_amount = 999, amount_excl_vat = 12000, amount_incl_vat = 14520,
      case_number = 'ADJUDICADA/2026', object_description = 'Servicio de mantenimiento de prueba',
      contract_type = 'Servicios', procedure = 'Abierto',
      contracting_authority_name = 'Ayuntamiento de Alcázar de San Juan',
      publication_date = '2026-02-10', award_date = '2026-03-01', offer_count = 3, year = 2026
      WHERE id = 'generated-20261006-2'`).run();

    db.prepare(`DELETE FROM contract_lots WHERE contract_id IN ('generated-20261006-1', 'generated-20261006-2')`).run();
    db.prepare(`DELETE FROM lot_awards WHERE contract_id IN ('generated-20261006-1', 'generated-20261006-2')`).run();
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee
      ) VALUES
        ('readj-lot-1', 'generated-20261006-2', '1', 'Lote 1', 7000, 'Adjudicado', 'Empresa Readjudicada'),
        ('readj-lot-2', 'generated-20261006-2', '2', 'Lote 2', 5000, 'Adjudicado', 'Empresa Readjudicada')
    `).run();
    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertAward.run('readj-award-1', 'generated-20261006-2', 'ADJUDICADA/2026', '1', 0, 'Empresa Readjudicada', 6000, 'Adjudicado');
    insertAward.run('readj-award-2', 'generated-20261006-2', 'ADJUDICADA/2026', '2', 0, 'Empresa Readjudicada', 4000, 'Adjudicado');

    setDbForTests(db);
    const flujo = getFlujoStats();
    const pair = flujo.readjudicaciones.find((r) => r.desierta.id === 'generated-20261006-1');

    expect(pair).toBeDefined();
    expect(pair!.posterior.id).toBe('generated-20261006-2');
    expect(pair!.posterior.amount).toBe(10000);
    expect(pair!.diferenciaImporte).toBe(-40000);
  });


