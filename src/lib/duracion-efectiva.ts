import { eligibleAwardLotStatusSql, eligibleAwardResultStateSql, excludeAwardWhenLegacyLotTerminalSql, lotAwardsAmountCoverageSql, eligibleLegacyLotAwardAmountSql, allowParentAwardAmountFallbackSql, excludeLegacyLotWhenStructuredTerminalResultSql } from './lot-status.js';
import { getDb, parseScope } from './db';
import { parseDuration, calcularFechaFin, formatearDuracion } from './contratos-vivos';

export interface DuracionContratoItem {
  id: string;
  case_number: string;
  object_description: string;
  organo: string;
  tipo: string;
  procedimiento: string;
  awardee: string;
  nifAdjudicatario: string | null;
  amount: number | null;
  duracionPrevistaDias: number;
  duracionPrevistaTexto: string;
  duracionEfectivaDias: number;
  duracionEfectivaTexto: string;
  desviacionDias: number;
  ratioDuracion: number;
  desviacionPct: number;
  fechaInicio: string;
  fechaFinPrevista: string;
  fechaUltimaActividad: string;
  categoriaDilacion: 'a_tiempo' | 'dilacion_moderada' | 'dilacion_severa' | 'dilacion_critica';
  alertaArt29: boolean;
  esDiscrepanciaRegistral?: boolean;
  esDesfaseExtremo?: boolean;
  notaMetodologica?: string;
  artLCSP: string;
  url: string | null;
  year: number | null;
}

export interface DuracionEfectivaStats {
  resumen: {
    totalEvaluados: number;
    conDesviacion: number;
    pctConDesviacion: number;
    ratioMedioGlobal: number;
    desviacionMediaDias: number;
    casosCriticosArt29: number;
    casosDiscrepanciaRegistral: number;
    volumenConDesviacion: number;
    volumenDiscrepanciaRegistral: number;
    mas5xCount: number;
    de3xa5xCount: number;
    de1_5xa3xCount: number;
    hasta1_5xCount: number;
  };
  tramosDesviacion: {
    rango: string;
    description: string;
    count: number;
    pct: number;
    volumen: number;
    level: 'alerta' | 'advertencia' | 'moderada' | 'a_tiempo';
  }[];
  porTipoContrato: {
    tipo: string;
    total: number;
    conDesviacion: number;
    pctDesviacion: number;
    ratioMedio: number;
    volumen: number;
  }[];
  porOrganismo: {
    organo: string;
    total: number;
    conDesviacion: number;
    pctDesviacion: number;
    ratioMedio: number;
    volumen: number;
  }[];
  rankingObrasDemora: DuracionContratoItem[];
  rankingServiciosProrrogas: DuracionContratoItem[];
  contratosConDilacion: DuracionContratoItem[];
  topDesviacionesGlobales: DuracionContratoItem[];
}

function formatearDiasATexto(dias: number): string {
  if (dias <= 0) return '0 días';
  if (dias < 30) return `${Math.round(dias)} días`;
  if (dias < 365) {
    const meses = Math.round((dias / 30.41) * 10) / 10;
    return `${meses} meses`;
  }
  const anos = Math.round((dias / 365) * 10) / 10;
  return `${anos} años`;
}

export function getDuracionEfectivaStats(year?: number | string, scope?: string): DuracionEfectivaStats {
  const db = getDb();
  const anoNum = Number(year);
  const filterByAno = !isNaN(anoNum) && anoNum > 0;
  const filterScope = parseScope(scope);

  const whereClauses = [
    "duration IS NOT NULL",
    "award_date IS NOT NULL",
    "publication_date IS NOT NULL"
  ];
  const params: any[] = [];

  if (filterByAno) {
    whereClauses.push("year = ?");
    params.push(anoNum);
  }
  if (filterScope) {
    whereClauses.push("scope = ?");
    params.push(filterScope);
  }

  const hasLotAwardsTable = (() => {
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT name FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards'").all() as Array<{ name: string }>;
      return tables.length > 0;
    } catch {
      return false;
    }
  })();

  const lotAwardsAwardeeCovered = hasLotAwardsTable
    ? `(NOT EXISTS (
        SELECT 1 FROM contract_lots lot
        WHERE lot.contract_id = contracts.id
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

  const query = `
    SELECT 
      id,
      case_number,
      object_description,
      contracting_authority_name as organo,
      contract_type as tipo,
      procedure as procedimiento,
      duration,
      duration_unit,
      substr(award_date, 1, 10) as award_date,
      substr(publication_date, 1, 10) as publication_date,
      round(CASE
        WHEN award_amount_type IS NULL OR award_amount_type = 'total' THEN
          CASE
            WHEN ${lotAwardsAmountCovered} AND EXISTS (
              SELECT 1 FROM lot_awards award
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
              SELECT 1 FROM contract_lots lot
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
      END, 2) as amount,
      CASE
        WHEN EXISTS (${lotAwardeeExists}) THEN coalesce((${lotAwardeeSource}), awardee, 'Sin awardee')
        ELSE coalesce(awardee, 'Sin awardee')
      END as awardee,
      CASE
        WHEN EXISTS (${lotAwardeeExists}) THEN NULL
        ELSE awardee_nif
      END as awardee_nif,
      source_url AS url,
      year
    FROM contracts
    WHERE ${whereClauses.join(' AND ')}
  `;

  const rows = db.prepare(query).all(...params) as any[];

  let totalEvaluados = 0;
  let conDesviacion = 0;
  let sumaRatios = 0;
  let sumaDesviacionDias = 0;
  let casosCriticosArt29 = 0;
  let casosDiscrepanciaRegistral = 0;
  let volumenConDesviacion = 0;
  let volumenDiscrepanciaRegistral = 0;

  let mas5xCount = 0;
  let de3xa5xCount = 0;
  let de1_5xa3xCount = 0;
  let hasta1_5xCount = 0;

  let tramoATiempoCount = 0;
  let tramoATiempoVol = 0;

  let tramoModCount = 0;
  let tramoModVol = 0;

  let tramoSevCount = 0;
  let tramoSevVol = 0;

  let tramoCritCount = 0;
  let tramoCritVol = 0;

  const tipoMap: Record<string, { total: number; conDesv: number; sumRatio: number; volumen: number }> = {};
  const organoMap: Record<string, { total: number; conDesv: number; sumRatio: number; volumen: number }> = {};

  const todosContratos: DuracionContratoItem[] = [];

  for (const r of rows) {
    const durParsed = parseDuration(r.duration, r.duration_unit);
    if (!durParsed || durParsed.val <= 0) continue;

    let plannedDays = 0;
    if (durParsed.unit === 'DAY') plannedDays = durParsed.val;
    else if (durParsed.unit === 'MON') plannedDays = durParsed.val * 30.41;
    else if (durParsed.unit === 'ANN') plannedDays = durParsed.val * 365;

    if (plannedDays <= 0) continue;

    const fInicio = new Date(r.award_date);
    const fPub = new Date(r.publication_date);
    if (isNaN(fInicio.getTime()) || isNaN(fPub.getTime())) continue;

    totalEvaluados++;

    const fFinEstimada = calcularFechaFin(r.award_date, r.duration, r.duration_unit);
    const fechaFinPrevistaStr = fFinEstimada ? fFinEstimada.toISOString().substring(0, 10) : r.award_date;

    // Duración registrada: lapso temporal transcurrido entre inicio y la última actividad / publicación registrada en PLACSP
    const elapsedDays = Math.round((fPub.getTime() - fInicio.getTime()) / (1000 * 86400));
    const effectiveDays = Math.max(Math.round(plannedDays), elapsedDays);
    const desvDias = Math.max(0, effectiveDays - Math.round(plannedDays));
    const ratio = Math.round((effectiveDays / plannedDays) * 100) / 100;
    const desvPct = Math.round(((effectiveDays - plannedDays) / plannedDays) * 1000) / 10;

    const amount = r.amount == null ? null : Number(r.amount);
    const tipo = r.tipo || 'Otros';
    const organo = r.organo || 'Otros';
    const tipoLower = tipo.toLowerCase();
    const esServicioOSuministro = tipoLower.includes('servicio') || tipoLower.includes('suministro');
    const esMenor = Boolean(r.procedimiento?.toLowerCase().includes('menor'));

    // Distinción crítica (Art. 29.8 LCSP y publicación telemática):
    // 1) Contratos menores no pueden legalmente durar más de 1 año ni tener prórroga. Lapsos > 365 días en menores corresponden a registros masivos tardíos en PLACSP.
    // 2) Cualquier contrato con ratio > 5x suele responder a publicación/actualización administrativa diferida de la plataforma, no a dilación material demostrada.
    const esDesfaseExtremo = ratio >= 5;
    const esDiscrepanciaRegistral = (esMenor && (elapsedDays > 365 || (ratio > 3 && elapsedDays > 180))) || esDesfaseExtremo;

    if (esDiscrepanciaRegistral) {
      casosDiscrepanciaRegistral++;
      volumenDiscrepanciaRegistral += amount ?? 0;
    }

    // Regla de alerta Art. 29 LCSP:
    // Excede el tope de 5 años (1.825 días) en servicios/suministros o ratio > 2.5 con más de 90 días o menor con desfase legal
    const excedeTope5Anos = esServicioOSuministro && effectiveDays > 1825;
    const excedeRatioGrave = ratio >= 2.5 && desvDias > 30;
    const alertaArt29 = excedeTope5Anos || excedeRatioGrave || esDiscrepanciaRegistral;

    if (alertaArt29) {
      casosCriticosArt29++;
    }

    let categoriaDilacion: DuracionContratoItem['categoriaDilacion'] = 'a_tiempo';
    if (ratio <= 1.05) {
      categoriaDilacion = 'a_tiempo';
      tramoATiempoCount++;
      tramoATiempoVol += amount ?? 0;
    } else if (ratio <= 1.5) {
      categoriaDilacion = 'dilacion_moderada';
      tramoModCount++;
      tramoModVol += amount ?? 0;
    } else if (ratio <= 2.5) {
      categoriaDilacion = 'dilacion_severa';
      tramoSevCount++;
      tramoSevVol += amount ?? 0;
    } else {
      categoriaDilacion = 'dilacion_critica';
      tramoCritCount++;
      tramoCritVol += amount ?? 0;
    }

    if (ratio > 1.05) {
      conDesviacion++;
      sumaDesviacionDias += desvDias;
      volumenConDesviacion += amount ?? 0;

      if (ratio > 5) {
        mas5xCount++;
      } else if (ratio > 3) {
        de3xa5xCount++;
      } else if (ratio >= 1.5) {
        de1_5xa3xCount++;
      } else {
        hasta1_5xCount++;
      }
    }
    sumaRatios += ratio;

    // Agrupación por tipo
    if (!tipoMap[tipo]) {
      tipoMap[tipo] = { total: 0, conDesv: 0, sumRatio: 0, volumen: 0 };
    }
    tipoMap[tipo].total++;
    tipoMap[tipo].volumen += amount ?? 0;
    tipoMap[tipo].sumRatio += ratio;
    if (ratio > 1.05) tipoMap[tipo].conDesv++;

    // Agrupación por organismo
    if (!organoMap[organo]) {
      organoMap[organo] = { total: 0, conDesv: 0, sumRatio: 0, volumen: 0 };
    }
    organoMap[organo].total++;
    organoMap[organo].volumen += amount ?? 0;
    organoMap[organo].sumRatio += ratio;
    if (ratio > 1.05) organoMap[organo].conDesv++;

    const artLCSP = tipoLower.includes('obra')
      ? (esDesfaseExtremo
          ? `Art. 195 LCSP (Duración registrada muy superior a la prevista · Ratio ${ratio}x · Requiere comprobación documental)`
          : 'Art. 195 LCSP (Plazo de ejecución de obra y penalidades)')
      : esMenor && esDiscrepanciaRegistral
      ? 'Art. 29.8 LCSP (Límite legal 1 año contrato menor · Desfase administrativo en PLACSP)'
      : esDesfaseExtremo
      ? `Duración registrada muy superior a la duración prevista (Ratio ${ratio}x · Requiere comprobación documental)`
      : excedeTope5Anos
      ? 'Art. 29.4 LCSP (Excede límite legal de 5 años en servicios/suministros)'
      : 'Art. 29.2 LCSP (Régimen legal de prórrogas contractuales)';

    const notaMetodologica = ratio >= 3
      ? `Duración registrada muy superior a la duración prevista (ratio ${ratio}x). ${ratio >= 5 ? 'Este caso requiere comprobación documental. ' : ''}Fechas utilizadas para el cálculo: Adjudicación/formalización (${r.award_date || 'No reg.'}), Fin prevista según pliego (${fechaFinPrevistaStr}), Última publicación registrada en la Plataforma (${r.publication_date || 'No reg.'}). Qué debe comprobar el investigador: expediente en la Plataforma, prórrogas aprobadas, modificaciones contractuales, resoluciones de suspensión o ampliación de plazo, acta de recepción o liquidación, fecha real de finalización material y partes de ejecución.`
      : esDiscrepanciaRegistral
      ? `Posible anomalía registral o desfase de publicación en PLACSP. Fechas utilizadas para el cálculo: Adjudicación/formalización (${r.award_date || 'No reg.'}), Fin estimada pliego (${fechaFinPrevistaStr}), Última publicación registrada en la Plataforma (${r.publication_date || 'No reg.'}). No constituye dilación física acreditada. Corresponde al investigador comprobar en PLACSP el case_number, factura y acta de recepción/liquidación.`
      : undefined;

    const item: DuracionContratoItem = {
      id: r.id,
      case_number: r.case_number,
      object_description: r.object_description,
      organo,
      tipo,
      procedimiento: r.procedimiento,
      awardee: r.awardee,
      nifAdjudicatario: r.awardee_nif,
      amount,
      duracionPrevistaDias: Math.round(plannedDays),
      duracionPrevistaTexto: formatearDuracion(r.duration, r.duration_unit),
      duracionEfectivaDias: effectiveDays,
      duracionEfectivaTexto: formatearDiasATexto(effectiveDays),
      desviacionDias: desvDias,
      ratioDuracion: ratio,
      desviacionPct: desvPct,
      fechaInicio: r.award_date,
      fechaFinPrevista: fechaFinPrevistaStr,
      fechaUltimaActividad: r.publication_date,
      categoriaDilacion,
      alertaArt29,
      esDiscrepanciaRegistral,
      esDesfaseExtremo,
      notaMetodologica,
      artLCSP,
      url: r.url,
      year: r.year ? Math.round(Number(r.year)) : null,
    };

    todosContratos.push(item);
  }

  const tramosDesviacion: DuracionEfectivaStats['tramosDesviacion'] = [
    {
      rango: 'A tiempo (Ratio ≤ 1.05x)',
      description: 'Ejecutados o finalizados dentro del plazo previsto en pliegos sin dilaciones apreciables.',
      count: tramoATiempoCount,
      pct: totalEvaluados > 0 ? Math.round((tramoATiempoCount / totalEvaluados) * 1000) / 10 : 0,
      volumen: Math.round(tramoATiempoVol * 100) / 100,
      level: 'a_tiempo',
    },
    {
      rango: 'Dilación Moderada (1.05x a 1.50x)',
      description: 'Desviación temporal de hasta un 50% sobre la duración prevista (prórrogas ordinarias o retrasos menores).',
      count: tramoModCount,
      pct: totalEvaluados > 0 ? Math.round((tramoModCount / totalEvaluados) * 1000) / 10 : 0,
      volumen: Math.round(tramoModVol * 100) / 100,
      level: 'moderada',
    },
    {
      rango: 'Dilación Severa (1.50x a 2.50x)',
      description: 'La duración real supera entre un 50% y un 150% el plazo inicial fijado por la administración.',
      count: tramoSevCount,
      pct: totalEvaluados > 0 ? Math.round((tramoSevCount / totalEvaluados) * 1000) / 10 : 0,
      volumen: Math.round(tramoSevVol * 100) / 100,
      level: 'advertencia',
    },
    {
      rango: 'Dilación Crítica (> 2.50x o >5 años)',
      description: 'La duración real más que duplica el plazo inicial o sobrepasa el tope legal del Art. 29 LCSP.',
      count: tramoCritCount,
      pct: totalEvaluados > 0 ? Math.round((tramoCritCount / totalEvaluados) * 1000) / 10 : 0,
      volumen: Math.round(tramoCritVol * 100) / 100,
      level: 'alerta',
    },
  ];

  const porTipoContrato = Object.entries(tipoMap)
    .map(([tipo, d]) => ({
      tipo,
      total: d.total,
      conDesviacion: d.conDesv,
      pctDesviacion: d.total > 0 ? Math.round((d.conDesv / d.total) * 1000) / 10 : 0,
      ratioMedio: d.total > 0 ? Math.round((d.sumRatio / d.total) * 100) / 100 : 1,
      volumen: Math.round(d.volumen * 100) / 100,
    }))
    .sort((a, b) => b.conDesviacion - a.conDesviacion);

  const porOrganismo = Object.entries(organoMap)
    .map(([organo, d]) => ({
      organo,
      total: d.total,
      conDesviacion: d.conDesv,
      pctDesviacion: d.total > 0 ? Math.round((d.conDesv / d.total) * 1000) / 10 : 0,
      ratioMedio: d.total > 0 ? Math.round((d.sumRatio / d.total) * 100) / 100 : 1,
      volumen: Math.round(d.volumen * 100) / 100,
    }))
    .sort((a, b) => b.conDesviacion - a.conDesviacion);

  // Top Obras con mayor retraso
  const rankingObrasDemora = todosContratos
    .filter((c) => c.tipo.toLowerCase().includes('obra') && c.desviacionDias > 0)
    .sort((a, b) => b.desviacionDias - a.desviacionDias);

  // Top Servicios con mayores prórrogas o duración
  const rankingServiciosProrrogas = todosContratos
    .filter((c) => (c.tipo.toLowerCase().includes('servicio') || c.tipo.toLowerCase().includes('suministro')) && c.ratioDuracion > 1.2)
    .sort((a, b) => b.ratioDuracion - a.ratioDuracion);

  // Todos los contratos con dilación (base para filtro por gravedad)
  const contratosConDilacion = [...todosContratos]
    .filter((c) => c.ratioDuracion > 1.05)
    .sort((a, b) => b.ratioDuracion - a.ratioDuracion);

  // Top Desviaciones Globales
  const topDesviacionesGlobales = [...todosContratos]
    .filter((c) => c.desviacionDias > 0)
    .sort((a, b) => b.ratioDuracion - a.ratioDuracion)
    .slice(0, 50);

  return {
    resumen: {
      totalEvaluados,
      conDesviacion,
      pctConDesviacion: totalEvaluados > 0 ? Math.round((conDesviacion / totalEvaluados) * 1000) / 10 : 0,
      ratioMedioGlobal: totalEvaluados > 0 ? Math.round((sumaRatios / totalEvaluados) * 100) / 100 : 1,
      desviacionMediaDias: conDesviacion > 0 ? Math.round(sumaDesviacionDias / conDesviacion) : 0,
      casosCriticosArt29,
      casosDiscrepanciaRegistral,
      volumenConDesviacion: Math.round(volumenConDesviacion * 100) / 100,
      volumenDiscrepanciaRegistral: Math.round(volumenDiscrepanciaRegistral * 100) / 100,
      mas5xCount,
      de3xa5xCount,
      de1_5xa3xCount,
      hasta1_5xCount,
    },
    tramosDesviacion: tramosDesviacion.map((t) => ({ ...t, nivel: t.level })),
    porTipoContrato,
    porOrganismo,
    rankingObrasDemora: rankingObrasDemora.slice(0, 30),
    rankingServiciosProrrogas: rankingServiciosProrrogas.slice(0, 30),
    contratosConDilacion,
    topDesviacionesGlobales,
  };
}