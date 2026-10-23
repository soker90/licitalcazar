import { eligibleAwardLotStatusSql, eligibleAwardResultStateSql, excludeAwardWhenLegacyLotTerminalSql, lotAwardsAmountCoverageSql, eligibleLegacyLotAwardAmountSql, allowParentAwardAmountFallbackSql, excludeLegacyLotWhenStructuredTerminalResultSql } from './lot-status.js';
import { getDb, parseScope } from './db';
import { terminalContractStatusSql } from './contract-status-sql';

export interface ModificadoItem {
  id: string;
  case_number: string;
  object_description: string;
  organo: string;
  tipo: string;
  procedimiento: string;
  awardee: string;
  nifAdjudicatario: string | null;
  importeInicial: number;
  importeFinal: number;
  desviacionEuros: number;
  desviacionPct: number;
  tipoModificado: 'modificacion_contractual' | 'proyecto_modificado';
  supera20Pct: boolean;
  artLCSP: string;
  url: string | null;
  year: number | null;
  reason?: string;
}

export interface ProyectoModificadoCadena {
  idProyecto: string;
  title: string;
  organo: string;
  tipo: string;
  importeOriginal: number;
  importeFinal: number;
  sobrecosteTotal: number;
  incrementoPct: number;
  expedienteOriginal: string;
  expedienteFinal: string;
  adjudicatarioPrincipal: string;
  contratosCadena: {
    case_number: string;
    object_description: string;
    tipo: string;
    amount: number;
    awardee: string;
    rol: 'contrato_original' | 'modificacion_contractual';
    year: number;
    url?: string | null;
  }[];
  motivoExplicativo: string;
  supera20Pct: boolean;
}

export interface ContratistaModificados {
  awardee: string;
  nif: string | null;
  totalModificados: number;
  volumenOriginal: number;
  volumenFinal: number;
  sobrecosteTotal: number;
  desviacionMediaPct: number;
}

export interface OrganismoModificados {
  organo: string;
  totalCasos: number;
  sobrecosteTotal: number;
  casosMas20Pct: number;
}

export interface ProrrogaItem {
  id: string;
  licitacionId: string;
  case_number: string;
  object_description: string;
  organo: string;
  tipo: string;
  awardee: string;
  nifAdjudicatario: string | null;
  diasProrroga: number;
  mesesProrroga: number;
  duracionValor: number;
  duracionUnidad: string;
  fechaModificacion: string | null;
  reason?: string;
  tipoModificacion: string;
  importeModificacion: number;
  documentoUrl: string | null;
}

export interface ModificadosStats {
  resumen: {
    totalCasos: number;
    sobrecosteAcumulado: number;
    desviacionMaximaPct: number;
    casosMas20Pct: number;
    totalCadenasProyectos: number;
    volumenTotalFinal: number;
    gastoModificadosRedaccion: number;
    totalContratosConProrroga: number;
    totalDiasProrroga: number;
  };
  cadenasProyectos: ProyectoModificadoCadena[];
  rankingObras: ModificadoItem[];
  rankingContratistas: ContratistaModificados[];
  rankingOrganismos: OrganismoModificados[];
  rankingProrrogas: ProrrogaItem[];
}

export function getModificadosStats(year?: number | string, scope?: string): ModificadosStats {
  const db = getDb();
  const anoNum = Number(year);
  const filterByAno = !isNaN(anoNum) && anoNum > 0;
  const filterScope = parseScope(scope);

  const whereClauses = ["1=1"];
  const params: any[] = [];

  if (filterByAno) {
    whereClauses.push("year = ?");
    params.push(anoNum);
  }
  if (filterScope) {
    whereClauses.push("scope = ?");
    params.push(filterScope);
  }

  // Solo consideramos modificados cuando PLACSP ha publicado una modificación contractual.
  // La diferencia entre PBL e amount adjudicado NO demuestra por sí sola un modificado.
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
        WHERE lot.contract_id = l.id
          AND lot.awardee IS NOT NULL
          AND trim(lot.awardee) <> ''
          AND ${eligibleAwardLotStatusSql('lot')}
          AND NOT EXISTS (
            SELECT 1 FROM lot_awards award
            WHERE award.contract_id = l.id
              AND award.lot_number = lot.lot_number
              AND award.awardee IS NOT NULL
              AND trim(award.awardee) <> ''
              AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          )
      ))`
    : '0';

  const lotAwardsAmountCovered = hasLotAwardsTable
    ? lotAwardsAmountCoverageSql('l')
    : '0';

  const lotAwardeeSource = hasLotAwardsTable
    ? `(CASE WHEN ${lotAwardsAwardeeCovered}
        THEN (SELECT group_concat(DISTINCT award.awardee)
              FROM lot_awards award
              WHERE award.contract_id = l.id
                AND award.awardee IS NOT NULL
                AND trim(award.awardee) <> ''
                AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')})
        ELSE (SELECT group_concat(DISTINCT lot.awardee)
              FROM contract_lots lot
              WHERE lot.contract_id = l.id
                AND lot.awardee IS NOT NULL
                AND trim(lot.awardee) <> ''
                AND ${eligibleAwardLotStatusSql('lot')}
                AND ${excludeLegacyLotWhenStructuredTerminalResultSql('lot')})
      END)`
    : `(SELECT group_concat(DISTINCT lot.awardee)
       FROM contract_lots lot
       WHERE lot.contract_id = l.id
         AND lot.awardee IS NOT NULL
         AND trim(lot.awardee) <> ''
         AND ${eligibleAwardLotStatusSql('lot')})`;

  const lotAwardeeExists = hasLotAwardsTable
    ? `SELECT 1
       WHERE (${lotAwardsAwardeeCovered} AND EXISTS (
         SELECT 1 FROM lot_awards award
         WHERE award.contract_id = l.id
           AND award.awardee IS NOT NULL
           AND trim(award.awardee) <> ''
           AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
       )) OR EXISTS (
         SELECT 1 FROM contract_lots lot
         WHERE lot.contract_id = l.id
           AND lot.awardee IS NOT NULL
           AND trim(lot.awardee) <> ''
           AND ${eligibleAwardLotStatusSql('lot')}
       )`
    : `SELECT 1
       FROM contract_lots lot
       WHERE lot.contract_id = l.id
         AND lot.awardee IS NOT NULL
         AND trim(lot.awardee) <> ''
         AND ${eligibleAwardLotStatusSql('lot')}`;

const queryModificados = `
    SELECT l.id, l.case_number, l.object_description, l.contracting_authority_name as organo, l.contract_type as tipo, l.procedure AS procedimiento,
      round(CASE
        WHEN (l.award_amount_type IS NULL OR l.award_amount_type = 'total') THEN
          CASE
            WHEN ${lotAwardsAmountCovered} AND EXISTS (
              SELECT 1 FROM lot_awards award
              WHERE award.contract_id = l.id
                AND award.awarded_amount IS NOT NULL
                AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
            )
            THEN (
              SELECT round(sum(award.awarded_amount), 2)
              FROM lot_awards award
              WHERE award.contract_id = l.id
                AND award.awarded_amount IS NOT NULL
                AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
            )
            WHEN EXISTS (
              SELECT 1 FROM contract_lots lot
              WHERE lot.contract_id = l.id
                AND lot.awarded_amount IS NOT NULL
                AND ${eligibleAwardLotStatusSql('lot')}
            )
            THEN (
              SELECT round(sum(lot.awarded_amount), 2)
              FROM contract_lots lot
              WHERE lot.contract_id = l.id
                AND lot.awarded_amount IS NOT NULL
                AND ${eligibleLegacyLotAwardAmountSql('lot', hasLotAwardsTable)}
            )
            ELSE CASE WHEN ${allowParentAwardAmountFallbackSql('l', hasLotAwardsTable)} THEN coalesce(l.awarded_amount, 0) ELSE NULL END
          END
        ELSE NULL
      END, 2) as awarded_amount,
      CASE WHEN EXISTS (${lotAwardeeExists}) THEN coalesce((${lotAwardeeSource}), l.awardee, 'Sin awardee') ELSE coalesce(l.awardee, 'Sin awardee') END as awardee,
      CASE WHEN EXISTS (${lotAwardeeExists}) THEN NULL ELSE l.awardee_nif END as awardee_nif, l.source_url, l.year,
      m.id as modificacion_id, m.modification_number, m.modification_date, m.reason, m.modification_type,
      coalesce(m.duration_value, 0) as duration_value, coalesce(m.duration_unit, '') as duration_unit,
      coalesce(m.duration_months, 0) as duration_months, coalesce(m.duration_days, 0) as duration_days,
      coalesce(m.modification_amount, 0) as modification_amount, coalesce(m.final_amount, 0) as final_amount, m.document_url, l.source_url AS url
    FROM contracts l JOIN modifications m ON m.contract_id = l.id
    WHERE (${whereClauses.join(' AND ')}) AND NOT ${terminalContractStatusSql('l')} AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total')
    ORDER BY l.award_date ASC, m.modification_date ASC, m.modification_number ASC
  `;

  let rows: any[] = [];
  try { rows = db.prepare(queryModificados).all(...params) as any[]; } catch { rows = []; }
  const rankingObras: ModificadoItem[] = [];
  const contratistasMap: Record<string, { nif: string | null; totalModificados: number; volumenOriginal: number; volumenFinal: number; sobrecosteTotal: number; sumPct: number }> = {};
  const organismosMap: Record<string, { totalCasos: number; sobrecosteTotal: number; casosMas20Pct: number }> = {};
  let sobrecosteAcumulado = 0, desviacionMaximaPct = 0, casosMas20Pct = 0, volumenTotalFinal = 0, gastoModificadosRedaccion = 0;
  const modificacionesPorLicitacion = new Map<string, any[]>();
  for (const r of rows) { const list=modificacionesPorLicitacion.get(r.id)||[]; list.push(r); modificacionesPorLicitacion.set(r.id,list); }

  for (const [licitacionId, modifications] of modificacionesPorLicitacion) {
    const first=modifications[0];
    const inicial=Number(first.awarded_amount)||0;
    const finalPublicado=[...modifications].reverse().map(m=>Number(m.final_amount)||0).find(v=>v>0)||0;
    const sumaModificaciones=modifications.reduce((sum,m)=>sum+(Number(m.modification_amount)||0),0);
    const final=finalPublicado||inicial+sumaModificaciones;
    const sobrecoste=Math.max(0,final-inicial);
    const pct=inicial>0?Math.round((sobrecoste/inicial)*1000)/10:0;
    const supera20Pct=pct>20; if(supera20Pct) casosMas20Pct++;
    sobrecosteAcumulado+=sobrecoste; volumenTotalFinal+=final; desviacionMaximaPct=Math.max(desviacionMaximaPct,pct);
    const objLower=String(first.object_description||'').toLowerCase();
    const esRedaccionModificado=(first.tipo||'').toLowerCase() !== 'obras' && /proyecto modificad|actualizaci[oó]n.*circunstancias|modificaci[oó]n de la memoria/.test(objLower);
    if(esRedaccionModificado) gastoModificadosRedaccion+=final;
    rankingObras.push({id:licitacionId,case_number:first.case_number,object_description:first.object_description,organo:first.organo,tipo:first.tipo,procedimiento:first.procedimiento,awardee:first.awardee,nifAdjudicatario:first.awardee_nif,importeInicial:inicial,importeFinal:final,desviacionEuros:Math.round(sobrecoste*100)/100,desviacionPct:pct,tipoModificado:esRedaccionModificado?'proyecto_modificado':'modificacion_contractual',supera20Pct,artLCSP:supera20Pct?'Supera el 20% del precio inicial: señal cuantitativa. El régimen aplicable depende de si la modificación estaba prevista (art. 204) o no prevista (art. 205).':'Modificación contractual publicada en PLACSP; revisar el régimen aplicable (arts. 203-207 LCSP).',url:first.url,year:first.year?Math.round(Number(first.year)):null,reason:esRedaccionModificado?'La descripción/documentación publicada identifica un proyecto modificado o una actualización técnica.':'Existe al menos una modificación contractual publicada para el case_number.'});
    const empresa=(first.awardee||'').trim();
    if(empresa&&empresa!=='Sin awardee'){if(!contratistasMap[empresa])contratistasMap[empresa]={nif:first.awardee_nif,totalModificados:0,volumenOriginal:0,volumenFinal:0,sobrecosteTotal:0,sumPct:0};const d=contratistasMap[empresa];d.totalModificados++;d.volumenOriginal+=inicial;d.volumenFinal+=final;d.sobrecosteTotal+=sobrecoste;d.sumPct+=pct;}
    const org=(first.organo||'Sin organismo').trim(); if(!organismosMap[org])organismosMap[org]={totalCasos:0,sobrecosteTotal:0,casosMas20Pct:0}; organismosMap[org].totalCasos++; organismosMap[org].sobrecosteTotal+=sobrecoste; if(supera20Pct)organismosMap[org].casosMas20Pct++;
  }

  // Cadenas 100% derivadas de modifications publicadas en BD; no hay expedientes ni importes hardcodeados.
  const cadenasProyectos: ProyectoModificadoCadena[] = Array.from(modificacionesPorLicitacion.entries()).map(([licitacionId, modifications])=>{
    const first=modifications[0]; const importeOriginal=Number(first.awarded_amount)||0;
    const finalPublicado=[...modifications].reverse().map(m=>Number(m.final_amount)||0).find(v=>v>0)||0;
    const sumaModificaciones=modifications.reduce((sum,m)=>sum+Math.max(0,Number(m.modification_amount)||0),0);
    const importeFinal=finalPublicado||importeOriginal+sumaModificaciones; const variacion=Math.max(0,importeFinal-importeOriginal);
    const pct=importeOriginal>0?Math.round((variacion/importeOriginal)*1000)/10:0;
    return {idProyecto:licitacionId,title:first.object_description||first.case_number||licitacionId,organo:first.organo||'Sin organismo',tipo:first.tipo||'Sin tipo',importeOriginal,importeFinal,sobrecosteTotal:Math.round(variacion*100)/100,incrementoPct:pct,expedienteOriginal:first.case_number||'',expedienteFinal:first.case_number||'',adjudicatarioPrincipal:first.awardee||'Sin awardee',supera20Pct:pct>20,motivoExplicativo:pct>20?'La modificación acumulada supera el 20% del precio inicial. Es una señal cuantitativa, no una conclusión jurídica automática: debe determinarse el régimen aplicable.':'Cadena reconstruida únicamente con el contrato y las modifications publicadas en la base de datos.',contratosCadena:[{case_number:first.case_number||'',object_description:first.object_description||'',tipo:first.tipo||'',amount:importeOriginal,awardee:first.awardee||'Sin awardee',rol:'contrato_original',year:Number(first.year)||0,url:first.url||null},...modifications.map(m=>({case_number:m.case_number||first.case_number||'',object_description:m.reason||m.modification_type||'Modificación contractual publicada',tipo:m.modification_type||'Modificación contractual',amount:Number(m.modification_amount)||0,awardee:first.awardee||'Sin awardee',rol:'modificacion_contractual' as const,year:Number(String(m.modification_date||'').slice(0,4))||Number(first.year)||0,url:m.document_url||first.url||null}))]};
  });
  const rankingContratistas: ContratistaModificados[] = Object.entries(contratistasMap)
    .map(([awardee, d]) => ({
      awardee,
      nif: d.nif,
      totalModificados: d.totalModificados,
      volumenOriginal: Math.round(d.volumenOriginal * 100) / 100,
      volumenFinal: Math.round(d.volumenFinal * 100) / 100,
      sobrecosteTotal: Math.round(d.sobrecosteTotal * 100) / 100,
      desviacionMediaPct: d.totalModificados > 0 ? Math.round((d.sumPct / d.totalModificados) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.sobrecosteTotal - a.sobrecosteTotal);

  const rankingOrganismos: OrganismoModificados[] = Object.entries(organismosMap)
    .map(([organo, d]) => ({
      organo,
      totalCasos: d.totalCasos,
      sobrecosteTotal: Math.round(d.sobrecosteTotal * 100) / 100,
      casosMas20Pct: d.casosMas20Pct,
    }))
    .sort((a, b) => b.sobrecosteTotal - a.sobrecosteTotal);

  // Prórrogas y ampliaciones de plazo oficiales registradas (tabla modifications)
  const whereModClauses = ["(m.duration_days > 0 OR m.duration_value > 0)"];
  const modParams: any[] = [];
  if (filterByAno) {
    whereModClauses.push("l.year = ?");
    modParams.push(anoNum);
  }
  if (filterScope) {
    whereModClauses.push("l.scope = ?");
    modParams.push(filterScope);
  }

  const prorrogasRows = db.prepare(`
    SELECT 
      m.id,
      m.contract_id,
      m.case_number,
      m.modification_type,
      m.duration_value,
      m.duration_unit,
      m.duration_days,
      m.duration_months,
      m.modification_date,
      m.reason,
      m.modification_amount,
      m.document_url,
      l.object_description,
      l.contracting_authority_name as organo,
      l.contract_type as tipo,
      CASE
        WHEN (NOT EXISTS (
          SELECT 1 FROM contract_lots lot
          WHERE lot.contract_id = l.id
            AND lot.awardee IS NOT NULL
            AND trim(lot.awardee) <> ''
            AND ${eligibleAwardLotStatusSql('lot')}
            AND NOT EXISTS (
              SELECT 1 FROM lot_awards award
              WHERE award.contract_id = l.id
                AND award.lot_number = lot.lot_number
                AND award.awardee IS NOT NULL
                AND trim(award.awardee) <> ''
                AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
            )
        ))
        AND EXISTS (
          SELECT 1 FROM lot_awards award
          WHERE award.contract_id = l.id
            AND award.awardee IS NOT NULL
            AND trim(award.awardee) <> ''
            AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
        )
        THEN (
          SELECT group_concat(DISTINCT award.awardee)
          FROM lot_awards award
          WHERE award.contract_id = l.id
            AND award.awardee IS NOT NULL
            AND trim(award.awardee) <> ''
            AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
        )
        WHEN EXISTS (
          SELECT 1 FROM contract_lots lot
          WHERE lot.contract_id = l.id
            AND lot.awardee IS NOT NULL
            AND trim(lot.awardee) <> ''
            AND ${eligibleAwardLotStatusSql('lot')}
            AND ${hasLotAwardsTable ? excludeLegacyLotWhenStructuredTerminalResultSql('lot') : '1'}
        )
        THEN (
          SELECT group_concat(DISTINCT lot.awardee)
          FROM contract_lots lot
          WHERE lot.contract_id = l.id
            AND lot.awardee IS NOT NULL
            AND trim(lot.awardee) <> ''
            AND ${eligibleAwardLotStatusSql('lot')}
        )
        ELSE l.awardee
      END as awardee,
      CASE
        WHEN ${lotAwardsAwardeeCovered} AND (
          SELECT count(DISTINCT award.awardee_nif)
          FROM lot_awards award
          WHERE award.contract_id = l.id
            AND award.awardee_nif IS NOT NULL
            AND trim(award.awardee_nif) <> ''
            AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
        ) = 1
        THEN (
          SELECT max(award.awardee_nif)
          FROM lot_awards award
          WHERE award.contract_id = l.id
            AND award.awardee_nif IS NOT NULL
            AND trim(award.awardee_nif) <> ''
            AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
        )
        WHEN NOT ${lotAwardsAwardeeCovered} AND (
          SELECT count(DISTINCT lot.awardee_nif)
          FROM contract_lots lot
          WHERE lot.contract_id = l.id
            AND lot.awardee_nif IS NOT NULL
            AND trim(lot.awardee_nif) <> ''
            AND trim(coalesce(lot.awardee, '')) <> ''
            AND ${eligibleAwardLotStatusSql('lot')}
        ) = 1
        THEN (
          SELECT max(lot.awardee_nif)
          FROM contract_lots lot
          WHERE lot.contract_id = l.id
            AND lot.awardee_nif IS NOT NULL
            AND trim(lot.awardee_nif) <> ''
            AND trim(coalesce(lot.awardee, '')) <> ''
            AND ${eligibleAwardLotStatusSql('lot')}
        )
        ELSE l.awardee_nif
      END as awardee_nif
    FROM modifications m
    LEFT JOIN contracts l ON l.id = m.contract_id
    WHERE ${whereModClauses.join(' AND ')}
    ORDER BY m.duration_days DESC;
  `).all(...modParams) as any[];

  const rankingProrrogas: ProrrogaItem[] = prorrogasRows.map((r: any) => ({
    id: r.id,
    licitacionId: r.contract_id,
    case_number: r.case_number || '',
    object_description: r.object_description || '',
    organo: r.organo || 'Sin organismo',
    tipo: r.tipo || 'Sin tipo',
    awardee: r.awardee || 'Sin awardee',
    nifAdjudicatario: r.awardee_nif || null,
    diasProrroga: r.duration_days || 0,
    mesesProrroga: r.duration_months || 0,
    duracionValor: r.duration_value || 0,
    duracionUnidad: r.duration_unit || 'DAY',
    fechaModificacion: r.modification_date || null,
    reason: r.reason || '',
    tipoModificacion: r.modification_type || 'Ampliación de plazo',
    importeModificacion: r.modification_amount || 0,
    documentoUrl: r.document_url || null,
  }));

  const totalContratosConProrroga = new Set(rankingProrrogas.map(p => p.licitacionId)).size;
  const totalDiasProrroga = rankingProrrogas.reduce((acc, p) => acc + p.diasProrroga, 0);

  const rankingObrasCompat = rankingObras.map((item) => ({
    ...item,
    expediente: item.case_number,
    objeto: item.object_description,
    adjudicatario: item.awardee,
    importe: item.importeFinal,
    url: item.url,
  }));
  const cadenasProyectosCompat = cadenasProyectos.map((cadena) => ({
    ...cadena,
    titulo: cadena.title,
    expedienteOriginal: cadena.expedienteOriginal,
    expedienteFinal: cadena.expedienteFinal,
  }));
  const rankingProrrogasCompat = rankingProrrogas.map((item) => ({
    ...item,
    expediente: item.case_number,
    objeto: item.object_description,
    adjudicatario: item.awardee,
  }));

  return {
    resumen: {
      totalCasos: rankingObras.length,
      sobrecosteAcumulado: Math.round(sobrecosteAcumulado * 100) / 100,
      desviacionMaximaPct: Math.round(desviacionMaximaPct * 10) / 10,
      casosMas20Pct,
      totalCadenasProyectos: cadenasProyectos.length,
      volumenTotalFinal: Math.round(volumenTotalFinal * 100) / 100,
      gastoModificadosRedaccion: Math.round(gastoModificadosRedaccion * 100) / 100,
      totalContratosConProrroga,
      totalDiasProrroga,
    },
    cadenasProyectos: cadenasProyectosCompat,
    rankingObras: rankingObrasCompat.sort((a, b) => b.desviacionEuros - a.desviacionEuros),
    rankingContratistas,
    rankingOrganismos,
    rankingProrrogas: rankingProrrogasCompat,
  };
}
