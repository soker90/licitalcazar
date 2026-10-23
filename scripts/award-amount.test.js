import { describe, expect, it } from 'vitest';
const { hasUnitPriceVocabulary, classifyAwardAmountType, classifyAggregatedAwardAmountType } = require('./award-amount.js');

describe('award amount classification', () => {
  it('detects explicit unit-price vocabulary after accent normalization', () => {
    expect(hasUnitPriceVocabulary('Servicio de reparación y mantenimiento con precio de la hora')).toBe(true);
    expect(hasUnitPriceVocabulary('Servicio con tarifa por hora y precio por kilometro')).toBe(true);
    expect(hasUnitPriceVocabulary('Suministro de mobiliario de oficina')).toBe(false);
  });

  it('does not treat generic maintenance vocabulary as proof of a unit price', () => {
    expect(hasUnitPriceVocabulary('Servicio de mantenimiento y asesoramiento en materia de protección de datos')).toBe(false);
    expect(classifyAwardAmountType({
      awardedAmount: 250,
      budgetAmount: 2000,
      objectDescription: 'Servicio de mantenimiento y asesoramiento en materia de protección de datos',
      lotCount: 0,
    })).toBe('desconocido');
  });

  it('classifies extreme reductions with explicit unit-price vocabulary as unitario', () => {
    expect(classifyAwardAmountType({
      awardedAmount: 34,
      budgetAmount: 9270,
      objectDescription: 'Servicio con precio de la hora y precio por kilometro',
      lotCount: 0,
    })).toBe('unitario');
  });

  it('keeps an extreme reduction without supporting vocabulary unknown', () => {
    expect(classifyAwardAmountType({
      awardedAmount: 34,
      budgetAmount: 9270,
      objectDescription: 'Servicio de consultoría administrativa',
      lotCount: 0,
    })).toBe('desconocido');
  });

  it('keeps 2024/0005-style printing awards unknown without unit-price evidence', () => {
    expect(classifyAwardAmountType({
      awardedAmount: 0.32,
      budgetAmount: 2210,
      objectDescription: 'Servicio de impresión con alquiler de fotocopiadora, digitalización-escaneado de documentos y fax',
      lotCount: 0,
    })).toBe('desconocido');
  });

  it('keeps 3/2024-style supply awards unknown when only the PBL documents prove unit pricing', () => {
    expect(classifyAwardAmountType({
      awardedAmount: 1870.5,
      budgetAmount: 52000,
      objectDescription: 'Adquisición de vestuario para la plantilla de la Policía Local',
      lotCount: 0,
    })).toBe('desconocido');
  });

  it('recognizes compact euro-per-unit notation in contract descriptions', () => {
    expect(hasUnitPriceVocabulary('Servicio con tarifa de 42 €/hora')).toBe(true);
    expect(hasUnitPriceVocabulary('Transporte con precio de 0,35 €/km')).toBe(true);
    expect(hasUnitPriceVocabulary('Servicio con precio de 42 euros/hora')).toBe(true);
    expect(classifyAwardAmountType({
      awardedAmount: 42,
      budgetAmount: 10000,
      objectDescription: 'Servicio con tarifa de 42 €/hora',
      lotCount: 0,
    })).toBe('unitario');
  });

  it('does not treat annual amounts as unit-price vocabulary', () => {
    expect(hasUnitPriceVocabulary('20.250 euros/año incluido el IVA')).toBe(false);
    expect(hasUnitPriceVocabulary('99.000 euros por el año de duración del contrato')).toBe(false);
    expect(classifyAwardAmountType({
      awardedAmount: 20250,
      budgetAmount: 81818.18,
      objectDescription: 'Servicio con un importe de 20.250 euros/año y presupuesto anual máximo',
      lotCount: 0,
    })).toBe('total');
  });

  it('does not treat generic hours or kilometres as unit-price vocabulary', () => {
    expect(hasUnitPriceVocabulary('Servicio con 50 horas y 1.450 kilometros de duración estimada')).toBe(false);
  });

  it('classifies an explicitly aggregated lot award as total', () => {
    expect(classifyAggregatedAwardAmountType({ awardedAmount: 7500, budgetAmount: 10000 })).toBe('total');
    expect(classifyAggregatedAwardAmountType({ awardedAmount: 7500, budgetAmount: null })).toBe('desconocido');
  });

  it('does not auto-classify a multi-lot parent as unitario', () => {
    expect(classifyAwardAmountType({
      awardedAmount: 100,
      budgetAmount: 10000,
      objectDescription: 'Mantenimiento de instalaciones',
      lotCount: 3,
    })).toBe('desconocido');
  });
});
