import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
import { getDuracionEfectivaStats } from './duracion-efectiva';
import { createGeneratedTestDb } from './test-db';
import { setDbForTests } from './db';

describe('Análisis de Duración Efectiva vs. Prevista (Art. 29 y 195 LCSP)', () => {
  describe('getDuracionEfectivaStats', () => {
    afterEach(() => {
      setDbForTests(null);
    });

    it('mantiene contract_lots cuando lot_awards no cubre todos los lotes', () => {
      const db = createGeneratedTestDb(20261001, 1);
      db.prepare(`UPDATE contracts SET year = 2024, status = 'Adjudicada', award_amount_type = 'total', awarded_amount = NULL,
        awardee = 'Varios adjudicatarios', is_lotized = 1, lot_count = 3, duration = '1', duration_unit = 'months',
        award_date = '2024-01-01', publication_date = '2024-03-01' WHERE id = 'generated-20261001-1'`).run();
      const insertLot = db.prepare(`INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_name, budget_excl_vat, awarded_amount, awardee, lot_status, award_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      insertLot.run('duration-lot-1', 'generated-20261001-1', '1', 'Lote 1', 7000, 6000, 'Empresa Lote 1', 'Adjudicado', '2024-01-01');
      insertLot.run('duration-lot-2', 'generated-20261001-1', '2', 'Lote 2', 6000, 4000, 'Empresa Lote 2', 'Adjudicado', '2024-01-01');
      insertLot.run('duration-lot-3', 'generated-20261001-1', '3', 'Lote 3', 5000, 5000, 'Empresa Lote 3', 'Adjudicado', '2024-01-01');
      db.prepare("INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run('duration-award-1', 'generated-20261001-1', 'GEN/2024/1', '1', 0, 'Empresa Award 1', 3500, 'Adjudicado');
      db.prepare("INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run('duration-award-2', 'generated-20261001-1', 'GEN/2024/1', '2', 0, 'Empresa Award 2', 2500, 'Adjudicado');

      setDbForTests(db);

      const stats = getDuracionEfectivaStats();
      const contrato = stats.contratosConDilacion.find((item) => item.id === 'generated-20261001-1');

      expect(stats.resumen.totalEvaluados).toBe(1);
      expect(contrato).toBeDefined();
      expect(contrato?.amount).toBe(15000);
    });

    it('ignora resultados previos a la adjudicación en la duración efectiva', () => {
      const db = createGeneratedTestDb(20261031, 1);
      const contractId = 'generated-20261031-1';
      db.prepare(`
        UPDATE contracts
        SET year = 2024, status = 'Adjudicada', award_amount_type = 'total',
            awarded_amount = NULL, awardee = 'Varios adjudicatarios',
            is_lotized = 1, lot_count = 1, duration = '1', duration_unit = 'months',
            award_date = '2024-01-01', publication_date = '2024-03-01'
        WHERE id = ?
      `).run(contractId);

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name, awarded_amount,
          awardee, lot_status, award_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('duration-pre-award-lot', contractId, '1', 'Lote único',
        1000, 'Empresa adjudicada', 'Adjudicado', '2024-01-01');

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awarded_amount, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('duration-pre-award-result', contractId, 'GEN/2024/31', '1', 0,
        'Licitador mejor valorado', 900, 'BEST_RATED_TENDERER');

      setDbForTests(db);
      try {
        const stats = getDuracionEfectivaStats();
        const item = stats.contratosConDilacion.find((row) => row.id === contractId);
        expect(item).toBeDefined();
        expect(item?.amount).toBe(1000);
        expect(item?.awardee).toBe('Empresa adjudicada');
        expect(item?.awardee).not.toContain('Licitador mejor valorado');
      } finally {
        setDbForTests(null);
        db.close();
      }
    });

    it('no usa un snapshot parcial de lot_awards cuando otro lote no tiene importe adjudicado', () => {
      const db = createGeneratedTestDb(20261022, 1);
      const contractId = 'generated-20261022-1';
      db.prepare(`UPDATE contracts SET year = 2024, status = 'Adjudicada', award_amount_type = 'total',
        awarded_amount = 2000, awardee = 'Varios adjudicatarios', is_lotized = 1, lot_count = 2,
        duration = '1', duration_unit = 'months', award_date = '2024-01-01', publication_date = '2024-03-01'
        WHERE id = ?`).run(contractId);

      const insertLot = db.prepare(`INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_name, awarded_amount, awardee, lot_status, award_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      insertLot.run('duration-partial-amount-lot-a', contractId, '1', 'Lote A', 1000, 'Empresa A', 'Adjudicado', '2024-01-01');
      insertLot.run('duration-partial-amount-lot-b', contractId, '2', 'Lote B', null, 'Empresa B', 'Adjudicado', '2024-01-01');

      db.prepare(`INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'duration-partial-amount-award', contractId, 'GEN/2024/1', '1', 0,
        'Empresa A', 900, 'Adjudicado'
      );

      setDbForTests(db);
      try {
        const stats = getDuracionEfectivaStats();
        const contrato = stats.contratosConDilacion.find((item) => item.id === contractId);
        expect(contrato).toBeDefined();
        expect(contrato?.amount).toBe(1000);
      } finally {
        setDbForTests(null);
        db.close();
      }
    });

    it('rechaza cobertura de lot_awards con la misma cardinalidad pero lotes distintos', () => {
      const db = createGeneratedTestDb(20261001, 1);
      db.prepare(`UPDATE contracts SET year = 2024, status = 'Adjudicada', award_amount_type = 'total', awarded_amount = NULL,
        awardee = 'Varios adjudicatarios', is_lotized = 1, lot_count = 2, duration = '1', duration_unit = 'months',
        award_date = '2024-01-01', publication_date = '2024-03-01' WHERE id = 'generated-20261001-1'`).run();

      const insertLot = db.prepare(`INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_name, budget_excl_vat, awarded_amount, awardee, lot_status, award_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      insertLot.run('duration-set-lot-1', 'generated-20261001-1', '1', 'Lote 1', 7000, 6000, 'Empresa Lote 1', 'Adjudicado', '2024-01-01');
      insertLot.run('duration-set-lot-2', 'generated-20261001-1', '2', 'Lote 2', 6000, 4000, 'Empresa Lote 2', 'Adjudicado', '2024-01-01');

      const insertAward = db.prepare(`INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      insertAward.run('duration-set-award-1', 'generated-20261001-1', 'GEN/2024/1', '1', 0, 'Empresa Award 1', 3500, 'Adjudicado');
      insertAward.run('duration-set-award-3', 'generated-20261001-1', 'GEN/2024/1', '3', 0, 'Empresa Award 3', 2500, 'Adjudicado');

      setDbForTests(db);
      try {
        const stats = getDuracionEfectivaStats();
        const contrato = stats.contratosConDilacion.find((item) => item.id === 'generated-20261001-1');
        expect(contrato).toBeDefined();
        expect(contrato?.amount).toBe(10000);
        expect(contrato?.awardee).toBe('Empresa Lote 1,Empresa Lote 2');
      } finally {
        setDbForTests(null);
        db.close();
      }
    });


    it('usa lot_awards cuando el lote no tiene adjudicatario en contract_lots', () => {
      const db = createGeneratedTestDb(20261015, 1);
      const contractId = 'generated-20261015-1';
      db.prepare(`UPDATE contracts SET year = 2024, status = 'Adjudicada', award_amount_type = 'total',
        awarded_amount = NULL, awardee = 'Varios adjudicatarios', is_lotized = 1, lot_count = 1,
        duration = '1', duration_unit = 'months', award_date = '2024-01-01', publication_date = '2024-03-01'
        WHERE id = ?`).run(contractId);
      db.prepare(`INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_name, awarded_amount, awardee, lot_status, award_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'duration-null-awardee-lot', contractId, '1', 'Lote sin awardee', null, null, 'Adjudicado', '2024-01-01'
      );
      db.prepare(`INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'duration-null-awardee-award', contractId, 'GEN/2024/1', '1', 0, 'Empresa Award', 7000, 'Adjudicado'
      );

      setDbForTests(db);
      try {
        const stats = getDuracionEfectivaStats();
        const contrato = stats.contratosConDilacion.find((item) => item.id === contractId);
        expect(contrato).toBeDefined();
        expect(contrato?.amount).toBe(7000);
        expect(contrato?.awardee).toBe('Empresa Award');
      } finally {
        setDbForTests(null);
        db.close();
      }
    });

    it('no usa PBL como fallback para el importe de los contratos analizados', () => {
      const source = readFileSync(path.resolve(process.cwd(), 'src/lib/duracion-efectiva.ts'), 'utf8');
      expect(source).toContain("coalesce(awarded_amount, 0)");
      expect(source).toContain("sum(lot.awarded_amount)");
      expect(source).toContain('const lotAwardsAmountCovered = hasLotAwardsTable');
      expect(source).toContain('award.lot_number = lot.lot_number');
      expect(source).not.toContain('count(DISTINCT award.lot_number)');
      expect(source).not.toContain("coalesce(awarded_amount, amount_excl_vat, 0) ELSE NULL END, 2) as amount");
    });
    it('calcula métricas agregadas de dilación temporal sobre contratos con plazo oficial', () => {
      const stats = getDuracionEfectivaStats();

      expect(stats.resumen.totalEvaluados).toBeGreaterThan(1000);
      expect(stats.resumen.conDesviacion).toBeGreaterThan(200);
      expect(stats.resumen.pctConDesviacion).toBeGreaterThan(15);
      expect(stats.resumen.ratioMedioGlobal).toBeGreaterThan(1.0);
      expect(stats.resumen.desviacionMediaDias).toBeGreaterThan(20);
      expect(stats.resumen.casosCriticosArt29).toBeGreaterThan(0);
      expect(stats.resumen.volumenConDesviacion).toBeGreaterThan(1000000);
    });

    it('genera la distribución en 4 tramos de dilación temporal coherentes', () => {
      const stats = getDuracionEfectivaStats();

      expect(stats.tramosDesviacion.length).toBe(4);

      const aTiempo = stats.tramosDesviacion.find((t) => t.nivel === 'a_tiempo');
      const moderada = stats.tramosDesviacion.find((t) => t.nivel === 'moderada');
      const severa = stats.tramosDesviacion.find((t) => t.nivel === 'advertencia');
      const critica = stats.tramosDesviacion.find((t) => t.nivel === 'alerta');

      expect(aTiempo).toBeDefined();
      expect(moderada).toBeDefined();
      expect(severa).toBeDefined();
      expect(critica).toBeDefined();

      const sumPcts = stats.tramosDesviacion.reduce((acc, t) => acc + t.pct, 0);
      expect(Math.round(sumPcts)).toBe(100);
    });

    it('identifica obras públicas con severa demora de ejecución (Art. 195 LCSP)', () => {
      const stats = getDuracionEfectivaStats();

      expect(stats.rankingObrasDemora.length).toBeGreaterThan(5);

      for (const obra of stats.rankingObrasDemora) {
        expect(obra.tipo.toLowerCase()).toContain('obra');
        expect(obra.desviacionDias).toBeGreaterThan(0);
        expect(obra.ratioDuracion).toBeGreaterThan(1.0);
        expect(obra.artLCSP).toContain('Art. 195 LCSP');
      }

      // Comprobar orden descendente por días de retraso
      for (let i = 0; i < stats.rankingObrasDemora.length - 1; i++) {
        expect(stats.rankingObrasDemora[i].desviacionDias).toBeGreaterThanOrEqual(
          stats.rankingObrasDemora[i + 1].desviacionDias
        );
      }
    });

    it('identifica servicios y suministros con prórrogas desproporcionadas o control de 5 años (Art. 29 LCSP)', () => {
      const stats = getDuracionEfectivaStats();

      expect(stats.rankingServiciosProrrogas.length).toBeGreaterThan(5);

      for (const serv of stats.rankingServiciosProrrogas) {
        const t = serv.tipo.toLowerCase();
        expect(t.includes('servicio') || t.includes('suministro')).toBe(true);
        expect(serv.ratioDuracion).toBeGreaterThan(1.2);
      }

      // Comprobar orden descendente por ratio
      for (let i = 0; i < stats.rankingServiciosProrrogas.length - 1; i++) {
        expect(stats.rankingServiciosProrrogas[i].ratioDuracion).toBeGreaterThanOrEqual(
          stats.rankingServiciosProrrogas[i + 1].ratioDuracion
        );
      }
    });

    it('desglosa por tipo de contrato y por organismo contratante', () => {
      const stats = getDuracionEfectivaStats();

      expect(stats.porTipoContrato.length).toBeGreaterThanOrEqual(3);
      expect(stats.porOrganismo.length).toBeGreaterThanOrEqual(2);

      const ayto = stats.porOrganismo.find((o) => o.organo.includes('Ayuntamiento'));
      expect(ayto).toBeDefined();
      expect(ayto?.total).toBeGreaterThan(100);
    });

    it('soporta filtrado por año y ámbito municipal sin inconsistencias', () => {
      const stats2023 = getDuracionEfectivaStats(2023);
      expect(stats2023.resumen.totalEvaluados).toBeGreaterThan(50);

      const statsMancomunidad = getDuracionEfectivaStats(undefined, 'Indirecta (Mancomunidad)');
      expect(statsMancomunidad.resumen.totalEvaluados).toBeGreaterThan(20);
      expect(statsMancomunidad.porOrganismo.every((o) => o.organo.includes('COMSERMANCHA'))).toBe(true);
    });

    it('desglosa contratos con dilación en 4 tramos de gravedad coherentes', () => {
      const stats = getDuracionEfectivaStats();

      const { mas5xCount, de3xa5xCount, de1_5xa3xCount, hasta1_5xCount, conDesviacion } = stats.resumen;
      const sumaTramos = mas5xCount + de3xa5xCount + de1_5xa3xCount + hasta1_5xCount;

      expect(sumaTramos).toBe(conDesviacion);
      expect(stats.contratosConDilacion.length).toBe(conDesviacion);

      for (const c of stats.contratosConDilacion) {
        expect(c.ratioDuracion).toBeGreaterThan(1.05);
      }

      if (stats.contratosConDilacion.length > 0) {
        const maxRatio = Math.max(...stats.contratosConDilacion.map((c) => c.ratioDuracion));
        expect(stats.contratosConDilacion[0].ratioDuracion).toBe(maxRatio);
      }
    });
  });
});
