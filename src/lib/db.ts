import { normalizeIdentityPart } from '../../scripts/contract-identity';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { 
  ensureCorporateResolutionTable, 
  getCorporateProfile,
  getCorporateContractSource,
  resolveEntityFromDb,
  UNIFIED_CONTRACT_SOURCE
} from './db-corporate';
import {
  getClusterKey,
  getOpaqueEmpresaId
} from './corporate';
import {
  detectarFraccionamiento,
  casosDelAno,
  FraccionamientoContrato,
  FraccionamientoItem
} from './fraccionamiento';
import {
  FlujoStats,
  FlujoKpis,
  FlujoDesgloseItem,
  ReadjudicacionItem,
  detectarReadjudicaciones
} from './flujo';
import {
  getContratosVivosStats,
  evaluarVigenciaContrato,
  extraerFechaFinExplicita,
  ContratosVivosStats,
  ContratoVivoItem,
  ContratosVivosKpis,
  EstadoVigencia
} from './contratos-vivos';
import {
  getModificadosStats,
  ModificadosStats,
  ModificadoItem,
  ProyectoModificadoCadena,
  ContratistaModificados,
  OrganismoModificados
} from './modificados';
import {
  getDuracionEfectivaStats,
  DuracionEfectivaStats,
  DuracionContratoItem
} from './duracion-efectiva';
import {
  getEmpresasLocalesStats,
  EmpresasLocalesStats,
  EmpresaGeograficaItem,
  GastoAmbitoItem,
  EvolucionAmbitoAno,
  AmbitoGeografico
} from './empresas-locales';
import {
  getAuditoriaFuentesStats,
  verificarDuplicidadFuente,
  AUDITORIA_PERIODOS,
  CONTRATOS_EXTERNOS_CATALOGO,
  type ContratoFuenteExterna,
  type AuditoriaCoberturaHistorica,
  type OrigenFuente
} from './fuentes-historicas';
import { formatCurrency, isPersonaFisicaNif } from './format';
import { excludeAwardWhenLegacyLotTerminalSql, excludeLegacyLotWhenStructuredTerminalResultSql, eligibleAwardLotStatusSql, eligibleAwardResultStateSql, terminalNoAwardResultStateSql, lotAwardsAmountCoverageSql, eligibleLegacyLotAwardAmountSql, allowParentAwardAmountFallbackSql, isEligibleAwardLotStatus } from './lot-status.js';
import { terminalContractStatusSql, desertedContractStatusSql, canceledContractStatusSql, resolvedContractStatusSql, resolvedUnawardedContractSql, flowContractStatusSql, inCourseContractStatusSql, explicitlyAwardedContractStatusSql } from './contract-status-sql';
import { getContractStatus } from './contract-status';

export type { 
  FlujoStats, 
  FlujoKpis, 
  FlujoDesgloseItem, 
  ReadjudicacionItem,
  ContratosVivosStats,
  ContratoVivoItem,
  ContratosVivosKpis,
  EstadoVigencia,
  ModificadosStats,
  ModificadoItem,
  ProyectoModificadoCadena,
  ContratistaModificados,
  OrganismoModificados,
  DuracionEfectivaStats,
  DuracionContratoItem,
  EmpresasLocalesStats,
  EmpresaGeograficaItem,
  GastoAmbitoItem,
  EvolucionAmbitoAno,
  AmbitoGeografico,
  ContratoFuenteExterna,
  AuditoriaCoberturaHistorica,
  OrigenFuente
};
export { 
  getContratosVivosStats, 
  evaluarVigenciaContrato, 
  getModificadosStats, 
  getDuracionEfectivaStats, 
  getEmpresasLocalesStats,
  getAuditoriaFuentesStats,
  verificarDuplicidadFuente,
  AUDITORIA_PERIODOS,
  CONTRATOS_EXTERNOS_CATALOGO
};

// Helper to ensure all objects have Object.prototype for Next.js React Server Components
function toPlain<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map(toPlain) as any;
  }
  const plain: any = {};
  for (const k of Object.keys(val as any)) {
    plain[k] = toPlain((val as any)[k]);
  }
  // Compatibility aliases for existing consumers/tests. The canonical internal
  // names remain English (year/scope); these aliases are only legacy output fields.
  if (Object.prototype.hasOwnProperty.call(plain, 'year') && !Object.prototype.hasOwnProperty.call(plain, 'ano')) plain.ano = plain.year;
  if (Object.prototype.hasOwnProperty.call(plain, 'scope') && !Object.prototype.hasOwnProperty.call(plain, 'ambito')) plain.ambito = plain.scope;
  if (Object.prototype.hasOwnProperty.call(plain, 'name') && !Object.prototype.hasOwnProperty.call(plain, 'nombre')) plain.nombre = plain.name;

  // Public/API compatibility aliases: keep the physical database and internal SQL
  // canonical in English while preserving the established Spanish response shape.
  const contractAliases = {
    case_number: 'expediente', object_description: 'objeto', department: 'dependencia',
    contract_type: 'tipo_contrato', contract_type_code: 'tipo_codigo', procedure: 'procedimiento',
    procedure_code: 'procedimiento_codigo', procedure_source: 'procedimiento_procedencia',
    economic_nature: 'naturaleza_economica', status: 'estado', amount_excl_vat: 'importe_sin_iva',
    amount_incl_vat: 'importe_con_iva', estimated_value: 'valor_estimado', awarded_amount: 'importe_adjudicacion',
    awarded_amount_incl_vat: 'importe_adj_con_iva', award_amount_type: 'tipo_importe_adjudicacion', awardee: 'adjudicatario', awardee_nif: 'nif_adjudicatario',
    offer_count: 'num_ofertas', is_sme: 'es_pyme', primary_cpv: 'cpv_principal', location: 'ubicacion',
    duration: 'duracion', duration_unit: 'duracion_unidad', eu_funding: 'financiacion_ue', urgency: 'urgencia',
    deadline_date: 'fecha_limite', award_date: 'fecha_adjudicacion', formalization_date: 'fecha_formalizacion',
    publication_date: 'fecha_publicacion', updated_at: 'fecha_actualizacion', documents_synced_at: 'fecha_sync_documentos',
    source_url: 'url', dataset: 'conjunto', is_lotized: 'lotizado', lot_count: 'num_lotes', lots_source: 'lotes_origen',
    year: 'ano', scope: 'ambito', contracting_authority_name: 'organo_contratante',
    contracting_authority_nif: 'nif_organo', contracting_authority_dir3: 'dir3_organo', contracting_authority_city: 'ciudad_organo'
  };
  if (Object.prototype.hasOwnProperty.call(plain, 'case_number')) {
    for (const [source, legacy] of Object.entries(contractAliases)) {
      if (Object.prototype.hasOwnProperty.call(plain, source) && !Object.prototype.hasOwnProperty.call(plain, legacy)) plain[legacy] = plain[source];
    }
  }
  const alertAliases = {
    category: 'categoria', type: 'tipo', severity: 'severidad', level: 'nivel', scale_score: 'score_escala',
    confidence: 'confianza', title: 'titulo', description: 'descripcion', target_data: 'dato_objetivo', source: 'fuente',
    source_url: 'url_fuente', extracted_at: 'fecha_extraccion', applied_rule: 'regla_aplicada', methodology_version: 'version_metodologia',
    limitations: 'limitaciones', alternative_explanation: 'explicacion_alternativa', requires_human_review: 'requiere_revision_humana',
    evidence: 'evidencia', continuity_pattern: 'patron_continuidad', explanations_json: 'explicaciones_json', documents_json: 'documentos_json', created_at: 'fecha_creacion'
  };
  if (Object.prototype.hasOwnProperty.call(plain, 'type') || Object.prototype.hasOwnProperty.call(plain, 'severity')) {
    for (const [source, legacy] of Object.entries(alertAliases)) {
      if (Object.prototype.hasOwnProperty.call(plain, source) && !Object.prototype.hasOwnProperty.call(plain, legacy)) plain[legacy] = plain[source];
    }
    if (Object.prototype.hasOwnProperty.call(plain, 'tipo') && !Object.prototype.hasOwnProperty.call(plain, 'type')) plain.type = plain.tipo;
    if (Object.prototype.hasOwnProperty.call(plain, 'severity') && !Object.prototype.hasOwnProperty.call(plain, 'severidad')) plain.severidad = plain.severity;
  }
  return plain;
}

// Singleton instance
let dbInstance: DatabaseSync | null = null;

export function ensureLotAwardsTable(db: DatabaseSync): void {
  try {
    const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1").get();
    if (hasTable) return;
    db.exec(`
      CREATE TEMP TABLE IF NOT EXISTS lot_awards (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        case_number TEXT,
        lot_number TEXT NOT NULL,
        award_index INTEGER NOT NULL,
        awardee TEXT,
        awardee_nif TEXT,
        awarded_amount REAL,
        awarded_amount_incl_vat REAL,
        offer_count INTEGER,
        award_date TEXT,
        result_code TEXT,
        result_code_list_uri TEXT,
        result_state TEXT,
        description TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_temp_lot_awards_contract_id ON lot_awards(contract_id);
      CREATE INDEX IF NOT EXISTS idx_temp_lot_awards_case_number ON lot_awards(case_number);
      CREATE INDEX IF NOT EXISTS idx_temp_lot_awards_lot_number ON lot_awards(contract_id, lot_number);
    `);

    // Older checked-in production databases predate lot_awards. Seed the
    // TEMP compatibility table from the best available per-lot snapshot so
    // lot-aware queries do not mistake an empty shadow table for real data.
    const legacyLots = db.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type = 'table' AND name = 'contract_lots'
      LIMIT 1
    `).get();
    if (legacyLots) {
      db.exec(`
        INSERT OR IGNORE INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
          offer_count, award_date, result_code, result_code_list_uri,
          result_state, description
        )
        SELECT
          'runtime-fallback:' || lot.id,
          lot.contract_id,
          coalesce(lot.case_number, contract.case_number),
          lot.lot_number,
          0,
          lot.awardee,
          lot.awardee_nif,
          lot.awarded_amount,
          lot.awarded_amount_incl_vat,
          lot.offer_count,
          lot.award_date,
          lot.result_code,
          lot.result_code_list_uri,
          lot.lot_status,
          lot.lot_name
        FROM contract_lots lot
        LEFT JOIN contracts contract ON contract.id = lot.contract_id
        WHERE (
          (lot.awardee IS NOT NULL AND trim(lot.awardee) <> '')
          OR lot.awarded_amount IS NOT NULL
        )
          AND ${eligibleAwardLotStatusSql('lot')}
      `);
    }
  } catch {
    // If table inspection or TEMP creation is unsupported, silently continue
  }
}

export function ensureVerifiedContractMetadataTable(db: DatabaseSync): void {
  try {
    const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'verified_contract_metadata' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'verified_contract_metadata' LIMIT 1").get();
    if (hasTable) return;
    db.exec(`
      CREATE TEMP TABLE IF NOT EXISTS verified_contract_metadata (
        legacy_id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL UNIQUE,
        explicit_end_date TEXT,
        source TEXT NOT NULL,
        reason TEXT
      );
    `);
    const metadataCandidates = [
      path.resolve(process.cwd(), 'data/verified-contract-metadata.json'),
      path.resolve(process.cwd(), '../data/verified-contract-metadata.json'),
      path.resolve(__dirname, '../../data/verified-contract-metadata.json'),
      path.resolve(__dirname, '../../../data/verified-contract-metadata.json'),
      path.resolve(__dirname, '../../../../data/verified-contract-metadata.json'),
    ];
    let metadataFile: string | null = null;
    for (const cand of metadataCandidates) {
      if (fs.existsSync(cand)) {
        metadataFile = cand;
        break;
      }
    }
    if (metadataFile) {
      const items = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
      if (Array.isArray(items)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO verified_contract_metadata (legacy_id, contract_id, explicit_end_date, source, reason)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const item of items) {
          if (!item.entity_id || !item.explicit_end_date || !item.source || !item.placsp_id) continue;
          const rows = db.prepare(
            "SELECT id FROM contracts WHERE placsp_id = ? OR placsp_id LIKE '%/' || ?"
          ).all(String(item.placsp_id), String(item.placsp_id)) as Array<{ id: string }>;
          if (rows.length === 1) {
            stmt.run(String(item.entity_id), rows[0].id, item.explicit_end_date, item.source, item.reason || null);
          }
        }
      }
    }
  } catch {
    // Silently continue if metadata table initialization cannot complete
  }
}

/** Test-only injection point for isolated in-memory SQLite databases. */
export function setDbForTests(db: DatabaseSync | null): void {
  if (db) {
    ensureLotAwardsTable(db);
    ensureVerifiedContractMetadataTable(db);
  }
  dbInstance = db;
}

function resolveDatabasePath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'data/licitaciones_alcazar.db'),
    path.resolve(process.cwd(), '../data/licitaciones_alcazar.db'),
    path.resolve(__dirname, '../../data/licitaciones_alcazar.db'),
    path.resolve(__dirname, '../../../data/licitaciones_alcazar.db'),
    path.resolve(__dirname, '../../../../data/licitaciones_alcazar.db'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), 'data/licitaciones_alcazar.db');
}


export function getDb(): DatabaseSync {
  if (!dbInstance) {
    const dbPath = resolveDatabasePath();
    dbInstance = new DatabaseSync(dbPath, { readOnly: true } as any);
  }
  ensureLotAwardsTable(dbInstance);
  ensureVerifiedContractMetadataTable(dbInstance);
  return dbInstance;
}

export interface Licitacion {
  id: string;
  placsp_id: string | null;
  case_number: string;
  object_description: string;
  contracting_authority_id: string | null;
  contracting_authority_name: string;
  contracting_authority_nif: string;
  contracting_authority_dir3: string | null;
  contracting_authority_city: string | null;
  department: string | null;
  contract_type: string;
  contract_type_code?: string | null;
  procedimiento?: string;
  procedure?: string;
  procedure_code?: string | null;
  procedure_source?: string | null;
  economic_nature?: 'gasto' | 'ingreso' | 'concesion' | 'sin_clasificar' | null;
  status: string;
  amount_excl_vat: number | null;
  amount_incl_vat: number | null;
  estimated_value?: number | null;
  awarded_amount: number | null;
  awarded_amount_incl_vat: number | null;
  award_amount_type?: 'total' | 'unitario' | 'desconocido' | null;
  awardee: string | null;
  awardee_nif: string | null;
  offer_count: number | null;
  is_sme: number | boolean | null;
  primary_cpv: string | null;
  cpvs: string | null;
  location: string | null;
  nuts: string | null;
  duration: string | null;
  duration_unit: string | null;
  eu_funding: string | null;
  urgency: string | null;
  deadline_date: string | null;
  award_date: string | null;
  formalization_date?: string | null;
  publication_date: string | null;
  url: string | null;
  source_url?: string | null;
  conjunto: string | null;
  year: number | null;
  scope: string;
  is_lotized?: number | boolean | null;
  lot_count?: number | null;
  lots_source?: string | null;
}

export interface LicitacionLoteItem {
  id: string;
  licitacionId: string;
  case_number: string | null;
  numeroLote: string;
  nombreLote: string | null;
  importeSinIva: number | null;
  importeConIva: number | null;
  presupuestoSinIva?: number | null;
  presupuestoConIva?: number | null;
  importeAdjudicacion?: number | null;
  importeAdjConIva?: number | null;
  valorEstimado?: number | null;
  awardee: string | null;
  nifAdjudicatario: string | null;
  estadoLote: string | null;
  fechaAdjudicacion: string | null;
  cpv: string | null;
  numOfertas?: number | null;
  adjudicaciones?: Array<{
    awardee: string | null;
    nifAdjudicatario: string | null;
    importeAdjudicacion: number | null;
    importeAdjConIva: number | null;
    numOfertas: number | null;
    fechaAdjudicacion: string | null;
    estado: string | null;
  }>;
}

export interface ConcurrenciaStats {
  totalEvaluadas: number;
  unaOferta: number;
  masDeUnaOferta: number;
  pctUnaOferta: number;
  mediaOfertas: number;
  distribucionOfertas?: {
    una: number;
    dos: number;
    tresACinco: number;
    masDeCinco: number;
    pctUna: number;
    pctDos: number;
    pctTresACinco: number;
    pctMasDeCinco: number;
  };
  porTipo: { tipo: string; total: number; unaOferta: number; pctLicitadorUnico: number; mediaOfertas: number }[];
  porProcedimiento: { procedimiento: string; total: number; unaOferta: number; pctLicitadorUnico: number; mediaOfertas: number }[];
  menoresAdjudicacionDirecta?: {
    total: number;
    unaOferta: number;
    masDeUnaOferta: number;
    pctUnaOferta: number;
    mediaOfertas: number;
  };
}

export interface MenorRecurrenteItem {
  awardee: string;
  adjudicatario: string;
  nif: string;
  totalMenores: number;
  volumenTotal: number;
  mediaImporte: number;
  maxVec: number | null;
  tipoPredominante: string;
  tipoMaxContrato?: string;
  umbralLegal: number | null;
  diferenciaUmbral: number | null;
  alertaUmbral: boolean;
  anos: string[];
}

export interface DistribucionTramo {
  label: string;
  min: number;
  max: number;
  count: number;
  pct: number;
}

export interface PercentilesStats {
  min: number;
  p25: number;
  mediana: number;
  media: number;
  p75: number;
  p90: number;
  max: number;
  iqr: number;
  umbralOutlier: number;
}

export interface TiemposOrganismo {
  organo: string;
  mediaDias: number;
  medianaDias: number;
  p90Dias: number;
  contratos: number;
}

export interface OutlierItem {
  id: string;
  case_number: string;
  object_description: string;
  organo: string;
  dias: number;
  desviacionSobreMediana: number;
  amount: number;
  importe?: number | null;
  awardee: string;
  procedimiento?: string;
}

export interface TiemposStats {
  mediaDiasResolucion: number;
  medianaDiasResolucion: number;
  totalEvaluados: number;
  percentiles: PercentilesStats;
  distribucion: DistribucionTramo[];
  porOrganismo: TiemposOrganismo[];
  outliers: OutlierItem[];
  masRapidas: { id: string; case_number: string; object_description: string; organo: string; dias: number; amount: number; awardee: string }[];
  masLentas: OutlierItem[];
  mediaAyto: number;
  mediaAguas: number;
  mediaComsermancha: number;
  bajaPercentiles?: PercentilesStats;
}

/**
 * Indicador 5 — Fraccionamiento de contratos menores.
 * La lógica de detección (ventana, similitud, score) vive en lib/fraccionamiento.ts;
/**
 * Normaliza el parámetro de ámbito institucional a su valor canónico en BD.
 */
export function parseScope(scope?: string | null): 'Directa Municipal' | 'Indirecta (Mancomunidad)' | null {
  if (!scope) return null;
  const a = scope.trim().toLowerCase();
  if (a === 'directa' || a === 'directa municipal' || a === 'directa_municipal') {
    return 'Directa Municipal';
  }
  if (a === 'mancomunidad' || a === 'comsermancha' || a === 'indirecta' || a === 'indirecta (mancomunidad)' || a === 'indirecta_mancomunidad') {
    return 'Indirecta (Mancomunidad)';
  }
  return null;
}

/**
 * Indicador 5: Detección de fraccionamiento de contratos menores.
 *
 * NOTA DE ARQUITECTURA: toda la lógica de negocio vive en `src/lib/fraccionamiento.ts`;
 * esta función solo consulta SQLite e invoca el detector. La detección siempre se
 * ejecuta sobre todos los datos (las ventanas pueden cruzar años); el filtro por
 * ejercicio se aplica después sobre el solapamiento de la ventana principal.
 */
export function getFraccionamientoMenores(limit = 20, year?: number | string, scope?: string): { casos: FraccionamientoItem[]; totalCasos: number } {
  const db = getDb();
  const filterScope = parseScope(scope);
  const whereScope = filterScope ? 'AND l.scope = ?' : '';
  const params = filterScope ? [filterScope] : [];

  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());

  const minorSource = hasLotAwardsTable
    ? `
      WITH minor_source AS (
        SELECT
          l.id,
          l.awardee,
          l.awardee_nif,
          l.contracting_authority_id,
          l.contracting_authority_name,
          l.contract_type,
          l.object_description,
          l.primary_cpv,
          l.awarded_amount,
          l.award_date,
          l.scope
        FROM contracts l
        WHERE l.procedure IN ('Contrato menor', 'Menor')
          AND l.awardee IS NOT NULL AND trim(l.awardee) <> ''
          AND l.award_date IS NOT NULL
          AND NOT ${terminalContractStatusSql('l')}
          AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total')
          AND NOT EXISTS (
            SELECT 1 FROM contract_lots lot_parent
            WHERE lot_parent.contract_id = l.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM lot_awards award
            WHERE award.contract_id = l.id
          )

        UNION ALL

        SELECT
          l.id,
          award.awardee,
          award.awardee_nif,
          l.contracting_authority_id,
          l.contracting_authority_name,
          l.contract_type,
          l.object_description,
          l.primary_cpv,
          award.awarded_amount,
          award.award_date,
          l.scope
        FROM contracts l
        JOIN lot_awards award ON award.contract_id = l.id
        WHERE l.procedure IN ('Contrato menor', 'Menor')
          AND trim(coalesce(award.awardee, '')) <> ''
          AND award.awarded_amount IS NOT NULL
          AND award.award_date IS NOT NULL
          AND NOT ${canceledContractStatusSql('l')}
          AND ${eligibleAwardResultStateSql('award')}
          AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido'))

        UNION ALL

        SELECT
          l.id,
          ll.awardee,
          ll.awardee_nif,
          l.contracting_authority_id,
          l.contracting_authority_name,
          l.contract_type,
          l.object_description,
          coalesce(nullif(ll.cpv, ''), l.primary_cpv),
          ll.awarded_amount,
          coalesce(ll.award_date, l.award_date),
          l.scope
        FROM contracts l
        JOIN contract_lots ll ON ll.contract_id = l.id
        WHERE l.procedure IN ('Contrato menor', 'Menor')
          AND trim(coalesce(ll.awardee, '')) <> ''
          AND coalesce(ll.award_date, l.award_date) IS NOT NULL
          AND ll.awarded_amount IS NOT NULL
          AND NOT ${canceledContractStatusSql('l')}
          AND ${eligibleAwardLotStatusSql('ll')}
          AND NOT EXISTS (
            SELECT 1 FROM lot_awards award
            WHERE award.contract_id = ll.contract_id
              AND award.lot_number = ll.lot_number
              AND (
                (
                  award.awardee IS NOT NULL
                  AND trim(coalesce(award.awardee, '')) <> ''
                  AND ${eligibleAwardResultStateSql('award')}
                )
                OR ${terminalNoAwardResultStateSql('award')}
              )
          )
          AND ${excludeLegacyLotWhenStructuredTerminalResultSql('ll')}
          AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido'))
      )
      SELECT
        l.id,
        l.awardee,
        nullif(l.awardee_nif, '') as awardee_nif,
        r.canonical_id,
        r.group_id,
        r.group_name,
        l.contracting_authority_id,
        l.contracting_authority_name,
        l.contract_type,
        l.object_description,
        nullif(l.primary_cpv, '') as primary_cpv,
        l.awarded_amount,
        l.award_date
      FROM minor_source l
      LEFT JOIN company_resolution r
        ON coalesce(l.awardee_nif, '') = r.raw_nif
       AND coalesce(l.awardee, '') = r.raw_name
      WHERE 1 = 1
        ${whereScope};
    `
    : `
    WITH minor_source AS (
      SELECT
        l.id,
        l.awardee,
        l.awardee_nif,
        l.contracting_authority_id,
        l.contracting_authority_name,
        l.contract_type,
        l.object_description,
        l.primary_cpv,
        l.awarded_amount,
        l.award_date,
        l.scope
      FROM contracts l
      WHERE l.procedure IN ('Contrato menor', 'Menor')
        AND l.awardee IS NOT NULL AND trim(l.awardee) <> ''
        AND l.award_date IS NOT NULL
        AND NOT ${terminalContractStatusSql('l')}
        AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total')
        AND NOT EXISTS (
          SELECT 1 FROM contract_lots lot_parent
          WHERE lot_parent.contract_id = l.id
        )

      UNION ALL

      SELECT
        l.id,
        ll.awardee,
        ll.awardee_nif,
        l.contracting_authority_id,
        l.contracting_authority_name,
        l.contract_type,
        l.object_description,
        coalesce(nullif(ll.cpv, ''), l.primary_cpv),
        ll.awarded_amount,
        coalesce(ll.award_date, l.award_date),
        l.scope
      FROM contracts l
      JOIN contract_lots ll ON ll.contract_id = l.id
      WHERE l.procedure IN ('Contrato menor', 'Menor')
        AND trim(coalesce(ll.awardee, '')) <> ''
        AND coalesce(ll.award_date, l.award_date) IS NOT NULL
        AND ll.awarded_amount IS NOT NULL
        AND NOT ${canceledContractStatusSql('l')}
        AND ${eligibleAwardLotStatusSql('ll')}
        AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total')
    )
    SELECT
      l.id,
      l.awardee,
      nullif(l.awardee_nif, '') as awardee_nif,
      r.canonical_id,
      r.group_id,
      r.group_name,
      l.contracting_authority_id,
      l.contracting_authority_name,
      l.contract_type,
      l.object_description,
      nullif(l.primary_cpv, '') as primary_cpv,
      l.awarded_amount,
      l.award_date
    FROM minor_source l
    LEFT JOIN company_resolution r
      ON coalesce(l.awardee_nif, '') = r.raw_nif
     AND coalesce(l.awardee, '') = r.raw_name
    WHERE 1 = 1
      ${whereScope};
  `;
  const rows = db.prepare(minorSource).all(...params) as any[];

  const contratos: FraccionamientoContrato[] = rows.map((r: any) => ({
    id: r.id,
    canonicalId: r.canonical_id || null,
    adjudicatario: r.awardee,
    nif: r.awardee_nif || null,
    grupoId: r.group_id || null,
    grupoNombre: r.group_name || null,
    authorityId: r.contracting_authority_id || null,
    organo: r.contracting_authority_name,
    tipoContrato: r.contract_type || '',
    objeto: r.object_description || '',
    cpv: r.primary_cpv || null,
    // Base imponible: solo awarded_amount (el PBL amount_excl_vat no es adjudicación).
    importeSinIva: Number(r.awarded_amount) || 0,
    fechaAdjudicacion: (r.award_date || '').slice(0, 10),
  }));

  const { casos: todos } = detectarFraccionamiento(contratos);

  const anoNum = Number(year);
  const casos = !isNaN(anoNum) && anoNum > 0 ? casosDelAno(todos, anoNum) : todos;
  return toPlain({ casos: casos.slice(0, limit), totalCasos: casos.length });
}

export interface RedFlag {
  tipo: 'oferta_unica' | 'baja_cero' | 'alerta_menor' | 'fondos_ue' | 'baja_temeraria' | 'baja_temeraria_extrema' | 'sobrecoste_licitacion' | 'modificado_proyecto' | 'lotes_desiertos' | 'baja_temeraria_lote' | 'oferta_unica_lote' | 'negociado_sin_publicidad';
  title: string;
  description: string;
  level: 'alerta' | 'aviso' | 'info';
  hecho?: string;
  norma?: string;
  queComprobar?: string;
  cierre?: string;
  explicacionAlternativa?: string;
  senalesVerificables?: string[];
  nivel?: 'alerta' | 'aviso' | 'info';
  titulo?: string;
  descripcion?: string;
}

export interface RedFlagsStats {
  totalOfertaUnica: number;
  volumenOfertaUnica: number;
  totalBajaCero: number;
  volumenBajaCero: number;
  totalAlertaMenor: number;
  volumenAlertaMenor: number;
  totalFondosUe: number;
  volumenFondosUe: number;
  topExpedientesConAlertas: {
    id: string;
    case_number: string;
    object_description: string;
    contracting_authority_name: string;
    amount: number;
    awardee: string;
    alerts: string[];
  }[];
}

export interface QuickSearchResult {
  contracts: { id: string; case_number: string; object_description: string; amount: number | null; amount_label: string; organo: string }[];
  empresas: { id?: string; nombre: string; nif: string; contratos: number; volumen: number; grupo?: string; link_type?: string }[];
  organismos: { authorityId: string; placsp_id?: string | null; name?: string; nombre: string; contratos: number; volumen: number }[];
}

export type NivelConcentracion = 'competitivo' | 'moderado' | 'concentrado';

export function getNivelHHI(hhi: number): NivelConcentracion {
  if (hhi < 1500) return 'competitivo';
  if (hhi <= 2500) return 'moderado';
  return 'concentrado';
}

export interface ConcentracionItem {
  authorityKey?: string;
  nombre: string;
  volumen: number;
  numEmpresas: number;
  hhi: number;
  cr5: number;
  cr1: number;
  topEmpresa: string;
  topEmpresaVolumen: number;
  level: NivelConcentracion;
  nivel?: NivelConcentracion;
}

export interface ConcentracionStats {
  global: {
    hhi: number;
    cr5: number;
    cr1: number;
    totalEmpresas: number;
    totalVolumen: number;
    level: NivelConcentracion;
    nivel?: NivelConcentracion;
    top5Empresas: { nombre: string; volumen: number; sharePct: number }[];
  };
  porTipo: ConcentracionItem[];
  porOrganismo: ConcentracionItem[];
  evolucion: {
    year: number;
    volumen: number;
    numEmpresas: number;
    hhi: number;
    cr5: number;
    cr1: number;
    topEmpresa: string;
    topEmpresaVolumen: number;
    level: NivelConcentracion;
    nivel?: NivelConcentracion;
  }[];
}

export interface EvolucionAnualItem {
  year: number;
  contratos: number;
  contracts?: number;
  volumen: number;
  pctOfertaUnica: number;
  totalEvaluadasOferta: number;
  tiempoMedioDias: number;
  tiempoMedianaDias: number;
  totalEvaluadosTiempos: number;
  bajaMediaPct: number;
  totalEvaluadosBaja: number;
  empresasDistintas: number;
}

export interface RenovacionAnualItem {
  year: number;
  totalActivos: number;
  nuevosEntrantes: number;
  veteranos: number;
  pctRenovacion: number;
  gastoTotal: number;
  gastoNuevos: number;
  gastoVeteranos: number;
  pctGastoNuevos: number;
  pctGastoVeteranos: number;
  alertaMercadoCerrado: boolean;
}

export interface VeteranaItem {
  empresaId: string;
  nombre: string;
  cif?: string;
  totalEjercicios: number;
  primerAno: number;
  ultimoAno: number;
  totalContratos: number;
  totalVolumen: number;
}

export interface NuevoEntranteItem {
  empresaId: string;
  empresaNombre: string;
  cif?: string;
  year: number;
  licitacionId: string;
  case_number: string;
  object_description: string;
  amount: number;
  procedimiento: string;
  procedure?: string;
  fechaAdjudicacion?: string;
  expediente?: string;
  objeto?: string;
  importe?: number;
}

export interface RenovacionMercadoStats {
  resumenGlobal: {
    totalEmpresasHistoricas: number;
    tasaRenovacionActual: number;
    pctGastoNuevosActual: number;
    tasaRenovacionMedia: number;
    anoMaxRenovacion: number;
    anoMinRenovacion: number;
    alertaMercadoCerrado: boolean;
    diagnostico: string;
  };
  evolucion: RenovacionAnualItem[];
  veteranas: VeteranaItem[];
  nuevosEntrantes: NuevoEntranteItem[];
  anoSeleccionado?: number | null;
}

export interface PeriodoElectoralItem {
  nombre: string;
  periodo: string;
  fechaElecciones: string;
  year: number;
  esElectoral: boolean;
  contratos: number;
  volumen: number;
  contratosObras: number;
  volumenObras: number;
  contratosServicios: number;
  volumenServicios: number;
  pctObrasYServicios: number;
  desviacionContratosPct: number;
  desviacionVolumenPct: number;
  topLicitaciones: {
    id: string;
    case_number: string;
    object_description: string;
    tipoContrato: string;
    amount: number;
    document_date: string;
    awardee: string;
  }[];
}

export interface CalendarioElectoralStats {
  mediaNoElectoral: {
    contratosTrimestre: number;
    volumenTrimestre: number;
    contratosObras: number;
    volumenObras: number;
    contratosServicios: number;
    volumenServicios: number;
    pctObrasYServicios: number;
    ejerciciosAnalizados: number[];
  };
  periodosElectorales: PeriodoElectoralItem[];
  evolucionMensual: {
    mesAno: string;
    year: number;
    mes: number;
    mesNombre: string;
    contratos: number;
    volumen: number;
    esPreelectoral: boolean;
    etiquetaEleccion?: string;
  }[];
  diagnostico: string;
}

export interface LoteItem {
  id: string;
  case_number: string;
  object_description: string;
  organo: string;
  tipo: string;
  procedimiento: string;
  amount: number | null;
  awardee: string | null;
  offer_count: number | null;
  url: string | null;
  year: number | null;
  numLotes?: number;
  motivoLote?: string;
  expediente?: string;
  objeto?: string;
  procedure?: string;
  importe?: number | null;
  adjudicatario?: string | null;
  numOfertas?: number | null;
  source_url?: string | null;
}

export interface LotesStats {
  resumen: {
    totalMayores: number;
    lotizadosMayores: number;
    pctLotizadosMayores: number;
    totalGrandes100k: number;
    lotizadosGrandes100k: number;
    pctLotizadosGrandes100k: number;
    totalMegacontratos500k: number;
    lotizadosMegacontratos500k: number;
    pctLotizadosMegacontratos500k: number;
    volumenTotalMayores: number;
    volumenLotizados: number;
    pctVolumenLotizados: number;
    concurrencia: {
      lotesEvaluados: number;
      contratosEvaluadosNoLotizados: number;
      mediaOfertasLotizados: number;
      mediaOfertasNoLotizados: number;
      pctOfertaUnicaLotizados: number;
      pctOfertaUnicaNoLotizados: number;
    };
  };
  porTipo: {
    tipo: string;
    totalMayores: number;
    lotizados: number;
    pctLotizados: number;
    volumenTotal: number;
    volumenLotizados: number;
  }[];
  porAno: {
    year: number;
    totalMayores: number;
    lotizados: number;
    pctLotizados: number;
    volumenTotal: number;
    volumenLotizados: number;
  }[];
  porTramo: {
    tramo: string;
    totalContratos: number;
    lotizados: number;
    pctLotizados: number;
    volumenTotal: number;
    volumenLotizados: number;
  }[];
  grandesNoLotizados: LoteItem[];
  contratosLotizados: LoteItem[];
  diagnostico: string;
}

export interface BajaTemerariaItem {
  id: string;
  case_number: string;
  expediente?: string;
  object_description: string;
  objeto?: string;
  organo: string;
  tipo: string;
  procedimiento: string;
  procedure?: string;
  amount_excl_vat: number;
  importe_sin_iva?: number;
  estimated_value?: number | null;
  valor_estimado?: number | null;
  awarded_amount: number;
  importe_adjudicacion?: number;
  baja_pct: number;
  ahorro_euros: number;
  offer_count: number | null;
  num_ofertas?: number | null;
  esLicitadorUnico?: boolean;
  posiblePrecioUnitario?: boolean;
  awardee: string;
  adjudicatario?: string;
  awardee_nif: string | null;
  url: string | null;
  source_url?: string | null;
  year: number | null;
  nivelRiesgo: 'extrema' | 'muy_agresiva' | 'significativa';
}

export interface EmpresaBajaAgresiva {
  awardee: string;
  adjudicatario?: string;
  nif: string | null;
  empresaId?: string;
  totalContratos: number;
  bajasExtremas: number;
  bajasAgresivas: number;
  pctBajasAgresivas: number;
  bajaMediaPct: number;
  volumenTotal: number;
}

export interface BajaTemerariaStats {
  resumen: {
    totalEvaluados: number;
    bajasExtremasCount: number;
    bajasAgresivasCount: number;
    bajasSignificativasCount: number;
    bajasModeradasCount: number;
    bajaMediaGlobal: number;
    volumenEnRiesgo: number;
    pctContratosRiesgo: number;
  };
  tramos: {
    tramo: string;
    rango: string;
    count: number;
    pct: number;
    volumen: number;
    level: 'alerta' | 'advertencia' | 'moderada' | 'neutro';
    nivel?: 'alerta' | 'advertencia' | 'moderada' | 'neutro';
  }[];
  topBajas: BajaTemerariaItem[];
  rankingEmpresas: EmpresaBajaAgresiva[];
  diagnostico: string;
}

export interface GlobalStats {
  totalLicitaciones: number;
  totalImporte: number;
  gastoAdjudicado: number;
  ingresosAdjudicados: number;
  concesionesAdjudicadas: number;
  gastoEnCurso: number;
  gastoDesierto: number;
  ingresosDesiertos: number;
  concesionesDesiertas: number;
  totalOrganismos: number;
  totalEmpresas: number;
  ahorroMedioPct: number;
  ultimaActualizacion: string;
  ultimaSincronizacion?: string | null;
  ultimaLicitacion?: string | null;
  evolucionAnual: EvolucionAnualItem[];
  porTipo: { tipo: string; contratos: number; volumen: number }[];
  porProcedimiento: { procedimiento: string; contratos: number; volumen: number }[];
  topEmpresasVolumen: { awardee: string; nif: string; id?: string; contratos: number; volumen: number; gasto_adjudicado?: number; ingresos_adjudicados?: number; grupo?: string; tipoVinculo?: string }[];
  topEmpresasContratos: { awardee: string; nif: string; id?: string; contratos: number; volumen: number; gasto_adjudicado?: number; ingresos_adjudicados?: number; grupo?: string; tipoVinculo?: string }[];
  topOrganismos: { authorityId?: string; organo: string; name?: string; placsp_id?: string; contratos: number; volumen: number; gasto_adjudicado?: number; ingresos_adjudicados?: number; scope?: string }[];
  ultimasLicitaciones: Licitacion[];
  concurrencia: ConcurrenciaStats;
  menoresRecurrentes: MenorRecurrenteItem[];
  tiempos: TiemposStats;
  redFlags: RedFlagsStats;
  fraccionamiento: FraccionamientoItem[];
  fraccionamientoTotal: number;
  concentracion: ConcentracionStats;
  flujo: FlujoStats;
  contratosVivos: ContratosVivosStats;
  renovacionMercado: RenovacionMercadoStats;
  calendarioElectoral: CalendarioElectoralStats;
  lotes: LotesStats;
  bajasTemerarias: BajaTemerariaStats;
  modificados: ModificadosStats;
  duracionEfectiva: DuracionEfectivaStats;
  empresasLocales: EmpresasLocalesStats;
  desgloseAmbito: {
    directa: { contratos: number; volumen: number; gastoAdjudicado: number; pctVolumen: number; pctGasto: number };
    mancomunidad: { contratos: number; volumen: number; gastoAdjudicado: number; pctVolumen: number; pctGasto: number };
  };
  anoSeleccionado?: number | null;
  ambitoSeleccionado?: string | null;
}

export function getConcurrenciaStats(year?: number | string, scope?: string): ConcurrenciaStats {
  const db = getDb();
  const anoNum = Number(year);
  const filterByAno = !isNaN(anoNum) && anoNum > 0;
  const filterScope = parseScope(scope);

  // En expedientes lotizados, la aplicación ya expone como número efectivo de
  // ofertas la suma de las ofertas registradas en lotes no desiertos. Mantener
  // aquí el valor del contrato padre produciría estadísticas de concurrencia
  // distintas de las que ve el usuario en el listado de licitaciones.
  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());

  const lotAwardsOfferSource = hasLotAwardsTable ? `
      LEFT JOIN (
        SELECT contract_id, lot_number, MAX(offer_count) AS offer_count
        FROM lot_awards award
        WHERE offer_count IS NOT NULL
          AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          AND ${eligibleAwardResultStateSql()}
        GROUP BY contract_id, lot_number
      ) award ON award.contract_id = lot.contract_id AND award.lot_number = lot.lot_number
  ` : '';

  const effectiveSource = `
    SELECT c.*,
      CASE WHEN coalesce(l.lot_offer_count, 0) > 0 THEN l.lot_offer_sum
           ELSE c.offer_count END AS effective_offer_count
    FROM contracts c
    LEFT JOIN (
      SELECT lot.contract_id,
        SUM(CASE WHEN coalesce(lot.offer_count, award.offer_count) > 0
                 THEN coalesce(lot.offer_count, award.offer_count) ELSE 0 END) AS lot_offer_sum,
        COUNT(CASE WHEN coalesce(lot.offer_count, award.offer_count) > 0 THEN 1 END) AS lot_offer_count
      FROM contract_lots lot
      ${lotAwardsOfferSource}
      WHERE ${eligibleAwardLotStatusSql('lot')}
      GROUP BY lot.contract_id
    ) l ON l.contract_id = c.id
  `;

  const baseConditions = [
    `(${explicitlyAwardedContractStatusSql('')} OR ${resolvedContractStatusSql('')})`,
    "effective_offer_count IS NOT NULL AND effective_offer_count > 0"
  ];
  const params: any[] = [];
  if (filterByAno) {
    baseConditions.push('year = ?');
    params.push(anoNum);
  }
  if (filterScope) {
    baseConditions.push('scope = ?');
    params.push(filterScope);
  }

  const competitiveConditions = [
    ...baseConditions,
    "coalesce(procedure, '') NOT IN ('Contrato menor', 'Menor')",
    "coalesce(dataset, '') != 'menores'"
  ];
  const whereCompetitive = `WHERE ${competitiveConditions.join(' AND ')}`;

  const summary = db.prepare(`
    SELECT
      count(*) as total,
      sum(CASE WHEN effective_offer_count = 1 THEN 1 ELSE 0 END) as una_oferta,
      sum(CASE WHEN effective_offer_count = 2 THEN 1 ELSE 0 END) as dos_ofertas,
      sum(CASE WHEN effective_offer_count >= 3 AND effective_offer_count <= 5 THEN 1 ELSE 0 END) as tres_a_cinco,
      sum(CASE WHEN effective_offer_count > 5 THEN 1 ELSE 0 END) as mas_de_cinco,
      sum(CASE WHEN effective_offer_count > 1 THEN 1 ELSE 0 END) as mas_de_una,
      round(avg(effective_offer_count), 2) as media_ofertas,
      round(sum(CASE WHEN effective_offer_count = 1 THEN 1.0 ELSE 0.0 END) * 100.0 / count(*), 1) as pct_una_oferta
    FROM (${effectiveSource})
    ${whereCompetitive};
  `).get(...params) as any;

  const porTipo = db.prepare(`
    SELECT
      coalesce(contract_type, 'Otros') as tipo,
      count(*) as total,
      sum(CASE WHEN effective_offer_count = 1 THEN 1 ELSE 0 END) as una_oferta,
      round(sum(CASE WHEN effective_offer_count = 1 THEN 1.0 ELSE 0.0 END) * 100.0 / count(*), 1) as pct_licitador_unico,
      round(avg(effective_offer_count), 2) as media_ofertas
    FROM (${effectiveSource})
    ${whereCompetitive}
    GROUP BY contract_type
    ORDER BY total DESC;
  `).all(...params) as any[];

  const porProcedimiento = db.prepare(`
    SELECT
      coalesce(procedure, 'Otros') as procedimiento,
      count(*) as total,
      sum(CASE WHEN effective_offer_count = 1 THEN 1 ELSE 0 END) as una_oferta,
      round(sum(CASE WHEN effective_offer_count = 1 THEN 1.0 ELSE 0.0 END) * 100.0 / count(*), 1) as pct_licitador_unico,
      round(avg(effective_offer_count), 2) as media_ofertas
    FROM (${effectiveSource})
    ${whereCompetitive}
    GROUP BY procedure
    ORDER BY total DESC;
  `).all(...params) as any[];

  const minorConditions = [
    ...baseConditions,
    "(coalesce(procedure, '') IN ('Contrato menor', 'Menor') OR coalesce(dataset, '') = 'menores')"
  ];
  const whereMinor = `WHERE ${minorConditions.join(' AND ')}`;

  const minorSummary = db.prepare(`
    SELECT
      count(*) as total,
      sum(CASE WHEN effective_offer_count = 1 THEN 1 ELSE 0 END) as una_oferta,
      sum(CASE WHEN effective_offer_count > 1 THEN 1 ELSE 0 END) as mas_de_una,
      round(avg(effective_offer_count), 2) as media_ofertas,
      round(sum(CASE WHEN effective_offer_count = 1 THEN 1.0 ELSE 0.0 END) * 100.0 / count(*), 1) as pct_una_oferta
    FROM (${effectiveSource})
    ${whereMinor};
  `).get(...params) as any;

  const totalEvaluadas = summary?.total || 0;
  const unaOferta = summary?.una_oferta || 0;
  const dosOfertas = summary?.dos_ofertas || 0;
  const tresACinco = summary?.tres_a_cinco || 0;
  const masDeCinco = summary?.mas_de_cinco || 0;

  return toPlain({
    totalEvaluadas,
    unaOferta,
    masDeUnaOferta: summary?.mas_de_una || 0,
    pctUnaOferta: summary?.pct_una_oferta || 0,
    mediaOfertas: summary?.media_ofertas || 0,
    distribucionOfertas: {
      una: unaOferta,
      dos: dosOfertas,
      tresACinco,
      masDeCinco,
      pctUna: totalEvaluadas > 0 ? Math.round((unaOferta / totalEvaluadas) * 1000) / 10 : 0,
      pctDos: totalEvaluadas > 0 ? Math.round((dosOfertas / totalEvaluadas) * 1000) / 10 : 0,
      pctTresACinco: totalEvaluadas > 0 ? Math.round((tresACinco / totalEvaluadas) * 1000) / 10 : 0,
      pctMasDeCinco: totalEvaluadas > 0 ? Math.round((masDeCinco / totalEvaluadas) * 1000) / 10 : 0,
    },
    porTipo: porTipo.map((r: any) => ({
      tipo: r.tipo,
      total: r.total,
      unaOferta: r.una_oferta,
      pctLicitadorUnico: r.pct_licitador_unico,
      mediaOfertas: r.media_ofertas,
    })),
    porProcedimiento: porProcedimiento.map((r: any) => ({
      procedimiento: r.procedimiento,
      total: r.total,
      unaOferta: r.una_oferta,
      pctLicitadorUnico: r.pct_licitador_unico,
      mediaOfertas: r.media_ofertas,
    })),
    menoresAdjudicacionDirecta: {
      total: minorSummary?.total || 0,
      unaOferta: minorSummary?.una_oferta || 0,
      masDeUnaOferta: minorSummary?.mas_de_una || 0,
      pctUnaOferta: minorSummary?.pct_una_oferta || 0,
      mediaOfertas: minorSummary?.media_ofertas || 0,
    },
  });
}

export function getMenoresRecurrentes(year?: number | string, limit = 15, scope?: string): MenorRecurrenteItem[] {
  const db = getDb();
  const anoNum = Number(year);
  const filterByAno = !isNaN(anoNum) && anoNum > 0;
  const filterScope = parseScope(scope);

  const subConditions = ["dataset = 'menores'"];
  const subParams: any[] = [];
  if (filterByAno) {
    subConditions.push("year = ?");
    subParams.push(anoNum);
  }
  if (filterScope) {
    subConditions.push("scope = ?");
    subParams.push(filterScope);
  }

  const andSub = [
    ...subConditions.map(c => `AND l_crit.${c}`),
    `AND NOT ${terminalContractStatusSql('l_crit')}`,
  ].join(' ');
  const andSub2 = [
    ...subConditions.map(c => `AND l2.${c}`),
    `AND NOT ${terminalContractStatusSql('l2')}`,
  ].join(' ');
  const andSub3 = [
    ...subConditions.map(c => `AND l3.${c}`),
    `AND NOT ${terminalContractStatusSql('l3')}`,
  ].join(' ');
  const minorSource = getCorporateContractSource(db);

  const stmt = db.prepare(`
    WITH minor_source AS ${minorSource}
    SELECT
      MAX(awardee) as awardee,
      coalesce(awardee_nif, '') as nif,
      count(DISTINCT id) as total_menores,
      round(sum(CASE WHEN NOT ${terminalContractStatusSql('minor_source')} AND (award_amount_type IS NULL OR award_amount_type = 'total') THEN coalesce(awarded_amount, 0) ELSE 0 END), 2) as volumen_total,
      round(avg(CASE WHEN NOT ${terminalContractStatusSql('minor_source')} AND (award_amount_type IS NULL OR award_amount_type = 'total') THEN awarded_amount END), 2) as media_importe,
      (
        SELECT round(l_crit.estimated_value, 2)
        FROM minor_source l_crit
        WHERE coalesce(nullif(l_crit.awardee_nif, ''), l_crit.awardee) = coalesce(nullif(minor_source.awardee_nif, ''), minor_source.awardee)
          AND l_crit.estimated_value IS NOT NULL
          ${andSub}
        ORDER BY (l_crit.estimated_value * 1.0 / (CASE WHEN lower(l_crit.contract_type) LIKE '%obra%' THEN 40000.0 ELSE 15000.0 END)) DESC, l_crit.estimated_value DESC
        LIMIT 1
      ) as max_importe,
      (
        SELECT contract_type
        FROM minor_source l2
        WHERE coalesce(nullif(l2.awardee_nif, ''), l2.awardee) = coalesce(nullif(minor_source.awardee_nif, ''), minor_source.awardee)
          ${andSub2}
        GROUP BY contract_type
        ORDER BY count(DISTINCT id) DESC
        LIMIT 1
      ) as tipo_predominante,
      (
        SELECT contract_type
        FROM minor_source l3
        WHERE coalesce(nullif(l3.awardee_nif, ''), l3.awardee) = coalesce(nullif(minor_source.awardee_nif, ''), minor_source.awardee)
          AND l3.estimated_value IS NOT NULL
          ${andSub3}
        ORDER BY (l3.estimated_value * 1.0 / (CASE WHEN lower(l3.contract_type) LIKE '%obra%' THEN 40000.0 ELSE 15000.0 END)) DESC, l3.estimated_value DESC
        LIMIT 1
      ) as tipo_max_contrato,
      group_concat(DISTINCT cast(year as integer)) as anos
    FROM minor_source
    WHERE dataset = 'menores'
      AND NOT ${terminalContractStatusSql('minor_source')}
      AND awardee IS NOT NULL AND awardee != ''
      ${filterByAno ? 'AND year = ?' : ''} ${filterScope ? 'AND scope = ?' : ''}
    GROUP BY coalesce(nullif(awardee_nif, ''), awardee)
    HAVING total_menores >= 3
    ORDER BY total_menores DESC, volumen_total DESC
    LIMIT ?;
  `);

  // Orden de placeholders: subqueries (max_importe, tipo predominante, tipo max contrato), filtro principal, LIMIT.
  const mainParams: any[] = [];
  if (filterByAno) mainParams.push(anoNum);
  if (filterScope) mainParams.push(filterScope);
  const allParams = [...subParams, ...subParams, ...subParams, ...mainParams, limit];
  const rows = stmt.all(...allParams) as any[];

  return toPlain(rows.map((r: any) => {
    // La proximidad al umbral legal solo puede calcularse con VEC.
    // Si ningún contrato del proveedor tiene VEC, el indicador queda sin determinar.
    const maxVec = r.max_importe === null || r.max_importe === undefined ? null : Number(r.max_importe);
    const tipoMax = r.tipo_max_contrato || null;
    const isObra = tipoMax ? tipoMax.toLowerCase().includes('obra') : false;
    const umbralLegal = tipoMax ? (isObra ? 40000 : 15000) : null;
    const diferenciaUmbral = maxVec !== null && umbralLegal !== null
      ? Math.round((umbralLegal - maxVec) * 100) / 100
      : null;
    const ratio = maxVec !== null && umbralLegal !== null && umbralLegal > 0 ? maxVec / umbralLegal : 0;
    const alertaUmbral = maxVec !== null && umbralLegal !== null && maxVec < umbralLegal && Math.round(ratio * 100) >= 90;
    const anosArray = (r.anos || '')
      .split(',')
      .map(Number)
      .filter((n: number) => !isNaN(n) && n > 0)
      .sort((a: number, b: number) => a - b)
      .map(String);

    return {
      awardee: r.awardee,
      adjudicatario: r.awardee,
      nif: r.nif,
      totalMenores: r.total_menores,
      volumenTotal: r.volumen_total,
      mediaImporte: r.media_importe,
      maxVec,
      tipoPredominante: r.tipo_predominante || 'Servicios',
      tipoMaxContrato: tipoMax,
      umbralLegal,
      diferenciaUmbral,
      alertaUmbral,
      anos: anosArray,
    };
  }));
}
export function calculatePercentiles(arr: number[]): PercentilesStats {
  if (!arr.length) {
    return { min: 0, p25: 0, mediana: 0, media: 0, p75: 0, p90: 0, max: 0, iqr: 0, umbralOutlier: 0 };
  }
  const sorted = [...arr].sort((a, b) => a - b);
  const getP = (p: number) => {
    const idx = (p / 100) * (sorted.length - 1);
    const low = Math.floor(idx);
    const high = Math.ceil(idx);
    const w = idx - low;
    return Math.round((sorted[low] * (1 - w) + sorted[high] * w) * 10) / 10;
  };
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p25 = getP(25);
  const mediana = getP(50);
  const p75 = getP(75);
  const p90 = getP(90);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const media = Math.round((sum / sorted.length) * 10) / 10;
  const iqr = Math.round((p75 - p25) * 10) / 10;
  const umbralOutlier = Math.round((p75 + 1.5 * iqr) * 10) / 10;
  return { min, p25, mediana, media, p75, p90, max, iqr, umbralOutlier };
}

export function getTiemposStats(year?: number | string, scope?: string): TiemposStats {
  const db = getDb();
  const anoNum = Number(year);
  const filterByAno = !isNaN(anoNum) && anoNum > 0;
  const filterScope = parseScope(scope);

  const andAno = filterByAno ? 'AND year = ?' : '';
  const andScope = filterScope ? 'AND scope = ?' : '';
  const params: any[] = [];
  if (filterByAno) params.push(anoNum);
  if (filterScope) params.push(filterScope);

  const hasLotAwardsTable = (() => {
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT name FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards'").all() as Array<{ name: string }>;
      return tables.length > 0;
    } catch {
      return false;
    }
  })();

  const lotAwardsAwardeeCovered = hasLotAwardsTable
    ? `(NOT EXISTS (SELECT 1 FROM contract_lots lot WHERE lot.contract_id = contracts.id AND trim(coalesce(lot.awardee, '')) <> '' AND ${eligibleAwardLotStatusSql('lot')}) OR NOT EXISTS (SELECT 1 FROM contract_lots lot WHERE lot.contract_id = contracts.id AND trim(coalesce(lot.awardee, '')) <> '' AND ${eligibleAwardLotStatusSql('lot')} AND NOT EXISTS (SELECT 1 FROM lot_awards award WHERE award.contract_id = lot.contract_id AND award.lot_number = lot.lot_number AND trim(coalesce(award.awardee, '')) <> '' AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')})))`
    : '0';

  const lotAwardsAmountCovered = hasLotAwardsTable
    ? lotAwardsAmountCoverageSql('contracts')
    : '0';

  const lotAwardeeSource = hasLotAwardsTable
    ? `CASE WHEN ${lotAwardsAwardeeCovered}
        THEN (SELECT group_concat(DISTINCT award.awardee) FROM lot_awards award WHERE award.contract_id = contracts.id AND award.awardee IS NOT NULL AND trim(award.awardee) <> '' AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')})
        ELSE (SELECT group_concat(DISTINCT lot.awardee) FROM contract_lots lot WHERE lot.contract_id = contracts.id AND lot.awardee IS NOT NULL AND trim(lot.awardee) <> '' AND ${eligibleAwardLotStatusSql('lot')} AND ${excludeLegacyLotWhenStructuredTerminalResultSql('lot')})
      END`
    : `SELECT group_concat(DISTINCT lot.awardee) FROM contract_lots lot WHERE lot.contract_id = contracts.id AND lot.awardee IS NOT NULL AND trim(lot.awardee) <> '' AND ${eligibleAwardLotStatusSql('lot')}`;

  const lotAwardeeExists = hasLotAwardsTable
    ? `SELECT 1 WHERE (CASE WHEN ${lotAwardsAwardeeCovered} THEN EXISTS (SELECT 1 FROM lot_awards award WHERE award.contract_id = contracts.id AND award.awardee IS NOT NULL AND trim(award.awardee) <> '' AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}) ELSE EXISTS (SELECT 1 FROM contract_lots lot WHERE lot.contract_id = contracts.id AND lot.awardee IS NOT NULL AND trim(lot.awardee) <> '' AND ${eligibleAwardLotStatusSql('lot')} AND ${excludeLegacyLotWhenStructuredTerminalResultSql('lot')}) END)`
    : `SELECT 1 FROM contract_lots lot WHERE lot.contract_id = contracts.id AND lot.awardee IS NOT NULL AND trim(lot.awardee) <> '' AND ${eligibleAwardLotStatusSql('lot')}`;

  const lotAwardedAmount = `CASE
    WHEN ${lotAwardsAmountCovered} AND EXISTS (SELECT 1 FROM lot_awards award WHERE award.contract_id = contracts.id AND award.awarded_amount IS NOT NULL AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')})
    THEN (SELECT round(sum(award.awarded_amount), 2) FROM lot_awards award WHERE award.contract_id = contracts.id AND award.awarded_amount IS NOT NULL AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')})
    ELSE CASE
      WHEN EXISTS (SELECT 1 FROM contract_lots lot WHERE lot.contract_id = contracts.id AND lot.awarded_amount IS NOT NULL AND ${eligibleAwardLotStatusSql('lot')})
      THEN (SELECT round(sum(lot.awarded_amount), 2) FROM contract_lots lot WHERE lot.contract_id = contracts.id AND lot.awarded_amount IS NOT NULL AND ${eligibleLegacyLotAwardAmountSql('lot', hasLotAwardsTable)})
      ELSE CASE WHEN ${allowParentAwardAmountFallbackSql('contracts', hasLotAwardsTable)} THEN coalesce(awarded_amount, 0) ELSE NULL END
    END
  END`

  const rows = db.prepare(`
    SELECT 
      id, case_number, object_description, contracting_authority_name as organo, procedure,
      round(julianday(award_date) - julianday(deadline_date)) as dias,
      CASE
        WHEN NOT ${terminalContractStatusSql('contracts')} AND (award_amount_type IS NULL OR award_amount_type = 'total') THEN
          ${lotAwardedAmount}
        ELSE 0
      END as amount,
      CASE WHEN EXISTS (${lotAwardeeExists}) THEN coalesce((${lotAwardeeSource}), awardee, 'Sin awardee') ELSE coalesce(awardee, 'Sin awardee') END as awardee
    FROM contracts
    WHERE NOT ${terminalContractStatusSql('contracts')}
      AND deadline_date IS NOT NULL
      AND award_date IS NOT NULL
      AND julianday(award_date) >= julianday(deadline_date)
      ${andAno} ${andScope}
    ORDER BY dias ASC;
  `).all(...params) as any[];

  const diasArr = rows.map((r: any) => Number(r.dias));
  const percentiles = calculatePercentiles(diasArr);

  // Tramos de distribución (histograma)
  const bucketDefs = [
    { label: '0–15 días (ultrarrápida)', min: 0, max: 15 },
    { label: '16–30 días (1 mes)', min: 16, max: 30 },
    { label: '31–60 días (1–2 meses)', min: 31, max: 60 },
    { label: '61–90 días (2–3 meses)', min: 61, max: 90 },
    { label: '91–180 días (3–6 meses)', min: 91, max: 180 },
    { label: '> 180 días (alta demora / outlier)', min: 181, max: 99999 },
  ];

  const distribucion: DistribucionTramo[] = bucketDefs.map((b) => {
    const count = rows.filter((r: any) => r.dias >= b.min && r.dias <= b.max).length;
    const pct = rows.length > 0 ? Math.round((count / rows.length) * 1000) / 10 : 0;
    return {
      label: b.label,
      min: b.min,
      max: b.max,
      count,
      pct,
    };
  });

  // Agrupación por organismo dinámico
  const orgMap = new Map<string, number[]>();
  for (const r of rows) {
    if (!orgMap.has(r.organo)) orgMap.set(r.organo, []);
    orgMap.get(r.organo)!.push(r.dias);
  }

  const porOrganismo: TiemposOrganismo[] = Array.from(orgMap.entries())
    .map(([organo, arr]) => {
      const pOrg = calculatePercentiles(arr);
      return {
        organo,
        mediaDias: pOrg.media,
        medianaDias: pOrg.mediana,
        p90Dias: pOrg.p90,
        contratos: arr.length,
      };
    })
    .sort((a, b) => b.contratos - a.contratos);

  const mediaAyto = porOrganismo.find((o) => o.organo.includes('Ayuntamiento'))?.mediaDias || percentiles.media;
  const mediaAguas = porOrganismo.find((o) => o.organo.includes('Aguas'))?.mediaDias || percentiles.media;
  const mediaComsermancha = porOrganismo.find((o) => o.organo.includes('COMSERMANCHA'))?.mediaDias || percentiles.media;

  // Licitaciones más rápidas (top 5)
  const masRapidas = rows.slice(0, 5).map((r: any) => ({
    id: r.id,
    case_number: r.case_number || 'Sin exp.',
    object_description: r.object_description || '',
    organo: r.organo,
    dias: r.dias,
    amount: r.amount,
    awardee: r.awardee,
  }));

  // Outliers y contratos con mayor dilación
  const sortedDesc = [...rows].reverse();
  const masLentas: OutlierItem[] = sortedDesc.slice(0, 5).map((r: any) => ({
    id: r.id,
    case_number: r.case_number || 'Sin exp.',
    object_description: r.object_description || '',
    organo: r.organo,
    dias: r.dias,
    desviacionSobreMediana: Math.round((r.dias - percentiles.mediana) * 10) / 10,
    amount: r.amount,
    awardee: r.awardee,
    procedimiento: r.procedimiento,
  }));

  // Identificar todos los outliers estadísticos (dias >= umbralOutlier)
  const outliers: OutlierItem[] = sortedDesc
    .filter((r: any) => r.dias >= percentiles.umbralOutlier)
    .slice(0, 10)
    .map((r: any) => ({
      id: r.id,
      case_number: r.case_number || 'Sin exp.',
      object_description: r.object_description || '',
      organo: r.organo,
      dias: r.dias,
      desviacionSobreMediana: Math.round((r.dias - percentiles.mediana) * 10) / 10,
      amount: r.amount,
      awardee: r.awardee,
      procedimiento: r.procedimiento,
    }));

  // Estadísticas de baja / ahorro % sobre PBL
  const bajasRows = db.prepare(`
    SELECT round(((pbl - awarded) * 100.0 / pbl), 1) as baja_pct
    FROM (
      SELECT
        CASE
          WHEN is_lotized = 1 AND EXISTS (
            SELECT 1 FROM contract_lots lot
            WHERE lot.contract_id = contracts.id
              AND lot.budget_excl_vat IS NOT NULL
              AND ${eligibleAwardLotStatusSql('lot')}
          )
          THEN (
            SELECT round(sum(coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0)), 2)
            FROM contract_lots lot
            WHERE lot.contract_id = contracts.id
              AND lot.budget_excl_vat IS NOT NULL
              AND ${eligibleAwardLotStatusSql('lot')}
          )
          ELSE amount_excl_vat
        END as pbl,
        CASE
          WHEN is_lotized = 1 AND ${lotAwardsAmountCovered} AND EXISTS (SELECT 1 FROM lot_awards award WHERE award.contract_id = contracts.id AND award.awarded_amount IS NOT NULL AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')})
          THEN (SELECT round(sum(award.awarded_amount), 2) FROM lot_awards award WHERE award.contract_id = contracts.id AND award.awarded_amount IS NOT NULL AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')})
          WHEN is_lotized = 1 AND EXISTS (
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
        END as awarded
      FROM contracts
      WHERE NOT ${terminalContractStatusSql('contracts')}
        AND procedure NOT IN ('Contrato menor', 'Menor')
        AND (economic_nature = 'gasto' OR economic_nature IS NULL)
        AND (award_amount_type IS NULL OR award_amount_type = 'total')
        ${andAno} ${andScope}
    )
    WHERE pbl > 0
      AND awarded IS NOT NULL
      AND awarded <= pbl
    ORDER BY baja_pct ASC;
  `).all(...params) as any[];
  const bajaPercentiles = calculatePercentiles(bajasRows.map((r: any) => Number(r.baja_pct)));

  return toPlain({
    mediaDiasResolucion: percentiles.media,
    medianaDiasResolucion: percentiles.mediana,
    totalEvaluados: rows.length,
    percentiles,
    distribucion,
    porOrganismo,
    outliers: outliers.length > 0 ? outliers : masLentas,
    masRapidas,
    masLentas,
    mediaAyto,
    mediaAguas,
    mediaComsermancha,
    bajaPercentiles,
  });
}

export function evaluarRedFlags(lic: any, lotesDesglose?: any[], documentos?: any[]): RedFlag[] {
  lic = {
    ...lic,
    case_number: lic.case_number ?? lic.expediente,
    object_description: lic.object_description ?? lic.objeto,
    contract_type: lic.contract_type ?? lic.tipo_contrato,
    contract_type_code: lic.contract_type_code ?? lic.tipo_codigo,
    procedure: lic.procedure ?? lic.procedimiento,
    procedimiento: lic.procedimiento ?? lic.procedure,
    conjunto: lic.conjunto ?? lic.dataset,
    num_ofertas: lic.num_ofertas ?? lic.offer_count,
    adjudicatario: lic.adjudicatario ?? lic.awardee,
    naturaleza_economica: lic.naturaleza_economica ?? lic.economic_nature,
    status: lic.status ?? lic.estado,
    amount_excl_vat: lic.amount_excl_vat ?? lic.importe_sin_iva,
    amount_incl_vat: lic.amount_incl_vat ?? lic.importe_con_iva,
    estimated_value: lic.estimated_value ?? lic.valor_estimado,
    awarded_amount: lic.awarded_amount ?? lic.importe_adjudicacion,
    awarded_amount_incl_vat: lic.awarded_amount_incl_vat ?? lic.importe_adj_con_iva,
    award_amount_type: lic.award_amount_type ?? lic.tipo_importe_adjudicacion,
    awardee: lic.awardee ?? lic.adjudicatario,
    awardee_nif: lic.awardee_nif ?? lic.nif_adjudicatario,
    offer_count: lic.offer_count ?? lic.num_ofertas,
    economic_nature: lic.economic_nature ?? lic.naturaleza_economica,
    dataset: lic.dataset ?? lic.conjunto,
  };
  documentos = (documentos || []).map((d: any) => ({ ...d, document_type: d.document_type ?? d.tipo_documento, title: d.title ?? d.titulo }));
  lotesDesglose = (lotesDesglose || []).map((l: any) => ({
    ...l,
    lot_number: l.lot_number ?? l.numeroLote,
    lot_name: l.lot_name ?? l.nombreLote,
    numeroLote: l.numeroLote ?? l.lot_number,
    nombreLote: l.nombreLote ?? l.lot_name,
    amount_excl_vat: l.amount_excl_vat ?? l.importeSinIva ?? l.budget_excl_vat ?? l.presupuestoSinIva,
    awarded_amount: l.awarded_amount ?? l.importeAdjudicacion,
    lot_status: l.lot_status ?? l.estadoLote,
    awardee: l.awardee ?? l.adjudicatario,
    offer_count: l.offer_count ?? l.numOfertas,
    presupuestoSinIva: l.presupuestoSinIva ?? l.budget_excl_vat ?? l.amount_excl_vat ?? l.importeSinIva,
    importeAdjudicacion: l.importeAdjudicacion ?? l.awarded_amount,
    numOfertas: l.numOfertas ?? l.offer_count,
  }));
  const flags: RedFlag[] = [];

  // 0. Normalización y reglas económicas de base
  const hasMultipleLots = Array.isArray(lotesDesglose) && lotesDesglose.length > 1;
  const lotesSinAdjudicar = hasMultipleLots
    ? lotesDesglose.filter(l => !isEligibleAwardLotStatus(l.lot_status) || (!l.awarded_amount && !l.awardee))
    : [];
  const lotesAdjudicados = hasMultipleLots
    ? lotesDesglose.filter(l => isEligibleAwardLotStatus(l.lot_status) && l.awarded_amount != null)
    : [];
  // A zero-discount signal is valid only when every eligible lot has a comparable,
  // positive budget and award amount. Filtering incomplete lots first would turn
  // partial data into a false 0% discount.
  const hasCompleteZeroDiscountLotCoverage = () => {
    const eligibleLots = lotesDesglose.filter((l: any) => isEligibleAwardLotStatus(l.lot_status));
    return eligibleLots.length > 0 && eligibleLots.every((l: any) => {
      const budget = Number(l.presupuestoSinIva ?? l.budget_excl_vat ?? l.amount_excl_vat ?? l.importeSinIva) || 0;
      const awarded = Number(l.importeAdjudicacion ?? l.awarded_amount) || 0;
      return budget > 0 && awarded > 0 && Math.abs(awarded - budget) <= 0.05;
    });
  };
  const hasCompleteSingleOfferLotCoverage = () => {
    const offersByLot = new Map<string, number>();
    for (const lot of lotesDesglose.filter((item: any) => isEligibleAwardLotStatus(item.lot_status))) {
      const lotNumber = String(lot.lot_number ?? '').trim();
      const awardee = String(lot.awardee ?? '').trim();
      const awardedAmount = lot.importeAdjudicacion ?? lot.awarded_amount;
      const offerCount = lot.numOfertas ?? lot.offer_count;
      if (!lotNumber || (!awardee && awardedAmount == null)) return false;
      if (offerCount == null || String(offerCount).trim() === '') return false;
      const numericOfferCount = Number(offerCount);
      if (!Number.isInteger(numericOfferCount) || numericOfferCount !== 1) return false;
      const previousOfferCount = offersByLot.get(lotNumber);
      if (previousOfferCount != null && previousOfferCount !== numericOfferCount) return false;
      offersByLot.set(lotNumber, numericOfferCount);
    }
    return offersByLot.size > 1;
  };

  const procNorm = (lic.procedimiento || '').toLowerCase();
  const isMenor = procNorm.includes('menor') || lic.conjunto === 'menores' || lic.conjunto === 'contratos_menores';
  const tipoLower = (lic.contract_type || '').toLowerCase();
  const esPatrimonial = tipoLower.includes('patrimonial') || tipoLower.includes('privado') || String(lic.contract_type_code || '').trim() === '50';
  const esGasto = lic.economic_nature ? lic.economic_nature === 'gasto' : !esPatrimonial;
  const esImporteNoComparable = lic.award_amount_type != null && lic.award_amount_type !== 'total';
  const esImporteComparable = !esImporteNoComparable;
  const hasSpecificParentAwardee = Boolean(
    lic.awardee &&
    lic.awardee.trim() &&
    lic.awardee !== 'Sin awardee' &&
    lic.awardee !== 'Varios adjudicatarios'
  );
  const hasValidAdjudicatario = hasMultipleLots
    ? lotesAdjudicados.length > 0 &&
      (hasSpecificParentAwardee || lotesAdjudicados.every((l: any) => Boolean(l.awardee)))
    : Boolean(lic.awardee && lic.awardee.trim() && lic.awardee !== 'Sin awardee');
  const parentStatus = getContractStatus({
    estado: lic.status,
    procedimiento: lic.procedure ?? lic.procedimiento,
    fechaAdjudicacion: lic.award_date ?? lic.fecha_adjudicacion,
    fechaFormalizacion: lic.formalization_date ?? lic.fecha_formalizacion,
    importeAdjudicacion: lic.awarded_amount ?? lic.importe_adjudicacion,
  });
  const parentHasTerminalNoAward = parentStatus.flags.isTerminal;
  // La ausencia de estado en llamadas ligeras no demuestra que el contrato sea terminal;
  // se exige un valor explícito del ciclo de vida antes de suprimir señales económicas.
  const isTerminalContract = Boolean(String(lic.status ?? '').trim()) &&
    parentHasTerminalNoAward && (!hasMultipleLots || lotesAdjudicados.length === 0);
  const isLicitacionDesierta =
    isTerminalContract ||
    !hasValidAdjudicatario;

  const tieneBajaCero = (
    esImporteComparable &&
    esGasto &&
    !isMenor &&
    (
      (!hasMultipleLots &&
        Number(lic.amount_excl_vat) > 0 &&
        Number(lic.awarded_amount) > 0 &&
        Math.abs(Number(lic.awarded_amount) - Number(lic.amount_excl_vat)) <= 0.05)
      ||
      (hasMultipleLots && hasCompleteZeroDiscountLotCoverage())
    )
  );

  // 0.b. Procedimiento Negociado sin Publicidad (Art. 168 LCSP)
  const isNegociadoSinPub = procNorm.includes('negociado') && procNorm.includes('sin publicidad');
  const isEmergencia = String(lic.urgency || '').trim() === '3' || (lic.urgency || '').toString().toLowerCase().includes('emerg') || procNorm.includes('emerg');

  // La señal se aplica al ámbito de contratación sujeto a la LCSP. Los contratos
  // patrimoniales/privados quedan fuera cuando la BD los clasifica como tales.
  if (isNegociadoSinPub && !isMenor && !isEmergencia && esGasto && !esPatrimonial) {
    let docs = documentos || lic.documentos;
    if (!docs && lic.id) {
      try {
        docs = getDocumentosForContract(lic.id);
      } catch {
        docs = [];
      }
    }
    docs = docs || [];

    // a) El feed no incluye ningún documento que sea pliego o justificación del procedimiento
    const tienePliegoOJustificacion = docs.some((d: any) => {
      const tDoc = (d.document_type || '').toUpperCase();
      const tit = (d.title || '').toLowerCase();
      return (
        tDoc === 'PLIEGO' ||
        (tDoc === 'INFORME_TECNICO' && /(memoria|justific|insuficiencia)/i.test(tit)) ||
        /(pliego|pcap|ppt|prescripci|cl[aá]usul|memoria.*justific)/i.test(tit)
      );
    });
    const signalA = !tienePliegoOJustificacion;

    // b) Oferta única: exige dato explícito en todos los lotes elegibles.
    let signalB = false;
    if (hasMultipleLots) {
      const lotesElegibles = lotesDesglose.filter((l: any) => isEligibleAwardLotStatus(l.lot_status));
      const lotesConCoberturaCompleta = lotesElegibles.length > 1 && lotesElegibles.every((l: any) => {
        const awardee = String(l.awardee ?? l.adjudicatario ?? '').trim();
        const awardedAmount = l.importeAdjudicacion ?? l.awarded_amount;
        const offerCount = l.numOfertas ?? l.offer_count;
        return (awardee !== '' || awardedAmount != null) &&
          offerCount != null &&
          String(offerCount).trim() !== '' &&
          Number.isInteger(Number(offerCount)) &&
          Number(offerCount) >= 1;
      });
      signalB = lotesConCoberturaCompleta && lotesElegibles.every((l: any) => Number(l.numOfertas ?? l.offer_count) === 1);
    } else {
      signalB = lic.offer_count != null && !isNaN(Number(lic.offer_count)) && Number(lic.offer_count) === 1;
    }

    // c) 0 % de baja sobre el presupuesto en los lotes adjudicados
    let signalC = false;
    if (hasMultipleLots) {
      // Los importes de cada lote se comparan con su propio presupuesto; el
      // tipo del importe agregado del expediente no invalida esa evidencia.
      signalC = hasCompleteZeroDiscountLotCoverage();
    } else if (!esImporteComparable) {
      signalC = false;
    } else {
      signalC = (Number(lic.amount_excl_vat) || 0) > 0 && (Number(lic.awarded_amount) || 0) > 0 && Math.abs((Number(lic.amount_excl_vat) || 0) - (Number(lic.awarded_amount) || 0)) <= 0.05;
    }

    // d) El mismo awardee acumula otros contratos del mismo ámbito con el mismo órgano
    let signalD = false;
    if (lic.acumulaOtrosContratosMismoOrgano === true) {
      signalD = true;
    } else {
      try {
        const authorityId = lic.contracting_authority_id;
        if (authorityId && lic.id) {
          const db = getDb();
          const cifsToCheck: string[] = [];
          const namesToCheck: string[] = [];
          if (hasMultipleLots) {
            for (const l of lotesAdjudicados) {
              if (l.nifAdjudicatario) cifsToCheck.push(l.nifAdjudicatario);
              if (l.awardee) namesToCheck.push(l.awardee);
            }
          } else {
            if (lic.awardee_nif) cifsToCheck.push(lic.awardee_nif);
            if (lic.awardee) namesToCheck.push(lic.awardee);
          }
          if (cifsToCheck.length > 0 || namesToCheck.length > 0) {
            const conds: string[] = [];
            const params: any[] = [authorityId, lic.id];
            if (cifsToCheck.length > 0) {
              conds.push(`awardee_nif IN (${cifsToCheck.map(() => '?').join(',')})`);
              params.push(...cifsToCheck);
            }
            if (namesToCheck.length > 0) {
              conds.push(`awardee IN (${namesToCheck.map(() => '?').join(',')})`);
              params.push(...namesToCheck);
            }
            const row = db.prepare(`
              SELECT 1 FROM contracts
              WHERE contracting_authority_id = ?
                AND id != ?
                AND (${conds.join(' OR ')})
              LIMIT 1;
            `).get(...params);
            signalD = !!row;
          }
        }
      } catch {
        // Fallback for mock unit tests without DB
      }
    }

    const senalesVerificables: string[] = [];
    if (signalA) senalesVerificables.push('No constan en los datos publicados pliegos ni memoria de justificación del procedure.');
    if (signalB) senalesVerificables.push(hasMultipleLots ? 'Concurrencia de una única oferta confirmada por dato explícito en los lotes adjudicados.' : 'Concurrencia de una única oferta confirmada por dato explícito en el registro.');
    if (signalC) senalesVerificables.push(hasMultipleLots ? '0 % de baja sobre el presupuesto en los lotes adjudicados.' : '0 % de baja sobre el presupuesto de licitación.');
    if (signalD) senalesVerificables.push('El awardee acumula otros contratos registrados con el mismo órgano.');

    const numSenales = senalesVerificables.length;
    // Umbral metodológico: level base 'aviso'. Se eleva a 'alerta' si concurren 2 o más señales verificables por dato.
    const level: 'aviso' | 'alerta' = numSenales >= 2 ? 'alerta' : 'aviso';

    const hecho = 'Según PLACSP, el contrato se tramitó como negociado sin publicidad, sin anuncio previo de licitación.';
    const norma = 'El [art. 168 LCSP](https://www.boe.es/buscar/act.php?id=BOE-A-2017-12902#a168) limita este procedimiento a supuestos tasados y el [art. 170.2 LCSP](https://www.boe.es/buscar/act.php?id=BOE-A-2017-12902#a170) prevé, como regla general, invitar al menos a tres empresarios.';
    const queComprobar = 'Consultar en el expediente el supuesto invocado y las invitaciones enviadas.';
    const explicacionAlternativa = 'En publicidad en medios concretos puede invocarse exclusividad (solo el titular del medio puede insertar en él), siempre que el expediente lo acredite.';
    const cierre = 'Esta señal no implica por sí misma irregularidad.';

    const descParts = [
      `Hecho: ${hecho}`,
      `Norma: ${norma}`,
      `Qué comprobar: ${queComprobar}`,
      `Explicación alternativa: ${explicacionAlternativa}`,
      `Aviso de neutralidad: ${cierre}`,
    ];
    if (senalesVerificables.length > 0) {
      descParts.push(`Señales verificables detectadas (${numSenales}): ${senalesVerificables.join(' ')}`);
    }

    flags.push({
      tipo: 'negociado_sin_publicidad',
      title: level === 'alerta'
        ? 'Procedimiento Negociado sin Publicidad — Señal de Verificación Reforzada (Art. 168 LCSP)'
        : 'Procedimiento Negociado sin Publicidad (Art. 168 LCSP)',
      description: descParts.join(' '),
      level,
      hecho,
      norma,
      queComprobar,
      cierre,
      explicacionAlternativa,
      senalesVerificables,
    });
  }

  // 1. Licitador único en contratos competitivos (solo si no es multi-lote con múltiples adjudicatarios y no quedó desierta)

  if (
    (hasMultipleLots
      ? lotesAdjudicados.length <= 1 && hasCompleteSingleOfferLotCoverage()
      : lic.offer_count === 1) &&
    hasValidAdjudicatario &&
    !isLicitacionDesierta &&
    lic.procedimiento !== 'Contrato menor' &&
    lic.procedimiento !== 'Menor' &&
    lic.conjunto !== 'menores' &&
    lic.conjunto !== 'contratos_menores'
  ) {
    flags.push({
      tipo: 'oferta_unica',
      title: 'Oferta Única en Procedimiento Competitivo',
      description: 'El contrato se adjudicó con un único licitador presentado en un procedure pensado para la concurrencia pública (menores excluidos).',
      level: 'aviso',
    });
  }

  // 2. Al Máximo Presupuestado (0% de ahorro / baja cero en contratos mayores adjudicados)
  if (
    tieneBajaCero &&
    hasValidAdjudicatario &&
    !isLicitacionDesierta &&
    (!hasMultipleLots || lotesAdjudicados.every((l: any) => Boolean(l.awardee)))
  ) {
    flags.push({
      tipo: 'baja_cero',
      title: 'Al Máximo Presupuestado (0% Rebaja)',
      description: 'El awardee ganó por el 100% del presupuesto de licitación, sin rebaja económica alguna respecto al precio máximo fijado por la administración en el pliego.',
      level: 'alerta',
    });
  }

  // 3. Contrato menor rozando el límite legal
  if (lic.conjunto === 'menores' || lic.conjunto === 'contratos_menores' || lic.procedimiento === 'Contrato menor' || lic.procedimiento === 'Menor') {
    const isObra = (lic.contract_type || '').toLowerCase().includes('obra');
    const umbral = isObra ? 40000 : 15000;
    // El art. 118 LCSP fija el umbral atendiendo al valor estimado del contrato (VEC),
    // no al precio adjudicado ni al PBL. Si el VEC no está disponible, no podemos
    // afirmar que el expediente se encuentra próximo al umbral legal.
    const vec = Number(lic.estimated_value ?? lic.valor_estimado);
    if (Number.isFinite(vec) && vec >= umbral * 0.90 && vec < umbral) {
      const diff = Math.round((umbral - vec) * 100) / 100;
      flags.push({
        tipo: 'alerta_menor',
        title: 'Contrato Menor Rozando Umbral Legal',
        description: `VEC de ${formatCurrency(vec)}, situándose a solo ${formatCurrency(diff)} del límite legal del art. 118 LCSP (${formatCurrency(umbral)}).`,
        level: 'alerta',
      });
    }
  }

  // 4. Financiación Europea (fondos NextGen / FEDER)
  const finUe = (lic.eu_funding || '').toString().trim().toUpperCase();
  if (finUe && finUe !== '0' && finUe !== 'NO' && finUe !== 'FALSE' && finUe !== 'NO-EU') {
    flags.push({
      tipo: 'fondos_ue',
      title: 'Cofinanciado con Fondos de la Unión Europea',
      description: 'Expediente sujeto a fiscalización reforzada por normativa comunitaria antifraude y control de conflicto de intereses.',
      level: 'info',
    });
  }

  // Información de contexto para lotes desiertos
  if (lotesSinAdjudicar.length > 0) {
    const pblSinAdjudicar = lotesSinAdjudicar.reduce((acc, l) => acc + (l.presupuestoSinIva || l.importeSinIva || 0), 0);
    flags.push({
      tipo: 'lotes_desiertos',
      title: `${lotesSinAdjudicar.length} Lote${lotesSinAdjudicar.length > 1 ? 's' : ''} sin adjudicar (${formatCurrency(pblSinAdjudicar)})`,
      description: `De los ${lotesDesglose!.length} lotes de la licitación, ${lotesSinAdjudicar.length} no tienen una adjudicación válida (por ejemplo, desiertos, anulados o cancelados). La baja económica global se calcula sobre el presupuesto de los lotes efectivamente adjudicados.`,
      level: 'info',
    });
  }

  // 5. Baja Elevada respecto al PBL — Señal Estadística de Revisión (Art. 149 LCSP)
  // En contratos multi-lote, el importe comparable debe representar los lotes adjudicados,
  // incluso cuando todos los lotes hayan sido adjudicados. El encabezado puede conservar
  // valores agregados distintos o pertenecer a un adjudicatario concreto.
  let pblEvaluacion = Number(lic.amount_excl_vat);
  let adjEvaluacion = Number(lic.awarded_amount);

  if (hasMultipleLots) {
    const pblAdjLots = lotesAdjudicados.reduce(
      (acc, l) => acc + (Number(l.presupuestoSinIva || l.importeSinIva) || 0),
      0
    );
    const adjLots = lotesAdjudicados.reduce(
      (acc, l) => acc + (Number(l.importeAdjudicacion) || 0),
      0
    );
    // When no eligible lot has an award, parent totals may still contain residual
    // amounts from cancelled/annulled lots and must not be used for risk signals.
    pblEvaluacion = pblAdjLots;
    adjEvaluacion = adjLots;
  }

  if (
    !isTerminalContract &&
    esGasto &&
    esImporteComparable &&
    pblEvaluacion > 0 &&
    adjEvaluacion > 0 &&
    adjEvaluacion < pblEvaluacion &&
    lic.procedimiento !== 'Contrato menor' &&
    lic.procedimiento !== 'Menor' &&
    lic.conjunto !== 'menores' &&
    lic.conjunto !== 'contratos_menores'
  ) {
    const pbl = pblEvaluacion;
    const adj = adjEvaluacion;
    const bajaPct = Math.round(((pbl - adj) / pbl) * 1000) / 10;
    const numOfertas = lic.offer_count != null ? Number(lic.offer_count) : null;
    const esUnico = hasMultipleLots
      ? lotesAdjudicados.length <= 1 && hasCompleteSingleOfferLotCoverage()
      : numOfertas === 1;

    // Detectar posible registro de tarifa o precio unitario en PLACSP
    const objLower = (lic.object_description || '').toLowerCase();
    const esPrecioUnitario =
      bajaPct >= 90 &&
      adj <= 100 &&
      pbl >= 1000 &&
      (objLower.includes('combustible') ||
        objLower.includes('reparación') ||
        objLower.includes('mantenimiento') ||
        objLower.includes('hora') ||
        objLower.includes('taller') ||
        objLower.includes('canon'));

    if (esPrecioUnitario) {
      flags.push({
        tipo: 'baja_temeraria',
        title: `Tarifa / Precio Unitario en PLACSP (-${bajaPct}%)`,
        description: `El amount de adjudicación (${formatCurrency(adj)}) refleja presumiblemente una tarifa unitaria, precio por litro/hora o canon periódico en PLACSP, y no el gasto total del contrato frente al PBL (${formatCurrency(pbl)}). No constituye una baja temeraria del ${bajaPct}%.`,
        level: 'info',
      });
    } else if (bajaPct >= 40) {
      const contextoConcurrencia = esUnico
        ? 'Al concurrir 1 único licitador (N=1), se evalúa conforme a pliegos o subsidiariamente el umbral del 25% del art. 85 RGLCAP sobre el PBL (sin cálculo de media).'
        : 'Al no publicar PLACSP los importes de ofertas descartadas, se evalúa como señal analítica sobre PBL y no sobre la media de ofertas (Art. 149 LCSP).';

      flags.push({
        tipo: 'baja_temeraria_extrema',
        title: `Baja Extrema respecto al PBL (-${bajaPct}%) — Señal Estadística`,
        description: `Adjudicado con una rebaja del ${bajaPct}% sobre el Presupuesto Base de Licitación (PBL). Indicador estadístico que constituye señal preventiva de revisión; corresponde verificar si el órgano aplicó el procedure contradictorio de justificación de viabilidad económica conforme al art. 149 LCSP. ${contextoConcurrencia}`,
        level: 'alerta',
      });
    } else if (bajaPct >= 25) {
      const contextoConcurrencia = esUnico
        ? 'Concurrencia de 1 único licitador (N=1): supera el 25% subsidiario del art. 85 RGLCAP sobre el PBL.'
        : 'Señal analítica de revisión frente al presupuesto base del pliego (Art. 149 LCSP).';

      flags.push({
        tipo: 'baja_temeraria',
        title: `Baja Elevada respecto al PBL (-${bajaPct}%) — Señal Estadística`,
        description: `Adjudicado con un descuento del ${bajaPct}% respecto al presupuesto base del pliego (señal estadística para verificar los criterios de anormalidad fijados en el pliego). ${contextoConcurrencia}`,
        level: 'aviso',
      });
    }
  }

  // 5.b. Bajas Temerarias o Anómalas a level de Lote Individual
  if (hasMultipleLots) {
    for (const lote of lotesAdjudicados) {
      const lPbl = Number(lote.presupuestoSinIva || 0);
      const lAdj = Number(lote.importeAdjudicacion || 0);
      if (esGasto && lPbl > 0 && lAdj > 0 && lAdj < lPbl) {
        const lBajaPct = Math.round(((lPbl - lAdj) / lPbl) * 1000) / 10;
        if (lBajaPct >= 40) {
          flags.push({
            tipo: 'baja_temeraria_lote',
            title: `Lote ${lote.numeroLote}: Baja Extrema (-${lBajaPct}%) — ${lote.awardee || 'Adjudicatario'}`,
            description: `El lote ${lote.numeroLote} se adjudicó por ${formatCurrency(lAdj)} frente a un presupuesto base de ${formatCurrency(lPbl)} (-${lBajaPct}%). Señal preventiva de revisión de viabilidad económica (Art. 149 LCSP).`,
            level: 'alerta',
          });
        } else if (lBajaPct >= 25) {
          flags.push({
            tipo: 'baja_temeraria_lote',
            title: `Lote ${lote.numeroLote}: Baja Elevada (-${lBajaPct}%) — ${lote.awardee || 'Adjudicatario'}`,
            description: `El lote ${lote.numeroLote} se adjudicó por ${formatCurrency(lAdj)} frente a un presupuesto base de ${formatCurrency(lPbl)} (-${lBajaPct}%).`,
            level: 'aviso',
          });
        }
      }

      // Concurrencia limitada por lote individual en procedimientos competitivos
      if (
        lote.numOfertas === 1 &&
        lic.procedimiento !== 'Contrato menor' &&
        lic.procedimiento !== 'Menor' &&
        lic.conjunto !== 'menores' &&
        lic.conjunto !== 'contratos_menores'
      ) {
        flags.push({
          tipo: 'oferta_unica_lote',
          title: `Lote ${lote.numeroLote}: Oferta Única en Concurso — ${lote.awardee || 'Adjudicatario'}`,
          description: `El lote ${lote.numeroLote} se adjudicó con una única oferta admitida registrada en la plataforma de contratación.`,
          level: 'aviso',
        });
      }
    }
  }

  // 6. Sobrecoste sobre Presupuesto de Licitación (Desviación Económica)
  if (
    !isTerminalContract &&
    esGasto &&
    esImporteComparable &&
    pblEvaluacion > 0 &&
    adjEvaluacion > pblEvaluacion
  ) {
    const sobrecoste = Math.round((adjEvaluacion - pblEvaluacion) * 100) / 100;
    const sobrecostePct = Math.round((sobrecoste / pblEvaluacion) * 1000) / 10;
    flags.push({
      tipo: 'sobrecoste_licitacion',
      title: `Sobrecoste en Adjudicación (+${sobrecostePct}%)`,
      description: `Adjudicado por ${formatCurrency(adjEvaluacion)}, superando el Presupuesto Base de Licitación en +${formatCurrency(sobrecoste)} (+${sobrecostePct}%). Exige justificación reglamentaria y crédito adicional.`,
      level: sobrecostePct > 20 ? 'alerta' : 'aviso',
    });
  }

  // 7. Modificado o Revisión Técnica de Proyecto
  const objLower = (lic.object_description || '').toLowerCase();
  if (
    (((objLower.includes('proyecto modificad') ||
      objLower.includes('modificación de la memoria') ||
      objLower.includes('actualización (a circunstancias')) && !/\bobra(s)?\b/.test((lic.contract_type || '').toLowerCase())) ||
    objLower.includes('modifications del plan'))
  ) {
    flags.push({
      tipo: 'modificado_proyecto',
      title: 'Modificado / Revisión Técnica de Proyecto',
      description: 'Expediente vinculado a modifications de proyectos de obra o planeamiento por imprevistos técnicos o renuncias previas (Art. 204 y 205 LCSP).',
      level: 'aviso',
    });
  }

  return flags.map((flag) => ({
    ...flag,
    nivel: flag.nivel ?? flag.level,
    titulo: flag.titulo ?? flag.title,
    descripcion: flag.descripcion ?? flag.description,
  }));
}

export function getRedFlagsStats(year?: number | string, scope?: string): RedFlagsStats {
  const db = getDb();
  const anoNum = Number(year);
  const filterByAno = !isNaN(anoNum) && anoNum > 0;
  const filterScope = parseScope(scope);

  // Evaluate the same red-flag rules used by the contract detail instead of
  // maintaining a second, subtly different SQL implementation here. This
  // keeps aggregate counters and the "top expedientes" list semantically
  // aligned with the flags users can actually inspect.
  const where: string[] = [];
  const params: any[] = [];
  if (filterByAno) {
    where.push('year = ?');
    params.push(anoNum);
  }
  if (filterScope) {
    where.push('scope = ?');
    params.push(filterScope);
  }

  const contracts = db.prepare(`
    SELECT *
    FROM contracts
    ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
  `).all(...params) as any[];

  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());
  const lotAwardsAmountStmt = hasLotAwardsTable ? db.prepare(`
    SELECT
      round(sum(award.awarded_amount), 2) as amount,
      CASE WHEN NOT EXISTS (
        SELECT 1
        FROM contract_lots lot
        WHERE lot.contract_id = ?
          AND lot.awarded_amount IS NOT NULL
          AND ${eligibleAwardLotStatusSql('lot')}
          AND NOT EXISTS (
            SELECT 1
            FROM lot_awards award
            WHERE award.contract_id = lot.contract_id
              AND award.lot_number = lot.lot_number
              AND award.awarded_amount IS NOT NULL
              AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          )
      ) THEN 1 ELSE 0 END as covered
    FROM lot_awards award
    WHERE award.contract_id = ?
      AND award.awarded_amount IS NOT NULL
      AND ${eligibleAwardResultStateSql('award')}
      AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
  `) : null;
  const lotOfferCountSource = hasLotAwardsTable
    ? `coalesce(
        offer_count,
        (
          SELECT max(award.offer_count)
          FROM lot_awards award
          WHERE award.contract_id = contract_lots.contract_id
            AND award.lot_number = contract_lots.lot_number
            AND award.offer_count IS NOT NULL
            AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
        )
      )`
    : 'offer_count';
  const lotAwardedAmountSource = hasLotAwardsTable
    ? `CASE
        WHEN (
          NOT EXISTS (
            SELECT 1
            FROM contract_lots lot
            WHERE lot.contract_id = contract_lots.contract_id
              AND lot.awarded_amount IS NOT NULL
              AND ${eligibleAwardLotStatusSql('lot')}
              AND NOT EXISTS (
                SELECT 1
                FROM lot_awards award
                WHERE award.contract_id = lot.contract_id
                  AND award.lot_number = lot.lot_number
                  AND award.awarded_amount IS NOT NULL
                  AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
              )
          )
          AND EXISTS (
            SELECT 1
            FROM lot_awards award
            WHERE award.contract_id = contract_lots.contract_id
              AND award.lot_number = contract_lots.lot_number
              AND award.awarded_amount IS NOT NULL
              AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          )
        )
        THEN (
          SELECT round(sum(award.awarded_amount), 2)
          FROM lot_awards award
          WHERE award.contract_id = contract_lots.contract_id
            AND award.lot_number = contract_lots.lot_number
            AND award.awarded_amount IS NOT NULL
            AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
        )
        ELSE CASE WHEN ${eligibleLegacyLotAwardAmountSql('contract_lots', hasLotAwardsTable)} THEN awarded_amount ELSE NULL END
      END`
    : 'awarded_amount';

  const lotsStmt = db.prepare(`
    SELECT
      lot_number AS numeroLote,
      lot_name AS nombreLote,
      budget_excl_vat AS presupuestoSinIva,
      ${lotAwardedAmountSource} AS importeAdjudicacion,
      lot_status AS estadoLote,
      awardee AS adjudicatario,
      awardee_nif AS nifAdjudicatario,
      ${lotOfferCountSource} AS numOfertas,
      lot_number,
      lot_name,
      budget_excl_vat,
      awarded_amount,
      lot_status,
      awardee,
      awardee_nif,
      offer_count
    FROM contract_lots
    WHERE contract_id = ?
    ORDER BY lot_number;
  `);

  const totals = {
    oferta_unica: { count: 0, volume: 0 },
    baja_cero: { count: 0, volume: 0 },
    alerta_menor: { count: 0, volume: 0 },
    fondos_ue: { count: 0, volume: 0 },
  };

  const topExpedientesConAlertas: RedFlagsStats['topExpedientesConAlertas'] = [];

  for (const lic of contracts) {
    const lotes = lotsStmt.all(lic.id) as any[];
    const flags = evaluarRedFlags(lic, lotes.length > 1 ? lotes : undefined);

    if (flags.length === 0) continue;

    const amount = (() => {
      if (lic.award_amount_type !== null && lic.award_amount_type !== undefined && lic.award_amount_type !== 'total') {
        return 0;
      }

      const lotAwardsRow = lotAwardsAmountStmt?.get(lic.id, lic.id) as {
        amount?: number | null;
        covered?: number | null;
      } | undefined;
      const lotAwardsCovered = Number(lotAwardsRow?.covered || 0) === 1;
      const lotAwardsAmount = Number(lotAwardsRow?.amount || 0);
      if (lotAwardsCovered && lotAwardsAmount > 0) return lotAwardsAmount;

      const lotAwards = lotes
        .filter((lot) =>
          lot.awarded_amount != null &&
          isEligibleAwardLotStatus(lot.lot_status)
        )
        .reduce((sum, lot) => sum + Number(lot.awarded_amount || 0), 0);

      return lotAwards > 0 ? Math.round(lotAwards * 100) / 100 : Number(lic.awarded_amount || 0);
    })();

    const flagTypes = new Set(flags.map((flag) => flag.tipo));

    for (const type of ['oferta_unica', 'baja_cero', 'alerta_menor', 'fondos_ue'] as const) {
      if (flagTypes.has(type) || (type === 'oferta_unica' && flagTypes.has('oferta_unica_lote'))) {
        totals[type].count += 1;
        totals[type].volume += amount;
      }
    }

    topExpedientesConAlertas.push({
      id: lic.id,
      case_number: lic.case_number || 'Sin exp.',
      object_description: lic.object_description,
      contracting_authority_name: lic.contracting_authority_name,
      amount,
      awardee: lic.awardee || 'Sin adjudicar',
      alerts: flags.map((flag) => flag.title),
    });
  }

  topExpedientesConAlertas.sort((a, b) => b.amount - a.amount);

  return toPlain({
    totalOfertaUnica: totals.oferta_unica.count,
    volumenOfertaUnica: Math.round(totals.oferta_unica.volume * 100) / 100,
    totalBajaCero: totals.baja_cero.count,
    volumenBajaCero: Math.round(totals.baja_cero.volume * 100) / 100,
    totalAlertaMenor: totals.alerta_menor.count,
    volumenAlertaMenor: Math.round(totals.alerta_menor.volume * 100) / 100,
    totalFondosUe: totals.fondos_ue.count,
    volumenFondosUe: Math.round(totals.fondos_ue.volume * 100) / 100,
    topExpedientesConAlertas: topExpedientesConAlertas
      .slice(0, 10),
  });
}
export function getConcentracionStats(year?: number | string, scope?: string): ConcentracionStats {
  const db = getDb();
  ensureCorporateResolutionTable(db);

  const anoNum = Number(year);
  const filterByAno = !isNaN(anoNum) && anoNum > 0;
  const filterScope = parseScope(scope);
  const corporateContractSource = getCorporateContractSource(db);

  const conditions = ["awardee IS NOT NULL AND awardee != ''"];
  const params: any[] = [];
  if (filterByAno) {
    conditions.push('year = ?');
    params.push(anoNum);
  }
  if (filterScope) {
    conditions.push('scope = ?');
    params.push(filterScope);
  }
  const whereMarket = `WHERE ${conditions.join(' AND ')}`;

  // Los expedientes multiganador almacenan el importe total en el padre,
  // pero la atribución empresarial real vive en contract_lots. Para HHI/CR1/CR5
  // el padre "Varios adjudicatarios" no es una empresa y no debe entrar como tal.
  // Los contratos normales siguen procediendo de contracts.
  const marketSourceCte = `
    WITH market_source AS (
      SELECT
        l.id as contract_id,
        coalesce(nullif(trim(l.contracting_authority_id), ''), 'unlinked-contract:' || l.id) as authority_key,
        l.contract_type,
        l.contracting_authority_name,
        l.year,
        l.scope,
        l.awardee,
        l.awardee_nif,
        l.awarded_amount
      FROM ${corporateContractSource} l
      WHERE l.awardee IS NOT NULL
        AND trim(l.awardee) != ''
        AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total')
    )
  `;

  // 1. Concentración Global
  const globalRows = db.prepare(`
    ${marketSourceCte}
    SELECT
      coalesce(r.canonical_id, nullif(m.awardee_nif, ''), m.awardee) as id,
      coalesce(r.canonical_name, max(m.awardee)) as nombre,
      round(sum(coalesce(m.awarded_amount, 0)), 2) as volumen
    FROM market_source m
    LEFT JOIN company_resolution r
      ON coalesce(m.awardee_nif, '') = r.raw_nif
     AND coalesce(m.awardee, '') = r.raw_name
    ${whereMarket.replace(/\\bl\./g, 'm.')}
    GROUP BY coalesce(r.canonical_id, nullif(m.awardee_nif, ''), m.awardee)
    ORDER BY volumen DESC;
  `).all(...params) as any[];

  let globalTotalVol = 0;
  for (const r of globalRows) {
    globalTotalVol += Number(r.volumen) || 0;
  }

  let globalHHI = 0;
  let top5Vol = 0;
  let cr1 = 0;
  const top5Empresas: { nombre: string; volumen: number; sharePct: number }[] = [];

  if (globalTotalVol > 0) {
    for (let i = 0; i < globalRows.length; i++) {
      const vol = Number(globalRows[i].volumen) || 0;
      const sharePct = (vol / globalTotalVol) * 100;
      globalHHI += sharePct * sharePct;
      if (i === 0) cr1 = Math.round(sharePct * 10) / 10;
      if (i < 5) {
        top5Vol += vol;
        top5Empresas.push({
          nombre: globalRows[i].nombre,
          volumen: vol,
          sharePct: Math.round(sharePct * 10) / 10,
        });
      }
    }
  }

  const globalCr5 = globalTotalVol > 0 ? Math.round((top5Vol / globalTotalVol) * 1000) / 10 : 0;
  const roundedGlobalHHI = Math.round(globalHHI);

  // 2. Por Tipo de Contrato
  const porTipoRows = db.prepare(`
    ${marketSourceCte}
    , market AS (
      SELECT
        coalesce(m.contract_type, 'Otros') as tipo,
        coalesce(r.canonical_id, nullif(m.awardee_nif, ''), m.awardee) as id,
        coalesce(r.canonical_name, max(m.awardee)) as nombre,
        sum(coalesce(m.awarded_amount, 0)) as volumen
      FROM market_source m
      LEFT JOIN company_resolution r
        ON coalesce(m.awardee_nif, '') = r.raw_nif
       AND coalesce(m.awardee, '') = r.raw_name
      ${whereMarket.replace(/\\bl\./g, 'm.')}
      GROUP BY coalesce(m.contract_type, 'Otros'),
               coalesce(r.canonical_id, nullif(m.awardee_nif, ''), m.awardee)
    ),
    tipo_totals AS (
      SELECT tipo, sum(volumen) as total_vol, count(*) as num_empresas
      FROM market
      GROUP BY tipo
    ),
    shares AS (
      SELECT
        m.tipo,
        m.nombre,
        m.volumen,
        (m.volumen * 100.0 / tt.total_vol) as share_pct,
        row_number() OVER (PARTITION BY m.tipo ORDER BY m.volumen DESC) as rank
      FROM market m
      JOIN tipo_totals tt ON m.tipo = tt.tipo
    )
    SELECT
      tt.tipo as nombre,
      round(tt.total_vol, 2) as volumen,
      tt.num_empresas as numEmpresas,
      round(sum(s.share_pct * s.share_pct), 0) as hhi,
      round(sum(CASE WHEN s.rank <= 5 THEN s.share_pct ELSE 0 END), 1) as cr5,
      round(sum(CASE WHEN s.rank = 1 THEN s.share_pct ELSE 0 END), 1) as cr1,
      coalesce(max(CASE WHEN s.rank = 1 THEN s.nombre ELSE NULL END), 'Sin datos') as topEmpresa,
      round(coalesce(max(CASE WHEN s.rank = 1 THEN s.volumen ELSE 0 END), 0), 2) as topEmpresaVolumen
    FROM tipo_totals tt
    JOIN shares s ON tt.tipo = s.tipo
    WHERE tt.total_vol > 0
    GROUP BY tt.tipo
    ORDER BY tt.total_vol DESC;
  `).all(...params) as any[];

  const porTipo: ConcentracionItem[] = porTipoRows.map((r) => ({
    nombre: r.nombre,
    volumen: Number(r.volumen) || 0,
    numEmpresas: Number(r.numEmpresas) || 0,
    hhi: Number(r.hhi) || 0,
    cr5: Number(r.cr5) || 0,
    cr1: Number(r.cr1) || 0,
    topEmpresa: r.topEmpresa,
    topEmpresaVolumen: Number(r.topEmpresaVolumen) || 0,
    level: getNivelHHI(Number(r.hhi) || 0),
    nivel: getNivelHHI(Number(r.hhi) || 0),
  }));

  // 3. Por Organismo
  const porOrganismoRows = db.prepare(`
    ${marketSourceCte}
    , market AS (
      SELECT
        m.authority_key,
        m.contracting_authority_name as organo,
        coalesce(r.canonical_id, nullif(m.awardee_nif, ''), m.awardee) as id,
        coalesce(r.canonical_name, max(m.awardee)) as nombre,
        sum(coalesce(m.awarded_amount, 0)) as volumen
      FROM market_source m
      LEFT JOIN company_resolution r
        ON coalesce(m.awardee_nif, '') = r.raw_nif
       AND coalesce(m.awardee, '') = r.raw_name
      ${whereMarket.replace(/\\bl\./g, 'm.')}
      GROUP BY m.authority_key,
               coalesce(r.canonical_id, nullif(m.awardee_nif, ''), m.awardee)
    ),
    organo_totals AS (
      SELECT authority_key, max(organo) as organo, sum(volumen) as total_vol, count(*) as num_empresas
      FROM market
      GROUP BY authority_key
    ),
    shares AS (
      SELECT
        m.authority_key,
        m.organo,
        m.nombre,
        m.volumen,
        (m.volumen * 100.0 / ot.total_vol) as share_pct,
        row_number() OVER (PARTITION BY m.authority_key ORDER BY m.volumen DESC) as rank
      FROM market m
      JOIN organo_totals ot ON m.authority_key = ot.authority_key
    )
    SELECT
      ot.authority_key as authorityKey,
      ot.organo as nombre,
      round(ot.total_vol, 2) as volumen,
      ot.num_empresas as numEmpresas,
      round(sum(s.share_pct * s.share_pct), 0) as hhi,
      round(sum(CASE WHEN s.rank <= 5 THEN s.share_pct ELSE 0 END), 1) as cr5,
      round(sum(CASE WHEN s.rank = 1 THEN s.share_pct ELSE 0 END), 1) as cr1,
      coalesce(max(CASE WHEN s.rank = 1 THEN s.nombre ELSE NULL END), 'Sin datos') as topEmpresa,
      round(coalesce(max(CASE WHEN s.rank = 1 THEN s.volumen ELSE 0 END), 0), 2) as topEmpresaVolumen
    FROM organo_totals ot
    JOIN shares s ON ot.authority_key = s.authority_key
    WHERE ot.total_vol > 0
    GROUP BY ot.authority_key, ot.organo
    ORDER BY ot.total_vol DESC;
  `).all(...params) as any[];

  const porOrganismo: ConcentracionItem[] = porOrganismoRows.map((r) => ({
    authorityKey: r.authorityKey,
    nombre: r.nombre,
    volumen: Number(r.volumen) || 0,
    numEmpresas: Number(r.numEmpresas) || 0,
    hhi: Number(r.hhi) || 0,
    cr5: Number(r.cr5) || 0,
    cr1: Number(r.cr1) || 0,
    topEmpresa: r.topEmpresa,
    topEmpresaVolumen: Number(r.topEmpresaVolumen) || 0,
    level: getNivelHHI(Number(r.hhi) || 0),
    nivel: getNivelHHI(Number(r.hhi) || 0),
  }));

  // 4. Evolución Temporal (respetando filtro de ámbito)
  const evolucionParams = filterScope ? [filterScope] : [];
  const evolucionRows = db.prepare(`
    ${marketSourceCte}
    , market AS (
      SELECT
        cast(m.year as integer) as year,
        coalesce(r.canonical_id, nullif(m.awardee_nif, ''), m.awardee) as id,
        coalesce(r.canonical_name, max(m.awardee)) as nombre,
        sum(coalesce(m.awarded_amount, 0)) as volumen
      FROM market_source m
      LEFT JOIN company_resolution r
        ON coalesce(m.awardee_nif, '') = r.raw_nif
       AND coalesce(m.awardee, '') = r.raw_name
      WHERE m.awardee IS NOT NULL
        AND m.awardee != ''
        AND m.year IS NOT NULL
        AND m.year >= 2018
        ${filterScope ? 'AND m.scope = ?' : ''}
      GROUP BY m.year,
               coalesce(r.canonical_id, nullif(m.awardee_nif, ''), m.awardee)
    ),
    ano_totals AS (
      SELECT year, sum(volumen) as total_vol, count(*) as num_empresas
      FROM market
      GROUP BY year
    ),
    shares AS (
      SELECT
        m.year,
        m.nombre,
        m.volumen,
        (m.volumen * 100.0 / at.total_vol) as share_pct,
        row_number() OVER (PARTITION BY m.year ORDER BY m.volumen DESC) as rank
      FROM market m
      JOIN ano_totals at ON m.year = at.year
    )
    SELECT
      at.year as year,
      round(at.total_vol, 2) as volumen,
      at.num_empresas as numEmpresas,
      round(sum(s.share_pct * s.share_pct), 0) as hhi,
      round(sum(CASE WHEN s.rank <= 5 THEN s.share_pct ELSE 0 END), 1) as cr5,
      round(sum(CASE WHEN s.rank = 1 THEN s.share_pct ELSE 0 END), 1) as cr1,
      coalesce(max(CASE WHEN s.rank = 1 THEN s.nombre ELSE NULL END), 'Sin datos') as topEmpresa,
      round(coalesce(max(CASE WHEN s.rank = 1 THEN s.volumen ELSE 0 END), 0), 2) as topEmpresaVolumen
    FROM ano_totals at
    JOIN shares s ON at.year = s.year
    WHERE at.total_vol > 0
    GROUP BY at.year
    ORDER BY at.year ASC;
  `).all(...evolucionParams) as any[];

  const evolucion = evolucionRows.map((r) => ({
    year: Number(r.year),
    volumen: Number(r.volumen) || 0,
    numEmpresas: Number(r.numEmpresas) || 0,
    hhi: Number(r.hhi) || 0,
    cr5: Number(r.cr5) || 0,
    cr1: Number(r.cr1) || 0,
    topEmpresa: r.topEmpresa,
    topEmpresaVolumen: Number(r.topEmpresaVolumen) || 0,
    level: getNivelHHI(Number(r.hhi) || 0),
    nivel: getNivelHHI(Number(r.hhi) || 0),
  }));

  return toPlain({
    global: {
      hhi: roundedGlobalHHI,
      cr5: globalCr5,
      cr1,
      totalEmpresas: globalRows.length,
      totalVolumen: Math.round(globalTotalVol * 100) / 100,
      level: getNivelHHI(roundedGlobalHHI),
      nivel: getNivelHHI(roundedGlobalHHI),
      top5Empresas,
    },
    porTipo,
    porOrganismo,
    evolucion,
  });
}

export function getFlujoStats(year?: number | string, scope?: string): FlujoStats {
  const db = getDb();
  const anoNum = Number(year);
  const filterByAno = !isNaN(anoNum) && anoNum > 0;
  const filterScope = parseScope(scope);

  const baseWhereParts: string[] = [];
  const baseParams: any[] = [];
  if (filterByAno) {
    baseWhereParts.push('year = ?');
    baseParams.push(anoNum);
  }
  if (filterScope) {
    baseWhereParts.push('scope = ?');
    baseParams.push(filterScope);
  }
  const whereClause = baseWhereParts.length > 0 ? `WHERE ${baseWhereParts.join(' AND ')}` : '';

  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());
  const lotAwardsAmountCovered = hasLotAwardsTable
    ? lotAwardsAmountCoverageSql('c')
    : '0';
  const lotAwareAwardedAmount = hasLotAwardsTable
    ? `CASE
        WHEN ${lotAwardsAmountCovered} AND EXISTS (
          SELECT 1 FROM lot_awards award
          WHERE award.contract_id = c.id
            AND award.awarded_amount IS NOT NULL
            AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
        )
        THEN (
          SELECT round(sum(award.awarded_amount), 2)
          FROM lot_awards award
          WHERE award.contract_id = c.id
            AND award.awarded_amount IS NOT NULL
            AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
        )
        WHEN EXISTS (
          SELECT 1 FROM contract_lots lot
          WHERE lot.contract_id = c.id
            AND lot.awarded_amount IS NOT NULL
            AND ${eligibleAwardLotStatusSql('lot')}
        )
        THEN (
          SELECT round(sum(lot.awarded_amount), 2)
          FROM contract_lots lot
          WHERE lot.contract_id = c.id
            AND lot.awarded_amount IS NOT NULL
            AND ${eligibleLegacyLotAwardAmountSql('lot', hasLotAwardsTable)}
        )
        ELSE CASE WHEN ${allowParentAwardAmountFallbackSql('c', hasLotAwardsTable)} THEN coalesce(c.awarded_amount, 0) ELSE NULL END
      END`
    : `CASE
        WHEN EXISTS (
          SELECT 1 FROM contract_lots lot
          WHERE lot.contract_id = c.id
            AND lot.awarded_amount IS NOT NULL
            AND ${eligibleAwardLotStatusSql('lot')}
        )
        THEN (
          SELECT round(sum(lot.awarded_amount), 2)
          FROM contract_lots lot
          WHERE lot.contract_id = c.id
            AND lot.awarded_amount IS NOT NULL
            AND ${eligibleLegacyLotAwardAmountSql('lot', hasLotAwardsTable)}
        )
        ELSE coalesce(c.awarded_amount, 0)
      END`;
  const structuredLotAwardExists = hasLotAwardsTable
    ? `EXISTS (
        SELECT 1 FROM lot_awards award
        WHERE award.contract_id = lot.contract_id
          AND award.lot_number = lot.lot_number
          AND award.awarded_amount IS NOT NULL
          AND ${eligibleAwardResultStateSql('award')}
          AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
      )`
    : '0';
  const unawardedLotBudget = `(
    SELECT round(coalesce(sum(coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0)), 0), 2)
    FROM contract_lots lot
    WHERE lot.contract_id = c.id
      AND (
        NOT ${eligibleAwardLotStatusSql('lot')}
        OR NOT (
          (lot.awarded_amount IS NOT NULL AND ${eligibleLegacyLotAwardAmountSql('lot', hasLotAwardsTable)})
          OR ${structuredLotAwardExists}
        )
      )
  )`;
  const structuredContractLotAwardExists = hasLotAwardsTable
    ? `EXISTS (
        SELECT 1 FROM lot_awards award
        WHERE award.contract_id = c.id
          AND award.awarded_amount IS NOT NULL
          AND ${eligibleAwardResultStateSql('award')}
          AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
      )`
    : '0';
  const validLotAwardExists = `(
    EXISTS (
      SELECT 1 FROM contract_lots lot
      WHERE lot.contract_id = c.id
        AND lot.awarded_amount IS NOT NULL
        AND ${eligibleLegacyLotAwardAmountSql('lot', hasLotAwardsTable)}
    )
    OR ${structuredContractLotAwardExists}
  )`;
  const unawardedContractStatusSql = `(
    ${desertedContractStatusSql('c')}
    OR ${resolvedUnawardedContractSql('c', { hasLotAwardsTable, hasContractLotsTable: true })}
  )`;
  const awardedFlowVolumeSql = `CASE
    WHEN ${canceledContractStatusSql('c')}
      OR ${inCourseContractStatusSql('c')} THEN 0
    WHEN (c.award_amount_type IS NULL OR c.award_amount_type = 'total')
      AND (
        ${validLotAwardExists}
        OR (
          NOT ${terminalContractStatusSql('c', { hasLotAwardsTable, hasContractLotsTable: true })}
          AND c.awardee IS NOT NULL
          AND trim(c.awardee) != ''
        )
      )
    THEN ${lotAwareAwardedAmount}
    ELSE 0
  END`;
  const unawardedFlowVolumeSql = `CASE
    WHEN ${canceledContractStatusSql('c')}
      OR ${inCourseContractStatusSql('c')} THEN 0
    WHEN ${unawardedContractStatusSql}
      AND EXISTS (SELECT 1 FROM contract_lots lot WHERE lot.contract_id = c.id)
      THEN ${unawardedLotBudget}
    WHEN ${unawardedContractStatusSql} THEN coalesce(c.amount_excl_vat, 0)
    ELSE 0
  END`;
  const cancelledFlowVolumeSql = `CASE
    WHEN ${canceledContractStatusSql('c')} THEN coalesce(c.amount_excl_vat, 0)
    ELSE 0
  END`;
  const inCourseFlowVolumeSql = `CASE
    WHEN ${inCourseContractStatusSql('c')} THEN coalesce(c.amount_excl_vat, 0)
    ELSE 0
  END`;
  const flowVolumeSql = `coalesce((${awardedFlowVolumeSql}), 0) + coalesce((${unawardedFlowVolumeSql}), 0) + coalesce((${cancelledFlowVolumeSql}), 0) + coalesce((${inCourseFlowVolumeSql}), 0)`;
  // 1. Estados globales
  // Para adjudicaciones multi-lote, el volumen económico procede de los lotes
  // adjudicados cuando están disponibles; el PBL solo se conserva como magnitud
  // de referencia para expedientes sin adjudicación.
  const rawRows = db.prepare(`
    WITH flow_source AS (
      SELECT
        c.*,
        ${awardedFlowVolumeSql} as awarded_flow_volume,
        ${unawardedFlowVolumeSql} as unawarded_flow_volume,
        ${cancelledFlowVolumeSql} as cancelled_flow_volume,
        ${inCourseFlowVolumeSql} as in_course_flow_volume,
        ${flowVolumeSql} as flow_volume,
        ${flowContractStatusSql('c', { hasLotAwardsTable, hasContractLotsTable: true })} as flow_state
      FROM contracts c
      ${whereClause}
    )
    SELECT
      flow_state as flujo_estado,
      count(*) as count,
      round(coalesce(sum(awarded_flow_volume), 0), 2) as adj_vol,
      round(coalesce(sum(unawarded_flow_volume), 0), 2) as des_vol,
      round(coalesce(sum(in_course_flow_volume), 0), 2) as cur_vol,
      round(coalesce(sum(cancelled_flow_volume), 0), 2) as anu_vol,
      round(coalesce(sum(flow_volume), 0), 2) as total_vol
    FROM flow_source
    GROUP BY flow_state
  `).all(...baseParams) as any[];

  let adjCount = 0, adjVol = 0;
  let desCount = 0, desVol = 0;
  let curCount = 0, curVol = 0;
  let anuCount = 0, anuVol = 0;

  for (const r of rawRows) {
    const c = Number(r.count) || 0;
    adjVol += Number(r.adj_vol) || 0;
    desVol += Number(r.des_vol) || 0;
    curVol += Number(r.cur_vol) || 0;
    anuVol += Number(r.anu_vol) || 0;
    if (r.flujo_estado === 'adjudicada') {
      adjCount = c;
    } else if (r.flujo_estado === 'desierta') {
      desCount = c;
    } else if (r.flujo_estado === 'en_curso') {
      curCount = c;
    } else if (r.flujo_estado === 'anulada') {
      anuCount = c;
    }
  }

  const totalCount = adjCount + desCount + curCount + anuCount;
  const totalVol = adjVol + desVol + curVol + anuVol;
  const tasaDesiertasPct = (adjCount + desCount) > 0 ? Math.round((desCount / (adjCount + desCount)) * 1000) / 10 : 0;

  const kpis: FlujoKpis = {
    adjudicadas: {
      contratos: adjCount,
      volumen: Math.round(adjVol * 100) / 100,
      pctContratos: totalCount > 0 ? Math.round((adjCount / totalCount) * 1000) / 10 : 0,
      pctVolumen: totalVol > 0 ? Math.round((adjVol / totalVol) * 1000) / 10 : 0,
    },
    desiertas: {
      contratos: desCount,
      volumen: Math.round(desVol * 100) / 100,
      pctContratos: totalCount > 0 ? Math.round((desCount / totalCount) * 1000) / 10 : 0,
      pctVolumen: totalVol > 0 ? Math.round((desVol / totalVol) * 1000) / 10 : 0,
    },
    enCurso: {
      contratos: curCount,
      volumen: Math.round(curVol * 100) / 100,
      pctContratos: totalCount > 0 ? Math.round((curCount / totalCount) * 1000) / 10 : 0,
      pctVolumen: totalVol > 0 ? Math.round((curVol / totalVol) * 1000) / 10 : 0,
    },
    anuladas: {
      contratos: anuCount,
      volumen: Math.round(anuVol * 100) / 100,
      pctContratos: totalCount > 0 ? Math.round((anuCount / totalCount) * 1000) / 10 : 0,
      pctVolumen: totalVol > 0 ? Math.round((anuVol / totalVol) * 1000) / 10 : 0,
    },
    totalLicitaciones: totalCount,
    totalVolumen: Math.round(totalVol * 100) / 100,
    tasaDesiertasPct,
  };

  // Helper query for breakdowns. The economic amount of awarded contracts must
  // follow the same lot-aware source as the global KPIs; counts remain at contract level.
  const getDesglose = (dimensionCol: string, groupByAuthorityIdentity = false): FlujoDesgloseItem[] => {
    const dimensionExpression = `coalesce(nullif(${dimensionCol}, ''), 'Otros / Sin clasificar')`;
    const identityExpression = groupByAuthorityIdentity
      ? "coalesce(nullif(trim(contracting_authority_id), ''), 'unlinked-contract:' || id)"
      : dimensionExpression;
    const displayExpression = groupByAuthorityIdentity ? `max(${dimensionExpression})` : dimensionExpression;
    const rows = db.prepare(`
      WITH flow_source AS (
        SELECT
          c.*,
          ${awardedFlowVolumeSql} as awarded_flow_volume,
        ${unawardedFlowVolumeSql} as unawarded_flow_volume,
        ${cancelledFlowVolumeSql} as cancelled_flow_volume,
        ${inCourseFlowVolumeSql} as in_course_flow_volume,
        ${flowVolumeSql} as flow_volume,
        ${flowContractStatusSql('c', { hasLotAwardsTable, hasContractLotsTable: true })} as flow_state
        FROM contracts c
        ${whereClause}
      )
      SELECT
        ${displayExpression} as nombre,
        ${groupByAuthorityIdentity ? `${identityExpression} as authorityKey,` : ''}
        sum(CASE WHEN flow_state = 'adjudicada' THEN 1 ELSE 0 END) as adj_count,
        sum(awarded_flow_volume) as adj_vol,
        sum(CASE WHEN flow_state = 'desierta' THEN 1 ELSE 0 END) as des_count,
        sum(unawarded_flow_volume) as des_vol,
        sum(CASE WHEN flow_state = 'en_curso' THEN 1 ELSE 0 END) as cur_count,
        sum(in_course_flow_volume) as cur_vol,
        sum(CASE WHEN flow_state = 'anulada' THEN 1 ELSE 0 END) as anu_count,
        sum(cancelled_flow_volume) as anu_vol,
        count(*) as total_count,
        sum(flow_volume) as total_vol
      FROM flow_source
      GROUP BY ${identityExpression}
      HAVING total_count > 0
      ORDER BY total_count DESC
    `).all(...baseParams) as any[];

    return rows.map((r) => {
      const ac = Number(r.adj_count) || 0;
      const dc = Number(r.des_count) || 0;
      const t = Number(r.total_count) || 0;
      return {
        ...(groupByAuthorityIdentity ? { authorityKey: r.authorityKey } : {}),
        nombre: r.nombre,
        adjudicadas: ac,
        adjudicadasVol: Math.round((Number(r.adj_vol) || 0) * 100) / 100,
        desiertas: dc,
        desiertasVol: Math.round((Number(r.des_vol) || 0) * 100) / 100,
        enCurso: Number(r.cur_count) || 0,
        enCursoVol: Math.round((Number(r.cur_vol) || 0) * 100) / 100,
        anuladas: Number(r.anu_count) || 0,
        anuladasVol: Math.round((Number(r.anu_vol) || 0) * 100) / 100,
        total: t,
        totalVol: Math.round((Number(r.total_vol) || 0) * 100) / 100,
        tasaDesiertasPct: (ac + dc) > 0 ? Math.round((dc / (ac + dc)) * 1000) / 10 : 0,
      };
    });
  };

  const porTipo = getDesglose('contract_type');
  const porProcedimiento = getDesglose('procedure');
  const porOrganismo = getDesglose('contracting_authority_name', true);

  // Evolución anual (2018 - actualidad, respeta filtro de ámbito)
  const evoParams = filterScope ? [filterScope] : [];
  const evoRows = db.prepare(`
    WITH flow_source AS (
      SELECT
        c.*,
        ${awardedFlowVolumeSql} as awarded_flow_volume,
        ${unawardedFlowVolumeSql} as unawarded_flow_volume,
        ${cancelledFlowVolumeSql} as cancelled_flow_volume,
        ${inCourseFlowVolumeSql} as in_course_flow_volume,
        ${flowVolumeSql} as flow_volume,
        ${flowContractStatusSql('c', { hasLotAwardsTable, hasContractLotsTable: true })} as flow_state
      FROM contracts c
      WHERE c.year IS NOT NULL AND c.year >= 2018
        ${filterScope ? 'AND c.scope = ?' : ''}
    )
    SELECT
      cast(year as integer) as year,
      sum(CASE WHEN flow_state = 'adjudicada' THEN 1 ELSE 0 END) as adj_count,
      sum(CASE WHEN flow_state = 'desierta' THEN 1 ELSE 0 END) as des_count,
      sum(unawarded_flow_volume) as des_vol,
      sum(CASE WHEN flow_state = 'en_curso' THEN 1 ELSE 0 END) as cur_count,
      sum(CASE WHEN flow_state = 'anulada' THEN 1 ELSE 0 END) as anu_count,
      count(*) as total_count
    FROM flow_source
    GROUP BY year
    ORDER BY year ASC
  `).all(...evoParams) as any[];

  const evolucion = evoRows.map((r) => {
    const ac = Number(r.adj_count) || 0;
    const dc = Number(r.des_count) || 0;
    return {
      year: Number(r.year),
      adjudicadas: ac,
      desiertas: dc,
      enCurso: Number(r.cur_count) || 0,
      anuladas: Number(r.anu_count) || 0,
      total: Number(r.total_count) || 0,
      tasaDesiertasPct: (ac + dc) > 0 ? Math.round((dc / (ac + dc)) * 1000) / 10 : 0,
      volumenDesiertas: Math.round((Number(r.des_vol) || 0) * 100) / 100,
    };
  });

  // Re-adjudicaciones:
  const desiertasQuery = `
    SELECT 
      id, case_number, object_description, contract_type as tipo, procedure, contracting_authority_name as organo, 
      year, coalesce(publication_date, award_date, '') as document_date,
      coalesce(amount_excl_vat, amount_incl_vat, 0) as amount
    FROM contracts
    WHERE (${desertedContractStatusSql('contracts')} OR ${resolvedUnawardedContractSql('contracts', { hasLotAwardsTable, hasContractLotsTable: true })})
      AND procedure NOT IN ('Contrato menor', 'Menor')
      ${filterScope ? 'AND scope = ?' : ''}
  `;
  const desiertasRows = db.prepare(desiertasQuery).all(...(filterScope ? [filterScope] : [])) as any[];

  const adjudicadasQuery = `
    SELECT
      c.id, c.case_number, c.object_description, c.contract_type as tipo, c.procedure,
      c.contracting_authority_name as organo,
      c.year, coalesce(c.award_date, c.publication_date, '') as document_date,
      CASE
        WHEN c.award_amount_type IS NULL OR c.award_amount_type = 'total'
        THEN ${lotAwareAwardedAmount}
        ELSE 0
      END as amount,
      c.awardee
    FROM contracts c
    WHERE c.awardee IS NOT NULL AND c.awardee != ''
      ${filterScope ? 'AND c.scope = ?' : ''}
  `;
  const adjudicadasRows = db.prepare(adjudicadasQuery).all(...(filterScope ? [filterScope] : [])) as any[];

  let readjudicaciones = detectarReadjudicaciones(desiertasRows, adjudicadasRows);

  if (filterByAno) {
    readjudicaciones = readjudicaciones.filter(
      (p) => p.desierta.year === anoNum || p.posterior.year === anoNum
    );
  }

  return toPlain({
    kpis,
    readjudicaciones,
    porTipo,
    porProcedimiento,
    porOrganismo,
    evolucion,
  });
}

export function searchQuick(query: string): QuickSearchResult {
  const db = getDb();
  const q = (query || '').trim();
  if (!q) {
    return { contracts: [], empresas: [], organismos: [] };
  }

  const likeTerm = `%${q}%`;
  const companySearchSource = getCorporateContractSource(db);
  // Quote each token so FTS5 punctuation (for example, '/' in expediente numbers)
  // is treated as data rather than query syntax while preserving prefix matching.
  const ftsTerm = q
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(' ');

  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());
  const lotAwardsAmountCovered = hasLotAwardsTable
    ? lotAwardsAmountCoverageSql('contracts')
    : '0';
  const lotAwardsAmountCoveredForL = hasLotAwardsTable
    ? lotAwardsAmountCoverageSql('l')
    : '0';

  // 1. Licitaciones (máximo 5)
  const contracts = db.prepare(`
    SELECT id, case_number, object_description,
      CASE
        WHEN ${terminalContractStatusSql('contracts')} THEN amount_excl_vat
        WHEN award_amount_type = 'unitario' THEN awarded_amount
        WHEN award_amount_type IS NULL OR award_amount_type = 'total' THEN
          CASE
            WHEN ${lotAwardsAmountCovered} AND EXISTS (
              SELECT 1 FROM lot_awards award
              WHERE award.contract_id = contracts.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                AND award.awarded_amount IS NOT NULL
                AND ${eligibleAwardResultStateSql('award')}
            )
            THEN (
              SELECT round(sum(award.awarded_amount), 2)
              FROM lot_awards award
              WHERE award.contract_id = contracts.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                AND award.awarded_amount IS NOT NULL
                AND ${eligibleAwardResultStateSql('award')}
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
            WHEN awarded_amount IS NOT NULL THEN awarded_amount
            WHEN ${terminalContractStatusSql('contracts')}
              OR (award_date IS NULL AND (awardee IS NULL OR trim(awardee) = '') AND lower(coalesce(status, '')) NOT LIKE '%adjudic%' AND lower(coalesce(status, '')) NOT LIKE '%formaliz%' AND NOT ${resolvedContractStatusSql('contracts')})
              OR (${resolvedContractStatusSql('contracts')} AND award_date IS NULL AND (awardee IS NULL OR trim(awardee) = ''))
              THEN amount_excl_vat
            ELSE NULL
          END
        ELSE NULL
      END as amount,
      CASE
        WHEN ${terminalContractStatusSql('contracts')} THEN 'Presupuesto base'
        WHEN award_amount_type = 'unitario' THEN 'Precio unitario publicado'
        WHEN award_amount_type = 'desconocido' THEN 'Importe no comparable'
        WHEN ${lotAwardsAmountCovered} AND EXISTS (
          SELECT 1 FROM lot_awards award
          WHERE award.contract_id = contracts.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
            AND award.awarded_amount IS NOT NULL
            AND ${eligibleAwardResultStateSql('award')}
        ) THEN 'Importe adjudicado'
        WHEN EXISTS (
          SELECT 1 FROM contract_lots lot
          WHERE lot.contract_id = contracts.id
            AND lot.awarded_amount IS NOT NULL
            AND ${eligibleAwardLotStatusSql('lot')}
        ) OR awarded_amount IS NOT NULL THEN 'Importe adjudicado'
        WHEN ${terminalContractStatusSql('contracts')}
          OR (award_date IS NULL AND (awardee IS NULL OR trim(awardee) = '') AND lower(coalesce(status, '')) NOT LIKE '%adjudic%' AND lower(coalesce(status, '')) NOT LIKE '%formaliz%' AND NOT ${resolvedContractStatusSql('contracts')})
          OR (${resolvedContractStatusSql('contracts')} AND award_date IS NULL AND (awardee IS NULL OR trim(awardee) = ''))
          THEN 'Presupuesto base'
        ELSE 'Importe adjudicado no disponible'
      END as amount_label,
      contracting_authority_name as organo
    FROM contracts
    WHERE (
      id IN (SELECT id FROM contracts_fts WHERE contracts_fts MATCH ?)
      OR object_description LIKE ?
      OR case_number LIKE ?
      OR awardee LIKE ?
      OR awardee_nif LIKE ?
      OR EXISTS (
        SELECT 1
        FROM contract_lots lot
        WHERE lot.contract_id = contracts.id
          AND ${eligibleAwardLotStatusSql('lot')}
          AND ${hasLotAwardsTable ? excludeLegacyLotWhenStructuredTerminalResultSql('lot') : '1'}
          AND (lot.awardee LIKE ? OR lot.awardee_nif LIKE ?)
      )
      OR EXISTS (
        SELECT 1
        FROM lot_awards award
        WHERE award.contract_id = contracts.id
                AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          AND (award.awardee LIKE ? OR award.awardee_nif LIKE ?)
      )
    )
    ORDER BY coalesce(publication_date, award_date) DESC
    LIMIT 5;
  `).all(ftsTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm) as any[];

  // 2. Empresas (máximo 4) - Búsqueda ampliada por nombre actual, histórico, CIF o grupo
  const empresas = db.prepare(`
    SELECT 
      coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee) as id,
      coalesce(r.canonical_name, max(l.awardee)) as nombre,
      coalesce(r.canonical_nif, max(nullif(l.awardee_nif, '')), '') as nif,
      count(DISTINCT l.id) as contratos,
      round(sum(CASE WHEN l.award_amount_type IS NULL OR l.award_amount_type = 'total' THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen,
      max(r.group_name) as grupo,
      max(r.link_type) as link_type
    FROM ${companySearchSource} l
    LEFT JOIN company_resolution r 
      ON coalesce(l.awardee_nif, '') = r.raw_nif 
     AND coalesce(l.awardee, '') = r.raw_name
    WHERE (
      l.awardee LIKE ? 
      OR l.awardee_nif LIKE ? 
      OR r.canonical_name LIKE ? 
      OR r.canonical_nif LIKE ? 
      OR r.group_name LIKE ?
    )
      AND l.awardee IS NOT NULL AND l.awardee != ''
    GROUP BY coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee)
    ORDER BY volumen DESC
    LIMIT 4;
  `).all(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm) as any[];

  // 3. Organismos (máximo 3)
  const organismos = db.prepare(`
    SELECT 
      ca.id as authorityId,
      ca.placsp_id as placsp_id,
      coalesce(ca.name, l.contracting_authority_name) as name,
      coalesce(ca.name, l.contracting_authority_name) as nombre,
      count(*) as contratos,
      round(sum(
        CASE
          WHEN l.award_amount_type IS NULL OR l.award_amount_type = 'total' THEN
            CASE
              WHEN ${lotAwardsAmountCoveredForL} AND EXISTS (
                SELECT 1
                FROM lot_awards award
                WHERE award.contract_id = l.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                  AND award.awarded_amount IS NOT NULL
                  AND ${eligibleAwardResultStateSql('award')}
              )
              THEN (
                SELECT round(sum(award.awarded_amount), 2)
                FROM lot_awards award
                WHERE award.contract_id = l.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                  AND award.awarded_amount IS NOT NULL
                  AND ${eligibleAwardResultStateSql('award')}
              )
              WHEN EXISTS (
                SELECT 1
                FROM contract_lots lot
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
          ELSE 0
        END
      ), 2) as volumen
    FROM contracts l
    LEFT JOIN contracting_authorities ca ON l.contracting_authority_id = ca.id
    WHERE ca.id IS NOT NULL
      AND (l.contracting_authority_name LIKE ? OR ca.name LIKE ?)
    GROUP BY ca.id
    ORDER BY volumen DESC
    LIMIT 3;
  `).all(likeTerm, likeTerm) as any[];

  const safeEmpresas = empresas.map((e: any) => ({
    ...e,
    id: e.id ? (isPersonaFisicaNif(e.id) ? getOpaqueEmpresaId(e.id, e.nombre) : e.id) : getOpaqueEmpresaId(e.nif, e.nombre),
  }));

  return toPlain({
    contracts,
    empresas: safeEmpresas,
    organismos,
  });
}

export function getEvolucionAnualStats(scope?: string): EvolucionAnualItem[] {
  const db = getDb();
  ensureCorporateResolutionTable(db);
  const companySearchSource = getCorporateContractSource(db);
  const filterScope = parseScope(scope);

  const andScope = filterScope ? 'AND scope = ?' : '';
  const andScopeL = filterScope ? 'AND l.scope = ?' : '';
  const params = filterScope ? [filterScope] : [];

  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());
  const evolucionAwardeeCondition = `(
    (awardee IS NOT NULL AND trim(awardee) != '' AND awardee != 'Sin awardee')
    OR EXISTS (
      SELECT 1 FROM contract_lots lot
      WHERE lot.contract_id = cs.id
        AND trim(coalesce(lot.awardee, '')) != ''
        AND lot.awardee != 'Sin awardee'
        AND ${eligibleAwardLotStatusSql('lot')}
    )
    OR ${hasLotAwardsTable ? `
      EXISTS (
        SELECT 1 FROM lot_awards award
        WHERE award.contract_id = cs.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          AND trim(coalesce(award.awardee, '')) != ''
          AND award.awardee != 'Sin awardee'
          AND ${eligibleAwardResultStateSql('award')}
      )
    ` : '0'}
  )`;

  const evolucionLotAwardsAmountCoveredForVolume = hasLotAwardsTable
    ? `(NOT EXISTS (
        SELECT 1 FROM contract_lots lot
        WHERE lot.contract_id = l.id
          AND ${eligibleAwardLotStatusSql('lot')}
          AND (
            NOT EXISTS (
              SELECT 1 FROM lot_awards award
              WHERE award.contract_id = l.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                AND award.lot_number = lot.lot_number
                AND ${eligibleAwardResultStateSql('award')}
                AND award.awarded_amount IS NOT NULL
            )
            OR EXISTS (
              SELECT 1 FROM lot_awards award
              WHERE award.contract_id = l.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                AND award.lot_number = lot.lot_number
                AND ${eligibleAwardResultStateSql('award')}
                AND award.awarded_amount IS NULL
            )
          )
      ))`
    : '0';

  const lotAwareAwardedAmount = hasLotAwardsTable
    ? `CASE
        WHEN ${evolucionLotAwardsAmountCoveredForVolume} AND EXISTS (
          SELECT 1 FROM lot_awards award
          WHERE award.contract_id = l.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
            AND award.awarded_amount IS NOT NULL
            AND ${eligibleAwardResultStateSql('award')}
        )
        THEN (
          SELECT round(sum(award.awarded_amount), 2)
          FROM lot_awards award
          WHERE award.contract_id = l.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
            AND award.awarded_amount IS NOT NULL
            AND ${eligibleAwardResultStateSql('award')}
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
      END`
    : `coalesce(l.awarded_amount, 0)`;
  const evolucionLotAwardsAmountCovered = hasLotAwardsTable
    ? `(NOT EXISTS (
        SELECT 1 FROM contract_lots lot
        WHERE lot.contract_id = contracts.id
          AND lot.awarded_amount IS NOT NULL
          AND ${eligibleAwardLotStatusSql('lot')}
      ) OR NOT EXISTS (
            SELECT 1
            FROM contract_lots lot
            WHERE lot.contract_id = contracts.id
              AND lot.awarded_amount IS NOT NULL
              AND ${eligibleAwardLotStatusSql('lot')}
              AND NOT EXISTS (
                SELECT 1
                FROM lot_awards award
                WHERE award.contract_id = contracts.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                  AND award.lot_number = lot.lot_number
                  AND award.awarded_amount IS NOT NULL
                  AND ${eligibleAwardResultStateSql('award')}
              )
          ))`
    : '0';

  // 1. Años base con contratos y volumen.
  // Los conteos permanecen a nivel de expediente; el volumen adjudicado es lot-aware.
  const baseRows = db.prepare(`
    WITH evolucion_source AS (
      SELECT
        l.*,
        CASE
          WHEN NOT ${terminalContractStatusSql('l')}
            AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total')
          THEN ${lotAwareAwardedAmount}
          ELSE 0
        END AS volumen_adjudicado
      FROM contracts l
      WHERE l.year IS NOT NULL ${andScope}
    )
    SELECT
      cast(year as integer) as year,
      count(*) as contratos,
      round(sum(volumen_adjudicado), 2) as volumen
    FROM evolucion_source
    GROUP BY year
    ORDER BY year ASC;
  `).all(...params) as { year: number; contratos: number; volumen: number }[];

  if (baseRows.length === 0) return [];

  // 2. Concurrencia / Oferta única por año
  // Mantener el mismo criterio lot-aware que getConcurrenciaStats(): cuando
  // existen ofertas válidas en lotes no desiertos, prevalece su suma.
  const concurrenciaRows = db.prepare(`
    WITH concurrencia_source AS (
      SELECT
        c.*,
        CASE
          WHEN coalesce(l.lot_offer_count, 0) > 0 THEN l.lot_offer_sum
          ELSE c.offer_count
        END AS effective_offer_count
      FROM contracts c
      LEFT JOIN (
        SELECT
          lot.contract_id,
          SUM(
            CASE
              WHEN coalesce(lot.offer_count, award.offer_count) > 0
              THEN coalesce(lot.offer_count, award.offer_count)
              ELSE 0
            END
          ) AS lot_offer_sum,
          COUNT(
            CASE
              WHEN coalesce(lot.offer_count, award.offer_count) > 0 THEN 1
            END
          ) AS lot_offer_count
        FROM contract_lots lot
        ${hasLotAwardsTable ? `LEFT JOIN (\n          SELECT contract_id, lot_number, MAX(offer_count) AS offer_count\n          FROM lot_awards award\n          WHERE offer_count IS NOT NULL\n            AND ${excludeAwardWhenLegacyLotTerminalSql('award')}\n            AND ${eligibleAwardResultStateSql()}\n          GROUP BY contract_id, lot_number\n        ) award ON award.contract_id = lot.contract_id AND award.lot_number = lot.lot_number` : ''}
        WHERE ${eligibleAwardLotStatusSql('lot')}
        GROUP BY lot.contract_id
      ) l ON l.contract_id = c.id
    )
    SELECT
      cast(year as integer) as year,
      count(*) as total_evaluadas,
      sum(CASE WHEN effective_offer_count = 1 THEN 1 ELSE 0 END) as una_oferta,
      round(sum(CASE WHEN effective_offer_count = 1 THEN 1.0 ELSE 0.0 END) * 100.0 / count(*), 1) as pct_oferta_unica
    FROM concurrencia_source AS cs
    WHERE (${explicitlyAwardedContractStatusSql('cs')} OR ${resolvedContractStatusSql('cs')})
      AND NOT (${desertedContractStatusSql('cs')} OR ${canceledContractStatusSql('cs')})
      AND ${evolucionAwardeeCondition}
      AND effective_offer_count IS NOT NULL AND effective_offer_count > 0
      AND coalesce(procedure, '') NOT IN ('Contrato menor', 'Menor')
      AND coalesce(dataset, '') != 'menores'
      AND year IS NOT NULL ${andScope}
    GROUP BY year;
  `).all(...params) as any[];
  const concurrenciaMap = new Map(concurrenciaRows.map((r: any) => [r.year, r]));

  // 3. Tiempos de resolución por año
  const tiemposRows = db.prepare(`
    SELECT 
      cast(year as integer) as year,
      round(julianday(award_date) - julianday(deadline_date)) as dias
    FROM contracts
    WHERE deadline_date IS NOT NULL
      AND award_date IS NOT NULL
      AND julianday(award_date) >= julianday(deadline_date)
      AND year IS NOT NULL ${andScope}
    ORDER BY dias ASC;
  `).all(...params) as { year: number; dias: number }[];

  const tiemposPorAno = new Map<number, number[]>();
  for (const r of tiemposRows) {
    if (!tiemposPorAno.has(r.year)) tiemposPorAno.set(r.year, []);
    tiemposPorAno.get(r.year)!.push(Number(r.dias));
  }

  // 4. Baja media por año
  const bajaRows = db.prepare(`
    SELECT
      cast(year as integer) as year,
      count(*) as total_baja,
      round(avg((pbl - awarded) / pbl * 100), 1) as baja_media
    FROM (
      SELECT
        year,
        CASE
          WHEN is_lotized = 1 AND EXISTS (
            SELECT 1 FROM contract_lots lot
            WHERE lot.contract_id = contracts.id
              AND lot.budget_excl_vat IS NOT NULL
              AND ${eligibleAwardLotStatusSql('lot')}
          )
          THEN (
            SELECT round(sum(coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0)), 2)
            FROM contract_lots lot
            WHERE lot.contract_id = contracts.id
              AND lot.budget_excl_vat IS NOT NULL
              AND ${eligibleAwardLotStatusSql('lot')}
          )
          ELSE amount_excl_vat
        END as pbl,
        CASE
          WHEN is_lotized = 1 AND ${evolucionLotAwardsAmountCovered} AND EXISTS (
            SELECT 1 FROM lot_awards award
            WHERE award.contract_id = contracts.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
              AND award.awarded_amount IS NOT NULL
              AND ${eligibleAwardResultStateSql('award')}
          )
          THEN (
            SELECT round(sum(award.awarded_amount), 2)
            FROM lot_awards award
            WHERE award.contract_id = contracts.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
              AND award.awarded_amount IS NOT NULL
              AND ${eligibleAwardResultStateSql('award')}
          )
          WHEN is_lotized = 1 AND EXISTS (
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
        END as awarded
      FROM contracts
      WHERE (
          amount_excl_vat > 0
          OR (
            is_lotized = 1
            AND EXISTS (
              SELECT 1 FROM contract_lots lot
              WHERE lot.contract_id = contracts.id
                AND lot.budget_excl_vat IS NOT NULL
            )
          )
        )
        AND (
          awarded_amount > 0
          OR (
            is_lotized = 1
            AND EXISTS (
              SELECT 1 FROM lot_awards award
              WHERE award.contract_id = contracts.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                AND award.awarded_amount IS NOT NULL
                AND ${eligibleAwardResultStateSql('award')}
            )
          )
          OR (
            is_lotized = 1
            AND EXISTS (
              SELECT 1 FROM contract_lots lot
              WHERE lot.contract_id = contracts.id
                AND lot.awarded_amount IS NOT NULL
                AND ${eligibleAwardLotStatusSql('lot')}
            )
          )
        )
        AND (award_amount_type IS NULL OR award_amount_type = 'total')
        AND NOT ${terminalContractStatusSql('contracts')}
        AND year IS NOT NULL ${andScope}
    )
    WHERE pbl > 0
      AND awarded > 0
      AND awarded <= pbl
    GROUP BY year;
  `).all(...params) as any[];
  const bajaMap = new Map(bajaRows.map((r: any) => [r.year, r]));

  // 5. Proveedores distintos por año (con canonical resolution)
  const proveedoresRows = db.prepare(`
    SELECT 
      cast(l.year as integer) as year,
      count(DISTINCT coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee)) as empresas_distintas
    FROM ${companySearchSource} l
    LEFT JOIN company_resolution r 
      ON coalesce(l.awardee_nif, '') = r.raw_nif 
     AND coalesce(l.awardee, '') = r.raw_name
    WHERE (l.awardee_nif IS NOT NULL AND l.awardee_nif != '' OR l.awardee IS NOT NULL AND l.awardee != '')
      AND l.year IS NOT NULL ${andScope}
    GROUP BY l.year;
  `).all(...params) as any[];
  const proveedoresMap = new Map(proveedoresRows.map((r: any) => [r.year, r.empresas_distintas]));

  // Consolidación final
  return toPlain(baseRows.map((base) => {
    const year = base.year;
    const conc = concurrenciaMap.get(year);
    const dias = tiemposPorAno.get(year) || [];
    const pTiempos = calculatePercentiles(dias);
    const baja = bajaMap.get(year);
    const empresas = proveedoresMap.get(year) || 0;

    return {
      year,
      contratos: base.contratos,
      contracts: base.contratos,
      volumen: Number(base.volumen) || 0,
      pctOfertaUnica: conc ? Number(conc.pct_oferta_unica) : 0,
      totalEvaluadasOferta: conc ? Number(conc.total_evaluadas) : 0,
      tiempoMedioDias: pTiempos.media,
      tiempoMedianaDias: pTiempos.mediana,
      totalEvaluadosTiempos: dias.length,
      bajaMediaPct: baja ? Number(baja.baja_media) : 0,
      totalEvaluadosBaja: baja ? Number(baja.total_baja) : 0,
      empresasDistintas: Number(empresas),
    };
  }));
}

export function getRenovacionMercadoStats(year?: number | string, scope?: string): RenovacionMercadoStats {
  const db = getDb();
  ensureCorporateResolutionTable(db);
  const corporateContractSource = getCorporateContractSource(db);

  const anoNum = Number(year);
  const filterByAno = !isNaN(anoNum) && anoNum > 0;
  const filterScope = parseScope(scope);

  const andScope = filterScope ? 'AND l.scope = ?' : '';
  const params: any[] = filterScope ? [filterScope] : [];

  // 1. Serie histórica de renovación anual
  const queryEvolucion = `
    WITH empresa_contratos AS (
      SELECT
        l.id,
        max(l.case_number) as case_number,
        max(l.object_description) as object_description,
        max(l.procedure) as procedure,
        min(coalesce(l.award_date, l.publication_date)) as award_date,
        cast(max(l.year) as integer) as year,
        round(sum(CASE
          WHEN l.award_amount_type IS NULL OR l.award_amount_type = 'total'
          THEN coalesce(l.awarded_amount, 0)
          ELSE 0
        END), 2) as amount,
        coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee) as empresa_id,
        max(coalesce(r.canonical_name, l.awardee)) as empresa_nombre
      FROM ${corporateContractSource} l
      LEFT JOIN company_resolution r
        ON coalesce(l.awardee_nif, '') = r.raw_nif
       AND coalesce(l.awardee, '') = r.raw_name
      WHERE (l.awardee_nif IS NOT NULL AND l.awardee_nif != '' OR l.awardee IS NOT NULL AND l.awardee != '')
        AND l.year IS NOT NULL
        AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total')
        ${andScope}
      GROUP BY l.id, coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee)
    ),
    adjudicaciones_ordenadas AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY empresa_id
          ORDER BY award_date ASC, id ASC
        ) as orden_empresa
      FROM empresa_contratos
    )
    SELECT
      year,
      count(DISTINCT empresa_id) as total_activos,
      count(CASE WHEN orden_empresa = 1 THEN 1 END) as nuevos_entrantes,
      count(DISTINCT empresa_id) - count(CASE WHEN orden_empresa = 1 THEN 1 END) as veteranos,
      round(count(CASE WHEN orden_empresa = 1 THEN 1.0 END) * 100.0 / count(DISTINCT empresa_id), 1) as pct_renovacion,
      round(sum(amount), 2) as gasto_total,
      round(sum(CASE WHEN orden_empresa = 1 THEN amount ELSE 0 END), 2) as gasto_nuevos,
      round(sum(CASE WHEN orden_empresa > 1 THEN amount ELSE 0 END), 2) as gasto_veteranos,
      round(sum(CASE WHEN orden_empresa = 1 THEN amount ELSE 0 END) * 100.0 / nullif(sum(amount), 0), 1) as pct_gasto_nuevos,
      round(sum(CASE WHEN orden_empresa > 1 THEN amount ELSE 0 END) * 100.0 / nullif(sum(amount), 0), 1) as pct_gasto_veteranos
    FROM adjudicaciones_ordenadas
    GROUP BY year
    ORDER BY year ASC;
  `;

  const evoRows = db.prepare(queryEvolucion).all(...params) as any[];

  const evolucion: RenovacionAnualItem[] = evoRows.map((r) => {
    const pctRenov = Number(r.pct_renovacion) || 0;
    const pctGastoVet = Number(r.pct_gasto_veteranos) || 0;
    // Criterio de alerta de mercado cerrado:
    // Año > 2018 donde la tasa de rotación es < 50% y los veteranos captan > 65% del gasto
    const alerta = r.year > 2018 && (pctRenov < 50 || pctGastoVet > 75);

    return {
      year: Number(r.year),
      totalActivos: Number(r.total_activos) || 0,
      nuevosEntrantes: Number(r.nuevos_entrantes) || 0,
      veteranos: Number(r.veteranos) || 0,
      pctRenovacion: pctRenov,
      gastoTotal: Number(r.gasto_total) || 0,
      gastoNuevos: Number(r.gasto_nuevos) || 0,
      gastoVeteranos: Number(r.gasto_veteranos) || 0,
      pctGastoNuevos: Number(r.pct_gasto_nuevos) || 0,
      pctGastoVeteranos: pctGastoVet,
      alertaMercadoCerrado: alerta,
    };
  });

  // 2. Ranking de veteranas incombustibles (empresas con más ejercicios anuales activos)
  const queryVeteranas = `
    WITH empresa_anos AS (
      SELECT 
        coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee) as empresa_id,
        coalesce(r.canonical_name, l.awardee) as empresa_nombre,
        coalesce(r.raw_nif, l.awardee_nif) as cif,
        cast(l.year as integer) as year,
        count(DISTINCT l.id) as contratos,
        round(sum(CASE WHEN l.award_amount_type IS NULL OR l.award_amount_type = 'total' THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen
      FROM ${corporateContractSource} l
      LEFT JOIN company_resolution r 
        ON coalesce(l.awardee_nif, '') = r.raw_nif 
       AND coalesce(l.awardee, '') = r.raw_name
      WHERE (l.awardee_nif IS NOT NULL AND l.awardee_nif != '' OR l.awardee IS NOT NULL AND l.awardee != '')
        AND l.year IS NOT NULL
        AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total')
        ${andScope}
      GROUP BY empresa_id, year
    )
    SELECT 
      empresa_id,
      empresa_nombre as nombre,
      cif,
      count(DISTINCT year) as total_ejercicios,
      min(year) as primer_ano,
      max(year) as ultimo_ano,
      sum(contratos) as total_contratos,
      round(sum(volumen), 2) as total_volumen
    FROM empresa_anos
    GROUP BY empresa_id
    HAVING total_ejercicios >= 5
    ORDER BY total_ejercicios DESC, total_volumen DESC
    LIMIT 15;
  `;
  const veteranasRows = db.prepare(queryVeteranas).all(...params) as any[];
  const veteranas: VeteranaItem[] = veteranasRows.map((r) => ({
    empresaId: r.empresa_id ? (isPersonaFisicaNif(r.empresa_id) ? getOpaqueEmpresaId(r.empresa_id, r.nombre) : r.empresa_id) : getOpaqueEmpresaId(r.cif, r.nombre),
    nombre: r.nombre,
    cif: r.cif || undefined,
    totalEjercicios: Number(r.total_ejercicios),
    primerAno: Number(r.primer_ano),
    ultimoAno: Number(r.ultimo_ano),
    totalContratos: Number(r.total_contratos),
    totalVolumen: Number(r.total_volumen),
  }));

  // 3. Nuevos entrantes (primer contrato histórico)
  const targetAno = filterByAno ? anoNum : (evolucion.length > 0 ? evolucion[evolucion.length - 1].year : 2025);
  const queryDebutantes = `
    WITH empresa_contratos AS (
      SELECT
        l.id,
        max(l.case_number) as case_number,
        max(l.object_description) as object_description,
        max(l.procedure) as procedure,
        min(coalesce(l.award_date, l.publication_date)) as award_date,
        cast(max(l.year) as integer) as year,
        round(sum(CASE
          WHEN l.award_amount_type IS NULL OR l.award_amount_type = 'total'
          THEN coalesce(l.awarded_amount, 0)
          ELSE 0
        END), 2) as amount,
        coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee) as empresa_id,
        max(coalesce(r.canonical_name, l.awardee)) as empresa_nombre,
        max(coalesce(r.raw_nif, l.awardee_nif)) as cif
      FROM ${corporateContractSource} l
      LEFT JOIN company_resolution r
        ON coalesce(l.awardee_nif, '') = r.raw_nif
       AND coalesce(l.awardee, '') = r.raw_name
      WHERE (l.awardee_nif IS NOT NULL AND l.awardee_nif != '' OR l.awardee IS NOT NULL AND l.awardee != '')
        AND l.year IS NOT NULL
        AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total')
        ${andScope}
      GROUP BY l.id, coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee)
    ),
    adjudicaciones_ordenadas AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY empresa_id
          ORDER BY award_date ASC, id ASC
        ) as orden_empresa
      FROM empresa_contratos
    )
    SELECT
      empresa_id,
      empresa_nombre,
      cif,
      year,
      id as contract_id,
      case_number,
      object_description,
      amount,
      procedure,
      award_date
    FROM adjudicaciones_ordenadas
    WHERE orden_empresa = 1 AND year = ?
    ORDER BY amount DESC
    LIMIT 20;
  `;
  const debutantesParams = filterScope ? [filterScope, targetAno] : [targetAno];
  const debutantesRows = db.prepare(queryDebutantes).all(...debutantesParams) as any[];
  const nuevosEntrantes: NuevoEntranteItem[] = debutantesRows.map((r) => ({
    empresaId: r.empresa_id,
    empresaNombre: r.empresa_nombre,
    cif: r.cif || undefined,
    year: Number(r.year),
    licitacionId: r.contract_id,
    case_number: r.case_number,
    expediente: r.case_number,
    object_description: r.object_description,
    objeto: r.object_description,
    amount: Number(r.amount) || 0,
    importe: Number(r.amount) || 0,
    procedure: r.procedure,
    procedimiento: r.procedure,
    fechaAdjudicacion: r.award_date || undefined,
  }));

  // 4. Resumen global
  const totalEmpresasHistoricas = db.prepare(`
    SELECT count(DISTINCT coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee)) as total
    FROM ${corporateContractSource} l
    LEFT JOIN company_resolution r 
      ON coalesce(l.awardee_nif, '') = r.raw_nif 
     AND coalesce(l.awardee, '') = r.raw_name
    WHERE (l.awardee_nif IS NOT NULL AND l.awardee_nif != '' OR l.awardee IS NOT NULL AND l.awardee != '')
      ${andScope};
  `).get(...params) as any;

  const validEvoForAvg = evolucion.filter((e) => e.year > 2018);
  const tasaRenovacionMedia = validEvoForAvg.length > 0
    ? Math.round((validEvoForAvg.reduce((sum, e) => sum + e.pctRenovacion, 0) / validEvoForAvg.length) * 10) / 10
    : 0;

  const activeEvoItem = evolucion.find((e) => e.year === targetAno) || (evolucion.length > 0 ? evolucion[evolucion.length - 1] : null);
  const tasaActual = activeEvoItem ? activeEvoItem.pctRenovacion : 0;
  const pctGastoNuevosActual = activeEvoItem ? activeEvoItem.pctGastoNuevos : 0;

  let minEvo = validEvoForAvg.length > 0 ? validEvoForAvg[0] : null;
  let maxEvo = validEvoForAvg.length > 0 ? validEvoForAvg[0] : null;
  for (const e of validEvoForAvg) {
    if (!minEvo || e.pctRenovacion < minEvo.pctRenovacion) minEvo = e;
    if (!maxEvo || e.pctRenovacion > maxEvo.pctRenovacion) maxEvo = e;
  }

  const isClosedMarket = tasaActual < 50;
  const diagnostico = isClosedMarket
    ? `Baja renovación de proveedores: En ${targetAno}, el ${tasaActual}% de las empresas fueron nuevos adjudicatarios, captando el ${pctGastoNuevosActual}% del gasto adjudicado. El ${Math.round((100 - pctGastoNuevosActual) * 10) / 10}% restante correspondió a contratistas recurrentes de ejercicios previos. Este indicador no demuestra por sí solo falta de competencia, favoritismo o irregularidad, pero puede justificar la revisión de posibles barreras de entrada o solvencias.`
    : `Rotación de proveedores: En ${targetAno}, el ${tasaActual}% de las empresas activas fueron nuevos adjudicatarios en la contratación evaluada.`;

  return toPlain({
    resumenGlobal: {
      totalEmpresasHistoricas: Number(totalEmpresasHistoricas?.total) || 0,
      tasaRenovacionActual: tasaActual,
      pctGastoNuevosActual,
      tasaRenovacionMedia,
      anoMaxRenovacion: maxEvo ? maxEvo.year : 2019,
      anoMinRenovacion: minEvo ? minEvo.year : 2026,
      alertaMercadoCerrado: isClosedMarket,
      diagnostico,
    },
    evolucion,
    veteranas,
    nuevosEntrantes,
    anoSeleccionado: filterByAno ? anoNum : null,
  });
}

export function getCalendarioElectoralStats(scope?: string): CalendarioElectoralStats {
  const db = getDb();
  const filterScope = parseScope(scope);
  const andScope = filterScope ? 'AND scope = ?' : '';
  const params: any[] = filterScope ? [filterScope] : [];

  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());

  const volumenAdjudicadoSql = hasLotAwardsTable
    ? `CASE
        WHEN l.award_amount_type IS NULL OR l.award_amount_type = 'total'
        THEN CASE
          WHEN l.is_lotized = 1
            AND (
              NOT EXISTS (
                SELECT 1 FROM contract_lots lot
                WHERE lot.contract_id = l.id
                  AND lot.awarded_amount IS NOT NULL
                  AND ${eligibleAwardLotStatusSql('lot')}
              )
              OR NOT EXISTS (
            SELECT 1
            FROM contract_lots lot
            WHERE lot.contract_id = l.id
              AND lot.awarded_amount IS NOT NULL
              AND ${eligibleAwardLotStatusSql('lot')}
              AND NOT EXISTS (
                SELECT 1
                FROM lot_awards award
                WHERE award.contract_id = l.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                  AND award.lot_number = lot.lot_number
                  AND award.awarded_amount IS NOT NULL
                  AND ${eligibleAwardResultStateSql('award')}
              )
          )
            )
            AND EXISTS (
              SELECT 1 FROM lot_awards award
              WHERE award.contract_id = l.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                AND award.awarded_amount IS NOT NULL
                AND ${eligibleAwardResultStateSql('award')}
            )
          THEN (
            SELECT round(sum(award.awarded_amount), 2)
            FROM lot_awards award
            WHERE award.contract_id = l.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
              AND award.awarded_amount IS NOT NULL
              AND ${eligibleAwardResultStateSql('award')}
          )
          WHEN l.is_lotized = 1
            AND EXISTS (
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
        ELSE 0
      END`
    : `CASE
        WHEN l.award_amount_type IS NULL OR l.award_amount_type = 'total'
        THEN CASE
          WHEN l.is_lotized = 1
            AND EXISTS (
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
          ELSE coalesce(l.awarded_amount, 0)
        END
        ELSE 0
      END`;

  const elecciones = [
    {
      year: 2015,
      nombre: 'Elecciones Municipales 2015',
      fechaElecciones: '2015-05-24',
      inicio: '2015-02-24',
      fin: '2015-05-24',
      nota: 'Cobertura voluntaria pre-LCSP',
    },
    {
      year: 2019,
      nombre: 'Elecciones Municipales 2019',
      fechaElecciones: '2019-05-26',
      inicio: '2019-02-26',
      fin: '2019-05-26',
      nota: 'Cobertura vinculante LCSP',
    },
    {
      year: 2023,
      nombre: 'Elecciones Municipales 2023',
      fechaElecciones: '2023-05-28',
      inicio: '2023-02-28',
      fin: '2023-05-28',
      nota: 'Cobertura vinculante LCSP',
    },
  ];

  // 1. Estadísticas de años no electorales en el mismo trimestre (28 de febrero a 28 de mayo).
  // Los conteos siguen siendo de expedientes; el volumen usa adjudicaciones de lotes cuando existen.
  const queryNoElectorales = `
    WITH electoral_source AS (
      SELECT
        l.*,
        ${volumenAdjudicadoSql} AS volumen_adjudicado
      FROM contracts l
      WHERE coalesce(l.award_date, l.publication_date) IS NOT NULL
        AND substr(coalesce(l.award_date, l.publication_date), 6, 5) BETWEEN '02-28' AND '05-28'
        AND cast(l.year as integer) IN (2020, 2021, 2022, 2024, 2025)
        ${andScope}
    )
    SELECT
      cast(year as integer) as ano_val,
      count(*) as contratos,
      round(sum(volumen_adjudicado), 2) as volumen,
      sum(CASE WHEN contract_type = 'Obras' THEN 1 ELSE 0 END) as obras_contratos,
      round(sum(CASE WHEN contract_type = 'Obras' THEN volumen_adjudicado ELSE 0 END), 2) as obras_volumen,
      sum(CASE WHEN contract_type = 'Servicios' THEN 1 ELSE 0 END) as servicios_contratos,
      round(sum(CASE WHEN contract_type = 'Servicios' THEN volumen_adjudicado ELSE 0 END), 2) as servicios_volumen
    FROM electoral_source
    GROUP BY ano_val;
  `;

  const rowsNoElec = db.prepare(queryNoElectorales).all(...params) as any[];
  const numAnosNoElec = rowsNoElec.length || 1;
  const totNoElecContratos = rowsNoElec.reduce((sum, r) => sum + (Number(r.contratos) || 0), 0);
  const totNoElecVolumen = rowsNoElec.reduce((sum, r) => sum + (Number(r.volumen) || 0), 0);
  const totNoElecObras = rowsNoElec.reduce((sum, r) => sum + (Number(r.obras_contratos) || 0), 0);
  const totNoElecObrasVol = rowsNoElec.reduce((sum, r) => sum + (Number(r.obras_volumen) || 0), 0);
  const totNoElecServ = rowsNoElec.reduce((sum, r) => sum + (Number(r.servicios_contratos) || 0), 0);
  const totNoElecServVol = rowsNoElec.reduce((sum, r) => sum + (Number(r.servicios_volumen) || 0), 0);

  const mediaNoElectoral = {
    contratosTrimestre: Math.round((totNoElecContratos / numAnosNoElec) * 10) / 10,
    volumenTrimestre: Math.round((totNoElecVolumen / numAnosNoElec) * 100) / 100,
    contratosObras: Math.round((totNoElecObras / numAnosNoElec) * 10) / 10,
    volumenObras: Math.round((totNoElecObrasVol / numAnosNoElec) * 100) / 100,
    contratosServicios: Math.round((totNoElecServ / numAnosNoElec) * 10) / 10,
    volumenServicios: Math.round((totNoElecServVol / numAnosNoElec) * 100) / 100,
    pctObrasYServicios: totNoElecContratos > 0
      ? Math.round(((totNoElecObras + totNoElecServ) / totNoElecContratos) * 1000) / 10
      : 0,
    ejerciciosAnalizados: rowsNoElec.map((r) => Number(r.ano_val)),
  };

  // 2. Periodos electorales concretos
  const periodosElectorales: PeriodoElectoralItem[] = elecciones.map((elec) => {
    const queryElec = `
      WITH electoral_source AS (
        SELECT
          l.*,
        ${volumenAdjudicadoSql} AS volumen_adjudicado
        FROM contracts l
        WHERE coalesce(l.award_date, l.publication_date) IS NOT NULL
          AND coalesce(l.award_date, l.publication_date) BETWEEN ? AND ?
          ${andScope}
      )
      SELECT
        count(*) as contratos,
        round(sum(volumen_adjudicado), 2) as volumen,
        sum(CASE WHEN contract_type = 'Obras' THEN 1 ELSE 0 END) as obras_contratos,
        round(sum(CASE WHEN contract_type = 'Obras' THEN volumen_adjudicado ELSE 0 END), 2) as obras_volumen,
        sum(CASE WHEN contract_type = 'Servicios' THEN 1 ELSE 0 END) as servicios_contratos,
        round(sum(CASE WHEN contract_type = 'Servicios' THEN volumen_adjudicado ELSE 0 END), 2) as servicios_volumen
      FROM electoral_source;
    `;
    const row = db.prepare(queryElec).get(elec.inicio, elec.fin + ' 23:59:59', ...params) as any;

    const contratos = Number(row?.contratos) || 0;
    const volumen = Number(row?.volumen) || 0;
    const contratosObras = Number(row?.obras_contratos) || 0;
    const volumenObras = Number(row?.obras_volumen) || 0;
    const contratosServicios = Number(row?.servicios_contratos) || 0;
    const volumenServicios = Number(row?.servicios_volumen) || 0;
    const pctObrasYServicios = contratos > 0 
      ? Math.round(((contratosObras + contratosServicios) / contratos) * 1000) / 10 
      : 0;

    const desvContratos = mediaNoElectoral.contratosTrimestre > 0
      ? Math.round(((contratos - mediaNoElectoral.contratosTrimestre) / mediaNoElectoral.contratosTrimestre) * 1000) / 10
      : 0;
    const desvVolumen = mediaNoElectoral.volumenTrimestre > 0
      ? Math.round(((volumen - mediaNoElectoral.volumenTrimestre) / mediaNoElectoral.volumenTrimestre) * 1000) / 10
      : 0;

    // Top contracts del periodo preelectoral
    const queryTop = `
      WITH electoral_source AS (
        SELECT
          l.*,
        ${volumenAdjudicadoSql} AS volumen_adjudicado
        FROM contracts l
        WHERE coalesce(l.award_date, l.publication_date) IS NOT NULL
          AND coalesce(l.award_date, l.publication_date) BETWEEN ? AND ?
          ${andScope}
      )
      SELECT
        id,
        case_number,
        object_description,
        contract_type,
        round(volumen_adjudicado, 2) as amount,
        substr(coalesce(award_date, publication_date), 1, 10) as document_date,
        coalesce(awardee, 'Sin awardee') as awardee
      FROM electoral_source
      ORDER BY amount DESC
      LIMIT 6;
    `;
    const topRows = db.prepare(queryTop).all(elec.inicio, elec.fin + ' 23:59:59', ...params) as any[];
    const topLicitaciones = topRows.map((t) => ({
      id: t.id,
      case_number: t.case_number,
      object_description: t.object_description,
      tipoContrato: t.contract_type,
      amount: Number(t.amount) || 0,
      document_date: t.document_date,
      awardee: t.awardee,
    }));

    return {
      nombre: elec.nombre,
      periodo: `${elec.inicio} a ${elec.fin}`,
      fechaElecciones: elec.fechaElecciones,
      year: elec.year,
      esElectoral: true,
      contratos,
      volumen,
      contratosObras,
      volumenObras,
      contratosServicios,
      volumenServicios,
      pctObrasYServicios,
      desviacionContratosPct: desvContratos,
      desviacionVolumenPct: desvVolumen,
      topLicitaciones,
    };
  });

  // 3. Evolución mensual agregada para visualización histórica
  const queryMensual = `
    WITH electoral_source AS (
      SELECT
        l.*,
        ${volumenAdjudicadoSql} AS volumen_adjudicado
      FROM contracts l
      WHERE coalesce(l.award_date, l.publication_date) IS NOT NULL
        AND cast(substr(coalesce(l.award_date, l.publication_date), 1, 4) as integer) >= 2018
        ${andScope}
    )
    SELECT
      substr(coalesce(award_date, publication_date), 1, 7) as mes_ano,
      cast(substr(coalesce(award_date, publication_date), 1, 4) as integer) as year,
      cast(substr(coalesce(award_date, publication_date), 6, 2) as integer) as mes,
      count(*) as contratos,
      round(sum(volumen_adjudicado), 2) as volumen
    FROM electoral_source
    GROUP BY mes_ano
    ORDER BY mes_ano ASC;
  `;
  const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mensualRows = db.prepare(queryMensual).all(...params) as any[];
  const evolucionMensual = mensualRows.map((m) => {
    const isPreelec2019 = m.year === 2019 && m.mes >= 3 && m.mes <= 5;
    const isPreelec2023 = m.year === 2023 && m.mes >= 3 && m.mes <= 5;
    const esPreelectoral = isPreelec2019 || isPreelec2023;
    let etiquetaEleccion: string | undefined = undefined;
    if (isPreelec2019) etiquetaEleccion = 'Preelectoral 2019';
    if (isPreelec2023) etiquetaEleccion = 'Preelectoral 2023';

    return {
      mesAno: m.mes_ano,
      year: Number(m.year),
      mes: Number(m.mes),
      mesNombre: mesesNombres[(m.mes - 1) % 12] || String(m.mes),
      contratos: Number(m.contratos) || 0,
      volumen: Number(m.volumen) || 0,
      esPreelectoral,
      etiquetaEleccion,
    };
  });

  const p2023 = periodosElectorales.find((p) => p.year === 2023);
  const desv2023Contratos = p2023?.desviacionContratosPct ?? 0;
  const diagnostico = desv2023Contratos > 0
    ? `Patrón preelectoral observado: En los 90 días previos a las elecciones municipales de mayo de 2023 se registraron un +${desv2023Contratos}% más expedientes (${p2023?.contratos} contratos) que la media del mismo periodo en años no electorales (${mediaNoElectoral.contratosTrimestre} contratos). Este patrón descriptivo no permite por sí solo establecer una relación causal con el calendario electoral.`
    : `En el periodo preelectoral de 2023 se registraron ${p2023?.contratos} contratos frente a una media de ${mediaNoElectoral.contratosTrimestre} en años no electorales.`;

  return toPlain({
    mediaNoElectoral,
    periodosElectorales,
    evolucionMensual,
    diagnostico,
  });
}

export function detectLotes(
  object_description: string | null,
  case_number: string | null,
  structuredData?: { is_lotized?: number | boolean | null; lot_count?: number | null; lots_source?: string | null; lotizado?: number | boolean | null; num_lotes?: number | null; lotes_origen?: string | null }
): { is_lotized: boolean; lotizado: boolean; numLotes: number; reason: string; origen?: string } {
  const structuredIsLotized = structuredData?.is_lotized ?? structuredData?.lotizado;
  const structuredLotCount = structuredData?.lot_count ?? structuredData?.num_lotes;
  const structuredLotsSource = structuredData?.lots_source ?? structuredData?.lotes_origen;
  if (structuredIsLotized !== undefined && structuredIsLotized !== null) {
    const isLot = Boolean(structuredIsLotized);
    const count = structuredLotCount && structuredLotCount > 0 ? structuredLotCount : (isLot ? 2 : 1);
    return {
      is_lotized: isLot,
      lotizado: isLot,
      numLotes: count,
      reason: isLot
        ? `${count} lotes formalmente acreditados en pliegos (${structuredLotsSource || 'CODICE'})`
        : 'Lote único según pliegos y datos registrales',
      origen: structuredLotsSource || (isLot ? 'CODICE_ESTRUCTURADO' : 'LOTE_UNICO'),
    };
  }

  const rawText = ((object_description || '') + ' ' + (case_number || '')).trim();
  const text = rawText.toLowerCase();

  // Explicit single-lot or false-positive exclusions
  if (text.includes('lote único') || text.includes('lote unico')) {
    return { is_lotized: false, lotizado: false, numLotes: 1, reason: 'Lote único explícito', origen: 'HEURISTICA_TEXTUAL' };
  }
  if (text.includes('un lote de') || text.includes('1 lote de')) {
    return { is_lotized: false, lotizado: false, numLotes: 1, reason: 'Partida singular ("un lote de...")', origen: 'HEURISTICA_TEXTUAL' };
  }

  // 1. Digits followed by lotes: e.g. "2 lotes", "5 lotes", "6 lotes"
  const numMatch = text.match(/(\d+)\s+lotes/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n > 1) {
      return { is_lotized: true, lotizado: true, numLotes: n, reason: `${n} lotes especificados en título`, origen: 'HEURISTICA_TEXTUAL' };
    }
  }

  // 2. Spanish words for numbers: "dos lotes", "tres lotes", "cuatro lotes", "cinco lotes"
  const wordMap: Record<string, number> = {
    dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10
  };
  const wordMatch = text.match(/(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+lotes/);
  if (wordMatch) {
    const n = wordMap[wordMatch[1]];
    return { is_lotized: true, lotizado: true, numLotes: n, reason: `${n} lotes (${wordMatch[0]})`, origen: 'HEURISTICA_TEXTUAL' };
  }

  // 3. Phrases: "por lotes", "dividida en lotes", "dividido en lotes"
  if (text.includes('por lotes')) {
    return { is_lotized: true, lotizado: true, numLotes: 2, reason: 'Adjudicación por lotes según título', origen: 'HEURISTICA_TEXTUAL' };
  }
  if (text.includes('dividida en lotes') || text.includes('dividido en lotes')) {
    return { is_lotized: true, lotizado: true, numLotes: 2, reason: 'División en lotes según título', origen: 'HEURISTICA_TEXTUAL' };
  }
  if (text.includes('lote 1') && (text.includes('lote 2') || text.includes('lote ii'))) {
    return { is_lotized: true, lotizado: true, numLotes: 2, reason: 'Múltiples lotes enumerados en título', origen: 'HEURISTICA_TEXTUAL' };
  }
  if (/lote\s+[0-9ivx]+/i.test(text) && !text.includes('un lote de')) {
    return { is_lotized: true, lotizado: true, numLotes: 2, reason: 'Mención de submódulos/lotes', origen: 'HEURISTICA_TEXTUAL' };
  }

  return { is_lotized: false, lotizado: false, numLotes: 1, reason: 'Lote único', origen: 'LOTE_UNICO' };
}

export function getLotesStats(year?: number | string, scope?: string): LotesStats {
  const db = getDb();
  const anoNum = Number(year);
  const filterByAno = !isNaN(anoNum) && anoNum > 0;
  const filterScope = parseScope(scope);

  const conditions: string[] = ['1=1'];
  const params: any[] = [];

  if (filterByAno) {
    conditions.push('year = ?');
    params.push(anoNum);
  }
  if (filterScope) {
    conditions.push('scope = ?');
    params.push(filterScope);
  }

  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());
  // lot_awards may be a partial snapshot. Coverage is evaluated per field so
  // a partial award import never replaces the complete legacy lot aggregate.
  const lotAwardsAwardeeCovered = hasLotAwardsTable
    ? `(NOT EXISTS (
        SELECT 1 FROM contract_lots lot
        WHERE lot.contract_id = contracts.id
          AND trim(coalesce(lot.awardee, '')) <> ''
          AND ${eligibleAwardLotStatusSql('lot')}
          AND NOT EXISTS (
            SELECT 1 FROM lot_awards la
            WHERE la.contract_id = lot.contract_id
              AND la.lot_number = lot.lot_number
              AND trim(coalesce(la.awardee, '')) <> ''
              AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
          )
      ))`
    : '0';

  const lotAwardsAmountCovered = hasLotAwardsTable
    ? lotAwardsAmountCoverageSql('contracts')
    : '0';

  const awardeeSource = hasLotAwardsTable
    ? `CASE WHEN ${lotAwardsAwardeeCovered}
        THEN (
          SELECT group_concat(DISTINCT la.awardee)
          FROM lot_awards la
          WHERE la.contract_id = contracts.id
            AND trim(coalesce(la.awardee, '')) <> ''
            AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
        )
        ELSE (
          SELECT group_concat(DISTINCT lot.awardee)
          FROM contract_lots lot
          WHERE lot.contract_id = contracts.id
            AND trim(coalesce(lot.awardee, '')) <> ''
            AND ${eligibleAwardLotStatusSql('lot')}
            AND ${excludeLegacyLotWhenStructuredTerminalResultSql('lot')}
        )
      END`
    : `SELECT group_concat(DISTINCT lot.awardee)
       FROM contract_lots lot
       WHERE lot.contract_id = contracts.id
         AND trim(coalesce(lot.awardee, '')) <> ''
         AND ${eligibleAwardLotStatusSql('lot')}`;

  const query = `
    SELECT 
      id,
      case_number,
      object_description,
      contracting_authority_name as organo,
      contract_type as tipo,
      procedure,
      dataset,
      year,
      round(
        CASE
          WHEN is_lotized = 1
            AND (award_amount_type IS NULL OR award_amount_type = 'total')
            AND ${lotAwardsAmountCovered}
            AND EXISTS (
              SELECT 1
              FROM lot_awards la
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
          WHEN is_lotized = 1
            AND (award_amount_type IS NULL OR award_amount_type = 'total')
            AND EXISTS (
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
        END,
        2
      ) as amount,
      award_amount_type,
      coalesce((${awardeeSource}), awardee, 'Sin awardee') as awardee,
      offer_count,
      (
        SELECT sum(CASE WHEN coalesce(lot.offer_count, ${hasLotAwardsTable ? `(SELECT max(la.offer_count) FROM lot_awards la WHERE la.contract_id = lot.contract_id AND la.lot_number = lot.lot_number AND la.offer_count IS NOT NULL AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')})` : 'NULL'}) > 0 THEN coalesce(lot.offer_count, ${hasLotAwardsTable ? `(SELECT max(la.offer_count) FROM lot_awards la WHERE la.contract_id = lot.contract_id AND la.lot_number = lot.lot_number AND la.offer_count IS NOT NULL AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')})` : 'NULL'}) ELSE 0 END)
        FROM contract_lots lot
        WHERE lot.contract_id = contracts.id
          AND ${eligibleAwardLotStatusSql('lot')}
      ) as lot_offer_sum,
      (
        SELECT count(*)
        FROM contract_lots lot
        WHERE lot.contract_id = contracts.id
          AND coalesce(lot.offer_count, ${hasLotAwardsTable ? `(SELECT max(la.offer_count) FROM lot_awards la WHERE la.contract_id = lot.contract_id AND la.lot_number = lot.lot_number AND la.offer_count IS NOT NULL AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')})` : 'NULL'}) > 0
          AND ${eligibleAwardLotStatusSql('lot')}
      ) as lot_offer_count,
      (
        SELECT count(*)
        FROM contract_lots lot
        WHERE lot.contract_id = contracts.id
          AND coalesce(lot.offer_count, ${hasLotAwardsTable ? `(SELECT max(la.offer_count) FROM lot_awards la WHERE la.contract_id = lot.contract_id AND la.lot_number = lot.lot_number AND la.offer_count IS NOT NULL AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')})` : 'NULL'}) = 1
          AND ${eligibleAwardLotStatusSql('lot')}
      ) as lot_unique_count,
      source_url,
      scope,
      is_lotized,
      lot_count,
      lots_source
    FROM contracts
    WHERE ${conditions.join(' AND ')}
  `;

  const rows = db.prepare(query).all(...params) as any[];

  // Counters
  let totalMayores = 0;
  let lotizadosMayores = 0;
  let volumenTotalMayores = 0;
  let volumenLotizados = 0;

  let totalGrandes100k = 0;
  let lotizadosGrandes100k = 0;

  let totalMegacontratos500k = 0;
  let lotizadosMegacontratos500k = 0;

  // Concurrence tracking
  let ofertasSumaLotizados = 0;
  let ofertasConteoLotizados = 0;
  let unicosLotizados = 0;

  let ofertasSumaNoLotizados = 0;
  let ofertasConteoNoLotizados = 0;
  let unicosNoLotizados = 0;

  // Type grouping (for mayores)
  const tipoMap: Record<string, { totalMayores: number; lotizados: number; volumenTotal: number; volumenLotizados: number }> = {};

  // Year grouping (for mayores)
  const anoMap: Record<number, { totalMayores: number; lotizados: number; volumenTotal: number; volumenLotizados: number }> = {};

  // Tramos grouping (all contracts)
  const tramosOrder = [
    'Megacontratos (>= 500.000 €)',
    'Grandes contratos (100.000 € - 500.000 €)',
    'Contratos medianos (40.000 € - 100.000 €)',
    'Pequeños no menores (< 40.000 €)',
    'Contratos menores (< 15.000 € / 40.000 €)',
  ];
  const tramoMap: Record<string, { totalContratos: number; lotizados: number; volumenTotal: number; volumenLotizados: number }> = {};
  for (const t of tramosOrder) {
    tramoMap[t] = { totalContratos: 0, lotizados: 0, volumenTotal: 0, volumenLotizados: 0 };
  }

  const grandesNoLotizados: LoteItem[] = [];
  const contratosLotizados: LoteItem[] = [];

  for (const r of rows) {
    const isMenor = r.procedure === 'Contrato menor' || r.procedure === 'Menor' || r.dataset === 'menores' || r.dataset === 'contratos_menores';
    const amount = r.amount == null ? null : Number(r.amount);
    const { is_lotized, numLotes, reason } = detectLotes(r.object_description, r.case_number, {
      is_lotized: r.is_lotized,
      lot_count: r.lot_count,
      lots_source: r.lots_source,
    });
    const tipo = r.tipo || 'Otros';
    const rowAno = Number(r.year) || 2024;
    const numOfertas = r.offer_count !== null && r.offer_count !== undefined ? Number(r.offer_count) : null;
    const lotOfferSum = r.lot_offer_sum !== null && r.lot_offer_sum !== undefined ? Number(r.lot_offer_sum) : 0;
    const lotOfferCount = r.lot_offer_count !== null && r.lot_offer_count !== undefined ? Number(r.lot_offer_count) : 0;
    const lotUniqueCount = r.lot_unique_count !== null && r.lot_unique_count !== undefined ? Number(r.lot_unique_count) : 0;
    const isComparable = r.award_amount_type == null || r.award_amount_type === 'total';
    const amountComparable = isComparable && amount != null && Number.isFinite(amount) ? amount : 0;

    // Los tramos dependen del importe adjudicado y, por tanto, solo admiten
    // importes comparables. La lotización/concurrencia, en cambio, es una
    // señal procedimental y debe conservar también contratos con importe desconocido.
    if (isComparable && amount != null && Number.isFinite(amount)) {
      let tramoName: string;
      if (isMenor) {
        tramoName = 'Contratos menores (< 15.000 € / 40.000 €)';
      } else if (amount >= 500000) {
        tramoName = 'Megacontratos (>= 500.000 €)';
      } else if (amount >= 100000) {
        tramoName = 'Grandes contratos (100.000 € - 500.000 €)';
      } else if (amount >= 40000) {
        tramoName = 'Contratos medianos (40.000 € - 100.000 €)';
      } else {
        tramoName = 'Pequeños no menores (< 40.000 €)';
      }

      tramoMap[tramoName].totalContratos++;
      tramoMap[tramoName].volumenTotal += amount;
      if (is_lotized) {
        tramoMap[tramoName].lotizados++;
        tramoMap[tramoName].volumenLotizados += amount;
      }
    }

    if (is_lotized) {
      contratosLotizados.push({
        id: r.id,
        case_number: r.case_number,
        expediente: r.case_number,
        object_description: r.object_description,
        objeto: r.object_description,
        organo: r.organo,
        tipo: r.tipo,
        procedure: r.procedure,
        procedimiento: r.procedure,
        amount,
        importe: amount,
        numLotes,
        motivoLote: reason,
        awardee: r.awardee,
        adjudicatario: r.awardee,
        offer_count: is_lotized && lotOfferCount > 0 ? lotOfferSum : numOfertas,
        numOfertas: is_lotized && lotOfferCount > 0 ? lotOfferSum : numOfertas,
        source_url: r.source_url,
        url: r.source_url,
        year: r.year,
      });
    }

    // Process non-minor contracts
    if (!isMenor) {
      totalMayores++;
      volumenTotalMayores += amountComparable;

      if (!tipoMap[tipo]) {
        tipoMap[tipo] = { totalMayores: 0, lotizados: 0, volumenTotal: 0, volumenLotizados: 0 };
      }
      tipoMap[tipo].totalMayores++;
      tipoMap[tipo].volumenTotal += amountComparable;

      if (rowAno >= 2018 && rowAno <= 2026) {
        if (!anoMap[rowAno]) {
          anoMap[rowAno] = { totalMayores: 0, lotizados: 0, volumenTotal: 0, volumenLotizados: 0 };
        }
        anoMap[rowAno].totalMayores++;
        anoMap[rowAno].volumenTotal += amountComparable;
      }

      if (isComparable && amount != null && amount >= 500000) {
        totalMegacontratos500k++;
        if (is_lotized) lotizadosMegacontratos500k++;
      }
      if (isComparable && amount != null && amount >= 100000) {
        totalGrandes100k++;
        if (is_lotized) lotizadosGrandes100k++;
        else {
          grandesNoLotizados.push({
            id: r.id,
            case_number: r.case_number,
            expediente: r.case_number,
            object_description: r.object_description,
            objeto: r.object_description,
            organo: r.organo,
            tipo: r.tipo,
            procedure: r.procedure,
            procedimiento: r.procedure,
            amount,
            importe: amount,
            awardee: r.awardee,
            adjudicatario: r.awardee,
            offer_count: numOfertas,
            numOfertas,
            source_url: r.source_url,
            url: r.source_url,
            year: r.year,
          });
        }
      }

      if (is_lotized) {
        lotizadosMayores++;
        volumenLotizados += amountComparable;
        tipoMap[tipo].lotizados++;
        tipoMap[tipo].volumenLotizados += amountComparable;
        if (rowAno >= 2018 && rowAno <= 2026 && anoMap[rowAno]) {
          anoMap[rowAno].lotizados++;
          anoMap[rowAno].volumenLotizados += amountComparable;
        }
      }

      // Concurrence in mayores. En expedientes lotizados la unidad competitiva es el lote:
      // la cifra de cabecera puede ser distinta de las ofertas registradas por cada lote.
      if (is_lotized && lotOfferCount > 0) {
        ofertasSumaLotizados += lotOfferSum;
        ofertasConteoLotizados += lotOfferCount;
        unicosLotizados += lotUniqueCount;
      } else if (!is_lotized && numOfertas !== null && numOfertas > 0) {
        ofertasSumaNoLotizados += numOfertas;
        ofertasConteoNoLotizados++;
        if (numOfertas === 1) unicosNoLotizados++;
      }
    }
  }

  // Sort lists, keeping contracts with unknown awarded amount at the end.
  const compareNullableAmount = (a: LoteItem, b: LoteItem) => {
    if (a.amount == null) return b.amount == null ? 0 : 1;
    if (b.amount == null) return -1;
    return b.amount - a.amount;
  };
  grandesNoLotizados.sort(compareNullableAmount);
  contratosLotizados.sort(compareNullableAmount);

  const pctLotizadosMayores = totalMayores > 0 ? Math.round((lotizadosMayores / totalMayores) * 1000) / 10 : 0;
  const pctLotizadosGrandes100k = totalGrandes100k > 0 ? Math.round((lotizadosGrandes100k / totalGrandes100k) * 1000) / 10 : 0;
  const pctLotizadosMegacontratos500k = totalMegacontratos500k > 0 ? Math.round((lotizadosMegacontratos500k / totalMegacontratos500k) * 1000) / 10 : 0;
  const pctVolumenLotizados = volumenTotalMayores > 0 ? Math.round((volumenLotizados / volumenTotalMayores) * 1000) / 10 : 0;

  const mediaOfertasLotizados = ofertasConteoLotizados > 0 ? Math.round((ofertasSumaLotizados / ofertasConteoLotizados) * 100) / 100 : 0;
  const mediaOfertasNoLotizados = ofertasConteoNoLotizados > 0 ? Math.round((ofertasSumaNoLotizados / ofertasConteoNoLotizados) * 100) / 100 : 0;
  const pctOfertaUnicaLotizados = ofertasConteoLotizados > 0 ? Math.round((unicosLotizados / ofertasConteoLotizados) * 1000) / 10 : 0;
  const pctOfertaUnicaNoLotizados = ofertasConteoNoLotizados > 0 ? Math.round((unicosNoLotizados / ofertasConteoNoLotizados) * 1000) / 10 : 0;

  const porTipo = Object.entries(tipoMap)
    .map(([tipo, data]) => ({
      tipo,
      totalMayores: data.totalMayores,
      lotizados: data.lotizados,
      pctLotizados: data.totalMayores > 0 ? Math.round((data.lotizados / data.totalMayores) * 1000) / 10 : 0,
      volumenTotal: Math.round(data.volumenTotal * 100) / 100,
      volumenLotizados: Math.round(data.volumenLotizados * 100) / 100,
    }))
    .sort((a, b) => b.totalMayores - a.totalMayores);

  const porAno = Object.entries(anoMap)
    .map(([anoStr, data]) => {
      const a = Number(anoStr);
      return {
        year: a,
        totalMayores: data.totalMayores,
        lotizados: data.lotizados,
        pctLotizados: data.totalMayores > 0 ? Math.round((data.lotizados / data.totalMayores) * 1000) / 10 : 0,
        volumenTotal: Math.round(data.volumenTotal * 100) / 100,
        volumenLotizados: Math.round(data.volumenLotizados * 100) / 100,
      };
    })
    .sort((a, b) => a.year - b.year);

  const porTramo = tramosOrder.map((tramo) => {
    const data = tramoMap[tramo];
    return {
      tramo,
      totalContratos: data.totalContratos,
      lotizados: data.lotizados,
      pctLotizados: data.totalContratos > 0 ? Math.round((data.lotizados / data.totalContratos) * 1000) / 10 : 0,
      volumenTotal: Math.round(data.volumenTotal * 100) / 100,
      volumenLotizados: Math.round(data.volumenLotizados * 100) / 100,
    };
  });

  const diagnostico = pctLotizadosGrandes100k <= 5
    ? `Déficit crítico de lotización: El ${(100 - pctLotizadosGrandes100k).toFixed(1)}% de las contrataciones superiores a 100.000 € se adjudicaron en lote único sin división. El art. 99.3 LCSP fija la división en lotes como regla general obligatoria para garantizar el acceso de PYMEs; en los contratos que sí se dividieron en lotes, la concurrencia media se incrementó hasta ${mediaOfertasLotizados} licitadores frente a ${mediaOfertasNoLotizados} en lote único.`
    : `Tasa de lotización de contratos mayores situada en el ${pctLotizadosMayores}%.`;

  return toPlain({
    resumen: {
      totalMayores,
      lotizadosMayores,
      pctLotizadosMayores,
      totalGrandes100k,
      lotizadosGrandes100k,
      pctLotizadosGrandes100k,
      totalMegacontratos500k,
      lotizadosMegacontratos500k,
      pctLotizadosMegacontratos500k,
      volumenTotalMayores: Math.round(volumenTotalMayores * 100) / 100,
      volumenLotizados: Math.round(volumenLotizados * 100) / 100,
      pctVolumenLotizados,
      concurrencia: {
        lotesEvaluados: ofertasConteoLotizados,
        contratosEvaluadosNoLotizados: ofertasConteoNoLotizados,
        mediaOfertasLotizados,
        mediaOfertasNoLotizados,
        pctOfertaUnicaLotizados,
        pctOfertaUnicaNoLotizados,
      },
    },
    porTipo,
    porAno,
    porTramo,
    grandesNoLotizados,
    contratosLotizados,
    diagnostico,
  });
}

export function getBajaTemerariaStats(year?: number | string, scope?: string): BajaTemerariaStats {
  const db = getDb();
  const corporateContractSource = getCorporateContractSource(db);
  const anoNum = Number(year);
  const filterByAno = !isNaN(anoNum) && anoNum > 0;
  const filterScope = parseScope(scope);

  const conditions: string[] = [
    "amount_excl_vat > 0",
    "awarded_amount > 0",
    "(award_amount_type IS NULL OR award_amount_type = 'total')",
    `NOT ${terminalContractStatusSql('l')}`,
    "procedure NOT IN ('Contrato menor', 'Menor')",
    "dataset NOT IN ('menores', 'contratos_menores')",
  ];
  const params: any[] = [];

  if (filterByAno) {
    conditions.push('year = ?');
    params.push(anoNum);
  }
  if (filterScope) {
    conditions.push('scope = ?');
    params.push(filterScope);
  }

  const query = `
    SELECT 
      id,
      case_number,
      object_description,
      contracting_authority_name as organo,
      contract_type as tipo,
      procedure,
      round(amount_excl_vat, 2) as amount_excl_vat,
      round(awarded_amount, 2) as awarded_amount,
      round(estimated_value, 2) as estimated_value,
      coalesce(awardee, 'Sin awardee') as awardee,
      awardee_nif,
      offer_count,
      source_url,
      year
    FROM ${corporateContractSource} l
    WHERE ${conditions.join(' AND ')}
  `;

  const rows = db.prepare(query).all(...params) as any[];

  let totalEvaluados = 0;
  let bajasExtremasCount = 0;
  let bajasAgresivasCount = 0;
  let bajasSignificativasCount = 0;
  let bajasModeradasCount = 0;
  let sumaBajasPct = 0;
  let volumenEnRiesgo = 0;

  const topBajas: BajaTemerariaItem[] = [];
  const empresaMap: Record<string, {
    nif: string | null;
    totalContratos: number;
    bajasExtremas: number;
    bajasAgresivas: number;
    sumaPct: number;
    volumenTotal: number;
  }> = {};

  for (const r of rows) {
    const sinIva = Number(r.amount_excl_vat) || 0;
    const adj = Number(r.awarded_amount) || 0;
    if (sinIva <= 0 || adj <= 0) continue;

    totalEvaluados++;
    const baja_pct = Math.round(((sinIva - adj) / sinIva) * 1000) / 10;
    const ahorro_euros = Math.round((sinIva - adj) * 100) / 100;
    sumaBajasPct += Math.max(baja_pct, 0);

    let nivelRiesgo: 'extrema' | 'muy_agresiva' | 'significativa' = 'significativa';

    if (baja_pct >= 40) {
      bajasExtremasCount++;
      volumenEnRiesgo += adj;
      nivelRiesgo = 'extrema';
    } else if (baja_pct >= 25) {
      bajasAgresivasCount++;
      volumenEnRiesgo += adj;
      nivelRiesgo = 'muy_agresiva';
    } else if (baja_pct >= 15) {
      bajasSignificativasCount++;
      nivelRiesgo = 'significativa';
    } else {
      bajasModeradasCount++;
    }

    if (baja_pct >= 20) {
      topBajas.push({
        id: r.id,
        case_number: r.case_number,
        expediente: r.case_number,
        object_description: r.object_description,
        objeto: r.object_description,
        organo: r.organo,
        tipo: r.tipo,
        procedure: r.procedure,
        procedimiento: r.procedure,
        amount_excl_vat: sinIva,
        importe_sin_iva: sinIva,
        estimated_value: r.estimated_value ? Number(r.estimated_value) : null,
        valor_estimado: r.estimated_value ? Number(r.estimated_value) : null,
        awarded_amount: adj,
        importe_adjudicacion: adj,
        baja_pct,
        ahorro_euros,
        offer_count: r.offer_count !== null && r.offer_count !== undefined ? Number(r.offer_count) : null,
        num_ofertas: r.offer_count !== null && r.offer_count !== undefined ? Number(r.offer_count) : null,
        esLicitadorUnico: Number(r.offer_count) === 1 && Boolean(r.awardee && r.awardee.trim() && r.awardee !== 'Sin awardee'),
        posiblePrecioUnitario: baja_pct >= 90 && adj <= 100 && sinIva >= 1000,
        awardee: r.awardee,
        adjudicatario: r.awardee,
        awardee_nif: r.awardee_nif || null,
        url: r.source_url,
        source_url: r.source_url,
        year: r.year ? Number(r.year) : null,
        nivelRiesgo,
      });
    }

    const emp = (r.awardee || '').trim();
    if (emp && emp !== 'Sin awardee') {
      if (!empresaMap[emp]) {
        empresaMap[emp] = {
          nif: r.awardee_nif || null,
          totalContratos: 0,
          bajasExtremas: 0,
          bajasAgresivas: 0,
          sumaPct: 0,
          volumenTotal: 0,
        };
      }
      empresaMap[emp].totalContratos++;
      empresaMap[emp].sumaPct += Math.max(baja_pct, 0);
      empresaMap[emp].volumenTotal += adj;
      if (baja_pct >= 40) {
        empresaMap[emp].bajasExtremas++;
        empresaMap[emp].bajasAgresivas++;
      } else if (baja_pct >= 25) {
        empresaMap[emp].bajasAgresivas++;
      }
    }
  }

  // Sort topBajas: first by baja_pct DESC, then by amount_excl_vat DESC
  topBajas.sort((a, b) => b.baja_pct - a.baja_pct || b.amount_excl_vat - a.amount_excl_vat);

  const rankingEmpresas: EmpresaBajaAgresiva[] = Object.entries(empresaMap)
    .filter(([, d]) => d.bajasAgresivas > 0)
    .map(([awardee, d]) => ({
      awardee,
      nif: d.nif,
      empresaId: getOpaqueEmpresaId(d.nif, awardee),
      totalContratos: d.totalContratos,
      bajasExtremas: d.bajasExtremas,
      bajasAgresivas: d.bajasAgresivas,
      pctBajasAgresivas: d.totalContratos > 0 ? Math.round((d.bajasAgresivas / d.totalContratos) * 1000) / 10 : 0,
      bajaMediaPct: d.totalContratos > 0 ? Math.round((d.sumaPct / d.totalContratos) * 10) / 10 : 0,
      volumenTotal: Math.round(d.volumenTotal * 100) / 100,
    }))
    .sort((a, b) => b.bajasAgresivas - a.bajasAgresivas || b.volumenTotal - a.volumenTotal);

  const bajaMediaGlobal = totalEvaluados > 0 ? Math.round((sumaBajasPct / totalEvaluados) * 10) / 10 : 0;
  const contratosRiesgo = bajasExtremasCount + bajasAgresivasCount;
  const pctContratosRiesgo = totalEvaluados > 0 ? Math.round((contratosRiesgo / totalEvaluados) * 1000) / 10 : 0;

  const tramos = [
    {
      tramo: 'Bajas Extremas (≥ 40%)',
      rango: '≥ 40% de descuento',
      count: bajasExtremasCount,
      pct: totalEvaluados > 0 ? Math.round((bajasExtremasCount / totalEvaluados) * 1000) / 10 : 0,
      volumen: topBajas.filter((b) => b.nivelRiesgo === 'extrema').reduce((acc, b) => acc + b.awarded_amount, 0),
      level: 'alerta' as const,
      nivel: 'alerta' as const,
    },
    {
      tramo: 'Bajas Muy Agresivas',
      rango: '25% - 40% de descuento',
      count: bajasAgresivasCount,
      pct: totalEvaluados > 0 ? Math.round((bajasAgresivasCount / totalEvaluados) * 1000) / 10 : 0,
      volumen: topBajas.filter((b) => b.nivelRiesgo === 'muy_agresiva').reduce((acc, b) => acc + b.awarded_amount, 0),
      level: 'advertencia' as const,
      nivel: 'advertencia' as const,
    },
    {
      tramo: 'Bajas Significativas',
      rango: '15% - 25% de descuento',
      count: bajasSignificativasCount,
      pct: totalEvaluados > 0 ? Math.round((bajasSignificativasCount / totalEvaluados) * 1000) / 10 : 0,
      volumen: 0,
      level: 'moderada' as const,
      nivel: 'moderada' as const,
    },
    {
      tramo: 'Bajas Moderadas / Licitación a Tipo',
      rango: '< 15% o sin rebaja',
      count: bajasModeradasCount,
      pct: totalEvaluados > 0 ? Math.round((bajasModeradasCount / totalEvaluados) * 1000) / 10 : 0,
      volumen: 0,
      level: 'neutro' as const,
      nivel: 'neutro' as const,
    },
  ];

  const diagnostico = contratosRiesgo > 0
    ? `Bajas elevadas respecto al PBL en el ${pctContratosRiesgo}% de las contracts competitivas: Se identificaron ${contratosRiesgo} adjudicaciones con descuentos superiores al 25% del Presupuesto Base de Licitación (${bajasExtremasCount} de ellas con bajas muy elevadas ≥ 40%), acumulando ${Math.round(volumenEnRiesgo / 1000000 * 10) / 10} M€ adjudicados. Conforme al art. 149 LCSP, estas diferencias constituyen una señal estadística de revisión para la mesa de contratación y no prejuzgan por sí solas que la oferta sea anormalmente baja o inviable.`
    : `Baja media global situada en el ${bajaMediaGlobal}%. Todos los contratos evaluados se adjudicaron dentro de los márgenes estándar sobre el PBL.`;

  return toPlain({
    resumen: {
      totalEvaluados,
      bajasExtremasCount,
      bajasAgresivasCount,
      bajasSignificativasCount,
      bajasModeradasCount,
      bajaMediaGlobal,
      volumenEnRiesgo: Math.round(volumenEnRiesgo * 100) / 100,
      pctContratosRiesgo,
    },
    tramos,
    topBajas,
    rankingEmpresas,
    diagnostico,
  });
}

function desertedContractBudgetSql(db: DatabaseSync, contractAlias: string, hasLotAwardsTable?: boolean): string {
  const hasStructuredAwards = hasLotAwardsTable ?? Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());
  const hasContractLotsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'contract_lots' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'contract_lots' LIMIT 1"
  ).get());
  if (!hasContractLotsTable) {
    return `CASE WHEN ${desertedContractStatusSql(contractAlias)} THEN coalesce(${contractAlias}.amount_excl_vat, 0) ELSE 0 END`;
  }

  const legacyDesertedLot = hasStructuredAwards
    ? `((lower(coalesce(lot.lot_status, '')) LIKE '%desiert%'
        OR lower(coalesce(lot.lot_status, '')) LIKE '%desert%')
      AND NOT EXISTS (
        SELECT 1
        FROM lot_awards valid_award
        WHERE valid_award.contract_id = lot.contract_id
          AND valid_award.lot_number = lot.lot_number
          AND ${eligibleAwardResultStateSql('valid_award')}
          AND (trim(coalesce(valid_award.awardee, '')) <> '' OR valid_award.awarded_amount IS NOT NULL)
      ))`
    : `(lower(coalesce(lot.lot_status, '')) LIKE '%desiert%'
      OR lower(coalesce(lot.lot_status, '')) LIKE '%desert%')`;
  const structuredDesertedLot = hasStructuredAwards
    ? `OR EXISTS (
        SELECT 1
        FROM lot_awards terminal_award
        WHERE terminal_award.contract_id = lot.contract_id
          AND terminal_award.lot_number = lot.lot_number
          AND (lower(coalesce(terminal_award.result_state, '')) LIKE '%desiert%'
            OR lower(coalesce(terminal_award.result_state, '')) LIKE '%desert%')
          AND lower(coalesce(terminal_award.result_state, '')) NOT LIKE '%provisional%'
          AND NOT EXISTS (
            SELECT 1
            FROM lot_awards valid_award
            WHERE valid_award.contract_id = terminal_award.contract_id
              AND valid_award.lot_number = terminal_award.lot_number
              AND ${eligibleAwardResultStateSql('valid_award')}
              AND (trim(coalesce(valid_award.awardee, '')) <> '' OR valid_award.awarded_amount IS NOT NULL)
          )
      )`
    : '';
  const desertedLotPredicate = `(${legacyDesertedLot}
    ${structuredDesertedLot})`;

  return `CASE
    WHEN EXISTS (SELECT 1 FROM contract_lots lot WHERE lot.contract_id = ${contractAlias}.id)
    THEN (
      SELECT coalesce(sum(CASE WHEN ${desertedLotPredicate}
        THEN coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0) ELSE 0 END), 0)
      FROM contract_lots lot
      WHERE lot.contract_id = ${contractAlias}.id
    )
    WHEN ${desertedContractStatusSql(contractAlias)} THEN coalesce(${contractAlias}.amount_excl_vat, 0)
    ELSE 0
  END`;
}

export function getStats(year?: number | string, scope?: string): GlobalStats {
  const db = getDb();
  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());
  const desertedBudget = (alias: string) => desertedContractBudgetSql(db, alias, hasLotAwardsTable);

  const lotAwardsAmountCovered = (alias: string) => lotAwardsAmountCoverageSql(alias);

  const lotAwardedAmount = (alias: string) => {
    const fallback = `CASE
      WHEN ${alias}.is_lotized = 1
        AND EXISTS (
          SELECT 1 FROM contract_lots lot
          WHERE lot.contract_id = ${alias}.id
            AND lot.awarded_amount IS NOT NULL
            AND ${eligibleAwardLotStatusSql('lot')}
        )
      THEN (
        SELECT round(sum(lot.awarded_amount), 2)
        FROM contract_lots lot
        WHERE lot.contract_id = ${alias}.id
          AND lot.awarded_amount IS NOT NULL
          AND ${eligibleLegacyLotAwardAmountSql('lot', hasLotAwardsTable)}
      )
      ELSE CASE WHEN ${allowParentAwardAmountFallbackSql(alias, hasLotAwardsTable)} THEN coalesce(${alias}.awarded_amount, 0) ELSE 0 END
    END`;

    if (!hasLotAwardsTable) return fallback;

    return `CASE
      WHEN ${alias}.is_lotized = 1
        AND ${lotAwardsAmountCovered(alias)}
        AND EXISTS (
          SELECT 1 FROM lot_awards award
          WHERE award.contract_id = ${alias}.id
            AND award.awarded_amount IS NOT NULL
            AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
        )
      THEN (
        SELECT round(sum(award.awarded_amount), 2)
        FROM lot_awards award
        WHERE award.contract_id = ${alias}.id
          AND award.awarded_amount IS NOT NULL
          AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
      )
      ELSE ${fallback}
    END`;
  };
  const contractAwardAmountEligible = (alias: string) => contractAwardAmountEligibleSql(db, alias);
  const companyAwardAmountEligible = authorityVolumeAwardAmountEligibleSql(db, 'l');

  const corporateContractSource = getCorporateContractSource(db);
  ensureCorporateResolutionTable(db);

  const anoNum = Number(year);
  const filterByAno = !isNaN(anoNum) && anoNum > 0;
  const filterScope = parseScope(scope);

  const conditionsL: string[] = [];
  const conditionsPlain: string[] = [];
  const params: any[] = [];

  if (filterByAno) {
    conditionsL.push('l.year = ?');
    conditionsPlain.push('year = ?');
    params.push(anoNum);
  }
  if (filterScope) {
    conditionsL.push('l.scope = ?');
    conditionsPlain.push('scope = ?');
    params.push(filterScope);
  }

  const whereL = conditionsL.length > 0 ? `WHERE ${conditionsL.join(' AND ')}` : '';
  const wherePlain = conditionsPlain.length > 0 ? `WHERE ${conditionsPlain.join(' AND ')}` : '';
  const andL = conditionsL.length > 0 ? `AND ${conditionsL.join(' AND ')}` : '';
  const andPlain = conditionsPlain.length > 0 ? `AND ${conditionsPlain.join(' AND ')}` : '';

  const totals = db.prepare(`
    WITH stats_source AS (
      SELECT
        l.*,
        CASE
          WHEN NOT ${terminalContractStatusSql('l')}
            AND ${contractAwardAmountEligible('l')}
          THEN ${lotAwardedAmount('l')}
          ELSE 0
        END as flow_awarded
      FROM contracts l
      ${whereL}
    )
    SELECT 
      count(*) as total_licitaciones,
      round(sum(CASE WHEN economic_nature = 'gasto' THEN flow_awarded ELSE 0 END), 2) as gasto_adjudicado,
      round(sum(CASE WHEN economic_nature = 'ingreso' THEN flow_awarded ELSE 0 END), 2) as ingresos_adjudicados,
      round(sum(CASE WHEN economic_nature = 'concesion' THEN flow_awarded ELSE 0 END), 2) as concesiones_adjudicadas,
      round(sum(CASE
        WHEN economic_nature = 'gasto' AND ${inCourseContractStatusSql('')}
          AND EXISTS (SELECT 1 FROM contract_lots lot WHERE lot.contract_id = stats_source.id)
        THEN (
          SELECT coalesce(sum(
            CASE
              WHEN NOT ${eligibleLegacyLotAwardAmountSql('lot')} THEN 0
              WHEN lot.awarded_amount IS NOT NULL OR trim(coalesce(lot.awardee, '')) <> '' THEN 0
              WHEN EXISTS (
                SELECT 1
                FROM lot_awards award
                WHERE award.contract_id = stats_source.id
                  AND award.lot_number = lot.lot_number
                  AND (award.awarded_amount IS NOT NULL OR trim(coalesce(award.awardee, '')) <> '')
                  AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
              ) THEN 0
              ELSE coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0)
            END
          ), 0)
          FROM contract_lots lot
          WHERE lot.contract_id = stats_source.id
        )
        WHEN economic_nature = 'gasto' AND ${inCourseContractStatusSql('')}
          AND flow_awarded <= 0
          AND ${allowParentAwardAmountFallbackSql('stats_source', hasLotAwardsTable)}
        THEN coalesce(amount_excl_vat, 0)
        ELSE 0
      END), 2) as gasto_en_curso,
      round(sum(CASE WHEN economic_nature = 'gasto' THEN ${desertedBudget('stats_source')} ELSE 0 END), 2) as gasto_desierto,
      round(sum(CASE WHEN economic_nature = 'ingreso' THEN ${desertedBudget('stats_source')} ELSE 0 END), 2) as ingresos_desiertos,
      round(sum(CASE WHEN economic_nature = 'concesion' THEN ${desertedBudget('stats_source')} ELSE 0 END), 2) as concesiones_desiertas,
      round(sum(flow_awarded), 2) as total_importe,
      count(DISTINCT coalesce(nullif(trim(contracting_authority_id), ''), 'unlinked-contract:' || id)) as total_organismos,
      max(publication_date) as ultima_fecha
    FROM stats_source;
  `).get(...params) as any;

  const totalEmpresasRow = db.prepare(`
    SELECT count(DISTINCT coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee)) as total_empresas
    FROM ${corporateContractSource} l
    LEFT JOIN company_resolution r
      ON coalesce(l.awardee_nif, '') = r.raw_nif
     AND coalesce(l.awardee, '') = r.raw_name
    ${whereL};
  `).get(...params) as any;

  // Calculo de ahorro medio: en expedientes lotizados usa la suma del PBL
  // y de las adjudicaciones de lotes no desiertos para evitar mezclar
  // importes de cabecera con el desglose económico real de los lotes.
  const ahorroRow = db.prepare(`
    SELECT
      round(avg((pbl - awarded) / pbl * 100), 1) as ahorro_medio
    FROM (
      SELECT
        CASE
          WHEN is_lotized = 1 AND (
            EXISTS (
              SELECT 1
              FROM contract_lots lot
              WHERE lot.contract_id = contracts.id
                AND lot.awarded_amount IS NOT NULL
                AND ${eligibleAwardLotStatusSql('lot')}
            )
            OR EXISTS (
              SELECT 1
              FROM lot_awards award
              WHERE award.contract_id = contracts.id
                AND award.awarded_amount IS NOT NULL
                AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
            )
          )
          THEN (
            SELECT round(sum(coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0)), 2)
            FROM contract_lots lot
            WHERE lot.contract_id = contracts.id
              AND ${eligibleAwardLotStatusSql('lot')}
              AND (
                lot.awarded_amount IS NOT NULL
                OR EXISTS (
                  SELECT 1
                  FROM lot_awards award
                  WHERE award.contract_id = lot.contract_id
                    AND award.lot_number = lot.lot_number
                    AND award.awarded_amount IS NOT NULL
                    AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                )
              )
          )
          ELSE amount_excl_vat
        END as pbl,
        ${lotAwardedAmount('contracts')} as awarded
      FROM contracts
      WHERE (
          amount_excl_vat > 0
          OR (
            is_lotized = 1
            AND EXISTS (
              SELECT 1
              FROM contract_lots lot
              WHERE lot.contract_id = contracts.id
                AND lot.budget_excl_vat IS NOT NULL
            )
          )
        )
        AND (
          awarded_amount > 0
          OR (
            is_lotized = 1
            AND (
              EXISTS (
                SELECT 1
                FROM lot_awards award
                WHERE award.contract_id = contracts.id
                  AND award.awarded_amount IS NOT NULL
                  AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
              )
              OR EXISTS (
                SELECT 1
                FROM contract_lots lot
                WHERE lot.contract_id = contracts.id
                  AND lot.awarded_amount IS NOT NULL
                  AND ${eligibleAwardLotStatusSql('lot')}
              )
            )
          )
        )
        AND ${contractAwardAmountEligible('contracts')}
        AND (economic_nature = 'gasto' OR economic_nature IS NULL)
        AND NOT ${terminalContractStatusSql('contracts')}
        ${andPlain}
    )
    WHERE pbl > 0
      AND awarded > 0
      AND awarded <= pbl;
  `).get(...params) as any;

  // Evolución Anual multiserie (filtrada por ámbito si se especifica)
  const evolucionAnual = getEvolucionAnualStats(scope);

  // Desglose por ámbito para el año seleccionado (o global)
  const whereAnoDesglose = filterByAno ? 'WHERE year = ?' : '';
  const desgloseRows = db.prepare(`
    SELECT 
      coalesce(scope, 'Directa Municipal') as scope,
      count(*) as contratos,
      round(sum(CASE WHEN economic_nature = 'gasto' AND NOT ${terminalContractStatusSql('contracts')} AND ${contractAwardAmountEligible('contracts')} THEN ${lotAwardedAmount('contracts')} ELSE 0 END), 2) as gasto_adjudicado,
      round(sum(CASE WHEN economic_nature = 'ingreso' AND NOT ${terminalContractStatusSql('contracts')} AND ${contractAwardAmountEligible('contracts')} THEN ${lotAwardedAmount('contracts')} ELSE 0 END), 2) as ingresos_adjudicados,
      round(sum(CASE WHEN NOT ${terminalContractStatusSql('contracts')} AND ${contractAwardAmountEligible('contracts')} THEN ${lotAwardedAmount('contracts')} ELSE 0 END), 2) as volumen
    FROM contracts
    ${whereAnoDesglose}
    GROUP BY scope;
  `).all(...(filterByAno ? [anoNum] : [])) as any[];

  let directaContratos = 0;
  let directaVolumen = 0;
  let directaGasto = 0;
  let mancomunidadContratos = 0;
  let mancomunidadVolumen = 0;
  let mancomunidadGasto = 0;

  for (const r of desgloseRows) {
    if (r.scope === 'Indirecta (Mancomunidad)') {
      mancomunidadContratos = r.contratos || 0;
      mancomunidadVolumen = Number(r.volumen) || 0;
      mancomunidadGasto = Number(r.gasto_adjudicado) || 0;
    } else {
      directaContratos += (r.contratos || 0);
      directaVolumen += (Number(r.volumen) || 0);
      directaGasto += (Number(r.gasto_adjudicado) || 0);
    }
  }
  const totalVolDesglose = directaVolumen + mancomunidadVolumen;
  const totalGastoDesglose = directaGasto + mancomunidadGasto;
  const desgloseAmbito = {
    directa: {
      contratos: directaContratos,
      volumen: directaVolumen,
      gastoAdjudicado: directaGasto,
      pctVolumen: totalVolDesglose > 0 ? Math.round((directaVolumen / totalVolDesglose) * 1000) / 10 : 0,
      pctGasto: totalGastoDesglose > 0 ? Math.round((directaGasto / totalGastoDesglose) * 1000) / 10 : 0,
    },
    mancomunidad: {
      contratos: mancomunidadContratos,
      volumen: mancomunidadVolumen,
      gastoAdjudicado: mancomunidadGasto,
      pctVolumen: totalVolDesglose > 0 ? Math.round((mancomunidadVolumen / totalVolDesglose) * 1000) / 10 : 0,
      pctGasto: totalGastoDesglose > 0 ? Math.round((mancomunidadGasto / totalGastoDesglose) * 1000) / 10 : 0,
    },
  };

  // Por Tipo
  const porTipo = db.prepare(`
    WITH stats_source AS (
      SELECT
        l.*,
        CASE
          WHEN NOT ${terminalContractStatusSql('l')}
            AND ${contractAwardAmountEligible('l')}
          THEN ${lotAwardedAmount('l')}
          ELSE 0
        END as flow_awarded
      FROM contracts l
      ${wherePlain}
    )
    SELECT
      coalesce(contract_type, 'Otros') as tipo,
      count(*) as contratos,
      round(sum(flow_awarded), 2) as volumen
    FROM stats_source
    GROUP BY contract_type
    ORDER BY volumen DESC;
  `).all(...params) as any[];

  // Por Procedimiento
  const porProcedimiento = db.prepare(`
    WITH stats_source AS (
      SELECT
        l.*,
        CASE
          WHEN NOT ${terminalContractStatusSql('l')}
            AND ${contractAwardAmountEligible('l')}
          THEN ${lotAwardedAmount('l')}
          ELSE 0
        END as flow_awarded
      FROM contracts l
      ${wherePlain}
    )
    SELECT
      coalesce(procedure, 'Otros') as procedimiento,
      count(*) as contratos,
      round(sum(flow_awarded), 2) as volumen
    FROM stats_source
    GROUP BY procedure
    ORDER BY contratos DESC
    LIMIT 7;
  `).all(...params) as any[];

  // Top Empresas por Volumen (Consolidado)
  const topEmpresasVolumenRaw = db.prepare(`
    SELECT 
      coalesce(r.canonical_name, max(l.awardee)) as awardee,
      coalesce(r.canonical_nif, max(nullif(l.awardee_nif, '')), '') as nif,
      coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee) as canonical_id,
      count(DISTINCT l.id) as contratos,
      round(sum(CASE WHEN l.economic_nature = 'gasto' AND NOT ${terminalContractStatusSql('l')} AND ${companyAwardAmountEligible} THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as gasto_adjudicado,
      round(sum(CASE WHEN l.economic_nature = 'ingreso' AND NOT ${terminalContractStatusSql('l')} AND ${companyAwardAmountEligible} THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as ingresos_adjudicados,
      round(sum(CASE WHEN NOT ${terminalContractStatusSql('l')} AND ${companyAwardAmountEligible} THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen,
      max(r.group_name) as group_name,
      max(r.link_type) as link_type
    FROM ${corporateContractSource} l
    LEFT JOIN company_resolution r 
      ON coalesce(l.awardee_nif, '') = r.raw_nif 
     AND coalesce(l.awardee, '') = r.raw_name
    WHERE l.awardee IS NOT NULL AND l.awardee != '' ${andL}
    GROUP BY coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee)
    ORDER BY gasto_adjudicado DESC
    LIMIT 10;
  `).all(...params) as any[];

  const topEmpresasVolumen = topEmpresasVolumenRaw.map(r => ({
    awardee: r.awardee,
    nif: r.nif,
    id: r.canonical_id ? (isPersonaFisicaNif(r.canonical_id) ? getOpaqueEmpresaId(r.canonical_id, r.awardee) : r.canonical_id) : getOpaqueEmpresaId(r.nif, r.awardee),
    contratos: r.contratos,
    volumen: r.volumen,
    gasto_adjudicado: r.gasto_adjudicado,
    ingresos_adjudicados: r.ingresos_adjudicados,
    grupo: r.group_name,
    tipoVinculo: r.link_type,
  }));

  // Top Empresas por Contratos (Consolidado)
  const topEmpresasContratosRaw = db.prepare(`
    SELECT 
      coalesce(r.canonical_name, max(l.awardee)) as awardee,
      coalesce(r.canonical_nif, max(nullif(l.awardee_nif, '')), '') as nif,
      coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee) as canonical_id,
      count(DISTINCT l.id) as contratos,
      round(sum(CASE WHEN l.economic_nature = 'gasto' AND NOT ${terminalContractStatusSql('l')} AND ${companyAwardAmountEligible} THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as gasto_adjudicado,
      round(sum(CASE WHEN l.economic_nature = 'ingreso' AND NOT ${terminalContractStatusSql('l')} AND ${companyAwardAmountEligible} THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as ingresos_adjudicados,
      round(sum(CASE WHEN NOT ${terminalContractStatusSql('l')} AND ${companyAwardAmountEligible} THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen,
      max(r.group_name) as group_name,
      max(r.link_type) as link_type
    FROM ${corporateContractSource} l
    LEFT JOIN company_resolution r 
      ON coalesce(l.awardee_nif, '') = r.raw_nif 
     AND coalesce(l.awardee, '') = r.raw_name
    WHERE l.awardee IS NOT NULL AND l.awardee != '' ${andL}
    GROUP BY coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee)
    ORDER BY contratos DESC
    LIMIT 10;
  `).all(...params) as any[];

  const topEmpresasContratos = topEmpresasContratosRaw.map(r => ({
    awardee: r.awardee,
    nif: r.nif,
    id: r.canonical_id ? (isPersonaFisicaNif(r.canonical_id) ? getOpaqueEmpresaId(r.canonical_id, r.awardee) : r.canonical_id) : getOpaqueEmpresaId(r.nif, r.awardee),
    contratos: r.contratos,
    volumen: r.volumen,
    gasto_adjudicado: r.gasto_adjudicado,
    ingresos_adjudicados: r.ingresos_adjudicados,
    grupo: r.group_name,
    tipoVinculo: r.link_type,
  }));

  // Top Organismos
  const topOrganismos = db.prepare(`
    WITH stats_source AS (
      SELECT
        l.*,
        coalesce(nullif(trim(l.contracting_authority_id), ''), 'unlinked-contract:' || l.id) as authority_key,
        CASE
          WHEN NOT ${terminalContractStatusSql('l')}
            AND ${contractAwardAmountEligible('l')}
          THEN ${lotAwardedAmount('l')}
          ELSE 0
        END as flow_awarded
      FROM contracts l
      ${whereL}
    )
    SELECT
      max(l.contracting_authority_id) as authorityId,
      coalesce(max(ca.name), max(l.contracting_authority_name)) as organo,
      coalesce(max(ca.name), max(l.contracting_authority_name)) as name,
      max(coalesce(ca.placsp_id, '')) as placsp_id,
      max(l.scope) as scope,
      count(DISTINCT l.id) as contratos,
      round(sum(CASE WHEN l.economic_nature = 'gasto' THEN l.flow_awarded ELSE 0 END), 2) as gasto_adjudicado,
      round(sum(CASE WHEN l.economic_nature = 'ingreso' THEN l.flow_awarded ELSE 0 END), 2) as ingresos_adjudicados,
      round(sum(l.flow_awarded), 2) as volumen
    FROM stats_source l
    LEFT JOIN contracting_authorities ca ON l.contracting_authority_id = ca.id
    GROUP BY l.authority_key
    ORDER BY gasto_adjudicado DESC
    LIMIT 10;
  `).all(...params) as any[];

  // Últimas Licitaciones
  const ultimasLicitaciones = db.prepare(`
    SELECT *
    FROM contracts
    ${wherePlain}
    ORDER BY coalesce(publication_date, award_date) DESC
    LIMIT 8;
  `).all(...params) as any[];

  const concurrencia = getConcurrenciaStats(year, scope);
  const menoresRecurrentes = getMenoresRecurrentes(year, undefined, scope);
  const tiempos = getTiemposStats(year, scope);
  const redFlags = getRedFlagsStats(year, scope);
  const { casos: fraccionamiento, totalCasos: fraccionamientoTotal } = getFraccionamientoMenores(undefined, year, scope);
  const concentracion = getConcentracionStats(year, scope);
  const flujo = getFlujoStats(year, scope);
  const contratosVivos = getContratosVivosStats(getDb, scope);
  const renovacionMercado = getRenovacionMercadoStats(year, scope);
  const calendarioElectoral = getCalendarioElectoralStats(scope);
  const lotes = getLotesStats(year, scope);
  const bajasTemerarias = getBajaTemerariaStats(year, scope);
  const modificados = getModificadosStats(year, scope);
  const duracionEfectiva = getDuracionEfectivaStats(year, scope);
  const empresasLocales = getEmpresasLocalesStats(year, scope);

  let syncMetaRow: { value: string } | undefined;
  try {
    syncMetaRow = db.prepare("SELECT value FROM metadata WHERE key = 'ultima_sincronizacion'").get() as { value: string } | undefined;
  } catch {
    // metadata table might not exist in old test db
  }

  return toPlain({
    totalLicitaciones: totals?.total_licitaciones || 0,
    totalImporte: totals?.total_importe || 0,
    gastoAdjudicado: totals?.gasto_adjudicado || 0,
    ingresosAdjudicados: totals?.ingresos_adjudicados || 0,
    concesionesAdjudicadas: totals?.concesiones_adjudicadas || 0,
    gastoEnCurso: totals?.gasto_en_curso || 0,
    gastoDesierto: totals?.gasto_desierto || 0,
    ingresosDesiertos: totals?.ingresos_desiertos || 0,
    concesionesDesiertas: totals?.concesiones_desiertas || 0,
    totalOrganismos: totals?.total_organismos || 0,
    totalEmpresas: totalEmpresasRow?.total_empresas || 0,
    ahorroMedioPct: ahorroRow?.ahorro_medio || 12.4,
    ultimaActualizacion: totals?.ultima_fecha || '2026-09-01',
    ultimaSincronizacion: syncMetaRow?.value || null,
    ultimaLicitacion: totals?.ultima_fecha || '2026-09-01',
    evolucionAnual,
    porTipo,
    porProcedimiento,
    topEmpresasVolumen,
    topEmpresasContratos,
    topOrganismos,
    ultimasLicitaciones,
    concurrencia,
    menoresRecurrentes,
    tiempos,
    redFlags,
    fraccionamiento,
    fraccionamientoTotal,
    concentracion,
    flujo,
    contratosVivos,
    renovacionMercado,
    calendarioElectoral,
    lotes,
    bajasTemerarias,
    modificados,
    duracionEfectiva,
    empresasLocales,
    desgloseAmbito,
    anoSeleccionado: filterByAno ? anoNum : null,
    ambitoSeleccionado: filterScope || null,
  });
}

export interface FilterOptions {
  q?: string;
  organo?: string;
  awardee?: string;
  adjudicatario?: string;
  nif?: string;
  year?: number | string;
  tipo?: string;
  procedure?: string;
  procedimiento?: string;
  status?: string;
  estado?: string;
  scope?: string;
  flujoEconomico?: 'paga' | 'recibe' | 'sin_flujo_directo' | 'no_determinado' | string;
  minImporte?: number;
  maxImporte?: number;
  ofertaUnica?: boolean;
  bajaCero?: boolean;
  alertaMenor?: boolean;
  fondosUe?: boolean;
  conAlertas?: boolean;
  conProrroga?: boolean;
  conModificaciones?: boolean;
  sort?: 'reciente' | 'antiguo' | 'mayor_importe' | 'menor_importe' | 'mas_ofertas';
  page?: number;
  limit?: number;
}

export function getLicitaciones(opts: FilterOptions = {}) {
  const db = getDb();
  const page = Math.max(1, Number(opts.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(opts.limit) || 15));
  const offset = (page - 1) * limit;

  const conditions: string[] = ['1=1'];
  const params: any[] = [];

  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());

  const lotAwardsAmountCovered = hasLotAwardsTable
    ? lotAwardsAmountCoverageSql('contracts')
    : '0';

  const lotAwardsAwardeeCovered = hasLotAwardsTable
    ? `(
        NOT EXISTS (
          SELECT 1
          FROM contract_lots lot
          WHERE lot.contract_id = contracts.id
            AND lot.awardee IS NOT NULL
            AND trim(lot.awardee) <> ''
            AND ${eligibleAwardLotStatusSql('lot')}
        )
        OR NOT EXISTS (
            SELECT 1
            FROM contract_lots lot
            WHERE lot.contract_id = contracts.id
              AND lot.awardee IS NOT NULL
              AND trim(lot.awardee) <> ''
              AND ${eligibleAwardLotStatusSql('lot')}
              AND NOT EXISTS (
                SELECT 1
                FROM lot_awards award
                WHERE award.contract_id = contracts.id
                  AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                  AND award.lot_number = lot.lot_number
                  AND award.awardee IS NOT NULL
                  AND trim(award.awardee) <> ''
                  AND ${eligibleAwardResultStateSql('award')}
              )
          )
      )`
    : '0';
  const lotAwardsOfferCountCovered = hasLotAwardsTable
    ? `(
        NOT EXISTS (
          SELECT 1
          FROM contract_lots lot
          WHERE lot.contract_id = contracts.id
            AND lot.offer_count IS NOT NULL
            AND ${eligibleAwardLotStatusSql('lot')}
        )
        OR NOT EXISTS (
            SELECT 1
            FROM contract_lots lot
            WHERE lot.contract_id = contracts.id
              AND lot.offer_count IS NOT NULL
              AND ${eligibleAwardLotStatusSql('lot')}
              AND NOT EXISTS (
                SELECT 1
                FROM lot_awards award
                WHERE award.contract_id = contracts.id
                  AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                  AND award.lot_number = lot.lot_number
                  AND award.offer_count IS NOT NULL
                  AND ${eligibleAwardResultStateSql('award')}
              )
          )
      )`
    : '0';
  const lotAwareAwardedAmount = hasLotAwardsTable
    ? `CASE
        WHEN award_amount_type IS NULL OR award_amount_type = 'total'
        THEN CASE
          WHEN ${lotAwardsAmountCovered} AND EXISTS (
            SELECT 1 FROM lot_awards award
            WHERE award.contract_id = contracts.id
                  AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
              AND award.awarded_amount IS NOT NULL
              AND ${eligibleAwardResultStateSql('award')}
          )
          THEN (
            SELECT round(sum(award.awarded_amount), 2)
            FROM lot_awards award
            WHERE award.contract_id = contracts.id
                  AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
              AND award.awarded_amount IS NOT NULL
              AND ${eligibleAwardResultStateSql('award')}
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
      END`
    : `CASE
        WHEN award_amount_type IS NULL OR award_amount_type = 'total'
        THEN CASE
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
          ELSE awarded_amount
        END
        ELSE NULL
      END`;

  // Zero-discount detection may use validated per-lot awards even when the
  // parent aggregate type is unknown. Never fall back to the parent amount in
  // that case, and keep unitary amounts excluded.
  const lotAwareBajaCeroAwardedAmount = `CASE
    WHEN award_amount_type IS NULL OR award_amount_type = 'total'
      THEN ${lotAwareAwardedAmount}
    WHEN award_amount_type = 'desconocido'
      AND ${lotAwardsAmountCovered}
      AND EXISTS (
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
    ELSE NULL
  END`;

  const lotAwarePbl = `CASE
    WHEN EXISTS (
      SELECT 1
      FROM contract_lots lot
      WHERE lot.contract_id = contracts.id
        AND lot.awarded_amount IS NOT NULL
        AND lot.budget_excl_vat IS NOT NULL
        AND ${eligibleAwardLotStatusSql('lot')}
    )${hasLotAwardsTable ? ` OR EXISTS (
      SELECT 1
      FROM lot_awards award
      WHERE award.contract_id = contracts.id
                  AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
        AND award.awarded_amount IS NOT NULL
        AND ${eligibleAwardResultStateSql('award')}
    )` : ''}
    THEN (
      SELECT round(sum(lot.budget_excl_vat), 2)
      FROM contract_lots lot
      WHERE lot.contract_id = contracts.id
        AND lot.budget_excl_vat IS NOT NULL
        AND ${eligibleAwardLotStatusSql('lot')}
        AND (
          lot.awarded_amount IS NOT NULL${hasLotAwardsTable ? ` OR EXISTS (
            SELECT 1
            FROM lot_awards award
            WHERE award.contract_id = lot.contract_id
                  AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
              AND award.lot_number = lot.lot_number
              AND award.awarded_amount IS NOT NULL
              AND ${eligibleAwardResultStateSql('award')}
          )` : ''}
        )
    )
    ELSE amount_excl_vat
  END`;

  // Full-Text Search
  if (opts.q && opts.q.trim()) {
    const term = opts.q.trim();
    conditions.push(`(
      id IN (SELECT id FROM contracts_fts WHERE contracts_fts MATCH ?)
      OR object_description LIKE ?
      OR case_number LIKE ?
      OR awardee LIKE ?
      OR contracting_authority_name LIKE ?
      OR EXISTS (
        SELECT 1
        FROM contract_lots lot
        WHERE lot.contract_id = contracts.id
          AND (lot.awardee LIKE ? OR lot.awardee_nif LIKE ?)
      )
    )`);
    const ftsTerm = term.replace(/["*]/g, '') + '*';
    const likeTerm = `%${term}%`;
    params.push(ftsTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
  }

  if (opts.organo) {
    const authorityExists = db.prepare('SELECT 1 FROM contracting_authorities WHERE id = ? AND active = 1').get(opts.organo);
    conditions.push(authorityExists ? `contracting_authority_id = ?` : `contracting_authority_name = ?`);
    params.push(opts.organo);
  }

  if (opts.awardee) {
    conditions.push(`(
      awardee = ?
      OR EXISTS (
        SELECT 1
        FROM contract_lots lot
        WHERE lot.contract_id = contracts.id
          AND ${eligibleAwardLotStatusSql('lot')}
          AND ${hasLotAwardsTable ? excludeLegacyLotWhenStructuredTerminalResultSql('lot') : '1'}
          AND lot.awardee = ?
      )
      OR (${lotAwardsAwardeeCovered} AND EXISTS (
        SELECT 1
        FROM lot_awards award
        WHERE award.contract_id = contracts.id
                  AND ${eligibleAwardResultStateSql('award')}
                  AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          AND award.awardee = ?
      ))
    )`);
    params.push(opts.awardee, opts.awardee, opts.awardee);
  }

  if (opts.nif) {
    conditions.push(`(
      awardee_nif = ?
      OR EXISTS (
        SELECT 1
        FROM contract_lots lot
        WHERE lot.contract_id = contracts.id
          AND ${eligibleAwardLotStatusSql('lot')}
          AND ${hasLotAwardsTable ? excludeLegacyLotWhenStructuredTerminalResultSql('lot') : '1'}
          AND lot.awardee_nif = ?
      )
      OR (${lotAwardsAwardeeCovered} AND EXISTS (
        SELECT 1
        FROM lot_awards award
        WHERE award.contract_id = contracts.id
                  AND ${eligibleAwardResultStateSql('award')}
                  AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          AND award.awardee_nif = ?
      ))
    )`);
    params.push(opts.nif, opts.nif, opts.nif);
  }

  if (opts.year && opts.year !== 'todos') {
    conditions.push(`year = ?`);
    params.push(Number(opts.year));
  }

  if (opts.tipo && opts.tipo !== 'todos') {
    conditions.push(`contract_type = ?`);
    params.push(opts.tipo);
  }

  if (opts.procedimiento && opts.procedimiento !== 'todos') {
    if (opts.procedimiento === 'Contrato menor' || opts.procedimiento === 'Menor') {
      conditions.push(`procedure IN ('Contrato menor', 'Menor')`);
    } else {
      conditions.push(`procedimiento = ?`);
      params.push(opts.procedimiento);
    }
  }

  if (opts.status && opts.status !== 'todos') {
    conditions.push(`status = ?`);
    params.push(opts.status);
  }

  if (opts.scope && opts.scope !== 'todos') {
    const parsedScope = parseScope(opts.scope) || opts.scope;
    conditions.push(`scope = ?`);
    params.push(parsedScope);
  }

  if (opts.flujoEconomico && opts.flujoEconomico !== 'todos') {
    const naturalezaPorFlujo: Record<string, string> = { paga: 'gasto', recibe: 'ingreso', sin_flujo_directo: 'concesion', no_determinado: 'sin_clasificar' };
    const naturaleza = naturalezaPorFlujo[opts.flujoEconomico];
    if (naturaleza) { conditions.push(`economic_nature = ?`); params.push(naturaleza); }
  }

  if (opts.minImporte !== undefined && !isNaN(Number(opts.minImporte))) {
    conditions.push(`(award_amount_type IS NULL OR award_amount_type = 'total') AND (${lotAwareAwardedAmount} IS NOT NULL OR ${terminalContractStatusSql('contracts')} OR (award_date IS NULL AND (awardee IS NULL OR trim(awardee) = '') AND lower(coalesce(status, '')) NOT LIKE '%adjudic%' AND lower(coalesce(status, '')) NOT LIKE '%formaliz%' AND NOT ${resolvedContractStatusSql('contracts')}) OR (${resolvedContractStatusSql('contracts')} AND award_date IS NULL AND (awardee IS NULL OR trim(awardee) = ''))) AND coalesce(${lotAwareAwardedAmount}, amount_excl_vat) >= ?`);
    params.push(Number(opts.minImporte));
  }

  if (opts.maxImporte !== undefined && !isNaN(Number(opts.maxImporte))) {
    conditions.push(`(award_amount_type IS NULL OR award_amount_type = 'total') AND (${lotAwareAwardedAmount} IS NOT NULL OR ${terminalContractStatusSql('contracts')} OR (award_date IS NULL AND (awardee IS NULL OR trim(awardee) = '') AND lower(coalesce(status, '')) NOT LIKE '%adjudic%' AND lower(coalesce(status, '')) NOT LIKE '%formaliz%' AND NOT ${resolvedContractStatusSql('contracts')}) OR (${resolvedContractStatusSql('contracts')} AND award_date IS NULL AND (awardee IS NULL OR trim(awardee) = ''))) AND coalesce(${lotAwareAwardedAmount}, amount_excl_vat) <= ?`);
    params.push(Number(opts.maxImporte));
  }

  if (opts.ofertaUnica) {
    conditions.push(`(
      (
        offer_count = 1
        AND awardee IS NOT NULL
        AND trim(awardee) != ''
        AND awardee != 'Sin awardee'
      )
      OR EXISTS (
        SELECT 1
        FROM contract_lots lot
        WHERE lot.contract_id = contracts.id
          AND lot.offer_count = 1
          AND lot.awardee IS NOT NULL
          AND trim(lot.awardee) != ''
          AND ${eligibleAwardLotStatusSql('lot')}
          AND ${hasLotAwardsTable ? excludeLegacyLotWhenStructuredTerminalResultSql('lot') : '1'}
      )
      OR (${lotAwardsOfferCountCovered} AND EXISTS (
        SELECT 1
        FROM lot_awards award
        WHERE award.contract_id = contracts.id
                  AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          AND award.offer_count = 1
          AND award.awardee IS NOT NULL
          AND trim(award.awardee) != ''
          AND ${eligibleAwardResultStateSql('award')}
      ))
    )
    AND NOT ${terminalContractStatusSql('contracts')}
    AND procedure NOT IN ('Contrato menor', 'Menor')`);
  }

  if (opts.bajaCero) {
    conditions.push(`${lotAwarePbl} > 0 AND ${lotAwareBajaCeroAwardedAmount} IS NOT NULL AND abs(${lotAwareBajaCeroAwardedAmount} - ${lotAwarePbl}) <= 0.05 AND (
      (awardee IS NOT NULL AND trim(awardee) != '' AND awardee != 'Sin awardee')
      OR EXISTS (
        SELECT 1
        FROM contract_lots lot
        WHERE lot.contract_id = contracts.id
          AND lot.awardee IS NOT NULL
          AND trim(lot.awardee) != ''
          AND ${eligibleAwardLotStatusSql('lot')}
          AND ${hasLotAwardsTable ? excludeLegacyLotWhenStructuredTerminalResultSql('lot') : '1'}
      )
      OR (${lotAwardsAwardeeCovered} AND EXISTS (
        SELECT 1
        FROM lot_awards award
        WHERE award.contract_id = contracts.id
                  AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          AND award.awardee IS NOT NULL
          AND trim(award.awardee) != ''
          AND ${eligibleAwardResultStateSql('award')}
      ))
    )
    AND NOT ${terminalContractStatusSql('contracts')} AND procedure NOT IN ('Contrato menor', 'Menor')`);
  }

  if (opts.alertaMenor) {
    conditions.push(`(dataset IN ('menores', 'contratos_menores') OR procedure IN ('Contrato menor', 'Menor')) AND (
      estimated_value IS NOT NULL AND (
      (lower(contract_type) LIKE '%obra%' AND estimated_value >= 36000 AND estimated_value < 40000)
      OR
      (lower(contract_type) NOT LIKE '%obra%' AND estimated_value >= 13500 AND estimated_value < 15000)
    )
    )`);
  }

  if (opts.fondosUe) {
    conditions.push(`(eu_funding = '1' OR object_description LIKE '%PRTR%' OR object_description LIKE '%NextGeneration%' OR object_description LIKE '%FEDER%' OR object_description LIKE '%FSE%' OR object_description LIKE '%fondos europeos%')`);
  }

  if (opts.conAlertas) {
    conditions.push(`(
      (
        (
          offer_count = 1
          OR EXISTS (
            SELECT 1
            FROM contract_lots lot
            WHERE lot.contract_id = contracts.id
              AND lot.offer_count = 1
              AND lot.awardee IS NOT NULL
              AND trim(lot.awardee) <> ''
              AND ${eligibleAwardLotStatusSql('lot')}
              AND ${hasLotAwardsTable ? excludeLegacyLotWhenStructuredTerminalResultSql('lot') : '1'}
          )
          OR (${lotAwardsOfferCountCovered} AND EXISTS (
            SELECT 1
            FROM lot_awards award
            WHERE award.contract_id = contracts.id
                  AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
              AND award.offer_count = 1
              AND award.awardee IS NOT NULL
              AND trim(award.awardee) <> ''
              AND ${eligibleAwardResultStateSql('award')}
          ))
        )
        AND procedure NOT IN ('Contrato menor', 'Menor')
      )
      OR
      (${lotAwarePbl} > 0 AND ${lotAwareAwardedAmount} IS NOT NULL AND abs(${lotAwareAwardedAmount} - ${lotAwarePbl}) <= 0.05 AND procedure NOT IN ('Contrato menor', 'Menor'))
      OR
      ((dataset IN ('menores', 'contratos_menores') OR procedure IN ('Contrato menor', 'Menor')) AND (
        (lower(contract_type) LIKE '%obra%' AND estimated_value >= 36000 AND estimated_value < 40000)
        OR
        (lower(contract_type) NOT LIKE '%obra%' AND estimated_value >= 13500 AND estimated_value < 15000)
      ))
    )`);
  }

  if (opts.conProrroga) {
    conditions.push(`id IN (SELECT DISTINCT contract_id FROM modifications WHERE duration_days > 0 OR duration_value > 0)`);
  }

  if (opts.conModificaciones) {
    conditions.push(`id IN (SELECT DISTINCT contract_id FROM modifications)`);
  }

  const whereClause = conditions.join(' AND ');

  // Sorting
  let orderClause = 'ORDER BY coalesce(publication_date, award_date) DESC';
  switch (opts.sort) {
    case 'antiguo':
      orderClause = 'ORDER BY coalesce(publication_date, award_date) ASC';
      break;
    case 'mayor_importe':
      orderClause = `ORDER BY CASE WHEN ${lotAwareAwardedAmount} IS NOT NULL THEN ${lotAwareAwardedAmount} WHEN ${terminalContractStatusSql('contracts')} OR (award_date IS NULL AND (awardee IS NULL OR trim(awardee) = '') AND lower(coalesce(status, '')) NOT LIKE '%adjudic%' AND lower(coalesce(status, '')) NOT LIKE '%formaliz%' AND NOT ${resolvedContractStatusSql('contracts')}) OR (${resolvedContractStatusSql('contracts')} AND award_date IS NULL AND (awardee IS NULL OR trim(awardee) = '')) THEN amount_excl_vat ELSE NULL END DESC NULLS LAST`;
      break;
    case 'menor_importe':
      orderClause = `ORDER BY CASE WHEN ${lotAwareAwardedAmount} IS NOT NULL THEN ${lotAwareAwardedAmount} WHEN ${terminalContractStatusSql('contracts')} OR (award_date IS NULL AND (awardee IS NULL OR trim(awardee) = '') AND lower(coalesce(status, '')) NOT LIKE '%adjudic%' AND lower(coalesce(status, '')) NOT LIKE '%formaliz%' AND NOT ${resolvedContractStatusSql('contracts')}) OR (${resolvedContractStatusSql('contracts')} AND award_date IS NULL AND (awardee IS NULL OR trim(awardee) = '')) THEN amount_excl_vat ELSE NULL END ASC NULLS LAST`;
      break;
    case 'mas_ofertas':
      orderClause = 'ORDER BY offer_count DESC NULLS LAST';
      break;
    default:
      orderClause = 'ORDER BY coalesce(publication_date, award_date) DESC';
  }

  const countSql = `SELECT count(*) as total FROM contracts WHERE ${whereClause};`;
  const countResult = db.prepare(countSql).get(...params) as any;
  const total = countResult?.total || 0;

  const dataSql = `
    SELECT 
      contracts.*,
      CASE contracts.economic_nature
        WHEN 'gasto' THEN 'paga'
        WHEN 'ingreso' THEN 'recibe'
        WHEN 'concesion' THEN 'sin_flujo_directo'
        ELSE 'no_determinado'
      END as flujo_economico,
      (SELECT COUNT(*) FROM modifications m WHERE m.contract_id = contracts.id) as num_modificaciones,
      (SELECT SUM(coalesce(m.duration_days, 0)) FROM modifications m WHERE m.contract_id = contracts.id) as mod_prorroga_dias,
      (SELECT SUM(coalesce(m.duration_months, 0)) FROM modifications m WHERE m.contract_id = contracts.id) as mod_prorroga_meses,
      (SELECT SUM(coalesce(m.modification_amount, 0)) FROM modifications m WHERE m.contract_id = contracts.id) as mod_sobrecoste_importe
    FROM contracts
    WHERE ${whereClause} 
    ${orderClause} 
    LIMIT ? OFFSET ?;
  `;
  const data = db.prepare(dataSql).all(...params, limit, offset) as Licitacion[];

  return toPlain({
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

export function getLicitacionById(id: string) {
  const db = getDb();
  const trimmed = id.trim();
  // 1. Coincidencia exacta
  let licitacion = db.prepare(`SELECT * FROM contracts WHERE id = ? LIMIT 1`).get(trimmed) as Licitacion | undefined;
  
  // 2. Compatibilidad con URLs antiguas: resolver por identificador PLACSP
  // solo cuando el identificador de origen es inequívoco.
  if (!licitacion) {
    const candidates = db.prepare(`SELECT * FROM contracts WHERE placsp_id = ? OR placsp_id LIKE '%/' || ?`).all(trimmed, trimmed) as Licitacion[];
    if (candidates.length === 1) licitacion = candidates[0];
  }

  // 3. Compatibilidad con identificadores históricos verificados.
  // Algunas URLs antiguas usan el identificador de expediente histórico,
  // mientras que el contrato canónico conserva el identificador de licitación.
  if (!licitacion) {
    const metadataTable = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'verified_contract_metadata' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'verified_contract_metadata' LIMIT 1"
    ).get();
    if (metadataTable) {
      const verifiedAlias = db.prepare(
        'SELECT contract_id FROM verified_contract_metadata WHERE legacy_id = ? LIMIT 1'
      ).get(trimmed) as { contract_id?: string } | undefined;
      if (verifiedAlias?.contract_id) {
        licitacion = db.prepare('SELECT * FROM contracts WHERE id = ? LIMIT 1').get(verifiedAlias.contract_id) as Licitacion | undefined;
      }
    }
  }

  // 4. Fallback por case_number.
  // La identidad lógica canónica es (case_number, contracting_authority_id), por lo
  // que un expediente compartido entre organismos no se puede resolver de forma segura
  // sin conocer también el organismo. Solo aceptamos una coincidencia inequívoca.
  if (!licitacion) {
    const normalizedCaseNumber = normalizeIdentityPart(trimmed);
    const caseCandidates = db.prepare(`SELECT * FROM contracts WHERE case_number IS NOT NULL`).all() as Licitacion[];
    const matches = caseCandidates.filter(
      (candidate) => normalizeIdentityPart(candidate.case_number) === normalizedCaseNumber
    );
    if (matches.length === 1) licitacion = matches[0];
  }
  if (!licitacion) return null;

  const relacionadas = licitacion.contracting_authority_id
    ? db.prepare(`
      SELECT id, case_number, object_description, awarded_amount, award_amount_type, status, publication_date
      FROM contracts
      WHERE contracting_authority_id = ? AND id != ?
      ORDER BY coalesce(publication_date, award_date) DESC
      LIMIT 4;
    `).all(licitacion.contracting_authority_id, licitacion.id) as any[]
    : [];

  // 1. Otros contratos de la misma empresa adjudicataria
  let relacionadasEmpresa: any[] = [];
  let statsEmpresa: { totalContratos: number; volumenTotal: number } | null = null;

  if (licitacion.awardee) {
    const paramsEmpresa = [licitacion.id];
    let whereEmpresa = '';
    if (licitacion.awardee_nif) {
      whereEmpresa = `((awardee_nif IS NOT NULL AND awardee_nif = ?) OR awardee = ?) AND id != ?`;
      paramsEmpresa.unshift(licitacion.awardee);
      paramsEmpresa.unshift(licitacion.awardee_nif);
    } else {
      whereEmpresa = `awardee = ? AND id != ?`;
      paramsEmpresa.unshift(licitacion.awardee);
    }

    relacionadasEmpresa = db.prepare(`
      SELECT id, case_number, object_description, contracting_authority_name, awarded_amount, award_amount_type, status, award_date, year, offer_count
      FROM contracts
      WHERE ${whereEmpresa}
      ORDER BY coalesce(award_date, publication_date) DESC
      LIMIT 6;
    `).all(...paramsEmpresa) as any[];

    const whereStats = licitacion.awardee_nif ? '((awardee_nif IS NOT NULL AND awardee_nif = ?) OR awardee = ?)' : 'awardee = ?';
    const paramsStats = licitacion.awardee_nif ? [licitacion.awardee_nif, licitacion.awardee] : [licitacion.awardee];
    const sEmp = db.prepare(`
      SELECT count(*) as total, round(sum(CASE WHEN NOT ${terminalContractStatusSql('')} AND (award_amount_type IS NULL OR award_amount_type = 'total') THEN coalesce(awarded_amount, 0) ELSE 0 END), 2) as volumen
      FROM contracts
      WHERE ${whereStats};
    `).get(...paramsStats) as any;

    if (sEmp) {
      statsEmpresa = {
        totalContratos: sEmp.total || 0,
        volumenTotal: sEmp.volumen || 0,
      };
    }
  }

  // For multi-winner lot contracts, build per-lot empresa info and suppress the broken single-company data.
  // This is populated after lotesDesglose is available (see below), but we declare the variable here.
  let lotesAdjudicatariosInfo: Array<{
    awardee: string;
    nifAdjudicatario: string | null;
    empresaId: string;
    numeroLote: string | null;
    nombreLote: string | null;
    relacionadas: any[];
    stats: { totalContratos: number; volumenTotal: number } | null;
  }> | null = null;

  // 2. Otros contratos en el mismo sector / CPV
  let relacionadasCpv: any[] = [];
  if (licitacion.primary_cpv && licitacion.primary_cpv.trim().length >= 4) {
    const cpvPrefix = licitacion.primary_cpv.trim().slice(0, 4);
    relacionadasCpv = db.prepare(`
      SELECT id, case_number, object_description, contracting_authority_name, awardee, awarded_amount, award_amount_type, status, award_date, offer_count, primary_cpv
      FROM contracts
      WHERE primary_cpv LIKE ? AND id != ?
      ORDER BY coalesce(award_date, publication_date) DESC
      LIMIT 6;
    `).all(`${cpvPrefix}%`, licitacion.id) as any[];
  }

  let diasResolucion: number | null = null;
  if (licitacion.deadline_date && licitacion.award_date) {
    const dLim = new Date(licitacion.deadline_date).getTime();
    const dAdj = new Date(licitacion.award_date).getTime();
    if (!isNaN(dLim) && !isNaN(dAdj) && dAdj >= dLim) {
      diasResolucion = Math.round((dAdj - dLim) / (1000 * 60 * 60 * 24));
    }
  }

  const adjudicatarioInfo = licitacion.awardee 
    ? resolveEntityFromDb(db, licitacion.awardee_nif, licitacion.awardee)
    : null;

  // Modificaciones contractuales registradas (Art. 203-207 LCSP)
  // Modifications are linked canonically by contract_id. Do not fall back to
  // case_number alone because the same expediente may exist under another authority.
  const modsRows = (db.prepare(`
    SELECT * FROM modifications
    WHERE contract_id = ?
    ORDER BY modification_number ASC, modification_date ASC
  `).all(licitacion.id) || []) as any[];

  const modifications = modsRows.map(m => ({
    id: m.id,
    numero: m.modification_number,
    document_date: m.modification_date,
    reason: m.reason,
    tipo: m.modification_type,
    duracionValor: m.duration_value,
    duracionUnidad: m.duration_unit,
    duracionMeses: m.duration_months,
    duracionDias: m.duration_days,
    amount: m.modification_amount,
    importeFinal: m.final_amount,
    documentoUrl: m.document_url,
    documentoNombre: m.document_name
  }));

  const totalModificadosImporte = modifications.reduce((acc, m) => acc + (m.amount || 0), 0);
  const totalModificadosPlazoDias = modifications.reduce((acc, m) => acc + (m.duracionDias || 0), 0);
  const totalModificadosPlazoMeses = modifications.reduce((acc, m) => acc + (m.duracionMeses || 0), 0);

  const modificadosInfo = {
    tieneModificaciones: modifications.length > 0,
    totalModificaciones: modifications.length,
    totalModificadosImporte,
    totalModificadosPlazoDias,
    totalModificadosPlazoMeses,
    modifications
  };

  let fechaFinExplicitaModificacion: string | null = null;
  const metadataTable = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'verified_contract_metadata' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'verified_contract_metadata' LIMIT 1"
  ).get();
  if (metadataTable) {
    const verifiedMetadata = db.prepare(
      'SELECT explicit_end_date FROM verified_contract_metadata WHERE contract_id = ? LIMIT 1'
    ).get(licitacion.id) as { explicit_end_date?: string | null } | undefined;
    fechaFinExplicitaModificacion = verifiedMetadata?.explicit_end_date || null;
  }
  if (!fechaFinExplicitaModificacion) {
    const motivosModificacionVigencia = db.prepare(`
      SELECT reason, modification_date, modification_number
      FROM modifications
      WHERE contract_id = ?
      ORDER BY modification_date DESC, modification_number DESC
    `).all(licitacion.id) as any[];
    fechaFinExplicitaModificacion = motivosModificacionVigencia
      .map((m) => extraerFechaFinExplicita(m.reason))
      .find((document_date): document_date is string => Boolean(document_date)) || null;
  }

  const vigencia = evaluarVigenciaContrato(
    licitacion.award_date,
    licitacion.publication_date,
    licitacion.duration,
    licitacion.duration_unit,
    licitacion.contract_type,
    licitacion.procedure ?? licitacion.procedimiento,
    new Date(),
    licitacion.formalization_date,
    totalModificadosPlazoDias,
    licitacion.status,
    null,
    null,
    null,
    null,
    null,
    fechaFinExplicitaModificacion
  );

  // Lotes registrados estructurados (Art. 99 LCSP)
  let lotesDesglose: LicitacionLoteItem[] = [];
  try {
    const lotesRows = (db.prepare(`
      SELECT * FROM contract_lots
      WHERE contract_id = ?
      ORDER BY CAST(lot_number AS INTEGER) ASC, lot_number ASC
    `).all(licitacion.id) || []) as any[];

    // Sanitize false-positive lots generated from administrative resolution numbers (e.g. 27/2026)
    const cleanLotesRows = lotesRows.filter(l => {
      const numStr = String(l.lot_number || '');
      const nameStr = String(l.lot_name || '').toLowerCase();
      if (numStr.includes('/')) return false;
      if (nameStr.startsWith('primero.-') || nameStr.startsWith('al ser el único') || nameStr.startsWith('aprobar la propuesta')) return false;
      return true;
    });

    // Defensive consolidation by lot_number
    const lotMap = new Map<string, any>();
    for (const l of cleanLotesRows) {
      const key = String(l.lot_number || '').trim().toLowerCase();
      if (!lotMap.has(key)) {
        lotMap.set(key, l);
      } else {
        const existing = lotMap.get(key);
        if (!existing.awardee && l.awardee) {
          lotMap.set(key, { ...existing, ...l, budget_excl_vat: existing.budget_excl_vat || existing.amount_excl_vat });
        }
      }
    }
    const dedupedRows = Array.from(lotMap.values());

    const hasLotAwardsTable = (() => {
      try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT name FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards'").all() as Array<{ name: string }>;
        return tables.length > 0;
      } catch {
        return false;
      }
    })();

    const lotAwardsByLot = new Map<string, any[]>();
    const terminalStructuredResultsByLot = new Map<string, string>();
    if (hasLotAwardsTable) {
      const terminalRows = (db.prepare(`
        SELECT lot_number, result_state
        FROM lot_awards terminal_award
        WHERE contract_id = ?
          AND ${terminalNoAwardResultStateSql('terminal_award')}
        ORDER BY CAST(lot_number AS INTEGER) ASC, lot_number ASC, award_index ASC
      `).all(licitacion.id) || []) as any[];
      for (const row of terminalRows) {
        const key = String(row.lot_number || '').trim().toLowerCase();
        if (key && row.result_state && !terminalStructuredResultsByLot.has(key)) {
          terminalStructuredResultsByLot.set(key, String(row.result_state));
        }
      }

      const awardRows = (db.prepare(`
        SELECT lot_number, awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
               offer_count, award_date, result_state
        FROM lot_awards award
        WHERE contract_id = ?
          AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          AND ${eligibleAwardResultStateSql()}
        ORDER BY CAST(lot_number AS INTEGER) ASC, lot_number ASC, award_index ASC
      `).all(licitacion.id) || []) as any[];
      for (const award of awardRows) {
        const key = String(award.lot_number || '').trim().toLowerCase();
        const list = lotAwardsByLot.get(key) || [];
        list.push(award);
        lotAwardsByLot.set(key, list);
      }
    }

    lotesDesglose = dedupedRows.map(l => {
      const lotKey = String(l.lot_number || '').trim().toLowerCase();
      const terminalStructuredResult = terminalStructuredResultsByLot.get(lotKey);
      const hasTerminalStructuredResult = terminalStructuredResult != null;
      const awardsForLot = lotAwardsByLot.get(lotKey) || [];
      const hasCompleteAwardedAmount = awardsForLot.length > 0 &&
        awardsForLot.every((award) => award.awarded_amount != null);
      const hasCompleteAwardedAmountInclVat = awardsForLot.length > 0 &&
        awardsForLot.every((award) => award.awarded_amount_incl_vat != null);
      const lotAwardedAmount = hasCompleteAwardedAmount
        ? awardsForLot.reduce((sum, award) => sum + Number(award.awarded_amount), 0)
        : null;
      const lotAwardedAmountInclVat = hasCompleteAwardedAmountInclVat
        ? awardsForLot.reduce((sum, award) => sum + Number(award.awarded_amount_incl_vat), 0)
        : null;
      const structuredOfferCounts = new Set(
        awardsForLot
          .filter((award) => award.offer_count != null && String(award.offer_count).trim() !== '')
          .map((award) => Number(award.offer_count))
      );
      const structuredOfferCount = structuredOfferCounts.size === 1
        ? Array.from(structuredOfferCounts)[0]
        : null;
      const validStructuredOfferCount = Number.isInteger(structuredOfferCount) && Number(structuredOfferCount) >= 1
        ? Number(structuredOfferCount)
        : null;

      return {
        id: l.id,
      licitacionId: l.contract_id,
      case_number: l.case_number,
      numeroLote: l.lot_number,
      nombreLote: l.lot_name,
      // Keep awarded amount and PBL separate: a known awardee does not make the PBL an awarded amount.
      // If structured awards exist but their amounts are incomplete, do not fall back
      // to a potentially stale legacy lot total. A legacy fallback is safe only when
      // there are no structured award rows for this lot at all.
      importeSinIva: hasTerminalStructuredResult ? null : (
        lotAwardedAmount ?? (awardsForLot.length === 0
          ? l.awarded_amount ?? (!l.awardee ? l.amount_excl_vat : null)
          : null)
      ),
      importeConIva: hasTerminalStructuredResult ? null : (
        lotAwardedAmountInclVat ?? (awardsForLot.length === 0
          ? l.awarded_amount_incl_vat ?? (!l.awardee ? l.amount_incl_vat : null)
          : null)
      ),
      presupuestoSinIva: l.budget_excl_vat ?? (!l.awardee ? l.amount_excl_vat : null),
      presupuestoConIva: l.budget_incl_vat ?? (!l.awardee ? l.amount_incl_vat : null),
      importeAdjudicacion: hasTerminalStructuredResult ? null : (
        lotAwardedAmount ?? (awardsForLot.length === 0 ? l.awarded_amount : null)
      ),
      importeAdjConIva: hasTerminalStructuredResult ? null : (
        lotAwardedAmountInclVat ?? (awardsForLot.length === 0 ? l.awarded_amount_incl_vat : null)
      ),
      valorEstimado: l.estimated_value,
      awardee: hasTerminalStructuredResult ? null : l.awardee,
      nifAdjudicatario: hasTerminalStructuredResult ? null : l.awardee_nif,
      estadoLote: terminalStructuredResult ?? l.lot_status,
      fechaAdjudicacion: hasTerminalStructuredResult ? null : l.award_date,
      cpv: l.cpv,
      numOfertas: hasTerminalStructuredResult ? null : (l.offer_count != null ? Number(l.offer_count) : validStructuredOfferCount),
      adjudicaciones: (hasTerminalStructuredResult ? [] : awardsForLot)
        .filter(award => award.awardee != null && String(award.awardee).trim() !== '')
        .map(award => ({
        awardee: award.awardee,
        nifAdjudicatario: award.awardee_nif,
        importeAdjudicacion: award.awarded_amount ?? null,
        importeAdjConIva: award.awarded_amount_incl_vat ?? null,
        numOfertas: award.offer_count != null ? Number(award.offer_count) : null,
        fechaAdjudicacion: award.award_date ?? null,
        estado: award.result_state ?? null,
      })),
      };
    });
  } catch {
    // Graceful fallback if table is unavailable
  }

  // Prefer complete structured lot-award totals over a stale contract-level snapshot.
  // The parent contract can lag behind the individual awards (for example, 90 € vs 100 €).
  const structuredParentAmounts = (() => {
    // Never aggregate prices or amounts whose semantics are not a contract total.
    if (licitacion.award_amount_type && licitacion.award_amount_type !== 'total') return null;
    const hasStructuredAwards = Boolean(db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
    ).get());
    if (!hasStructuredAwards) return null;
    try {
      return db.prepare(`
        SELECT
          CASE
            WHEN ${lotAwardsAmountCoverageSql('contracts')}
              AND EXISTS (
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
            ELSE NULL
          END AS awarded_amount,
          CASE
            WHEN ${lotAwardsAmountCoverageSql('contracts', 'lot', 'award', 'award_null', 'awarded_amount_incl_vat')}
              AND EXISTS (
                SELECT 1 FROM lot_awards award
                WHERE award.contract_id = contracts.id
                  AND award.awarded_amount_incl_vat IS NOT NULL
                  AND ${eligibleAwardResultStateSql('award')}
                  AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
              )
            THEN (
              SELECT round(sum(award.awarded_amount_incl_vat), 2)
              FROM lot_awards award
              WHERE award.contract_id = contracts.id
                AND award.awarded_amount_incl_vat IS NOT NULL
                AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
            )
            ELSE NULL
          END AS awarded_amount_incl_vat
        FROM contracts
        WHERE id = ?
      `).get(licitacion.id) as {
        awarded_amount?: number | null;
        awarded_amount_incl_vat?: number | null;
      } | undefined;
    } catch {
      return null;
    }
  })();
  const licitacionConImportes = {
    ...licitacion,
    ...(structuredParentAmounts?.awarded_amount != null
      ? { awarded_amount: structuredParentAmounts.awarded_amount }
      : {}),
    ...(structuredParentAmounts?.awarded_amount_incl_vat != null
      ? { awarded_amount_incl_vat: structuredParentAmounts.awarded_amount_incl_vat }
      : {}),
  };

  const hasGenuineLots = lotesDesglose.length > 1;
  const lotesAdjudicatariosUnicos = Array.from(new Set(
    lotesDesglose.flatMap((l) => {
      const awards = Array.isArray(l.adjudicaciones) && l.adjudicaciones.length > 0
        ? l.adjudicaciones
        : l.awardee && isEligibleAwardLotStatus(l.estadoLote)
          ? [{ awardee: l.awardee, nifAdjudicatario: l.nifAdjudicatario || null }]
          : [];
      return awards
        .filter((award: any) => award.awardee)
        .map((award: any) => award.nifAdjudicatario || award.awardee);
    })
  ));
  // La cabecera puede conservar por error el awardee de un solo lote.
  // Si existen varios adjudicatarios distintos, la representación correcta es colectiva.
  const licitacionAnalisis = hasGenuineLots && lotesAdjudicatariosUnicos.length > 1
    ? { ...licitacionConImportes, awardee: 'Varios adjudicatarios', awardee_nif: null, offer_count: null }
    : licitacionConImportes;
  const estadoCanonicoLicitacion = getContractStatus({
    estado: licitacion.status,
    procedimiento: licitacion.procedure ?? licitacion.procedimiento,
    fechaAdjudicacion: licitacion.award_date,
    fechaFormalizacion: licitacion.formalization_date,
    importeAdjudicacion: licitacion.awarded_amount,
  });
  const esLicitadorUnico =
    licitacionAnalisis.offer_count === 1 &&
    !hasGenuineLots &&
    Boolean(licitacionAnalisis.awardee && licitacionAnalisis.awardee.trim() && licitacionAnalisis.awardee !== 'Sin awardee') &&
    !estadoCanonicoLicitacion.flags.isTerminal;
  const documentos = getDocumentosForContract(licitacion.id);
  const redFlags = evaluarRedFlags(licitacionAnalisis, hasGenuineLots ? lotesDesglose : undefined, documentos);
  const lotizacion = detectLotes(licitacion.object_description, licitacion.case_number, {
    is_lotized: hasGenuineLots ? 1 : ((licitacion as any).is_lotized && lotesDesglose.length > 0 ? 1 : 0),
    lot_count: hasGenuineLots ? lotesDesglose.length : 1,
    lots_source: hasGenuineLots ? (licitacion as any).lots_source : 'LOTE_UNICO',
  });

  // For multi-winner lot contracts, build per-lot empresa info for the investigation hub.
  // We group by unique awardee (ignoring desert lots) and query related contracts + stats for each.
  if (hasGenuineLots && licitacionAnalisis.awardee === 'Varios adjudicatarios') {
    // Suppress the broken single-company data (queried against 'Varios adjudicatarios' = useless)
    relacionadasEmpresa = [];
    statsEmpresa = null;

    // Collect unique adjudicatarios across lots (excluding desert lots)
    const seenKeys = new Set<string>();
    const lotEntries: Array<{ awardee: string; nifAdjudicatario: string | null; numeroLote: string | null; nombreLote: string | null }> = [];
    for (const lote of lotesDesglose) {
      const awards = Array.isArray(lote.adjudicaciones) && lote.adjudicaciones.length > 0
        ? lote.adjudicaciones
        : lote.awardee && isEligibleAwardLotStatus(lote.estadoLote)
          ? [{ awardee: lote.awardee, nifAdjudicatario: lote.nifAdjudicatario || null }]
          : [];

      for (const award of awards) {
        if (!award.awardee) continue;
        const key = award.nifAdjudicatario || award.awardee;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        lotEntries.push({
          awardee: award.awardee,
          nifAdjudicatario: award.nifAdjudicatario || null,
          numeroLote: lote.numeroLote || null,
          nombreLote: lote.nombreLote || null,
        });
      }
    }

    lotesAdjudicatariosInfo = lotEntries.map(entry => {
      const empresaId = getOpaqueEmpresaId(entry.nifAdjudicatario, entry.awardee);

      // Build related contracts query for this specific lot winner.
      // A company may appear only as a lot awardee in related contracts, so
      // match both the contract header and its non-deserted awarded lots.
      const relHeaderParams = entry.nifAdjudicatario
        ? [entry.nifAdjudicatario, entry.awardee]
        : [entry.awardee];
      const relLotParams = entry.nifAdjudicatario
        ? [entry.nifAdjudicatario, entry.awardee]
        : [entry.awardee];
      const relHeaderWhere = entry.nifAdjudicatario
        ? '((c.awardee_nif IS NOT NULL AND c.awardee_nif = ?) OR c.awardee = ?)'
        : 'c.awardee = ?';
      const relLotWhere = entry.nifAdjudicatario
        ? '((lot.awardee_nif IS NOT NULL AND lot.awardee_nif = ?) OR lot.awardee = ?)'
        : 'lot.awardee = ?';
      const relAwardWhere = entry.nifAdjudicatario
        ? '((award.awardee_nif IS NOT NULL AND award.awardee_nif = ?) OR award.awardee = ?)'
        : 'award.awardee = ?';
      const relAwardParams = entry.nifAdjudicatario
        ? [entry.nifAdjudicatario, entry.awardee]
        : [entry.awardee];
      const relParams = [
        ...relLotParams,
        ...relLotParams,
        ...relAwardParams,
        ...relAwardParams,
        ...relHeaderParams,
        licitacion.id,
        ...relHeaderParams,
        ...relLotParams,
        ...relAwardParams,
      ];

      const relacionadas = db.prepare(`
        SELECT
          c.id,
          c.case_number,
          c.object_description,
          c.contracting_authority_name,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM contract_lots lot
              WHERE lot.contract_id = c.id
                AND lot.awarded_amount IS NOT NULL
                AND ${eligibleAwardLotStatusSql('lot')}
                AND ${relLotWhere}
            )
            THEN (
              SELECT round(sum(lot.awarded_amount), 2)
              FROM contract_lots lot
              WHERE lot.contract_id = c.id
                AND lot.awarded_amount IS NOT NULL
                AND ${eligibleLegacyLotAwardAmountSql('lot')}
                AND ${relLotWhere}
            )
            WHEN EXISTS (
              SELECT 1
              FROM lot_awards award
              WHERE award.contract_id = c.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                AND award.awarded_amount IS NOT NULL
                AND ${eligibleAwardResultStateSql('award')}
                AND ${relAwardWhere}
            )
            THEN (
              SELECT round(sum(award.awarded_amount), 2)
              FROM lot_awards award
              WHERE award.contract_id = c.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                AND award.awarded_amount IS NOT NULL
                AND ${eligibleAwardResultStateSql('award')}
                AND ${relAwardWhere}
            )
            WHEN ${relHeaderWhere}
            THEN c.awarded_amount
            ELSE NULL
          END as awarded_amount,
          c.award_amount_type,
          c.status,
          c.award_date,
          c.year,
          c.offer_count
        FROM contracts c
        WHERE c.id != ?
          AND (
            ${relHeaderWhere}
            OR EXISTS (
              SELECT 1
              FROM contract_lots lot
              WHERE lot.contract_id = c.id
                AND lot.awarded_amount IS NOT NULL
                AND ${eligibleAwardLotStatusSql('lot')}
                AND ${relLotWhere}
            )
            OR EXISTS (
              SELECT 1
              FROM lot_awards award
              WHERE award.contract_id = c.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                AND ${eligibleAwardResultStateSql('award')}
                AND ${relAwardWhere}
            )
          )
        ORDER BY coalesce(c.award_date, c.publication_date) DESC
        LIMIT 6;
      `).all(...relParams) as any[];

      const statsWhere = entry.nifAdjudicatario
        ? '((c.awardee_nif IS NOT NULL AND c.awardee_nif = ?) OR c.awardee = ?)'
        : 'c.awardee = ?';
      const lotStatsWhere = entry.nifAdjudicatario
        ? '((lot.awardee_nif IS NOT NULL AND lot.awardee_nif = ?) OR lot.awardee = ?)'
        : 'lot.awardee = ?';
      const statsParams = entry.nifAdjudicatario
        ? [entry.nifAdjudicatario, entry.awardee]
        : [entry.awardee];
      const lotStatsParams = entry.nifAdjudicatario
        ? [entry.nifAdjudicatario, entry.awardee]
        : [entry.awardee];
      const lotAwardStatsParams = entry.nifAdjudicatario
        ? [entry.nifAdjudicatario, entry.awardee]
        : [entry.awardee];
      // lot_awards is canonical only when it covers every non-deserted awarded lot.
      // Partial snapshots must keep contract_lots as the authoritative fallback.
      const lotAwardsAmountCovered = `EXISTS (
        SELECT 1
        FROM lot_awards award
        WHERE award.contract_id = c.id
          AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
          AND award.awarded_amount IS NOT NULL
          AND ${eligibleAwardResultStateSql('award')}
      ) AND ${lotAwardsAmountCoverageSql('c')}`;
      const sRow = db.prepare(`
        SELECT
          count(DISTINCT c.id) as total,
          round(sum(
            CASE
              WHEN ${lotAwardsAmountCovered} AND EXISTS (
                SELECT 1
                FROM lot_awards award
                WHERE award.contract_id = c.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                  AND award.awarded_amount IS NOT NULL
                  AND ${eligibleAwardResultStateSql('award')}
                  AND ${relAwardWhere}
              )
              THEN (
                SELECT coalesce(sum(award.awarded_amount), 0)
                FROM lot_awards award
                WHERE award.contract_id = c.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                  AND award.awarded_amount IS NOT NULL
                  AND ${eligibleAwardResultStateSql('award')}
                  AND ${relAwardWhere}
              )
              WHEN EXISTS (
                SELECT 1
                FROM contract_lots lot
                WHERE lot.contract_id = c.id
                  AND lot.awarded_amount IS NOT NULL
                  AND ${eligibleAwardLotStatusSql('lot')}
                  AND ${lotStatsWhere}
              )
              THEN (
                SELECT coalesce(sum(lot.awarded_amount), 0)
                FROM contract_lots lot
                WHERE lot.contract_id = c.id
                  AND lot.awarded_amount IS NOT NULL
                  AND ${eligibleLegacyLotAwardAmountSql('lot')}
                  AND ${lotStatsWhere}
              )
              WHEN ${statsWhere}
                   AND (c.award_amount_type IS NULL OR c.award_amount_type = 'total')
              THEN coalesce(c.awarded_amount, 0)
              ELSE 0
            END
          ), 2) as volumen
        FROM contracts c
        WHERE ${statsWhere}
           OR EXISTS (
             SELECT 1
             FROM contract_lots lot
             WHERE lot.contract_id = c.id
               AND lot.awarded_amount IS NOT NULL
               AND ${eligibleAwardLotStatusSql('lot')}
               AND ${lotStatsWhere}
           )
           OR EXISTS (
             SELECT 1
             FROM lot_awards award
             WHERE award.contract_id = c.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
               AND ${eligibleAwardResultStateSql('award')}
               AND ${relAwardWhere}
           );
      `).get(...lotAwardStatsParams, ...lotAwardStatsParams, ...lotStatsParams, ...lotStatsParams, ...statsParams, ...statsParams, ...lotStatsParams, ...relAwardParams) as any;

      const stats = sRow ? { totalContratos: sRow.total || 0, volumenTotal: sRow.volumen || 0 } : null;

      return {
        awardee: entry.awardee,
        nifAdjudicatario: entry.nifAdjudicatario,
        empresaId,
        numeroLote: entry.numeroLote,
        nombreLote: entry.nombreLote,
        relacionadas,
        stats,
      };
    });
  }

  const organismoPlacspId = licitacion.contracting_authority_id
    ? (db.prepare('SELECT placsp_id FROM contracting_authorities WHERE id = ?').get(licitacion.contracting_authority_id) as any)?.placsp_id || null
    : null;

  return toPlain({
    ...licitacionAnalisis,
    expediente: licitacionAnalisis.case_number,
    objeto: licitacionAnalisis.object_description,
    tipo_contrato: licitacionAnalisis.contract_type,
    naturaleza_economica: licitacionAnalisis.economic_nature,
    cpv_principal: licitacionAnalisis.primary_cpv,
    es_pyme: licitacionAnalisis.is_sme,
    procedimiento: licitacionAnalisis.procedure ?? licitacionAnalisis.procedimiento,
    estado: licitacionAnalisis.status,
    importe_sin_iva: licitacionAnalisis.amount_excl_vat,
    importe_con_iva: licitacionAnalisis.amount_incl_vat,
    importe_adjudicacion: licitacionAnalisis.awarded_amount,
    importe_adj_con_iva: licitacionAnalisis.awarded_amount_incl_vat,
    valor_estimado: licitacionAnalisis.estimated_value,
    adjudicatario: licitacionAnalisis.awardee,
    nif_adjudicatario: licitacionAnalisis.awardee_nif,
    num_ofertas: licitacionAnalisis.offer_count,
    url: licitacionAnalisis.source_url ?? licitacionAnalisis.url,
    fecha_publicacion: licitacionAnalisis.publication_date,
    fecha_limite: licitacionAnalisis.deadline_date,
    fecha_adjudicacion: licitacionAnalisis.award_date,
    fecha_formalizacion: licitacionAnalisis.formalization_date,
    duracion: licitacionAnalisis.duration,
    duracion_unidad: licitacionAnalisis.duration_unit,
    ubicacion: licitacionAnalisis.location,
    financiacion_ue: licitacionAnalisis.eu_funding,
    urgencia: licitacionAnalisis.urgency,
    organismoPlacspId,
    organismoAuthorityId: licitacion.contracting_authority_id || null,
    relacionadas,
    relacionadasEmpresa,
    statsEmpresa,
    relacionadasCpv,
    diasResolucion,
    esLicitadorUnico,
    redFlags,
    adjudicatarioInfo,
    vigencia,
    lotizacion,
    lotes: lotesDesglose,
    modificadosInfo,
    documentos,
    lotesAdjudicatariosInfo,
  });
}

export function getDocumentosForContract(licitacionId: string): LicitacionDocumento[] {
  const db = getDb();
  try {
    const rows = (db.prepare(`
      SELECT id, contract_id, case_number, document_date, title, source_url AS url, document_type, is_abnormally_low_bid_justification
      FROM contract_documents
      WHERE contract_id = ?
      ORDER BY document_date DESC, id ASC
    `).all(licitacionId) || []) as any[];

    return toPlain(rows.map(r => ({
      id: r.id,
      contract_id: r.contract_id,
      case_number: r.case_number,
      expediente: r.case_number,
      document_date: r.document_date,
      fecha: r.document_date,
      title: r.title,
      titulo: r.title,
      url: r.url,
      document_type: r.document_type || 'OTROS',
      tipo_documento: r.document_type || 'OTROS',
      is_abnormally_low_bid_justification: Boolean(r.is_abnormally_low_bid_justification),
      es_justificacion_anormalidad: Number(r.is_abnormally_low_bid_justification) || 0,
    })));
  } catch {
    return [];
  }
}

function completeContractLotAwardCoverageSql(db: DatabaseSync, alias: string) {
  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());
  const hasContractLotsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'contract_lots' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'contract_lots' LIMIT 1"
  ).get());
  const eligibleLotPredicate = eligibleAwardLotStatusSql('coverage_lot');
  if (!hasContractLotsTable) return '0';

  const lotAwardsCoverage = hasLotAwardsTable
    ? lotAwardsAmountCoverageSql(alias)
    : `NOT EXISTS (
        SELECT 1 FROM contract_lots coverage_lot
        WHERE coverage_lot.contract_id = ${alias}.id
          AND ${eligibleLotPredicate}
          AND coverage_lot.awarded_amount IS NULL
      )`;

  return `EXISTS (
    SELECT 1 FROM contract_lots coverage_lot
    WHERE coverage_lot.contract_id = ${alias}.id
      AND ${eligibleLotPredicate}
  ) AND ${lotAwardsCoverage}`;
}

function contractAwardAmountEligibleSql(db: DatabaseSync, alias: string) {
  return `(
    ${alias}.award_amount_type IS NULL
    OR ${alias}.award_amount_type = 'total'
    OR (
      ${alias}.award_amount_type = 'desconocido'
      AND ${alias}.is_lotized = 1
      AND (${completeContractLotAwardCoverageSql(db, alias)})
    )
  )`;
}

function authorityVolumeAwardAmountEligibleSql(db: DatabaseSync, alias: string) {
  return `(
    ${alias}.award_amount_type IS NULL
    OR ${alias}.award_amount_type = 'total'
    OR (
      ${alias}.award_amount_type = 'desconocido'
      AND ${alias}.lot_number IS NOT NULL
      AND (${completeContractLotAwardCoverageSql(db, alias)})
    )
  )`;
}

export function getContractingAuthorities() {
  const db = getDb();
  const corporateContractSource = getCorporateContractSource(db);
  const awardAmountEligible = authorityVolumeAwardAmountEligibleSql(db, 'u');
  const rows = db.prepare(`
    WITH authority_amounts AS (
      SELECT
        u.contracting_authority_id,
        round(sum(CASE WHEN u.economic_nature = 'gasto' AND NOT ${terminalContractStatusSql('u')}
          AND ${awardAmountEligible}
          THEN coalesce(u.awarded_amount, 0) ELSE 0 END), 2) as gasto_adjudicado,
        round(sum(CASE WHEN u.economic_nature = 'ingreso' AND NOT ${terminalContractStatusSql('u')}
          AND ${awardAmountEligible}
          THEN coalesce(u.awarded_amount, 0) ELSE 0 END), 2) as ingresos_adjudicados,
        round(sum(CASE WHEN u.economic_nature = 'concesion' AND NOT ${terminalContractStatusSql('u')}
          AND ${awardAmountEligible}
          THEN coalesce(u.awarded_amount, 0) ELSE 0 END), 2) as concesiones_adjudicadas,
        round(sum(CASE WHEN NOT ${terminalContractStatusSql('u')}
          AND ${awardAmountEligible}
          THEN coalesce(u.awarded_amount, 0) ELSE 0 END), 2) as volumen_total
      FROM ${corporateContractSource} u
      GROUP BY u.contracting_authority_id
    )
    SELECT
      o.id,
      o.placsp_id,
      o.name,
      o.nif,
      o.dir3,
      o.scope,
      count(l.id) as total_contratos,
      coalesce(a.gasto_adjudicado, 0) as gasto_adjudicado,
      coalesce(a.ingresos_adjudicados, 0) as ingresos_adjudicados,
      coalesce(a.concesiones_adjudicadas, 0) as concesiones_adjudicadas,
      round(sum(CASE WHEN l.economic_nature = 'gasto' THEN ${desertedContractBudgetSql(db, 'l')} ELSE 0 END), 2) as gasto_desierto,
      round(sum(CASE
        WHEN l.economic_nature = 'gasto' AND ${inCourseContractStatusSql('l')}
          AND EXISTS (SELECT 1 FROM contract_lots lot WHERE lot.contract_id = l.id)
        THEN (
          SELECT coalesce(sum(
            CASE
              WHEN NOT ${eligibleLegacyLotAwardAmountSql('lot')} THEN 0
              WHEN lot.awarded_amount IS NOT NULL OR trim(coalesce(lot.awardee, '')) <> '' THEN 0
              WHEN EXISTS (
                SELECT 1
                FROM lot_awards award
                WHERE award.contract_id = l.id
                  AND award.lot_number = lot.lot_number
                  AND (award.awarded_amount IS NOT NULL OR trim(coalesce(award.awardee, '')) <> '')
                  AND ${eligibleAwardResultStateSql('award')}
              ) THEN 0
              ELSE coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0)
            END
          ), 0)
          FROM contract_lots lot
          WHERE lot.contract_id = l.id
        )
        WHEN l.economic_nature = 'gasto' AND ${inCourseContractStatusSql('l')}
          AND l.awarded_amount IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM lot_awards award
            WHERE award.contract_id = l.id
              AND (award.awarded_amount IS NOT NULL OR trim(coalesce(award.awardee, '')) <> '')
              AND ${eligibleAwardResultStateSql('award')}
          )
        THEN coalesce(l.amount_excl_vat, 0)
        ELSE 0
      END), 2) as gasto_en_curso,
      coalesce(a.volumen_total, 0) as volumen_total,
      (SELECT count(DISTINCT u.awardee) FROM ${corporateContractSource} u WHERE u.contracting_authority_id = o.id AND NOT ${terminalContractStatusSql('u')}) as total_adjudicatarios,
      max(l.publication_date) as ultimo_contrato
    FROM contracting_authorities o
    LEFT JOIN contracts l ON l.contracting_authority_id = o.id
    LEFT JOIN authority_amounts a ON a.contracting_authority_id = o.id
    WHERE o.active = 1
    GROUP BY o.id
    ORDER BY gasto_adjudicado DESC;
  `).all() as any[];

  return toPlain(rows);
}

export function getContractingAuthorityDetail(identifier: string) {
  const db = getDb();
  const corporateContractSource = getCorporateContractSource(db);
  const authoritySelect = `
    SELECT id, placsp_id, name, nif, dir3, scope
    FROM contracting_authorities
    WHERE id = ? AND active = 1
    LIMIT 1
  `;
  let auth = db.prepare(authoritySelect).get(identifier) as any;
  if (!auth) {
    auth = db.prepare(`
      SELECT id, placsp_id, name, nif, dir3, scope
      FROM contracting_authorities
      WHERE placsp_id = ? AND active = 1
      LIMIT 1
    `).get(identifier);
  }
  if (!auth) {
    const matchingNameCount = (db.prepare(`
      SELECT count(*) as count
      FROM contracting_authorities
      WHERE name = ? AND active = 1
    `).get(identifier) as { count: number }).count;
    if (matchingNameCount === 1) {
      auth = db.prepare(`
        SELECT id, placsp_id, name, nif, dir3, scope
        FROM contracting_authorities
        WHERE name = ? AND active = 1
        LIMIT 1
      `).get(identifier);
    }
  }

  if (!auth) return null;

  const awardAmountEligible = authorityVolumeAwardAmountEligibleSql(db, 'u');
  const stats = db.prepare(`
    WITH authority_amounts AS (
      SELECT
        u.contracting_authority_id,
        round(sum(CASE WHEN u.economic_nature = 'gasto' AND NOT ${terminalContractStatusSql('u')}
          AND ${awardAmountEligible}
          THEN coalesce(u.awarded_amount, 0) ELSE 0 END), 2) as gasto_adjudicado,
        round(sum(CASE WHEN u.economic_nature = 'ingreso' AND NOT ${terminalContractStatusSql('u')}
          AND ${awardAmountEligible}
          THEN coalesce(u.awarded_amount, 0) ELSE 0 END), 2) as ingresos_adjudicados,
        round(sum(CASE WHEN u.economic_nature = 'concesion' AND NOT ${terminalContractStatusSql('u')}
          AND ${awardAmountEligible}
          THEN coalesce(u.awarded_amount, 0) ELSE 0 END), 2) as concesiones_adjudicadas,
        round(sum(CASE WHEN NOT ${terminalContractStatusSql('u')}
          AND ${awardAmountEligible}
          THEN coalesce(u.awarded_amount, 0) ELSE 0 END), 2) as volumen_total
      FROM ${corporateContractSource} u
      WHERE u.contracting_authority_id = ?
    )
    SELECT
      (SELECT count(*) FROM contracts WHERE contracting_authority_id = ?) as total_contratos,
      coalesce(a.gasto_adjudicado, 0) as gasto_adjudicado,
      coalesce(a.ingresos_adjudicados, 0) as ingresos_adjudicados,
      coalesce(a.concesiones_adjudicadas, 0) as concesiones_adjudicadas,
      round(sum(CASE WHEN l.economic_nature = 'gasto' THEN ${desertedContractBudgetSql(db, 'l')} ELSE 0 END), 2) as gasto_desierto,
      round(sum(CASE
        WHEN l.economic_nature = 'gasto' AND ${inCourseContractStatusSql('l')}
          AND EXISTS (SELECT 1 FROM contract_lots lot WHERE lot.contract_id = l.id)
        THEN (
          SELECT coalesce(sum(
            CASE
              WHEN NOT ${eligibleLegacyLotAwardAmountSql('lot')} THEN 0
              WHEN lot.awarded_amount IS NOT NULL OR trim(coalesce(lot.awardee, '')) <> '' THEN 0
              WHEN EXISTS (
                SELECT 1
                FROM lot_awards award
                WHERE award.contract_id = l.id
                  AND award.lot_number = lot.lot_number
                  AND (award.awarded_amount IS NOT NULL OR trim(coalesce(award.awardee, '')) <> '')
                  AND ${eligibleAwardResultStateSql('award')}
              ) THEN 0
              ELSE coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0)
            END
          ), 0)
          FROM contract_lots lot
          WHERE lot.contract_id = l.id
        )
        WHEN l.economic_nature = 'gasto' AND ${inCourseContractStatusSql('l')}
          AND l.awarded_amount IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM lot_awards award
            WHERE award.contract_id = l.id
              AND (award.awarded_amount IS NOT NULL OR trim(coalesce(award.awardee, '')) <> '')
              AND ${eligibleAwardResultStateSql('award')}
          )
        THEN coalesce(l.amount_excl_vat, 0)
        ELSE 0
      END), 2) as gasto_en_curso,
      coalesce(a.volumen_total, 0) as volumen_total,
      (SELECT min(year) FROM contracts WHERE contracting_authority_id = ?) as primer_ano,
      (SELECT max(year) FROM contracts WHERE contracting_authority_id = ?) as ultimo_ano
    FROM contracts l
    LEFT JOIN authority_amounts a ON 1 = 1
    WHERE l.contracting_authority_id = ?
  `).get(auth.id, auth.id, auth.id, auth.id, auth.id) as any;

  const adjudicatariosStats = db.prepare(`
    SELECT count(DISTINCT awardee) as total_adjudicatarios
    FROM ${corporateContractSource}
    WHERE contracting_authority_id = ?
      AND NOT ${terminalContractStatusSql('')}
      AND awardee IS NOT NULL
      AND trim(awardee) != ''
  `).get(auth.id) as any;

  const topAdjudicatarios = db.prepare(`
    SELECT u.awardee as adjudicatario, coalesce(u.awardee_nif, '') as nif, count(DISTINCT u.id) as contratos,
      round(sum(CASE WHEN u.economic_nature = 'gasto' AND NOT ${terminalContractStatusSql('u')} AND ${awardAmountEligible} THEN coalesce(u.awarded_amount, 0) ELSE 0 END), 2) as gasto_adjudicado,
      round(sum(CASE WHEN NOT ${terminalContractStatusSql('u')} AND ${awardAmountEligible} THEN coalesce(u.awarded_amount, 0) ELSE 0 END), 2) as volumen
    FROM ${corporateContractSource} u
    WHERE u.contracting_authority_id = ?
      AND NOT ${terminalContractStatusSql('u')}
      AND u.awardee IS NOT NULL
      AND trim(u.awardee) != ''
    GROUP BY u.awardee, u.awardee_nif
    ORDER BY gasto_adjudicado DESC, volumen DESC
    LIMIT 10;
  `).all(auth.id) as any[];

  const evolucion = db.prepare(`
    SELECT cast(l.year as integer) as year, count(DISTINCT l.id) as contratos,
      round(sum(CASE WHEN NOT ${terminalContractStatusSql('l')} AND ${authorityVolumeAwardAmountEligibleSql(db, 'l')} THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen
    FROM ${corporateContractSource} l
    WHERE l.contracting_authority_id = ?
      AND l.year IS NOT NULL
    GROUP BY l.year ORDER BY l.year ASC;
  `).all(auth.id) as any[];

  const porTipo = db.prepare(`
    SELECT coalesce(l.contract_type, 'Otros') as tipo, count(DISTINCT l.id) as contratos,
      round(sum(CASE WHEN NOT ${terminalContractStatusSql('l')} AND ${authorityVolumeAwardAmountEligibleSql(db, 'l')} THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen
    FROM ${corporateContractSource} l
    WHERE l.contracting_authority_id = ?
    GROUP BY l.contract_type ORDER BY volumen DESC;
  `).all(auth.id) as any[];

  return toPlain({ ...auth, ...(stats || {}), total_adjudicatarios: Number(adjudicatariosStats?.total_adjudicatarios) || 0, evolucion, porTipo, topAdjudicatarios });
}

export function getGruposEmpresarialesList(db: DatabaseSync, q?: string, year?: number | string) {
  ensureCorporateResolutionTable(db);
  const corporateContractSource = getCorporateContractSource(db);
  const groupsList = (db.prepare(`
    SELECT group_id, group_name, associated_nifs_json, scope, description, sede, color
    FROM corporate_groups
    ORDER BY group_id ASC
  `).all() as any[]).map((row) => {
    let cifs: string[] = [];
    try {
      cifs = JSON.parse(row.associated_nifs_json || '[]');
    } catch {
      cifs = [];
    }
    return {
      id: row.group_id,
      nombre: row.group_name,
      name: row.group_name,
      description: row.description || '',
      ambito: row.scope || '',
      scope: row.scope || '',
      cifs,
      sede: row.sede || undefined,
      color: row.color || undefined,
    };
  });

  const results = [];
  const anoNum = Number(year);
  const filterByAno = !isNaN(anoNum) && anoNum > 0;

  for (const grp of groupsList) {
    if (q && q.trim()) {
      const term = q.trim().toLowerCase();
      const matchName = (grp.name || grp.nombre || '').toLowerCase().includes(term);
      const matchDesc = (grp.description || '').toLowerCase().includes(term);
      const matchCif = grp.cifs.some(c => c.toLowerCase().includes(term));
      if (!matchName && !matchDesc && !matchCif) continue;
    }

    const cifsPlaceholders = grp.cifs.map(() => '?').join(',');
    const whereConds = [`(r.group_id = ? OR l.awardee_nif IN (${cifsPlaceholders}))`];
    const queryParams: any[] = [grp.id, ...grp.cifs];

    if (filterByAno) {
      whereConds.push(`l.year = ?`);
      queryParams.push(anoNum);
    }

  const rows = db.prepare(`
      SELECT 
        coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee) as id,
        coalesce(r.canonical_nif, l.awardee_nif) as cif,
        coalesce(r.canonical_name, l.awardee) as nombre,
        count(DISTINCT l.id) as contratos,
        round(sum(CASE WHEN l.award_amount_type IS NULL OR l.award_amount_type = 'total' THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen,
        max(coalesce(l.publication_date, l.award_date)) as ultimo_contrato
      FROM ${corporateContractSource} l
      LEFT JOIN company_resolution r 
        ON coalesce(l.awardee_nif, '') = r.raw_nif 
       AND coalesce(l.awardee, '') = r.raw_name
      WHERE ${whereConds.join(' AND ')}
      GROUP BY coalesce(r.canonical_nif, l.awardee_nif)
      ORDER BY volumen DESC;
    `).all(...queryParams) as any[];

    if (rows.length === 0) continue;

    const totalContratos = rows.reduce((acc, r) => acc + r.contratos, 0);
    const volumenTotal = Math.round(rows.reduce((acc, r) => acc + r.volumen, 0) * 100) / 100;
    const ultimoContrato = rows.map(r => r.ultimo_contrato).filter(Boolean).toSorted().reverse()[0] || null;

    const mappedRows = rows.map(r => ({
      ...r,
      id: r.id ? (isPersonaFisicaNif(r.id) ? getOpaqueEmpresaId(r.id, r.nombre) : r.id) : getOpaqueEmpresaId(r.cif, r.nombre),
    }));

    results.push({
      id: grp.id,
      nombre: grp.nombre,
      description: grp.description || '',
      ambito: grp.ambito,
      sede: grp.sede,
      color: grp.color,
      total_contratos: totalContratos,
      volumen_total: volumenTotal,
      ultimo_contrato: ultimoContrato,
      filiales: mappedRows,
      num_filiales: rows.length,
    });
  }

  results.sort((a, b) => b.volumen_total - a.volumen_total);

  return {
    data: results,
    total: results.length,
    page: 1,
    limit: results.length,
    totalPages: 1,
    view: 'grupos',
  };
}

export interface EmpresaListItem {
  id: string;
  nombre: string;
  nif: string;
  total_contratos: number;
  gasto_adjudicado: number;
  ingresos_adjudicados: number;
  volumen_total: number;
  organismos_distintos: number;
  ultimo_contrato: string | null;
  group_id: string | null;
  group_name: string | null;
  link_type: string | null;
  tieneCambioNombre: boolean;
  nombresAnteriores: string[];
  esDniEnmascarado: boolean;
  esGrupo: boolean;
  num_filiales: number;
  num_nombres_distintos: number;
}

export interface GrupoListItem {
  id: string;
  nombre: string;
  description: string;
  ambito: string;
  sede?: string;
  color?: string;
  total_contratos: number;
  volumen_total: number;
  ultimo_contrato: string | null;
  num_filiales: number;
  filiales: { id?: string; cif: string; nombre: string; contratos: number; volumen: number }[];
}

export interface EmpresasListResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  view: string;
}

export function getEmpresasList(opts: {
  view: 'grupos';
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
  year?: number | string;
}): EmpresasListResult<GrupoListItem>;
export function getEmpresasList(opts?: {
  view?: 'empresas';
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
  year?: number | string;
}): EmpresasListResult<EmpresaListItem>;
export function getEmpresasList(opts: {
  view?: 'empresas' | 'grupos';
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
  year?: number | string;
}): EmpresasListResult<EmpresaListItem> | EmpresasListResult<GrupoListItem>;
export function getEmpresasList(opts: {
  view?: 'empresas' | 'grupos';
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
  year?: number | string;
} = {}): EmpresasListResult<EmpresaListItem> | EmpresasListResult<GrupoListItem> {
  const db = getDb();
  ensureCorporateResolutionTable(db);
  const corporateContractSource = getCorporateContractSource(db);
  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());
  const hasContractLotsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'contract_lots' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'contract_lots' LIMIT 1"
  ).get());
  const terminalCompanyStatusSql = (alias: string) =>
    terminalContractStatusSql(alias, { hasLotAwardsTable, hasContractLotsTable });
  const view = opts.view || 'empresas';

  if (view === 'grupos') {
    return toPlain(getGruposEmpresarialesList(db, opts.q, opts.year));
  }

  const page = Math.max(1, Number(opts.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(opts.limit) || 25));
  const offset = (page - 1) * limit;

  const conditions = ["l.awardee IS NOT NULL AND l.awardee != ''"];
  const params: any[] = [];

  if (opts.year && opts.year !== 'todos') {
    const anoNum = Number(opts.year);
    if (!isNaN(anoNum) && anoNum > 0) {
      conditions.push(`l.year = ?`);
      params.push(anoNum);
    }
  }

  if (opts.q && opts.q.trim()) {
    conditions.push(`(
      l.awardee LIKE ? 
      OR l.awardee_nif LIKE ? 
      OR r.canonical_name LIKE ? 
      OR r.canonical_nif LIKE ? 
      OR r.group_name LIKE ?
    )`);
    const term = `%${opts.q.trim()}%`;
    params.push(term, term, term, term, term);
  }

  const whereClause = conditions.join(' AND ');
  const orderClause = opts.sort === 'contratos' 
    ? 'ORDER BY total_contratos DESC' 
    : 'ORDER BY gasto_adjudicado DESC, volumen_total DESC';

  const aggKeyExpr = `CASE WHEN r.group_id IS NOT NULL AND r.group_id != '' THEN 'grupo:' || r.group_id ELSE coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee) END`;

  const countResult = db.prepare(`
    SELECT count(*) as total FROM (
      SELECT ${aggKeyExpr} as agg_key
      FROM ${corporateContractSource} l
      LEFT JOIN company_resolution r 
        ON coalesce(l.awardee_nif, '') = r.raw_nif 
       AND coalesce(l.awardee, '') = r.raw_name
      WHERE ${whereClause}
      GROUP BY agg_key
    ) t;
  `).get(...params) as any;
  const total = countResult?.total || 0;

  const data = db.prepare(`
    SELECT
      id,
      nombre,
      canonical_name,
      nif,
      total_contratos,
      gasto_adjudicado,
      ingresos_adjudicados,
      volumen_total,
      organismos_distintos,
      ultimo_contrato,
      group_id,
      group_name,
      link_type,
      nombres_asociados,
      num_nombres_distintos,
      num_nifs_distintos,
      num_filiales
    FROM (
      SELECT 
        ${aggKeyExpr} as agg_key,
        max(coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee)) as id,
        CASE
          WHEN max(r.group_id) IS NOT NULL AND max(r.group_id) != '' THEN max(r.group_name)
          ELSE coalesce(max(r.canonical_name), max(l.awardee))
        END as nombre,
        coalesce(max(r.canonical_name), max(l.awardee)) as canonical_name,
        coalesce(max(r.canonical_nif), max(nullif(l.awardee_nif, '')), '') as nif,
        count(DISTINCT l.id) as total_contratos,
        round(sum(CASE WHEN NOT ${canceledContractStatusSql('l')} AND (NOT ${terminalCompanyStatusSql('l')} OR l.lot_number IS NOT NULL) AND l.economic_nature = 'gasto' AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido')) THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as gasto_adjudicado,
        round(sum(CASE WHEN NOT ${canceledContractStatusSql('l')} AND (NOT ${terminalCompanyStatusSql('l')} OR l.lot_number IS NOT NULL) AND l.economic_nature = 'ingreso' AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido')) THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as ingresos_adjudicados,
        round(sum(CASE WHEN NOT ${canceledContractStatusSql('l')} AND (NOT ${terminalCompanyStatusSql('l')} OR l.lot_number IS NOT NULL) AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido')) THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen_total,
        count(DISTINCT coalesce(nullif(trim(l.contracting_authority_id), ''), 'unlinked-contract:' || l.id)) as organismos_distintos,
        max(coalesce(l.publication_date, l.award_date)) as ultimo_contrato,
        max(r.group_id) as group_id,
        max(r.group_name) as group_name,
        max(r.link_type) as link_type,
        group_concat(DISTINCT l.awardee) as nombres_asociados,
        count(DISTINCT l.awardee) as num_nombres_distintos,
        count(DISTINCT l.awardee_nif) as num_nifs_distintos,
        count(DISTINCT coalesce(r.canonical_id, nullif(l.awardee_nif, ''), l.awardee)) as num_filiales
      FROM ${corporateContractSource} l
      LEFT JOIN company_resolution r 
        ON coalesce(l.awardee_nif, '') = r.raw_nif 
       AND coalesce(l.awardee, '') = r.raw_name
      WHERE ${whereClause}
      GROUP BY agg_key
    )
    ${orderClause}
    LIMIT ? OFFSET ?;
  `).all(...params, limit, offset) as any[];

  const formattedData = data.map((row: any) => {
    const numFiliales = row.num_filiales || 1;
    const esGrupo = !!(row.group_id) && numFiliales > 1;
    const displayName = (esGrupo ? row.nombre : (row.canonical_name || row.nombre) || '').trim();
    const rawNames = (row.nombres_asociados || '').split(',').filter(Boolean);
    const nombresAnteriores = esGrupo
      ? []
      : rawNames.filter((n: string) => n.trim().toUpperCase() !== displayName.toUpperCase());
    const tieneCambioNombre = !esGrupo && (row.link_type === 'cambio_denominacion' || nombresAnteriores.length > 0);
    const esDniEnmascarado = !esGrupo && (row.link_type === 'dni_enmascarado' || (row.nif && row.nif.includes('*')));

    const effectiveId = isPersonaFisicaNif(row.nif || row.id)
      ? getOpaqueEmpresaId(row.nif || row.id, displayName)
      : row.id;

    return {
      id: effectiveId,
      nombre: displayName,
      nif: row.nif,
      total_contratos: row.total_contratos,
      gasto_adjudicado: row.gasto_adjudicado,
      ingresos_adjudicados: row.ingresos_adjudicados,
      volumen_total: row.volumen_total,
      organismos_distintos: row.organismos_distintos,
      ultimo_contrato: row.ultimo_contrato,
      group_id: row.group_id,
      group_name: row.group_name,
      link_type: row.link_type,
      tieneCambioNombre,
      nombresAnteriores,
      esDniEnmascarado,
      esGrupo,
      num_filiales: numFiliales,
      num_nombres_distintos: row.num_nombres_distintos,
    };
  });

  return toPlain({
    data: formattedData,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    view: 'empresas',
  });
}

export interface SubvencionItem {
  id: number;
  bdns_id: number;
  award_code: string | null;
  beneficiary_nif: string;
  beneficiary: string | null;
  granting_authority: string | null;
  granting_authority_level_1: string | null;
  granting_authority_level_2: string | null;
  granting_authority_level_3: string | null;
  amount: number;
  equivalent_aid: number;
  grant_date: string | null;
  instrument: string | null;
  call: string | null;
  call_number: string | null;
  terms_url: string | null;
  is_alcazar: number;
  created_at: string;
}

export interface SubvencionesResumen {
  total: number;
  volumenTotal: number;
  totalAlcazar: number;
  volumenAlcazar: number;
  totalOtras: number;
  volumenOtras: number;
  items: SubvencionItem[];
}

export function ensureSubvencionesTable(db: DatabaseSync): void {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='grants'").get();
  if (exists) return;
  db.exec(`
    CREATE TABLE grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bdns_id INTEGER UNIQUE,
      award_code TEXT,
      beneficiary_nif TEXT NOT NULL,
      beneficiary TEXT,
      granting_authority TEXT,
      granting_authority_level_1 TEXT,
      granting_authority_level_2 TEXT,
      granting_authority_level_3 TEXT,
      amount REAL DEFAULT 0,
      equivalent_aid REAL DEFAULT 0,
      grant_date TEXT,
      instrument TEXT,
      call TEXT,
      call_number TEXT,
      terms_url TEXT,
      is_alcazar INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX idx_grants_beneficiary_nif ON grants(beneficiary_nif);
    CREATE INDEX idx_grants_is_alcazar ON grants(is_alcazar);
    CREATE INDEX idx_grants_grant_date ON grants(grant_date);
  `);
}

export function getSubvencionesByNifs(db: DatabaseSync, nifs: string[]): SubvencionesResumen {
  ensureSubvencionesTable(db);
  const cleanNifs = Array.from(new Set(nifs.map(n => n?.trim().toUpperCase()).filter(n => n && !n.includes('*'))));
  if (cleanNifs.length === 0) {
    return {
      total: 0,
      volumenTotal: 0,
      totalAlcazar: 0,
      volumenAlcazar: 0,
      totalOtras: 0,
      volumenOtras: 0,
      items: [],
    };
  }

  const placeholders = cleanNifs.map(() => '?').join(',');
  const rawItems = db.prepare(`
    SELECT *
    FROM grants
    WHERE beneficiary_nif IN (${placeholders})
    ORDER BY grant_date DESC, amount DESC;
  `).all(...cleanNifs) as any[];
  const items = rawItems.map((it) => ({
    ...it,
    cod_concesion: it.award_code,
    nif_beneficiario: it.beneficiary_nif,
    beneficiario: it.beneficiary,
    organo_concedente: it.granting_authority,
    organo_nivel1: it.granting_authority_level_1,
    organo_nivel2: it.granting_authority_level_2,
    organo_nivel3: it.granting_authority_level_3,
    importe: it.amount,
    ayuda_equivalente: it.equivalent_aid,
    fecha_concesion: it.grant_date,
    instrumento: it.instrument,
    convocatoria: it.call,
    numero_convocatoria: it.call_number,
    url_bases: it.terms_url,
    es_alcazar: it.is_alcazar,
  }));

  let volumenTotal = 0;
  let totalAlcazar = 0;
  let volumenAlcazar = 0;
  let totalOtras = 0;
  let volumenOtras = 0;

  for (const it of items) {
    const imp = Number(it.amount) || 0;
    volumenTotal += imp;
    if (it.is_alcazar) {
      totalAlcazar++;
      volumenAlcazar += imp;
    } else {
      totalOtras++;
      volumenOtras += imp;
    }
  }

  return {
    total: items.length,
    volumenTotal: Math.round(volumenTotal * 100) / 100,
    totalAlcazar,
    volumenAlcazar: Math.round(volumenAlcazar * 100) / 100,
    totalOtras,
    volumenOtras: Math.round(volumenOtras * 100) / 100,
    items,
  };
}

export function getEmpresaDetail(identificador: string) {
  const db = getDb();
  ensureCorporateResolutionTable(db);
  const corporateContractSource = getCorporateContractSource(db);

  // Obtener el cruce de datos completo (denominaciones históricas, dnis, grupo corporativo)
  const cruceDatos = getCorporateProfile(db, identificador);

  // Si no hay denominaciones registradas en cruceDatos, la empresa no existe
  if (!cruceDatos.denominacionesRegistradas || cruceDatos.denominacionesRegistradas.length === 0) {
    return null;
  }

  // Si pertenece a un grupo empresarial, incluir todas sus filiales
  const grupo = cruceDatos.grupoCorporativo;
  const groupCifs = grupo?.cifs || [];

  // Lista de nombres y CIFs que pertenecen a esta empresa / grupo consolidado
  const associatedCifs = Array.from(new Set([
    ...cruceDatos.dnisRegistrados.map(d => d.cif).filter(c => c && c !== 'Sin CIF registrado'),
    ...groupCifs,
  ]));
  const associatedNames = Array.from(new Set(
    cruceDatos.denominacionesRegistradas.flatMap(d => [d.nombre, ...(d.variantes || [])])
  ));

  // Canonical name and CIF
  const currentDenom = cruceDatos.denominacionesRegistradas.find(d => d.esNombreActual) || cruceDatos.denominacionesRegistradas[0];
  const canonicalNombre = currentDenom.nombre;
  const canonicalCif = cruceDatos.dniVerificado || (associatedCifs.find(c => !c.includes('*')) || associatedCifs[0] || '');

  // Cláusula WHERE consolidada para todas las variantes y filiales del grupo
  const conds: string[] = [];
  const params: any[] = [];

  if (grupo?.id) {
    conds.push(`r.group_id = ?`);
    params.push(grupo.id);
  }
  if (groupCifs.length > 0) {
    conds.push(`l.awardee_nif IN (${groupCifs.map(() => '?').join(',')})`);
    params.push(...groupCifs);
  }

  // Match por canonical_id o canonical_nif en company_resolution
  conds.push(`r.canonical_id = ? OR r.canonical_nif = ?`);
  params.push(identificador, identificador);

  if (canonicalCif) {
    conds.push(`r.canonical_nif = ? OR l.awardee_nif = ?`);
    params.push(canonicalCif, canonicalCif);
  }
  if (associatedCifs.length > 0) {
    conds.push(`l.awardee_nif IN (${associatedCifs.map(() => '?').join(',')})`);
    params.push(...associatedCifs);
  }
  if (associatedNames.length > 0) {
    conds.push(`l.awardee IN (${associatedNames.map(() => '?').join(',')})`);
    params.push(...associatedNames);
  }

  const whereClause = `(${conds.join(' OR ')})`;

  // Stats consolidados de todo el grupo / empresa
  const stats = db.prepare(`
    SELECT 
      count(DISTINCT l.id) as total_contratos,
      round(sum(CASE WHEN l.economic_nature = 'gasto' AND NOT ${terminalContractStatusSql('l')} AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido')) THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as gasto_adjudicado,
      round(sum(CASE WHEN l.economic_nature = 'ingreso' AND NOT ${terminalContractStatusSql('l')} AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido')) THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as ingresos_adjudicados,
      round(sum(CASE WHEN l.economic_nature = 'concesion' AND NOT ${terminalContractStatusSql('l')} AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido')) THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as concesiones_adjudicadas,
      round(sum(CASE WHEN NOT ${terminalContractStatusSql('l')} AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido')) THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen_total,
      count(DISTINCT coalesce(nullif(trim(l.contracting_authority_id), ''), 'unlinked-contract:' || l.id)) as organismos_distintos,
      min(l.year) as primer_ano,
      max(l.year) as ultimo_ano,
      max(coalesce(l.publication_date, l.award_date)) as ultimo_contrato
    FROM ${corporateContractSource} l
    LEFT JOIN company_resolution r 
      ON coalesce(l.awardee_nif, '') = r.raw_nif 
     AND coalesce(l.awardee, '') = r.raw_name
    WHERE ${whereClause};
  `).get(...params) as any;

  // Organismos para los que ha trabajado (consolidados)
  const organismos = db.prepare(`
    SELECT 
      coalesce(nullif(trim(l.contracting_authority_id), ''), 'unlinked-contract:' || l.id) as authority_key,
      l.contracting_authority_name,
      count(DISTINCT l.id) as contratos,
      round(sum(CASE WHEN l.economic_nature = 'gasto' AND NOT ${terminalContractStatusSql('l')} AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido')) THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as gasto_adjudicado,
      round(sum(CASE WHEN l.economic_nature = 'ingreso' AND NOT ${terminalContractStatusSql('l')} AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido')) THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as ingresos_adjudicados,
      round(sum(CASE WHEN NOT ${terminalContractStatusSql('l')} AND (l.award_amount_type IS NULL OR l.award_amount_type IN ('total', 'desconocido')) THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen
    FROM ${corporateContractSource} l
    LEFT JOIN company_resolution r 
      ON coalesce(l.awardee_nif, '') = r.raw_nif 
     AND coalesce(l.awardee, '') = r.raw_name
    WHERE ${whereClause}
    GROUP BY authority_key
    ORDER BY volumen DESC;
  `).all(...params) as any[];

  // Historial de Contratos (consolidados y enriquecidos con su denominación específica)
  const contratosRaw = db.prepare(`
    SELECT 
      l.*,
      coalesce(r.canonical_name, l.awardee) as canonical_name,
      coalesce(r.canonical_nif, l.awardee_nif) as canonical_nif,
      r.link_type,
      r.link_reason,
      (SELECT COUNT(*) FROM modifications m WHERE m.contract_id = l.id) as num_modificaciones,
      (SELECT SUM(coalesce(m.duration_days, 0)) FROM modifications m WHERE m.contract_id = l.id) as mod_prorroga_dias,
      (SELECT SUM(coalesce(m.duration_months, 0)) FROM modifications m WHERE m.contract_id = l.id) as mod_prorroga_meses,
      (SELECT SUM(coalesce(m.modification_amount, 0)) FROM modifications m WHERE m.contract_id = l.id) as mod_sobrecoste_importe
    FROM ${corporateContractSource} l
    LEFT JOIN company_resolution r 
      ON coalesce(l.awardee_nif, '') = r.raw_nif 
     AND coalesce(l.awardee, '') = r.raw_name
    WHERE ${whereClause}
    ORDER BY coalesce(l.publication_date, l.award_date) DESC;
  `).all(...params) as any[];

  // Enriquecer cada contrato con la denominación específica, cluster y filial del grupo
  const contratos = contratosRaw.map((lic: any) => {
    const rawNom = (lic.awardee || '').trim();
    const rawCif = (lic.awardee_nif || '').trim();
    const clusterKey = getClusterKey(rawNom);

    // Encontrar cluster correspondiente
    const matchedCluster = cruceDatos.denominacionesRegistradas.find(d => 
      d.clusterKey === clusterKey || 
      d.nombre.toUpperCase() === rawNom.toUpperCase() ||
      (d.variantes && d.variantes.some(v => v.toUpperCase() === rawNom.toUpperCase()))
    );

    const clusterNombre = matchedCluster ? matchedCluster.nombre : rawNom;
    const clusterEstado = matchedCluster ? matchedCluster.status : 'activa_division';
    const esDenominacionAnterior = clusterEstado === 'historica_anterior';
    const esDniEnmascarado = rawCif.includes('*');

    // Filial si pertenece a grupo corporativo
    const filialMatch = grupo?.filiales.find(f => f.cif === rawCif);
    const filialNombre = filialMatch ? filialMatch.nombre : (grupo ? rawNom : undefined);

    return {
      ...lic,
      cluster_nombre: clusterNombre,
      cluster_key: clusterKey,
      cluster_estado: clusterEstado,
      filial_cif: rawCif,
      filial_nombre: filialNombre,
      adjudicado_como: rawNom,
      cif_registrado: rawCif,
      es_denominacion_anterior: esDenominacionAnterior,
      es_dni_enmascarado: esDniEnmascarado,
      num_modificaciones: lic.num_modificaciones || 0,
      mod_prorroga_dias: lic.mod_prorroga_dias || 0,
      mod_prorroga_meses: lic.mod_prorroga_meses || 0,
      mod_sobrecoste_importe: lic.mod_sobrecoste_importe || 0,
      motivo_adjudicado: esDenominacionAnterior 
        ? `Adjudicado formalmente bajo la razón social anterior: '${rawNom}'` 
        : esDniEnmascarado 
        ? `Adjudicado con DNI enmascarado RGPD: ${rawCif}`
        : undefined,
    };
  });

  // Métricas agregadas de modifications y prórrogas en la empresa
  const totalContratosConProrroga = contratos.filter((c: any) => (c.mod_prorroga_dias || 0) > 0 || (c.mod_prorroga_meses || 0) > 0).length;
  const totalDiasProrroga = contratos.reduce((acc: number, c: any) => acc + (c.mod_prorroga_dias || 0), 0);
  const totalContratosConModificaciones = contratos.filter((c: any) => (c.num_modificaciones || 0) > 0).length;
  const totalSobrecosteModificaciones = contratos.reduce((acc: number, c: any) => acc + (c.mod_sobrecoste_importe || 0), 0);

  const modificadosEmpresa = {
    totalContratosConProrroga,
    totalDiasProrroga,
    totalContratosConModificaciones,
    totalSobrecosteModificaciones,
  };

  // Desglose de Menores vs Mayores (consolidado)
  const desgloseMenores = db.prepare(`
    SELECT 
      sum(CASE WHEN l.dataset IN ('menores', 'contratos_menores') OR l.procedure IN ('Contrato menor', 'Menor') THEN 1 ELSE 0 END) as total_menores,
      round(sum(CASE WHEN (l.dataset IN ('menores', 'contratos_menores') OR l.procedure IN ('Contrato menor', 'Menor')) AND (l.economic_nature = 'gasto' OR l.economic_nature IS NULL) AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total') THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen_menores,
      sum(CASE WHEN (l.dataset NOT IN ('menores', 'contratos_menores') OR l.dataset IS NULL) AND (l.procedure NOT IN ('Contrato menor', 'Menor') OR l.procedure IS NULL) THEN 1 ELSE 0 END) as total_mayores,
      round(sum(CASE WHEN (l.dataset NOT IN ('menores', 'contratos_menores') OR l.dataset IS NULL) AND (l.procedure NOT IN ('Contrato menor', 'Menor') OR l.procedure IS NULL) AND (l.economic_nature = 'gasto' OR l.economic_nature IS NULL) AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total') THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen_mayores,
      round(max(CASE WHEN (l.dataset IN ('menores', 'contratos_menores') OR l.procedure IN ('Contrato menor', 'Menor')) AND (l.economic_nature = 'gasto' OR l.economic_nature IS NULL) AND (l.award_amount_type IS NULL OR l.award_amount_type = 'total') THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as max_menor
    FROM ${corporateContractSource} l
    LEFT JOIN company_resolution r 
      ON coalesce(l.awardee_nif, '') = r.raw_nif 
     AND coalesce(l.awardee, '') = r.raw_name
    WHERE ${whereClause};
  `).get(...params) as any;

  // Subvenciones y ayudas públicas oficiales (BDNS / SNPSAP - IGAE)
  const nifsForSubvenciones = Array.from(new Set([
    canonicalCif,
    ...associatedCifs,
  ])).filter((c): c is string => Boolean(c && !c.includes('*')));

  const grants = getSubvencionesByNifs(db, nifsForSubvenciones);

  const canonicalId = grupo?.id 
    ? `grupo:${grupo.id}` 
    : getOpaqueEmpresaId(canonicalCif, canonicalNombre);

  return toPlain({
    id: canonicalId,
    nombre: canonicalNombre,
    nif: canonicalCif,
    total_contratos: stats?.total_contratos || 0,
    gasto_adjudicado: stats?.gasto_adjudicado || 0,
    ingresos_adjudicados: stats?.ingresos_adjudicados || 0,
    concesiones_adjudicadas: stats?.concesiones_adjudicadas || 0,
    volumen_total: stats?.volumen_total || 0,
    organismos_distintos: stats?.organismos_distintos || 0,
    primer_ano: stats?.primer_ano,
    ultimo_ano: stats?.ultimo_ano,
    ultimo_contrato: stats?.ultimo_contrato,
    cruceDatos,
    organismos,
    contratos,
    grants,
    subvenciones: grants,
    modificados: modificadosEmpresa,
    desgloseMenores: {
      totalMenores: desgloseMenores?.total_menores || 0,
      volumenMenores: desgloseMenores?.volumen_menores || 0,
      totalMayores: desgloseMenores?.total_mayores || 0,
      volumenMayores: desgloseMenores?.volumen_mayores || 0,
      maxMenor: desgloseMenores?.max_menor || 0,
    },
  });
}

export function getFilterValues() {
  const db = getDb();

  const totalGlobal = (db.prepare(`SELECT count(*) as c FROM contracts`).get() as any)?.c || 0;

  const anos = db.prepare(`
    SELECT DISTINCT cast(year as integer) as year
    FROM contracts
    WHERE year IS NOT NULL
    ORDER BY year DESC;
  `).all().map((r: any) => r.year);

  const tipos = db.prepare(`
    SELECT DISTINCT contract_type as tipo, count(*) as count
    FROM contracts
    WHERE contract_type IS NOT NULL
    GROUP BY contract_type
    ORDER BY count DESC;
  `).all() as any[];

  const procedimientos = db.prepare(`
    SELECT DISTINCT procedure as procedimiento, count(*) as count
    FROM contracts
    WHERE procedure IS NOT NULL
    GROUP BY procedure
    ORDER BY count DESC;
  `).all() as any[];

  const organismos = db.prepare(`
    SELECT
      ca.id as authorityId,
      coalesce(ca.name, contracts.contracting_authority_name) as organo,
      count(*) as count
    FROM contracts
    JOIN contracting_authorities ca ON ca.id = contracts.contracting_authority_id
    WHERE ca.active = 1
    GROUP BY ca.id
    ORDER BY count DESC;
  `).all() as any[];

  const estados = db.prepare(`
    SELECT DISTINCT status, count(*) as count
    FROM contracts
    WHERE status IS NOT NULL
    GROUP BY status
    ORDER BY count DESC;
  `).all() as any[];

  const ambitos = db.prepare(`
    SELECT DISTINCT scope, count(*) as count
    FROM contracts
    WHERE scope IS NOT NULL
    GROUP BY scope
    ORDER BY count DESC;
  `).all() as any[];

  const naturalezaCounts = db.prepare(`
    SELECT coalesce(economic_nature, 'sin_clasificar') as naturaleza, count(*) as count
    FROM contracts
    GROUP BY coalesce(economic_nature, 'sin_clasificar');
  `).all() as Array<{ naturaleza: string; count: number }>;
  const naturalezaCountMap = new Map(naturalezaCounts.map((row) => [row.naturaleza, Number(row.count) || 0]));
  const flujosEconomicos = [
    { flujo: 'paga', label: 'Gasto municipal', count: naturalezaCountMap.get('gasto') || 0 },
    { flujo: 'recibe', label: 'Ingreso municipal', count: naturalezaCountMap.get('ingreso') || 0 },
    { flujo: 'sin_flujo_directo', label: 'Sin flujo municipal directo determinado', count: naturalezaCountMap.get('concesion') || 0 },
    { flujo: 'no_determinado', label: 'Sentido económico no determinado', count: naturalezaCountMap.get('sin_clasificar') || 0 },
  ];

  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());

  const lotAwardsOfferCountCovered = hasLotAwardsTable
    ? `(
        NOT EXISTS (
          SELECT 1
          FROM contract_lots lot
          WHERE lot.contract_id = c.id
            AND lot.offer_count IS NOT NULL
            AND ${eligibleAwardLotStatusSql('lot')}
        )
        OR NOT EXISTS (
          SELECT 1
          FROM contract_lots lot
          WHERE lot.contract_id = c.id
            AND lot.offer_count IS NOT NULL
            AND ${eligibleAwardLotStatusSql('lot')}
            AND NOT EXISTS (
              SELECT 1
              FROM lot_awards award
              WHERE award.contract_id = lot.contract_id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                AND award.lot_number = lot.lot_number
                AND award.offer_count IS NOT NULL
                AND ${eligibleAwardResultStateSql('award')}
            )
        )
      )`
    : '0';

  const alMaximoLotCondition = hasLotAwardsTable
    ? `(
        c.is_lotized = 1
        AND (
          SELECT count(DISTINCT lot.lot_number)
          FROM contract_lots lot
          WHERE lot.contract_id = c.id
            AND ${eligibleAwardLotStatusSql('lot')}
            AND (
              lot.awarded_amount IS NOT NULL
              OR EXISTS (
                SELECT 1
                FROM lot_awards award
                WHERE award.contract_id = lot.contract_id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                  AND award.lot_number = lot.lot_number
                  AND award.awarded_amount IS NOT NULL
                  AND ${eligibleAwardResultStateSql('award')}
              )
            )
        ) > 1
        AND NOT EXISTS (
          SELECT 1
          FROM contract_lots lot
          WHERE lot.contract_id = c.id
            AND ${eligibleAwardLotStatusSql('lot')}
            AND (
              lot.awarded_amount IS NOT NULL
              OR EXISTS (
                SELECT 1
                FROM lot_awards award
                WHERE award.contract_id = lot.contract_id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                  AND award.lot_number = lot.lot_number
                  AND award.awarded_amount IS NOT NULL
                  AND ${eligibleAwardResultStateSql('award')}
              )
            )
            AND NOT EXISTS (
              SELECT 1
              FROM lot_awards award
              WHERE award.contract_id = lot.contract_id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                AND award.lot_number = lot.lot_number
                AND award.awarded_amount IS NOT NULL
                AND ${eligibleAwardResultStateSql('award')}
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM (
            SELECT
              lot.lot_number,
              coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0) AS budget,
              CASE
                WHEN EXISTS (
                  SELECT 1
                  FROM lot_awards award
                  WHERE award.contract_id = lot.contract_id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                    AND award.lot_number = lot.lot_number
                    AND award.awarded_amount IS NOT NULL
                    AND ${eligibleAwardResultStateSql('award')}
                )
                THEN (
                  SELECT sum(award.awarded_amount)
                  FROM lot_awards award
                  WHERE award.contract_id = lot.contract_id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                    AND award.lot_number = lot.lot_number
                    AND award.awarded_amount IS NOT NULL
                    AND ${eligibleAwardResultStateSql('award')}
                )
                ELSE lot.awarded_amount
              END AS awarded
            FROM contract_lots lot
            WHERE lot.contract_id = c.id
              AND ${eligibleAwardLotStatusSql('lot')}
              AND (
                lot.awarded_amount IS NOT NULL
                OR EXISTS (
                  SELECT 1
                  FROM lot_awards award
                  WHERE award.contract_id = lot.contract_id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
                    AND award.lot_number = lot.lot_number
                    AND award.awarded_amount IS NOT NULL
                    AND ${eligibleAwardResultStateSql('award')}
                )
              )
          ) lot_totals
          WHERE lot_totals.budget <= 0
             OR lot_totals.awarded <= 0
             OR abs(lot_totals.awarded - lot_totals.budget) > 0.05
        )
      )`
    : `(
            c.is_lotized = 1
            AND (
              SELECT count(*) FROM contract_lots lot
              WHERE lot.contract_id = c.id
            ) > 1
            AND EXISTS (
              SELECT 1 FROM contract_lots lot
              WHERE lot.contract_id = c.id
                AND lot.awarded_amount IS NOT NULL
                AND ${eligibleAwardLotStatusSql('lot')}
            )
            AND NOT EXISTS (
              SELECT 1 FROM contract_lots lot
              WHERE lot.contract_id = c.id
                AND lot.awarded_amount IS NOT NULL
                AND ${eligibleAwardLotStatusSql('lot')}
                AND (
                  coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0) <= 0
                  OR lot.awarded_amount <= 0
                  OR abs(lot.awarded_amount - coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0)) > 0.05
                )
            )`;

  const alertasCounts = {
    ofertaUnica: (db.prepare(`
      SELECT count(*) as c
      FROM contracts c
      WHERE c.procedure NOT IN ('Menor', 'Contrato menor')
        AND NOT ${terminalContractStatusSql('c')}
        AND (
          c.offer_count = 1
          OR EXISTS (
            SELECT 1
            FROM contract_lots lot
            WHERE lot.contract_id = c.id
              AND lot.offer_count = 1
              AND lot.awardee IS NOT NULL
              AND trim(lot.awardee) <> ''
              AND ${eligibleAwardLotStatusSql('lot')}
          )
          OR (${lotAwardsOfferCountCovered} AND EXISTS (
            SELECT 1
            FROM lot_awards award
            WHERE award.contract_id = c.id
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
              AND award.offer_count = 1
              AND award.awardee IS NOT NULL
              AND trim(award.awardee) <> ''
              AND ${eligibleAwardResultStateSql('award')}
          ))
        )
    `).get() as any)?.c || 0,
    alMaximo: (db.prepare(`
      SELECT count(*) as c
      FROM contracts c
      WHERE (c.award_amount_type IS NULL OR c.award_amount_type = 'total')
        AND c.procedure NOT IN ('Menor', 'Contrato menor')
        AND NOT ${terminalContractStatusSql('c')}
        AND (
          (
            c.amount_excl_vat > 0
            AND c.awarded_amount > 0
            AND abs(c.awarded_amount - c.amount_excl_vat) <= 0.05
            AND NOT EXISTS (
              SELECT 1 FROM contract_lots lot
              WHERE lot.contract_id = c.id
                AND lot.awarded_amount IS NOT NULL
            )
          )
          OR ${alMaximoLotCondition}
        )
    `).get() as any)?.c || 0,
    alertaMenor: (db.prepare("SELECT count(*) as c FROM contracts WHERE (dataset IN ('menores', 'contratos_menores') OR procedure IN ('Menor', 'Contrato menor')) AND ((lower(contract_type) LIKE '%obra%' AND estimated_value >= 36000 AND estimated_value < 40000) OR (lower(contract_type) NOT LIKE '%obra%' AND estimated_value >= 13500 AND estimated_value < 15000))").get() as any)?.c || 0,
    fondosUe: (db.prepare("SELECT count(*) as c FROM contracts WHERE eu_funding = '1' OR object_description LIKE '%PRTR%' OR object_description LIKE '%NextGeneration%' OR object_description LIKE '%FEDER%' OR object_description LIKE '%FSE%' OR object_description LIKE '%fondos europeos%'").get() as any)?.c || 0,
    prorroga: (db.prepare("SELECT count(DISTINCT contract_id) as c FROM modifications WHERE duration_days > 0 OR duration_value > 0").get() as any)?.c || 0,
    modifications: (db.prepare("SELECT count(DISTINCT contract_id) as c FROM modifications").get() as any)?.c || 0,
  };

  return toPlain({
    totalGlobal,
    anos,
    tipos,
    procedimientos,
    organismos,
    estados,
    ambitos,
    flujosEconomicos,
    alertasCounts,
  });
}

// -----------------------------------------------------------------------------
// V2 OBSERVATORIO: Consultas de Alertas Precalculadas y Grupos Empresariales
// -----------------------------------------------------------------------------

export interface AlertaContratoDetalle {
  id: string;
  case_number: string;
  expediente: string;
  object_description: string;
  objeto: string;
  amount: number | null;
  importe?: number | string | null;
  awardee: string;
  adjudicatario: string;
  nifAdjudicatario: string | null;
  empresaId?: string;
  document_date: string | null;
  status: string;
  organo: string;
  procedimiento: string;
}

export interface AlertaRelacionadosInfo {
  grupoId: string;
  scoreSimilitud: number;
  importeAcumulado: number;
  motivos: Array<{ label: string; scoreContribution: number }>;
}

export type CategoriaAlerta = 'A' | 'B' | 'C' | 'D' | 'E';

export interface LicitacionDocumento {
  id: string;
  contract_id: string;
  case_number?: string | null;
  document_date?: string | null;
  title: string;
  url: string;
  document_type?: string;
  is_abnormally_low_bid_justification: boolean;
}

export interface AlertaV2 {
  id: string;
  category: CategoriaAlerta;
  tipo: 'CONTRATOS_RELACIONADOS' | 'OFERTA_UNICA' | 'BAJA_ACUSADA' | string;
  title: string;
  description: string;
  datoObjetivo: string;
  source: string;
  urlFuente: string;
  fechaExtraccion: string;
  reglaAplicada: string;
  versionMetodologia: string;
  limitations: string;
  explicacionAlternativa: string;
  level: 'ALTA' | 'MEDIA' | 'INFORMATIVA';
  requiereRevisionHumana: boolean;

  // Campos adicionales compatibles
  severity: 'ALTA' | 'MEDIA' | 'INFORMATIVA';
  scoreEscala: number;
  confidence: number;
  evidence: string;
  factores: Array<{ label: string; scoreContribution: number }>;
  patronContinuidad?: string | null;
  explicacionesAlternativas?: string[];
  documentosInvestigacion?: string[];
  justificada?: boolean;
  documentoJustificacionUrl?: string | null;
  documentoJustificacionTitulo?: string | null;
  documentoJustificacionFecha?: string | null;
  fechaCreacion: string;
  contratoIds?: string[];
  contratosDetalle?: AlertaContratoDetalle[];
  relacionadosInfo?: AlertaRelacionadosInfo | null;
  awardee?: string | null;
  adjudicatario?: string | null;
  amount?: string | null;
  importe?: string | null;
  procedimiento?: string | null;
}

export interface AuditoriaKpis {
  totalAlertas: number;
  severidades: { alta: number; media: number; informativa: number };
  tipos: {
    bajasAcusadas: number;
    menoresRelacionados: number;
    ofertaUnica: number;
    negociadoSinPublicidad?: number;
  };
  totalContratosConAlerta: number;
  volumenAuditado: number;
}

export function getAlertasV2(options?: {
  tipo?: string;
  severity?: string;
  severidad?: string;
  scope?: string;
  search?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'recientes' | 'confidence';
}): { 
  alerts: AlertaV2[];
  alertas: AlertaV2[];
  total: number; 
  conteoPorSeveridad: { alta: number; media: number; informativa: number };
  conteoPorTipo: {
    bajasAcusadas: number;
    menoresRelacionados: number;
    ofertaUnica: number;
    negociadoSinPublicidad?: number;
  };
} {
  const db = getDb();
  const whereParts: string[] = [];
  const params: any[] = [];

  if (options?.tipo && options.tipo !== 'TODOS') {
    whereParts.push('type = ?');
    params.push(options.tipo);
  }
  const severityFilter = options?.severity ?? options?.severidad;
  if (severityFilter && severityFilter !== 'TODAS') {
    whereParts.push('severity = ?');
    params.push(severityFilter.toUpperCase());
  }
  if (options?.search && options.search.trim()) {
    const q = `%${options.search.trim()}%`;
    whereParts.push('(title LIKE ? OR description LIKE ? OR evidence LIKE ?)');
    params.push(q, q, q);
  }
  const parsedScope = parseScope(options?.scope);
  if (parsedScope) {
    whereParts.push(`id IN (
      SELECT ac.alert_id FROM alert_contracts ac
      JOIN contracts l ON ac.contract_id = l.id
      WHERE l.scope = ?
    )`);
    params.push(parsedScope);
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT count(*) as c FROM alerts ${whereClause}`).get(...params) as any)?.c || 0;

  const conteoRow = db.prepare(`
    SELECT
      sum(case when severity = 'ALTA' then 1 else 0 end) as alta,
      sum(case when severity = 'MEDIA' then 1 else 0 end) as media,
      sum(case when severity = 'INFORMATIVA' then 1 else 0 end) as informativa,
      sum(case when type = 'BAJA_ACUSADA' then 1 else 0 end) as bajas,
      sum(case when type = 'CONTRATOS_RELACIONADOS' then 1 else 0 end) as menores,
      sum(case when type = 'OFERTA_UNICA' then 1 else 0 end) as oferta_unica,
      sum(case when type = 'NEGOCIADO_SIN_PUBLICIDAD' then 1 else 0 end) as negociado_sin_pub
    FROM alerts;
  `).get() as any;

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const orderByMode = options?.orderBy ?? 'recientes';

  const orderClause = orderByMode === 'confidence'
    ? `ORDER BY 
        CASE severity WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END,
        confidence DESC`
    : `ORDER BY 
        CASE severity WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END,
        (
          SELECT coalesce(max(coalesce(l.award_date, l.publication_date)), '1970-01-01')
          FROM alert_contracts ac
          JOIN contracts l ON ac.contract_id = l.id
          WHERE ac.alert_id = alerts.id
        ) DESC,
        confidence DESC`;

  const rows = db.prepare(`
    SELECT
      id, category, type AS tipo, severity, scale_score, confidence, title, description,
      target_data, source, source_url, extracted_at, applied_rule, methodology_version,
      limitations, alternative_explanation, requires_human_review,
      evidence, factors_json, continuity_pattern, explanations_json, documents_json, created_at
    FROM alerts
    ${whereClause}
    ${orderClause}
    LIMIT ? OFFSET ?;
  `).all(...params, limit, offset) as any[];

  const alertaIds = rows.map((r) => r.id);
  const contratosPorAlerta = new Map<string, string[]>();
  const contratosDetallePorAlerta = new Map<string, AlertaContratoDetalle[]>();
  const relacionadosInfoPorAlerta = new Map<string, AlertaRelacionadosInfo>();

  if (alertaIds.length > 0) {
    const placeholders = alertaIds.map(() => '?').join(',');
    
    // 1. Contratos asociados detallados
    const relRows = db.prepare(`
      SELECT
        ac.alert_id,
        l.id,
        l.case_number,
        l.object_description,
        CASE WHEN l.award_amount_type IS NULL OR l.award_amount_type = 'total' THEN coalesce(l.awarded_amount, 0) ELSE NULL END as amount,
        l.award_amount_type,
        coalesce(l.awardee, 'Sin awardee') as awardee,
        l.awardee_nif,
        coalesce(l.award_date, l.publication_date) as document_date,
        l.status,
        l.contracting_authority_name as organo,
        l.procedure AS procedimiento
      FROM alert_contracts ac
      JOIN contracts l ON ac.contract_id = l.id
      WHERE ac.alert_id IN (${placeholders})
      ORDER BY coalesce(l.award_date, l.publication_date) DESC;
    `).all(...alertaIds) as any[];

    const lotRows = db.prepare(`
      SELECT
        contract_id,
        round(sum(CASE
          WHEN awarded_amount IS NOT NULL
            AND ${eligibleAwardLotStatusSql()}
          THEN awarded_amount ELSE 0
        END), 2) AS lot_amount,
        count(DISTINCT CASE
          WHEN awarded_amount IS NOT NULL
            AND ${eligibleAwardLotStatusSql()}
          THEN lot_number
        END) AS lot_amount_lots,
        count(DISTINCT CASE
          WHEN trim(coalesce(awardee, '')) <> ''
            AND ${eligibleAwardLotStatusSql()}
          THEN lot_number
        END) AS lot_awardee_lots,
        group_concat(DISTINCT CASE
          WHEN trim(coalesce(awardee, '')) <> ''
            AND ${eligibleAwardLotStatusSql()}
          THEN awardee
        END) AS lot_awardees
      FROM contract_lots
      WHERE contract_id IN (
        SELECT DISTINCT contract_id
        FROM alert_contracts
        WHERE alert_id IN (${placeholders})
      )
      GROUP BY contract_id
    `).all(...alertaIds) as any[];

    const lotAwardRows = db.prepare(`
      SELECT
        contract_id,
        round(sum(CASE
          WHEN awarded_amount IS NOT NULL
            AND ${eligibleAwardResultStateSql()}
          THEN awarded_amount ELSE 0
        END), 2) AS award_amount,
        count(DISTINCT CASE
          WHEN awarded_amount IS NOT NULL
            AND ${eligibleAwardResultStateSql()}
          THEN lot_number
        END) AS award_amount_lots,
        count(DISTINCT CASE
          WHEN trim(coalesce(awardee, '')) <> ''
            AND ${eligibleAwardResultStateSql()}
          THEN lot_number
        END) AS award_awardee_lots,
        group_concat(DISTINCT CASE
          WHEN trim(coalesce(awardee, '')) <> ''
            AND ${eligibleAwardResultStateSql()}
          THEN awardee
        END) AS award_awardees
      FROM lot_awards award
      WHERE contract_id IN (
        SELECT DISTINCT contract_id
        FROM alert_contracts
        WHERE alert_id IN (${placeholders})
      )
        AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
      GROUP BY contract_id
    `).all(...alertaIds) as any[];

    const lotByContract = new Map<string, {
      lot_amount: number | null;
      lot_amount_lots: number;
      lot_awardee_lots: number;
      lot_awardees: string | null;
    }>(lotRows.map((row) => [row.contract_id, row]));

    const lotAwardByContract = new Map<string, {
      award_amount: number | null;
      award_amount_lots: number;
      award_awardee_lots: number;
      award_awardees: string | null;
    }>(lotAwardRows.map((row) => [row.contract_id, row]));

    for (const row of relRows) {
      const lot = lotByContract.get(row.id);
      const award = lotAwardByContract.get(row.id);
      if (!lot && !award) continue;

      const awardeeCovered = Boolean(
        award?.award_awardees &&
        Number(award.award_awardee_lots) >= Number(lot?.lot_awardee_lots || 0)
      );
      const amountCovered = Boolean(
        award &&
        Number(award.award_amount_lots) >= Number(lot?.lot_amount_lots || 0)
      );

      if (awardeeCovered && award?.award_awardees) {
        row.awardee = award.award_awardees.split(',').join(', ');
        row.awardee_nif = null;
      } else if (lot?.lot_awardees) {
        row.awardee = lot.lot_awardees.split(',').join(', ');
        row.awardee_nif = null;
      }

      if (row.award_amount_type === null || row.award_amount_type === 'total') {
        if (amountCovered && award && Number(award.award_amount_lots) > 0) {
          row.amount = Number(award.award_amount) || 0;
        } else if (lot) {
          row.amount = Number(lot.lot_amount) > 0 ? Number(lot.lot_amount) : 0;
        }
      }
    }

    for (const r of relRows) {
      const arrIds = contratosPorAlerta.get(r.alert_id) || [];
      arrIds.push(r.id);
      contratosPorAlerta.set(r.alert_id, arrIds);

      const arrDet = contratosDetallePorAlerta.get(r.alert_id) || [];
      arrDet.push({
        id: r.id,
        case_number: r.case_number || 'Sin exp.',
        expediente: r.case_number || 'Sin exp.',
        object_description: r.object_description || '',
        objeto: r.object_description || '',
        amount: Number(r.amount) || 0,
        importe: Number(r.amount) || 0,
        awardee: r.awardee,
        adjudicatario: r.awardee,
        nifAdjudicatario: r.awardee_nif,
        empresaId: getOpaqueEmpresaId(r.awardee_nif, r.awardee),
        document_date: r.document_date ? r.document_date.substring(0, 10) : null,
        status: r.status,
        organo: r.organo,
        procedimiento: r.procedimiento,
      });
      contratosDetallePorAlerta.set(r.alert_id, arrDet);
    }

    // 2. Info de contratos relacionados
    const crRows = db.prepare(`
      SELECT group_id, similarity_score, accumulated_amount, reasons_json
      FROM related_contracts
      WHERE group_id IN (${placeholders})
      GROUP BY group_id;
    `).all(...alertaIds) as any[];

    for (const cr of crRows) {
      let motivos = [];
      try {
        motivos = JSON.parse(cr.reasons_json || '[]');
      } catch {}
      relacionadosInfoPorAlerta.set(cr.group_id, {
        grupoId: cr.group_id,
        scoreSimilitud: Number(cr.similarity_score) || 0,
        importeAcumulado: Number(cr.accumulated_amount) || 0,
        motivos,
      });
    }
  }

  // Resolve justification documents dynamically for justified alerts
  const docJustMap = new Map<string, { url: string; title: string; document_date: string | null }>();
  const justifiedAlertIds = rows.filter((r) => r.continuity_pattern === 'baja_justificada').map((r) => r.id);
  if (justifiedAlertIds.length > 0) {
    try {
      const qPlaceholders = justifiedAlertIds.map(() => '?').join(',');
      const docRows = db.prepare(`
        SELECT ac.alert_id, ld.title, ld.source_url AS url, ld.document_date
        FROM alert_contracts ac
        JOIN contract_documents ld ON ac.contract_id = ld.contract_id
        WHERE ac.alert_id IN (${qPlaceholders}) AND ld.is_abnormally_low_bid_justification = 1
        ORDER BY ld.document_date DESC;
      `).all(...justifiedAlertIds) as any[];
      for (const d of docRows) {
        if (!docJustMap.has(d.alert_id)) {
          docJustMap.set(d.alert_id, { url: d.url, title: d.title, document_date: d.document_date || null });
        }
      }
    } catch {}
  }

  const alerts: AlertaV2[] = rows.map((r) => {
    let factores = [];
    try {
      factores = JSON.parse(r.factors_json || '[]');
    } catch {}
    let explicacionesAlternativas: string[] = [];
    try {
      explicacionesAlternativas = JSON.parse(r.explanations_json || '[]');
    } catch {}
    let documentosInvestigacion: string[] = [];
    try {
      documentosInvestigacion = JSON.parse(r.documents_json || '[]');
    } catch {}

    const isJustificada = r.continuity_pattern === 'baja_justificada';
    const justDoc = isJustificada ? docJustMap.get(r.id) : null;
    const det = contratosDetallePorAlerta.get(r.id) || [];

    // Adjudicatario resolver
    let awardee: string | null = null;
    if (det.length > 0) {
      const validAdjs = Array.from(
        new Set(
          det
            .map((c) => c.awardee)
            .filter((a): a is string => Boolean(a && a.trim() && a !== 'Sin awardee'))
        )
      );
      awardee = validAdjs.length > 0 ? validAdjs.join(', ') : (det[0].awardee || null);
    }

    // Importe resolver (formateado en euros)
    let amount: string | null = null;
    if (det.length > 0) {
      const totalImp = det.reduce((sum, c) => sum + (c.amount || 0), 0);
      amount = totalImp > 0 ? formatCurrency(totalImp) : null;
    }

    // Procedimiento resolver
    const procedimiento = det.length > 0 ? (det[0].procedimiento || null) : null;

    return {
      id: r.id,
      category: (r.category || 'C') as CategoriaAlerta,
      categoria: r.category,
      tipo: r.tipo,
      severity: r.severity,
      severidad: r.severity,
      level: r.severity,
      nivel: r.severity,
      scoreEscala: Number(r.scale_score) || 0,
      score_escala: Number(r.scale_score) || 0,
      confidence: r.confidence,
      confianza: r.confidence,
      title: r.title,
      titulo: r.title,
      description: r.description,
      descripcion: r.description,
      datoObjetivo: r.target_data || '',
      source: r.source || 'Plataforma de Contratación del Sector Público (PLACSP)',
      urlFuente: r.source_url || 'Enlace oficial no disponible en los datos consultados',
      fechaExtraccion: r.extracted_at || r.created_at,
      reglaAplicada: r.applied_rule || '',
      versionMetodologia: r.methodology_version || 'v2.1',
      limitations: r.limitations || '',
      explicacionAlternativa: r.alternative_explanation || '',
      requiereRevisionHumana: Boolean(r.requires_human_review ?? 1),
      evidence: r.evidence,
      evidencia: r.evidence,
      factores,
      patronContinuidad: r.continuity_pattern || null,
      explicacionesAlternativas,
      documentosInvestigacion,
      justificada: isJustificada,
      documentoJustificacionUrl: justDoc?.url || null,
      documentoJustificacionTitulo: justDoc?.title || null,
      documentoJustificacionFecha: justDoc?.document_date || null,
      fechaCreacion: r.created_at,
      contratoIds: contratosPorAlerta.get(r.id) || [],
      contratosDetalle: det,
      relacionadosInfo: relacionadosInfoPorAlerta.get(r.id) || null,
      awardee,
      adjudicatario: awardee,
      amount,
      importe: amount,
      procedimiento,
    };
  });

  return toPlain({
    alerts,
    alertas: alerts,
    total,
    conteoPorSeveridad: {
      alta: Number(conteoRow?.alta || 0),
      media: Number(conteoRow?.media || 0),
      informativa: Number(conteoRow?.informativa || 0),
    },
    conteoPorTipo: {
      bajasAcusadas: Number(conteoRow?.bajas || 0),
      menoresRelacionados: Number(conteoRow?.menores || 0),
      ofertaUnica: Number(conteoRow?.oferta_unica || 0),
      negociadoSinPublicidad: Number(conteoRow?.negociado_sin_pub || 0),
    },
  });
}

export function getAuditoriaKpis(scope?: string): AuditoriaKpis {
  const db = getDb();
  const corporateContractSource = getCorporateContractSource(db);
  const filterScope = parseScope(scope);
  
  let whereScope = '';
  const params: any[] = [];
  if (filterScope) {
    whereScope = `WHERE id IN (
      SELECT ac.alert_id FROM alert_contracts ac
      JOIN contracts l ON ac.contract_id = l.id
      WHERE l.scope = ?
    )`;
    params.push(filterScope);
  }

  const counts = db.prepare(`
    SELECT
      count(*) as total,
      sum(case when severity = 'ALTA' then 1 else 0 end) as alta,
      sum(case when severity = 'MEDIA' then 1 else 0 end) as media,
      sum(case when severity = 'INFORMATIVA' then 1 else 0 end) as informativa,
      sum(case when type = 'BAJA_ACUSADA' then 1 else 0 end) as bajas,
      sum(case when type = 'CONTRATOS_RELACIONADOS' then 1 else 0 end) as menores,
      sum(case when type = 'OFERTA_UNICA' then 1 else 0 end) as oferta_unica,
      sum(case when type = 'NEGOCIADO_SIN_PUBLICIDAD' then 1 else 0 end) as negociado_sin_pub
    FROM alerts
    ${whereScope};
  `).get(...params) as any;

  const volParams: any[] = [];
  let volWhere = '';
  if (filterScope) {
    volWhere = 'WHERE l.scope = ?';
    volParams.push(filterScope);
  }

  const vol = db.prepare(`
    SELECT 
      round(sum(CASE WHEN l.award_amount_type IS NULL OR l.award_amount_type = 'total' THEN coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as vol,
      count(DISTINCT l.id) as contratos
    FROM ${corporateContractSource} l
    JOIN (SELECT DISTINCT contract_id FROM alert_contracts) ac ON l.id = ac.contract_id
    ${volWhere};
  `).get(...volParams) as any;

  return toPlain({
    totalAlertas: Number(counts?.total || 0),
    severidades: {
      alta: Number(counts?.alta || 0),
      media: Number(counts?.media || 0),
      informativa: Number(counts?.informativa || 0),
    },
    tipos: {
      bajasAcusadas: Number(counts?.bajas || 0),
      menoresRelacionados: Number(counts?.menores || 0),
      ofertaUnica: Number(counts?.oferta_unica || 0),
      negociadoSinPublicidad: Number(counts?.negociado_sin_pub || 0),
    },
    totalContratosConAlerta: Number(vol?.contratos || 0),
    volumenAuditado: Number(vol?.vol || 0),
  });
}

export function getAlertasForContract(contratoId: string): AlertaV2[] {
  const db = getDb();
  const resolved = db.prepare(`
    SELECT id FROM contracts
    WHERE id = ? OR placsp_id = ? OR source_url = ? OR source_url LIKE '%' || '/' || ?
    LIMIT 2
  `).all(contratoId, contratoId, contratoId, contratoId) as any[];
  if (resolved.length > 1) throw new Error(`Identificador de contrato ambiguo: ${contratoId}`);
  const resolvedId = resolved[0]?.id || contratoId;

  const hasLotAwardsTable = (() => {
    try {
      return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards'").get() != null;
    } catch {
      return false;
    }
  })();

  const lotAwardsAmountCovered = hasLotAwardsTable
    ? `EXISTS (
        SELECT 1
        FROM lot_awards la
        WHERE la.contract_id = l.id
          AND ${eligibleAwardResultStateSql('la')}
          AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
          AND la.awarded_amount IS NOT NULL
      ) AND ${lotAwardsAmountCoverageSql('l')}`
    : '0';

  const rows = db.prepare(`
    SELECT
      a.id, a.category, a.type AS tipo, a.severity, a.scale_score, a.confidence, a.title, a.description,
      a.target_data, a.source, a.source_url, a.extracted_at, a.applied_rule, a.methodology_version,
      a.limitations, a.alternative_explanation, a.requires_human_review,
      a.evidence, a.factors_json, a.continuity_pattern, a.explanations_json, a.documents_json,
      a.created_at
    FROM alerts a
    INNER JOIN alert_contracts ac ON a.id = ac.alert_id
    WHERE ac.contract_id = ?
    ORDER BY CASE a.severity WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END, a.confidence DESC;
  `).all(resolvedId) as any[];

  const alertaIds = rows.map((r) => r.id);
  const contratosPorAlerta = new Map<string, string[]>();
  const contratosDetallePorAlerta = new Map<string, AlertaContratoDetalle[]>();
  const relacionadosInfoPorAlerta = new Map<string, AlertaRelacionadosInfo>();

  if (alertaIds.length > 0) {
    const placeholders = alertaIds.map(() => '?').join(',');

    // 1. Contratos asociados detallados
    const relRows = db.prepare(`
      SELECT 
        ac.alert_id, 
        l.id, 
        l.case_number, 
        l.object_description, 
        CASE
          WHEN l.award_amount_type IS NULL OR l.award_amount_type = 'total'
          THEN CASE
            WHEN ${lotAwardsAmountCovered}
            THEN (
              SELECT round(sum(la.awarded_amount), 2)
              FROM lot_awards la
              WHERE la.contract_id = l.id
                AND la.awarded_amount IS NOT NULL
                AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
            )
            WHEN EXISTS (
              SELECT 1
              FROM contract_lots lot
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
        END as amount,
        l.award_amount_type,
        coalesce(l.awardee, 'Sin awardee') as awardee,
        l.awardee_nif,
        coalesce(l.award_date, l.publication_date) as document_date,
        l.status,
        l.contracting_authority_name as organo,
        l.procedure
      FROM alert_contracts ac
      JOIN contracts l ON ac.contract_id = l.id
      WHERE ac.alert_id IN (${placeholders})
      ORDER BY coalesce(l.award_date, l.publication_date) DESC;
    `).all(...alertaIds) as any[];

    for (const r of relRows) {
      const arrIds = contratosPorAlerta.get(r.alert_id) || [];
      arrIds.push(r.id);
      contratosPorAlerta.set(r.alert_id, arrIds);

      const arrDet = contratosDetallePorAlerta.get(r.alert_id) || [];
      arrDet.push({
        id: r.id,
        case_number: r.case_number || 'Sin exp.',
        expediente: r.case_number || 'Sin exp.',
        object_description: r.object_description || '',
        objeto: r.object_description || '',
        amount: r.amount == null ? null : Number(r.amount),
        importe: r.amount == null ? null : Number(r.amount),
        awardee: r.awardee,
        adjudicatario: r.awardee,
        nifAdjudicatario: r.awardee_nif,
        empresaId: getOpaqueEmpresaId(r.awardee_nif, r.awardee),
        document_date: r.document_date ? r.document_date.substring(0, 10) : null,
        status: r.status,
        organo: r.organo,
        procedimiento: r.procedimiento,
      });
      contratosDetallePorAlerta.set(r.alert_id, arrDet);
    }

    // 2. Info de contratos relacionados
    const crRows = db.prepare(`
      SELECT group_id, similarity_score, accumulated_amount, reasons_json
      FROM related_contracts
      WHERE group_id IN (${placeholders})
      GROUP BY group_id;
    `).all(...alertaIds) as any[];

    for (const cr of crRows) {
      let motivos = [];
      try {
        motivos = JSON.parse(cr.reasons_json || '[]');
      } catch {}
      relacionadosInfoPorAlerta.set(cr.group_id, {
        grupoId: cr.group_id,
        scoreSimilitud: Number(cr.similarity_score) || 0,
        importeAcumulado: Number(cr.accumulated_amount) || 0,
        motivos,
      });
    }
  }

  let justDoc: any = null;
  try {
    justDoc = db.prepare(`
      SELECT title, source_url AS url, document_date
      FROM contract_documents
      WHERE contract_id = ? AND is_abnormally_low_bid_justification = 1
      ORDER BY document_date DESC, id ASC
      LIMIT 1
    `).get(resolvedId);
  } catch {}

  return toPlain(
    rows.map((r) => {
      let factores = [];
      try {
        factores = JSON.parse(r.factors_json || '[]');
      } catch {}
      let explicacionesAlternativas: string[] = [];
      try {
        explicacionesAlternativas = JSON.parse(r.explanations_json || '[]');
      } catch {}
      let documentosInvestigacion: string[] = [];
      try {
        documentosInvestigacion = JSON.parse(r.documents_json || '[]');
      } catch {}

      const isJustificada = r.continuity_pattern === 'baja_justificada';
      const det = contratosDetallePorAlerta.get(r.id) || [];

      // Adjudicatario resolver
      let awardee: string | null = null;
      if (det.length > 0) {
        const validAdjs = Array.from(
          new Set(
            det
              .map((c) => c.awardee)
              .filter((a): a is string => Boolean(a && a.trim() && a !== 'Sin awardee'))
          )
        );
        awardee = validAdjs.length > 0 ? validAdjs.join(', ') : (det[0].awardee || null);
      }

      // Importe resolver (formateado en euros)
      let amount: string | null = null;
      if (det.length > 0) {
        const totalImp = det.reduce((sum, c) => sum + (c.amount || 0), 0);
        amount = totalImp > 0 ? formatCurrency(totalImp) : null;
      }

      // Procedimiento resolver
      const procedimiento = det.length > 0 ? (det[0].procedimiento || null) : null;

      return {
        id: r.id,
        category: (r.category || 'C') as CategoriaAlerta,
        tipo: r.tipo,
        severity: r.severity,
        level: r.severity,
        scoreEscala: Number(r.scale_score) || 0,
        confidence: r.confidence,
        title: r.title,
        description: r.description,
        datoObjetivo: r.target_data || '',
        source: r.source || 'Plataforma de Contratación del Sector Público (PLACSP)',
        urlFuente: r.source_url || 'Enlace oficial no disponible en los datos consultados',
        fechaExtraccion: r.extracted_at || r.created_at,
        reglaAplicada: r.applied_rule || '',
        versionMetodologia: r.methodology_version || 'v2.1',
        limitations: r.limitations || '',
        explicacionAlternativa: r.alternative_explanation || '',
        requiereRevisionHumana: Boolean(r.requires_human_review ?? 1),
        evidence: r.evidence,
        factores,
        patronContinuidad: r.continuity_pattern || null,
        explicacionesAlternativas,
        documentosInvestigacion,
        justificada: isJustificada,
        documentoJustificacionUrl: isJustificada ? (justDoc?.url || null) : null,
        documentoJustificacionTitulo: isJustificada ? (justDoc?.title || null) : null,
        documentoJustificacionFecha: isJustificada ? (justDoc?.document_date || null) : null,
        fechaCreacion: r.created_at,
        contratoIds: contratosPorAlerta.get(r.id) || [],
        contratosDetalle: det,
        relacionadosInfo: relacionadosInfoPorAlerta.get(r.id) || null,
        awardee,
        amount,
        procedimiento,
      };
    })
  );
}

export function getGruposEmpresarialesDB(): Array<{
  grupoId: string;
  nombreGrupo: string;
  cifs: string[];
  ambito: string;
  description: string;
}> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT group_id, group_name, associated_nifs_json, scope AS ambito, description
    FROM corporate_groups
    ORDER BY group_name ASC;
  `).all() as any[];

  return toPlain(
    rows.map((r) => {
      let cifs: string[] = [];
      try {
        cifs = JSON.parse(r.associated_nifs_json || '[]');
      } catch {}
      return {
        grupoId: r.group_id,
        nombreGrupo: r.group_name,
        cifs,
        ambito: r.ambito || '',
        description: r.description || '',
      };
    })
  );
}

export function getAlertasForEmpresa(identifier: string): AlertaV2[] {
  const db = getDb();
  ensureCorporateResolutionTable(db);

  const hasLotAwardsTable = (() => {
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT name FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards'").all() as Array<{ name: string }>;
      return tables.length > 0;
    } catch {
      return false;
    }
  })();

  const lotAwardsAwardeeCovered = hasLotAwardsTable
    ? `(
        NOT EXISTS (
          SELECT 1
          FROM contract_lots lot
          WHERE lot.contract_id = l.id
            AND lot.awardee IS NOT NULL
            AND trim(lot.awardee) <> ''
            AND ${eligibleAwardLotStatusSql('lot')}
            AND NOT EXISTS (
              SELECT 1
              FROM lot_awards award
              WHERE award.contract_id = lot.contract_id
                AND award.lot_number = lot.lot_number
                AND award.awardee IS NOT NULL
                AND trim(award.awardee) <> ''
                AND ${eligibleAwardResultStateSql('award')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
            )
        )
      )`
    : '0';
  const lotAwardsCompanyMatch = hasLotAwardsTable
    ? `OR (${lotAwardsAwardeeCovered} AND EXISTS (
         SELECT 1
         FROM lot_awards la
         LEFT JOIN company_resolution lar
           ON coalesce(la.awardee_nif, '') = lar.raw_nif
          AND coalesce(la.awardee, '') = lar.raw_name
         WHERE la.contract_id = l.id
           AND la.awardee IS NOT NULL
           AND la.awardee != ''
           AND ${eligibleAwardResultStateSql('la')}
           AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
           AND (
             la.awardee_nif = ?
             OR lar.canonical_id = ?
             OR lar.canonical_nif = ?
             OR la.awardee = ?
           )
       ))`
    : '';

  const params = hasLotAwardsTable
    ? [identifier, identifier, identifier, identifier, identifier, identifier, identifier, identifier, identifier, identifier, identifier, identifier]
    : [identifier, identifier, identifier, identifier, identifier, identifier, identifier, identifier];

  const rows = db.prepare(`
    SELECT DISTINCT
      a.id, a.category, a.type AS tipo, a.severity, a.scale_score, a.confidence, a.title, a.description,
      a.target_data, a.source, a.source_url, a.extracted_at, a.applied_rule, a.methodology_version,
      a.limitations, a.alternative_explanation, a.requires_human_review,
      a.evidence, a.factors_json, a.continuity_pattern, a.explanations_json, a.documents_json, a.created_at
    FROM alerts a
    INNER JOIN alert_contracts ac ON a.id = ac.alert_id
    INNER JOIN contracts l ON ac.contract_id = l.id
    LEFT JOIN company_resolution r
      ON coalesce(l.awardee_nif, '') = r.raw_nif
     AND coalesce(l.awardee, '') = r.raw_name
    WHERE l.awardee_nif = ?
       OR r.canonical_id = ?
       OR r.canonical_nif = ?
       OR l.awardee = ?
       OR ((NOT ${lotAwardsAwardeeCovered}) AND EXISTS (
         SELECT 1
         FROM contract_lots ll
         LEFT JOIN company_resolution lr
           ON coalesce(ll.awardee_nif, '') = lr.raw_nif
          AND coalesce(ll.awardee, '') = lr.raw_name
         WHERE ll.contract_id = l.id
           AND ll.awardee IS NOT NULL
           AND ll.awardee != ''
           AND (
             ll.awardee_nif = ?
             OR lr.canonical_id = ?
             OR lr.canonical_nif = ?
             OR ll.awardee = ?
           )
       ))
       ${lotAwardsCompanyMatch}
    ORDER BY CASE a.severity WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END, a.confidence DESC
    LIMIT 50;
  `).all(...params) as any[];

  return toPlain(
    rows.map((r) => {
      let factores = [];
      try {
        factores = JSON.parse(r.factors_json || '[]');
      } catch {}
      let explicacionesAlternativas: string[] = [];
      try {
        explicacionesAlternativas = JSON.parse(r.explanations_json || '[]');
      } catch {}
      let documentosInvestigacion: string[] = [];
      try {
        documentosInvestigacion = JSON.parse(r.documents_json || '[]');
      } catch {}

      const isJustificada = r.continuity_pattern === 'baja_justificada';

      return {
        id: r.id,
        category: (r.category || 'C') as CategoriaAlerta,
        tipo: r.tipo,
        severity: r.severity,
        level: r.severity,
        scoreEscala: Number(r.scale_score) || 0,
        confidence: r.confidence,
        title: r.title,
        description: r.description,
        datoObjetivo: r.target_data || '',
        source: r.source || 'Plataforma de Contratación del Sector Público (PLACSP)',
        urlFuente: r.source_url || 'Enlace oficial no disponible en los datos consultados',
        fechaExtraccion: r.extracted_at || r.created_at,
        reglaAplicada: r.applied_rule || '',
        versionMetodologia: r.methodology_version || 'v2.1',
        limitations: r.limitations || '',
        explicacionAlternativa: r.alternative_explanation || '',
        requiereRevisionHumana: Boolean(r.requires_human_review ?? 1),
        evidence: r.evidence,
        factores,
        patronContinuidad: r.continuity_pattern || null,
        explicacionesAlternativas,
        documentosInvestigacion,
        justificada: isJustificada,
        documentoJustificacionUrl: null,
        documentoJustificacionTitulo: null,
        documentoJustificacionFecha: null,
        fechaCreacion: r.created_at,
      };
    })
  );
}



/** @deprecated Use getContractingAuthorities(). Kept for compatibility with existing consumers. */
export const getOrganismosList = getContractingAuthorities;
/** @deprecated Use getContractingAuthorityDetail(). Kept for compatibility with existing consumers. */
export const getOrganismoDetail = getContractingAuthorityDetail;
