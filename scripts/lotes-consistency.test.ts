import { describe, expect, it } from 'vitest';
import { validateLotConsistency } from './lotes-consistency';

describe('validateLotConsistency', () => {
  it('acepta una cabecera cuya adjudicación coincide con la suma de lotes adjudicados', () => {
    const result = validateLotConsistency(
      { importe_adjudicacion: 45632.72, importe_sin_iva: 117827.72 },
      [
        { numeroLote: '1', presupuestoSinIva: 25000, importeAdjudicacion: 20000, estadoLote: 'Adjudicado' },
        { numeroLote: '2', presupuestoSinIva: 30000, importeAdjudicacion: 25632.72, estadoLote: 'Adjudicado' },
        { numeroLote: '3', presupuestoSinIva: 62827.72, importeAdjudicacion: null, estadoLote: 'Desierto' },
      ],
    );

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('ignora importes de cabecera nulos en vez de tratarlos como cero', () => {
    const result = validateLotConsistency(
      { importe_adjudicacion: null, importe_sin_iva: null },
      [
        { numeroLote: '1', presupuestoSinIva: 200, importeAdjudicacion: 100, estadoLote: 'Adjudicado' },
      ],
    );

    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'PARENT_AWARD_MISMATCH' }));
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'PARENT_PBL_MISMATCH' }));
  });

  it('detecta una discrepancia entre adjudicación de cabecera y suma de lotes', () => {
    const result = validateLotConsistency(
      { importe_adjudicacion: 100000 },
      [
        { numeroLote: '1', importeAdjudicacion: 40000, estadoLote: 'Adjudicado' },
        { numeroLote: '2', importeAdjudicacion: 50000, estadoLote: 'Adjudicado' },
      ],
    );

    expect(result.issues).toContainEqual({
      code: 'PARENT_AWARD_MISMATCH',
      parentAward: 100000,
      lotsAward: 90000,
    });
  });

  it('no cuenta lotes desiertos en la suma y detecta si tienen una adjudicación', () => {
    const result = validateLotConsistency(
      { importe_adjudicacion: 50000 },
      [
        { numeroLote: '1', importeAdjudicacion: 50000, estadoLote: 'Adjudicado' },
        { numeroLote: '2', importeAdjudicacion: 10000, estadoLote: 'Desierto' },
      ],
    );

    expect(result.issues).toContainEqual({
      code: 'DESERTED_LOT_HAS_AWARD',
      count: 1,
      lots: ['2'],
    });
    expect(result.issues.some((issue) => issue.code === 'PARENT_AWARD_MISMATCH')).toBe(false);
  });

  it('excluye lotes anulados de la suma y detecta importes de adjudicación residuales', () => {
    const result = validateLotConsistency(
      { importe_adjudicacion: 50000 },
      [
        { numeroLote: '1', importeAdjudicacion: 50000, estadoLote: 'Adjudicado' },
        { numeroLote: '2', importeAdjudicacion: 10000, estadoLote: 'Anulado' },
        { numeroLote: '3', importeAdjudicacion: 5000, estadoLote: 'Cancelado' },
      ],
    );

    expect(result.issues).toContainEqual({
      code: 'ANNULLED_LOT_HAS_AWARD',
      count: 2,
      lots: ['2', '3'],
    });
    expect(result.issues.some((issue) => issue.code === 'PARENT_AWARD_MISMATCH')).toBe(false);
  });

  it('excluye lotes renunciados o retirados y señala importes residuales', () => {
    const result = validateLotConsistency(
      { importe_adjudicacion: 100 },
      [
        { numeroLote: '1', importeAdjudicacion: 100, estadoLote: 'Adjudicado' },
        { numeroLote: '2', importeAdjudicacion: 200, estadoLote: 'Renunciado' },
        { numeroLote: '3', importeAdjudicacion: 300, lot_status: 'Withdrawn' },
      ],
    );

    expect(result.issues).toContainEqual({
      code: 'NO_AWARD_LOT_HAS_AWARD',
      count: 2,
      lots: ['2', '3'],
    });
    expect(result.issues.some((issue) => issue.code === 'PARENT_AWARD_MISMATCH')).toBe(false);
  });

  it('aplica estados terminales en español e inglés al excluir importes residuales', () => {
    const result = validateLotConsistency(
      { importe_adjudicacion: 100 },
      [
        { numeroLote: '1', importeAdjudicacion: 100, estadoLote: 'Adjudicado' },
        { numeroLote: '2', importeAdjudicacion: 200, estadoLote: 'Annulled' },
        { numeroLote: '3', importeAdjudicacion: 300, estadoLote: 'Cancelled' },
        { numeroLote: '4', importeAdjudicacion: 400, estadoLote: 'Rejected' },
        { numeroLote: '5', importeAdjudicacion: 500, estadoLote: 'Desisted' },
        { numeroLote: '6', importeAdjudicacion: 600, estadoLote: 'Deserted' },
      ],
    );

    expect(result.issues).toContainEqual({
      code: 'ANNULLED_LOT_HAS_AWARD',
      count: 2,
      lots: ['2', '3'],
    });
    expect(result.issues).toContainEqual({
      code: 'NO_AWARD_LOT_HAS_AWARD',
      count: 2,
      lots: ['4', '5'],
    });
    expect(result.issues).toContainEqual({
      code: 'DESERTED_LOT_HAS_AWARD',
      count: 1,
      lots: ['6'],
    });
    expect(result.issues.some((issue) => issue.code === 'PARENT_AWARD_MISMATCH')).toBe(false);
  });

  it('solo compara el PBL de cabecera cuando todos los lotes tienen PBL estructurado', () => {
    const result = validateLotConsistency(
      { importe_adjudicacion: 90000, importe_sin_iva: 100000 },
      [
        { numeroLote: '1', presupuestoSinIva: 60000, importeAdjudicacion: 60000, estadoLote: 'Adjudicado' },
        { numeroLote: '2', presupuestoSinIva: null, importeAdjudicacion: 30000, estadoLote: 'Adjudicado' },
      ],
    );

    expect(result.issues.some((issue) => issue.code === 'PARENT_PBL_MISMATCH')).toBe(false);
  });

  it('detecta PBL de cabecera inconsistente cuando todos los lotes tienen PBL', () => {
    const result = validateLotConsistency(
      { importe_sin_iva: 120000, importe_adjudicacion: 100000 },
      [
        { numeroLote: '1', presupuestoSinIva: 50000, importeAdjudicacion: 50000, estadoLote: 'Adjudicado' },
        { numeroLote: '2', presupuestoSinIva: 50000, importeAdjudicacion: 50000, estadoLote: 'Adjudicado' },
      ],
    );

    expect(result.issues).toContainEqual({
      code: 'PARENT_PBL_MISMATCH',
      parentPbl: 120000,
      lotsPbl: 100000,
    });
  });
});
