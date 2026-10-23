import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getOfertaUnicaEconomicAssessment } = require('../../scripts/oferta-unica-economia');

describe('Economía de la alerta de oferta única', () => {
  it('no trata un ingreso de 100.000 € como fondos públicos gastados', () => {
    const result = getOfertaUnicaEconomicAssessment(100000, 'ingreso');

    expect(result.superaUmbralGasto).toBe(false);
    expect(result.severidad).toBe('MEDIA');
    expect(result.factorEconomico).toContain('ingreso/canon');
    expect(result.factorEconomico).not.toContain('fondos públicos');
    expect(result.factorEconomicoScore).toBe(0);
    expect(result.scoreEscala).toBe(3.2);
  });

  it('sí aplica el umbral de 100.000 € a gasto público', () => {
    const result = getOfertaUnicaEconomicAssessment(100000, 'gasto');

    expect(result.superaUmbralGasto).toBe(true);
    expect(result.severidad).toBe('ALTA');
    expect(result.factorEconomico).toContain('gasto público');
    expect(result.factorEconomicoScore).toBe(20);
  });

  it('mantiene un tratamiento estándar para gasto por debajo del umbral', () => {
    const result = getOfertaUnicaEconomicAssessment(99999.99, 'gasto');

    expect(result.superaUmbralGasto).toBe(false);
    expect(result.severidad).toBe('MEDIA');
    expect(result.factorEconomicoScore).toBe(10);
  });
  it('no aporta peso económico cuando el importe es unitario', () => {
    const result = getOfertaUnicaEconomicAssessment(1000000, 'gasto', 'unitario');

    expect(result.superaUmbralGasto).toBe(false);
    expect(result.severidad).toBe('MEDIA');
    expect(result.scoreEscala).toBe(3.2);
    expect(result.factorEconomicoScore).toBe(0);
    expect(result.factorEconomico).toContain('no comparable');
  });

});
