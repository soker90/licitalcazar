/**
 * Indicador 5 — Detección de Fraccionamiento de Contratos Menores
 *
 * Indicio (no infracción) de acumulación de contratos menores del mismo
 * proveedor ante el mismo organismo que, sumados en una ventana deslizante
 * de 365 días, superan el umbral del art. 118 LCSP (15.000 € servicios y
 * suministros; 40.000 € obras).
 *
 * Módulo de funciones PURAS: no accede a SQLite ni a I/O. db.ts consulta
 * los datos y los inyecta aquí; los tests validan la lógica sin base de datos.
 */

export const UMBRAL_OBRAS = 40000;
export const UMBRAL_NO_OBRAS = 15000;
export const VENTANA_DIAS = 365;
export const FECHA_RDL_3_2020 = '2020-02-06';
export const MIN_CONTRATOS_VENTANA = 2;

export type BucketUmbral = 'obras' | 'no-obras';
export type Severidad = 'alta' | 'media' | 'baja';
export type PatronContinuidad =
  | 'recurrente_anual'
  | 'recurrente_menores'
  | 'patron_concentracion'
  | 'posible_fraccionamiento';

/** Contrato menor normalizado que recibe el detector (viene de db.ts). */
export interface FraccionamientoContrato {
  id?: string;
  /** Identidad corporativa canónica (canonical_id) o fallback nif/razón social. */
  canonicalId: string | null;
  adjudicatario: string;
  nif: string | null;
  grupoId: string | null;
  grupoNombre: string | null;
  /** Identidad interna estable del órgano de contratación. */
  authorityId?: string | null;
  organo: string;
  tipoContrato: string;
  objeto: string;
  cpv: string | null;
  /** Base imponible (importe_adjudicacion). Las filas sin importe no se incluyen. */
  importeSinIva: number;
  /** Fecha de adjudicación ISO 'YYYY-MM-DD'. */
  fechaAdjudicacion: string;
}

export interface FraccionamientoItem {
  contratoIds?: string[];
  adjudicatario: string;
  nif: string | null;
  canonicalId: string | null;
  grupoNombre: string | null;
  viaGrupo: boolean;
  organo: string;
  bucketUmbral: BucketUmbral;
  umbral: number;
  numContratos: number;
  suma: number;
  excesoPct: number;
  fechaInicio: string;
  fechaFin: string;
  spanDias: number;
  numVentanas: number;
  similitudObjetos: number;
  severidad: Severidad;
  scoreEscala: number;
  patronContinuidad?: PatronContinuidad;
  justificacionPatron?: string;
  explicacionesAlternativas?: string[];
  documentosInvestigacion?: string[];
  preRDL2020: boolean;
  objetos: string[];
  /** Contratos del grupo en la ventana principal sin importe_adjudicacion (excluidos del cálculo). */
  contratosSinImporte: number;
}

export interface FraccionamientoResultado {
  casos: FraccionamientoItem[];
  totalCasos: number;
}

/** Bucket del umbral por igualdad sobre el tipo normalizado (no por inclusión). */
export function bucketDeTipo(tipo: string | null | undefined): BucketUmbral {
  return (tipo || '').trim().toLowerCase() === 'obras' ? 'obras' : 'no-obras';
}

export function umbralDeBucket(bucket: BucketUmbral): number {
  return bucket === 'obras' ? UMBRAL_OBRAS : UMBRAL_NO_OBRAS;
}

/** Clave de identidad corporativa con fallback (canonical_id → nif → razón social). */
function identidadDe(c: FraccionamientoContrato): string {
  return c.canonicalId || c.nif || c.adjudicatario;
}

const STOPWORDS = new Set([
  // Castellano general
  'de', 'la', 'el', 'los', 'las', 'del', 'en', 'para', 'y', 'o', 'u', 'a', 'e', 'al',
  'con', 'por', 'que', 'un', 'una', 'unos', 'unas', 'su', 'sus', 'se', 'es', 'son',
  'como', 'mas', 'más', 'lo', 'no', 'ni', 'sobre', 'entre', 'desde', 'hasta', 'otros',
  'otras', 'otro', 'otra', 'tal', 'todo', 'toda', 'todos', 'todas', 'incluido',
  'incluida', 'incluidos', 'incluidas', 'mediante', 'asi', 'así', 'su', 'sus',
  // Términos genéricos del dominio
  'contrato', 'menor', 'suministro', 'suministros', 'servicio', 'servicios', 'obra',
  'obras', 'ayuntamiento', 'alcazar', 'san', 'juan',
]);

/** Normaliza un objeto del contrato a tokens comparables. */
export function tokensDeObjeto(objeto: string | null | undefined): string[] {
  return (objeto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Similitud de Jaccard entre dos conjuntos de tokens. */
export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let interseccion = 0;
  for (const t of setA) if (setB.has(t)) interseccion++;
  const union = setA.size + setB.size - interseccion;
  return union === 0 ? 0 : interseccion / union;
}

/** Media de Jaccard por pares; refuerzo a 0.8 si todos comparten CPV a 5 dígitos. */
export function similitudObjetos(objetos: string[], cpvs: (string | null)[]): number {
  const tokens = objetos.map((o) => tokensDeObjeto(o));
  let suma = 0;
  let pares = 0;
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      suma += jaccard(tokens[i], tokens[j]);
      pares++;
    }
  }
  let sim = pares === 0 ? 0 : suma / pares;
  if (
    objetos.length >= MIN_CONTRATOS_VENTANA &&
    cpvs.length === objetos.length &&
    cpvs.every((c) => c && c.length >= 5) &&
    cpvs.every((c) => (c as string).slice(0, 5) === (cpvs[0] as string).slice(0, 5))
  ) {
    sim = Math.max(sim, 0.8);
  }
  return Math.round(sim * 100) / 100;
}

/** Severidad según similitud y exceso sobre el umbral. */
export function severidadDe(similitudObjetos: number, excesoPct: number): Severidad {
  if (similitudObjetos >= 0.5 && excesoPct >= 20) return 'alta';
  if (similitudObjetos >= 0.5 || excesoPct >= 50) return 'media';
  return 'baja';
}

function aFecha(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

interface Ventana {
  inicio: number;
  fin: number;
  suma: number;
}

/**
 * Ventana deslizante: para cada contrato suma hacia atrás los importes con
 * fecha en [fecha - 365 días, fecha]. Fusiona ventanas candidatas solapadas
 * en ventanas disjuntas y recalcula su suma.
 */
export function ventanasDisjuntas(
  contratos: FraccionamientoContrato[],
  umbral: number
): Ventana[] {
  const ordenados = [...contratos].sort(
    (a, b) => aFecha(a.fechaAdjudicacion) - aFecha(b.fechaAdjudicacion)
  );
  const fechas = ordenados.map((c) => aFecha(c.fechaAdjudicacion));
  const dia = 86_400_000;

  const candidatas: Ventana[] = [];
  for (let i = 0; i < ordenados.length; i++) {
    let suma = 0;
    let j = i;
    while (j >= 0 && fechas[i] - fechas[j] <= VENTANA_DIAS * dia) {
      suma += ordenados[j].importeSinIva;
      j--;
    }
    if (suma >= umbral) candidatas.push({ inicio: j + 1, fin: i, suma });
  }
  if (candidatas.length === 0) return [];

  // Fusionar solapadas en disjuntas
  const fusionadas: Ventana[] = [];
  for (const w of candidatas) {
    const ultima = fusionadas[fusionadas.length - 1];
    if (ultima && w.inicio <= ultima.fin) {
      // Solo fusionar si la unión sigue cabiendo en una ventana de 365 días.
      // Una cadena A-B-C puede tener ventanas A-B y B-C válidas aunque A-C
      // supere 365 días; fusionarlas inflaría artificialmente la suma.
      const unionInicio = Math.min(ultima.inicio, w.inicio);
      const unionFin = Math.max(ultima.fin, w.fin);
      const spanUnion = fechas[unionFin] - fechas[unionInicio];
      if (spanUnion <= VENTANA_DIAS * dia) {
        ultima.inicio = unionInicio;
        ultima.fin = unionFin;
      } else {
        fusionadas.push({ ...w });
      }
    } else {
      fusionadas.push({ ...w });
    }
  }

  return fusionadas.map((w) => {
    let suma = 0;
    for (let x = w.inicio; x <= w.fin; x++) suma += ordenados[x].importeSinIva;
    return { ...w, suma };
  });
}

/**
 * Calcula la puntuación en la escala metodológica 1–3 / 3–5 / >5:
 * - Informativa (Riesgo bajo): 1.0 – 3.0
 * - Severidad Media (Riesgo notable): 3.1 – 5.0
 * - Severidad Alta (Riesgo prioritario / crítico): > 5.0 (5.1 – 9.5)
 */
export function calcularScoreEscala(
  severidad: Severidad,
  similitud: number,
  excesoPct: number,
  spanDias: number
): number {
  if (severidad === 'alta') {
    const extraSim = similitud * 2.0;
    const extraExc = Math.min(2.0, (excesoPct / 100) * 1.5);
    const extraConcentracion = spanDias <= 90 ? 0.5 : 0;
    const score = 5.2 + extraSim + extraExc + extraConcentracion;
    return Math.round(Math.min(9.5, score) * 10) / 10;
  }
  if (severidad === 'media') {
    const extraSim = similitud * 0.8;
    const extraExc = Math.min(1.0, (excesoPct / 100) * 0.8);
    const score = 3.2 + extraSim + extraExc;
    return Math.round(Math.min(5.0, score) * 10) / 10;
  }
  const extraSim = similitud * 0.6;
  const extraExc = Math.min(0.8, (excesoPct / 100) * 0.5);
  const score = 1.2 + extraSim + extraExc;
  return Math.round(Math.min(3.0, score) * 10) / 10;
}

/**
 * Genera posibles explicaciones alternativas legítimas y guía documental de cotejo
 * para convertir cada señal analítica en una herramienta de investigación rigurosa.
 */
export function generarExplicacionesYDocumentos(
  patron: PatronContinuidad
): { explicaciones: string[]; documentos: string[] } {
  const explicaciones: string[] = [];
  const documentos: string[] = [];

  switch (patron) {
    case 'recurrente_anual':
      explicaciones.push(
        'Renovación periódica o anual de servicios operativos ordinarios (ej. primas de seguro de instalaciones, ensayos analíticos de agua según RD 3/2023 o mantenimiento ordinario).'
      );
      explicaciones.push(
        'Prestaciones distribuidas en ejercicios presupuestarios diferenciados que se devengan con periodicidad anual.'
      );
      documentos.push('Informe de necesidad del contrato menor (art. 118.2 LCSP) suscrito por el responsable del servicio.');
      documentos.push('Comprobación de si el órgano ha planificado o iniciado un procedimiento abierto plurianual para este servicio recurrente.');
      documentos.push('Facturas conformadas y actas de recepción de cada ejercicio económico.');
      break;

    case 'patron_concentracion':
      explicaciones.push(
        'Prestaciones técnicas independientes vinculadas a eventos, festividades o programas municipales diferenciados (ej. ferias, festivales culturales específicos o campamentos segmentados por edad infantil/juvenil).'
      );
      explicaciones.push(
        'Servicios que responden a actividades específicas con fechas de ejecución, público objetivo o requisitos técnicos independientes.'
      );
      documentos.push('Memoria justificativa y programa de actividades de cada evento o festividad específica.');
      documentos.push('Cotejo de fechas efectivas de prestación/montaje y público destinatario de cada contrato.');
      documentos.push('Valorar si las necesidades permitían la licitación previa de un contrato abierto por lotes para la temporada.');
      break;

    case 'recurrente_menores':
      explicaciones.push(
        'Atención reiterada de necesidades operativas de la administración mediante contratos menores sucesivos por falta de acuerdo marco o licitación abierta vigente.'
      );
      explicaciones.push(
        'Contrataciones independientes motivadas por imprevistos operativos o insuficiencia de recursos técnicos propios.'
      );
      documentos.push('Informes de fiscalización e intervención municipal sobre la procedencia de licitar en abierto.');
      documentos.push('Plan Anual de Contratación del organismo para verificar la previsión del servicio.');
      documentos.push('Decretos de aprobación de gasto y justificación de no fraccionamiento del art. 118.2 LCSP.');
      break;

    case 'posible_fraccionamiento':
    default:
      explicaciones.push(
        'Encargo urgente o sobrevenido de actuaciones de la misma naturaleza técnica en un lapso temporal corto sin previsión previa conjunta.'
      );
      explicaciones.push(
        'Posible insuficiencia presupuestaria puntual que derivó en la tramitación por fases o ejecuciones parciales.'
      );
      documentos.push('Expedientes completos en PLACSP y memorias técnicas para verificar la unidad funcional y técnica del objeto.');
      documentos.push('Informes del órgano de contratación justificando la imposibilidad de contratar mediante procedimiento abierto.');
      documentos.push('Certificaciones de obra o partes de trabajo para comprobar si existió continuidad material simultánea.');
      break;
  }

  return { explicaciones, documentos };
}

/**
 * Clasifica la tipología de continuidad temporal y funcional de los contratos de la ventana:
 * - recurrente_anual: contratos espaciados (> 8 meses o anualidades sucesivas diferenciadas, e.g. pólizas de seguro Zurich o análisis de agua).
 * - recurrente_menores: necesidades estructurales atendidas repetidamente mediante contratos menores (doctrina OIReScon).
 * - patron_concentracion: acumulación temporal en misma temporada pero con eventos, festividades o públicos diferenciados (e.g. ferias/festivales o campamento infantil vs juvenil).
 * - posible_fraccionamiento: concentración temporal corta (< 120 días) con identidad/alta similitud funcional y superación del umbral.
 */
export function clasificarPatronContinuidad(
  ventana: FraccionamientoContrato[],
  spanDias: number,
  similitudObjetos: number,
  excesoPct: number,
  numVentanas: number
): { patron: PatronContinuidad; justificacion: string } {
  const objetos = ventana.map((c) => c.objeto.toLowerCase());

  // Detectar mención a años específicos en los objetos (p.ej. 2024, 2025, 2026)
  const anosEnObjetos = new Set<string>();
  for (const obj of objetos) {
    const matches = obj.match(/\b(201[89]|202[0-9])\b/g);
    if (matches) {
      matches.forEach((m) => anosEnObjetos.add(m));
    }
  }

  // Detección de servicios periódicos típicos (seguros, primas, pólizas, análisis de aguas reglamentarios)
  const esServicioPeriodicoReglamentario = objetos.some(
    (o) =>
      o.includes('seguro') ||
      o.includes('poliza') ||
      o.includes('póliza') ||
      o.includes('cobertura') ||
      o.includes('siniestro') ||
      o.includes('rd 3/2023') ||
      o.includes('agua potable') ||
      o.includes('analisis de agua') ||
      o.includes('análisis de agua')
  );

  // Detección de eventos culturales, festivos o programaciones singulares
  const eventosDistintos = new Set<string>();
  const EVENT_KEYWORDS = [
    'feria y fiestas', 'feria de los sabores', 'carnaval', 'navidad', 'reyes',
    'lebowski', 'blues festival', 'escenarios de verano', 'festival', 'concierto',
    'teatro', 'semana santa', 'quijote'
  ];
  for (const obj of objetos) {
    for (const kw of EVENT_KEYWORDS) {
      if (obj.includes(kw)) {
        eventosDistintos.add(kw);
      }
    }
  }

  // Intervalos entre contratos consecutivos
  const fechas = ventana
    .map((c) => aFecha(c.fechaAdjudicacion))
    .sort((a, b) => a - b);

  const diffs: number[] = [];
  for (let i = 1; i < fechas.length; i++) {
    diffs.push(Math.round((fechas[i] - fechas[i - 1]) / 86_400_000));
  }
  const minIntervalo = diffs.length > 0 ? Math.min(...diffs) : spanDias;

  // 1. Caso Recurrente Periódico Anual (falsos positivos de seguro / servicio anual regular)
  if (
    (spanDias >= 240 && minIntervalo >= 180) ||
    (anosEnObjetos.size >= 2 && spanDias >= 180) ||
    (esServicioPeriodicoReglamentario && spanDias >= 180)
  ) {
    return {
      patron: 'recurrente_anual',
      justificacion:
        '🟢 Recurrente periódico: Contratación distribuida periódicamente en ejercicios consecutivos (intervalo > 8 meses o anualidades diferenciadas). Patrón compatible con renovación regular de servicios periódicos (ej. pólizas de seguro anuales o análisis periódicos de control de agua).',
    };
  }

  // 2. Comprobar si hay palabras clave de diferenciación pedagógica/destinatarios o eventos
  const tieneDiferenciacionPublico =
    objetos.some((o) => o.includes('infantil')) && objetos.some((o) => o.includes('juvenil'));

  if (tieneDiferenciacionPublico || eventosDistintos.size >= 2) {
    return {
      patron: 'patron_concentracion',
      justificacion:
        '🟠 Patrón que merece revisión: Contratos concentrados en la misma programación municipal pero vinculados a eventos, festividades o públicos o proyectos diferenciados (ej. actividades infantiles vs juveniles o festivales culturales específicos que justifican comprobar si convenía licitar por lotes).',
    };
  }

  // 3. Caso Recurrente Menores (OIReScon)
  if (spanDias > 180 || numVentanas > 1 || (ventana.length >= 3 && minIntervalo >= 60)) {
    return {
      patron: 'recurrente_menores',
      justificacion:
        '🟡 Recurrente mediante contratos menores: Uso reiterado de contratos menores para atender una necesidad periódica continuada. Conforme a la doctrina de la OIReScon y el Tribunal de Cuentas, este tipo de necesidades estructurales deberían licitarse preferentemente mediante procedimientos abiertos o acuerdos marco plurianuales.',
    };
  }

  // 4. Caso Concentración Temporal vs Posible Fraccionamiento
  if (similitudObjetos >= 0.5 && excesoPct >= 20) {
    return {
      patron: 'posible_fraccionamiento',
      justificacion:
        '🔴 Posible fraccionamiento: Concentración temporal en ventana corta con alta similitud de objeto funcional y superación del umbral analítico de referencia (cifra tomada del art. 118.1 LCSP) (señal de revisión prioritaria).',
    };
  }

  return {
    patron: 'patron_concentracion',
    justificacion:
      '🟠 Patrón que merece revisión: Múltiples contratos menores adjudicados en un intervalo temporal corto con objetos o prestaciones heterogéneas que justifican comprobar si convenía su licitación por lotes.',
  };
}

function casoDeGrupo(grupo: FraccionamientoContrato[], viaGrupo: boolean, grupoNombre: string | null): FraccionamientoItem | null {
  const bucket = bucketDeTipo(grupo[0].tipoContrato);
  const umbral = umbralDeBucket(bucket);
  // Solo los contratos con base imponible participan en las sumas de ventana.
  const conImporte = grupo
    .filter((c) => c.importeSinIva > 0)
    .sort((a, b) => aFecha(a.fechaAdjudicacion) - aFecha(b.fechaAdjudicacion));
  if (conImporte.length === 0) return null;
  const ventanas = ventanasDisjuntas(conImporte, umbral);
  if (ventanas.length === 0) return null;

  const principal = ventanas.reduce((a, b) => (b.suma > a.suma ? b : a));
  // Un único contrato no puede "fraccionar": la acumulación exige pluralidad.
  if (principal.fin - principal.inicio + 1 < MIN_CONTRATOS_VENTANA) return null;

  const ventana = conImporte.slice(principal.inicio, principal.fin + 1);
  const fechaInicio = ventana[0].fechaAdjudicacion.slice(0, 10);
  const fechaFin = ventana[ventana.length - 1].fechaAdjudicacion.slice(0, 10);

  const sinImporteEnVentana = grupo.filter((c) => {
    if (c.importeSinIva > 0) return false;
    const f = c.fechaAdjudicacion.slice(0, 10);
    return f >= fechaInicio && f <= fechaFin;
  }).length;

  const suma = Math.round(principal.suma * 100) / 100;
  const excesoPct = Math.round(((suma - umbral) / umbral) * 100);
  const similitud = similitudObjetos(
    ventana.map((c) => c.objeto),
    ventana.map((c) => c.cpv)
  );
  const primera = ventana[0];
  const spanDias = Math.round((aFecha(fechaFin) - aFecha(fechaInicio)) / 86_400_000);

  const { patron: patronContinuidad, justificacion: justificacionPatron } = clasificarPatronContinuidad(
    ventana,
    spanDias,
    similitud,
    excesoPct,
    ventanas.length
  );

  let severidad = severidadDe(similitud, excesoPct);
  // Ningún patrón recurrente periódico ni concentración de proyectos justificados debe elevarse a severidad alta
  if (
    (patronContinuidad === 'recurrente_anual' ||
      patronContinuidad === 'patron_concentracion' ||
      patronContinuidad === 'recurrente_menores') &&
    severidad === 'alta'
  ) {
    severidad = 'media';
  }

  const scoreEscala = calcularScoreEscala(severidad, similitud, excesoPct, spanDias);
  const { explicaciones: explicacionesAlternativas, documentos: documentosInvestigacion } =
    generarExplicacionesYDocumentos(patronContinuidad);

  return {
    contratoIds: ventana.map((c) => c.id).filter(Boolean) as string[],
    adjudicatario: primera.adjudicatario,
    nif: primera.nif,
    canonicalId: viaGrupo ? null : (primera.canonicalId || primera.nif),
    grupoNombre: viaGrupo ? (grupoNombre || null) : null,
    viaGrupo,
    organo: primera.organo,
    bucketUmbral: bucket,
    umbral,
    numContratos: ventana.length,
    suma,
    excesoPct,
    fechaInicio,
    fechaFin,
    spanDias,
    numVentanas: ventanas.length,
    similitudObjetos: similitud,
    severidad,
    scoreEscala,
    patronContinuidad,
    justificacionPatron,
    explicacionesAlternativas,
    documentosInvestigacion,
    preRDL2020: fechaFin < FECHA_RDL_3_2020,
    objetos: ventana.map((c) => c.objeto),
    contratosSinImporte: sinImporteEnVentana,
  };
}

const ORDEN_SEVERIDAD: Record<Severidad, number> = { alta: 0, media: 1, baja: 2 };

/**
 * Casos cuyo periodo de la ventana principal solapa el ejercicio indicado:
 * la acumulación de una cadena de renovaciones sigue "activa" en cada año que toca.
 */
export function casosDelAno(casos: FraccionamientoItem[], ano: number): FraccionamientoItem[] {
  const inicio = `${ano}-01-01`;
  const fin = `${ano}-12-31`;
  return casos.filter((c) => c.fechaFin >= inicio && c.fechaInicio <= fin);
}

/** Agrupa por (empresa canónica, organismo, bucket) y detecta los casos. */
export function detectarFraccionamiento(
  contratos: FraccionamientoContrato[]
): FraccionamientoResultado {
  const authorityKeyByContract = new Map<FraccionamientoContrato, string>();
  contratos.forEach((contract, index) => {
    authorityKeyByContract.set(
      contract,
      contract.authorityId || `unlinked-contract:${contract.id || index}`
    );
  });
  const individuales = new Map<string, FraccionamientoContrato[]>();
  for (const c of contratos) {
    const key = `${identidadDe(c)}||${authorityKeyByContract.get(c)}||${bucketDeTipo(c.tipoContrato)}`;
    const arr = individuales.get(key);
    if (arr) arr.push(c);
    else individuales.set(key, [c]);
  }

  const casos: FraccionamientoItem[] = [];
  const casosIndividualesPorGrupo = new Map<string, Set<string>>();

  for (const grupo of individuales.values()) {
    const caso = casoDeGrupo(grupo, false, null);
    if (!caso) continue;
    casos.push(caso);
    // Registrar el (organo||bucket) cubierto para cada grupo empresarial implicado
    const gids = new Set(grupo.map((c) => c.grupoId).filter(Boolean));
    for (const gid of gids) {
      const set = casosIndividualesPorGrupo.get(gid as string) || new Set();
      const authorityKey = authorityKeyByContract.get(grupo[0]);
      if (authorityKey) set.add(`${authorityKey}||${caso.bucketUmbral}`);
      casosIndividualesPorGrupo.set(gid as string, set);
    }
  }

  // Segunda pasada: agregación por grupo empresarial
  const grupos = new Map<string, { gid: string; organo: string; bucket: BucketUmbral; contratos: FraccionamientoContrato[]; nombre: string | null }>();
  for (const c of contratos) {
    if (!c.grupoId) continue;
    const bucket = bucketDeTipo(c.tipoContrato);
    const authorityKey = authorityKeyByContract.get(c);
    const key = `grupo:${c.grupoId}||${authorityKey}||${bucket}`;
    const entry = grupos.get(key);
    if (entry) entry.contratos.push(c);
    else grupos.set(key, { gid: c.grupoId, organo: c.organo, bucket, contratos: [c], nombre: c.grupoNombre });
  }

  for (const entry of grupos.values()) {
    const cubierto = casosIndividualesPorGrupo.get(entry.gid);
    const authorityKey = authorityKeyByContract.get(entry.contratos[0]);
    if (authorityKey && cubierto?.has(`${authorityKey}||${entry.bucket}`)) continue;
    const caso = casoDeGrupo(entry.contratos, true, entry.nombre);
    if (caso) casos.push(caso);
  }

  casos.sort((a, b) => {
    const bySeverity = ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad];
    if (bySeverity !== 0) return bySeverity;

    const byExceso = b.excesoPct - a.excesoPct;
    if (byExceso !== 0) return byExceso;

    // Desempate determinista: evita que el orden de filas SQLite afecte a los
    // IDs posicionales ALERT-MENOR-XXXX durante reconstrucciones reproducibles.
    const keyA = [
      a.adjudicatario,
      a.organo,
      a.fechaInicio,
      a.fechaFin,
      a.canonicalId || '',
      a.grupoNombre || '',
      (a.contratoIds || []).join('|'),
    ].join('||');
    const keyB = [
      b.adjudicatario,
      b.organo,
      b.fechaInicio,
      b.fechaFin,
      b.canonicalId || '',
      b.grupoNombre || '',
      (b.contratoIds || []).join('|'),
    ].join('||');
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });

  return { casos, totalCasos: casos.length };
}
