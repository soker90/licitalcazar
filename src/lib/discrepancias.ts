import { eligibleAwardLotStatusSql, eligibleAwardResultStateSql, excludeAwardWhenLegacyLotTerminalSql, lotAwardsAmountCoverageSql, eligibleLegacyLotAwardAmountSql, allowParentAwardAmountFallbackSql, excludeLegacyLotWhenStructuredTerminalResultSql } from './lot-status.js';
import { getDb } from './db';
import { getContractSlug } from './placsp';

export type CategoriaDiscrepancia = 'TEMPORAL' | 'REGISTRAL' | 'ECONOMICA' | 'PROCEDIMENTAL' | 'DOCUMENTAL';
export type GravedadDiscrepancia = 'ALTA' | 'MEDIA' | 'BAJA' | 'INFORMATIVA';

export interface DiscrepanciaItem {
  id: string;
  licitacionId: string;
  slug: string;
  case_number: string;
  object_description: string;
  procedimiento: string;
  organo: string;
  awardee: string | null;
  amount: number | null;
  category: CategoriaDiscrepancia;
  tipo: string;
  gravedad: GravedadDiscrepancia;
  title: string;
  description: string;
  fechasComparadas: {
    publicacion?: string | null;
    limite?: string | null;
    adjudicacion?: string | null;
    formalizacion?: string | null;
  };
  evidence: string;
  accionRecomendada: string;
  promptIa: string;
  urlOficial: string;
}

export interface DiscrepanciasStats {
  total: number;
  conteoPorGravedad: {
    alta: number;
    media: number;
    baja: number;
    informativa: number;
  };
  conteoPorCategoria: Record<CategoriaDiscrepancia, number>;
  items: DiscrepanciaItem[];
}

function parseDateMs(d: string | null | undefined): number | null {
  if (!d) return null;
  const t = Date.parse(d);
  return isNaN(t) ? null : t;
}

export function getDiscrepancias(options?: {
  category?: CategoriaDiscrepancia | 'TODAS';
  categoria?: CategoriaDiscrepancia | 'TODAS';
  gravedad?: GravedadDiscrepancia | 'TODAS';
  search?: string;
}): DiscrepanciasStats {
  const db = getDb();
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
    : 'awardee';

  const rows = db.prepare(`
    SELECT id, case_number, object_description, procedure AS procedimiento, contracting_authority_name as organo,
           coalesce(
             (${lotAwardeeSource}),
             CASE
               WHEN EXISTS (
                 SELECT 1 FROM contract_lots parent_lot
                 WHERE parent_lot.contract_id = contracts.id
               ) OR ${hasLotAwardsTable ? `EXISTS (
                 SELECT 1 FROM lot_awards parent_award
                 WHERE parent_award.contract_id = contracts.id
               )` : '0'}
               THEN NULL
               ELSE awardee
             END
           ) as awardee,
           CASE
             WHEN award_amount_type IS NULL OR award_amount_type = 'total'
             THEN CASE
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
               ELSE CASE WHEN ${allowParentAwardAmountFallbackSql('contracts', hasLotAwardsTable)} THEN awarded_amount ELSE NULL END
             END
             ELSE NULL
           END as amount,
           publication_date, deadline_date, award_date, formalization_date, source_url AS url
    FROM contracts
    ORDER BY year DESC, publication_date DESC
  `).all() as any[];

  const items: DiscrepanciaItem[] = [];

  for (const r of rows) {
    const case_number = (r.case_number || 'Sin case_number').trim();
    const procedimiento = (r.procedimiento || 'No especificado').trim();
    const procLower = procedimiento.toLowerCase();
    const isMenor = procLower.includes('menor');

    const pubMs = parseDateMs(r.publication_date);
    const limMs = parseDateMs(r.deadline_date);
    const adjMs = parseDateMs(r.award_date);
    const formMs = parseDateMs(r.formalization_date);

    const slug = getContractSlug(r.id);
    const urlOficial = r.url || 'https://contrataciondelestado.es';

    const fPub = r.publication_date ? r.publication_date.slice(0, 10) : null;
    const fLim = r.deadline_date ? r.deadline_date.slice(0, 10) : null;
    const fAdj = r.award_date ? r.award_date.slice(0, 10) : null;
    const fForm = r.formalization_date ? r.formalization_date.slice(0, 10) : null;

    // 1. Incompatibilidad directa (Adjudicación < Límite o Formalización < Adjudicación)
    const isAdjBeforeLim = Boolean(limMs && adjMs && adjMs < limMs);
    const isFormBeforeAdj = Boolean(adjMs && formMs && formMs < adjMs);

    if (isAdjBeforeLim || isFormBeforeAdj) {
      const tipo = isAdjBeforeLim ? 'ADJUDICACION_PREVIA_LIMITE' : 'FORMALIZACION_PREVIA_ADJUDICACION';
      const title = isAdjBeforeLim
        ? 'Adjudicación registrada antes del cierre de ofertas'
        : 'Formalización registrada antes de la adjudicación';
      const description = isAdjBeforeLim
        ? `La document_date de adjudicación oficial (${fAdj}) es anterior a la document_date límite de presentación de ofertas (${fLim}). Generalmente indica una errata material de digitación en el registro de PLACSP.`
        : `La document_date de formalización del contrato (${fForm}) figura anterior a la document_date del decreto o acuerdo de adjudicación (${fAdj}).`;
      const accionRecomendada = 'Revisar actas oficiales y decreto de adjudicación en PLACSP para verificar la document_date real.';
      const promptIa = isAdjBeforeLim
        ? `Examina el case_number "${case_number}" de Alcázar de San Juan (${urlOficial}). La document_date de adjudicación figura como ${fAdj} y el cierre de ofertas como ${fLim}. Analiza los documentos adjuntos para verificar si la adjudicación real fue posterior o si se trata de un error tipográfico en el año/mes registrado en PLACSP.`
        : `Examina el case_number "${case_number}" de Alcázar de San Juan (${urlOficial}). La formalización figura el ${fForm} y la adjudicación el ${fAdj}. Comprueba las fechas de firma de los documentos oficiales para verificar el orden cronológico real.`;

      items.push({
        id: `DISC-REG-${slug}`,
        licitacionId: r.id,
        slug,
        case_number,
        object_description: r.object_description || '',
        procedimiento,
        organo: r.organo || 'Ayuntamiento de Alcázar de San Juan',
        awardee: r.awardee || null,
        amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
        category: 'REGISTRAL',
        tipo,
        gravedad: 'MEDIA',
        title,
        description,
        fechasComparadas: {
          publicacion: fPub,
          limite: fLim,
          adjudicacion: fAdj,
          formalizacion: fForm,
        },
        evidence: isAdjBeforeLim
          ? `Adjudicación: ${fAdj} vs Límite: ${fLim}`
          : `Formalización: ${fForm} vs Adjudicación: ${fAdj}`,
        accionRecomendada,
        promptIa,
        urlOficial,
      });
      continue;
    }

    // 2. Publicación posterior al límite de ofertas en procedimiento competitivo (Fuente histórica)
    if (!isMenor && limMs && pubMs && pubMs > limMs) {
      const diffDias = Math.round((pubMs - limMs) / (1000 * 86400));
      items.push({
        id: `DISC-HIST-${slug}`,
        licitacionId: r.id,
        slug,
        case_number,
        object_description: r.object_description || '',
        procedimiento,
        organo: r.organo || 'Ayuntamiento de Alcázar de San Juan',
        awardee: r.awardee || null,
        amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
        category: 'TEMPORAL',
        tipo: 'PUBLICACION_POSTERIOR_FEED_HISTORICO',
        gravedad: 'INFORMATIVA',
        title: `Publicación en PLACSP registrada ${diffDias} días tras el cierre de ofertas`,
        description: `En el volcado histórico del feed ATOM de PLACSP, la document_date de publicación consta como ${fPub}, posterior al cierre de ofertas (${fLim}). Habitual por sobrescritura de document_date al publicar rectificaciones o resoluciones.`,
        fechasComparadas: {
          publicacion: fPub,
          limite: fLim,
          adjudicacion: fAdj,
          formalizacion: fForm,
        },
        evidence: `Publicación: ${fPub} (+${diffDias}d) vs Límite: ${fLim}`,
        accionRecomendada: 'Cotejar en la ficha web de PLACSP el histórico de publicaciones para localizar el anuncio inicial.',
        promptIa: `Comprueba el case_number "${case_number}" en PLACSP (${urlOficial}). La document_date de publicación registrada es ${fPub} y el límite fue ${fLim}. Revisa el histórico del perfil del contratante para identificar la document_date original del anuncio de licitación.`,
        urlOficial,
      });
    }
  }

  // Filtrado
  let filtered = items;
  const categoryFilter = options?.category ?? options?.categoria;
  if (categoryFilter && categoryFilter !== 'TODAS') {
    filtered = filtered.filter(i => i.category === categoryFilter);
  }
  if (options?.gravedad && options.gravedad !== 'TODAS') {
    filtered = filtered.filter(i => i.gravedad === options.gravedad);
  }
  if (options?.search && options.search.trim()) {
    const q = options.search.toLowerCase().trim();
    filtered = filtered.filter(i => 
      i.case_number.toLowerCase().includes(q) ||
      i.object_description.toLowerCase().includes(q) ||
      (i.awardee && i.awardee.toLowerCase().includes(q)) ||
      i.title.toLowerCase().includes(q)
    );
  }

  const conteoPorCategoria: Record<CategoriaDiscrepancia, number> = {
    TEMPORAL: items.filter(i => i.category === 'TEMPORAL').length,
    REGISTRAL: items.filter(i => i.category === 'REGISTRAL').length,
    ECONOMICA: items.filter(i => i.category === 'ECONOMICA').length,
    PROCEDIMENTAL: items.filter(i => i.category === 'PROCEDIMENTAL').length,
    DOCUMENTAL: items.filter(i => i.category === 'DOCUMENTAL').length,
  };

  const conteoPorGravedad = {
    alta: items.filter(i => i.gravedad === 'ALTA').length,
    media: items.filter(i => i.gravedad === 'MEDIA').length,
    baja: items.filter(i => i.gravedad === 'BAJA').length,
    informativa: items.filter(i => i.gravedad === 'INFORMATIVA').length,
  };

  const itemsCompat = filtered.map((item) => ({
    ...item,
    expediente: item.case_number,
    objeto: item.object_description,
    categoria: item.category,
    adjudicatario: item.awardee,
    importe: item.amount,
    url: item.urlOficial,
  }));

  return {
    total: filtered.length,
    conteoPorGravedad,
    conteoPorCategoria,
    items: itemsCompat,
  };
}
