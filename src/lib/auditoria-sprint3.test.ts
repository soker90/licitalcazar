import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { getAlertasV2, getAuditoriaKpis, getAlertasForContract } from './db';

describe('Sprint 3: Centro de Análisis y Transparencia de Contratación', () => {
  describe('getAuditoriaKpis', () => {
    it('calcula los KPIs agregados globales de auditoría correctamente', () => {
      const kpis = getAuditoriaKpis();

      expect(kpis.totalAlertas).toBeGreaterThan(0);
      expect(kpis.severidades.alta).toBeGreaterThan(0);
      expect(kpis.severidades.media).toBeGreaterThan(0);
      expect(kpis.severidades.informativa).toBeGreaterThanOrEqual(0);
      expect(kpis.totalAlertas).toBe(
        kpis.severidades.alta + kpis.severidades.media + kpis.severidades.informativa
      );

      expect(kpis.volumenAuditado).toBeGreaterThan(0);
      expect(kpis.totalContratosConAlerta).toBeGreaterThan(0);

      expect(kpis.tipos.bajasAcusadas).toBeGreaterThan(0);
      expect(kpis.tipos.menoresRelacionados).toBeGreaterThan(0);
      expect(kpis.tipos.ofertaUnica).toBeGreaterThan(0);
    });

    it('el volumen auditado solo incluye importes de adjudicación conocidos', () => {
      const source = readFileSync(path.resolve(process.cwd(), 'src/lib/db.ts'), 'utf8');
      expect(source).toContain("coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as vol,");
      expect(source).not.toContain("coalesce(l.awarded_amount, l.amount_excl_vat, 0) ELSE 0 END), 2) as vol,");
    });

    it('permite filtrar KPIs por ámbito institucional', () => {
      const kpisDirecta = getAuditoriaKpis('directa');
      const kpisMancomunidad = getAuditoriaKpis('mancomunidad');

      expect(kpisDirecta.totalAlertas).toBeGreaterThan(0);
      expect(kpisDirecta.volumenAuditado).toBeGreaterThan(0);
      expect(kpisMancomunidad.totalAlertas).toBeGreaterThan(0);

      // La contratación directa municipal concentra volumen municipal
      expect(kpisDirecta.volumenAuditado).toBeGreaterThan(0);
    });
  });

  describe('getAlertasV2 enriquecida', () => {
    it('devuelve contratosDetalle completos para cada alerta vinculada', () => {
      const res = getAlertasV2({ limit: 10 });
      expect(res.alertas.length).toBeGreaterThan(0);

      const alertaConContratos = res.alertas.find(
        (a) => a.contratosDetalle && a.contratosDetalle.length > 0
      );
      expect(alertaConContratos).toBeDefined();

      if (alertaConContratos && alertaConContratos.contratosDetalle) {
        const contrato = alertaConContratos.contratosDetalle[0];
        expect(contrato.id).toBeDefined();
        expect(typeof contrato.expediente).toBe('string');
        expect(typeof contrato.objeto).toBe('string');
        expect(typeof contrato.importe).toBe('number');
        expect(contrato.adjudicatario).toBeDefined();
      }
    });

    it('incluye información de cluster y similitud para alertas de contratos relacionados', () => {
      const res = getAlertasV2({ tipo: 'CONTRATOS_RELACIONADOS', limit: 10 });
      expect(res.alertas.length).toBeGreaterThan(0);

      const alertaCluster = res.alertas.find((a) => a.relacionadosInfo !== null && a.relacionadosInfo !== undefined);
      expect(alertaCluster).toBeDefined();

      if (alertaCluster?.relacionadosInfo) {
        expect(alertaCluster.relacionadosInfo.grupoId).toMatch(/^ALERT-MENOR-/);
        expect(alertaCluster.relacionadosInfo.scoreSimilitud).toBeGreaterThan(0);
        expect(alertaCluster.relacionadosInfo.importeAcumulado).toBeGreaterThan(0);
      }
    });

    it('permite realizar búsquedas de texto libre (q) en títulos, descripciones o evidencias', () => {
      const query = 'baja';
      const res = getAlertasV2({ search: query, limit: 10 });

      expect(res.total).toBeGreaterThan(0);
      for (const a of res.alertas) {
        const match =
          a.titulo.toLowerCase().includes(query) ||
          a.descripcion.toLowerCase().includes(query) ||
          a.evidencia.toLowerCase().includes(query);
        expect(match).toBe(true);
      }
    });

    it('permite combinar filtros de severidad y tipología', () => {
      const res = getAlertasV2({
        severidad: 'ALTA',
        tipo: 'BAJA_ACUSADA',
        limit: 15,
      });

      expect(res.alertas.length).toBeGreaterThan(0);
      for (const a of res.alertas) {
        expect(a.severidad).toBe('ALTA');
        expect(a.tipo).toBe('BAJA_ACUSADA');
      }
    });

    it('getAlertasForContract enriquece las alertas con contratosDetalle y relacionadosInfo', () => {
      const id = 'https://contrataciondelestado.es/sindicacion/datosAbiertosMenores/19876665';
      const alertas = getAlertasForContract(id);
      expect(alertas.length).toBeGreaterThan(0);
      const alertaMenor = alertas.find((a) => a.tipo === 'CONTRATOS_RELACIONADOS');
      expect(alertaMenor).toBeDefined();
      expect(alertaMenor?.contratosDetalle).toBeDefined();
      expect(alertaMenor?.contratosDetalle?.length).toBe(3);
      expect(alertaMenor?.relacionadosInfo).toBeDefined();
      expect(alertaMenor?.relacionadosInfo?.importeAcumulado).toBe(35184.5);
    });
  });
});
