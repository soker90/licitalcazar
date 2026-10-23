import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { getBajaTemerariaStats, evaluarRedFlags } from './db';

describe('Análisis de Bajas Temerarias y Adjudicaciones Agresivas (Art. 149 LCSP)', () => {
  it('mantiene el umbral de contratos menores basado exclusivamente en VEC', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/lib/db.ts'), 'utf8');

    expect(source).toContain("estimated_value >= 36000 AND estimated_value < 40000");
    expect(source).toContain("estimated_value >= 13500 AND estimated_value < 15000");
    expect(source).not.toContain("coalesce(awarded_amount, amount_excl_vat) >= 36000");
    expect(source).not.toContain("coalesce(awarded_amount, amount_excl_vat) >= 13500");
  
    expect(source).toContain("estimated_value IS NOT NULL");
  });
 // comparable award amounts only
  describe('evaluarRedFlags para bajas desproporcionadas', () => {
    it('activa alerta de baja temeraria extrema cuando el descuento supera el 40%', () => {
      const flags = evaluarRedFlags({
        importe_sin_iva: 100000,
        importe_adjudicacion: 45000, // 55% de baja
        procedimiento: 'Abierto',
        num_ofertas: 3,
      });

      const flagExtrema = flags.find((f) => f.tipo === 'baja_temeraria_extrema');
      expect(flagExtrema).toBeDefined();
      expect(flagExtrema?.nivel).toBe('alerta');
      expect(flagExtrema?.titulo).toContain('55%');
    });

    it('calcula la baja económica de un multilot con los importes de sus lotes, no con la cabecera', () => {
      const flags = evaluarRedFlags(
        {
          importe_sin_iva: 100000,
          importe_adjudicacion: 100000,
          procedimiento: 'Abierto',
          num_ofertas: 4,
          naturaleza_economica: 'gasto',
        },
        [
          {
            numeroLote: '1',
            presupuestoSinIva: 50000,
            importeAdjudicacion: 30000,
            estadoLote: 'Adjudicado',
            adjudicatario: 'Empresa A',
            numOfertas: 2,
          },
          {
            numeroLote: '2',
            presupuestoSinIva: 50000,
            importeAdjudicacion: 40000,
            estadoLote: 'Adjudicado',
            adjudicatario: 'Empresa B',
            numOfertas: 2,
          },
        ]
      );

      const flag = flags.find((f) => f.tipo === 'baja_temeraria');
      expect(flag).toBeDefined();
      expect(flag?.titulo).toContain('30%');
    });

    it('ignora precios unitarios en las señales económicas de riesgo', () => {
      const flags = evaluarRedFlags({
        importe_sin_iva: 16250,
        importe_adjudicacion: 31,
        tipo_importe_adjudicacion: 'unitario',
        procedimiento: 'Abierto',
        num_ofertas: 3,
      });

      expect(flags.some((f) => ['baja_cero', 'alerta_menor', 'baja_temeraria', 'baja_temeraria_extrema', 'sobrecoste_licitacion'].includes(f.tipo))).toBe(false);
    });

    it('usa el VEC para la alerta de proximidad al umbral de contratos menores', () => {
      const flags = evaluarRedFlags({
        importe_sin_iva: 12000,
        importe_adjudicacion: 5000,
        valor_estimado: 14000,
        procedimiento: 'Contrato menor',
      });

      const alerta = flags.find((f) => f.tipo === 'alerta_menor');
      expect(alerta).toBeDefined();
      expect(alerta?.descripcion).toContain('14.000');
    });

    it('mantiene la alerta de proximidad aunque el importe adjudicado sea unitario o desconocido', () => {
      const unitario = evaluarRedFlags({
        importe_sin_iva: 14900,
        importe_adjudicacion: 1,
        valor_estimado: 14000,
        tipo_importe_adjudicacion: 'unitario',
        procedimiento: 'Contrato menor',
      });
      const desconocido = evaluarRedFlags({
        importe_sin_iva: 14900,
        importe_adjudicacion: 14900,
        valor_estimado: 14000,
        tipo_importe_adjudicacion: 'desconocido',
        procedimiento: 'Contrato menor',
      });

      expect(unitario.some((f) => f.tipo === 'alerta_menor')).toBe(true);
      expect(desconocido.some((f) => f.tipo === 'alerta_menor')).toBe(true);
    });

    it('no usa adjudicación ni PBL cuando falta el VEC', () => {
      const flags = evaluarRedFlags({
        importe_sin_iva: 14900,
        importe_adjudicacion: 14900,
        procedimiento: 'Contrato menor',
      });

      expect(flags.some((f) => f.tipo === 'alerta_menor')).toBe(false);
    });

    it('no activa la alerta si el VEC ya alcanza o supera el umbral legal', () => {
      const flags = evaluarRedFlags({
        importe_sin_iva: 14900,
        importe_adjudicacion: 14900,
        valor_estimado: 15000,
        procedimiento: 'Contrato menor',
      });

      expect(flags.some((f) => f.tipo === 'alerta_menor')).toBe(false);
    });

    it('no calcula baja cuando el tipo de importe es desconocido', () => {
      const flags = evaluarRedFlags({
        importe_sin_iva: 16250,
        importe_adjudicacion: 31,
        tipo_importe_adjudicacion: 'desconocido',
        procedimiento: 'Abierto',
        num_ofertas: 3,
      });

      expect(flags.some((f) => f.tipo.includes('baja_temeraria') || f.tipo === 'baja_cero' || f.tipo === 'sobrecoste_licitacion')).toBe(false);
    });

    it('activa aviso de baja muy agresiva cuando el descuento se sitúa entre el 25% y 40%', () => {
      const flags = evaluarRedFlags({
        importe_sin_iva: 100000,
        importe_adjudicacion: 72000, // 28% de baja
        procedimiento: 'Abierto',
        num_ofertas: 4,
      });

      const flagAgresiva = flags.find((f) => f.tipo === 'baja_temeraria');
      expect(flagAgresiva).toBeDefined();
      expect(flagAgresiva?.nivel).toBe('aviso');
      expect(flagAgresiva?.titulo).toContain('28%');
    });

    it('no activa señal de baja acusada en rebajas moderadas (< 25%) ni en contratos menores', () => {
      const flagsModerada = evaluarRedFlags({
        importe_sin_iva: 100000,
        importe_adjudicacion: 85000, // 15% de baja normal
        procedimiento: 'Abierto',
        num_ofertas: 3,
      });
      expect(flagsModerada.some((f) => f.tipo.includes('baja_temeraria'))).toBe(false);

      const flagsMenor = evaluarRedFlags({
        importe_sin_iva: 10000,
        importe_adjudicacion: 4000, // 60% en contrato menor
        procedimiento: 'Contrato menor',
        num_ofertas: 1,
      });
      expect(flagsMenor.some((f) => f.tipo.includes('baja_temeraria'))).toBe(false);
    });
  });

  describe('getBajaTemerariaStats', () => {
    it('calcula métricas agregadas de bajas agresivas y contratos evaluados', () => {
      const stats = getBajaTemerariaStats();

      expect(stats.resumen.totalEvaluados).toBeGreaterThanOrEqual(0);
      expect(stats.resumen.bajasExtremasCount).toBeGreaterThanOrEqual(0);
      expect(stats.resumen.bajasExtremasCount + stats.resumen.bajasAgresivasCount).toBeLessThanOrEqual(stats.resumen.totalEvaluados);
      expect(stats.resumen.bajasAgresivasCount).toBeLessThanOrEqual(stats.resumen.totalEvaluados);
      expect(stats.resumen.volumenEnRiesgo).toBeGreaterThanOrEqual(0);
      expect(stats.resumen.bajaMediaGlobal).toBeGreaterThanOrEqual(0);
      expect(stats.resumen.bajaMediaGlobal).toBeLessThanOrEqual(100);
      expect(stats.resumen.pctContratosRiesgo).toBeGreaterThanOrEqual(0);
      expect(stats.resumen.pctContratosRiesgo).toBeLessThanOrEqual(100);
      expect(stats.resumen.pctContratosRiesgo).toBe(
        Math.round(((stats.resumen.bajasExtremasCount + stats.resumen.bajasAgresivasCount) / stats.resumen.totalEvaluados) * 1000) / 10
      );
    });

    it('genera la distribución de tramos con niveles de alerta coherentes', () => {
      const stats = getBajaTemerariaStats();

      expect(stats.tramos.length).toBe(4);
      const extrema = stats.tramos.find((t) => t.nivel === 'alerta');
      const agresiva = stats.tramos.find((t) => t.nivel === 'advertencia');
      expect(extrema).toBeDefined();
      expect(agresiva).toBeDefined();
      expect(extrema!.count).toBe(stats.resumen.bajasExtremasCount);
    });

    it('genera el listado topBajas ordenado por agresividad porcentual', () => {
      const stats = getBajaTemerariaStats();

      expect(stats.topBajas.length).toBeGreaterThan(0);
      for (let i = 0; i < Math.min(stats.topBajas.length - 1, 30); i++) {
        expect(stats.topBajas[i].baja_pct).toBeGreaterThanOrEqual(stats.topBajas[i + 1].baja_pct);
      }

      stats.topBajas.forEach((b) => {
        expect(b.baja_pct).toBeGreaterThanOrEqual(20);
        expect(b.importe_sin_iva).toBeGreaterThan(b.importe_adjudicacion);
        expect(b.ahorro_euros).toBeGreaterThan(0);
        expect(b.expediente).toBeDefined();
      });
    });

    it('elabora ranking de empresas con mayor recurrencia en bajas agresivas', () => {
      const stats = getBajaTemerariaStats();

      expect(stats.rankingEmpresas.length).toBeGreaterThan(10);
      const topEmpresa = stats.rankingEmpresas[0];
      expect(topEmpresa.bajasAgresivas).toBeGreaterThan(0);
      expect(topEmpresa.totalContratos).toBeGreaterThanOrEqual(topEmpresa.bajasAgresivas);
      expect(topEmpresa.bajaMediaPct).toBeGreaterThan(10);
      expect(topEmpresa.volumenTotal).toBeGreaterThan(0);
    });

    it('soporta filtrado por ejercicio y ámbito municipal', () => {
      const statsDirecta = getBajaTemerariaStats(undefined, 'directa');
      const statsMancomunidad = getBajaTemerariaStats(undefined, 'mancomunidad');

      expect(statsDirecta.resumen.totalEvaluados).toBeGreaterThan(0);
      expect(statsMancomunidad.resumen.totalEvaluados).toBeGreaterThan(0);
      expect(statsDirecta.resumen.totalEvaluados + statsMancomunidad.resumen.totalEvaluados).toBe(
        getBajaTemerariaStats().resumen.totalEvaluados
      );

      const stats2024 = getBajaTemerariaStats(2024);
      expect(stats2024.resumen.totalEvaluados).toBeGreaterThan(0);
    });
  });
});
