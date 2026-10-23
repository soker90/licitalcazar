import { describe, expect, it } from 'vitest';

const { findEvidence } = require('./classify-award-amount-documents.js');

describe('document award amount evidence', () => {
  it('detects explicit hourly and kilometre pricing', () => {
    expect(findEvidence('Criterios de adjudicación: Precio de la Hora y Kilómetros de desplazamiento')).toMatch(/Precio de la Hora/i);
  });

  it('detects a periodic canon', () => {
    expect(findEvidence('Duración: cuatro años. Canon mensual: 450,00€')).toMatch(/Canon mensual/i);
  });

  it('does not treat annual amounts as unit-price evidence', () => {
    expect(findEvidence('20.250 euros/año incluido el IVA. Presupuesto Base de Licitación 81.818,18 euros. 99.000 euros por el año de duración.')).toBeNull();
  });
});
