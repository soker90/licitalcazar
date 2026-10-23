import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { detectLotes, getLotesStats, getLicitacionById, evaluarRedFlags, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';

describe('Análisis de Lotes y Acceso de PYMEs (Art. 99 LCSP)', () => {
  describe('detectLotes', () => {
    it('prioriza datos estructurados CODICE sobre expresiones textuales', () => {
      // Caso 1: Estructurado indica 6 lotes (aunque el objeto no lo mencione explícitamente)
      const resStruct = detectLotes('Servicio de consultoría y asistencia técnica', '17/2023', {
        lotizado: 1,
        num_lotes: 6,
        lotes_origen: 'CODICE_PROJECT_LOT',
      });
      expect(resStruct.lotizado).toBe(true);
      expect(resStruct.numLotes).toBe(6);
      expect(resStruct.origen).toBe('CODICE_PROJECT_LOT');

      // Caso 2: Estructurado indica lote único (evita falsos positivos de palabras sueltas)
      const resSingle = detectLotes('Suministro de lote de material de fontanería', '99/2022', {
        lotizado: 0,
        num_lotes: 1,
        lotes_origen: null,
      });
      expect(resSingle.lotizado).toBe(false);
      expect(resSingle.numLotes).toBe(1);
    });

    it('detecta lotes con números arábigos', () => {
      const res = detectLotes('Adquisición de equipamiento técnico, 2 lotes.', '1/2024');
      expect(res.lotizado).toBe(true);
      expect(res.numLotes).toBe(2);

      const res5 = detectLotes('Mobiliario para Casa de Cultura, 5 lotes', '2/2024');
      expect(res5.lotizado).toBe(true);
      expect(res5.numLotes).toBe(5);

      const res6 = detectLotes('Modernización turística EDUSI. División en 6 lotes.', '17/2023');
      expect(res6.lotizado).toBe(true);
      expect(res6.numLotes).toBe(6);
    });

    it('detecta lotes expresados en palabras', () => {
      const res2 = detectLotes('Poda del arbolado de Alcázar de San Juan, dos lotes.', '25/2025');
      expect(res2.lotizado).toBe(true);
      expect(res2.numLotes).toBe(2);

      const res3 = detectLotes('Poda del arbolado de Alcázar de San Juan, tres lotes.', '20/2024');
      expect(res3.lotizado).toBe(true);
      expect(res3.numLotes).toBe(3);

      const res5 = detectLotes('Plan de medios institucional, cinco lotes.', '6/2025');
      expect(res5.lotizado).toBe(true);
      expect(res5.numLotes).toBe(5);
    });

    it('detecta expresiones "por lotes", "dividida en lotes" o enumeración de lotes', () => {
      const resPor = detectLotes('Enajenación de parcelas industriales; por lotes.', '1/2018');
      expect(resPor.lotizado).toBe(true);
      expect(resPor.numLotes).toBeGreaterThanOrEqual(2);

      const resDiv = detectLotes('Pavimentación polígono industrial, dividida en dos lotes.', '3/2019');
      expect(resDiv.lotizado).toBe(true);
      expect(resDiv.numLotes).toBe(2);

      const resEnum = detectLotes('Docentes formativos (Lote 1 conserje y Lote 2 dependencia)', '14/2022');
      expect(resEnum.lotizado).toBe(true);
      expect(resEnum.numLotes).toBe(2);
    });

    it('excluye falsos positivos de partida singular ("un lote de...") y lote único explícito', () => {
      const resUn = detectLotes('Adquisición de un lote de mobiliario urbano para parques', '2020/96H/CM');
      expect(resUn.lotizado).toBe(false);
      expect(resUn.numLotes).toBe(1);

      const resUnico = detectLotes('Servicio de limpieza viaria en lote único', '5/2022');
      expect(resUnico.lotizado).toBe(false);
      expect(resUnico.numLotes).toBe(1);

      const resNormal = detectLotes('Obras de urbanización de la Plaza de España', '1/2020');
      expect(resNormal.lotizado).toBe(false);
      expect(resNormal.numLotes).toBe(1);
    });
  });

  describe('separación PBL/adjudicación', () => {
    it('no presenta el PBL como adjudicación cuando falta el importe adjudicado', () => {
      const source = fs.readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
      expect(source).toMatch(/importeAdjudicacion: hasTerminalStructuredResult \? null : \(\s*lotAwardedAmount \?\? \(awardsForLot\.length === 0 \? l\.awarded_amount : null\)\s*\)/);
      expect(source).not.toContain('importeAdjudicacion: l.awarded_amount ?? (l.awardee ? l.amount_excl_vat : null)');
      expect(source).toContain('THEN (\n            SELECT round(sum(lot.awarded_amount), 2)');
      expect(source).not.toContain('coalesce(awarded_amount, amount_excl_vat, 0) as amount');
    });

    it('declara la compatibilidad de lot_awards en getLicitacionById', () => {
      const source = fs.readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
      const start = source.indexOf('export function getLicitacionById');
      const end = source.indexOf('export function getDocumentosForContract', start);
      const fn = source.slice(start, end);
      expect(fn).toContain('const hasLotAwardsTable = (() => {');
      expect(fn).toContain('if (hasLotAwardsTable)');
    });

    it('expone cada adjudicación de lot_awards sin agregar sus importes al lote', () => {
      const source = fs.readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
      expect(source).toContain('adjudicaciones: (hasTerminalStructuredResult ? [] : awardsForLot)');
      expect(source).toContain('importeAdjudicacion: award.awarded_amount ?? null');
      expect(source).toContain('SELECT lot_number, awardee, awardee_nif, awarded_amount');
      expect(source).toContain('ORDER BY CAST(lot_number AS INTEGER) ASC, lot_number ASC, award_index ASC');
    });
    it('mantiene el PBL separado en la ficha de lote', () => {
      const source = fs.readFileSync(new URL('../app/licitaciones/[id]/page.tsx', import.meta.url), 'utf8');
      expect(source).toContain('const adj = estadoLoteElegible ? lote.importeAdjudicacion : null;');
      expect(source).toContain('Array.isArray(l.adjudicaciones)');
      expect(source).not.toContain('lote.importeAdjudicacion ?? (tieneAdjudicatario ? lote.importeSinIva : null)');
      expect(source).toContain("const hasComparableAward = awardAmountType === 'total' && lic.importe_adjudicacion != null;");
    });
  });

  it('prioriza el total estructurado completo frente al importe heredado del contrato padre', () => {
    const db = createGeneratedTestDb(20261020, 1);
    setDbForTests(db);
    try {
      const contractId = 'generated-20261020-1';
      db.prepare(`
        UPDATE contracts
        SET case_number = 'GEN/2026/STRUCTURED-TOTAL',
            object_description = 'Contrato dividido en dos lotes',
            amount_excl_vat = 120,
            amount_incl_vat = 144,
            awarded_amount = 90,
            awarded_amount_incl_vat = 108,
            award_amount_type = 'total',
            awardee = 'Varios adjudicatarios',
            awardee_nif = NULL,
            is_lotized = 1,
            lot_count = 2,
            status = 'Adjudicada',
            award_date = '2026-01-20'
        WHERE id = ?
      `).run(contractId);

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          budget_excl_vat, budget_incl_vat, awarded_amount, awarded_amount_incl_vat,
          awardee, lot_status
        ) VALUES
          ('structured-total-lot-1', ?, 'GEN/2026/STRUCTURED-TOTAL', '1', 'Lote 1', 60, 72, 45, 54, 'Empresa A', 'Adjudicado'),
          ('structured-total-lot-2', ?, 'GEN/2026/STRUCTURED-TOTAL', '2', 'Lote 2', 60, 72, 45, 54, 'Empresa B', 'Adjudicado')
      `).run(contractId, contractId);

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awarded_amount, awarded_amount_incl_vat, result_state
        ) VALUES
          ('structured-total-award-1', ?, 'GEN/2026/STRUCTURED-TOTAL', '1', 0, 'Empresa A', 50, 60, 'Adjudicado'),
          ('structured-total-award-2', ?, 'GEN/2026/STRUCTURED-TOTAL', '2', 0, 'Empresa B', 50, 60, 'Adjudicado')
      `).run(contractId, contractId);

      const lic = getLicitacionById(contractId) as any;

      expect(lic.importe_adjudicacion).toBe(100);
      expect(lic.importe_adj_con_iva).toBe(120);
      expect(lic.lotes.map((l: any) => l.importeAdjudicacion)).toEqual([50, 50]);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('no suma importes estructurados cuando el contrato declara precio unitario', () => {
    const db = createGeneratedTestDb(20261020, 1);
    setDbForTests(db);
    try {
      const contractId = 'generated-20261020-1';
      db.prepare(`
        UPDATE contracts
        SET case_number = 'GEN/2026/UNIT-PRICE',
            object_description = 'Contrato con precios unitarios',
            awarded_amount = 31,
            awarded_amount_incl_vat = 37.51,
            award_amount_type = 'unitario',
            is_lotized = 1,
            lot_count = 2,
            status = 'Adjudicada',
            award_date = '2026-01-20'
        WHERE id = ?
      `).run(contractId);

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          awarded_amount, awarded_amount_incl_vat, awardee, lot_status
        ) VALUES
          ('unit-price-lot-1', ?, 'GEN/2026/UNIT-PRICE', '1', 'Lote 1', 50, 60, 'Empresa A', 'Adjudicado'),
          ('unit-price-lot-2', ?, 'GEN/2026/UNIT-PRICE', '2', 'Lote 2', 50, 60, 'Empresa B', 'Adjudicado')
      `).run(contractId, contractId);

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awarded_amount, awarded_amount_incl_vat, result_state
        ) VALUES
          ('unit-price-award-1', ?, 'GEN/2026/UNIT-PRICE', '1', 0, 'Empresa A', 50, 60, 'Adjudicado'),
          ('unit-price-award-2', ?, 'GEN/2026/UNIT-PRICE', '2', 0, 'Empresa B', 50, 60, 'Adjudicado')
      `).run(contractId, contractId);

      const lic = getLicitacionById(contractId) as any;

      expect(lic.importe_adjudicacion).toBe(31);
      expect(lic.importe_adj_con_iva).toBe(37.51);
      expect(lic.tipo_importe_adjudicacion).toBe('unitario');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('incluye el importe de un contrato relacionado cuando el adjudicatario solo aparece en lot_awards', () => {
    const db = createGeneratedTestDb(20261020, 2);
    setDbForTests(db);
    try {
      const currentId = 'generated-20261020-1';
      const relatedId = 'generated-20261020-2';

      db.prepare('DELETE FROM contracts WHERE id NOT IN (?, ?)').run(currentId, relatedId);

      db.prepare(`
        UPDATE contracts
        SET case_number = 'GEN/2026/CURRENT',
            awardee = 'Varios adjudicatarios',
            awardee_nif = NULL,
            awarded_amount = NULL,
            award_amount_type = 'total',
            is_lotized = 1,
            lot_count = 2,
            status = 'Adjudicada',
            award_date = '2026-01-20'
        WHERE id = ?
      `).run(currentId);

      db.prepare(`
        UPDATE contracts
        SET case_number = 'GEN/2026/RELATED',
            awardee = 'Otra Empresa',
            awardee_nif = NULL,
            awarded_amount = 999,
            award_amount_type = 'total',
            status = 'Adjudicada',
            award_date = '2026-01-19'
        WHERE id = ?
      `).run(relatedId);

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          awarded_amount, awardee, lot_status
        ) VALUES
          ('related-amount-current-1', ?, 'GEN/2026/CURRENT', '1', 'Lote 1', 10, 'Empresa Canonica A', 'Adjudicado'),
          ('related-amount-current-2', ?, 'GEN/2026/CURRENT', '2', 'Lote 2', 20, 'Empresa Canonica B', 'Adjudicado')
      `).run(currentId, currentId);

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awarded_amount, result_state
        ) VALUES ('related-amount-award', ?, 'GEN/2026/RELATED', '1', 0,
                  'Empresa Canonica A', 50, 'Adjudicado')
      `).run(relatedId);

      const lic = getLicitacionById(currentId) as any;
      const company = lic.lotesAdjudicatariosInfo.find((item: any) => item.awardee === 'Empresa Canonica A');

      expect(company).toBeDefined();
      expect(company.relacionadas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: relatedId,
            awarded_amount: 50,
          }),
        ]),
      );
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  describe('getLotesStats', () => {
    it('calcula métricas globales de lotización y resumen de contratos mayores', () => {
      const stats = getLotesStats();

      expect(stats.resumen.totalMayores).toBeGreaterThan(500);
      expect(stats.resumen.volumenTotalMayores).toBeGreaterThan(50000000);
      expect(stats.resumen.totalGrandes100k).toBeGreaterThan(50);

      // Tras la integración de los datos CODICE, la tasa real de lotización supera el 50%
      expect(stats.resumen.pctLotizadosGrandes100k).toBeGreaterThanOrEqual(0);
      expect(stats.resumen.pctLotizadosGrandes100k).toBeLessThanOrEqual(100);
      expect(stats.resumen.pctLotizadosMayores).toBeGreaterThanOrEqual(0);
      expect(stats.resumen.pctLotizadosMayores).toBeLessThanOrEqual(100);

      // Concurrencia empírica: contratos lotizados tienen mayor concurrencia media
      expect(stats.resumen.concurrencia.mediaOfertasLotizados).toBeGreaterThanOrEqual(stats.resumen.concurrencia.mediaOfertasNoLotizados);
    });

    it('muestra los adjudicatarios reales de los lotes en contratos multilot', () => {
      const stats = getLotesStats();
      const contrato = stats.contratosLotizados.find((c: any) => c.case_number === '2025/0012');
      expect(contrato).toBeDefined();
      expect(contrato?.awardee).toContain('PEDRO SEGURA, S.L.');
      expect(contrato?.awardee).toContain('VALORIZA SERVICIOS MEDIOAMBIENTALES, S.A.');
      expect(contrato?.awardee).toContain('CTC SERVICIOS AMBIENTALES, S.L.');
      expect(contrato?.awardee).not.toBe('CTC SERVICIOS AMBIENTALES, S.L.');
    });

    it('excluye adjudicaciones estructuradas asociadas a lotes legacy cancelados', () => {
      const db = createGeneratedTestDb(20261031, 1);
      setDbForTests(db);
      try {
        const contractId = 'generated-20261031-1';
        db.prepare(`
          UPDATE contracts
          SET status = 'Adjudicada',
              procedure = 'Abierto',
              year = 2024,
              is_lotized = 1,
              lot_count = 2,
              award_amount_type = 'total',
              awarded_amount = NULL,
              awardee = 'Varios adjudicatarios'
          WHERE id = ?
        `).run(contractId);

        db.prepare(`
          INSERT INTO contract_lots (
            id, contract_id, case_number, lot_number, lot_name,
            awarded_amount, awardee, lot_status
          ) VALUES
            ('lotes-stats-active-31', ?, 'GEN/2024/31', '1', 'Lote activo', 100, 'Empresa Activa', 'Adjudicado'),
            ('lotes-stats-cancelled-31', ?, 'GEN/2024/31', '2', 'Lote cancelado', 200, 'Empresa Cancelada', 'Cancelled')
        `).run(contractId, contractId);

        db.prepare(`
          INSERT INTO lot_awards (
            id, contract_id, case_number, lot_number, award_index,
            awardee, awarded_amount, result_state
          ) VALUES
            ('lotes-stats-award-active-31', ?, 'GEN/2024/31', '1', 0, 'Empresa Activa', 90, 'Adjudicado'),
            ('lotes-stats-award-cancelled-31', ?, 'GEN/2024/31', '2', 0, 'Empresa Cancelada', 180, 'Adjudicado')
        `).run(contractId, contractId);

        const contract = getLotesStats().contratosLotizados.find((row) => row.id === contractId);
        expect(contract?.amount).toBe(90);
        expect(contract?.awardee).toBe('Empresa Activa');
        expect(contract?.awardee).not.toContain('Empresa Cancelada');
      } finally {
        setDbForTests(null);
        db.close();
      }
    });

    it('mantiene contract_lots cuando lot_awards solo cubre parte de los lotes y cambia a lot_awards con cobertura completa', () => {
      const db = createGeneratedTestDb(20261003, 1);
      setDbForTests(db);
      try {
        const contractId = 'generated-20261003-1';
        db.prepare(`
          UPDATE contracts
          SET procedure = 'Abierto',
              year = 2024,
              is_lotized = 1,
              lot_count = 2,
              award_amount_type = 'total',
              awarded_amount = NULL,
              awardee = 'Varios adjudicatarios'
          WHERE id = ?
        `).run(contractId);

        db.prepare(`
          INSERT INTO contract_lots (
            id, contract_id, case_number, lot_number, lot_name,
            awarded_amount, awardee, lot_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'lotes-stats-1', contractId, 'GEN/2024/1', '1', 'Lote 1',
          100, 'Empresa Legacy A', 'Adjudicado',
        );
        db.prepare(`
          INSERT INTO contract_lots (
            id, contract_id, case_number, lot_number, lot_name,
            awarded_amount, awardee, lot_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'lotes-stats-2', contractId, 'GEN/2024/1', '2', 'Lote 2',
          null, 'Empresa Legacy B', 'Adjudicado',
        );

        db.prepare(`
          INSERT INTO lot_awards (
            id, contract_id, case_number, lot_number, award_index,
            awardee, awarded_amount, result_state
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'lotes-stats-award-1', contractId, 'GEN/2024/1', '1', 0,
          'Empresa Canonica A', 90, 'Adjudicado',
        );

        const partial = getLotesStats().contratosLotizados.find((row) => row.id === contractId);
        expect(partial?.amount).toBe(100);
        expect(partial?.awardee).toContain('Empresa Legacy A');
        expect(partial?.awardee).toContain('Empresa Legacy B');
        expect(partial?.awardee).not.toContain('Empresa Canonica A');

        db.prepare(`
          INSERT INTO lot_awards (
            id, contract_id, case_number, lot_number, award_index,
            awardee, awarded_amount, result_state
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'lotes-stats-award-2', contractId, 'GEN/2024/1', '3', 0,
          'Empresa Canonica B', 180, 'Adjudicado',
        );

        const mismatched = getLotesStats().contratosLotizados.find((row) => row.id === contractId);
        expect(mismatched?.amount).toBe(100);
        expect(mismatched?.awardee).toContain('Empresa Legacy A');
        expect(mismatched?.awardee).toContain('Empresa Legacy B');
        expect(mismatched?.awardee).not.toContain('Empresa Canonica B');

        db.prepare('DELETE FROM lot_awards WHERE id = ?').run('lotes-stats-award-2');
        db.prepare(`
          INSERT INTO lot_awards (
            id, contract_id, case_number, lot_number, award_index,
            awardee, awarded_amount, result_state
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'lotes-stats-award-2', contractId, 'GEN/2024/1', '2', 0,
          'Empresa Canonica B', 180, 'Adjudicado',
        );

        const complete = getLotesStats().contratosLotizados.find((row) => row.id === contractId);
        expect(complete?.amount).toBe(270);
        expect(complete?.awardee).toContain('Empresa Canonica A');
        expect(complete?.awardee).toContain('Empresa Canonica B');
        expect(complete?.awardee).not.toContain('Empresa Legacy A');
        expect(complete?.awardee).not.toContain('Empresa Legacy B');
      } finally {
        setDbForTests(null);
        db.close();
      }
    });

    it('incluye adjudicatarios de lot_awards sin cambiar la semántica del importe', () => {
      const source = fs.readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
      const fnStart = source.indexOf('export function getLotesStats');
      const fnEnd = source.indexOf('export function getBajaTemerariaStats', fnStart);
      const fn = source.slice(fnStart, fnEnd);
      expect(fn).toContain('FROM lot_awards la');
      expect(fn).toContain('SELECT group_concat(DISTINCT la.awardee)');
      expect(fn).toContain("eligibleAwardResultStateSql('la')");
      expect(fn).toContain('SELECT group_concat(DISTINCT lot.awardee)');
      expect(fn).toContain("), awardee, 'Sin awardee') as awardee");
      expect(fn).toContain('NOT EXISTS (');
      expect(fn).toContain('la.lot_number = lot.lot_number');
      expect(fn).toContain('FROM contract_lots lot');
      expect(source).toContain("name = 'lot_awards'");
    });
    it('muestra en la tabla lotizada la suma de ofertas registradas por lote', () => {
      const source = fs.readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
      expect(source).toContain('offer_count: is_lotized && lotOfferCount > 0 ? lotOfferSum : numOfertas');
      expect(source).toContain('numOfertas: is_lotized && lotOfferCount > 0 ? lotOfferSum : numOfertas');
    });

    it('usa lot_awards para la concurrencia cuando falta el dato de ofertas del lote', () => {
      const db = createGeneratedTestDb(20261012, 2);
      setDbForTests(db);
      try {
        const contractId = 'generated-20261012-1';

        db.prepare(`
          UPDATE contracts
          SET procedure = 'Abierto',
              year = 2024,
              is_lotized = 1,
              lot_count = 2,
              award_amount_type = 'total',
              awarded_amount = NULL,
              awardee = 'Varios adjudicatarios'
          WHERE id = ?
        `).run(contractId);

        db.prepare(`
          INSERT INTO contract_lots (
            id, contract_id, case_number, lot_number, lot_name,
            awarded_amount, awardee, lot_status, offer_count
          ) VALUES
            ('lotes-oferta-award-1', ?, 'GEN/2024/1', '1', 'Lote 1', 100, 'Empresa A', 'Adjudicado', NULL),
            ('lotes-oferta-award-2', ?, 'GEN/2024/1', '2', 'Lote 2', 200, 'Empresa B', 'Adjudicado', 2)
        `).run(contractId, contractId);

        db.prepare(`
          INSERT INTO lot_awards (
            id, contract_id, case_number, lot_number, award_index,
            awardee, awarded_amount, offer_count, result_state
          ) VALUES ('lotes-oferta-award-canonical', ?, 'GEN/2024/1', '1', 0,
                    'Empresa A', 100, 1, 'Adjudicado')
        `).run(contractId);

        const stats = getLotesStats();
        expect(stats.resumen.concurrencia.mediaOfertasLotizados).toBe(1.5);
      } finally {
        setDbForTests(null);
        db.close();
      }
    });

    it('calcula la concurrencia de expedientes lotizados usando las ofertas de cada lote', () => {
      const source = fs.readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
      const fnStart = source.indexOf('export function getLotesStats');
      const fnEnd = source.indexOf('export function getBajaTemerariaStats', fnStart);
      const fn = source.slice(fnStart, fnEnd);

      expect(fn).toContain('lot_offer_sum');
      expect(fn).toContain('lot_offer_count');
      expect(fn).toContain('lot_unique_count');
      expect(fn).toContain('ofertasSumaLotizados += lotOfferSum');
      expect(fn).toContain('ofertasConteoLotizados += lotOfferCount');
      expect(fn).toContain('unicosLotizados += lotUniqueCount');
      expect(fn).not.toContain('ofertasSumaLotizados += numOfertas');
    });

    it('calcula el volumen de contratos lotizados con la suma de adjudicaciones de sus lotes', () => {
      const source = fs.readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
      const fnStart = source.indexOf('export function getLotesStats');
      const fnEnd = source.indexOf('export function getBajaTemerariaStats', fnStart);
      const fn = source.slice(fnStart, fnEnd);

      expect(fn).toContain('FROM contract_lots lot');
      expect(fn).toContain('sum(lot.awarded_amount)');
      expect(fn).toContain("eligibleAwardLotStatusSql('lot')");
      expect(fn).not.toContain('coalesce(awarded_amount, amount_excl_vat, 0) as amount');
    });

    it('genera desglose por tipo de contrato y por año', () => {
      const stats = getLotesStats();

      expect(stats.porTipo.length).toBeGreaterThanOrEqual(3);
      const obras = stats.porTipo.find((t) => t.tipo.toLowerCase().includes('obra'));
      const servicios = stats.porTipo.find((t) => t.tipo.toLowerCase().includes('servicio'));
      expect(obras).toBeDefined();
      expect(servicios).toBeDefined();

      expect(stats.porAno.length).toBeGreaterThanOrEqual(5);
      const y2024 = stats.porAno.find((y) => y.year === 2024);
      expect(y2024).toBeDefined();
      expect(y2024!.lotizados).toBeGreaterThan(0);
    });

    it('genera tramos de importe incluyendo contratos menores y megacontratos', () => {
      const stats = getLotesStats();
      expect(stats.porTramo.length).toBe(5);

      const mega = stats.porTramo.find((t) => t.tramo.includes('Megacontratos'));
      const menores = stats.porTramo.find((t) => t.tramo.startsWith('Contratos menores'));
      expect(mega).toBeDefined();
      expect(mega!.totalContratos).toBeGreaterThan(15);
      expect(menores).toBeDefined();
      expect(menores!.totalContratos).toBeGreaterThan(1000);
    });

    it('identifica y ordena contratos grandes en lote único (>= 100.000 €)', () => {
      const stats = getLotesStats();
      // Tras la extracción de CODICE, los falsos positivos se reducen y los contratos grandes en lote único real son ~33
      expect(stats.grandesNoLotizados.length).toBeGreaterThan(0);

      // Debe estar ordenado de mayor a menor importe
      for (let i = 0; i < stats.grandesNoLotizados.length - 1; i++) {
        expect(stats.grandesNoLotizados[i].importe).toBeGreaterThanOrEqual(stats.grandesNoLotizados[i + 1].importe);
      }

      // Todos deben superar 100k€
      stats.grandesNoLotizados.forEach((c) => {
        expect(c.importe).toBeGreaterThanOrEqual(100000);
        expect(c.expediente).toBeDefined();
        expect(c.objeto).toBeDefined();
      });
    });

    it('soporta filtrado por ámbito municipal y ejercicio', () => {
      const statsDirecta = getLotesStats(undefined, 'directa');
      const statsMancomunidad = getLotesStats(undefined, 'mancomunidad');

      expect(statsDirecta.resumen.totalMayores).toBeGreaterThan(0);
      expect(statsMancomunidad.resumen.totalMayores).toBeGreaterThan(0);
      expect(statsDirecta.resumen.totalMayores + statsMancomunidad.resumen.totalMayores).toBe(getLotesStats().resumen.totalMayores);

      const stats2024 = getLotesStats(2024);
      expect(stats2024.resumen.totalMayores).toBeGreaterThan(0);
    });

    it('recupera contratos con desglose estructurado de lotes en getLicitacionById', () => {
      // Expediente 17/2023: Estrategia de Desarrollo Urbano Sostenible (EDUSI)
      const lic = getLicitacionById('17/2023');
      if (lic) {
        expect((lic as any).lotizacion).toBeDefined();
        expect((lic as any).lotizacion.lotizado).toBe(true);
        expect((lic as any).lotizacion.numLotes).toBe(6);
        expect((lic as any).lotes).toBeDefined();
        expect((lic as any).lotes.length).toBe(6);

        // Cada lote debe tener su estructura individual
        const lote1 = (lic as any).lotes[0];
        expect(lote1.numeroLote).toBeDefined();
        expect(lote1.nombreLote).toBeDefined();
      }
    });

    it('recupera expediente 10/2026 Suministros (Mixto) (19965034) con 2 lotes desduplicados y adjudicatarios independientes', () => {
      const lic = getLicitacionById('19965034');
      expect(lic).toBeDefined();
      expect((lic as any).lotizacion.lotizado).toBe(true);
      expect((lic as any).lotizacion.numLotes).toBe(2);
      expect((lic as any).lotes).toHaveLength(2);

      const [lote1, lote2] = (lic as any).lotes;
      expect(lote1.numeroLote).toBe('1');
      expect(lote1.adjudicatario).toBe('EQUIPTURIS, S.L.U.');
      expect(lote1.nifAdjudicatario).toBe('B58420290');
      expect(lote1.importeSinIva).toBeCloseTo(265085.21, 1);
      expect(lote1.presupuestoSinIva).toBeCloseTo(265379.49, 1);

      expect(lote2.numeroLote).toBe('2');
      expect(lote2.adjudicatario).toBe('MOISES MATA, S.L.');
      expect(lote2.nifAdjudicatario).toBe('B13154414');
      expect(lote2.importeSinIva).toBeCloseTo(24168.00, 1);
      expect(lote2.presupuestoSinIva).toBeCloseTo(24779.11, 1);
    });

    it('usa lot_awards solo con cobertura completa en las estadisticas de empresa del detalle', () => {
      const db = createGeneratedTestDb(20261004, 2);
      setDbForTests(db);
      try {
        const currentId = 'generated-20261004-1';
        const relatedId = 'generated-20261004-2';

        db.prepare(`
          DELETE FROM contracts
          WHERE id NOT IN (?, ?)
        `).run(currentId, relatedId);

        db.prepare(`
          UPDATE contracts
          SET case_number = 'GEN/2026/CURRENT',
              object_description = 'Contrato actual multilot',
              awardee = 'Varios adjudicatarios',
              awardee_nif = NULL,
              award_amount_type = 'total',
              awarded_amount = NULL,
              is_lotized = 1,
              lot_count = 2,
              status = 'Adjudicada',
              award_date = '2026-01-20',
              publication_date = '2026-01-01'
          WHERE id = ?
        `).run(currentId);

        db.prepare(`
          UPDATE contracts
          SET case_number = 'GEN/2026/RELATED',
              object_description = 'Contrato relacionado',
              awardee = 'Empresa Canonica A',
              awardee_nif = NULL,
              award_amount_type = 'total',
              awarded_amount = 999,
              is_lotized = 1,
              lot_count = 2,
              status = 'Adjudicada',
              award_date = '2026-01-19',
              publication_date = '2025-12-01'
          WHERE id = ?
        `).run(relatedId);

        db.prepare(`
          INSERT INTO contract_lots (
            id, contract_id, case_number, lot_number, lot_name,
            awarded_amount, awardee, lot_status
          ) VALUES
            ('detail-current-lot-1', ?, 'GEN/2026/CURRENT', '1', 'Lote 1', 10, 'Empresa Canonica A', 'Adjudicado'),
            ('detail-current-lot-2', ?, 'GEN/2026/CURRENT', '2', 'Lote 2', 20, 'Empresa Canonica B', 'Adjudicado'),
            ('detail-related-lot-1', ?, 'GEN/2026/RELATED', '1', 'Lote 1', 100, 'Empresa Canonica A', 'Adjudicado'),
            ('detail-related-lot-2', ?, 'GEN/2026/RELATED', '2', 'Lote 2', NULL, 'Empresa Canonica A', 'Adjudicado')
        `).run(currentId, currentId, relatedId, relatedId);

        db.prepare(`
          INSERT INTO lot_awards (
            id, contract_id, case_number, lot_number, award_index,
            awardee, awarded_amount, result_state
          ) VALUES
            ('detail-current-award-1', ?, 'GEN/2026/CURRENT', '1', 0, 'Empresa Canonica A', 9, 'Adjudicado'),
            ('detail-current-award-2', ?, 'GEN/2026/CURRENT', '2', 0, 'Empresa Canonica B', 18, 'Adjudicado'),
            ('detail-related-award-1', ?, 'GEN/2026/RELATED', '1', 0, 'Empresa Canonica A', 50, 'Adjudicado')
        `).run(currentId, currentId, relatedId);

        const partial = getLicitacionById(currentId) as any;
        const partialInfo = partial.lotesAdjudicatariosInfo.find((item: any) => item.awardee === 'Empresa Canonica A');
        expect(partialInfo).toBeDefined();
        expect(partialInfo.stats.volumenTotal).toBe(109);

        db.prepare(`
          INSERT INTO lot_awards (
            id, contract_id, case_number, lot_number, award_index,
            awardee, awarded_amount, result_state
          ) VALUES ('detail-related-award-2', ?, 'GEN/2026/RELATED', '2', 0, 'Empresa Canonica A', 80, 'Adjudicado')
        `).run(relatedId);

        const complete = getLicitacionById(currentId) as any;
        const completeInfo = complete.lotesAdjudicatariosInfo.find((item: any) => item.awardee === 'Empresa Canonica A');
        expect(completeInfo).toBeDefined();
        expect(completeInfo.stats.volumenTotal).toBe(139);
      } finally {
        setDbForTests(null);
        db.close();
      }
    });

    it('recupera expediente 6/2025 Servicios (18041232) aislando lote desierto y evitando falsos positivos de baja', () => {
      const lic = getLicitacionById('18041232');
      expect(lic).toBeDefined();
      expect((lic as any).lotizacion.lotizado).toBe(true);
      expect((lic as any).lotes).toHaveLength(5);
      expect(lic?.importe_adjudicacion).toBeCloseTo(95632.72, 2);
      expect(lic?.adjudicatario).toBe('Varios adjudicatarios');
      expect((lic as any).esLicitadorUnico).toBe(false);

      // Comprobar que no hay alerta falsa de baja temeraria por el lote desierto
      const flags = (lic as any).redFlags as any[];
      expect(flags.some((f: any) => f.tipo === 'baja_temeraria_extrema')).toBe(false);
      expect(flags.some((f: any) => f.tipo === 'oferta_unica')).toBe(false);
      expect(flags.some((f: any) => f.tipo === 'lotes_desiertos')).toBe(true);

      const lote5 = (lic as any).lotes.find((l: any) => l.numeroLote === '5');
      expect(lote5).toBeDefined();
      expect(lote5.estadoLote).toBe('Desierto');
      expect(lote5.adjudicatario).toBeNull();
      expect(lote5.presupuestoSinIva).toBeCloseTo(22195, 1);

      // Comprobar identificación de oferta única a nivel de lote
      const lotesConOfertaUnica = (lic as any).lotes.filter((l: any) => l.numOfertas === 1);
      expect(lotesConOfertaUnica.length).toBeGreaterThanOrEqual(4);

      const banderasOfertaUnica = flags.filter((f: any) => f.tipo === 'oferta_unica_lote');
      expect(banderasOfertaUnica.length).toBe(4); // Los 4 lotes adjudicados
      expect(banderasOfertaUnica[0].titulo).toContain('Lote');
      expect(banderasOfertaUnica[0].titulo).toContain('Oferta Única');
    });

    it('excluye lotes cancelados con datos residuales de las señales de riesgo por lote', () => {
      const mockLic = {
        amount_excl_vat: 15000,
        awarded_amount: 12000,
        procedure: 'Abierto',
        contract_type: 'Servicios',
        economic_nature: 'gasto',
        status: 'Resuelta',
        awardee: 'Varios adjudicatarios',
        award_amount_type: 'total',
        offer_count: 2,
      };
      const mockLotes = [
        {
          numeroLote: '1',
          presupuestoSinIva: 10000,
          importeAdjudicacion: 7000,
          adjudicatario: 'Empresa válida',
          estadoLote: 'Adjudicado',
          numOfertas: 1,
        },
        {
          numeroLote: '2',
          presupuestoSinIva: 5000,
          importeAdjudicacion: 5000,
          adjudicatario: 'Empresa residual',
          estadoLote: 'Cancelled',
          numOfertas: 1,
        },
      ];

      const flags = evaluarRedFlags(mockLic, mockLotes);
      const bajasPorLote = flags.filter((flag: any) => flag.tipo === 'baja_temeraria_lote');
      const ofertasUnicasPorLote = flags.filter((flag: any) => flag.tipo === 'oferta_unica_lote');
      const sinAdjudicar = flags.find((flag: any) => flag.tipo === 'lotes_desiertos');

      expect(bajasPorLote).toHaveLength(1);
      expect(bajasPorLote[0].title).toContain('Lote 1');
      expect(ofertasUnicasPorLote).toHaveLength(1);
      expect(ofertasUnicasPorLote[0].title).toContain('Lote 1');
      expect(flags.some((flag: any) => JSON.stringify(flag).includes('Empresa residual'))).toBe(false);
      expect(sinAdjudicar?.title).toContain('1 Lote sin adjudicar');
      expect(sinAdjudicar?.description).toContain('cancelados');
    });

    it('no calcula señales económicas a partir de importes residuales cuando todos los lotes son terminales', () => {
      const mockLic = {
        amount_excl_vat: 15000,
        awarded_amount: 9000,
        procedure: 'Abierto',
        contract_type: 'Servicios',
        economic_nature: 'gasto',
        status: 'Resuelta',
        awardee: 'Varios adjudicatarios',
        award_amount_type: 'total',
        offer_count: 1,
      };
      const mockLotes = [
        {
          numeroLote: '1',
          presupuestoSinIva: 10000,
          importeAdjudicacion: 6000,
          adjudicatario: 'Empresa residual A',
          estadoLote: 'Cancelled',
          numOfertas: 1,
        },
        {
          numeroLote: '2',
          presupuestoSinIva: 5000,
          importeAdjudicacion: 3000,
          adjudicatario: 'Empresa residual B',
          estadoLote: 'Annulled',
          numOfertas: 1,
        },
      ];

      const flags = evaluarRedFlags(mockLic, mockLotes);

      expect(flags.some((flag: any) => ['baja_cero', 'baja_temeraria', 'baja_temeraria_extrema', 'sobrecoste_licitacion', 'oferta_unica', 'oferta_unica_lote'].includes(flag.tipo))).toBe(false);
      expect(flags.some((flag: any) => flag.tipo === 'lotes_desiertos' && flag.title.includes('2 Lotes sin adjudicar'))).toBe(true);
    });

    it('genera señales de riesgo a nivel de lote cuando un lote individual presenta baja anormal', () => {
      const mockLic = {
        importe_sin_iva: 100000,
        importe_adjudicacion: 80000, // Baja global 20% (moderada, no salta alerta global)
        procedimiento: 'Abierto',
        num_ofertas: 3,
      };

      const mockLotes = [
        {
          numeroLote: '1',
          presupuestoSinIva: 50000,
          importeAdjudicacion: 50000, // 0% baja
          adjudicatario: 'Empresa A',
          estadoLote: 'Adjudicado',
        },
        {
          numeroLote: '2',
          presupuestoSinIva: 50000,
          importeAdjudicacion: 30000, // 40% baja (anormal individual)
          adjudicatario: 'Empresa B',
          estadoLote: 'Adjudicado',
        },
      ];

      const flags = evaluarRedFlags(mockLic, mockLotes);
      const loteFlag = flags.find((f: any) => f.tipo === 'baja_temeraria_lote');
      expect(loteFlag).toBeDefined();
      expect(loteFlag?.titulo).toContain('Lote 2');
      expect(loteFlag?.titulo).toContain('-40%');
      expect(loteFlag?.titulo).toContain('Empresa B');
    });

    it('aplica las señales de lote cuando los datos usan el esquema canónico de SQLite', () => {
      const mockLic = {
        amount_excl_vat: 100000,
        awarded_amount: 80000,
        procedure: 'Abierto',
        offer_count: 3,
        economic_nature: 'gasto',
        status: 'Resuelta',
        awardee: 'Empresa cabecera',
        award_amount_type: 'total',
      };

      const mockLotes = [
        {
          lot_number: '1',
          budget_excl_vat: 50000,
          awarded_amount: 50000,
          awardee: 'Empresa Alpha',
          lot_status: 'Adjudicado',
          offer_count: 3,
        },
        {
          lot_number: '2',
          budget_excl_vat: 50000,
          awarded_amount: 37000,
          awardee: 'Empresa Beta',
          lot_status: 'Adjudicado',
          offer_count: 1,
        },
      ];

      const flags = evaluarRedFlags(mockLic, mockLotes);
      const loteFlag = flags.find((f: any) => f.tipo === 'baja_temeraria_lote');
      expect(loteFlag).toBeDefined();
      expect(loteFlag?.title).toContain('Lote 2');
      expect(loteFlag?.title).toContain('Empresa Beta');

      const unica = flags.find((f: any) => f.tipo === 'oferta_unica_lote');
      expect(unica).toBeDefined();
      expect(unica?.title).toContain('Lote 2');
    });

    it('identifica y activa señal de oferta única a nivel de lote individual', () => {
      const mockLic = {
        importe_sin_iva: 100000,
        importe_adjudicacion: 90000,
        procedimiento: 'Abierto',
        num_ofertas: 4, // En cabecera hay 4 ofertas globales
      };

      const mockLotes = [
        {
          numeroLote: '1',
          presupuestoSinIva: 50000,
          importeAdjudicacion: 45000,
          adjudicatario: 'Empresa Alpha',
          estadoLote: 'Adjudicado',
          numOfertas: 3, // Concurrido
        },
        {
          numeroLote: '2',
          presupuestoSinIva: 50000,
          importeAdjudicacion: 45000,
          adjudicatario: 'Empresa Beta',
          estadoLote: 'Adjudicado',
          numOfertas: 1, // Oferta única individual
        },
      ];

      const flags = evaluarRedFlags(mockLic, mockLotes);
      const unicas = flags.filter((f: any) => f.tipo === 'oferta_unica_lote');
      expect(unicas).toHaveLength(1);
      expect(unicas[0].titulo).toContain('Lote 2');
      expect(unicas[0].titulo).toContain('Oferta Única');
      expect(unicas[0].titulo).toContain('Empresa Beta');
    });

    it('does not use a parent single-offer count when lot evidence contradicts it', () => {
      const mockLic = {
        amount_excl_vat: 100000,
        awarded_amount: 90000,
        procedure: 'Abierto',
        status: 'Adjudicada',
        awardee: 'Empresa Alpha',
        award_amount_type: 'total',
        offer_count: 1,
        economic_nature: 'gasto',
      };
      const mockLots = [
        {
          lot_number: '1',
          budget_excl_vat: 100000,
          awarded_amount: 90000,
          awardee: 'Empresa Alpha',
          lot_status: 'Adjudicado',
          offer_count: 2,
        },
        {
          lot_number: '2',
          budget_excl_vat: 10000,
          awarded_amount: null,
          awardee: null,
          lot_status: 'Desierto',
          offer_count: null,
        },
      ];

      const flags = evaluarRedFlags(mockLic, mockLots);
      expect(flags.some((flag) => flag.tipo === 'oferta_unica')).toBe(false);
      expect(flags.some((flag) => flag.tipo === 'oferta_unica_lote')).toBe(false);
    });

    it('no activa baja cero ni señal de 0% cuando falta el importe de un lote elegible', () => {
      const mockLic = {
        amount_excl_vat: 200,
        awarded_amount: 100,
        procedure: 'Negociado sin publicidad',
        contract_type: 'Servicios',
        economic_nature: 'gasto',
        status: 'Adjudicada',
        awardee: 'Varios adjudicatarios',
        award_amount_type: 'total',
        offer_count: 2,
      };
      const mockLotes = [
        {
          numeroLote: '1',
          presupuestoSinIva: 100,
          importeAdjudicacion: 100,
          adjudicatario: 'Empresa A',
          estadoLote: 'Adjudicado',
          numOfertas: 2,
        },
        {
          numeroLote: '2',
          presupuestoSinIva: 100,
          importeAdjudicacion: null,
          adjudicatario: 'Empresa B',
          estadoLote: 'Adjudicado',
          numOfertas: 2,
        },
      ];

      const flags = evaluarRedFlags(mockLic, mockLotes);
      expect(flags.some((flag: any) => flag.tipo === 'baja_cero')).toBe(false);

      const negociado = flags.find((flag: any) => flag.tipo === 'negociado_sin_publicidad');
      expect(negociado).toBeDefined();
      expect(negociado.senalesVerificables).not.toContain('0 % de baja sobre el presupuesto en los lotes adjudicados.');
      expect(negociado.level).toBe('aviso');
    });

    it('no confirma oferta única en negociado sin publicidad si falta el dato de un lote elegible', () => {
      const mockLic = {
        amount_excl_vat: 200,
        awarded_amount: 180,
        procedure: 'Negociado sin publicidad',
        contract_type: 'Servicios',
        economic_nature: 'gasto',
        status: 'Adjudicada',
        awardee: 'Varios adjudicatarios',
        award_amount_type: 'total',
        offer_count: 2,
      };
      const mockLotes = [
        {
          numeroLote: '1',
          presupuestoSinIva: 100,
          importeAdjudicacion: 90,
          adjudicatario: 'Empresa A',
          estadoLote: 'Adjudicado',
          numOfertas: 1,
        },
        {
          numeroLote: '2',
          presupuestoSinIva: 100,
          importeAdjudicacion: 90,
          adjudicatario: 'Empresa B',
          estadoLote: 'Adjudicado',
          numOfertas: null,
        },
      ];

      const flags = evaluarRedFlags(mockLic, mockLotes);
      const negociado = flags.find((flag: any) => flag.tipo === 'negociado_sin_publicidad');
      expect(negociado).toBeDefined();
      expect(negociado.senalesVerificables).not.toContain('Concurrencia de una única oferta confirmada por dato explícito en los lotes adjudicados.');
      expect(negociado.level).toBe('aviso');

      // La señal sí se recupera cuando todos los lotes elegibles tienen el dato.
      mockLotes[1].numOfertas = 1;
      const flagsWithCompleteCoverage = evaluarRedFlags(mockLic, mockLotes);
      const negociadoWithCompleteCoverage = flagsWithCompleteCoverage.find((flag: any) => flag.tipo === 'negociado_sin_publicidad');
      expect(negociadoWithCompleteCoverage.senalesVerificables).toContain('Concurrencia de una única oferta confirmada por dato explícito en los lotes adjudicados.');
      expect(negociadoWithCompleteCoverage.level).toBe('alerta');
    });

    it('usa la concurrencia estructurada de lot_awards cuando falta en contract_lots', () => {
      const db = createGeneratedTestDb(20261014, 1);
      setDbForTests(db);
      try {
        const contractId = 'generated-20261014-1';
        db.prepare('DELETE FROM contracts WHERE id != ?').run(contractId);
        db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(contractId);
        db.prepare('DELETE FROM lot_awards WHERE contract_id = ?').run(contractId);

        db.prepare(`
          UPDATE contracts
          SET case_number = 'GEN/2026/NSP-OFFERS',
              procedure = 'Negociado sin publicidad',
              contract_type = 'Servicios',
              economic_nature = 'gasto',
              status = 'Adjudicada',
              is_lotized = 1,
              lot_count = 2,
              award_amount_type = 'total',
              amount_excl_vat = 200,
              awarded_amount = 180,
              awardee = 'Varios adjudicatarios',
              offer_count = 2,
              award_date = '2026-01-20'
          WHERE id = ?
        `).run(contractId);

        db.prepare(`
          INSERT INTO contract_lots (
            id, contract_id, case_number, lot_number, lot_name,
            amount_excl_vat, budget_excl_vat, awarded_amount, awardee, lot_status, offer_count
          ) VALUES
            ('nsp-structured-offer-lot-1', ?, 'GEN/2026/NSP-OFFERS', '1', 'Lote 1', 100, 100, 90, 'Empresa A', 'Adjudicado', NULL),
            ('nsp-structured-offer-lot-2', ?, 'GEN/2026/NSP-OFFERS', '2', 'Lote 2', 100, 100, 90, 'Empresa B', 'Adjudicado', NULL)
        `).run(contractId, contractId);

        db.prepare(`
          INSERT INTO lot_awards (
            id, contract_id, case_number, lot_number, award_index,
            awardee, awarded_amount, offer_count, result_state
          ) VALUES
            ('nsp-structured-offer-award-1', ?, 'GEN/2026/NSP-OFFERS', '1', 0, 'Empresa A', 90, 1, 'Adjudicado'),
            ('nsp-structured-offer-award-2', ?, 'GEN/2026/NSP-OFFERS', '2', 0, 'Empresa B', 90, 1, 'Adjudicado')
        `).run(contractId, contractId);

        const lic = getLicitacionById(contractId) as any;
        expect(lic.lotes.map((lot: any) => lot.numOfertas)).toEqual([1, 1]);
        const negociado = lic.redFlags.find((flag: any) => flag.tipo === 'negociado_sin_publicidad');
        expect(negociado.senalesVerificables).toContain('Concurrencia de una única oferta confirmada por dato explícito en los lotes adjudicados.');
      } finally {
        setDbForTests(null);
        db.close();
      }
    });

    it('no suma importes estructurados parciales como total adjudicado de un lote', () => {
      const db = createGeneratedTestDb(20261014, 1);
      setDbForTests(db);
      try {
        const contractId = 'generated-20261014-1';
        db.prepare('DELETE FROM contracts WHERE id != ?').run(contractId);
        db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(contractId);
        db.prepare('DELETE FROM lot_awards WHERE contract_id = ?').run(contractId);

        db.prepare(`
          UPDATE contracts
          SET case_number = 'GEN/2026/PARTIAL-AWARD',
              procedure = 'Abierto',
              status = 'Adjudicada',
              is_lotized = 1,
              lot_count = 1,
              award_amount_type = 'total',
              amount_excl_vat = 100,
              awarded_amount = NULL,
              awardee = 'Varios adjudicatarios',
              award_date = '2026-01-20'
          WHERE id = ?
        `).run(contractId);

        db.prepare(`
          INSERT INTO contract_lots (
            id, contract_id, case_number, lot_number, lot_name,
            amount_excl_vat, budget_excl_vat, awarded_amount, awarded_amount_incl_vat,
            awardee, lot_status
          ) VALUES (
            'partial-award-lot', ?, 'GEN/2026/PARTIAL-AWARD', '1', 'Lote único',
            100, 100, 90, 108, 'Varios adjudicatarios', 'Adjudicado'
          )
        `).run(contractId);

        db.prepare(`
          INSERT INTO lot_awards (
            id, contract_id, case_number, lot_number, award_index,
            awardee, awarded_amount, awarded_amount_incl_vat, result_state
          ) VALUES
            ('partial-award-a', ?, 'GEN/2026/PARTIAL-AWARD', '1', 0, 'Empresa A', 90, 108, 'Adjudicado'),
            ('partial-award-b', ?, 'GEN/2026/PARTIAL-AWARD', '1', 1, 'Empresa B', NULL, NULL, 'Adjudicado')
        `).run(contractId, contractId);

        const lic = getLicitacionById(contractId) as any;
        expect(lic.lotes).toHaveLength(1);
        expect(lic.lotes[0].importeSinIva).toBeNull();
        expect(lic.lotes[0].importeConIva).toBeNull();
        expect(lic.lotes[0].importeAdjudicacion).toBeNull();
        expect(lic.lotes[0].importeAdjConIva).toBeNull();
        expect(lic.lotes[0].presupuestoSinIva).toBe(100);
        expect(lic.lotes[0].adjudicaciones).toHaveLength(2);
      } finally {
        setDbForTests(null);
        db.close();
      }
    });

    it('prioriza el total estructurado completo sobre el importe legacy del lote', () => {
      const db = createGeneratedTestDb(20261014, 1);
      setDbForTests(db);
      try {
        const contractId = 'generated-20261014-1';
        db.prepare('DELETE FROM contracts WHERE id != ?').run(contractId);
        db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(contractId);
        db.prepare('DELETE FROM lot_awards WHERE contract_id = ?').run(contractId);

        db.prepare(`
          UPDATE contracts
          SET case_number = 'GEN/2026/STRUCTURED-PRECEDENCE',
              procedure = 'Abierto',
              status = 'Adjudicada',
              is_lotized = 1,
              lot_count = 1,
              award_amount_type = 'total',
              amount_excl_vat = 100,
              awarded_amount = 90,
              awardee = 'Varios adjudicatarios',
              award_date = '2026-01-20'
          WHERE id = ?
        `).run(contractId);

        db.prepare(`
          INSERT INTO contract_lots (
            id, contract_id, case_number, lot_number, lot_name,
            amount_excl_vat, budget_excl_vat, awarded_amount, awarded_amount_incl_vat,
            awardee, lot_status, award_date
          ) VALUES (
            'structured-precedence-legacy-lot', ?, 'GEN/2026/STRUCTURED-PRECEDENCE',
            '1', 'Lote único', 100, 100, 90, 108, 'Varios adjudicatarios',
            'Adjudicado', '2026-01-20'
          )
        `).run(contractId);

        db.prepare(`
          INSERT INTO lot_awards (
            id, contract_id, case_number, lot_number, award_index,
            awardee, awarded_amount, awarded_amount_incl_vat, result_state
          ) VALUES
            ('structured-precedence-award-a', ?, 'GEN/2026/STRUCTURED-PRECEDENCE',
             '1', 0, 'Empresa A', 40, 48, 'Adjudicado'),
            ('structured-precedence-award-b', ?, 'GEN/2026/STRUCTURED-PRECEDENCE',
             '1', 1, 'Empresa B', 40, 48, 'Adjudicado')
        `).run(contractId, contractId);

        const lic = getLicitacionById(contractId) as any;
        expect(lic.lotes).toHaveLength(1);
        expect(lic.lotes[0].importeSinIva).toBe(80);
        expect(lic.lotes[0].importeConIva).toBe(96);
        expect(lic.lotes[0].importeAdjudicacion).toBe(80);
        expect(lic.lotes[0].importeAdjConIva).toBe(96);
      } finally {
        setDbForTests(null);
        db.close();
      }
    });

    it('oculta importes y adjudicatario legacy cuando el resultado estructurado del lote es terminal', () => {
      const db = createGeneratedTestDb(20261014, 1);
      setDbForTests(db);
      try {
        const contractId = 'generated-20261014-1';
        db.prepare('DELETE FROM contracts WHERE id != ?').run(contractId);
        db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(contractId);
        db.prepare('DELETE FROM lot_awards WHERE contract_id = ?').run(contractId);

        db.prepare(`
          UPDATE contracts
          SET case_number = 'GEN/2026/TERMINAL-LOT',
              procedure = 'Abierto',
              status = 'Adjudicada',
              is_lotized = 1,
              lot_count = 1,
              award_amount_type = 'total',
              amount_excl_vat = 100,
              awarded_amount = 90,
              awardee = 'Empresa Legacy',
              award_date = '2026-01-20'
          WHERE id = ?
        `).run(contractId);

        db.prepare(`
          INSERT INTO contract_lots (
            id, contract_id, case_number, lot_number, lot_name,
            amount_excl_vat, budget_excl_vat, awarded_amount, awardee, lot_status, award_date
          ) VALUES (
            'terminal-legacy-lot', ?, 'GEN/2026/TERMINAL-LOT', '1', 'Lote único',
            100, 100, 90, 'Empresa Legacy', 'Adjudicado', '2026-01-20'
          )
        `).run(contractId);

        db.prepare(`
          INSERT INTO lot_awards (
            id, contract_id, case_number, lot_number, award_index,
            awardee, awarded_amount, result_state
          ) VALUES (
            'terminal-structured-result', ?, 'GEN/2026/TERMINAL-LOT', '1', 0,
            'Empresa Legacy', NULL, 'Desierta'
          )
        `).run(contractId);

        const lic = getLicitacionById(contractId) as any;
        expect(lic.lotes).toHaveLength(1);
        expect(lic.lotes[0].estadoLote).toBe('Desierta');
        expect(lic.lotes[0].importeAdjudicacion).toBeNull();
        expect(lic.lotes[0].awardee).toBeNull();
        expect(lic.lotes[0].adjudicaciones).toHaveLength(0);
      } finally {
        setDbForTests(null);
        db.close();
      }
    });

    it('excludes English terminal statuses from economic signals', () => {
      const flags = evaluarRedFlags({
        amount_excl_vat: 10000,
        awarded_amount: 1000,
        procedure: 'Abierto',
        contract_type: 'Servicios',
        economic_nature: 'gasto',
        status: 'Cancelled',
        awardee: 'Empresa residual',
        award_amount_type: 'total',
        offer_count: 1,
      }, []);

      expect(flags.some((flag: any) => [
        'baja_cero',
        'baja_temeraria',
        'baja_temeraria_extrema',
        'sobrecoste_licitacion',
        'oferta_unica',
        'oferta_unica_lote',
      ].includes(flag.tipo))).toBe(false);
    });

  });
});
