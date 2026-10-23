import { describe, it, expect } from 'vitest';
import { normalizeProcedimiento, isContratoMenor } from './procedimiento';

describe('normalizeProcedimiento', () => {
  it('unifica variantes de contrato menor a "Contrato menor"', () => {
    expect(normalizeProcedimiento('Menor')).toBe('Contrato menor');
    expect(normalizeProcedimiento('menor')).toBe('Contrato menor');
    expect(normalizeProcedimiento('Contrato menor')).toBe('Contrato menor');
    expect(normalizeProcedimiento('contratos menores')).toBe('Contrato menor');
    expect(normalizeProcedimiento('  c. menor  ')).toBe('Contrato menor');
    expect(normalizeProcedimiento('CM')).toBe('Contrato menor');
    expect(normalizeProcedimiento('contrato_menor')).toBe('Contrato menor');
  });

  it('normaliza procedimientos abiertos y simplificados', () => {
    expect(normalizeProcedimiento('Abierto')).toBe('Abierto');
    expect(normalizeProcedimiento('procedimiento abierto')).toBe('Abierto');
    expect(normalizeProcedimiento('abierto simplificado')).toBe('Abierto simplificado');
    expect(normalizeProcedimiento('abierto supersimplificado')).toBe('Abierto supersimplificado');
    expect(normalizeProcedimiento('abierto abreviado')).toBe('Abierto supersimplificado');
  });

  it('normaliza variantes de negociado con y sin publicidad', () => {
    expect(normalizeProcedimiento('Negociado sin publicidad')).toBe('Negociado sin publicidad');
    expect(normalizeProcedimiento('negociado sin publicidad')).toBe('Negociado sin publicidad');
    expect(normalizeProcedimiento('NSP')).toBe('Negociado sin publicidad');
    expect(normalizeProcedimiento('Negociado con publicidad')).toBe('Negociado con publicidad');
    expect(normalizeProcedimiento('ncp')).toBe('Negociado con publicidad');
  });

  it('normaliza sistemas dinámicos y acuerdos marco', () => {
    expect(normalizeProcedimiento('Basado en sistema dinámico')).toBe('Basado en sistema dinámico');
    expect(normalizeProcedimiento('sistema dinamico')).toBe('Basado en sistema dinámico');
    expect(normalizeProcedimiento('acuerdo marco')).toBe('Basado en acuerdo marco');
  });

  it('normaliza encargos a medios propios', () => {
    expect(normalizeProcedimiento('encargo a medio propio')).toBe('Encargo a medio propio');
    expect(normalizeProcedimiento('encargos')).toBe('Encargo a medio propio');
  });

  it('gestiona nulos, cadenas vacías y otros', () => {
    expect(normalizeProcedimiento(null)).toBe('Otros');
    expect(normalizeProcedimiento(undefined)).toBe('Otros');
    expect(normalizeProcedimiento('')).toBe('Otros');
    expect(normalizeProcedimiento('   ')).toBe('Otros');
    expect(normalizeProcedimiento('Otros')).toBe('Otros');
  });
});

describe('isContratoMenor', () => {
  it('detecta contrato menor por conjunto o por procedimiento', () => {
    expect(isContratoMenor('Menor')).toBe(true);
    expect(isContratoMenor('Contrato menor')).toBe(true);
    expect(isContratoMenor(null, 'menores')).toBe(true);
    expect(isContratoMenor(null, 'contratos_menores')).toBe(true);
    expect(isContratoMenor('Abierto', 'licitaciones')).toBe(false);
    expect(isContratoMenor('Otros', 'licitaciones')).toBe(false);
    expect(isContratoMenor(null, null)).toBe(false);
  });
});
