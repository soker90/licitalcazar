import { describe, it, expect } from 'vitest';
import { getFilterValues, getLicitaciones } from './db';

describe('Economic flow filter', () => {
  it('exposes the four economic-flow buckets with counts', () => {
    const filters = getFilterValues();

    expect(filters.flujosEconomicos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ flujo: 'paga', label: 'Gasto municipal' }),
        expect.objectContaining({ flujo: 'recibe', label: 'Ingreso municipal' }),
        expect.objectContaining({
          flujo: 'sin_flujo_directo',
          label: 'Sin flujo municipal directo determinado',
        }),
        expect.objectContaining({ flujo: 'no_determinado', label: 'Sentido económico no determinado' }),
      ])
    );

    for (const flujo of filters.flujosEconomicos) {
      expect(flujo.count).toEqual(expect.any(Number));
      expect(flujo.count).toBeGreaterThanOrEqual(0);
    }
  });

  it('filters gasto, ingreso and concesion without conflating them', () => {
    const gasto = getLicitaciones({ flujoEconomico: 'paga', year: 'todos', limit: 100 });
    const ingreso = getLicitaciones({ flujoEconomico: 'recibe', year: 'todos', limit: 100 });
    const concesion = getLicitaciones({
      flujoEconomico: 'sin_flujo_directo',
      year: 'todos',
      limit: 100,
    });

    expect(gasto.data.length).toBeGreaterThan(0);
    expect(ingreso.data.length).toBeGreaterThan(0);
    expect(concesion.data.length).toBeGreaterThanOrEqual(0);

    expect(gasto.data.every((row: any) => row.naturaleza_economica === 'gasto')).toBe(true);
    expect(ingreso.data.every((row: any) => row.naturaleza_economica === 'ingreso')).toBe(true);
    expect(concesion.data.every((row: any) => row.naturaleza_economica === 'concesion')).toBe(true);

  });
});
