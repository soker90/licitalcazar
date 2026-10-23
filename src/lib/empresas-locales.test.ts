import { afterEach, describe, it, expect } from 'vitest';
import { getEmpresasLocalesStats, clasificarEmpresaGeografia } from './empresas-locales';
import { createGeneratedTestDb } from './test-db';
import { setDbForTests } from './db';

describe('Análisis de Empresas Locales vs. Externas (Issues #9 y #16)', () => {
  afterEach(() => {
    setDbForTests(null);
  });
  describe('clasificarEmpresaGeografia', () => {
    it('clasifica como local empresas con sede oficial o nombre en Alcázar de San Juan', () => {
      // Aguas de Alcázar
      const aguas = clasificarEmpresaGeografia('A13157029', 'Aguas de Alcázar, Empresa Municipal, S.A.U.');
      expect(aguas.ambito).toBe('local');
      expect(aguas.sede).toContain('Alcázar');

      // La Bola de Cristal
      const bola = clasificarEmpresaGeografia('B13408349', 'LA BOLA DE CRISTAL-COMARCA ALCAZAR DE SAN JUAN, S.L.');
      expect(bola.ambito).toBe('local');

      // Intedhor
      const intedhor = clasificarEmpresaGeografia('B13016415', 'INGENIERÍA TÉCNICA DEL HORMIGÓN, S.L.');
      expect(intedhor.ambito).toBe('local');
    });

    it('clasifica como local a autónomos y personas físicas locales con DNI', () => {
      const autonomo = clasificarEmpresaGeografia('06239360N', 'Carmen Dolores Alberca Lucerón');
      expect(autonomo.ambito).toBe('local');
      expect(autonomo.sede).toContain('Alcázar');
    });

    it('clasifica como provincial sociedades con CIF de Ciudad Real (código 13) no radicadas en Alcázar', () => {
      const provincial = clasificarEmpresaGeografia('B13582135', 'CLF DERECHO PUBLICO S.L.P.');
      expect(provincial.ambito).toBe('provincial');
      expect(provincial.sede).toContain('Ciudad Real');
    });

    it('clasifica como regional sociedades de otras provincias de Castilla-La Mancha (02, 16, 19, 45)', () => {
      const albacete = clasificarEmpresaGeografia('B02307171', 'GRUPO AMIAB S.L.');
      expect(albacete.ambito).toBe('regional');
      expect(albacete.sede).toContain('Albacete');

      const toledo = clasificarEmpresaGeografia('B45123456', 'CONSTRUCCIONES TOLEDO S.L.');
      expect(toledo.ambito).toBe('regional');
      expect(toledo.sede).toContain('Toledo');
    });

    it('clasifica como nacional sociedades del resto de España (Madrid 28, Barcelona 08, etc.)', () => {
      const serveo = clasificarEmpresaGeografia('A80241789', 'SERVEO SERVICIOS, S.A.U.');
      expect(serveo.ambito).toBe('nacional');
      expect(serveo.sede).toContain('Madrid');

      const bcn = clasificarEmpresaGeografia('B08123456', 'PROVEEDOR CATALUÑA S.L.');
      expect(bcn.ambito).toBe('nacional');
      expect(bcn.sede).toContain('Barcelona');
    });

    it('clasifica como internacional entidades no residentes (NIF W...)', () => {
      const inter = clasificarEmpresaGeografia('W1234567A', 'FOREIGN SUPPLIER CORP');
      expect(inter.ambito).toBe('internacional');
    });
  });

  describe('getEmpresasLocalesStats', () => {
    it('excluye importes de contratos cancelados del volumen territorial', () => {
      const db = createGeneratedTestDb(20260930, 1);
      db.prepare(`UPDATE contracts
        SET year = 2024, status = 'Cancelled', awarded_amount = 1000,
            award_amount_type = 'desconocido', awardee = 'Empresa Local Cancelada',
            awardee_nif = 'B13408349'
        WHERE id = 'generated-20260930-1'`).run();
      setDbForTests(db);

      const stats = getEmpresasLocalesStats();

      expect(stats.resumen.totalVolumen).toBe(0);
      expect(stats.topEmpresasLocales).toHaveLength(0);
    });

    it('incluye importes territoriales con tipo agregado desconocido', () => {
      const db = createGeneratedTestDb(20260930, 2);

      db.prepare(`
        UPDATE contracts
        SET year = 2024,
            status = 'Adjudicada',
            amount_excl_vat = 10000,
            awarded_amount = 1000,
            award_amount_type = 'desconocido',
            awardee = 'Empresa Local Tipo Desconocido',
            awardee_nif = 'B13408349'
        WHERE id = 'generated-20260930-1'
      `).run();

      db.prepare(`
        UPDATE contracts
        SET year = 2024,
            status = 'Adjudicada',
            amount_excl_vat = 8000,
            awarded_amount = 4000,
            award_amount_type = 'total',
            awardee = 'Empresa Nacional Con Importe',
            awardee_nif = 'B28123456'
        WHERE id = 'generated-20260930-2'
      `).run();

      setDbForTests(db);

      const stats = getEmpresasLocalesStats();

      expect(stats.resumen.totalVolumen).toBe(5000);
      expect(stats.resumen.volumenLocal).toBe(1000);
      expect(stats.resumen.pctGastoLocal).toBe(20);
      expect(stats.topEmpresasLocales[0]?.volumen ?? 0).toBe(1000);
    });


    it('atribuye los expedientes multiganador a los adjudicatarios reales en las métricas territoriales', () => {
      const db = createGeneratedTestDb(20260930, 2);

      db.prepare(`
        UPDATE contracts
        SET year = 2024, status = 'Adjudicada', awarded_amount = 9999,
            award_amount_type = 'total', awardee = 'Varios adjudicatarios',
            awardee_nif = NULL, is_lotized = 1, lot_count = 2
        WHERE id = 'generated-20260930-1'
      `).run();

      db.prepare(`
        UPDATE contracts
        SET year = 2024, status = 'Adjudicada', awarded_amount = 4000,
            award_amount_type = 'total', awardee = 'Empresa Nacional',
            awardee_nif = 'B28123456'
        WHERE id = 'generated-20260930-2'
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

      insertLot.run('geo-lot-local', 'generated-20260930-1', 'GEN/2024/1', '1', 'Local', 2000, 2420, 2000, 'Empresa Local', 'B13408349', 'Adjudicado', '2024-04-01', 2000, 2420, 1500, 1815, 2);
      insertLot.run('geo-lot-regional', 'generated-20260930-1', 'GEN/2024/1', '2', 'Regional', 3000, 3630, 3000, 'Empresa Regional', 'B45123456', 'Adjudicado', '2024-04-01', 3000, 3630, 2500, 3025, 1);

      const insertAward = db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
          offer_count, award_date, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertAward.run('geo-award-local', 'generated-20260930-1', 'GEN/2024/1', '1', 0, 'Empresa Local Secundaria', 'B13408349', 1500, 1815, 2, '2024-04-01', 'Adjudicado');
      insertAward.run('geo-award-regional', 'generated-20260930-1', 'GEN/2024/1', '2', 0, 'Empresa Regional', 'B45123456', 2500, 3025, 1, '2024-04-01', 'Adjudicado');

      setDbForTests(db);
      const stats = getEmpresasLocalesStats(2024);

      expect(stats.resumen.totalVolumen).toBe(8000);
      expect(stats.resumen.volumenLocal).toBe(1500);
      expect(stats.resumen.totalEmpresasLocales).toBe(1);
      expect(stats.topEmpresasLocales).toEqual(expect.arrayContaining([
        expect.objectContaining({ awardee: 'Empresa Local Secundaria', volumen: 1500 }),
      ]));
      expect(stats.topEmpresasLocales).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ awardee: 'Varios adjudicatarios' }),
      ]));
    });

    it('cuenta un expediente una sola vez aunque tenga varios awards para la misma empresa', () => {
      const db = createGeneratedTestDb(20260930, 2);

      db.prepare(`
        UPDATE contracts
        SET year = 2024, status = 'Adjudicada', awarded_amount = 4000,
            award_amount_type = 'total', awardee = 'Empresa Local',
            awardee_nif = 'B13408349', is_lotized = 1, lot_count = 1
        WHERE id = 'generated-20260930-1'
      `).run();

      db.prepare(`
        UPDATE contracts
        SET year = 2024, status = 'Adjudicada', awarded_amount = 3000,
            award_amount_type = 'total', awardee = 'Empresa Nacional',
            awardee_nif = 'B28123456'
        WHERE id = 'generated-20260930-2'
      `).run();

      const insertAward = db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
          offer_count, award_date, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertAward.run('geo-distinct-1', 'generated-20260930-1', 'GEN/2024/1', '1', 0, 'Empresa Local', 'B13408349', 1500, 1815, 2, '2024-04-01', 'Adjudicado');
      insertAward.run('geo-distinct-2', 'generated-20260930-1', 'GEN/2024/1', '1', 1, 'Empresa Local', 'B13408349', 500, 605, 1, '2024-04-01', 'Adjudicado');

      setDbForTests(db);
      const stats = getEmpresasLocalesStats(2024);

      expect(stats.resumen.contratosLocales).toBe(1);
      expect(stats.topEmpresasLocales).toEqual(expect.arrayContaining([
        expect.objectContaining({ awardee: 'Empresa Local', contratos: 1, volumen: 2000 }),
      ]));
      expect(stats.evolucionAnual.find((item) => item.year === 2024)).toEqual(
        expect.objectContaining({ totalContratos: 2, contratosLocales: 1 }),
      );
    });

    it('calcula métricas agregadas globales y retorno territorial del gasto', () => {
      const stats = getEmpresasLocalesStats();

      expect(stats.resumen.totalVolumen).toBeGreaterThan(50000000);
      expect(stats.resumen.volumenLocal).toBeGreaterThan(5000000);
      expect(stats.resumen.pctGastoLocal).toBeGreaterThan(9);
      expect(stats.resumen.contratosLocales).toBeGreaterThan(200);
      expect(stats.resumen.pctContratosLocales).toBeGreaterThan(20);

      expect(stats.resumen.volumenProvincialTotal).toBeGreaterThan(stats.resumen.volumenLocal);
      expect(stats.resumen.volumenRegionalTotal).toBeGreaterThan(stats.resumen.volumenProvincialTotal);
      expect(stats.resumen.volumenNacionalTotal).toBeGreaterThan(stats.resumen.volumenRegionalTotal);
      expect(stats.resumen.totalEmpresasLocales).toBeGreaterThan(50);
      expect(stats.resumen.totalEmpresasExternas).toBeGreaterThan(100);
    });

    it('genera desglose territorial completo en 5 ámbitos con sumatorio 100%', () => {
      const stats = getEmpresasLocalesStats();

      expect(stats.desgloseAmbitos.length).toBe(5);

      const local = stats.desgloseAmbitos.find((a) => a.ambito === 'local');
      const prov = stats.desgloseAmbitos.find((a) => a.ambito === 'provincial');
      const reg = stats.desgloseAmbitos.find((a) => a.ambito === 'regional');
      const nac = stats.desgloseAmbitos.find((a) => a.ambito === 'nacional');

      expect(local).toBeDefined();
      expect(prov).toBeDefined();
      expect(reg).toBeDefined();
      expect(nac).toBeDefined();

      const sumPcts = stats.desgloseAmbitos.reduce((acc, a) => acc + a.pctVolumen, 0);
      expect(Math.round(sumPcts)).toBe(100);
    });

    it('genera la serie temporal de evolución anual (2018 a 2026)', () => {
      const stats = getEmpresasLocalesStats();

      expect(stats.evolucionAnual.length).toBeGreaterThanOrEqual(5);

      for (const item of stats.evolucionAnual) {
        expect(item.year).toBeGreaterThanOrEqual(2018);
        expect(item.totalVolumen).toBeGreaterThan(0);
        expect(item.volumenLocal).toBeGreaterThanOrEqual(0);
      }
    });

    it('desglosa por tipo de contrato (Obras, Servicios, Suministros)', () => {
      const stats = getEmpresasLocalesStats();

      expect(stats.porTipoContrato.length).toBeGreaterThanOrEqual(3);

      const obras = stats.porTipoContrato.find((t) => t.tipo.toLowerCase().includes('obra'));
      expect(obras).toBeDefined();
      expect(obras?.volumenLocal).toBeGreaterThan(0);
    });

    it('ordena adecuadamente los rankings de empresas locales y externas', () => {
      const stats = getEmpresasLocalesStats();

      expect(stats.topEmpresasLocales.length).toBeGreaterThan(5);
      expect(stats.topEmpresasExternas.length).toBeGreaterThan(5);

      for (const e of stats.topEmpresasLocales) {
        expect(e.ambito).toBe('local');
      }

      for (const e of stats.topEmpresasExternas) {
        expect(['nacional', 'internacional']).toContain(e.ambito);
      }

      // Orden descendente por volumen
      for (let i = 0; i < stats.topEmpresasLocales.length - 1; i++) {
        expect(stats.topEmpresasLocales[i].volumen).toBeGreaterThanOrEqual(
          stats.topEmpresasLocales[i + 1].volumen
        );
      }
    });

    it('soporta filtrado por año y ámbito municipal', () => {
      const stats2023 = getEmpresasLocalesStats(2023);
      expect(stats2023.resumen.totalVolumen).toBeGreaterThan(1000000);

      const statsMancomunidad = getEmpresasLocalesStats(undefined, 'Indirecta (Mancomunidad)');
      expect(statsMancomunidad.resumen.totalVolumen).toBeGreaterThan(1000000);
    });
  });
});
