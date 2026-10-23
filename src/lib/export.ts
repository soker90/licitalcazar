import { eligibleAwardLotStatusSql, eligibleAwardResultStateSql, excludeAwardWhenLegacyLotTerminalSql, lotAwardsAmountCoverageSql, eligibleLegacyLotAwardAmountSql, allowParentAwardAmountFallbackSql, excludeLegacyLotWhenStructuredTerminalResultSql } from './lot-status.js';
import { getDb, parseScope } from './db';
import { formatNif, formatCurrency } from './format';
import { getOpaqueEmpresaId } from './corporate';
import { getCorporateContractSource } from './db-corporate';

/**
 * Escapa una celda CSV y neutraliza texto que las hojas de cálculo podrían
 * interpretar como fórmula. Los valores numéricos legítimos se conservan.
 */
export function escapeCsvCell(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val);

  if (typeof val === 'string' && /^[\u0000-\u0020]*[=+\-@]/.test(str)) {
    const numericLiteral = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(str.trim());
    if (!numericLiteral) str = "'" + str;
  }

  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Convierte un array de objetos a un string CSV con cabecera y BOM UTF-8 (\uFEFF)
 * para compatibilidad directa con Microsoft Excel y hojas de cálculo.
 */
export function toCsv(
  rows: Record<string, any>[],
  columns: { key: string; label: string }[]
): string {
  const bom = '\uFEFF';
  const headerLine = columns.map((col) => escapeCsvCell(col.label)).join(',');
  const rowLines = rows.map((row) =>
    columns.map((col) => escapeCsvCell(row[col.key])).join(',')
  );

  return bom + [headerLine, ...rowLines].join('\r\n');
}

/**
 * Exporta el catálogo de contracts
 */
export function getLicitacionesExportData(scope?: string | null) {
  const db = getDb();
  const filterScope = parseScope(scope);

  const whereParts: string[] = [];
  const params: any[] = [];

  if (filterScope) {
    whereParts.push('scope = ?');
    params.push(filterScope);
  }

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());
  // lot_awards can be a partial snapshot of an expediente. Only use it as the
  // canonical source when it covers every relevant legacy lot for the field.
  const lotAwardsAwardeeCovered = hasLotAwardsTable
    ? `(NOT EXISTS (
        SELECT 1 FROM contract_lots lot
        WHERE lot.contract_id = contracts.id
          AND trim(coalesce(lot.awardee, '')) <> ''
          AND ${eligibleAwardLotStatusSql('lot')}
          AND NOT EXISTS (
            SELECT 1 FROM lot_awards la
            WHERE la.contract_id = contracts.id
              AND la.lot_number = lot.lot_number
              AND trim(coalesce(la.awardee, '')) <> ''
              AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
          )
      ))`
    : '0';

  const lotAwardsAwardeeNifCovered = hasLotAwardsTable
    ? `(NOT EXISTS (
        SELECT 1 FROM lot_awards la
        WHERE la.contract_id = contracts.id
          AND trim(coalesce(la.awardee, '')) <> ''
          AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
          AND trim(coalesce(la.awardee_nif, '')) = ''
      ))`
    : '0';

  const contractLotsAwardeeNifCovered = `(NOT EXISTS (
    SELECT 1 FROM contract_lots lot
    WHERE lot.contract_id = contracts.id
      AND trim(coalesce(lot.awardee, '')) <> ''
      AND ${eligibleAwardLotStatusSql('lot')}
      AND trim(coalesce(lot.awardee_nif, '')) = ''
  ))`;

  const lotAwardsAmountCovered = hasLotAwardsTable
    ? lotAwardsAmountCoverageSql('contracts')
    : '0';

  const lotAwardsAmountInclVatCovered = hasLotAwardsTable
    ? lotAwardsAmountCoverageSql('contracts', 'lot', 'la', 'la_null', 'awarded_amount_incl_vat')
    : '0';

  const awardeeSource = `(SELECT group_concat(DISTINCT awardee) FROM (
    SELECT la.awardee FROM lot_awards la
    WHERE la.contract_id = contracts.id
      AND ${lotAwardsAwardeeCovered}
      AND trim(coalesce(la.awardee, '')) <> ''
      AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
    UNION
    SELECT lot.awardee FROM contract_lots lot
    WHERE lot.contract_id = contracts.id
      AND trim(coalesce(lot.awardee, '')) <> ''
      AND ${eligibleAwardLotStatusSql('lot')}
      AND ${excludeLegacyLotWhenStructuredTerminalResultSql('lot')}
      AND NOT ${lotAwardsAwardeeCovered}
  ))`;

  const awardeeExists = `(
    ${lotAwardsAwardeeCovered} AND EXISTS (
      SELECT 1 FROM lot_awards la
      WHERE la.contract_id = contracts.id
        AND trim(coalesce(la.awardee, '')) <> ''
        AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
    )
  ) OR EXISTS (
    SELECT 1 FROM contract_lots lot
    WHERE lot.contract_id = contracts.id
      AND trim(coalesce(lot.awardee, '')) <> ''
      AND ${eligibleAwardLotStatusSql('lot')}
  )`;
  const rows = db.prepare(`
    SELECT 
      id,
      case_number,
      object_description,
      contract_type,
      procedure AS procedimiento,
      status,
      CASE
        WHEN ${lotAwardsAwardeeCovered} AND ${lotAwardsAwardeeNifCovered} AND EXISTS (
          SELECT 1 FROM lot_awards la
          WHERE la.contract_id = contracts.id
            AND trim(coalesce(la.awardee, '')) <> ''
            AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
        )
        THEN (
          SELECT group_concat(DISTINCT la.awardee_nif)
          FROM lot_awards la
          WHERE la.contract_id = contracts.id
            AND trim(coalesce(la.awardee_nif, '')) <> ''
            AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
        )
        WHEN ${contractLotsAwardeeNifCovered} AND EXISTS (
          SELECT 1 FROM contract_lots lot
          WHERE lot.contract_id = contracts.id
            AND trim(coalesce(lot.awardee_nif, '')) <> ''
            AND ${eligibleAwardLotStatusSql('lot')}
            AND ${excludeLegacyLotWhenStructuredTerminalResultSql('lot')}
        )
        THEN (
          SELECT group_concat(DISTINCT lot.awardee_nif)
          FROM contract_lots lot
          WHERE lot.contract_id = contracts.id
            AND trim(coalesce(lot.awardee_nif, '')) <> ''
            AND ${eligibleAwardLotStatusSql('lot')}
            AND ${excludeLegacyLotWhenStructuredTerminalResultSql('lot')}
        )
        WHEN EXISTS (
          SELECT 1 FROM contract_lots lot
          WHERE lot.contract_id = contracts.id
        ) OR EXISTS (
          SELECT 1 FROM lot_awards la
          WHERE la.contract_id = contracts.id
        )
        THEN NULL
        ELSE awardee_nif
      END as awardee_nif,
      contracting_authority_name as organo,
      scope,
      CASE
        WHEN ${awardeeExists}
        THEN ${awardeeSource}
        WHEN EXISTS (
          SELECT 1 FROM contract_lots lot
          WHERE lot.contract_id = contracts.id
        ) OR EXISTS (
          SELECT 1 FROM lot_awards la
          WHERE la.contract_id = contracts.id
        )
        THEN NULL
        ELSE awardee
      END as awardee,
      CASE
        WHEN award_amount_type IS NULL OR award_amount_type IN ('total', 'desconocido')
        THEN CASE
          WHEN ${lotAwardsAmountCovered} AND EXISTS (
            SELECT 1 FROM lot_awards la
            WHERE la.contract_id = contracts.id
              AND la.awarded_amount IS NOT NULL
              AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
          )
          THEN (
            SELECT round(sum(la.awarded_amount), 2)
            FROM lot_awards la
            WHERE la.contract_id = contracts.id
              AND la.awarded_amount IS NOT NULL
              AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
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
          ELSE CASE WHEN ${allowParentAwardAmountFallbackSql('contracts', hasLotAwardsTable)} THEN awarded_amount ELSE NULL END
        END
        ELSE NULL
      END as importe_adjudicacion_sin_iva,
      CASE
        WHEN award_amount_type IS NULL OR award_amount_type IN ('total', 'desconocido')
        THEN CASE
          WHEN ${lotAwardsAmountInclVatCovered} AND EXISTS (
            SELECT 1 FROM lot_awards la
            WHERE la.contract_id = contracts.id
              AND la.awarded_amount_incl_vat IS NOT NULL
              AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
          )
          THEN (
            SELECT round(sum(la.awarded_amount_incl_vat), 2)
            FROM lot_awards la
            WHERE la.contract_id = contracts.id
              AND la.awarded_amount_incl_vat IS NOT NULL
              AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
          )
          WHEN EXISTS (
            SELECT 1 FROM contract_lots lot
            WHERE lot.contract_id = contracts.id
              AND lot.awarded_amount_incl_vat IS NOT NULL
              AND ${eligibleAwardLotStatusSql('lot')}
          )
          THEN (
            SELECT round(sum(lot.awarded_amount_incl_vat), 2)
            FROM contract_lots lot
            WHERE lot.contract_id = contracts.id
              AND lot.awarded_amount_incl_vat IS NOT NULL
              AND ${eligibleLegacyLotAwardAmountSql('lot', hasLotAwardsTable)}
          )
          ELSE CASE WHEN ${allowParentAwardAmountFallbackSql('contracts', hasLotAwardsTable)} THEN awarded_amount_incl_vat ELSE NULL END
        END
        ELSE NULL
      END as importe_adjudicacion_con_iva,
      award_amount_type as tipo_importe_adjudicacion,
      amount_excl_vat as importe_licitacion_sin_iva,
      coalesce(amount_incl_vat, 0) as importe_licitacion_con_iva,
      offer_count,
      publication_date,
      award_date,
      formalization_date,
      duration,
      duration_unit,
      primary_cpv,
      source_url as url_placsp
    FROM contracts
    ${whereClause}
    ORDER BY publication_date DESC
  `).all(...params) as any[];

  return rows.map((r) => ({
    ...r,
    expediente: r.case_number,
    objeto: r.object_description,
    tipo_contrato: r.contract_type,
    estado: r.status,
    adjudicatario: r.awardee,
    awardee_nif: formatNif(r.awardee_nif),
    fuente_origen: 'Plataforma de Contratación del Sector Público (PLACSP)',
    methodology_version: 'v2.1',
    version_metodologia: 'v2.1',
  }));
}

export const LICITACIONES_CSV_COLUMNS = [
  { key: 'case_number', label: 'Expediente' },
  { key: 'object_description', label: 'Objeto del Contrato' },
  { key: 'contract_type', label: 'Tipo de Contrato' },
  { key: 'procedimiento', label: 'Procedimiento' },
  { key: 'status', label: 'Estado' },
  { key: 'organo', label: 'Órgano de Contratación' },
  { key: 'scope', label: 'Ámbito Institucional' },
  { key: 'awardee', label: 'Contratista / Adjudicatario' },
  { key: 'awardee_nif', label: 'CIF / NIF' },
  { key: 'importe_licitacion_sin_iva', label: 'Importe Licitación (sin IVA)' },
  { key: 'importe_adjudicacion_sin_iva', label: 'Importe Adjudicación (sin IVA)' },
  { key: 'tipo_importe_adjudicacion', label: 'Tipo de importe de adjudicación' },
  { key: 'importe_licitacion_con_iva', label: 'Importe Licitación (con IVA)' },
  { key: 'importe_adjudicacion_con_iva', label: 'Importe Adjudicación (con IVA)' },
  { key: 'offer_count', label: 'Número de Ofertas' },
  { key: 'publication_date', label: 'Fecha de Publicación' },
  { key: 'award_date', label: 'Fecha de Adjudicación' },
  { key: 'formalization_date', label: 'Fecha de Formalización' },
  { key: 'duration', label: 'Duración' },
  { key: 'duration_unit', label: 'Unidad de Duración' },
  { key: 'primary_cpv', label: 'Código CPV' },
  { key: 'url_placsp', label: 'Enlace Oficial PLACSP' },
  { key: 'fuente_origen', label: 'Fuente Oficial' },
  { key: 'methodology_version', label: 'Versión Metodología' },
  { key: 'version_metodologia', label: 'Versión Metodología (compat.)' },
];

/**
 * Exporta el catálogo de empresas contratistas
 */
export function getEmpresasExportData(scope?: string | null) {
  const db = getDb();
  const filterScope = parseScope(scope);

  const whereParts = ["awardee IS NOT NULL AND awardee != ''"];
  const params: any[] = [];

  if (filterScope) {
    whereParts.push('scope = ?');
    params.push(filterScope);
  }

  const rows = db.prepare(`
    SELECT 
      coalesce(awardee_nif, 'SIN_NIF') as cif,
      awardee as nombre,
      count(DISTINCT id) as total_contratos,
      sum(CASE WHEN award_amount_type IS NULL OR award_amount_type IN ('total', 'desconocido') THEN coalesce(awarded_amount, 0) ELSE 0 END) as volumen_total_sin_iva,
      min(publication_date) as primer_contrato,
      max(publication_date) as ultimo_contrato,
      group_concat(distinct contracting_authority_name) as organos_contratantes
    FROM ${getCorporateContractSource(db)}
    WHERE ${whereParts.join(' AND ')}
    GROUP BY cif, nombre
    ORDER BY volumen_total_sin_iva DESC
  `).all(...params) as any[];

  return rows.map((r) => ({
    ...r,
    id_proveedor: getOpaqueEmpresaId(r.cif, r.nombre),
    cif: formatNif(r.cif),
    fuente_origen: 'Plataforma de Contratación del Sector Público (PLACSP)',
    methodology_version: 'v2.1',
    version_metodologia: 'v2.1',
  }));
}

export const EMPRESAS_CSV_COLUMNS = [
  { key: 'id_proveedor', label: 'ID Proveedor (Canónico / Opaco)' },
  { key: 'cif', label: 'CIF / NIF' },
  { key: 'nombre', label: 'Razón Social' },
  { key: 'total_contratos', label: 'Total Contratos' },
  { key: 'volumen_total_sin_iva', label: 'Volumen Total Adjudicado (€ sin IVA)' },
  { key: 'primer_contrato', label: 'Primer Contrato Registrado' },
  { key: 'ultimo_contrato', label: 'Último Contrato Registrado' },
  { key: 'organos_contratantes', label: 'Órganos Contratantes' },
  { key: 'fuente_origen', label: 'Fuente Oficial' },
  { key: 'methodology_version', label: 'Versión Metodología' },
  { key: 'version_metodologia', label: 'Versión Metodología (compat.)' },
];

/**
 * Exporta las alerts y señales analíticas de auditoría
 */
export function getAlertasExportData(
  scope?: string | null,
  tipo?: string | null,
  severity?: string | null
) {
  const db = getDb();
  const filterScope = parseScope(scope);

  const whereParts: string[] = [];
  const params: any[] = [];

  if (severity && ['ALTA', 'MEDIA', 'INFORMATIVA'].includes(severity.toUpperCase())) {
    whereParts.push('a.severity = ?');
    params.push(severity.toUpperCase());
  }

  if (tipo) {
    whereParts.push('a.type = ?');
    params.push(tipo);
  }

  if (filterScope) {
    whereParts.push(`EXISTS (
      SELECT 1 FROM alert_contracts ac2
      JOIN contracts l2 ON ac2.contract_id = l2.id
      WHERE ac2.alert_id = a.id AND l2.scope = ?
    )`);
    params.push(filterScope);
  }

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT 
      a.id,
      a.category,
      a.type AS tipo,
      a.severity,
      round(a.confidence, 1) as confianza_pct,
      a.title,
      a.description,
      a.target_data,
      a.source,
      a.source_url,
      a.applied_rule,
      a.methodology_version,
      a.limitations,
      a.alternative_explanation,
      a.requires_human_review,
      a.factors_json,
      a.created_at,
      group_concat(distinct ac.contract_id) as related_contracts,
      group_concat(distinct nullif(trim(l.awardee), 'Sin awardee')) as adjudicatario_raw,
      sum(CASE
        WHEN l.lot_number IS NOT NULL
          AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido'))
          AND ${lotAwardsAmountCoverageSql('l')}
          AND EXISTS (
            SELECT 1 FROM lot_awards award
            WHERE award.contract_id = l.id
              AND award.awarded_amount IS NOT NULL
              AND ${eligibleAwardResultStateSql('award')}
              AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          )
        THEN coalesce(l.awarded_amount, 0)
        WHEN l.lot_number IS NULL
          AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total')
        THEN coalesce(l.awarded_amount, 0)
        ELSE 0
      END) as importe_total_raw,
      max(l.procedure) as procedimiento_raw
    FROM alerts a
    LEFT JOIN alert_contracts ac ON a.id = ac.alert_id
    LEFT JOIN ${getCorporateContractSource(db)} l ON ac.contract_id = l.id
    ${whereClause}
    GROUP BY a.id
    ORDER BY 
      CASE a.severity WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END ASC,
      a.confidence DESC
  `).all(...params) as any[];

  return rows.map((r) => {
    let factoresTexto = '';
    try {
      const parsed = JSON.parse(r.factors_json || '[]');
      factoresTexto = parsed.map((f: any) => `${f.label} (+${f.scoreContribution}%)`).join(' | ');
    } catch {
      factoresTexto = r.factors_json || '';
    }

    const impRaw = Number(r.importe_total_raw) || 0;
    const amount = impRaw > 0 ? formatCurrency(impRaw) : '—';
    const awardee = r.adjudicatario_raw || 'Sin awardee';
    const procedimiento = r.procedimiento_raw || '—';

    return {
      ...r,
      categoria: r.category,
      severidad: r.severity,
      confianza: r.confianza_pct,
      titulo: r.title,
      descripcion: r.description,
      dato_objetivo: r.target_data,
      fuente: r.source,
      url_fuente: r.source_url,
      awardee,
      adjudicatario: awardee,
      amount,
      importe: amount,
      procedimiento,
      factores_desglosados: factoresTexto,
      categoria_resultado: r.category === 'A' 
        ? 'Cat. A: Dato localizado en una source identificable' 
        : r.category === 'B'
        ? 'Cat. B: Información no localizada en la source consultada'
        : r.category === 'C' 
        ? 'Cat. C: Indicador estadístico o analítico' 
        : 'Cat. D: Posible incidencia que requiere examinar el case_number',
      fuente_origen: r.source || 'Plataforma de Contratación del Sector Público (PLACSP)',
      methodology_version: r.methodology_version || 'v2.1',
      version_metodologia: r.methodology_version || 'v2.1',
      aviso_legal: 'Señal analítica de carácter informativo. No constituye imputación de irregularidad ni resolución oficial.',
    };
  });
}

export const ALERTAS_CSV_COLUMNS = [
  { key: 'id', label: 'ID Señal' },
  { key: 'categoria_resultado', label: 'Categoría de Resultado' },
  { key: 'tipo', label: 'Tipología' },
  { key: 'severity', label: 'Severidad' },
  { key: 'confianza_pct', label: 'Fiabilidad Dato PLACSP (%)' },
  { key: 'title', label: 'Título' },
  { key: 'description', label: 'Descripción' },
  { key: 'awardee', label: 'Adjudicatario' },
  { key: 'amount', label: 'Importe (€)' },
  { key: 'procedimiento', label: 'Procedimiento' },
  { key: 'factores_desglosados', label: 'Factores de Ponderación' },
  { key: 'related_contracts', label: 'IDs Contratos Asociados' },
  { key: 'created_at', label: 'Fecha Detección' },
  { key: 'fuente_origen', label: 'Fuente Oficial' },
  { key: 'methodology_version', label: 'Versión Metodología' },
  { key: 'version_metodologia', label: 'Versión Metodología (compat.)' },
  { key: 'aviso_legal', label: 'Aviso Legal y Neutralidad' },
];
