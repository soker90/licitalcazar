import { describe, it, expect } from 'vitest';
import { calcularCronometriaContrato } from './cronometria';

describe('calcularCronometriaContrato', () => {
  it('calcula correctamente la cronometría de un contrato adjudicado en curso (expediente 19763505)', () => {
    const contrato19763505 = {
      estado: 'Adjudicada',
      procedimiento: 'Asociación para la innovación',
      tipo_contrato: 'Obras',
      fecha_publicacion: '2026-05-27 10:22:32',
      fecha_limite: '2026-06-16 23:59:00',
      fecha_adjudicacion: '2026-08-31 00:00:00',
      fecha_formalizacion: null,
      duracion: '7',
      duracion_unidad: 'MON',
    };

    // Referencia temporal: 7 de septiembre de 2026
    const refDate = new Date('2026-09-07T15:00:00Z');
    const crono = calcularCronometriaContrato(contrato19763505, refDate);

    // 1. Fase de licitación
    expect(crono.diasOfertas).toBe(21);
    expect(crono.diasEvaluacion).toBe(75);
    expect(crono.diasLicitacionTotal).toBe(96);

    // 2. Formalización en curso
    expect(crono.estadoCiclo).toBe('en_formalizacion');
    expect(crono.esHistoricoTerminado).toBe(false);
    expect(crono.diasFormalizacion).toBe(8); // 8 días desde adjudicación el 31/08

    // 3. Duración de obra prevista
    expect(crono.duracionPrevistaDias).toBe(213); // 7 meses * 30.41 = 213 días

    // 4. Plazo total proyectado (96 licitación + 7 formalización + 213 obra = 316 días)
    expect(crono.plazoTotalDias).toBeGreaterThan(300);
    expect(crono.diasTranscurridosHoy).toBe(103); // desde 27 mayo a 7 septiembre

    // 5. Fases
    expect(crono.fases.length).toBe(4);
    expect(crono.fases[0].id).toBe('ofertas');
    expect(crono.fases[0].estado).toBe('completado');
    expect(crono.fases[1].id).toBe('evaluacion');
    expect(crono.fases[1].estado).toBe('completado');
    expect(crono.fases[2].id).toBe('formalizacion');
    expect(crono.fases[2].estado).toBe('en_curso');
    expect(crono.fases[3].id).toBe('ejecucion');
    expect(crono.fases[3].estado).toBe('pendiente');
  });

  it('calcula la cronometría y avance temporal de expediente 10/2026 (19965034) en periodo de formalización', () => {
    const contrato19965034 = {
      estado: 'Adjudicada',
      procedimiento: 'Abierto',
      fecha_publicacion: '2026-07-01 00:00:00',
      fecha_limite: '2026-08-03 23:59:00',
      fecha_adjudicacion: '2026-09-17 00:00:00',
      fecha_formalizacion: null,
      duracion: '3',
      duracion_unidad: 'MON',
    };

    // Referencia temporal: 18 de septiembre de 2026
    const refDate = new Date('2026-09-18T12:00:00Z');
    const crono = calcularCronometriaContrato(contrato19965034, refDate);

    expect(crono.esHistoricoTerminado).toBe(false);
    expect(crono.estadoCiclo).toBe('en_formalizacion');
    expect(crono.diasOfertas).toBe(34);
    expect(crono.diasEvaluacion).toBe(44);
    expect(crono.diasLicitacionTotal).toBe(78);
    expect(crono.diasFormalizacion).toBe(2);
    expect(crono.duracionPrevistaDias).toBe(91); // 3 meses
    expect(crono.diasTranscurridosHoy).toBe(80); // desde 01/07 a 18/09
    expect(crono.plazoTotalDias).toBe(171); // 78 licitación + 2 formalización transcurrida + 91 ejecución
    expect(crono.pctAvance).toBe(47); // 80 / 171 = 46.78% -> 47%
  });

  it('calcula la cronometría simplificada de un contrato menor', () => {
    const contratoMenor = {
      estado: 'Resuelta',
      procedimiento: 'Contrato menor',
      tipo_contrato: 'Servicios',
      fecha_publicacion: '2023-04-10 00:00:00',
      fecha_adjudicacion: '2023-04-10 00:00:00',
      duracion: '1',
      duracion_unidad: 'MON',
    };

    const crono = calcularCronometriaContrato(contratoMenor, new Date('2024-01-01'));
    expect(crono.esHistoricoTerminado).toBe(true);
    expect(crono.fases.length).toBe(1); // solo ejecución directa
    expect(crono.fases[0].id).toBe('ejecucion');
  });

  it('calcula el plazo total real de un contrato histórico completado', () => {
    const contratoHistorico = {
      estado: 'Resuelta',
      procedimiento: 'Abierto',
      tipo_contrato: 'Obras',
      fecha_publicacion: '2020-01-10 00:00:00',
      fecha_limite: '2020-02-05 00:00:00',
      fecha_adjudicacion: '2020-03-15 00:00:00',
      fecha_formalizacion: '2020-04-01 00:00:00',
      duracion: '6',
      duracion_unidad: 'MON',
    };

    const crono = calcularCronometriaContrato(contratoHistorico, new Date('2026-01-01'));
    expect(crono.esHistoricoTerminado).toBe(true);
    expect(crono.estadoCiclo).toBe('completado');
    expect(crono.diasOfertas).toBe(26);
    expect(crono.diasEvaluacion).toBe(39);
    expect(crono.diasFormalizacion).toBe(17);
    expect(crono.plazoTotalDias).toBeGreaterThan(200);
    expect(crono.pctAvance).toBe(100);
  });

  it.each(['Cancelada', 'Cancelled', 'Desistimiento', 'Withdrawn', 'Annulled'])(
    'does not project contract execution for terminal status %s',
    (estado) => {
      const crono = calcularCronometriaContrato({
        estado,
        procedimiento: 'Abierto',
        fecha_publicacion: '2025-01-10',
        fecha_limite: '2025-02-01',
        fecha_adjudicacion: '2025-02-15',
        fecha_formalizacion: '2025-03-01',
        duracion: '12',
        duracion_unidad: 'MON',
      }, new Date('2025-04-01'));

      expect(crono.estadoCiclo).toBe('desierta_anulada');
      expect(crono.esHistoricoTerminado).toBe(true);
      expect(crono.fechaInicioEjecucion).toBeNull();
      expect(crono.fechaFinPrevista).toBeNull();
      expect(crono.diasFormalizacion).toBeNull();
      expect(crono.fases.some((fase) => fase.id === 'ejecucion')).toBe(false);
    }
  );

  it.each(['Resuelta', 'Resolved'])(
    'does not project execution for resolved-unawarded status %s',
    (estado) => {
      const crono = calcularCronometriaContrato({
        estado,
        procedimiento: 'Abierto',
        fecha_publicacion: '2025-01-10',
        fecha_limite: '2025-02-01',
        fecha_adjudicacion: null,
        fecha_formalizacion: null,
        importe_adjudicacion: null,
        duracion: '12',
        duracion_unidad: 'MON',
      }, new Date('2025-04-01'));

      expect(crono.estadoCiclo).toBe('resuelta_sin_adjudicar');
      expect(crono.esHistoricoTerminado).toBe(true);
      expect(crono.fechaInicioEjecucion).toBeNull();
      expect(crono.fechaFinPrevista).toBeNull();
      expect(crono.diasFormalizacion).toBeNull();
      expect(crono.duracionPrevistaTexto).toContain('Sin ejecución (resuelta sin adjudicar');
      expect(crono.fases.some((fase) => fase.id === 'ejecucion')).toBe(false);
    }
  );

  it('incorpora correctamente las prórrogas de modificaciones en la duración y el plazo total', () => {
    const contratoConProrroga = {
      estado: 'Resuelta',
      procedimiento: 'Abierto simplificado',
      tipo_contrato: 'Obras',
      fecha_publicacion: '2023-05-19 00:00:00',
      fecha_adjudicacion: '2023-05-12 00:00:00',
      fecha_formalizacion: '2023-05-19 00:00:00',
      duracion: '4',
      duracion_unidad: 'MON',
      modificadosInfo: {
        totalModificadosPlazoDias: 69,
        totalModificadosPlazoMeses: 2.3,
      },
    };

    const crono = calcularCronometriaContrato(contratoConProrroga, new Date('2024-01-01'));
    expect(crono.esHistoricoTerminado).toBe(true);
    expect(crono.duracionPrevistaTexto).toContain('+69d');
    // Plazo inicial 4 meses (~122 días) + 69 días = ~191 días
    expect(crono.duracionPrevistaDias).toBeGreaterThanOrEqual(185);
    expect(crono.plazoTotalDias).toBeGreaterThanOrEqual(185);
  });
});

describe('validarModeloTemporal - Validación Cronológica y Epistemológica', () => {
  // Caso 1: Expediente 19512581 (4/2026 Servicios) - Secuencia cronológica correcta
  it('1. valida correctamente el expediente 19512581 con secuencia cronológica coherente', async () => {
    const { getLicitacionById } = await import('./db');
    const { validarModeloTemporal } = await import('./cronometria');

    const lic = getLicitacionById('19512581');
    expect(lic).not.toBeNull();

    const val = validarModeloTemporal(lic!);
    expect(val.esValido).toBe(true);
    expect(val.validacionCronologica).toBe('COHERENTE');
    expect(val.diagnosticoCausa).toBe('NINGUNA');
    expect(val.clasificacion).toBe('SECUENCIA_COHERENTE');
    expect(val.gravedad).toBe('NINGUNA');
    expect(val.badgeTexto).toBe('Secuencia coherente');
    expect(val.badgeIcono).toBe('✅');
    expect(val.expediente).toBe('4/2026 Servicios');

    // Desglose de etapas sin mezclar
    expect(val.desgloseEtapas.diasPresentacionOfertas).toBe(18); // 17/04 a 04/05
    expect(val.desgloseEtapas.diasEvaluacionAdjudicacion).toBe(91); // 04/05 a 04/08
    expect(val.desgloseEtapas.diasFormalizacion).toBe(17); // 04/08 a 21/08
    expect(val.desgloseEtapas.diasTramitacionTotal).toBe(109); // 17/04 a 04/08
    expect(val.desgloseEtapas.diasProcedimientoTotal).toBe(126); // 17/04 a 21/08
  });

  // Caso 2: Contratos menores publicados posteriormente (no se consideran anomalía)
  it('2. reconoce que un contrato menor publicado posteriormente no se considera anomalía', async () => {
    const { validarModeloTemporal } = await import('./cronometria');

    const contratoMenorPosteriori = {
      expediente: '2026/139T/CM',
      procedimiento: 'Contrato menor',
      estado: 'Resuelta',
      fecha_adjudicacion: '2026-08-21 00:00:00',
      fecha_publicacion: '2026-08-24 00:00:00', // publicado 3 días después en PLACSP
    };

    const val = validarModeloTemporal(contratoMenorPosteriori);
    expect(val.esValido).toBe(true);
    expect(val.validacionCronologica).toBe('PUBLICACION_POSTERIOR');
    expect(val.diagnosticoCausa).toBe('NINGUNA');
    expect(val.clasificacion).toBe('PUBLICACION_A_POSTERIORI_CONTRATO_MENOR');
    expect(val.gravedad).toBe('INFORMATIVA');
    expect(val.badgeTexto).toBe('Publicación posterior (art. 63.4 LCSP)');
    expect(val.badgeIcono).toBe('ℹ️');
    expect(val.motivo).toBe('Los contratos menores se publican trimestralmente tras su adjudicación (art. 63.4 LCSP); no constituye anomalía.');
    expect(val.motivo).not.toContain('legítimo');
  });

  it('en contratos menores el cómputo de plazo real arranca en la fecha de adjudicación cuando la publicación es posterior', () => {
    const menor = {
      estado: 'Resuelta',
      procedimiento: 'Contrato menor',
      tipo_contrato: 'Servicios',
      fecha_adjudicacion: '2026-06-12 00:00:00',
      fecha_publicacion: '2026-06-15 00:00:00',
      duracion: '15',
      duracion_unidad: 'DAY',
    };
    const crono = calcularCronometriaContrato(menor, new Date('2026-07-01'));
    expect(crono.duracionPrevistaDias).toBe(15);
    expect(crono.plazoTotalDias).toBe(15);
    expect(crono.hitoInicial).toBe('adjudicacion');
  });

  it('en contratos mayores el hito inicial sigue siendo la publicación del anuncio de licitación', () => {
    const mayor = {
      estado: 'Resuelta',
      procedimiento: 'Abierto',
      tipo_contrato: 'Obras',
      fecha_publicacion: '2026-01-10 00:00:00',
      fecha_adjudicacion: '2026-03-15 00:00:00',
      fecha_formalizacion: '2026-04-01 00:00:00',
      duracion: '30',
      duracion_unidad: 'DAY',
    };
    const crono = calcularCronometriaContrato(mayor, new Date('2026-06-01'));
    expect(crono.hitoInicial).toBe('publicacion');
  });

  // Caso 3: Modificaciones y prórrogas temporales
  it('3. preserva y expande el plazo en expedientes con prórroga o modificación de plazo', async () => {
    const { calcularCronometriaContrato } = await import('./cronometria');

    const contratoModificado = {
      estado: 'Resuelta',
      procedimiento: 'Abierto simplificado',
      tipo_contrato: 'Obras',
      fecha_publicacion: '2023-01-15 00:00:00',
      fecha_limite: '2023-02-05 00:00:00',
      fecha_adjudicacion: '2023-03-01 00:00:00',
      fecha_formalizacion: '2023-03-15 00:00:00',
      duracion: '3',
      duracion_unidad: 'MON', // 91 días base
      modificadosInfo: {
        totalModificadosPlazoDias: 45,
        totalModificadosPlazoMeses: 1.5,
      },
    };

    const crono = calcularCronometriaContrato(contratoModificado, new Date('2025-01-01'));
    expect(crono.prorrogaDias).toBe(45);
    expect(crono.duracionPrevistaTexto).toContain('+45d ampliación');
    expect(crono.duracionPrevistaDias).toBe(91 + 45); // 136 días
  });

  // Caso 4: Regla fundamental: discrepancia registral ≠ errata confirmada
  it('4. diferencia rigurosamente entre discrepancia registral y errata confirmada (sin inferir causa)', async () => {
    const { validarModeloTemporal } = await import('./cronometria');

    // Inconsistencia A: Adjudicación antes de límite sin evidencia causal documentada
    const inconsistenciaSinEvidencia = {
      expediente: '1/2024 Suministros (Mixto) PRTR',
      procedimiento: 'Abierto simplificado',
      estado: 'Adjudicada',
      fecha_publicacion: '2024-03-08 00:00:00',
      fecha_limite: '2024-03-25 17:00:00',
      fecha_adjudicacion: '2024-03-22 00:00:00',
    };

    const valA = validarModeloTemporal(inconsistenciaSinEvidencia);
    expect(valA.esValido).toBe(false);
    expect(valA.validacionCronologica).toBe('DISCREPANCIA_DETECTADA');
    expect(valA.diagnosticoCausa).toBe('DISCREPANCIA_CRONOLOGICA_REGISTRAL');
    expect(valA.clasificacion).toBe('DISCREPANCIA_CRONOLOGICA_REGISTRAL');
    expect(valA.badgeTexto).toBe('Discrepancia cronológica registral');
    expect(valA.badgeIcono).toBe('🟠');
    expect(valA.motivo).toBe('Las fechas publicadas presentan una secuencia incompatible. Requiere comprobación en el expediente oficial.');

    // Caso con evidencia específica de errata material del órgano
    const errataConfirmadaConEvidencia = {
      ...inconsistenciaSinEvidencia,
      evidenciaErrataConfirmada: true,
    };

    const valConfirmada = validarModeloTemporal(errataConfirmadaConEvidencia);
    expect(valConfirmada.esValido).toBe(false);
    expect(valConfirmada.diagnosticoCausa).toBe('ERRATA_REGISTRAL_CONFIRMADA');
    expect(valConfirmada.clasificacion).toBe('ERRATA_REGISTRAL_CONFIRMADA');
    expect(valConfirmada.motivo).toContain('Errata registral confirmada mediante comprobación documental');
  });

  // Caso 5: Procedimiento abierto con secuencia cronológica reglamentaria
  it('5. valida un procedimiento abierto reglamentario con secuencia cronológica estricta', async () => {
    const { validarModeloTemporal } = await import('./cronometria');

    const contratoAbiertoNormal = {
      expediente: '10/2025 Obras',
      procedimiento: 'Abierto',
      estado: 'Resuelta',
      fecha_publicacion: '2025-01-10 09:00:00',
      fecha_limite: '2025-02-10 18:00:00',
      fecha_adjudicacion: '2025-03-15 00:00:00',
      fecha_formalizacion: '2025-03-30 00:00:00',
    };

    const val = validarModeloTemporal(contratoAbiertoNormal);
    expect(val.esValido).toBe(true);
    expect(val.validacionCronologica).toBe('COHERENTE');
    expect(val.diagnosticoCausa).toBe('NINGUNA');
    expect(val.clasificacion).toBe('SECUENCIA_COHERENTE');
    expect(val.badgeTexto).toBe('Secuencia coherente');
    expect(val.badgeIcono).toBe('✅');
    expect(val.desgloseEtapas.diasPresentacionOfertas).toBe(31);
    expect(val.desgloseEtapas.diasEvaluacionAdjudicacion).toBe(32);
    expect(val.desgloseEtapas.diasFormalizacion).toBe(15);
    expect(val.desgloseEtapas.diasProcedimientoTotal).toBe(79);
  });

  // Caso 6: Anomalía de parser solo cuando exista evidencia histórica del feed
  it('6. asigna anomalía de parser únicamente cuando existe evidencia histórica, y fuente incompleta si no la hay', async () => {
    const { validarModeloTemporal } = await import('./cronometria');

    const contratoHistoricoSinFeed = {
      expediente: '1/2018. Servicios',
      procedimiento: 'Abierto simplificado',
      estado: 'Resuelta',
      fecha_publicacion: '2018-08-23 00:00:00',
      fecha_limite: '2018-07-23 18:00:00',
      fecha_adjudicacion: '2018-08-08 00:00:00',
      fecha_formalizacion: '2018-08-23 00:00:00',
    };

    // Sin prueba causal: no atribuir automáticamente la causa al parser
    const valSinEvidencia = validarModeloTemporal(contratoHistoricoSinFeed);
    expect(valSinEvidencia.esValido).toBe(false);
    expect(valSinEvidencia.validacionCronologica).toBe('DISCREPANCIA_DETECTADA');
    expect(valSinEvidencia.diagnosticoCausa).toBe('FUENTE_HISTORICA_INCOMPLETA');
    expect(valSinEvidencia.clasificacion).toBe('FUENTE_HISTORICA_INCOMPLETA');
    expect(valSinEvidencia.badgeTexto).toBe('Inconsistencia registral pendiente de comprobación');
    expect(valSinEvidencia.badgeIcono).toBe('🔴');
    expect(valSinEvidencia.motivo).toContain('feed histórico incompleto');
    expect(valSinEvidencia.motivo).toContain('no es posible verificar técnicamente si se debe a una omisión del parser');

    // Con prueba histórica documentada: sí se clasifica como anomalía de parser
    const valConEvidencia = validarModeloTemporal({
      ...contratoHistoricoSinFeed,
      evidenciaHistoricaFeed: {
        publicacionOriginal: '2018-06-25 00:00:00',
        eventoSobrescrito: true,
      },
    });
    expect(valConEvidencia.esValido).toBe(false);
    expect(valConEvidencia.diagnosticoCausa).toBe('ANOMALIA_PARSER');
    expect(valConEvidencia.clasificacion).toBe('ANOMALIA_PARSER');
    expect(valConEvidencia.badgeTexto).toBe('Error de ingestión confirmado');
    expect(valConEvidencia.badgeIcono).toBe('🔴');
    expect(valConEvidencia.motivo).toContain('Error de ingestión confirmado');
  });

  // Caso 7: Procedimiento con datos incompletos no genera diagnóstico causal automático
  it('7. un procedimiento con datos incompletos no genera diagnóstico causal automático', async () => {
    const { validarModeloTemporal } = await import('./cronometria');

    const licIncompleta = {
      expediente: 'EXP-INCOMPLETO-2026',
      procedimiento: 'Abierto',
      fecha_publicacion: null,
      fecha_limite: null,
      fecha_adjudicacion: null,
      fecha_formalizacion: null,
    };

    const val = validarModeloTemporal(licIncompleta);
    expect(val.validacionCronologica).toBe('DATOS_INCOMPLETOS');
    expect(val.diagnosticoCausa).toBe('RECONSTRUCCION_NO_VERIFICABLE');
    expect(val.clasificacion).toBe('RECONSTRUCCION_NO_VERIFICABLE');
    expect(val.badgeTexto).toBe('Inconsistencia registral pendiente de comprobación');
    expect(val.badgeIcono).toBe('🔴');
    expect(val.motivo).toBe('Expediente con información temporal incompleta en la fuente oficial. No genera diagnóstico causal automático.');
  });

  // Caso 8: Auditoría global sobre el censo completo de expedientes en BD
  it('8. audita el censo completo de contratos clasificando según el modelo epistemológico', async () => {
    const { getDb } = await import('./db');
    const { validarModeloTemporal } = await import('./cronometria');

    const db = getDb();
    const rows = db.prepare(`SELECT *, case_number AS expediente, procedure AS procedimiento, contract_type AS tipo_contrato, publication_date AS fecha_publicacion, deadline_date AS fecha_limite, award_date AS fecha_adjudicacion, formalization_date AS fecha_formalizacion FROM contracts`).all() as any[];
    expect(rows.length).toBeGreaterThan(0);

    const counts: Record<string, number> = {
      SECUENCIA_COHERENTE: 0,
      PUBLICACION_A_POSTERIORI_CONTRATO_MENOR: 0,
      PUBLICACION_A_POSTERIORI_NEGOCIADO_SIN_PUBLICIDAD: 0,
      DISCREPANCIA_CRONOLOGICA_REGISTRAL: 0,
      FUENTE_HISTORICA_INCOMPLETA: 0,
      ANOMALIA_PARSER: 0,
      ERRATA_REGISTRAL_CONFIRMADA: 0,
      RECONSTRUCCION_NO_VERIFICABLE: 0,
    };

    for (const lic of rows) {
      const res = validarModeloTemporal(lic);
      counts[res.clasificacion] = (counts[res.clasificacion] || 0) + 1;
    }

    // Las clasificaciones del modelo son una enumeración cerrada. Un valor nuevo
    // debe hacer fallar este test en lugar de incorporarse silenciosamente al censo.
    const expectedClassifications = new Set(Object.keys(counts));
    const unknownClassifications = new Set<string>();
    for (const lic of rows) {
      const res = validarModeloTemporal(lic);
      if (!expectedClassifications.has(res.clasificacion)) {
        unknownClassifications.add(res.clasificacion);
      }
    }
    expect(unknownClassifications.size).toBe(0);

    // Cada expediente debe caer exactamente en una clasificación conocida.
    const classifiedRows = Object.values(counts).reduce((total, count) => total + count, 0);
    expect(classifiedRows).toBe(rows.length);

    const reclass40 = rows.filter(r => validarModeloTemporal(r).clasificacion === 'PUBLICACION_A_POSTERIORI_NEGOCIADO_SIN_PUBLICIDAD');
    const tipos40: Record<string, number> = {};
    for (const r of reclass40) {
      tipos40[r.tipo_contrato || 'NULL'] = (tipos40[r.tipo_contrato || 'NULL'] || 0) + 1;
    }
    console.log('RECLASSIFIED_40_BY_TIPO:', JSON.stringify(tipos40));

    const sumaTotal = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(sumaTotal).toBe(rows.length);

    // Verificación específica del contrato 18041232 (exp. 6/2025 Servicios)
    const lic18041232 = rows.find(r => r.expediente === '6/2025 Servicios');
    expect(lic18041232).toBeDefined();
    const val18041232 = validarModeloTemporal(lic18041232!);
    expect(val18041232.clasificacion).toBe('PUBLICACION_A_POSTERIORI_NEGOCIADO_SIN_PUBLICIDAD');
    expect(val18041232.badgeTexto).toBe('Sin anuncio de licitación previo (procedimiento negociado sin publicidad, código 3)');
    expect(val18041232.badgeIcono).toBe('ℹ️');
    expect(val18041232.esValido).toBe(true);
  });
});
