const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { eligibleAwardLotStatusSql, eligibleAwardResultStateSql, excludeAwardWhenLegacyLotTerminalSql } = require('../src/lib/lot-status.js');

function validateDatabase(databasePath) {
  const dbPath = databasePath || path.resolve(__dirname, '../data/licitaciones_alcazar.db');
  const db = new DatabaseSync(dbPath);

  try {
    const scalar = (sql) => db.prepare(sql).get();
    const rows = (sql) => db.prepare(sql).all();

    const issues = [];

// ─── 1. Schema enforcement: reject legacy tables ─────────────────────────────

const { TABLES, COLUMNS } = require('./canonical-schema');
const { normalizeIdentityPart } = require('./contract-identity');
const ftsTable = TABLES.licitaciones_fts;
// The FTS5 virtual table is created by the rebuild pipeline, while the base
// schema initializer intentionally remains usable without the virtual index.
const canonicalTables = new Set(Object.values(TABLES).filter((table) => table !== ftsTable));
const physicalTables = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
    .map((r) => r.name)
    // FTS5 creates implementation/shadow tables alongside the canonical virtual table.
    .filter((name) => !name.startsWith(ftsTable + '_'))
);
for (const table of canonicalTables) {
  if (!physicalTables.has(table)) {
    issues.push({ code: 'MISSING_CANONICAL_TABLE', table });
  }
}
for (const table of physicalTables) {
  if (table === ftsTable) continue;
  if (!canonicalTables.has(table)) {
    issues.push({ code: 'UNEXPECTED_PHYSICAL_TABLE', table });
  }
}
for (const [logicalTable, columnMap] of Object.entries(COLUMNS)) {
  const table = TABLES[logicalTable] || logicalTable;
  if (!physicalTables.has(table)) continue;
  const actualColumns = new Set(db.prepare("PRAGMA table_info('" + table + "')").all().map((c) => c.name));
  for (const column of Object.values(columnMap)) {
    if (!actualColumns.has(column)) {
      issues.push({ code: 'MISSING_CANONICAL_COLUMN', table, column });
    }
  }
}


const hasTable = (name) =>
  db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name=?").get(name).n > 0;

if (!hasTable('contracting_authorities')) {
  issues.push({ code: 'MISSING_CONTRACTING_AUTHORITIES_TABLE' });
}
if (hasTable('organismos_objetivo')) {
  issues.push({ code: 'LEGACY_TABLE_ORGANISMOS_OBJETIVO_PRESENT' });
}

// ─── 2. Schema enforcement: require canonical contracts columns ────────────

const licitacionesCols = new Set(
  db.prepare("PRAGMA table_info('contracts')").all().map((c) => c.name)
);

const requiredLicitacionesColumns = [
  'id', 'placsp_id', 'case_number', 'object_description',
  'contracting_authority_id', 'contracting_authority_name',
  'contracting_authority_nif', 'contracting_authority_dir3',
  'contracting_authority_city', 'year', 'scope',
];
for (const col of requiredLicitacionesColumns) {
  if (!licitacionesCols.has(col)) {
    issues.push({ code: 'MISSING_CANONICAL_COLUMN', table: 'contracts', column: col });
  }
}

const legacyLicitacionesColumns = [
  'ano', 'ambito', 'organismo_id', 'organo_contratante',
  'nif_organo', 'dir3_organo', 'ciudad_organo', 'organo_agrupado',
];
for (const col of legacyLicitacionesColumns) {
  if (licitacionesCols.has(col)) {
    issues.push({ code: 'LEGACY_COLUMN_PRESENT', table: 'contracts', column: col });
  }
}

// ─── 3. Schema enforcement: require canonical modifications columns ──────────

const modificacionesCols = new Set(
  db.prepare("PRAGMA table_info('modifications')").all().map((c) => c.name)
);

if (!modificacionesCols.has('document_name')) {
  issues.push({ code: 'MISSING_CANONICAL_COLUMN', table: 'modifications', column: 'document_name' });
}
if (modificacionesCols.has('documento_name')) {
  issues.push({ code: 'LEGACY_COLUMN_PRESENT', table: 'modifications', column: 'documento_name' });
}

// ─── 4. Schema enforcement: require canonical contracting_authorities columns ─

if (hasTable('contracting_authorities')) {
  const authCols = new Set(
    db.prepare("PRAGMA table_info('contracting_authorities')").all().map((c) => c.name)
  );

  const requiredAuthColumns = [
    'id', 'placsp_id', 'name', 'nif', 'dir3', 'scope', 'active', 'historical_names_json',
  ];
  for (const col of requiredAuthColumns) {
    if (!authCols.has(col)) {
      issues.push({ code: 'MISSING_CANONICAL_COLUMN', table: 'contracting_authorities', column: col });
    }
  }

  const legacyAuthColumns = ['nombre', 'ambito', 'activo', 'organo_agrupado'];
  for (const col of legacyAuthColumns) {
    if (authCols.has(col)) {
      issues.push({ code: 'LEGACY_COLUMN_PRESENT', table: 'contracting_authorities', column: col });
    }
  }
}

// ─── 4b. Derived-table English schema ───────────────────────────────────────
const derivedSchemas = {
  alerts: ['id', 'category', 'type', 'severity', 'level', 'scale_score', 'confidence', 'title', 'description', 'target_data', 'source', 'source_url', 'extracted_at', 'applied_rule', 'methodology_version', 'limitations', 'alternative_explanation', 'requires_human_review', 'evidence', 'factors_json', 'continuity_pattern', 'explanations_json', 'documents_json', 'created_at'],
  alert_contracts: ['alert_id', 'contract_id'],
  related_contracts: ['group_id', 'contract_id', 'similarity_score', 'accumulated_amount', 'reasons_json'],
  corporate_groups: ['group_id', 'group_name', 'associated_nifs_json', 'scope', 'description', 'sede', 'color'],
  corporate_rebrandings: ['cif', 'current_name', 'active_divisions_json', 'previous_names_json', 'general_reason', 'type'],
  cif_corrections: ['raw_cif', 'corrected_cif'],
  verified_person_mappings: ['person_id', 'person_name', 'masked_variants_json'],
  verified_contract_metadata: ['legacy_id', 'contract_id', 'explicit_end_date', 'source', 'reason'],
  contract_documents: ['id', 'contract_id', 'case_number', 'document_date', 'title', 'source_url', 'document_type', 'is_abnormally_low_bid_justification', 'created_at'],
  lot_awards: ['id', 'contract_id', 'case_number', 'lot_number', 'award_index', 'awardee', 'awardee_nif', 'awarded_amount', 'awarded_amount_incl_vat', 'offer_count', 'award_date', 'result_code', 'result_code_list_uri', 'result_state', 'description'],
};
for (const [table, required] of Object.entries(derivedSchemas)) {
  if (!hasTable(table)) { issues.push({ code: 'MISSING_CANONICAL_TABLE', table }); continue; }
  const actual = new Set(db.prepare("PRAGMA table_info('" + table + "')").all().map((c) => c.name));
  for (const col of required) if (!actual.has(col)) issues.push({ code: 'MISSING_CANONICAL_COLUMN', table, column: col });
}
const legacyDerived = [['alerts', 'tipo'], ['alerts', 'categoria'], ['corporate_groups', 'ambito'], ['contract_documents', 'url'], ['contract_documents', 'licitacion_id']];
for (const [table, column] of legacyDerived) {
  if (hasTable(table) && new Set(db.prepare("PRAGMA table_info('" + table + "')").all().map((c) => c.name)).has(column)) issues.push({ code: 'LEGACY_COLUMN_PRESENT', table, column });
}

// ─── 4c. Physical index schema ───────────────────────────────────────────────
const requiredIndexes = [
  'idx_contracts_authority_id', 'uq_contracts_case_authority', 'idx_contracts_placsp_id',
  'idx_contracts_contracting_authority_name', 'idx_contracts_awardee', 'idx_contracts_awardee_nif',
  'idx_contracts_year', 'idx_contracts_contract_type', 'idx_contracts_contract_type_code',
  'idx_contracts_procedure', 'idx_contracts_procedure_code', 'idx_contracts_status',
  'idx_contracts_publication_date', 'idx_contracts_updated_at', 'idx_contracts_documents_synced_at',
  'idx_contracts_scope', 'idx_contracts_economic_nature', 'idx_contracts_awarded_amount',
  'idx_contract_lots_contract_id', 'idx_contract_lots_case_number',
  'idx_contract_awards_contract_id', 'idx_contract_awards_case_number',
  'idx_lot_awards_contract_id', 'idx_lot_awards_case_number', 'idx_lot_awards_lot_number',
  'idx_modifications_contract_id', 'idx_modifications_case_number',
  'idx_contract_documents_contract_id', 'idx_contract_documents_abnormality',
  'idx_grants_beneficiary_nif', 'idx_grants_is_alcazar', 'idx_grants_grant_date',
  'idx_company_resolution_canonical_id', 'idx_company_resolution_group_id',
  'idx_verified_repairs_entity', 'idx_contracting_authorities_active',
  'idx_contracting_authorities_dir3', 'idx_contracting_authorities_nif',
  'idx_contracting_authorities_placsp', 'idx_alerts_type', 'idx_alerts_severity',
  'idx_alerts_scale_score', 'idx_alerts_category', 'idx_alert_contracts_contract_id',
  'idx_related_contracts_group_id',
];
const physicalIndexes = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name)
);
for (const index of requiredIndexes) {
  if (!physicalIndexes.has(index)) issues.push({ code: 'MISSING_CANONICAL_INDEX', index });
}
for (const index of [
  'idx_contracts_fecha_actualizacion', 'idx_contracts_contract_type_codigo',
  'idx_contracts_procedure_codigo', 'idx_contracts_naturaleza',
  'idx_contract_lots_licitacion_id', 'idx_contract_lots_expediente', 'idx_alerts_score',
]) {
  if (physicalIndexes.has(index)) issues.push({ code: 'LEGACY_INDEX_PRESENT', index });
}

// ─── Stop here if schema issues found: business checks would be misleading ────

if (issues.length > 0) {
    return { dbPath, summary: null, issues, ok: false };
  }

// ─── 5. Summary counts ───────────────────────────────────────────────────────

const summary = {
  contracts: scalar('SELECT count(*) AS n FROM contracts').n,
  lotes: scalar('SELECT count(*) AS n FROM contract_lots').n,
  adjudicaciones: scalar('SELECT count(*) AS n FROM contracts WHERE awarded_amount IS NOT NULL AND awarded_amount > 0').n,
  modifications: scalar('SELECT count(*) AS n FROM modifications').n,
  alerts: scalar('SELECT count(*) AS n FROM alerts').n,
};

// ─── 6. Active contracting authorities ───────────────────────────────────────

const orgCount = scalar('SELECT count(*) AS n FROM contracting_authorities WHERE active = 1').n;
if (orgCount === 0) issues.push({ code: 'NO_ACTIVE_CONTRACTING_AUTHORITIES' });

// ─── 7. Mandatory ID/key columns ─────────────────────────────────────────────

const missingAuthorityId = scalar(
  "SELECT count(*) AS n FROM contracts WHERE contracting_authority_id IS NULL OR trim(contracting_authority_id) = ''"
).n;
if (missingAuthorityId > 0) {
  issues.push({ code: 'CONTRACTS_WITHOUT_CONTRACTING_AUTHORITY_ID', count: missingAuthorityId });
}

// ─── 7b. Contracting-authority references ───────────────────────────────────

if (hasTable('contracting_authorities')) {
  for (const r of rows("SELECT c.id, c.contracting_authority_id FROM contracts c LEFT JOIN contracting_authorities ca ON ca.id = c.contracting_authority_id WHERE c.contracting_authority_id IS NOT NULL AND trim(c.contracting_authority_id) <> '' AND ca.id IS NULL"))
    issues.push({ code: 'ORPHAN_CONTRACTING_AUTHORITY_REFERENCE', ...r });
}

// ─── 8. Verified-repairs resolution ──────────────────────────────────────────

if (hasTable('verified_data_repairs')) {
  const repairTargets = rows(`
    SELECT entity_id, count(*) AS n
    FROM verified_data_repairs
    WHERE entity_type = 'licitacion' AND active = 1
    GROUP BY entity_id
  `);
  for (const target of repairTargets) {
    const candidates = db.prepare(
      "SELECT id FROM contracts WHERE id = ? OR placsp_id = ? OR placsp_id LIKE '%/' || ?"
    ).all(target.entity_id, target.entity_id, target.entity_id);
    if (candidates.length === 0) {
      issues.push({ code: 'UNRESOLVED_VERIFIED_REPAIR', entity_id: target.entity_id });
    } else if (candidates.length > 1) {
      issues.push({ code: 'AMBIGUOUS_VERIFIED_REPAIR', entity_id: target.entity_id, candidates: candidates.length });
    }
  }
}

// ─── 8b. Corporate-group references ─────────────────────────────────────────

if (hasTable('company_resolution') && hasTable('corporate_groups')) {
  for (const r of rows("SELECT cr.group_id FROM company_resolution cr LEFT JOIN corporate_groups cg ON cg.group_id = cr.group_id WHERE cr.group_id IS NOT NULL AND trim(cr.group_id) <> '' AND cg.group_id IS NULL"))
    issues.push({ code: 'ORPHAN_COMPANY_GROUP_REFERENCE', ...r });
}

// ─── 9. Duplicate ID / logical key checks ────────────────────────────────────

for (const r of rows(`
  SELECT id, case_number, contracting_authority_name, count(*) AS n
  FROM contracts GROUP BY id HAVING count(*) > 1
`)) issues.push({ code: 'DUPLICATE_INTERNAL_CONTRACT_ID', ...r });

const logicalContractKeys = new Map();
for (const r of rows('SELECT id, case_number, contracting_authority_id FROM contracts')) {
  const key = normalizeIdentityPart(r.case_number) + '|' + normalizeIdentityPart(r.contracting_authority_id);
  const previous = logicalContractKeys.get(key);
  if (previous) {
    issues.push({
      code: 'DUPLICATE_CONTRACT_LOGICAL_KEY',
      case_number: r.case_number,
      contracting_authority_id: r.contracting_authority_id,
      contract_ids: [previous.id, r.id],
      n: 2,
    });
  } else {
    logicalContractKeys.set(key, r);
  }
}

// ─── 10. Orphan checks ───────────────────────────────────────────────────────

for (const r of rows(`
  SELECT ll.contract_id, ll.case_number
  FROM contract_lots ll LEFT JOIN contracts l ON l.id = ll.contract_id
  WHERE l.id IS NULL
`)) issues.push({ code: 'ORPHAN_LOT', ...r });

for (const r of rows(`
  SELECT award.contract_id, award.case_number, award.award_index
  FROM contract_awards award LEFT JOIN contracts l ON l.id = award.contract_id
  WHERE l.id IS NULL
`)) issues.push({ code: 'ORPHAN_CONTRACT_AWARD', ...r });

for (const r of rows(`
  SELECT award.contract_id, award.case_number, award.lot_number, award.award_index
  FROM lot_awards award LEFT JOIN contracts l ON l.id = award.contract_id
  WHERE l.id IS NULL
`)) issues.push({ code: 'ORPHAN_LOT_AWARD', ...r });

if (hasTable('verified_contract_metadata')) {
  for (const r of rows(`
    SELECT metadata.legacy_id, metadata.contract_id
    FROM verified_contract_metadata metadata
    LEFT JOIN contracts c ON c.id = metadata.contract_id
    WHERE c.id IS NULL
  `)) issues.push({ code: 'ORPHAN_VERIFIED_CONTRACT_METADATA', ...r });
}

for (const r of rows(`
  SELECT m.contract_id, m.case_number
  FROM modifications m LEFT JOIN contracts l ON l.id = m.contract_id
  WHERE l.id IS NULL
`)) issues.push({ code: 'ORPHAN_MODIFICATION', ...r });

for (const r of rows(`
  SELECT d.contract_id, d.case_number
  FROM contract_documents d LEFT JOIN contracts l ON l.id = d.contract_id
  WHERE l.id IS NULL
`)) issues.push({ code: 'ORPHAN_DOCUMENT', ...r });

for (const r of rows(`
  SELECT d.alert_id
  FROM alert_contracts d LEFT JOIN alerts a ON a.id = d.alert_id
  WHERE a.id IS NULL
`)) issues.push({ code: 'ORPHAN_ALERT_REFERENCE', ...r });

for (const r of rows(`
  SELECT d.contract_id
  FROM alert_contracts d LEFT JOIN contracts l ON l.id = d.contract_id
  WHERE l.id IS NULL
`)) issues.push({ code: 'ORPHAN_ALERT_CONTRACT', ...r });

for (const r of rows(`
  SELECT d.contract_id
  FROM related_contracts d LEFT JOIN contracts l ON l.id = d.contract_id
  WHERE l.id IS NULL
`)) issues.push({ code: 'ORPHAN_RELATED_CONTRACT', ...r });

for (const r of rows(`
  SELECT d.group_id
  FROM related_contracts d LEFT JOIN alerts a ON a.id = d.group_id
  WHERE a.id IS NULL
`)) issues.push({ code: 'ORPHAN_RELATED_ALERT', ...r });

// ─── 10a. Denormalized case-number consistency ────────────────────────────────

const childCaseNumberChecks = [
  ['contract_lots', 'ORPHAN_LOT_CASE_NUMBER_MISMATCH'],
  ['contract_awards', 'ORPHAN_CONTRACT_AWARD_CASE_NUMBER_MISMATCH'],
  ['lot_awards', 'ORPHAN_LOT_AWARD_CASE_NUMBER_MISMATCH'],
  ['modifications', 'ORPHAN_MODIFICATION_CASE_NUMBER_MISMATCH'],
  ['contract_documents', 'ORPHAN_DOCUMENT_CASE_NUMBER_MISMATCH'],
];
for (const [table, code] of childCaseNumberChecks) {
  const sql = 'SELECT child.id, child.contract_id, child.case_number AS child_case_number, parent.case_number AS parent_case_number ' +
    'FROM ' + table + ' child JOIN contracts parent ON parent.id = child.contract_id ' +
    "WHERE trim(coalesce(child.case_number, '')) <> '' AND trim(coalesce(parent.case_number, '')) <> ''";
  for (const r of rows(sql)) {
    if (normalizeIdentityPart(r.child_case_number) !== normalizeIdentityPart(r.parent_case_number)) {
      issues.push({ code, ...r });
    }
  }
}

// ─── 10b. Company-resolution canonical fields ─────────────────────────────────

if (hasTable('company_resolution')) {
  for (const r of rows("SELECT raw_nif, raw_name, canonical_id, canonical_nif, canonical_name FROM company_resolution WHERE trim(coalesce(canonical_id, '')) = '' OR trim(coalesce(canonical_name, '')) = ''")) {
    issues.push({ code: 'INVALID_COMPANY_RESOLUTION_CANONICAL_FIELDS', ...r });
  }
}

// ─── 10b. Company group denormalization consistency ─────────────────────────

if (hasTable('company_resolution') && hasTable('corporate_groups')) {
  for (const r of rows(`
    SELECT cr.raw_nif, cr.raw_name, cr.group_id, cr.group_name, cg.group_name AS canonical_group_name
    FROM company_resolution cr
    JOIN corporate_groups cg ON cg.group_id = cr.group_id
    WHERE cr.group_id IS NOT NULL
      AND trim(cr.group_id) <> ''
      AND trim(coalesce(cr.group_name, '')) <> ''
      AND trim(cr.group_name) <> trim(cg.group_name)
  `)) {
    issues.push({ code: 'COMPANY_GROUP_NAME_MISMATCH', ...r });
  }
}

// ─── 10b. FTS integrity ──────────────────────────────────────────────────────

if (!hasTable('contracts_fts')) {
  issues.push({ code: 'MISSING_CONTRACTS_FTS_TABLE' });
} else {
  const ftsCount = scalar('SELECT count(*) AS n FROM contracts_fts').n;
  const contractCount = scalar('SELECT count(*) AS n FROM contracts').n;
  if (ftsCount !== contractCount) issues.push({ code: 'FTS_CONTRACT_COUNT_MISMATCH', contracts: contractCount, fts: ftsCount });
  for (const r of rows('SELECT f.id FROM contracts_fts f LEFT JOIN contracts c ON c.id = f.id WHERE c.id IS NULL'))
    issues.push({ code: 'ORPHAN_FTS_CONTRACT', contract_id: r.id });
  for (const r of rows('SELECT c.id FROM contracts c LEFT JOIN contracts_fts f ON f.id = c.id WHERE f.id IS NULL'))
    issues.push({ code: 'MISSING_FTS_CONTRACT', contract_id: r.id });
}

// ─── 11. Idempotency / uniqueness checks ─────────────────────────────────────

for (const r of rows(`SELECT id, count(*) AS n FROM modifications GROUP BY id HAVING count(*) > 1`))
  issues.push({ code: 'DUPLICATE_MODIFICATION_ID', ...r });

for (const r of rows(`SELECT id, count(*) AS n FROM contract_documents GROUP BY id HAVING count(*) > 1`))
  issues.push({ code: 'DUPLICATE_DOCUMENT_ID', ...r });

for (const r of rows(`
  SELECT contract_id, min(lot_number) AS lot_number, count(*) AS n
  FROM contract_lots
  WHERE lot_number IS NOT NULL AND trim(lot_number) <> ''
  GROUP BY contract_id, lower(trim(lot_number))
  HAVING count(*) > 1
`)) issues.push({ code: 'DUPLICATE_LOT_KEY', ...r });

// ─── 12. Lotizado award coherence ────────────────────────────────────────────

for (const r of rows(`
  SELECT l.id, l.case_number, l.lot_count, l.lots_source
  FROM contracts l
  LEFT JOIN contract_lots ll ON ll.contract_id = l.id
  WHERE l.is_lotized = 1
  GROUP BY l.id, l.case_number, l.lot_count, l.lots_source
  HAVING count(ll.id) = 0
`)) issues.push({ code: "LOTIZED_PARENT_WITHOUT_LOTS", ...r });

for (const r of rows(`
  SELECT l.id, l.case_number, ll.lot_number
  FROM contract_lots ll JOIN contracts l ON l.id = ll.contract_id
  WHERE NOT ${eligibleAwardLotStatusSql('ll')}
    AND ll.awarded_amount IS NOT NULL AND ll.awarded_amount > 0
`)) issues.push({ code: 'INVALID_LOT_STATUS_HAS_AWARD', ...r });

for (const r of rows(`
  SELECT contract.id, contract.case_number, lot.lot_number,
         round(sum(award.awarded_amount), 2) AS awarded_amount
  FROM lot_awards award
  JOIN contracts contract ON contract.id = award.contract_id
  JOIN contract_lots lot
    ON lot.contract_id = award.contract_id
    AND lower(trim(lot.lot_number)) = lower(trim(award.lot_number))
  WHERE NOT ${eligibleAwardLotStatusSql('lot')}
    AND award.awarded_amount IS NOT NULL
    AND award.awarded_amount > 0
  GROUP BY contract.id, lower(trim(lot.lot_number))
`)) issues.push({ code: 'INVALID_LOT_STATUS_HAS_STRUCTURED_AWARD', ...r });

for (const r of rows(`
  SELECT contract_id, min(lot_number) AS lot_number, count(*) AS n
  FROM contract_lots
  WHERE lot_number IS NOT NULL AND trim(lot_number) <> ''
  GROUP BY contract_id, lower(trim(lot_number))
  HAVING count(*) > 1
`)) issues.push({ code: 'DUPLICATE_LOT_NUMBER', ...r });

// Every positive lot award must correspond to a known structured lot.
// Otherwise a parent may match the known lots while silently excluding a stale
// or orphaned award from an unknown lot number.
for (const r of rows(`
  SELECT award.contract_id, contract.case_number, award.lot_number,
         round(sum(award.awarded_amount), 2) AS orphaned_award_amount
  FROM lot_awards award
  JOIN contracts contract ON contract.id = award.contract_id
  LEFT JOIN contract_lots lot
    ON lot.contract_id = award.contract_id
    AND lower(trim(lot.lot_number)) = lower(trim(award.lot_number))
  WHERE contract.is_lotized = 1
    AND coalesce(contract.lots_source, '') = 'CODICE_PROJECT_LOT'
    AND award.lot_number IS NOT NULL
    AND trim(award.lot_number) <> ''
    AND award.awarded_amount IS NOT NULL
    AND award.awarded_amount > 0
    AND ${eligibleAwardResultStateSql('award')}
    AND lot.id IS NULL
  GROUP BY award.contract_id, lower(trim(award.lot_number))
`)) issues.push({ code: 'ORPHAN_LOT_AWARD_AMOUNT', ...r });

// Reconcile each explicitly lotized contract against one coherent source of
// award values per lot. Never mix a partial lot_awards snapshot with the full
// contract_lots aggregate: a partial child snapshot cannot prove a mismatch.
for (const r of rows(`
  WITH
  valid_lot_awards AS (
    SELECT award.contract_id, lower(trim(award.lot_number)) AS lot_key,
           round(sum(award.awarded_amount), 2) AS amount
    FROM lot_awards award
    WHERE lot_number IS NOT NULL
      AND trim(lot_number) <> ''
      AND awarded_amount IS NOT NULL
      AND awarded_amount > 0
      AND ${eligibleAwardResultStateSql()}
      AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
    GROUP BY contract_id, lower(trim(lot_number))
  ),
  valid_contract_lots AS (
    SELECT contract_id, lower(trim(lot_number)) AS lot_key,
           round(awarded_amount, 2) AS amount
    FROM contract_lots
    WHERE lot_number IS NOT NULL
      AND trim(lot_number) <> ''
      AND awarded_amount IS NOT NULL
      AND awarded_amount > 0
      AND ${eligibleAwardLotStatusSql()}
  ),
  lot_award_coverage AS (
    SELECT c.id AS contract_id,
           count(DISTINCT lot.lot_key) AS expected_lots,
           count(DISTINCT award.lot_key) AS covered_lots,
           round(sum(CASE WHEN award.lot_key IS NOT NULL THEN award.amount ELSE 0 END), 2) AS awarded_amount
    FROM contracts c
    JOIN valid_contract_lots lot ON lot.contract_id = c.id
    LEFT JOIN valid_lot_awards award
      ON award.contract_id = lot.contract_id
      AND award.lot_key = lot.lot_key
    GROUP BY c.id
  ),
  covered_awards AS (
    SELECT contract_id, round(sum(amount), 2) AS awarded_amount
    FROM valid_lot_awards
    GROUP BY contract_id
  ),
  lot_totals AS (
    SELECT contract_id, round(sum(amount), 2) AS awarded_amount
    FROM valid_contract_lots
    GROUP BY contract_id
  )
  SELECT c.id, c.case_number, c.awarded_amount AS parent_award,
         CASE
           WHEN coverage.expected_lots > 0 AND coverage.covered_lots = coverage.expected_lots
             THEN coverage.awarded_amount
           WHEN coverage.expected_lots IS NULL AND awards.contract_id IS NOT NULL
             THEN awards.awarded_amount
           ELSE totals.awarded_amount
         END AS lot_award
  FROM contracts c
  LEFT JOIN lot_award_coverage coverage ON coverage.contract_id = c.id
  LEFT JOIN covered_awards awards ON awards.contract_id = c.id
  LEFT JOIN lot_totals totals ON totals.contract_id = c.id
  WHERE c.is_lotized = 1
    AND c.awarded_amount IS NOT NULL
    AND (c.award_amount_type IS NULL OR c.award_amount_type = 'total')
    AND coalesce(c.lots_source, '') = 'CODICE_PROJECT_LOT'
    AND (
      (coverage.expected_lots > 0 AND coverage.covered_lots = coverage.expected_lots)
      OR (coverage.expected_lots IS NULL AND (totals.contract_id IS NOT NULL OR awards.contract_id IS NOT NULL))
    )
    AND abs(c.awarded_amount - CASE
      WHEN coverage.expected_lots > 0 AND coverage.covered_lots = coverage.expected_lots
        THEN coverage.awarded_amount
      WHEN coverage.expected_lots IS NULL AND awards.contract_id IS NOT NULL
        THEN awards.awarded_amount
      ELSE totals.awarded_amount
    END) > 0.02
`)) issues.push({ code: 'PARENT_AWARD_MISMATCH', ...r });

// ─── 13. Alert classification coherence ──────────────────────────────────────

for (const r of rows(`
  SELECT l.id, l.case_number, l.contract_type, l.contract_type_code, a.id AS alert_id
  FROM alerts a JOIN alert_contracts ac ON ac.alert_id = a.id
  JOIN contracts l ON l.id = ac.contract_id
  WHERE a.type IN ('NEGOCIADO_SIN_PUBLICIDAD','BAJA_ACUSADA')
    AND (lower(coalesce(l.contract_type,'')) LIKE '%patrimonial%'
      OR lower(coalesce(l.contract_type,'')) LIKE '%privado%'
      OR trim(coalesce(l.contract_type_code,'')) = '50')
`)) issues.push({ code: 'NON_LCSP_ALERT', ...r });

// ─── Result ───────────────────────────────────────────────────────────────────

  const result = { dbPath, summary, issues, ok: issues.length === 0 };
    return result;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const result = validateDatabase(process.argv[2]);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

module.exports = { validateDatabase };