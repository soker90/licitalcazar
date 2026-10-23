import { describe, it, expect } from 'vitest';
import { evaluarRedFlags, getBajaTemerariaStats } from './db';

describe('Bug 4 Fix: PBL vs VEC, VAT Homogeneity and Art. 149 LCSP Rules', () => {
  describe('PBL (Art. 100 LCSP) vs VEC (Art. 101 LCSP) Mathematical Isolation', () => {
    it('calculates the discount strictly on PBL and never uses VEC in the denominator', () => {
      // Contract: 1 year base (PBL = 100.000 € sin IVA) + 1 year extension (VEC = 200.000 € sin IVA)
      // Awarded for 90.000 € sin IVA for year 1.
      // Expected discount: (100.000 - 90.000) / 100.000 = 10% (normal, no red flag)
      // Erroneous discount using VEC: (200.000 - 90.000) / 200.000 = 55% (false extreme flag)
      const pblSinIva = 100000;
      const valorEstimado = 200000;
      const adjudicacionSinIva = 90000;

      const bajaReal = Math.round(((pblSinIva - adjudicacionSinIva) / pblSinIva) * 1000) / 10;
      expect(bajaReal).toBe(10);

      const flags = evaluarRedFlags({
        importe_sin_iva: pblSinIva,
        valor_estimado: valorEstimado,
        importe_adjudicacion: adjudicacionSinIva,
        procedimiento: 'Abierto',
        num_ofertas: 3,
      });

      // A 10% discount must NOT trigger any baja temeraria or agresiva alert
      const bajaFlags = flags.filter((f) => f.tipo.includes('baja_temeraria'));
      expect(bajaFlags).toHaveLength(0);
    });

    it('correctly triggers warning when discount on PBL exceeds 25% regardless of VEC', () => {
      const pblSinIva = 100000;
      const valorEstimado = 150000;
      const adjudicacionSinIva = 70000; // 30% discount on PBL

      const bajaReal = Math.round(((pblSinIva - adjudicacionSinIva) / pblSinIva) * 1000) / 10;
      expect(bajaReal).toBe(30);

      const flags = evaluarRedFlags({
        importe_sin_iva: pblSinIva,
        valor_estimado: valorEstimado,
        importe_adjudicacion: adjudicacionSinIva,
        procedimiento: 'Abierto',
        num_ofertas: 2,
      });

      const flag = flags.find((f) => f.tipo === 'baja_temeraria');
      expect(flag).toBeDefined();
      expect(flag?.nivel).toBe('aviso');
      expect(flag?.titulo).toContain('30%');
    });
  });

  describe('VAT Homogeneity (Control del IVA)', () => {
    it('ensures discount is strictly computed on tax-exclusive amounts (Base Imponible)', () => {
      const pblSinIva = 50000;
      const pblConIva = 60500;
      const adjSinIva = 40000;
      const adjConIva = 48400;

      // Both must yield the identical 20% discount when compared consistently
      const bajaSinIva = (pblSinIva - adjSinIva) / pblSinIva;
      const bajaConIva = (pblConIva - adjConIva) / pblConIva;
      expect(bajaSinIva).toBeCloseTo(0.2, 5);
      expect(bajaConIva).toBeCloseTo(0.2, 5);

      // Erroneous cross-tax subtraction would produce distorted results:
      // e.g. (pblSinIva - adjConIva) / pblSinIva = (50000 - 48400) / 50000 = 3.2%
      // e.g. (pblConIva - adjSinIva) / pblConIva = (60500 - 40000) / 60500 = 33.8%
      const flags = evaluarRedFlags({
        importe_sin_iva: pblSinIva,
        importe_con_iva: pblConIva,
        importe_adjudicacion: adjSinIva,
        importe_adj_con_iva: adjConIva,
        procedimiento: 'Abierto',
        num_ofertas: 2,
      });

      // 20% is below the 25% threshold, so no false positive alert should be generated
      const flagBaja = flags.find((f) => f.tipo.includes('baja_temeraria'));
      expect(flagBaja).toBeUndefined();
    });
  });

  describe('Régimen Art. 149 LCSP y Art. 85 RGLCAP (N=1 vs N>=2 licitadores)', () => {
    it('handles N=1 single bidder citing Art. 85 RGLCAP subsidiary 25% threshold without NaN or zero division', () => {
      const flags = evaluarRedFlags({
        importe_sin_iva: 100000,
        importe_adjudicacion: 70000, // 30% discount
        procedimiento: 'Abierto',
        num_ofertas: 1, // Single bidder
      });

      const flag = flags.find((f) => f.tipo === 'baja_temeraria');
      expect(flag).toBeDefined();
      expect(flag?.descripcion).toContain('N=1');
      expect(flag?.descripcion).toContain('art. 85 RGLCAP');
      expect(flag?.descripcion).not.toContain('NaN');
    });

    it('handles N>=2 bidders contextualizing PLACSP syndication open data limitations', () => {
      const flags = evaluarRedFlags({
        importe_sin_iva: 100000,
        importe_adjudicacion: 50000, // 50% discount
        procedimiento: 'Abierto',
        num_ofertas: 4, // 4 bidders
      });

      const flag = flags.find((f) => f.tipo === 'baja_temeraria_extrema');
      expect(flag).toBeDefined();
      expect(flag?.descripcion).toContain('PLACSP');
      expect(flag?.descripcion).toContain('señal analítica sobre PBL');
      expect(flag?.descripcion).toContain('Art. 149 LCSP');
    });
  });

  describe('Unit Price Contract Anomaly Detection (Precios Unitarios en PLACSP)', () => {
    it('detects fuel contract unit rate distortion where PLACSP registered unit price (e.g. 2 €) against total budget', () => {
      const flags = evaluarRedFlags({
        objeto: 'Contrato de suministro de combustible de automoción para los vehículos',
        importe_sin_iva: 85950.42,
        importe_adjudicacion: 2.0, // 2 € / liter or 2 cents discount stored as unit price
        procedimiento: 'Abierto simplificado',
        num_ofertas: 2,
      });

      const flagUnit = flags.find((f) => f.titulo.includes('Tarifa / Precio Unitario'));
      expect(flagUnit).toBeDefined();
      expect(flagUnit?.nivel).toBe('info');
      expect(flagUnit?.descripcion).toContain('tarifa unitaria');

      // Crucial: Must NOT classify as an extreme temerary tender of 100%
      const flagExtrema = flags.find((f) => f.tipo === 'baja_temeraria_extrema');
      expect(flagExtrema).toBeUndefined();
    });

    it('detects machinery repair hourly rate distortion (e.g. 32 €/h vs 8.000 € budget)', () => {
      const flags = evaluarRedFlags({
        objeto: 'Servicio de reparación y mantenimiento de maquinaria pesada, mano de obra y taller',
        importe_sin_iva: 8000,
        importe_adjudicacion: 32.0, // 32 €/hour rate
        procedimiento: 'Abierto simplificado',
        num_ofertas: 1,
      });

      const flagUnit = flags.find((f) => f.titulo.includes('Tarifa / Precio Unitario'));
      expect(flagUnit).toBeDefined();
      expect(flagUnit?.nivel).toBe('info');

      const flagExtrema = flags.find((f) => f.tipo === 'baja_temeraria_extrema');
      expect(flagExtrema).toBeUndefined();
    });
  });

  describe('getBajaTemerariaStats enriched data model', () => {
    it('includes esLicitadorUnico and posiblePrecioUnitario properties in topBajas', () => {
      const stats = getBajaTemerariaStats();
      expect(stats.topBajas.length).toBeGreaterThan(0);

      const first = stats.topBajas[0];
      expect(first).toHaveProperty('esLicitadorUnico');
      expect(first).toHaveProperty('posiblePrecioUnitario');
      expect(typeof first.esLicitadorUnico).toBe('boolean');
      expect(typeof first.posiblePrecioUnitario).toBe('boolean');
    });
  });
});
