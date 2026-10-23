import { describe, it, expect } from 'vitest';
import { classifyEconomicNature, getEconomicFlow } from './naturaleza-economica';
import { getDb } from './db';

describe('Economic Nature Classifier (clasificarNaturalezaEconomica)', () => {
  it('classifies standard public procurement contracts as gasto', () => {
    expect(classifyEconomicNature({ tipo_codigo: '1', objeto: 'Suministro de combustible' })).toBe('gasto');
    expect(classifyEconomicNature({ tipo_codigo: '2', objeto: 'Servicio de limpieza de colegios' })).toBe('gasto');
    expect(classifyEconomicNature({ tipo_codigo: '3', objeto: 'Obras de pavimentacion' })).toBe('gasto');
    expect(classifyEconomicNature({ tipo_codigo: '7', objeto: 'Contrato administrativo especial' })).toBe('gasto');
    expect(classifyEconomicNature({ tipo_codigo: '8', objeto: 'Seguro de responsabilidad civil privada' })).toBe('gasto');
  });

  it('classifies LCSP concession codes as concesion', () => {
    expect(classifyEconomicNature({ tipo_codigo: '22', objeto: 'Gestion de la escuela infantil El Tobogan' })).toBe('concesion');
    expect(classifyEconomicNature({ tipo_codigo: '31', objeto: 'Concesion de obras de aparcamiento' })).toBe('concesion');
  });

  it('classifies patrimonial acquisitions (code 50) as gasto', () => {
    expect(classifyEconomicNature({
      tipo_codigo: '50',
      objeto: 'Adquisición directa por el Ayuntamiento de Alcázar de San Juan de una finca rústica en Paraje Piédrola'
    })).toBe('gasto');

    expect(classifyEconomicNature({
      tipo_codigo: '50',
      objeto: 'Compra directa de terreno para ampliacion del cementerio'
    })).toBe('gasto');
  });

  it('classifies patrimonial sales, auctions, and demanial concessions as ingreso', () => {
    expect(classifyEconomicNature({
      tipo_codigo: '50',
      objeto: 'Venta de materiales procedentes de la clasificacion de residuos Comsermancha'
    })).toBe('ingreso');

    expect(classifyEconomicNature({
      tipo_codigo: '50',
      objeto: 'Enajenación y concesión de derecho de superficie de parcelas municipales'
    })).toBe('ingreso');

    expect(classifyEconomicNature({
      tipo_codigo: '50',
      objeto: 'Concesión administrativa del uso privativo de la vía pública para la gestión del Recinto Ferial'
    })).toBe('ingreso');

    expect(classifyEconomicNature({
      tipo_codigo: '50',
      objeto: 'Concesión de quiosco-bar para explotación hostelera en vía pública'
    })).toBe('ingreso');
  });

  it('classifies social housing and rural municipal leases as ingreso', () => {
    expect(classifyEconomicNature({
      tipo_codigo: '50',
      objeto: 'Arrendamiento de la vivienda sita en Calle Irlanda, cedida por la Junta de Comunidades al Ayuntamiento'
    })).toBe('ingreso');

    expect(classifyEconomicNature({
      tipo_codigo: '999',
      objeto: 'Arrendamiento de la vivienda sita en Calle Austria 7, cedida por la Junta de Comunidades al Ayuntamiento'
    })).toBe('ingreso');

    expect(classifyEconomicNature({
      tipo_codigo: '50',
      objeto: 'Arrendamiento de finca rústica de propiedad municipal situada en el Arroyo del Albardial'
    })).toBe('ingreso');
  });

  it('returns sin_clasificar for mixed titles matching both gasto and ingreso rules', () => {
    expect(classifyEconomicNature({
      tipo_codigo: '50',
      objeto: 'Adquisición directa y enajenación simultánea de terrenos municipales'
    })).toBe('sin_clasificar');

    expect(classifyEconomicNature({
      tipo_codigo: '50',
      objeto: 'Compra y venta de inmuebles patrimoniales'
    })).toBe('sin_clasificar');
  });

  it('returns sin_clasificar for code 50 without matching keywords', () => {
    expect(classifyEconomicNature({
      tipo_codigo: '50',
      objeto: 'Estudio técnico y delimitación geométrica de lindes patrimoniales'
    })).toBe('sin_clasificar');
  });

  it('returns sin_clasificar for leases not indicating municipal property or social housing', () => {
    expect(classifyEconomicNature({
      tipo_codigo: '50',
      objeto: 'Arrendamiento de naves industriales privadas para almacenamiento eventual'
    })).toBe('sin_clasificar');
  });

  it('returns sin_clasificar for code 21 (TRLCSP Gestión de Servicios Públicos) and code 40 (CPP)', () => {
    expect(classifyEconomicNature({ tipo_codigo: '21', objeto: 'Gestion de servicios de alumbrado' })).toBe('sin_clasificar');
    expect(classifyEconomicNature({ tipo_codigo: '40', objeto: 'Colaboracion publico privada para infraestructura' })).toBe('sin_clasificar');
  });

  it('avoids false positives with word boundaries on eventual, inventario, etc.', () => {
    // Eventual / almacenamiento eventual
    expect(classifyEconomicNature({
      tipo_codigo: '50',
      objeto: 'Arrendamiento eventual de nave industrial privada para ferias'
    })).toBe('sin_clasificar');

    // Inventario de bienes sin enajenación ni concesión
    expect(classifyEconomicNature({
      tipo_codigo: '50',
      objeto: 'Inventario y tasación de fincas rústicas municipales'
    })).toBe('sin_clasificar');
  });

  it('returns sin_clasificar for unknown or unexpected codes', () => {
    expect(classifyEconomicNature({
      tipo_codigo: '998',
      objeto: 'Contrato con codigo desconocido y ambiguo'
    })).toBe('sin_clasificar');

    expect(classifyEconomicNature({
      tipo_codigo: 'FOO',
      objeto: 'Contrato aleatorio'
    })).toBe('sin_clasificar');

    expect(classifyEconomicNature({
      tipo_codigo: null,
      objeto: 'Sin tipo'
    })).toBe('sin_clasificar');
  });

  it('resolves exceptions through the versioned exceptions table', () => {
    expect(classifyEconomicNature({
      id: 'https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/12143562',
      tipo_codigo: '50',
      objeto: 'Arrendamiento, por concurso, de Locales números 1, 2, 3 y 4 del Pasaje de la Plaza de España'
    })).toBe('ingreso');

    expect(classifyEconomicNature({
      placsp_id: '12143562',
      tipo_codigo: '50',
      objeto: 'Arrendamiento de locales municipales'
    })).toBe('ingreso');
  });

  it('classifies every database contract into a valid economic nature', () => {
    const rows = getDb().prepare('SELECT id, placsp_id, case_number AS expediente, object_description AS objeto, contract_type_code AS tipo_codigo, contract_type AS tipo_contrato FROM contracts').all() as any[];
    expect(rows.length).toBeGreaterThan(0);

    const allowed = new Set(['gasto', 'ingreso', 'concesion', 'sin_clasificar']);
    const counts = { gasto: 0, ingreso: 0, concesion: 0, sin_clasificar: 0 };

    for (const r of rows) {
      const classified = classifyEconomicNature(r);
      expect(allowed.has(classified)).toBe(true);
      counts[classified]++;

    }

    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(rows.length);

    const patrimonial = rows.filter(r => ['50', '999'].includes(String(r.tipo_codigo)));
    const patrimonialCounts = { gasto: 0, ingreso: 0, concesion: 0, sin_clasificar: 0 };
    for (const r of patrimonial) {
      patrimonialCounts[classifyEconomicNature(r)]++;
    }
    expect(Object.values(patrimonialCounts).reduce((sum, count) => sum + count, 0)).toBe(patrimonial.length);
  });
});


describe('Economic flow classification', () => {
  it('maps economic nature to the direction of municipal cash flow', () => {
    expect(getEconomicFlow('gasto')).toBe('paga');
    expect(getEconomicFlow('ingreso')).toBe('recibe');
    expect(getEconomicFlow('concesion')).toBe('sin_flujo_directo');
    expect(getEconomicFlow('sin_clasificar')).toBe('no_determinado');
    expect(getEconomicFlow(null)).toBe('no_determinado');
  });
});
