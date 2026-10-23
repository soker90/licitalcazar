import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  parseDuration,
  calcularFechaFin,
  formatearDuracion,
  evaluarVigenciaContrato,
  evaluarEstadoContractual,
  determinarFechasContractuales,
  extraerFechaFinExplicita,
  ESTADO_CONTRACTUAL_LABELS,
  getContratosVivosStats,
} from './contratos-vivos';
import { getDb, getStats, getLicitacionById } from './db';
import { createGeneratedTestDb } from './test-db';

describe('parseDuration and formatearDuracion', () => {
  it('parses duration and units correctly', () => {
    expect(parseDuration('2', 'ANN')).toEqual({ val: 2, unit: 'ANN' });
    expect(parseDuration('12', 'MON')).toEqual({ val: 12, unit: 'MON' });
    expect(parseDuration('30', 'DAY')).toEqual({ val: 30, unit: 'DAY' });
    expect(parseDuration(null, 'MON')).toBeNull();
    expect(parseDuration('0', 'DAY')).toBeNull();
    expect(parseDuration('-5', 'ANN')).toBeNull();
  });

  it('formats duration into Spanish human-readable strings', () => {
    expect(formatearDuracion('1', 'ANN')).toBe('1 año');
    expect(formatearDuracion('2', 'ANN')).toBe('2 años');
    expect(formatearDuracion('1', 'MON')).toBe('1 mes');
    expect(formatearDuracion('6', 'MON')).toBe('6 meses');
    expect(formatearDuracion('15', 'DAY')).toBe('15 días');
    expect(formatearDuracion(null, null)).toBe('No especificada');
  });
});

describe('extraerFechaFinExplicita', () => {
  it('extrae fechas en texto jurídico en español', () => {
    expect(extraerFechaFinExplicita('... ampliación del plazo ... hasta el día 9 de enero de 2027 ...')).toBe('2027-01-09');
    expect(extraerFechaFinExplicita('Se amplía el plazo hasta 09/01/2027.')).toBe('2027-01-09');
    expect(extraerFechaFinExplicita('No se indica fecha final.')).toBeNull();
  });
});

describe('calcularFechaFin', () => {
  it('calculates future end date for ANN, MON, and DAY', () => {
    const d1 = calcularFechaFin('2024-01-01', '2', 'ANN');
    expect(d1?.toISOString().slice(0, 10)).toBe('2026-01-01');

    const d2 = calcularFechaFin('2025-06-15', '6', 'MON');
    expect(d2?.toISOString().slice(0, 10)).toBe('2025-12-15');

    const d3 = calcularFechaFin('2026-03-01', '10', 'DAY');
    expect(d3?.toISOString().slice(0, 10)).toBe('2026-03-11');

    // Invariance across daylight savings transitions (January to July crosses DST in CET/CEST)
    const d4 = calcularFechaFin('2026-01-01', '6', 'MON');
    expect(d4?.toISOString().slice(0, 10)).toBe('2026-07-01');
  });
});

describe('evaluarVigenciaContrato', () => {
  const refDate = new Date('2026-09-06');

  it('flags contract as proximo_vencimiento if expiring within 180 days', () => {
    // Contract awarded 2024-11-16 with duration 2 years -> ends 2026-11-16 (~71 days from 2026-09-06)
    const res = evaluarVigenciaContrato('2024-11-16', null, '2', 'ANN', 'Servicios', 'Abierto', refDate);
    expect(res.estadoVigencia).toBe('proximo_vencimiento');
    expect(res.diasRestantes).toBe(71);
    expect(res.esPlurianual).toBe(true);
    expect(res.esProrrogable).toBe(true);
  });

  it('flags contract as en_vigor if expiring after 180 days', () => {
    // Contract awarded 2026-01-01 with duration 4 years -> ends 2030-01-01
    const res = evaluarVigenciaContrato('2026-01-01', null, '4', 'ANN', 'Servicios', 'Abierto', refDate);
    expect(res.estadoVigencia).toBe('en_vigor');
    expect(res.diasRestantes).toBeGreaterThan(180);
    expect(res.esPlurianual).toBe(true);
    expect(res.esProrrogable).toBe(true);
  });

  it('flags contract as vencido if end date is in the past', () => {
    // Contract awarded 2022-01-01 with duration 1 year -> ended 2023-01-01
    const res = evaluarVigenciaContrato('2022-01-01', null, '1', 'ANN', 'Servicios', 'Abierto', refDate);
    expect(res.estadoVigencia).toBe('vencido');
    expect(res.diasRestantes).toBeLessThan(0);
  });

  it('recognizes menores cannot be prorrogables (Art. 118 LCSP)', () => {
    const res = evaluarVigenciaContrato('2026-08-01', null, '3', 'MON', 'Servicios', 'Contrato menor', refDate);
    expect(res.esProrrogable).toBe(false);
  });

  it('recognizes obras are not prorrogables like recurring services', () => {
    const res = evaluarVigenciaContrato('2026-08-01', null, '3', 'MON', 'Obras', 'Abierto simplificado', refDate);
    expect(res.esProrrogable).toBe(false);
  });

  it('does not treat published tender as en_vigor when not yet awarded', () => {
    // Tender in open procedure published 2026-08-06 with 2 years duration, but no award or formalization
    const res = evaluarVigenciaContrato(null, '2026-08-06', '2', 'ANN', 'Colaboración público-privada', 'Abierto', refDate, null, null, 'Publicada');
    expect(res.estadoVigencia).toBe('desconocido');
    expect(res.fechaFinEstimada).toBeNull();
    expect(res.diasRestantes).toBeNull();
  });

  it.each(['Cancelled', 'Canceled', 'Annulled', 'Withdrawn', 'Renounced'])(
    'does not project vigency for English terminal status %s',
    (status) => {
      const res = evaluarVigenciaContrato(
        '2026-01-01', '2025-12-01', '2', 'ANN', 'Servicios', 'Abierto',
        refDate, '2026-02-01', null, status,
      );

      expect(res.estadoVigencia).toBe('desconocido');
      expect(res.fechaFinEstimada).toBeNull();
      expect(res.fechaInicioEjecucion).toBeNull();
      expect(res.fechaInicioVigencia).toBeNull();
      expect(res.estadoContractual).toBe('anulada');
    }
  );

  it('classifies English Deserted status separately from cancellation', () => {
    const res = evaluarVigenciaContrato(
      '2026-01-01', '2025-12-01', '2', 'ANN', 'Servicios', 'Abierto',
      refDate, '2026-02-01', null, 'Deserted',
    );

    expect(res.estadoVigencia).toBe('desconocido');
    expect(res.fechaFinEstimada).toBeNull();
    expect(res.estadoContractual).toBe('desierta');
  });

  it('does not treat cancelled or deserted contracts as en_vigor', () => {
    const res = evaluarVigenciaContrato('2026-01-01', '2025-12-01', '2', 'ANN', 'Servicios', 'Abierto', refDate, null, null, 'Anulada');
    expect(res.estadoVigencia).toBe('desconocido');
    expect(res.fechaFinEstimada).toBeNull();
  });
});

describe('Modelo de estados contractuales y dictamen jurídico (evaluarEstadoContractual)', () => {
  const refDate = new Date('2026-09-06');

  // 1. Publicada
  it('identifies estado Publicada when tender has open bidding period', () => {
    const res = evaluarEstadoContractual({
      estado: 'Publicada',
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      fechaPublicacion: '2026-08-15',
      fechaLimitePresentacion: '2026-09-20',
      duracion: '12',
      duracionUnidad: 'MON',
      refDate,
    });

    expect(res.codigo).toBe('publicada');
    expect(res.label).toBe(ESTADO_CONTRACTUAL_LABELS.publicada);
    expect(res.label).toBe('Publicada');
    expect(res.fechaInicioEfectiva).toBeNull();
    expect(res.fechaFinEstimada).toBeNull();
    expect(res.diasRestantes).toBeNull();
  });

  // 2. En evaluación
  it('identifies estado En evaluación when bidding deadline expired without award', () => {
    const res = evaluarEstadoContractual({
      estado: 'En evaluación',
      procedimiento: 'Abierto simplificado',
      tipoContrato: 'Suministros',
      fechaPublicacion: '2026-07-01',
      fechaLimitePresentacion: '2026-07-25',
      duracion: '6',
      duracionUnidad: 'MON',
      refDate,
    });

    expect(res.codigo).toBe('en_evaluacion');
    expect(res.label).toBe(ESTADO_CONTRACTUAL_LABELS.en_evaluacion);
    expect(res.label).toBe('En evaluación');
    expect(res.fechaInicioEfectiva).toBeNull();
    expect(res.fechaFinEstimada).toBeNull();
  });

  // 3. Adjudicada sin formalizar
  it('identifies Adjudicado — pendiente de formalización and NEVER en vigor nor pendiente de adjudicación', () => {
    const res = evaluarEstadoContractual({
      estado: 'Adjudicada',
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      fechaPublicacion: '2026-05-01',
      fechaAdjudicacion: '2026-08-20',
      fechaFormalizacion: null,
      duracion: '2',
      duracionUnidad: 'ANN',
      refDate,
    });

    // Debe mostrar explícitamente "Adjudicado — pendiente de formalización"
    expect(res.codigo).toBe('adjudicada_pendiente_formalizacion');
    expect(res.label).toBe('Adjudicado — pendiente de formalización');
    
    // NO debe aparecer como "En vigor" ni como "Pendiente de adjudicación"
    expect(res.estadoVigencia).not.toBe('en_vigor');
    expect(res.estadoVigencia).toBe('pendiente_formalizacion');
    expect(res.label).not.toContain('Pendiente de adjudicación');
    expect(res.label).not.toContain('En vigor');

    // No debe haber iniciado materialmente la ejecución (Art. 153.6 LCSP)
    expect(res.fechaInicioEfectiva).toBeNull();
    expect(res.fechaFinEstimada).toBeNull();
    expect(res.diasRestantes).toBeNull();
  });

  // 4. Especialmente comprobar obras (Art. 237 LCSP)
  it('does NOT convert adjudicacion + duracion into material start for Obras without formalization and replanteo', () => {
    const res = evaluarEstadoContractual({
      estado: 'Adjudicada',
      procedimiento: 'Abierto',
      tipoContrato: 'Obras',
      fechaPublicacion: '2026-06-01',
      fechaAdjudicacion: '2026-08-10',
      fechaFormalizacion: null,
      duracion: '8',
      duracionUnidad: 'MON',
      refDate,
    });

    expect(res.codigo).toBe('adjudicada_pendiente_formalizacion');
    expect(res.label).toBe('Adjudicado — pendiente de formalización');
    expect(res.estadoVigencia).not.toBe('en_vigor');
    expect(res.fechaInicioEfectiva).toBeNull();
    expect(res.fechaFinEstimada).toBeNull();
    // Exige expresamente formalización y posterior acta de comprobación del replanteo
    expect(res.hitoInicioRequerido).toContain('replanteo');
    expect(res.observacionJuridica).toContain('Art. 237 LCSP');
  });

  it('documents replanteo requirement for formalized Obras', () => {
    const res = evaluarEstadoContractual({
      estado: 'Formalizada',
      procedimiento: 'Abierto',
      tipoContrato: 'Obras',
      fechaFormalizacion: '2026-07-01',
      duracion: '12',
      duracionUnidad: 'MON',
      refDate,
    });

    expect(res.codigo).toBe('formalizada_en_vigor');
    expect(res.hitoInicioRequerido).toContain('Acta de comprobación del replanteo (Art. 237 LCSP');
    expect(res.observacionJuridica).toContain('acta de replanteo (Art. 237 LCSP)');
  });

  // 5. Formalizada / En vigor
  it('identifies Formalizada / En vigor for active formalized contracts', () => {
    const res = evaluarEstadoContractual({
      estado: 'Formalizada',
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      fechaFormalizacion: '2026-01-01',
      duracion: '3',
      duracionUnidad: 'ANN',
      refDate,
    });

    expect(res.codigo).toBe('formalizada_en_vigor');
    expect(res.label).toBe('Formalizada / En vigor');
    expect(res.estadoVigencia).toBe('en_vigor');
    expect(res.diasRestantes).toBeGreaterThan(180);
    expect(res.fechaFinEstimada).toBe('2029-01-01');
  });

  // 6. Prorrogada
  it('identifies Prorrogada when contract has active extension or modification days', () => {
    const res = evaluarEstadoContractual({
      estado: 'Formalizada',
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      fechaFormalizacion: '2025-06-01',
      duracion: '1',
      duracionUnidad: 'ANN',
      prorrogaDias: 180,
      refDate,
    });

    expect(res.codigo).toBe('prorrogada');
    expect(res.label).toBe('Prorrogada');
    expect(res.duracionTexto).toContain('+180 días ampliados por modificación');
  });

  // 7. Vencida
  it('identifies Vencida when execution timeframe and extensions have passed', () => {
    const res = evaluarEstadoContractual({
      estado: 'Formalizada',
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      fechaFormalizacion: '2024-01-01',
      duracion: '1',
      duracionUnidad: 'ANN',
      refDate,
    });

    expect(res.codigo).toBe('vencida');
    expect(res.label).toBe('Vencida');
    expect(res.estadoVigencia).toBe('vencido');
    expect(res.diasRestantes).toBeLessThan(0);
  });

  // 8. Desierta
  it('identifies Desierta for tenders declared deserted', () => {
    const res = evaluarEstadoContractual({
      estado: 'Desierta',
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      fechaPublicacion: '2026-04-01',
      refDate,
    });

    expect(res.codigo).toBe('desierta');
    expect(res.label).toBe('Desierta');
    expect(res.fechaFinEstimada).toBeNull();
    expect(res.estadoVigencia).toBe('desconocido');
  });

  // 9. Anulada
  it('identifies Anulada for tenders cancelled or annulled', () => {
    const res = evaluarEstadoContractual({
      estado: 'Anulada',
      procedimiento: 'Abierto simplificado',
      tipoContrato: 'Suministros',
      fechaPublicacion: '2026-02-01',
      refDate,
    });

    expect(res.codigo).toBe('anulada');
    expect(res.label).toBe('Anulada');
    expect(res.fechaFinEstimada).toBeNull();
    expect(res.estadoVigencia).toBe('desconocido');
  });

  it.each(['Cancelled', 'Canceled', 'Annulled', 'Withdrawn', 'Renounced'])(
    'classifies English terminal status %s as annulled',
    (estado) => {
      const res = evaluarEstadoContractual({
        estado,
        procedimiento: 'Abierto',
        tipoContrato: 'Servicios',
        fechaPublicacion: '2025-01-10',
        fechaAdjudicacion: '2025-02-15',
        fechaFormalizacion: '2025-03-01',
        duracion: '12',
        duracionUnidad: 'MON',
        refDate,
      });

      expect(res.codigo).toBe('anulada');
      expect(res.estadoVigencia).toBe('desconocido');
      expect(res.fechaInicioEfectiva).toBeNull();
      expect(res.fechaFinEstimada).toBeNull();
      expect(res.diasRestantes).toBeNull();
      expect(res.fechas.fechaPerfeccion).toBeNull();
      expect(res.fechas.fechaInicioEjecucion).toBeNull();
      expect(res.fechas.fechaInicioVigencia).toBeNull();
    }
  );

  it('classifies English Deserted status as desierta', () => {
    const res = evaluarEstadoContractual({
      estado: 'Deserted',
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      fechaPublicacion: '2025-01-10',
      fechaAdjudicacion: '2025-02-15',
      fechaFormalizacion: '2025-03-01',
      duracion: '12',
      duracionUnidad: 'MON',
      refDate,
    });

    expect(res.codigo).toBe('desierta');
    expect(res.estadoVigencia).toBe('desconocido');
    expect(res.fechaInicioEfectiva).toBeNull();
    expect(res.fechaFinEstimada).toBeNull();
    expect(res.diasRestantes).toBeNull();
    expect(res.fechas.fechaPerfeccion).toBeNull();
    expect(res.fechas.fechaInicioEjecucion).toBeNull();
    expect(res.fechas.fechaInicioVigencia).toBeNull();
  });

  it.each(['Resuelta', 'Resolved'])(
    'classifies resolved-without-award status %s as terminal and without execution',
    (estado) => {
      const res = evaluarEstadoContractual({
        estado,
        procedimiento: 'Abierto',
        tipoContrato: 'Servicios',
        fechaPublicacion: '2025-01-10',
        fechaAdjudicacion: null,
        fechaFormalizacion: null,
        importeAdjudicacion: null,
        duracion: '12',
        duracionUnidad: 'MON',
        refDate,
      });

      expect(res.codigo).toBe('resuelta_sin_adjudicar');
      expect(res.label).toBe('Resuelta sin adjudicar');
      expect(res.estadoVigencia).toBe('desconocido');
      expect(res.fechaInicioEfectiva).toBeNull();
      expect(res.fechaFinEstimada).toBeNull();
      expect(res.diasRestantes).toBeNull();
      expect(res.fechas.fechaPerfeccion).toBeNull();
      expect(res.fechas.fechaInicioEjecucion).toBeNull();
      expect(res.fechas.fechaInicioVigencia).toBeNull();
      expect(res.esProrrogable).toBe(false);
    }
  );

  it('does not infer formalization from Resuelta when an award exists but the formalization date is absent', () => {
    const res = evaluarEstadoContractual({
      estado: 'Resuelta',
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      fechaPublicacion: '2025-01-10',
      fechaAdjudicacion: '2025-02-15',
      fechaFormalizacion: null,
      importeAdjudicacion: 12000,
      duracion: '12',
      duracionUnidad: 'MON',
      refDate,
    });

    expect(res.codigo).toBe('adjudicada_pendiente_formalizacion');
    expect(res.estadoVigencia).toBe('pendiente_formalizacion');
    expect(res.fechaInicioEfectiva).toBeNull();
    expect(res.fechaFinEstimada).toBeNull();
    expect(res.fechas.fechaPerfeccion).toBeNull();
  });

  // 10. Menor publicado a posteriori (Art. 63.4 LCSP)
  it('handles minor contracts published ex-post (menor publicado a posteriori) validly', () => {
    // Contrato menor adjudicado el 2026-05-01 y publicado trimestralmente el 2026-07-01
    const res = evaluarEstadoContractual({
      estado: 'Resuelta',
      procedimiento: 'Contrato menor',
      tipoContrato: 'Servicios',
      fechaAdjudicacion: '2026-05-01',
      fechaPublicacion: '2026-07-01',
      duracion: '6',
      duracionUnidad: 'MON',
      refDate,
    });

    expect(res.esMenorPublicadoPosteriori).toBe(true);
    // En contratos menores la formalización administrativa no es exigida (Art. 118 LCSP)
    expect(res.codigo).toBe('formalizada_en_vigor');
    expect(res.fechaInicioEfectiva).toBe('2026-05-01');
    expect(res.fechaFinEstimada).toBe('2026-11-01');
    expect(res.diasRestantes).toBeGreaterThan(0);
  });
});

describe('Cálculo de duración mensual al final de mes', () => {
  it('clamps one month from January 31 to February end instead of overflowing into March', () => {
    expect(calcularFechaFin('2026-01-31', '1', 'MON')?.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('clamps one month from leap-day to the end of February', () => {
    expect(calcularFechaFin('2028-01-31', '1', 'MON')?.toISOString().slice(0, 10)).toBe('2028-02-29');
  });
});

describe('Cálculo de duración anual fraccionaria al final de mes', () => {
  it('clamps 18 months from August 31 to the end of February instead of overflowing into March', () => {
    expect(calcularFechaFin('2025-08-31', '1.5', 'ANN')?.toISOString().slice(0, 10)).toBe('2027-02-28');
  });

  it('preserves the original day when 18 months from a leap day ends in a month with that day', () => {
    expect(calcularFechaFin('2024-02-29', '1.5', 'ANN')?.toISOString().slice(0, 10)).toBe('2025-08-29');
  });
});

describe('Cálculo de duración anual en años bisiestos', () => {
  it('clamps February 29 to February 28 when adding one year to a non-leap year', () => {
    expect(calcularFechaFin('2028-02-29', '1', 'ANN')?.toISOString().slice(0, 10)).toBe('2029-02-28');
  });
});

describe('Distinción de Fechas Contractuales: Perfección, Formalización, Inicio Ejecución, Publicación e Inicio Vigencia', () => {
  const refDate = new Date('2026-09-06');

  // 1. Contrato ordinario formalizado
  it('differentiates dates for a regular formalized contract', () => {
    const res = evaluarVigenciaContrato(
      '2026-02-15', // fechaAdjudicacion
      '2026-01-10', // fechaPublicacion
      '1',          // duracion
      'ANN',        // duracionUnidad
      'Servicios',  // tipoContrato
      'Abierto',    // procedimiento
      refDate,
      '2026-03-01'  // fechaFormalizacion
    );

    expect(res.fechaPerfeccion).toBe('2026-03-01'); // Art. 36.1 LCSP: se perfecciona con su formalización
    expect(res.fechaFormalizacion).toBe('2026-03-01');
    expect(res.fechaInicioEjecucion).toBe('2026-03-01');
    expect(res.fechaPublicacion).toBe('2026-01-10');
    expect(res.fechaInicioVigencia).toBe('2026-03-01');
    expect(res.fechaFinEstimada).toBe('2027-03-01');
    expect(res.estadoContractual).toBe('formalizada_en_vigor');
  });

  // 2. Contrato menor (diferenciando expediente/perfección, publicación posterior e inicio real)
  it('differentiates dates for a minor contract with explicit start date (perfección vs publicación posterior vs inicio específico)', () => {
    const fechas = determinarFechasContractuales({
      procedimiento: 'Contrato menor',
      tipoContrato: 'Servicios',
      fechaAdjudicacion: '2026-04-10',
      fechaInicioEjecucion: '2026-04-15',
      fechaPublicacion: '2026-07-01', // Publicación trimestral ex-post en PLACSP
      duracion: '3',
      duracionUnidad: 'MON',
      refDate,
    });

    // Perfección: no inferir automáticamente desde fecha_adjudicacion si no consta explícitamente ese hito
    expect(fechas.fechaPerfeccion).toBeNull();
    // Formalización: no requerida en contratos menores (Art. 153.1 LCSP)
    expect(fechas.fechaFormalizacion).toBeNull();
    // Inicio material: fecha contractual/orden específica cuando conste
    expect(fechas.fechaInicioEjecucion).toBe('2026-04-15');
    // Publicación: deber de publicidad activa trimestral en PLACSP
    expect(fechas.fechaPublicacion).toBe('2026-07-01');
    // Inicio de vigencia: utiliza la fecha de inicio contractual explícita
    expect(fechas.fechaInicioVigencia).toBe('2026-04-15');
    expect(fechas.etiquetaInicioVigencia).toBe('contractual explícita');
    expect(fechas.esFechaInicioEstimada).toBe(false);

    const vig = evaluarVigenciaContrato(
      '2026-04-10',
      '2026-07-01',
      '3',
      'MON',
      'Servicios',
      'Contrato menor',
      refDate,
      null,
      null,
      'Resuelta',
      false,
      null,
      '2026-04-15' // fechaInicioEjecucion
    );
    expect(vig.fechaPerfeccion).toBeNull();
    expect(vig.fechaInicioVigencia).toBe('2026-04-15');
    expect(vig.fechaFinEstimada).toBe('2026-07-15');
    expect(vig.etiquetaInicioVigencia).toBe('contractual explícita');
    expect(vig.esFechaInicioEstimada).toBe(false);
  });

  it('labels minor contract operative start as "estimada según datos disponibles" when no explicit start date is recorded', () => {
    const fechas = determinarFechasContractuales({
      procedimiento: 'Contrato menor',
      tipoContrato: 'Servicios',
      fechaAdjudicacion: '2026-04-10',
      fechaPublicacion: '2026-07-01', // Publicación posterior trimestral
      duracion: '3',
      duracionUnidad: 'MON',
      refDate,
    });

    expect(fechas.fechaPerfeccion).toBeNull();
    expect(fechas.fechaFormalizacion).toBeNull();
    expect(fechas.fechaInicioEjecucion).toBeNull();
    expect(fechas.fechaPublicacion).toBe('2026-07-01');
    // En ausencia de fecha explícita, usa la fecha operativa de adjudicación/encargo pero la etiqueta como estimada
    expect(fechas.fechaInicioVigencia).toBe('2026-04-10');
    expect(fechas.etiquetaInicioVigencia).toBe('estimada según datos disponibles');
    expect(fechas.esFechaInicioEstimada).toBe(true);

    const vig = evaluarVigenciaContrato(
      '2026-04-10',
      '2026-07-01',
      '3',
      'MON',
      'Servicios',
      'Contrato menor',
      refDate,
      null,
      null,
      'Resuelta'
    );
    expect(vig.fechaPerfeccion).toBeNull();
    expect(vig.fechaInicioEjecucion).toBeNull();
    expect(vig.fechaInicioVigencia).toBe('2026-04-10');
    expect(vig.etiquetaInicioVigencia).toBe('estimada según datos disponibles');
    expect(vig.esFechaInicioEstimada).toBe(true);
    expect(vig.fechaFinEstimada).toBe('2026-07-10');
  });

  it('proves that ex-post publication date of a minor contract NEVER alters the estimated or contractual start date nor end date', () => {
    // 1. Contrato menor evaluado SIN fecha de publicación
    const vigSinPublicacion = evaluarVigenciaContrato(
      '2026-04-10',
      null,
      '3',
      'MON',
      'Servicios',
      'Contrato menor',
      refDate,
      null,
      null,
      'Resuelta'
    );

    // 2. Mismo contrato menor con fecha de publicación 3 meses posterior (trimestral PLACSP)
    const vigPublicacion3Meses = evaluarVigenciaContrato(
      '2026-04-10',
      '2026-07-15',
      '3',
      'MON',
      'Servicios',
      'Contrato menor',
      refDate,
      null,
      null,
      'Resuelta'
    );

    // 3. Mismo contrato menor con fecha de publicación 1 año posterior
    const vigPublicacion1Ano = evaluarVigenciaContrato(
      '2026-04-10',
      '2027-04-10',
      '3',
      'MON',
      'Servicios',
      'Contrato menor',
      refDate,
      null,
      null,
      'Resuelta'
    );

    // La fecha de inicio de vigencia es idéntica en todos los casos
    expect(vigPublicacion3Meses.fechaInicioVigencia).toBe('2026-04-10');
    expect(vigPublicacion3Meses.fechaInicioVigencia).toBe(vigSinPublicacion.fechaInicioVigencia);
    expect(vigPublicacion1Ano.fechaInicioVigencia).toBe(vigSinPublicacion.fechaInicioVigencia);

    // La fecha de fin estimada es idéntica en todos los casos y no se desplaza por la publicación
    expect(vigPublicacion3Meses.fechaFinEstimada).toBe('2026-07-10');
    expect(vigPublicacion3Meses.fechaFinEstimada).toBe(vigSinPublicacion.fechaFinEstimada);
    expect(vigPublicacion1Ano.fechaFinEstimada).toBe(vigSinPublicacion.fechaFinEstimada);

    // Mismo comportamiento cuando existe fecha de inicio contractual explícita
    const vigExplConPub = evaluarVigenciaContrato(
      '2026-04-10',
      '2026-09-01',
      '2',
      'MON',
      'Servicios',
      'Contrato menor',
      refDate,
      null,
      null,
      'Resuelta',
      false,
      null,
      '2026-04-20' // contractual explícita
    );
    const vigExplSinPub = evaluarVigenciaContrato(
      '2026-04-10',
      null,
      '2',
      'MON',
      'Servicios',
      'Contrato menor',
      refDate,
      null,
      null,
      'Resuelta',
      false,
      null,
      '2026-04-20'
    );
    expect(vigExplConPub.fechaInicioVigencia).toBe('2026-04-20');
    expect(vigExplConPub.fechaInicioVigencia).toBe(vigExplSinPub.fechaInicioVigencia);
    expect(vigExplConPub.fechaFinEstimada).toBe(vigExplSinPub.fechaFinEstimada);
  });

  it('never uses fecha_publicacion as fechaInicioVigencia for minor contracts even if it is the only date recorded', () => {
    const fechas = determinarFechasContractuales({
      procedimiento: 'Contrato menor',
      tipoContrato: 'Servicios',
      fechaPublicacion: '2026-07-01',
      duracion: '3',
      duracionUnidad: 'MON',
      refDate,
    });

    expect(fechas.fechaInicioVigencia).toBeNull();
    expect(fechas.fechaInicioEjecucion).toBeNull();
    expect(fechas.fechaPerfeccion).toBeNull();
    expect(fechas.fechaPublicacion).toBe('2026-07-01');

    const vig = evaluarVigenciaContrato(
      null, // sin adjudicación
      '2026-07-01', // solo publicación posterior
      '3',
      'MON',
      'Servicios',
      'Contrato menor',
      refDate
    );

    expect(vig.fechaInicioVigencia).toBeNull();
    expect(vig.fechaFinEstimada).toBeNull();
    expect(vig.estadoVigencia).toBe('desconocido');
  });

  it('preserves explicit perfection date in minor contracts when explicitly passed', () => {
    const fechas = determinarFechasContractuales({
      procedimiento: 'Contrato menor',
      tipoContrato: 'Servicios',
      fechaAdjudicacion: '2026-04-10',
      fechaPerfeccion: '2026-04-12', // hito explícito de perfección/conformidad
      duracion: '3',
      duracionUnidad: 'MON',
      refDate,
    });

    expect(fechas.fechaPerfeccion).toBe('2026-04-12');
  });

  // 3. Contrato basado en acuerdo marco
  it('differentiates dates for a contract based on a framework agreement (Art. 36.3 LCSP)', () => {
    const fechas = determinarFechasContractuales({
      procedimiento: 'Contrato basado en acuerdo marco',
      tipoContrato: 'Servicios',
      fechaAdjudicacion: '2026-05-02',
      fechaInicioEjecucion: '2026-06-01', // Estipulada en pliegos/orden de entrega
      duracion: '6',
      duracionUnidad: 'MON',
      refDate,
    });

    // Art. 36.3 LCSP: la adjudicación perfecciona el contrato basado
    expect(fechas.fechaPerfeccion).toBe('2026-05-02');
    expect(fechas.fechaFormalizacion).toBeNull();
    // No asume automáticamente que adjudicación = inicio material: usa fecha contractual de pliegos
    expect(fechas.fechaInicioEjecucion).toBe('2026-06-01');
    expect(fechas.fechaInicioVigencia).toBe('2026-06-01');

    const evalVig = evaluarVigenciaContrato(
      '2026-05-02',
      null,
      '6',
      'MON',
      'Servicios',
      'Contrato basado en acuerdo marco',
      refDate,
      null,
      null,
      'Resuelta',
      false,
      null,
      '2026-06-01'
    );
    expect(evalVig.fechaPerfeccion).toBe('2026-05-02');
    expect(evalVig.fechaInicioEjecucion).toBe('2026-06-01');
    expect(evalVig.fechaFinEstimada).toBe('2026-12-01');
  });

  // 4. Contrato específico en el marco de un SDA (Sistema Dinámico de Adquisición)
  it('differentiates dates for a specific contract under a dynamic purchasing system (SDA)', () => {
    const fechas = determinarFechasContractuales({
      procedimiento: 'Contrato específico en el marco de un sistema dinámico de adquisición (SDA)',
      tipoContrato: 'Suministros',
      fechaAdjudicacion: '2026-05-15',
      duracion: '12',
      duracionUnidad: 'MON',
      refDate,
    });

    // Art. 36.3 LCSP: se perfecciona con su adjudicación
    expect(fechas.fechaPerfeccion).toBe('2026-05-15');
    expect(fechas.fechaFormalizacion).toBeNull();
    // En ausencia de fecha de orden previa, la adjudicación opera como vigencia supletoria al estar perfeccionado
    expect(fechas.fechaInicioVigencia).toBe('2026-05-15');
  });

  // 5. Contrato de obras (Art. 237 LCSP: vinculación preceptiva al acta de replanteo)
  it('differentiates dates for works contract vinculating material start to acta de replanteo', () => {
    const fechas = determinarFechasContractuales({
      procedimiento: 'Abierto',
      tipoContrato: 'Obras',
      fechaAdjudicacion: '2026-03-01',
      fechaFormalizacion: '2026-03-20',
      fechaActaReplanteo: '2026-04-10', // Acta de comprobación del replanteo (Art. 237 LCSP)
      duracion: '6',
      duracionUnidad: 'MON',
      refDate,
    });

    expect(fechas.fechaPerfeccion).toBe('2026-03-20');
    expect(fechas.fechaFormalizacion).toBe('2026-03-20');
    // El inicio material de ejecución vincula preceptivamente al acta de replanteo, no a la adjudicación
    expect(fechas.fechaInicioEjecucion).toBe('2026-04-10');
    expect(fechas.fechaInicioEjecucion).not.toBe('2026-03-01');
    expect(fechas.fechaInicioVigencia).toBe('2026-04-10');

    const vig = evaluarVigenciaContrato(
      '2026-03-01',
      null,
      '6',
      'MON',
      'Obras',
      'Abierto',
      refDate,
      '2026-03-20',
      null,
      'Formalizada',
      false,
      null,
      null,
      '2026-04-10' // fechaActaReplanteo
    );
    expect(vig.fechaInicioEjecucion).toBe('2026-04-10');
    expect(vig.fechaInicioVigencia).toBe('2026-04-10');
    expect(vig.fechaFinEstimada).toBe('2026-10-10');
  });

  // 6. Adjudicado sin formalizar (prohibición de inicio material, Art. 153.6 LCSP)
  it('handles adjudicado sin formalizar with null execution and vigencia dates', () => {
    const fechas = determinarFechasContractuales({
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      estado: 'Adjudicada',
      fechaAdjudicacion: '2026-08-15',
      fechaFormalizacion: null,
      duracion: '1',
      duracionUnidad: 'ANN',
      refDate,
    });

    // En contrato ordinario sin formalización no hay perfección formal completada (Art. 36.1 LCSP)
    expect(fechas.fechaPerfeccion).toBeNull();
    expect(fechas.fechaFormalizacion).toBeNull();
    // Art. 153.6 LCSP: no puede iniciarse la ejecución
    expect(fechas.fechaInicioEjecucion).toBeNull();
    expect(fechas.fechaInicioVigencia).toBeNull();

    const vig = evaluarVigenciaContrato(
      '2026-08-15',
      null,
      '1',
      'ANN',
      'Servicios',
      'Abierto',
      refDate,
      null,
      null,
      'Adjudicada'
    );
    expect(vig.fechaInicioVigencia).toBeNull();
    expect(vig.fechaFinEstimada).toBeNull();
    expect(vig.diasRestantes).toBeNull();
    expect(vig.estadoVigencia).toBe('pendiente_formalizacion');
  });

  // 7. Prorrogado
  it('differentiates dates for a prorrogated contract', () => {
    const fechas = determinarFechasContractuales({
      procedimiento: 'Abierto',
      tipoContrato: 'Servicios',
      estado: 'Formalizada',
      fechaFormalizacion: '2025-06-01',
      duracion: '1',
      duracionUnidad: 'ANN',
      prorrogaDias: 180,
      refDate,
    });

    expect(fechas.fechaPerfeccion).toBe('2025-06-01');
    expect(fechas.fechaFormalizacion).toBe('2025-06-01');
    expect(fechas.fechaInicioVigencia).toBe('2025-06-01');

    const vig = evaluarVigenciaContrato(
      null,
      null,
      '1',
      'ANN',
      'Servicios',
      'Abierto',
      refDate,
      '2025-06-01',
      180,
      'Formalizada'
    );
    expect(vig.estadoContractual).toBe('prorrogada');
    expect(vig.fechaFinEstimada).toBe('2026-11-28');
  });
});

describe('getContratosVivosStats (Issue #13)', () => {
  it('no cuenta el PBL como volumen vivo cuando falta el importe de adjudicación', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY, case_number TEXT, object_description TEXT, contract_type TEXT,
        procedure TEXT, contracting_authority_name TEXT, awardee TEXT, awardee_nif TEXT,
        award_amount_type TEXT, awarded_amount REAL, amount_excl_vat REAL, award_date TEXT,
        formalization_date TEXT, publication_date TEXT, duration TEXT, duration_unit TEXT,
        scope TEXT, status TEXT
      );
      CREATE TABLE modifications (
        contract_id TEXT, reason TEXT, modification_date TEXT, modification_number INTEGER,
        duration_days REAL, duration_months REAL
      );
      CREATE TABLE contract_lots (
        id TEXT PRIMARY KEY, contract_id TEXT, lot_number TEXT, lot_name TEXT,
        awardee TEXT, awardee_nif TEXT, lot_status TEXT
      );
    `);
    const insert = db.prepare(`
      INSERT INTO contracts (
        id, case_number, object_description, contract_type, procedure,
        contracting_authority_name, awardee, awardee_nif, award_amount_type,
        awarded_amount, amount_excl_vat, award_date, formalization_date,
        publication_date, duration, duration_unit, scope, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run('pbl-only','EXP-PBL','Contrato con adjudicación desconocida','Servicios','Abierto','Ayuntamiento','Empresa PBL','B00000001','total',null,10000,'2026-01-01','2026-01-02','2026-01-03','2','ANN','Directa Municipal','Formalizada');
    insert.run('awarded','EXP-ADJ','Contrato con adjudicación conocida','Servicios','Abierto','Ayuntamiento','Empresa adjudicataria','B00000002','total',4000,8000,'2026-01-01','2026-01-02','2026-01-03','2','ANN','Directa Municipal','Formalizada');

    const stats = getContratosVivosStats(() => db, undefined, new Date('2026-09-06'));

    expect(stats.kpis.totalVivos).toBe(2);
    expect(stats.kpis.volumenVivoTotal).toBe(4000);
    expect(stats.todosVivos.find((c) => c.id === 'pbl-only')?.amount).toBe(0);
    expect(stats.todosVivos.find((c) => c.id === 'awarded')?.amount).toBe(4000);

    db.close();
  });


  it('rechaza cobertura de lot_awards con la misma cardinalidad pero lotes distintos', () => {
    const db = createGeneratedTestDb(20261001, 1);
    const contractId = 'generated-20261001-1';

    db.prepare(`UPDATE contracts
      SET year = 2026, status = 'Formalizada', award_amount_type = 'total',
          awarded_amount = NULL, awardee = 'Varios adjudicatarios',
          award_date = '2026-01-01', formalization_date = '2026-01-02',
          publication_date = '2026-02-01', duration = '12', duration_unit = 'MON'
      WHERE id = ?`).run(contractId);

    const insertLot = db.prepare(`INSERT INTO contract_lots (
      id, contract_id, lot_number, lot_name, awarded_amount, awardee, lot_status, award_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertLot.run('vivos-set-lot-1', contractId, '1', 'Lote 1', 6000, 'Empresa Lote 1', 'Adjudicado', '2026-01-01');
    insertLot.run('vivos-set-lot-2', contractId, '2', 'Lote 2', 4000, 'Empresa Lote 2', 'Adjudicado', '2026-01-01');

    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertAward.run('vivos-set-award-1', contractId, 'GEN/2026/1', '1', 0, 'Empresa Award 1', 3500, 'Adjudicado');
    insertAward.run('vivos-set-award-3', contractId, 'GEN/2026/1', '3', 0, 'Empresa Award 3', 2500, 'Adjudicado');

    try {
      const stats = getContratosVivosStats(() => db, undefined, new Date('2026-09-06'));
      const contrato = stats.todosVivos.find((item) => item.id === contractId);
      expect(contrato).toBeDefined();
      expect(contrato?.amount).toBe(10000);
      expect(contrato?.awardee).toBe('Empresa Lote 1,Empresa Lote 2');
    } finally {
      db.close();
    }
  });

  it('computes live contracts KPIs on current database', () => {
    const stats = getContratosVivosStats(getDb, undefined, new Date('2026-09-06'));

    expect(stats.kpis).toBeDefined();
    expect(stats.kpis.totalVivos).toBeGreaterThan(100);
    expect(stats.kpis.volumenVivoTotal).toBeGreaterThan(10000000);
    expect(stats.kpis.vencenEn6Meses).toBeGreaterThan(30);
    expect(stats.kpis.vencenEn30Dias).toBeGreaterThan(5);
    expect(stats.kpis.plurianualesVivos).toBeGreaterThan(50);
  });

  it('orders contracts by nearest expiration date first', () => {
    const stats = getContratosVivosStats(getDb, undefined, new Date('2026-09-06'));
    const items = stats.proximosVencimientos6Meses;

    expect(items.length).toBeGreaterThan(0);
    for (let i = 1; i < items.length; i++) {
      expect((items[i].diasRestantes ?? 0)).toBeGreaterThanOrEqual(items[i - 1].diasRestantes ?? 0);
    }
  });

  it('supports filtering by ambito', () => {
    const statsDirecta = getContratosVivosStats(getDb, 'directa', new Date('2026-09-06'));
    const statsComser = getContratosVivosStats(getDb, 'mancomunidad', new Date('2026-09-06'));

    expect(statsDirecta.kpis.totalVivos).toBeGreaterThan(0);
    expect(statsComser.kpis.totalVivos).toBeGreaterThan(0);

    for (const c of statsDirecta.todosVivos) {
      expect(c.organo).not.toContain('COMSERMANCHA');
    }
    for (const c of statsComser.todosVivos) {
      expect(c.organo).toContain('COMSERMANCHA');
    }
  });

  it('is integrated into global getStats', () => {
    const stats = getStats();
    expect(stats.contratosVivos).toBeDefined();
    expect(stats.contratosVivos.kpis.totalVivos).toBeGreaterThan(0);
    expect(stats.contratosVivos.proximosVencimientos6Meses.length).toBeGreaterThan(0);
  });

  it('attaches vigencia to getLicitacionById', () => {
    // Pick an active contract
    const stats = getContratosVivosStats(getDb, undefined, new Date('2026-09-06'));
    const activeOne = stats.proximosVencimientos6Meses[0];
    expect(activeOne).toBeDefined();

    const detail = getLicitacionById(activeOne.id);
    expect(detail).toBeDefined();
    expect((detail as any).vigencia).toBeDefined();
    expect((detail as any).vigencia.estadoVigencia).toBeDefined();
    expect((detail as any).vigencia.duracionTexto).toBeTruthy();
  });

  it('verifies that tender 20262640 in bidding phase does not have active execution vigencia', () => {
    const lic = getLicitacionById('20262640');
    expect(lic).toBeDefined();
    expect(lic?.estado).toBe('Publicada');
    expect((lic as any).vigencia.estadoVigencia).toBe('desconocido');
    expect((lic as any).vigencia.fechaFinEstimada).toBeNull();
  });
});


describe('fecha final explícita de modificación', () => {
  it('prioriza una fecha final explícita sobre la suma de duración y prórroga', () => {
    const res = evaluarEstadoContractual({
      estado: 'Formalizada',
      procedimiento: 'Abierto',
      tipoContrato: 'Obras',
      fechaFormalizacion: '2025-08-21',
      duracion: '8',
      duracionUnidad: 'MON',
      prorrogaDias: 240,
      fechaFinExplicita: '2027-01-09',
      refDate: new Date('2026-09-20'),
    });

    expect(res.fechaFinEstimada).toBe('2027-01-09');
  });
});

describe('Contratos Vivos: fecha de inicio mostrada', () => {
  it('uses formalization as displayed start when it is the effective vigencia start', () => {
    const db = createGeneratedTestDb(20261001, 1);
    db.prepare(`UPDATE contracts
      SET status = 'Formalizada',
          award_date = '2026-01-10',
          formalization_date = '2026-03-01',
          duration = '12',
          duration_unit = 'MON',
          award_amount_type = 'total',
          awarded_amount = 5000,
          awardee = 'Empresa Test'
      WHERE id = 'generated-20261001-1'`).run();

    const stats = getContratosVivosStats(() => db, undefined, new Date('2026-06-01'));
    const contrato = stats.todosVivos.find((item) => item.id === 'generated-20261001-1');

    expect(contrato?.fechaInicio).toBe('2026-03-01');
    expect(contrato?.fechaFinEstimada).toBe('2027-03-01');
    db.close();
  });
});


describe('Contratos Vivos: prórrogas estructuradas en modificaciones', () => {
  it('applies duration_days from a synced modification when calculating the live end date', () => {
    const db = createGeneratedTestDb(20261008, 1);
    const contractId = 'generated-20261008-1';

    db.prepare(`UPDATE contracts
      SET status = 'Formalizada',
          award_date = '2025-01-01',
          formalization_date = '2026-01-01',
          duration = '6',
          duration_unit = 'MON',
          award_amount_type = 'total',
          awarded_amount = 5000,
          awardee = 'Empresa Test'
      WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO modifications (
      id, contract_id, modification_number, modification_date, reason,
      modification_type, duration_value, duration_unit, duration_months, duration_days
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'mod-extension-1',
      contractId,
      1,
      '2026-06-15',
      'Ampliación de plazo',
      'Ampliación de plazo',
      6,
      'MON',
      6,
      180
    );

    try {
      const stats = getContratosVivosStats(() => db, undefined, new Date('2026-09-06'));
      const contrato = stats.todosVivos.find((item) => item.id === contractId);

      expect(contrato).toBeDefined();
      expect(contrato?.fechaFinEstimada).toBe('2026-12-28');
      expect(contrato?.diasRestantes).toBeGreaterThan(100);
    } finally {
      db.close();
    }
  });
});
