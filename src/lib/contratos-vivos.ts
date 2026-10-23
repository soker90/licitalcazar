import { eligibleAwardLotStatusSql, eligibleAwardResultStateSql, excludeAwardWhenLegacyLotTerminalSql, lotAwardsAmountCoverageSql, eligibleLegacyLotAwardAmountSql, allowParentAwardAmountFallbackSql, excludeLegacyLotWhenStructuredTerminalResultSql } from './lot-status.js';
import { DatabaseSync } from 'node:sqlite';
import { parseScope } from './db';
import { getContractStatus } from './contract-status';

export type EstadoVigencia = 'en_vigor' | 'proximo_vencimiento' | 'vencido' | 'desconocido' | 'pendiente_formalizacion';

export type EstadoContractual =
  | 'publicada'
  | 'en_evaluacion'
  | 'adjudicada_pendiente_formalizacion'
  | 'formalizada_en_vigor'
  | 'prorrogada'
  | 'vencida'
  | 'desierta'
  | 'anulada'
  | 'resuelta_sin_adjudicar';

export const ESTADO_CONTRACTUAL_LABELS: Record<EstadoContractual, string> = {
  publicada: 'Publicada',
  en_evaluacion: 'En evaluación',
  adjudicada_pendiente_formalizacion: 'Adjudicado — pendiente de formalización',
  formalizada_en_vigor: 'Formalizada / En vigor',
  prorrogada: 'Prorrogada',
  vencida: 'Vencida',
  desierta: 'Desierta',
  anulada: 'Anulada',
  resuelta_sin_adjudicar: 'Resuelta sin adjudicar',
};

export interface EvaluacionFechasContractuales {
  fechaPerfeccion: string | null;
  fechaFormalizacion: string | null;
  fechaInicioEjecucion: string | null;
  fechaPublicacion: string | null;
  fechaInicioVigencia: string | null;
  etiquetaInicioVigencia?: string | null;
  esFechaInicioEstimada?: boolean;
}

export interface EvaluacionEstadoContractual {
  codigo: EstadoContractual;
  label: string;
  esMenorPublicadoPosteriori: boolean;
  fechas: EvaluacionFechasContractuales;
  fechaInicioEfectiva: string | null;
  fechaFinEstimada: string | null;
  diasRestantes: number | null;
  estadoVigencia: EstadoVigencia;
  duracionTexto: string;
  esPlurianual: boolean;
  esProrrogable: boolean;
  hitoInicioRequerido: string | null;
  observacionJuridica: string;
  etiquetaInicioVigencia?: string | null;
  esFechaInicioEstimada?: boolean;
}

export interface EvaluacionEstadoContractualParams {
  status?: string | null;
  estado?: string | null;
  procedimiento?: string | null;
  tipoContrato?: string | null;
  fechaPublicacion?: string | null;
  fechaLimitePresentacion?: string | null;
  fechaAdjudicacion?: string | null;
  fechaFormalizacion?: string | null;
  importeAdjudicacion?: number | null;
  importe_adjudicacion?: number | null;
  awarded_amount?: number | null;
  fechaInicioEjecucion?: string | null;
  fechaInicio?: string | null;
  fechaActaReplanteo?: string | null;
  fechaInicioVigencia?: string | null;
  fechaPerfeccion?: string | null;
  duration?: string | null;
  duracion?: string | null;
  durationUnit?: string | null;
  duracionUnidad?: string | null;
  prorrogaDays?: number | null;
  prorrogaDias?: number | null;
  fechaFinExplicita?: string | null;
  tieneProrrogaActiva?: boolean | null;
  refDate?: Date;
}

export interface ContratoVivoItem {
  id: string;
  case_number: string;
  object_description: string;
  tipo: string;
  procedimiento: string;
  organo: string;
  awardee: string;
  nifAdjudicatario: string | null;
  amount: number | null;
  fechaInicio: string;
  duracionTexto: string;
  duracionValor: number | null;
  duracionUnidad: string | null;
  fechaFinEstimada: string | null;
  diasRestantes: number | null;
  estadoVigencia: EstadoVigencia;
  esPlurianual: boolean;
  esProrrogable: boolean;
  scope: string;
}

export interface ContratosVivosKpis {
  totalVivos: number;
  volumenVivoTotal: number;
  vencenEn6Meses: number;
  volumenVence6Meses: number;
  vencenEn30Dias: number;
  volumenVence30Dias: number;
  plurianualesVivos: number;
  volumenPlurianual: number;
}

export interface ContratosVivosStats {
  kpis: ContratosVivosKpis;
  proximosVencimientos6Meses: ContratoVivoItem[];
  todosVivos: ContratoVivoItem[];
  distribucionPorTipo: { tipo: string; vivos: number; volumen: number; vencen6Meses: number }[];
  distribucionPorOrganismo: { organo: string; vivos: number; volumen: number; vencen6Meses: number }[];
}

const SPANISH_MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

export function extraerFechaFinExplicita(texto: string | null | undefined): string | null {
  if (!texto) return null;

  const numeric = texto.match(/\bhasta(?: el)?(?: d[ií]a)?\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/i);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? date.toISOString().slice(0, 10)
      : null;
  }

  const named = texto.match(/\bhasta(?: el)?(?: d[ií]a)?\s*(\d{1,2})\s+de\s+([a-záéíóúüñ]+)\s+de\s+(\d{4})\b/i);
  if (!named) return null;

  const day = Number(named[1]);
  const month = SPANISH_MONTHS[named[2].toLowerCase()];
  const year = Number(named[3]);
  if (!Number.isInteger(day) || month == null || !Number.isInteger(year)) return null;

  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : null;
}

export function parseDuration(dur: string | null | undefined, unit: string | null | undefined): { val: number; unit: 'ANN' | 'MON' | 'DAY' } | null {
  if (!dur) return null;
  const val = parseFloat(dur);
  if (isNaN(val) || val <= 0) return null;
  const u = (unit || 'MON').toUpperCase().trim();
  if (u === 'ANN' || u === 'YEAR' || u === 'YEARS') return { val, unit: 'ANN' };
  if (u === 'MON' || u === 'MONTH' || u === 'MONTHS') return { val, unit: 'MON' };
  if (u === 'DAY' || u === 'DAYS') return { val, unit: 'DAY' };
  return { val, unit: 'MON' };
}

function addUtcMonthsClamped(date: Date, months: number): void {
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
}

export function calcularFechaFin(
  startDateStr: string | null | undefined,
  dur: string | null | undefined,
  unit: string | null | undefined
): Date | null {
  if (!startDateStr) return null;
  const durParsed = parseDuration(dur, unit);
  if (!durParsed) return null;

  const d = new Date(startDateStr);
  if (isNaN(d.getTime())) return null;

  const { val, unit: u } = durParsed;
  if (u === 'ANN') {
    const wholeYears = Math.floor(val);
    const totalMonths = wholeYears * 12 + Math.round((val - wholeYears) * 12);
    addUtcMonthsClamped(d, totalMonths);
  } else if (u === 'MON') {
    const wholeMonths = Math.floor(val);
    addUtcMonthsClamped(d, wholeMonths);
    const remDays = Math.round((val - wholeMonths) * 30);
    if (remDays > 0) d.setUTCDate(d.getUTCDate() + remDays);
  } else if (u === 'DAY') {
    d.setUTCDate(d.getUTCDate() + Math.round(val));
  } else {
    return null;
  }

  return d;
}

export function formatearDuracion(dur: string | null | undefined, unit: string | null | undefined): string {
  const p = parseDuration(dur, unit);
  if (!p) return 'No especificada';
  const { val, unit: u } = p;
  if (u === 'ANN') {
    return val === 1 ? '1 año' : `${val} años`;
  }
  if (u === 'MON') {
    return val === 1 ? '1 mes' : `${val} meses`;
  }
  if (u === 'DAY') {
    return val === 1 ? '1 día' : `${val} días`;
  }
  return `${val} ${u}`;
}

/**
 * =========================================================================================
 * DICTAMEN JURÍDICO METODOLÓGICO: DISTINCIÓN ENTRE PERFECCIÓN, INICIO DE EJECUCIÓN Y VIGENCIA (LCSP)
 * =========================================================================================
 * 
 * 1. PERFECCIÓN DEL CONTRATO (Art. 36 LCSP):
 *    - Regla general (Art. 36.1 LCSP): Los contratos de las Administraciones Públicas se perfeccionan
 *      con su FORMALIZACIÓN en documento administrativo.
 *    - Contratos basados en Acuerdos Marco y específicos de SDA (Art. 36.3 LCSP): Se perfeccionan
 *      con su ADJUDICACIÓN.
 *    - Contratos Menores (Arts. 36.1, 118 y 153.1 LCSP): La tramitación del case_number menor no exige
 *      formalización administrativa formal. La doctrina y práctica jurídica distinguen:
 *      1) tramitación del case_number menor (aprobación del gasto e informe de necesidad),
 *      2) adjudicación/encargo formal al contratista,
 *      3) factura (conformidad y recepción de la prestación),
 *      4) document_date de inicio de ejecución material cuando conste expresamente en el case_number, y
 *      5) document_date de publicación posterior trimestral en PLACSP (deber de publicidad activa ex-post, Art. 63.4 LCSP).
 *      No debe inferirse automáticamente una "document_date de perfección" jurídica exacta desde award_date
 *      si el registro no contiene explícitamente ese hito perfeccionador.
 *    - Abierto Supersimplificado (Art. 159.6 LCSP): Se perfecciona mediante la firma de aceptación
 *      de la resolución de adjudicación.
 * 
 * 2. FECHA DE INICIO DE EJECUCIÓN (INICIO MATERIAL):
 *    - Regla general (Art. 153.6 LCSP): No puede iniciarse la ejecución sin previa formalización.
 *    - CONTRATOS DE OBRAS (Art. 237 LCSP): El inicio material de la ejecución de las obras se vincula
 *      preceptivamente al ACTA DE COMPROBACIÓN DEL REPLANTEO (suscrita dentro del plazo máximo de un
 *      mes desde la formalización). La adjudicación NUNCA es el inicio material.
 *    - CONTRATOS BASADOS EN ACUERDOS MARCO / SDA: La adjudicación perfecciona el contrato (Art. 36.3),
 *      pero NO debe asumirse automáticamente que fecha_adjudicación = inicio material de ejecución.
 *      Se comprueba si consta document_date contractual/pliego, orden de inicio o formalización explícita; en su
 *      defecto, el inicio material queda sujeto a la orden de entrega/servicio.
 *    - CONTRATOS MENORES: No describir automáticamente "aprobación del gasto + factura = inicio de ejecución".
 *      Se distingue la document_date de inicio de ejecución material cuando conste expresamente en el case_number
 *      frente a los actos de tramitación y encargo.
 * 
 * 3. FECHA DE INICIO DEL CÓMPUTO DE VIGENCIA (`fechaInicioVigencia`):
 *    - Representa el comienzo real del cómputo del plazo contractual según el régimen aplicable para calcular
 *      el vencimiento y días restantes:
 *      * Contrato ordinario formalizado: Comienza con la formalización (o document_date de inicio pactada en pliegos).
 *      * Contrato de obras: Comienza con el acta de replanteo (Art. 237 LCSP) o, en defecto de acta desglosada
 *        en metadatos, la formalización como hito referencial previo bajo reserva legal del replanteo.
 *      * Contrato basado en Acuerdo Marco / SDA: Comienza con la document_date contractual/pliego si existe; en su
 *        defecto formalización, y supletoriamente la adjudicación al estar perfeccionado (Art. 36.3 LCSP).
 *      * Contrato menor: Utiliza una document_date de inicio contractual explícita cuando exista en el case_number;
 *        en ausencia de ella, utiliza la document_date operativa determinada por el modelo pero etiquetada como
 *        "estimada según datos disponibles" (adjudicación/encargo). NUNCA se utiliza la document_date de publicación
 *        posterior trimestral en PLACSP (Art. 63.4 LCSP).
 *      * Adjudicado sin formalizar (no menor): No computa vigencia (null) conforme al Art. 153.6 LCSP.
 */
export function determinarFechasContractuales(params: EvaluacionEstadoContractualParams): EvaluacionFechasContractuales {
  const duracionUnidad = params.durationUnit ?? params.duracionUnidad;
  params = {
    ...params,
    status: params.status ?? params.estado,
    importeAdjudicacion: params.importeAdjudicacion ?? params.importe_adjudicacion ?? params.awarded_amount,
    duration: params.duration ?? params.duracion,
    duracionUnidad,
    durationUnit: duracionUnidad,
  };
  const procLower = (params.procedimiento || '').toLowerCase();
  const esMenor = procLower.includes('menor');
  const esBasado = procLower.includes('basado') || procLower.includes('acuerdo marco');
  const esSDA = procLower.includes('dinámico') || procLower.includes('dinamico') || procLower.includes('sda');
  const esSupersimplificado = procLower.includes('supersimplificado');
  const tipoLower = (params.tipoContrato || '').toLowerCase();
  const esObra = tipoLower.includes('obra');
  const stLower = (params.status ?? params.estado ?? '').toLowerCase().trim();

  const fechaPublicacion = params.fechaPublicacion || null;
  const fechaFormalizacion = params.fechaFormalizacion || null;

  const isDesierto = stLower.includes('desiert') || stLower.includes('desert');
  const isAnulado = [
    'anulad', 'annul', 'cancelad', 'cancel', 'renuncia', 'renounc',
    'desist', 'desestimad', 'withdraw',
  ].some((pattern) => stLower.includes(pattern));
  const isResolvedUnawarded = getContractStatus({
    estado: params.status ?? params.estado,
    procedimiento: params.procedimiento,
    tipoContrato: params.tipoContrato,
    fechaPublicacion: params.fechaPublicacion,
    fechaLimite: params.fechaLimitePresentacion,
    fechaAdjudicacion: params.fechaAdjudicacion,
    fechaFormalizacion: params.fechaFormalizacion,
    importeAdjudicacion: params.importeAdjudicacion,
    refDate: params.refDate,
  }).code === 'RESOLVED_UNAWARDED';
  const isCanceladoODesierto = isDesierto || isAnulado || isResolvedUnawarded;
  const tieneFormalizacionExpresa = Boolean(
    fechaFormalizacion || 
    stLower.includes('formaliz')
  );
  const tieneAdjudicacion = Boolean(params.fechaAdjudicacion || stLower.includes('adjudic'));
  const esPreAdjudicacion = !tieneAdjudicacion && !tieneFormalizacionExpresa;

  // 1. PERFECCIÓN DEL CONTRATO (Art. 36 LCSP)
  let fechaPerfeccion: string | null = null;
  if (!isCanceladoODesierto && !esPreAdjudicacion) {
    if (params.fechaPerfeccion) {
      fechaPerfeccion = params.fechaPerfeccion;
    } else if (esBasado || esSDA) {
      // Art. 36.3 LCSP: Los contratos basados en un acuerdo marco y los contratos específicos en el marco
      // de un sistema dinámico de adquisición se perfeccionan con su adjudicación.
      fechaPerfeccion = params.fechaAdjudicacion || fechaFormalizacion || null;
    } else if (esMenor) {
      // Régimen del contrato menor (Arts. 36.1, 118 y 153.1 LCSP): No inferir automáticamente una "document_date de perfección"
      // jurídica exacta desde award_date si el registro no contiene explícitamente ese hito.
      fechaPerfeccion = params.fechaPerfeccion || null;
    } else if (esSupersimplificado) {
      // Art. 159.6 LCSP: Firma de aceptación de la resolución de adjudicación
      fechaPerfeccion = fechaFormalizacion || (params.fechaAdjudicacion || null);
    } else if (tieneFormalizacionExpresa || !params.status) {
      // Art. 36.1 LCSP: Regla general, se perfeccionan con su formalización en documento administrativo
      fechaPerfeccion = fechaFormalizacion || (!params.status ? (params.fechaAdjudicacion || null) : null);
    }
    // En ordinario adjudicado sin formalizar: fechaPerfeccion es null (no perfeccionado aún formalmente)
  }

  // 2. FECHA DE INICIO DE EJECUCIÓN (INICIO MATERIAL)
  let fechaInicioEjecucion: string | null = null;
  if (!isCanceladoODesierto && !esPreAdjudicacion) {
    if (esObra) {
      // Art. 237 LCSP: Vinculado preceptivamente al acta de comprobación del replanteo.
      // La adjudicación no debe utilizarse como inicio material.
      fechaInicioEjecucion = params.fechaActaReplanteo || params.fechaInicioEjecucion || null;
    } else if (esBasado || esSDA) {
      // La adjudicación perfecciona el contrato (Art. 36.3 LCSP), pero no se asume automáticamente
      // que fecha_adjudicación = inicio material de ejecución. Se comprueba si existe document_date
      // contractual/pliego como inicio de ejecución, o formalización/orden explícita.
      fechaInicioEjecucion = params.fechaInicioEjecucion || fechaFormalizacion || null;
    } else if (esMenor) {
      // Para contratos menores: document_date de inicio de ejecución material solo cuando conste específicamente
      fechaInicioEjecucion = params.fechaInicioEjecucion || null;
    } else if (tieneFormalizacionExpresa || !params.status) {
      fechaInicioEjecucion = params.fechaInicioEjecucion || fechaFormalizacion || (!params.status ? (params.fechaAdjudicacion || null) : null);
    }
  }

  // 3. FECHA DE INICIO DEL CÓMPUTO DE VIGENCIA
  let fechaInicioVigencia: string | null = null;
  let etiquetaInicioVigencia: string | null = null;
  let esFechaInicioEstimada = false;

  if (!isCanceladoODesierto && !esPreAdjudicacion) {
    if (params.fechaInicioVigencia) {
      fechaInicioVigencia = params.fechaInicioVigencia;
      etiquetaInicioVigencia = 'contractual explícita';
      esFechaInicioEstimada = false;
    } else if (esObra) {
      // En obras: si consta acta de replanteo se computa desde ella; si está formalizado sin acta
      // desglosada en metadatos, se toma la formalización como ancla referencial supletoria (Art. 237 LCSP).
      // Si solo está adjudicado sin formalizar, fechaInicioVigencia es null.
      if (params.fechaActaReplanteo || params.fechaInicioEjecucion) {
        fechaInicioVigencia = params.fechaActaReplanteo || params.fechaInicioEjecucion || null;
        etiquetaInicioVigencia = 'acta de replanteo';
        esFechaInicioEstimada = false;
      } else if (tieneFormalizacionExpresa || !params.status) {
        fechaInicioVigencia = fechaFormalizacion || (!params.status ? (params.fechaAdjudicacion || null) : null);
        etiquetaInicioVigencia = fechaFormalizacion ? 'formalización' : 'adjudicación';
        esFechaInicioEstimada = false;
      }
    } else if (esBasado || esSDA) {
      // Si existe document_date contractual/pliego, se utiliza; en su defecto formalización o adjudicación (Art. 36.3 LCSP)
      if (params.fechaInicioEjecucion) {
        fechaInicioVigencia = params.fechaInicioEjecucion;
        etiquetaInicioVigencia = 'contractual explícita';
        esFechaInicioEstimada = false;
      } else if (fechaFormalizacion) {
        fechaInicioVigencia = fechaFormalizacion;
        etiquetaInicioVigencia = 'formalización';
        esFechaInicioEstimada = false;
      } else {
        fechaInicioVigencia = params.fechaAdjudicacion || null;
        etiquetaInicioVigencia = 'adjudicación';
        esFechaInicioEstimada = false;
      }
    } else if (esMenor) {
      // CONTRATOS MENORES:
      // 1. Utilizar document_date de inicio contractual explícita cuando exista (params.fechaInicioEjecucion)
      // 2. En ausencia de ella, utilizar la document_date operativa que determine el modelo (params.fechaAdjudicacion),
      //    pero etiquetarla como "estimada según datos disponibles"
      // 3. NUNCA utilizar publication_date trimestral de PLACSP como inicio del contrato menor (Art. 63.4 LCSP)
      if (params.fechaInicioEjecucion) {
        fechaInicioVigencia = params.fechaInicioEjecucion;
        etiquetaInicioVigencia = 'contractual explícita';
        esFechaInicioEstimada = false;
      } else if (params.fechaAdjudicacion) {
        fechaInicioVigencia = params.fechaAdjudicacion;
        etiquetaInicioVigencia = 'estimada según datos disponibles';
        esFechaInicioEstimada = true;
      } else {
        // En ausencia de inicio contractual o adjudicación, nunca usar fechaPublicacion
        fechaInicioVigencia = null;
        etiquetaInicioVigencia = null;
        esFechaInicioEstimada = false;
      }
    } else if (tieneFormalizacionExpresa || !params.status) {
      fechaInicioVigencia = params.fechaInicioEjecucion || fechaFormalizacion || (stLower === 'resuelta' || !params.status ? (params.fechaAdjudicacion || null) : null);
      etiquetaInicioVigencia = params.fechaInicioEjecucion ? 'contractual explícita' : (fechaFormalizacion ? 'formalización' : 'adjudicación');
      esFechaInicioEstimada = false;
    }
  }

  return {
    fechaPerfeccion,
    fechaFormalizacion,
    fechaInicioEjecucion,
    fechaPublicacion,
    fechaInicioVigencia,
    etiquetaInicioVigencia,
    esFechaInicioEstimada,
  };
}

export function evaluarEstadoContractual(params: EvaluacionEstadoContractualParams): EvaluacionEstadoContractual {
  const duracionUnidad = params.durationUnit ?? params.duracionUnidad;
  const prorrogaDiasNorm = params.prorrogaDays ?? params.prorrogaDias;
  params = {
    ...params,
    status: params.status ?? params.estado,
    importeAdjudicacion: params.importeAdjudicacion ?? params.importe_adjudicacion ?? params.awarded_amount,
    duration: params.duration ?? params.duracion,
    duracionUnidad,
    durationUnit: duracionUnidad,
    prorrogaDias: prorrogaDiasNorm,
    prorrogaDays: prorrogaDiasNorm,
    fechaInicioEjecucion: params.fechaInicioEjecucion ?? params.fechaInicio,
  };
  const refDate = params.refDate || new Date();
  const procLower = (params.procedimiento || '').toLowerCase();
  const esMenor = procLower.includes('menor');
  const esBasado = procLower.includes('basado') || procLower.includes('acuerdo marco');
  const esSDA = procLower.includes('dinámico') || procLower.includes('dinamico') || procLower.includes('sda');
  const tipoLower = (params.tipoContrato || '').toLowerCase();
  const esObra = tipoLower.includes('obra');
  const esServicioOSuministro = tipoLower.includes('servicio') || tipoLower.includes('suministro') || tipoLower.includes('concesión');
  const stLower = (params.status ?? params.estado ?? '').toLowerCase().trim();

  const fechas = determinarFechasContractuales(params);

  const durParsed = parseDuration(params.duration, params.duracionUnidad);
  const durBase = formatearDuracion(params.duration, params.duracionUnidad);
  const prorrogaDias = params.prorrogaDias || 0;
  const tieneProrroga = prorrogaDias > 0 || Boolean(params.tieneProrrogaActiva);
  const duracionTexto = prorrogaDias > 0
    ? `${durBase} (+${prorrogaDias} días ampliados por modificación)`
    : durBase;

  // Plurianualidad
  let esPlurianual = false;
  if (durParsed) {
    if (durParsed.unit === 'ANN' && durParsed.val >= 1) esPlurianual = true;
    if (durParsed.unit === 'MON' && durParsed.val >= 12) esPlurianual = true;
    if (durParsed.unit === 'DAY' && durParsed.val >= 365) esPlurianual = true;
  }

  // Prorrogabilidad (Art. 29 LCSP)
  const esProrrogable = !esMenor && !esObra && esServicioOSuministro && (!durParsed || (durParsed.unit === 'ANN' ? durParsed.val < 5 : durParsed.unit === 'MON' ? durParsed.val < 60 : true));

  // 1. DESIERTA
  if (stLower.includes('desiert') || stLower.includes('desert')) {
    return {
      codigo: 'desierta',
      label: ESTADO_CONTRACTUAL_LABELS.desierta,
      esMenorPublicadoPosteriori: false,
      fechas,
      fechaInicioEfectiva: null,
      fechaFinEstimada: null,
      diasRestantes: null,
      estadoVigencia: 'desconocido',
      duracionTexto,
      esPlurianual: false,
      esProrrogable: false,
      hitoInicioRequerido: null,
      observacionJuridica: 'Procedimiento de licitación declarado desierto por falta de ofertas admisibles.',
      etiquetaInicioVigencia: fechas.etiquetaInicioVigencia || null,
      esFechaInicioEstimada: fechas.esFechaInicioEstimada || false,
    };
  }

  // 2. ANULADA / CANCELADA
  if ([
    'anulad', 'annul', 'cancelad', 'cancel', 'renuncia', 'renounc',
    'desist', 'desestimad', 'withdraw',
  ].some((pattern) => stLower.includes(pattern))) {
    return {
      codigo: 'anulada',
      label: ESTADO_CONTRACTUAL_LABELS.anulada,
      esMenorPublicadoPosteriori: false,
      fechas,
      fechaInicioEfectiva: null,
      fechaFinEstimada: null,
      diasRestantes: null,
      estadoVigencia: 'desconocido',
      duracionTexto,
      esPlurianual: false,
      esProrrogable: false,
      hitoInicioRequerido: null,
      observacionJuridica: 'Expediente cancelado o desistido antes o después de la adjudicación.',
      etiquetaInicioVigencia: fechas.etiquetaInicioVigencia || null,
      esFechaInicioEstimada: fechas.esFechaInicioEstimada || false,
    };
  }

  if (getContractStatus({
    estado: params.status ?? params.estado,
    procedimiento: params.procedimiento,
    tipoContrato: params.tipoContrato,
    fechaPublicacion: params.fechaPublicacion,
    fechaLimite: params.fechaLimitePresentacion,
    fechaAdjudicacion: params.fechaAdjudicacion,
    fechaFormalizacion: params.fechaFormalizacion,
    importeAdjudicacion: params.importeAdjudicacion,
    refDate: params.refDate,
  }).code === 'RESOLVED_UNAWARDED') {
    return {
      codigo: 'resuelta_sin_adjudicar',
      label: ESTADO_CONTRACTUAL_LABELS.resuelta_sin_adjudicar,
      esMenorPublicadoPosteriori: false,
      fechas,
      fechaInicioEfectiva: null,
      fechaFinEstimada: null,
      diasRestantes: null,
      estadoVigencia: 'desconocido',
      duracionTexto,
      esPlurianual: false,
      esProrrogable: false,
      hitoInicioRequerido: null,
      observacionJuridica: 'Expediente resuelto administrativamente sin adjudicación formal; no se presume formalización ni ejecución.',
      etiquetaInicioVigencia: fechas.etiquetaInicioVigencia || null,
      esFechaInicioEstimada: false,
    };
  }

  // Detección de contratos menores publicados a posteriori (Art. 63.4 LCSP)
  const esMenorPublicadoPosteriori = Boolean(
    esMenor &&
    params.fechaPublicacion &&
    params.fechaAdjudicacion &&
    new Date(params.fechaPublicacion).getTime() > new Date(params.fechaAdjudicacion).getTime()
  );

  // 3. ADJUDICADA PENDIENTE DE FORMALIZACIÓN
  // Se cumple cuando existe status de adjudicación pero no de formalización, y no es un contrato menor ni basado/SDA perfeccionado
  const tieneFormalizacionExpresa = Boolean(
    params.fechaFormalizacion ||
    stLower.includes('formaliz')
  );
  const tieneAdjudicacion = Boolean(params.fechaAdjudicacion || stLower.includes('adjudic'));
  const isResolvedWithAward =
    (stLower === 'resuelta' || stLower.startsWith('resuelta ') ||
      stLower === 'resolved' || stLower.startsWith('resolved ')) &&
    tieneAdjudicacion;

  const esAdjudicadaSinFormalizar = !esMenor && !esBasado && !esSDA && !tieneFormalizacionExpresa && (
    isResolvedWithAward ||
    stLower === 'adjudicada' ||
    stLower === 'adjudicado' ||
    stLower === 'adjudicada_pendiente_formalizacion' ||
    stLower.includes('pendiente de formalización') ||
    stLower.includes('pendiente formalizacion') ||
    stLower.includes('adjudic')
  );

  if (esAdjudicadaSinFormalizar) {
    return {
      codigo: 'adjudicada_pendiente_formalizacion',
      label: ESTADO_CONTRACTUAL_LABELS.adjudicada_pendiente_formalizacion,
      esMenorPublicadoPosteriori: false,
      fechas,
      fechaInicioEfectiva: null,
      fechaFinEstimada: null,
      diasRestantes: null,
      estadoVigencia: 'pendiente_formalizacion',
      duracionTexto,
      esPlurianual,
      esProrrogable,
      hitoInicioRequerido: esObra 
        ? 'Formalización contractual (Art. 153 LCSP) y posterior Acta de comprobación del replanteo (Art. 237 LCSP)' 
        : 'Formalización contractual en documento administrativo (Art. 153.6 LCSP)',
      observacionJuridica: esObra
        ? 'Adjudicado. En contratos de obras, la adjudicación no inicia el plazo de ejecución; este requiere previa formalización y la firma del acta de comprobación del replanteo (Art. 237 LCSP).'
        : 'Adjudicado. Conforme al artículo 153.6 de la LCSP, no puede iniciarse la ejecución del contrato sin su previa formalización.',
      etiquetaInicioVigencia: fechas.etiquetaInicioVigencia || null,
      esFechaInicioEstimada: fechas.esFechaInicioEstimada || false,
    };
  }

  // 4. PUBLICADA vs EN EVALUACIÓN (Fase previa a la adjudicación)
  if (!tieneAdjudicacion && !tieneFormalizacionExpresa) {
    let esEvaluacion = stLower.includes('evalua');
    if (!esEvaluacion && params.fechaLimitePresentacion) {
      const limiteMs = new Date(params.fechaLimitePresentacion).getTime();
      if (!isNaN(limiteMs) && limiteMs < refDate.getTime()) {
        esEvaluacion = true;
      }
    }

    if (esEvaluacion) {
      return {
        codigo: 'en_evaluacion',
        label: ESTADO_CONTRACTUAL_LABELS.en_evaluacion,
        esMenorPublicadoPosteriori: false,
        fechas,
        fechaInicioEfectiva: null,
        fechaFinEstimada: null,
        diasRestantes: null,
        estadoVigencia: 'desconocido',
        duracionTexto,
        esPlurianual,
        esProrrogable,
        hitoInicioRequerido: 'Cierre de evaluación, propuesta de adjudicación y formalización',
        observacionJuridica: 'Plazo de presentación de ofertas cerrado. Mesa de contratación evaluando plicas.',
        etiquetaInicioVigencia: fechas.etiquetaInicioVigencia || null,
        esFechaInicioEstimada: fechas.esFechaInicioEstimada || false,
      };
    }

    return {
      codigo: 'publicada',
      label: ESTADO_CONTRACTUAL_LABELS.publicada,
      esMenorPublicadoPosteriori: false,
      fechas,
      fechaInicioEfectiva: null,
      fechaFinEstimada: null,
      diasRestantes: null,
      estadoVigencia: 'desconocido',
      duracionTexto,
      esPlurianual,
      esProrrogable,
      hitoInicioRequerido: 'Cierre de plazo de ofertas y adjudicación',
      observacionJuridica: 'Convocatoria publicada oficialmente. Abierto el plazo reglamentario de presentación de ofertas.',
      etiquetaInicioVigencia: fechas.etiquetaInicioVigencia || null,
      esFechaInicioEstimada: fechas.esFechaInicioEstimada || false,
    };
  }

  // 5. DETERMINACIÓN DE LA FECHA DE INICIO DE EJECUCIÓN Y VIGENCIA (CONTRATOS FORMALIZADOS O EXENTOS)
  const fechaInicioEfectiva = fechas.fechaInicioVigencia;
  let hitoInicioRequerido: string | null = null;

  if (esObra) {
    hitoInicioRequerido = fechas.fechaInicioEjecucion
      ? 'Acta de comprobación del replanteo suscrita (Art. 237 LCSP)'
      : 'Acta de comprobación del replanteo (Art. 237 LCSP, preceptiva para inicio material de obras)';
  } else if (esBasado || esSDA) {
    hitoInicioRequerido = fechas.fechaInicioEjecucion
      ? 'Orden de inicio / inicio contractual del contrato basado (Art. 36.3 LCSP)'
      : 'Perfeccionado por adjudicación (Art. 36.3 LCSP); inicio material sujeto a orden de entrega/servicio';
  } else if (esMenor) {
    hitoInicioRequerido = fechas.fechaInicioEjecucion
      ? 'Inicio de ejecución material acreditado en case_number menor (Art. 118 LCSP)'
      : 'Tramitación de case_number menor y encargo/adjudicación (Arts. 118 y 153.1 LCSP). Inicio de vigencia estimado según datos disponibles';
  }

  let finDate: Date | null = null;
  if (params.fechaFinExplicita) {
    const explicitEnd = new Date(params.fechaFinExplicita);
    if (!isNaN(explicitEnd.getTime())) {
      finDate = explicitEnd;
    }
  }

  if (!finDate) {
    finDate = calcularFechaFin(fechaInicioEfectiva, params.duration, params.duracionUnidad);
    if (finDate && prorrogaDias > 0) {
      finDate = new Date(finDate.getTime() + prorrogaDias * 24 * 60 * 60 * 1000);
    }
  }

  if (!finDate || !fechaInicioEfectiva) {
    return {
      codigo: 'formalizada_en_vigor',
      label: ESTADO_CONTRACTUAL_LABELS.formalizada_en_vigor,
      esMenorPublicadoPosteriori,
      fechas,
      fechaInicioEfectiva,
      fechaFinEstimada: null,
      diasRestantes: null,
      estadoVigencia: 'desconocido',
      duracionTexto,
      esPlurianual,
      esProrrogable,
      hitoInicioRequerido,
      observacionJuridica: 'Contrato formalizado con duración no estipulada en días o meses.',
      etiquetaInicioVigencia: fechas.etiquetaInicioVigencia || null,
      esFechaInicioEstimada: fechas.esFechaInicioEstimada || false,
    };
  }

  const diffMs = finDate.getTime() - refDate.getTime();
  const diasRestantes = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const fechaFinEstimada = finDate.toISOString().slice(0, 10);

  // 6. VENCIDA
  if (diasRestantes < 0) {
    return {
      codigo: 'vencida',
      label: ESTADO_CONTRACTUAL_LABELS.vencida,
      esMenorPublicadoPosteriori,
      fechas,
      fechaInicioEfectiva,
      fechaFinEstimada,
      diasRestantes,
      estadoVigencia: 'vencido',
      duracionTexto,
      esPlurianual,
      esProrrogable,
      hitoInicioRequerido,
      observacionJuridica: 'Plazo contractual y prórrogas legales transcurridos.',
      etiquetaInicioVigencia: fechas.etiquetaInicioVigencia || null,
      esFechaInicioEstimada: fechas.esFechaInicioEstimada || false,
    };
  }

  // 7. PRORROGADA
  if (tieneProrroga) {
    return {
      codigo: 'prorrogada',
      label: ESTADO_CONTRACTUAL_LABELS.prorrogada,
      esMenorPublicadoPosteriori,
      fechas,
      fechaInicioEfectiva,
      fechaFinEstimada,
      diasRestantes,
      estadoVigencia: diasRestantes <= 180 ? 'proximo_vencimiento' : 'en_vigor',
      duracionTexto,
      esPlurianual,
      esProrrogable,
      hitoInicioRequerido,
      observacionJuridica: `Contrato en periodo de prórroga o modificación de plazo (+${prorrogaDias} días).`,
      etiquetaInicioVigencia: fechas.etiquetaInicioVigencia || null,
      esFechaInicioEstimada: fechas.esFechaInicioEstimada || false,
    };
  }

  // 8. FORMALIZADA / EN VIGOR
  return {
    codigo: 'formalizada_en_vigor',
    label: ESTADO_CONTRACTUAL_LABELS.formalizada_en_vigor,
    esMenorPublicadoPosteriori,
    fechas,
    fechaInicioEfectiva,
    fechaFinEstimada,
    diasRestantes,
    estadoVigencia: diasRestantes <= 180 ? 'proximo_vencimiento' : 'en_vigor',
    duracionTexto,
    esPlurianual,
    esProrrogable,
    hitoInicioRequerido,
    observacionJuridica: esObra
      ? 'Contrato de obras formalizado. La ejecución material computa tras la firma del acta de replanteo (Art. 237 LCSP).'
      : (esBasado || esSDA)
      ? 'Contrato basado perfeccionado conforme al Art. 36.3 LCSP en vigor.'
      : esMenor
      ? (fechas.esFechaInicioEstimada
          ? 'Contrato menor en vigor. Cómputo de vigencia con document_date de inicio estimada según datos disponibles (encargo/adjudicación), distinguiendo tramitación del case_number, factura y publicación trimestral ex-post en PLACSP (Arts. 63.4, 118 y 153.1 LCSP).'
          : 'Contrato menor en vigor con document_date de inicio de ejecución explícita acreditada en case_number (Arts. 118 y 153.1 LCSP).')
      : 'Contrato formalizado en vigor y en periodo regular de ejecución.',
    etiquetaInicioVigencia: fechas.etiquetaInicioVigencia || null,
    esFechaInicioEstimada: fechas.esFechaInicioEstimada || false,
  };
}

export function evaluarVigenciaContrato(
  fechaAdjudicacion: string | null | undefined,
  fechaPublicacion: string | null | undefined,
  duration: string | null | undefined,
  duracionUnidad: string | null | undefined,
  tipoContrato: string | null | undefined,
  procedimiento: string | null | undefined,
  refDate: Date = new Date(),
  fechaFormalizacion?: string | null | undefined,
  prorrogaDias?: number | null | undefined,
  status?: string | null | undefined,
  tieneProrrogaActiva?: boolean | null | undefined,
  fechaLimitePresentacion?: string | null | undefined,
  fechaInicioEjecucion?: string | null | undefined,
  fechaActaReplanteo?: string | null | undefined,
  fechaPerfeccion?: string | null | undefined,
  fechaFinExplicita?: string | null | undefined
) {
  const evalContractual = evaluarEstadoContractual({
    status,
    procedimiento,
    tipoContrato,
    fechaPublicacion,
    fechaLimitePresentacion,
    fechaAdjudicacion,
    fechaFormalizacion,
    fechaInicioEjecucion,
    fechaActaReplanteo,
    fechaPerfeccion,
    duration,
    duracionUnidad,
    prorrogaDias,
    fechaFinExplicita,
    tieneProrrogaActiva,
    refDate,
  });

  return {
    fechaFinEstimada: evalContractual.fechaFinEstimada,
    diasRestantes: evalContractual.diasRestantes,
    estadoVigencia: evalContractual.estadoVigencia,
    duracionTexto: evalContractual.duracionTexto,
    esPlurianual: evalContractual.esPlurianual,
    esProrrogable: evalContractual.esProrrogable,
    estadoContractual: evalContractual.codigo,
    estadoContractualLabel: evalContractual.label,
    esMenorPublicadoPosteriori: evalContractual.esMenorPublicadoPosteriori,
    hitoInicioRequerido: evalContractual.hitoInicioRequerido,
    observacionJuridica: evalContractual.observacionJuridica,
    fechas: evalContractual.fechas,
    fechaPerfeccion: evalContractual.fechas.fechaPerfeccion,
    fechaFormalizacion: evalContractual.fechas.fechaFormalizacion,
    fechaInicioEjecucion: evalContractual.fechas.fechaInicioEjecucion,
    fechaPublicacion: evalContractual.fechas.fechaPublicacion,
    fechaInicioVigencia: evalContractual.fechas.fechaInicioVigencia,
    etiquetaInicioVigencia: evalContractual.fechas.etiquetaInicioVigencia || null,
    esFechaInicioEstimada: evalContractual.fechas.esFechaInicioEstimada || false,
  };
}

export function getContratosVivosStats(
  getDbSync: () => DatabaseSync,
  scope?: string | null,
  refDate: Date = new Date()
): ContratosVivosStats {
  const db = getDbSync();
  const filterScope = parseScope(scope);

  const hasLotAwardsTable = (() => {
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT name FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards'").all() as Array<{ name: string }>;
      return tables.length > 0;
    } catch {
      return false;
    }
  })();

  const whereParts = [
    hasLotAwardsTable
      ? `(awardee IS NOT NULL AND awardee != '' OR EXISTS (SELECT 1 FROM lot_awards award WHERE award.contract_id = contracts.id AND award.awardee IS NOT NULL AND trim(award.awardee) != '' AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}) OR EXISTS (SELECT 1 FROM contract_lots lot WHERE lot.contract_id = contracts.id AND lot.awardee IS NOT NULL AND trim(lot.awardee) != '' AND ${eligibleAwardLotStatusSql('lot')}))`
      : "awardee IS NOT NULL AND awardee != ''"
  ];
  const params: any[] = [];

  if (filterScope) {
    whereParts.push('scope = ?');
    params.push(filterScope);
  }

  const hasLotAwardColumn = (() => {
    try {
      const columns = db.prepare("PRAGMA table_info(contract_lots)").all() as Array<{ name: string }>;
      return columns.some((column) => column.name === 'awarded_amount');
    } catch {
      return false;
    }
  })();

  const lotAwardsAwardeeCovered = hasLotAwardsTable
    ? `(NOT EXISTS (
        SELECT 1 FROM contract_lots lot
        WHERE lot.contract_id = contracts.id
          AND lot.awardee IS NOT NULL
          AND trim(lot.awardee) <> ''
          AND ${eligibleAwardLotStatusSql('lot')}
          AND NOT EXISTS (
            SELECT 1 FROM lot_awards award
            WHERE award.contract_id = contracts.id
              AND award.lot_number = lot.lot_number
              AND award.awardee IS NOT NULL
              AND trim(award.awardee) <> ''
              AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          )
      ))`
    : '0';

  const lotAwardsAmountCovered = hasLotAwardsTable
    ? lotAwardsAmountCoverageSql('contracts')
    : '0';

  const lotAwardeeSource = hasLotAwardsTable
    ? `(CASE WHEN ${lotAwardsAwardeeCovered}
        THEN (SELECT group_concat(DISTINCT award.awardee)
              FROM lot_awards award
              WHERE award.contract_id = contracts.id
                AND award.awardee IS NOT NULL
                AND trim(award.awardee) <> ''
                AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')})
        ELSE (SELECT group_concat(DISTINCT lot.awardee)
              FROM contract_lots lot
              WHERE lot.contract_id = contracts.id
                AND lot.awardee IS NOT NULL
                AND trim(lot.awardee) <> ''
                AND ${eligibleAwardLotStatusSql('lot')}
                AND ${excludeLegacyLotWhenStructuredTerminalResultSql('lot')})
      END)`
    : `(SELECT group_concat(DISTINCT lot.awardee)
       FROM contract_lots lot
       WHERE lot.contract_id = contracts.id
         AND lot.awardee IS NOT NULL
         AND trim(lot.awardee) <> ''
         AND ${eligibleAwardLotStatusSql('lot')})`;

  const lotAwardeeExists = hasLotAwardsTable
    ? `SELECT 1
       WHERE (${lotAwardsAwardeeCovered} AND EXISTS (
         SELECT 1 FROM lot_awards award
         WHERE award.contract_id = contracts.id
           AND award.awardee IS NOT NULL
           AND trim(award.awardee) <> ''
           AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
       )) OR EXISTS (
         SELECT 1 FROM contract_lots lot
         WHERE lot.contract_id = contracts.id
           AND lot.awardee IS NOT NULL
           AND trim(lot.awardee) <> ''
           AND ${eligibleAwardLotStatusSql('lot')}
       )`
    : `SELECT 1
       FROM contract_lots lot
       WHERE lot.contract_id = contracts.id
         AND lot.awardee IS NOT NULL
         AND trim(lot.awardee) <> ''
         AND ${eligibleAwardLotStatusSql('lot')}`;

  const amountExpression = hasLotAwardColumn
    ? `CASE
        WHEN award_amount_type IS NULL OR award_amount_type = 'total' THEN
          CASE
            WHEN ${lotAwardsAmountCovered} AND EXISTS (
              SELECT 1
              FROM lot_awards award
              WHERE award.contract_id = contracts.id
                AND award.awarded_amount IS NOT NULL
                AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
            )
            THEN (
              SELECT round(sum(award.awarded_amount), 2)
              FROM lot_awards award
              WHERE award.contract_id = contracts.id
                AND award.awarded_amount IS NOT NULL
                AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
            )
            WHEN EXISTS (
              SELECT 1
              FROM contract_lots lot
              WHERE lot.contract_id = contracts.id
                AND lot.awarded_amount IS NOT NULL
                AND ${eligibleAwardLotStatusSql('lot')}
            )
            THEN (
              SELECT round(sum(lot.awarded_amount), 2)
              FROM contract_lots lot
              WHERE lot.contract_id = contracts.id
                AND lot.awarded_amount IS NOT NULL
                AND ${eligibleLegacyLotAwardAmountSql('lot', hasLotAwardsTable)}
            )
            ELSE CASE WHEN ${allowParentAwardAmountFallbackSql('contracts', hasLotAwardsTable)} THEN coalesce(awarded_amount, 0) ELSE NULL END
          END
        ELSE NULL
      END`
    : `CASE WHEN award_amount_type IS NULL OR award_amount_type = 'total' THEN coalesce(awarded_amount, 0) ELSE NULL END`;

  const rows = db.prepare(`
    SELECT 
      id, case_number, object_description, contract_type, procedure AS procedimiento, contracting_authority_name,
      CASE
        WHEN EXISTS (${lotAwardeeExists}) THEN coalesce((${lotAwardeeSource}), awardee)
        ELSE awardee
      END as awardee,
      CASE
        WHEN EXISTS (${lotAwardeeExists}) THEN NULL
        ELSE awardee_nif
      END as awardee_nif,
      ${amountExpression} as amount,
      award_date, formalization_date, publication_date, duration, duration_unit, scope, status,
      NULL as ultima_modificacion_motivo
    FROM contracts
    WHERE ${whereParts.join(' AND ')}
  `).all(...params) as any[];

  const modificacionesRows = db.prepare(`
    SELECT
      contract_id,
      reason,
      modification_date,
      modification_number,
      coalesce(nullif(duration_days, 0), duration_months * 30.41, 0) as duration_days
    FROM modifications
    WHERE (reason IS NOT NULL AND trim(reason) != '')
       OR coalesce(duration_days, 0) > 0
       OR coalesce(duration_months, 0) > 0
    ORDER BY modification_date DESC, modification_number DESC
  `).all() as any[];
  const motivosPorLicitacion = new Map<string, any[]>();
  const prorrogaDiasPorLicitacion = new Map<string, number>();
  for (const mod of modificacionesRows) {
    const list = motivosPorLicitacion.get(mod.contract_id) || [];
    list.push(mod);
    motivosPorLicitacion.set(mod.contract_id, list);

    const dias = Number(mod.duration_days);
    if (Number.isFinite(dias) && dias > 0) {
      prorrogaDiasPorLicitacion.set(
        mod.contract_id,
        (prorrogaDiasPorLicitacion.get(mod.contract_id) || 0) + dias,
      );
    }
  }

  const todosVivos: ContratoVivoItem[] = [];

  for (const r of rows) {
    const vig = evaluarVigenciaContrato(
      r.award_date,
      r.publication_date,
      r.duration,
      r.duration_unit,
      r.contract_type,
      r.procedimiento,
      refDate,
      r.formalization_date,
      prorrogaDiasPorLicitacion.get(r.id) ?? 0,
      r.status,
      null,
      null,
      null,
      null,
      (() => {
        const motivos = motivosPorLicitacion.get(r.id) || [];
        for (const mod of motivos) {
          const document_date = extraerFechaFinExplicita(mod.reason);
          if (document_date) return document_date;
        }
        return null;
      })()
    );

    // Solo contratos que todavía no hayan vencido
    if (vig.diasRestantes !== null && vig.diasRestantes >= 0) {
      todosVivos.push({
        id: r.id,
        case_number: r.case_number || 'Sin exp.',
        object_description: r.object_description || '',
        tipo: r.contract_type || 'Otros',
        procedimiento: r.procedimiento || 'Sin especificar',
        organo: r.contracting_authority_name || 'Sin organismo',
        awardee: r.awardee,
        nifAdjudicatario: r.awardee_nif,
        amount: r.amount == null ? null : Number(r.amount),
        fechaInicio: (vig.fechaInicioVigencia || r.award_date || r.publication_date || '').slice(0, 10),
        duracionTexto: vig.duracionTexto,
        duracionValor: r.duration ? parseFloat(r.duration) : null,
        duracionUnidad: r.duration_unit,
        fechaFinEstimada: vig.fechaFinEstimada,
        diasRestantes: vig.diasRestantes,
        estadoVigencia: vig.estadoVigencia,
        esPlurianual: vig.esPlurianual,
        esProrrogable: vig.esProrrogable,
        scope: r.scope || 'Directa Municipal',
      });
    }
  }

  // Ordenar por document_date fin estimada ascendente (los que vencen antes primero)
  todosVivos.sort((a, b) => {
    if (a.fechaFinEstimada && b.fechaFinEstimada) {
      return a.fechaFinEstimada.localeCompare(b.fechaFinEstimada);
    }
    return (a.diasRestantes ?? 99999) - (b.diasRestantes ?? 99999);
  });

  const proximosVencimientos6Meses = todosVivos.filter((c) => (c.diasRestantes ?? 99999) <= 180);
  const proximos30Dias = todosVivos.filter((c) => (c.diasRestantes ?? 99999) <= 30);
  const plurianuales = todosVivos.filter((c) => c.esPlurianual);

  const totalVivos = todosVivos.length;
  const volumenVivoTotal = Math.round(todosVivos.reduce((acc, c) => acc + (c.amount ?? 0), 0) * 100) / 100;

  const vencenEn6Meses = proximosVencimientos6Meses.length;
  const volumenVence6Meses = Math.round(proximosVencimientos6Meses.reduce((acc, c) => acc + (c.amount ?? 0), 0) * 100) / 100;

  const vencenEn30Dias = proximos30Dias.length;
  const volumenVence30Dias = Math.round(proximos30Dias.reduce((acc, c) => acc + (c.amount ?? 0), 0) * 100) / 100;

  const plurianualesVivos = plurianuales.length;
  const volumenPlurianual = Math.round(plurianuales.reduce((acc, c) => acc + (c.amount ?? 0), 0) * 100) / 100;

  // Distribución por tipo de contrato
  const tiposMap = new Map<string, { vivos: number; volumen: number; vencen6Meses: number }>();
  for (const c of todosVivos) {
    const prev = tiposMap.get(c.tipo) || { vivos: 0, volumen: 0, vencen6Meses: 0 };
    prev.vivos += 1;
    prev.volumen += c.amount ?? 0;
    if ((c.diasRestantes ?? 9999) <= 180) {
      prev.vencen6Meses += 1;
    }
    tiposMap.set(c.tipo, prev);
  }

  const distribucionPorTipo = Array.from(tiposMap.entries())
    .map(([tipo, data]) => ({
      tipo,
      vivos: data.vivos,
      volumen: Math.round(data.volumen * 100) / 100,
      vencen6Meses: data.vencen6Meses,
    }))
    .sort((a, b) => b.vivos - a.vivos);

  // Distribución por organismo
  const organosMap = new Map<string, { vivos: number; volumen: number; vencen6Meses: number }>();
  for (const c of todosVivos) {
    const prev = organosMap.get(c.organo) || { vivos: 0, volumen: 0, vencen6Meses: 0 };
    prev.vivos += 1;
    prev.volumen += c.amount ?? 0;
    if ((c.diasRestantes ?? 9999) <= 180) {
      prev.vencen6Meses += 1;
    }
    organosMap.set(c.organo, prev);
  }

  const distribucionPorOrganismo = Array.from(organosMap.entries())
    .map(([organo, data]) => ({
      organo,
      vivos: data.vivos,
      volumen: Math.round(data.volumen * 100) / 100,
      vencen6Meses: data.vencen6Meses,
    }))
    .sort((a, b) => b.volumen - a.volumen);

  return {
    kpis: {
      totalVivos,
      volumenVivoTotal,
      vencenEn6Meses,
      volumenVence6Meses,
      vencenEn30Dias,
      volumenVence30Dias,
      plurianualesVivos,
      volumenPlurianual,
    },
    proximosVencimientos6Meses,
    todosVivos,
    distribucionPorTipo,
    distribucionPorOrganismo,
  };
}