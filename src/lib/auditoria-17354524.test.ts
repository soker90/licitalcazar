import { describe, expect, it } from 'vitest';
import { getLicitacionById } from './db';

describe('Auditoría de regresión: expediente 17354524', () => {
  it('mantiene el importe adjudicado verificado y elimina la falsa señal de sobrecoste', () => {
    const lic = getLicitacionById('17354524');

    expect(lic).toBeDefined();
    expect(lic?.importe_adjudicacion).toBeCloseTo(1870406.94, 2);
    expect(lic?.importe_adj_con_iva).toBeCloseTo(2263192.40, 2);
    expect(lic?.lotizado).toBe(0);
    expect(lic?.num_lotes).toBe(1);
    expect(lic?.lotes).toEqual([]);

    const flags = lic?.redFlags || [];
    expect(flags.some((f: any) => f.tipo === 'sobrecoste_licitacion')).toBe(false);
    expect(flags.some((f: any) => f.tipo === 'oferta_unica')).toBe(true);
    expect(flags.some((f: any) => f.tipo === 'modificado_proyecto')).toBe(false);
  });

  it('usa la fecha final explícita de la ampliación de plazo', () => {
    const lic = getLicitacionById('17354524');

    expect(lic).toBeDefined();
    expect(lic?.vigencia?.fechaFinEstimada).toBe('2027-01-09');
  });
});
