import { describe, expect, it } from 'vitest';
import { esImporteAdjudicacionComparable, getContratoImporteComparable } from './importe-comparable';

describe('getContratoImporteComparable', () => {
  it('incluye importes totales y legados conocidos', () => {
    expect(getContratoImporteComparable({ importe_adjudicacion: 90000, importe_sin_iva: 100000, award_amount_type: 'total' })).toBe(90000);
    expect(getContratoImporteComparable({ importe_adjudicacion: 90000, importe_sin_iva: 100000, award_amount_type: null })).toBe(90000);
  });

  it('no usa el PBL como fallback cuando falta la adjudicación', () => {
    expect(getContratoImporteComparable({ importe_adjudicacion: null, importe_sin_iva: 100000, award_amount_type: 'total' })).toBe(0);
    expect(getContratoImporteComparable({ importe_sin_iva: 100000, award_amount_type: null })).toBe(0);
  });

  it('excluye precios unitarios del volumen económico', () => {
    expect(getContratoImporteComparable({ importe_adjudicacion: 31, importe_sin_iva: 16250, award_amount_type: 'unitario' })).toBe(0);
  });

  it('excluye importes de semántica desconocida', () => {
    expect(getContratoImporteComparable({ importe_adjudicacion: 450, importe_sin_iva: 5400, award_amount_type: 'desconocido' })).toBe(0);
  });
});

describe('esImporteAdjudicacionComparable', () => {
  it('solo considera comparable una adjudicación total conocida', () => {
    expect(esImporteAdjudicacionComparable({ award_amount_type: 'total', importe_adjudicacion: 90000 })).toBe(true);
    expect(esImporteAdjudicacionComparable({ award_amount_type: null, importe_adjudicacion: 90000 })).toBe(true);
    expect(esImporteAdjudicacionComparable({ award_amount_type: 'total', importe_adjudicacion: null })).toBe(false);
  });

  it('considera no comparables los unitarios y desconocidos', () => {
    expect(esImporteAdjudicacionComparable({ award_amount_type: 'unitario', importe_adjudicacion: 31 })).toBe(false);
    expect(esImporteAdjudicacionComparable({ award_amount_type: 'desconocido', importe_adjudicacion: 450 })).toBe(false);
  });
});
