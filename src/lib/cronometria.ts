import { parseDuration, calcularFechaFin, formatearDuracion } from './contratos-vivos';
import { getContractStatus } from './contract-status';

export type EstadoCicloCronometria = 
  | 'en_licitacion' 
  | 'en_formalizacion' 
  | 'en_ejecucion' 
  | 'completado' 
  | 'desierta_anulada'
  | 'resuelta_sin_adjudicar';

export interface FaseCronometria {
  id: 'ofertas' | 'evaluacion' | 'formalizacion' | 'ejecucion';
  nombre: string;
  dias: number;
  pct: number;
  color: string;
  estado: 'completado' | 'en_curso' | 'pendiente';
  descripcion: string;
}

export interface CronometriaContrato {
  diasOfertas: number | null;
  diasEvaluacion: number | null;
  diasLicitacionTotal: number | null;
  diasFormalizacion: number | null;
  duracionPrevistaDias: number | null;
  duracionPrevistaTexto: string;
  fechaFinPrevista: string | null;
  fechaInicioEjecucion: string | null;
  estadoCiclo: EstadoCicloCronometria;
  esHistoricoTerminado: boolean;
  diasTranscurridosHoy: number;
  plazoTotalDias: number;
  plazoTotalTexto: string;
  desviacionDias: number | null;
  pctAvance: number;
  fases: FaseCronometria[];
  prorrogaDias?: number;
  hitoInicial?: 'publicacion' | 'adjudicacion' | 'formalizacion';
}

function parseDateMs(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const ms = d.getTime();
  return isNaN(ms) ? null : ms;
}

function formatearDiasATexto(dias: number): string {
  if (dias <= 0) return '0 días';
  if (dias === 1) return '1 día';
  if (dias < 30) return `${Math.round(dias)} días`;
  if (dias < 365) {
    const meses = Math.round((dias / 30.41) * 10) / 10;
    return meses === 1 ? '1 mes' : `${meses} meses (${Math.round(dias)} d)`;
  }
  const anos = Math.round((dias / 365) * 10) / 10;
  return anos === 1 ? '1 año' : `${anos} años (${Math.round(dias)} d)`;
}

export interface CronometriaInput {
  estado?: string | null;
  status?: string | null;
  procedimiento?: string | null;
  procedure?: string | null;
  tipo_contrato?: string | null;
  contract_type?: string | null;
  fecha_publicacion?: string | null;
  publication_date?: string | null;
  fecha_limite?: string | null;
  deadline_date?: string | null;
  fecha_adjudicacion?: string | null;
  award_date?: string | null;
  importe_adjudicacion?: number | null;
  importeAdjudicacion?: number | null;
  awarded_amount?: number | null;
  fecha_formalizacion?: string | null;
  formalization_date?: string | null;
  duracion?: string | null;
  duration?: string | null;
  duracion_unidad?: string | null;
  duration_unit?: string | null;
  prorrogaDias?: number | null;
  modificadosInfo?: {
    totalModificadosPlazoDias?: number;
    totalModificadosPlazoMeses?: number;
  } | null;
}

export function calcularCronometriaContrato(
  lic: CronometriaInput,
  refDate: Date = new Date(),
  prorrogaDiasParam?: number | null
): CronometriaContrato {
  lic = {
    ...lic,
    estado: lic.estado ?? (lic as any).status,
    procedimiento: lic.procedimiento ?? (lic as any).procedure,
    tipo_contrato: lic.tipo_contrato ?? (lic as any).contract_type,
    fecha_publicacion: lic.fecha_publicacion ?? (lic as any).publication_date,
    fecha_limite: lic.fecha_limite ?? (lic as any).deadline_date,
    fecha_adjudicacion: lic.fecha_adjudicacion ?? (lic as any).award_date,
    importeAdjudicacion: lic.importeAdjudicacion ?? lic.importe_adjudicacion ?? lic.awarded_amount,
    fecha_formalizacion: lic.fecha_formalizacion ?? (lic as any).formalization_date,
    duracion: lic.duracion ?? (lic as any).duration,
    duracion_unidad: lic.duracion_unidad ?? (lic as any).duration_unit,
  };
  const refMs = refDate.getTime();
  const prorrogaDias = prorrogaDiasParam ?? lic.prorrogaDias ?? lic.modificadosInfo?.totalModificadosPlazoDias ?? 0;
  const stLower = (lic.estado || '').toLowerCase();
  const procLower = (lic.procedimiento || '').toLowerCase();
  const isMenor = procLower.includes('menor');
  const isResolvedUnawarded = getContractStatus({
    estado: lic.estado,
    procedimiento: lic.procedimiento,
    fechaAdjudicacion: lic.fecha_adjudicacion,
    fechaFormalizacion: lic.fecha_formalizacion,
    importeAdjudicacion: lic.importeAdjudicacion,
  }).code === 'RESOLVED_UNAWARDED';
  const isDesierta = stLower.includes('desiert') || stLower.includes('desert');
  const isAnulada = [
    'anulad',
    'annul',
    'cancelad',
    'cancel',
    'renunci',
    'renounc',
    'desist',
    'desestimad',
    'withdraw',
  ].some((pattern) => stLower.includes(pattern));
  const hasFormalizacion = !isDesierta && !isAnulada && Boolean(lic.fecha_formalizacion || stLower.includes('formaliz'));
  const isFormalizadaOResuelta = hasFormalizacion;
  const isAdjudicada = !hasFormalizacion && !isMenor && !isDesierta && !isAnulada && (stLower === 'adjudicada' || stLower === 'adjudicado' || stLower.includes('adjudic'));
  const isPublicada = !hasFormalizacion && !isAdjudicada && !isDesierta && !isAnulada && stLower.includes('publicad');
  const isEvaluacion = !hasFormalizacion && !isAdjudicada && !isDesierta && !isAnulada && stLower.includes('evalua');

  const pubMs = parseDateMs(lic.fecha_publicacion);
  const limMs = parseDateMs(lic.fecha_limite);
  const adjMs = parseDateMs(lic.fecha_adjudicacion);
  const formMs = parseDateMs(lic.fecha_formalizacion);

  // 1. Días de ofertas
  let diasOfertas: number | null = null;
  if (pubMs && limMs && limMs >= pubMs) {
    diasOfertas = Math.round((limMs - pubMs) / (1000 * 86400));
  }

  // 2. Días de evaluación hasta adjudicación o declaración de desierta
  let diasEvaluacion: number | null = null;
  if (limMs && adjMs && adjMs >= limMs) {
    diasEvaluacion = Math.round((adjMs - limMs) / (1000 * 86400));
  } else if (!limMs && pubMs && adjMs && adjMs >= pubMs) {
    diasEvaluacion = Math.round((adjMs - pubMs) / (1000 * 86400));
  }

  // 3. Días de tramitación administrativa total (publicación a resolución)
  let diasLicitacionTotal: number | null = null;
  if (pubMs && adjMs && adjMs >= pubMs) {
    diasLicitacionTotal = Math.round((adjMs - pubMs) / (1000 * 86400));
  } else if (diasOfertas !== null || diasEvaluacion !== null) {
    diasLicitacionTotal = (diasOfertas || 0) + (diasEvaluacion || 0);
  }

  // 4. Días de formalización (no aplicable si quedó desierta o anulada)
  let diasFormalizacion: number | null = null;
  if (!isDesierta && !isAnulada && !isResolvedUnawarded) {
    if (adjMs && formMs && formMs >= adjMs) {
      diasFormalizacion = Math.round((formMs - adjMs) / (1000 * 86400));
    } else if (isAdjudicada && adjMs) {
      // Días transcurridos en el periodo de espera / formalización (art. 153 LCSP)
      diasFormalizacion = Math.max(0, Math.round((refMs - adjMs) / (1000 * 86400)));
    }
  }

  // 5. Duración de ejecución de pliego
  const durParsed = parseDuration(lic.duracion, lic.duracion_unidad);
  let duracionPrevistaDias: number | null = null;
  if (durParsed && durParsed.val > 0) {
    if (durParsed.unit === 'DAY') duracionPrevistaDias = Math.round(durParsed.val);
    else if (durParsed.unit === 'MON') duracionPrevistaDias = Math.round(durParsed.val * 30.41);
    else if (durParsed.unit === 'ANN') duracionPrevistaDias = Math.round(durParsed.val * 365);
  }

  // Fecha inicio y fin previstas de ejecución (incluyendo prórrogas aprobadas)
  // En procedimientos desiertos o anulados, no hay ejecución
  const startStr = (!isDesierta && !isAnulada && !isResolvedUnawarded) ? (lic.fecha_formalizacion || lic.fecha_adjudicacion || lic.fecha_publicacion) : null;
  let finDate = startStr ? calcularFechaFin(startStr, lic.duracion, lic.duracion_unidad) : null;
  if (finDate && prorrogaDias > 0) {
    finDate = new Date(finDate.getTime() + prorrogaDias * 24 * 60 * 60 * 1000);
  }
  const fechaFinPrevista = finDate ? finDate.toISOString().slice(0, 10) : null;
  const fechaInicioEjecucion = startStr ? startStr.slice(0, 10) : null;

  // Determinar estado general del ciclo
  let estadoCiclo: EstadoCicloCronometria = 'completado';
  if (isDesierta || isAnulada) {
    estadoCiclo = 'desierta_anulada';
  } else if (isResolvedUnawarded) {
    estadoCiclo = 'resuelta_sin_adjudicar';
  } else if (isPublicada || isEvaluacion) {
    estadoCiclo = 'en_licitacion';
  } else if (isAdjudicada) {
    estadoCiclo = 'en_formalizacion';
  } else if (finDate && finDate.getTime() > refMs) {
    estadoCiclo = 'en_ejecucion';
  } else {
    estadoCiclo = 'completado';
  }

  const esHistoricoTerminado = estadoCiclo === 'completado' || estadoCiclo === 'desierta_anulada' || estadoCiclo === 'resuelta_sin_adjudicar';

  // Días transcurridos desde el inicio formal del expediente (publicación o adjudicación)
  const hitoInicioMenorMs = adjMs || formMs || pubMs;
  const hitoInicioGeneralMs = pubMs || adjMs || formMs;
  const primerHitoMs = (isMenor ? hitoInicioMenorMs : hitoInicioGeneralMs) || refMs;
  const diasTranscurridosHoy = Math.max(0, Math.round((refMs - primerHitoMs) / (1000 * 86400)));

  const hitoInicial: 'publicacion' | 'adjudicacion' | 'formalizacion' = isMenor
    ? (adjMs ? 'adjudicacion' : formMs ? 'formalizacion' : 'publicacion')
    : (pubMs ? 'publicacion' : adjMs ? 'adjudicacion' : 'formalizacion');

  // Plazo Total (real en cerrados o proyectado en vivos)
  let plazoTotalDias = 0;
  const desviacionDias: number | null = null;

  const duracionEjecucionTotalDias = (duracionPrevistaDias || 30) + (prorrogaDias > 0 ? prorrogaDias : 0);
  const baseLicitacionDias = diasLicitacionTotal || (isMenor ? 0 : 30);
  const baseFormalizDias = isMenor ? 0 : (diasFormalizacion ?? 15);
  const baseEjecucionDias = duracionEjecucionTotalDias;

  if (isDesierta || isAnulada || isResolvedUnawarded) {
    // Para resultados sin adjudicación no hay ejecución: solo cuenta la tramitación administrativa
    plazoTotalDias = Math.max(1, diasLicitacionTotal || diasOfertas || 1);
  } else if (esHistoricoTerminado) {
    const hitoInicioCalculoMs = isMenor ? (adjMs || formMs || pubMs) : pubMs;
    if (finDate && hitoInicioCalculoMs) {
      plazoTotalDias = Math.max(1, Math.round((finDate.getTime() - hitoInicioCalculoMs) / (1000 * 86400)));
    } else {
      plazoTotalDias = baseLicitacionDias + baseFormalizDias + baseEjecucionDias;
    }
  } else {
    // En curso: licitación + formalización (real o 15d) + ejecución prevista
    plazoTotalDias = baseLicitacionDias + baseFormalizDias + baseEjecucionDias;
  }

  const plazoTotalTexto = formatearDiasATexto(plazoTotalDias);

  // Porcentaje de avance
  let pctAvance = 100;
  if (!esHistoricoTerminado && plazoTotalDias > 0) {
    pctAvance = Math.min(99, Math.max(5, Math.round((diasTranscurridosHoy / plazoTotalDias) * 100)));
  }

  // Fases cronológicas
  const fases: FaseCronometria[] = [];

  if (isDesierta || isAnulada || isResolvedUnawarded) {
    // Para expedientes sin adjudicación, las fases son exclusivamente las del procedimiento administrativo
    const dOf = diasOfertas ?? (plazoTotalDias > 10 ? Math.round(plazoTotalDias * 0.6) : plazoTotalDias);
    const dEv = diasEvaluacion ?? Math.max(0, plazoTotalDias - dOf);
    const pctOf = Math.max(10, Math.min(90, Math.round((dOf / plazoTotalDias) * 100)));

    fases.push({
      id: 'ofertas',
      nombre: 'Presentación de Ofertas',
      dias: dOf,
      pct: pctOf,
      color: '#3b82f6',
      estado: 'completado',
      descripcion: `Plazo oficial de concurrencia y recepción de ofertas (${dOf} días).`,
    });

    fases.push({
      id: 'evaluacion',
      nombre: isDesierta ? 'Evaluación y Declaración de Desierta' : isAnulada ? 'Evaluación y Resolución de Anulación' : 'Resolución sin adjudicación',
      dias: dEv,
      pct: Math.max(10, 100 - pctOf),
      color: isDesierta ? '#f59e0b' : isAnulada ? '#ef4444' : '#64748b',
      estado: 'completado',
      descripcion: isDesierta
        ? `Examen de plicas por la Mesa y decreto que declaró formalmente desierta la licitación (${dEv} días).`
        : isAnulada
        ? `Acuerdo administrativo de anulación del procedimiento (${dEv} días).`
        : `El expediente se resolvió sin adjudicación; no se proyecta ejecución contractual (${dEv} días).`,
    });
  } else if (!isMenor) {
    // 1. Plazo de ofertas
    const dOf = diasOfertas ?? 20;
    fases.push({
      id: 'ofertas',
      nombre: 'Presentación de Ofertas',
      dias: dOf,
      pct: Math.max(5, Math.round((dOf / plazoTotalDias) * 100)),
      color: '#3b82f6', // azul
      estado: isPublicada ? 'en_curso' : 'completado',
      descripcion: `Plazo de concurrencia y recepción de proposiciones (${dOf} días).`,
    });

    // 2. Valoración técnica
    const dEv = diasEvaluacion ?? (isAdjudicada || isFormalizadaOResuelta ? 30 : 0);
    fases.push({
      id: 'evaluacion',
      nombre: 'Valoración y Adjudicación',
      dias: dEv,
      pct: Math.max(5, Math.round((dEv / plazoTotalDias) * 100)),
      color: '#f59e0b', // ámbar
      estado: isEvaluacion ? 'en_curso' : (isAdjudicada || isFormalizadaOResuelta) ? 'completado' : 'pendiente',
      descripcion: `Evaluación de plicas por la Mesa y decreto de adjudicación (${dEv} días).`,
    });

    // 3. Formalización legal
    const dFo = isAdjudicada ? (diasFormalizacion || 7) : (diasFormalizacion ?? 15);
    fases.push({
      id: 'formalizacion',
      nombre: 'Formalización (Art. 153 LCSP)',
      dias: dFo,
      pct: Math.max(3, Math.round((dFo / plazoTotalDias) * 100)),
      color: '#8b5cf6', // morado
      estado: isAdjudicada ? 'en_curso' : isFormalizadaOResuelta ? 'completado' : 'pendiente',
      descripcion: `Periodo reglamentario de firma del contrato (${dFo} días).`,
    });

    // 4. Ejecución sobre el terreno
    const dEj = baseEjecucionDias;
    const durBase = formatearDuracion(lic.duracion, lic.duracion_unidad);
    fases.push({
      id: 'ejecucion',
      nombre: 'Ejecución Material',
      dias: dEj,
      pct: Math.max(10, Math.round((dEj / plazoTotalDias) * 100)),
      color: '#10b981', // verde esmeralda
      estado: estadoCiclo === 'en_ejecucion' ? 'en_curso' : esHistoricoTerminado ? 'completado' : 'pendiente',
      descripcion: prorrogaDias > 0
        ? `Duración: ${durBase} contratada + ${prorrogaDias} días ampliados por modificación (${dEj} días en total).`
        : `Duración contratada de las obras/servicios (${durBase}).`,
    });
  } else {
    // Contratos menores: ejecución material directa
    const dEj = baseEjecucionDias;
    const durBase = formatearDuracion(lic.duracion, lic.duracion_unidad);
    fases.push({
      id: 'ejecucion',
      nombre: 'Ejecución Material',
      dias: dEj,
      pct: 100,
      color: '#10b981',
      estado: estadoCiclo === 'en_ejecucion' ? 'en_curso' : esHistoricoTerminado ? 'completado' : 'pendiente',
      descripcion: `Duración contratada (${durBase}).`,
    });
  }

  const durBase = formatearDuracion(lic.duracion, lic.duracion_unidad);
  const duracionPrevistaTexto = isDesierta
    ? `Sin ejecución (desierta · pliego: ${durBase})`
    : isAnulada
    ? `Sin ejecución (anulada · pliego: ${durBase})`
    : isResolvedUnawarded
    ? `Sin ejecución (resuelta sin adjudicar · pliego: ${durBase})`
    : prorrogaDias > 0
    ? `${durBase} (+${prorrogaDias}d ampliación)`
    : durBase;

  return {
    diasOfertas,
    diasEvaluacion,
    diasLicitacionTotal,
    diasFormalizacion,
    duracionPrevistaDias: duracionEjecucionTotalDias,
    duracionPrevistaTexto,
    fechaFinPrevista,
    fechaInicioEjecucion,
    estadoCiclo,
    esHistoricoTerminado,
    diasTranscurridosHoy,
    plazoTotalDias,
    plazoTotalTexto,
    desviacionDias,
    pctAvance,
    fases,
    prorrogaDias: prorrogaDias > 0 ? prorrogaDias : 0,
    hitoInicial,
  };
}

export type EstadoValidacionCronologica =
  | 'COHERENTE'
  | 'PUBLICACION_POSTERIOR'
  | 'DISCREPANCIA_DETECTADA'
  | 'DATOS_INCOMPLETOS';

export type DiagnosticoCausaTemporal =
  | 'NINGUNA'
  | 'DISCREPANCIA_CRONOLOGICA_REGISTRAL'
  | 'ERRATA_REGISTRAL_CONFIRMADA'
  | 'ANOMALIA_PARSER'
  | 'FUENTE_HISTORICA_INCOMPLETA'
  | 'RECONSTRUCCION_NO_VERIFICABLE';

export type ClasificacionTemporal =
  | 'SECUENCIA_COHERENTE'
  | 'PUBLICACION_A_POSTERIORI_CONTRATO_MENOR'
  | 'PUBLICACION_A_POSTERIORI_NEGOCIADO_SIN_PUBLICIDAD'
  | 'DISCREPANCIA_CRONOLOGICA_REGISTRAL'
  | 'ERRATA_REGISTRAL_CONFIRMADA'
  | 'ANOMALIA_PARSER'
  | 'FUENTE_HISTORICA_INCOMPLETA'
  | 'RECONSTRUCCION_NO_VERIFICABLE'
  // Compatibility aliases
  | 'CORRECTO'
  | 'REGISTRO_LEGITIMO_A_POSTERIORI'
  | 'ERRATA_ORGANO_CONTRATACION'
  | 'ANOMALIA_CRONOLOGICA_REGISTRO';

export type GravedadTemporal = 'NINGUNA' | 'INFORMATIVA' | 'MEDIA' | 'ALTA';

export interface ValidacionTemporalResultado {
  esValido: boolean;
  validacionCronologica: EstadoValidacionCronologica;
  diagnosticoCausa: DiagnosticoCausaTemporal;
  clasificacion: ClasificacionTemporal;
  gravedad: GravedadTemporal;
  badgeTexto: string;
  badgeIcono: string;
  expediente: string;
  procedimiento: string;
  tipoEvento: string;
  fechasComparadas: {
    publicacion?: string | null;
    limite?: string | null;
    adjudicacion?: string | null;
    formalizacion?: string | null;
  };
  motivo: string;
  desgloseEtapas: {
    diasPresentacionOfertas: number | null;
    diasEvaluacionAdjudicacion: number | null;
    diasFormalizacion: number | null;
    diasTramitacionTotal: number | null;
    diasProcedimientoTotal: number | null;
  };
}

export interface ValidarModeloTemporalInput {
  expediente?: string | null;
  case_number?: string | null;
  procedimiento?: string | null;
  procedure?: string | null;
  estado?: string | null;
  status?: string | null;
  fecha_publicacion?: string | null;
  publication_date?: string | null;
  fecha_limite?: string | null;
  deadline_date?: string | null;
  fecha_adjudicacion?: string | null;
  award_date?: string | null;
  fecha_formalizacion?: string | null;
  formalization_date?: string | null;
  evidenciaErrataConfirmada?: boolean;
  evidenciaHistoricaFeed?: {
    publicacionOriginal?: string | null;
    eventoSobrescrito?: boolean;
    feedIncompleto?: boolean;
  } | null;
  fuenteIncompleta?: boolean;
}

/**
 * Función centralizada de validación cronológica y epistemológica del modelo temporal.
 * Separa de manera estricta el hecho observado (secuencia coherente / discrepancia)
 * del diagnóstico causal (anomalía demostrada de parser, fuente incompleta, errata confirmada).
 */
export function validarModeloTemporal(lic: ValidarModeloTemporalInput): ValidacionTemporalResultado {
  lic = {
    ...lic,
    expediente: lic.expediente ?? (lic as any).case_number,
    procedimiento: lic.procedimiento ?? (lic as any).procedure,
    fecha_publicacion: lic.fecha_publicacion ?? (lic as any).publication_date,
    fecha_limite: lic.fecha_limite ?? (lic as any).deadline_date,
    fecha_adjudicacion: lic.fecha_adjudicacion ?? (lic as any).award_date,
    fecha_formalizacion: lic.fecha_formalizacion ?? (lic as any).formalization_date,
  };
  const expediente = (lic.expediente || 'Sin expediente').trim();
  const procedimiento = (lic.procedimiento || 'No especificado').trim();
  const procLower = procedimiento.toLowerCase();
  const isMenor = procLower.includes('menor');
  // Negociado sin publicidad never publishes a public call on the platform;
  // only the adjudication notice is published, so pubMs > limMs is always expected.
  const isNegociadoSinPublicidad = procLower.includes('negociado') && procLower.includes('sin publicidad');

  const pubMs = parseDateMs(lic.fecha_publicacion);
  const limMs = parseDateMs(lic.fecha_limite);
  const adjMs = parseDateMs(lic.fecha_adjudicacion);
  const formMs = parseDateMs(lic.fecha_formalizacion);

  const fechasComparadas = {
    publicacion: lic.fecha_publicacion || null,
    limite: lic.fecha_limite || null,
    adjudicacion: lic.fecha_adjudicacion || null,
    formalizacion: lic.fecha_formalizacion || null,
  };

  // 1. Días de fases individuales
  const diasPresentacionOfertas = (pubMs && limMs && limMs >= pubMs)
    ? Math.round((limMs - pubMs) / (1000 * 86400))
    : null;

  const diasEvaluacionAdjudicacion = (limMs && adjMs && adjMs >= limMs)
    ? Math.round((adjMs - limMs) / (1000 * 86400))
    : (!limMs && pubMs && adjMs && adjMs >= pubMs)
    ? Math.round((adjMs - pubMs) / (1000 * 86400))
    : null;

  const diasFormalizacion = (adjMs && formMs && formMs >= adjMs)
    ? Math.round((formMs - adjMs) / (1000 * 86400))
    : null;

  const diasTramitacionTotal = (pubMs && adjMs && adjMs >= pubMs)
    ? Math.round((adjMs - pubMs) / (1000 * 86400))
    : (diasPresentacionOfertas !== null || diasEvaluacionAdjudicacion !== null)
    ? (diasPresentacionOfertas || 0) + (diasEvaluacionAdjudicacion || 0)
    : null;

  const diasProcedimientoTotal = (pubMs && formMs && formMs >= pubMs)
    ? Math.round((formMs - pubMs) / (1000 * 86400))
    : (diasTramitacionTotal !== null && diasFormalizacion !== null)
    ? diasTramitacionTotal + diasFormalizacion
    : diasTramitacionTotal;

  const desgloseEtapas = {
    diasPresentacionOfertas,
    diasEvaluacionAdjudicacion,
    diasFormalizacion,
    diasTramitacionTotal,
    diasProcedimientoTotal,
  };

  // 2. Procedimiento con datos incompletos: no genera diagnóstico causal automático
  if (!pubMs && !adjMs && !limMs && !formMs) {
    return {
      esValido: true,
      validacionCronologica: 'DATOS_INCOMPLETOS',
      diagnosticoCausa: 'RECONSTRUCCION_NO_VERIFICABLE',
      clasificacion: 'RECONSTRUCCION_NO_VERIFICABLE',
      gravedad: 'INFORMATIVA',
      badgeTexto: 'Inconsistencia registral pendiente de comprobación',
      badgeIcono: '🔴',
      expediente,
      procedimiento,
      tipoEvento: 'Datos temporales incompletos',
      fechasComparadas,
      motivo: 'Expediente con información temporal incompleta en la fuente oficial. No genera diagnóstico causal automático.',
      desgloseEtapas,
    };
  }

  // 3. Contratos Menores publicados a posteriori (LCSP Art. 118 / 63.4)
  if (isMenor && ((limMs && pubMs && pubMs > limMs) || (adjMs && pubMs && pubMs > adjMs))) {
    return {
      esValido: true,
      validacionCronologica: 'PUBLICACION_POSTERIOR',
      diagnosticoCausa: 'NINGUNA',
      clasificacion: 'PUBLICACION_A_POSTERIORI_CONTRATO_MENOR',
      gravedad: 'INFORMATIVA',
      badgeTexto: 'Publicación posterior (art. 63.4 LCSP)',
      badgeIcono: 'ℹ️',
      expediente,
      procedimiento,
      tipoEvento: 'Publicación trimestral ordinaria del contrato menor (art. 63.4 LCSP)',
      fechasComparadas,
      motivo: 'Los contratos menores se publican trimestralmente tras su adjudicación (art. 63.4 LCSP); no constituye anomalía.',
      desgloseEtapas,
    };
  }

  // 3b. Negociado sin publicidad: la plataforma sólo registra el anuncio posterior
  // al límite de presentación de ofertas (procedimiento negociado sin publicidad, código 3).
  if (isNegociadoSinPublicidad && limMs && pubMs && pubMs > limMs) {
    return {
      esValido: true,
      validacionCronologica: 'PUBLICACION_POSTERIOR',
      diagnosticoCausa: 'NINGUNA',
      clasificacion: 'PUBLICACION_A_POSTERIORI_NEGOCIADO_SIN_PUBLICIDAD',
      gravedad: 'INFORMATIVA',
      badgeTexto: 'Sin anuncio de licitación previo (procedimiento negociado sin publicidad, código 3)',
      badgeIcono: 'ℹ️',
      expediente,
      procedimiento,
      tipoEvento: 'Sin anuncio de licitación previo (procedimiento negociado sin publicidad, código 3)',
      fechasComparadas,
      motivo: 'En el procedimiento negociado sin publicidad (código 3) la plataforma publica el anuncio tras el plazo de ofertas. No constituye anomalía de cronometría.',
      desgloseEtapas,
    };
  }

  // 4. Incompatibilidad de fechas de adjudicación o formalización
  const isAdjBeforeLim = !!(limMs && adjMs && adjMs < limMs);
  const isFormBeforeAdj = !!(adjMs && formMs && formMs < adjMs);

  if (isAdjBeforeLim || isFormBeforeAdj) {
    if (lic.evidenciaErrataConfirmada) {
      return {
        esValido: false,
        validacionCronologica: 'DISCREPANCIA_DETECTADA',
        diagnosticoCausa: 'ERRATA_REGISTRAL_CONFIRMADA',
        clasificacion: 'ERRATA_REGISTRAL_CONFIRMADA',
        gravedad: 'MEDIA',
        badgeTexto: 'Discrepancia cronológica registral',
        badgeIcono: '🟠',
        expediente,
        procedimiento,
        tipoEvento: isAdjBeforeLim
          ? 'Adjudicación con fecha previa al cierre de ofertas (errata confirmada)'
          : 'Formalización con fecha previa a la adjudicación (errata confirmada)',
        fechasComparadas,
        motivo: 'Errata registral confirmada mediante comprobación documental: el órgano de contratación introdujo una fecha incorrecta en el registro.',
        desgloseEtapas,
      };
    }

    return {
      esValido: false,
      validacionCronologica: 'DISCREPANCIA_DETECTADA',
      diagnosticoCausa: 'DISCREPANCIA_CRONOLOGICA_REGISTRAL',
      clasificacion: 'DISCREPANCIA_CRONOLOGICA_REGISTRAL',
      gravedad: 'MEDIA',
      badgeTexto: 'Discrepancia cronológica registral',
      badgeIcono: '🟠',
      expediente,
      procedimiento,
      tipoEvento: isAdjBeforeLim
        ? 'Adjudicación con fecha previa al cierre de ofertas'
        : 'Formalización con fecha previa a la adjudicación',
      fechasComparadas,
      motivo: 'Las fechas publicadas presentan una secuencia incompatible. Requiere comprobación en el expediente oficial.',
      desgloseEtapas,
    };
  }

  // 5. Procedimiento competitivo con publicación posterior al límite de ofertas
  if (!isMenor && limMs && pubMs && pubMs > limMs) {
    const hasParserEvidence = !!(
      lic.evidenciaHistoricaFeed?.eventoSobrescrito ||
      (lic.evidenciaHistoricaFeed?.publicacionOriginal && parseDateMs(lic.evidenciaHistoricaFeed.publicacionOriginal)! <= limMs)
    );

    if (hasParserEvidence) {
      return {
        esValido: false,
        validacionCronologica: 'DISCREPANCIA_DETECTADA',
        diagnosticoCausa: 'ANOMALIA_PARSER',
        clasificacion: 'ANOMALIA_PARSER',
        gravedad: 'ALTA',
        badgeTexto: 'Error de ingestión confirmado',
        badgeIcono: '🔴',
        expediente,
        procedimiento,
        tipoEvento: 'Error de ingestión confirmado (sobreescritura en sincronizador)',
        fechasComparadas,
        motivo: 'Error de ingestión confirmado: se ha demostrado en el histórico del feed que existía una publicación inicial anterior que el sincronizador sobrescribió con la fecha de un evento posterior.',
        desgloseEtapas,
      };
    }

    // Feed histórico incompleto o no verificable sin prueba concluyente de atribución causal
    return {
      esValido: false,
      validacionCronologica: 'DISCREPANCIA_DETECTADA',
      diagnosticoCausa: 'FUENTE_HISTORICA_INCOMPLETA',
      clasificacion: 'FUENTE_HISTORICA_INCOMPLETA',
      gravedad: 'ALTA',
      badgeTexto: 'Inconsistencia registral pendiente de comprobación',
      badgeIcono: '🔴',
      expediente,
      procedimiento,
      tipoEvento: 'Publicación posterior al límite en procedimiento competitivo (fuente histórica incompleta)',
      fechasComparadas,
      motivo: 'Inconsistencia registral pendiente de comprobación: la publicación en procedimiento competitivo consta posterior al límite de ofertas en un feed histórico incompleto; no es posible verificar técnicamente si se debe a una omisión del parser o a un desfase de la fuente de origen.',
      desgloseEtapas,
    };
  }

  // 6. Secuencia cronológica reglamentaria
  return {
    esValido: true,
    validacionCronologica: 'COHERENTE',
    diagnosticoCausa: 'NINGUNA',
    clasificacion: 'SECUENCIA_COHERENTE',
    gravedad: 'NINGUNA',
    badgeTexto: 'Secuencia coherente',
    badgeIcono: '✅',
    expediente,
    procedimiento,
    tipoEvento: 'Secuencia cronológica reglamentaria',
    fechasComparadas,
    motivo: 'Secuencia cronológica consistente y conforme a las fases de tramitación de la LCSP.',
    desgloseEtapas,
  };
}
