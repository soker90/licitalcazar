import { describe, it, expect } from 'vitest';
import {
  AUDITORIA_PERIODOS,
  CONTRATOS_EXTERNOS_CATALOGO,
  verificarDuplicidadFuente,
  getAuditoriaFuentesStats,
} from './fuentes-historicas';

describe('fuentes-historicas (Auditoría de Fuentes Pre-2018, JCCM y Diputación)', () => {
  it('documenta honestamente la ausencia de datos estructurados pre-2018', () => {
    const pre2018 = AUDITORIA_PERIODOS.find((p) => p.periodo.includes('Pre-LCSP'));
    expect(pre2018).toBeDefined();
    expect(pre2018?.estado).toBe('no_estructurada');
    expect(pre2018?.motivoJuridico).toContain('TRLCSP');
    expect(pre2018?.analisisTecnico).toContain('Alcázar');
  });

  it('documenta la cobertura completa desde la entrada en vigor de la LCSP en 2018', () => {
    const lcsp = AUDITORIA_PERIODOS.find((p) => p.anos.includes('2018'));
    expect(lcsp).toBeDefined();
    expect(lcsp?.estado).toBe('cobertura_completa');
    expect(lcsp?.motivoJuridico).toContain('Ley 9/2017');
    expect(lcsp?.fuentePrincipal).toContain('PLACSP');
  });

  it('clasifica contratos externos de JCCM y Diputación con impacto en Alcázar', () => {
    expect(CONTRATOS_EXTERNOS_CATALOGO.length).toBeGreaterThan(0);

    const fuentes = new Set(CONTRATOS_EXTERNOS_CATALOGO.map((c) => c.origenFuente));
    expect(fuentes.has('jccm_datos_abiertos')).toBe(true);
    expect(fuentes.has('diputacion_cr')).toBe(true);

    for (const c of CONTRATOS_EXTERNOS_CATALOGO) {
      expect(c.importe).toBeGreaterThan(0);
      expect(c.adjudicatario.length).toBeGreaterThan(0);
      expect(c.enteBeneficiario).toContain('Alcázar');
    }
  });

  it('detecta duplicidades por coincidencia de número de expediente', () => {
    const contratoExt = {
      expediente: 'EXP-MUNICIPAL-100',
      objeto: 'Obras de pavimentación',
      importe: 50000,
    };

    const contratosPlacsp = [
      {
        expediente: 'EXP-MUNICIPAL-100',
        objeto: 'Obras de pavimentación en Alcázar',
        importe_adjudicacion: 50000,
      },
      {
        expediente: 'OTRO-EXP-200',
        objeto: 'Suministro de papelería',
        importe_adjudicacion: 1200,
      },
    ];

    const dup = verificarDuplicidadFuente(contratoExt, contratosPlacsp);
    expect(dup.esDuplicado).toBe(true);
    expect(dup.expedienteCoincidente).toBe('EXP-MUNICIPAL-100');
  });

  it('detecta duplicidades por mismo NIF, importe idéntico y similitud de objeto', () => {
    const contratoExt = {
      expediente: 'EXT-DIPU-55',
      objeto: 'Pavimentación y reasfaltado de vías públicas en Alcázar de San Juan',
      importe: 215000.0,
      nifAdjudicatario: 'A13019872',
    };

    const contratosPlacsp = [
      {
        expediente: 'AYTO-2024-OBRAS-12',
        objeto: 'Plan de Obras Municipales 2024: Pavimentación y reasfaltado de vías públicas',
        importe_adjudicacion: 215000.0,
        nif_adjudicatario: 'A13019872',
      },
    ];

    const dup = verificarDuplicidadFuente(contratoExt, contratosPlacsp);
    expect(dup.esDuplicado).toBe(true);
    expect(dup.motivo).toContain('Coincidencia de adjudicatario');
  });

  it('no usa importes unitarios para deduplicar por coincidencia económica', () => {
    const contratoExt = {
      expediente: 'EXT-UNIT-01',
      objeto: 'Servicio de mantenimiento',
      importe: 450,
      nifAdjudicatario: 'B12345678',
    };

    const contratosPlacsp = [
      {
        expediente: 'AYTO-UNIT-01',
        objeto: 'Servicio de mantenimiento',
        importe_adjudicacion: 450,
        nif_adjudicatario: 'B12345678',
        award_amount_type: 'unitario' as const,
      },
    ];

    const dup = verificarDuplicidadFuente(contratoExt, contratosPlacsp);
    expect(dup.esDuplicado).toBe(false);
  });

  it('no marca falso positivo si el importe o contratista no coinciden', () => {
    const contratoExt = {
      expediente: 'SESCAM/2024/HMC-401',
      objeto: 'Mantenimiento de radiodiagnóstico en Hospital La Mancha Centro',
      importe: 485000,
      nifAdjudicatario: 'B82003815',
    };

    const contratosPlacsp = [
      {
        expediente: 'AYTO-2024-SUMINISTRO-01',
        objeto: 'Suministro de combustible municipal',
        importe_adjudicacion: 485000,
        nif_adjudicatario: 'A28000000', // distinto NIF
      },
    ];

    const dup = verificarDuplicidadFuente(contratoExt, contratosPlacsp);
    expect(dup.esDuplicado).toBe(false);
  });

  it('calcula estadísticas globales de fuentes externas correctamente', () => {
    const stats = getAuditoriaFuentesStats();

    expect(stats.totalExternos).toBe(CONTRATOS_EXTERNOS_CATALOGO.length);
    expect(stats.volumenTotalExternos).toBeGreaterThan(500000);
    expect(stats.desgloseFuentes.length).toBe(2);
    expect(stats.periodos.length).toBe(2);
  });
});
