#!/usr/bin/env node
/**
 * Migrates the current canonical procurement schema to the final English-only
 * physical SQLite schema. Data values are preserved byte-for-byte; only table,
 * column and index identifiers change.
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { TABLES, COLUMNS } = require('./canonical-schema');
const CONTRACTING_AUTHORITIES_PATH = path.resolve(__dirname, '../data/contracting-authorities.json');

const DEFAULT_DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');

function hasTable(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function columns(db, table) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().map(r => r.name);
}

function renameColumns(db, table, map) {
  if (!hasTable(db, table)) return;
  const existing = new Set(columns(db, table));
  for (const [from, to] of Object.entries(map)) {
    if (existing.has(from) && !existing.has(to)) {
      db.exec(`ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}"`);
    }
  }
}

function renameTable(db, from, to) {
  if (hasTable(db, from) && !hasTable(db, to)) {
    db.exec(`ALTER TABLE "${from}" RENAME TO "${to}"`);
  }
}

function ensureCanonicalColumns(db) {
  for (const [canonicalTable, map] of Object.entries(COLUMNS)) {
    const table = TABLES[canonicalTable] || canonicalTable;
    if (!hasTable(db, table)) continue;
    const existing = new Set(columns(db, table));
    for (const target of Object.values(map)) {
      if (existing.has(target)) continue;
      const type = /amount|value|score|confidence|count|days|months|year|is_|requires_|active/.test(target)
        ? 'REAL'
        : 'TEXT';
      db.exec(`ALTER TABLE "${table}" ADD COLUMN "${target}" ${type}`);
      existing.add(target);
    }
  }
}



function dropNonSystemIndexes(db) {
  const indexes = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'`).all();
  for (const index of indexes) db.exec(`DROP INDEX IF EXISTS "${index.name}"`);
}

function ensureContractingAuthorities(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contracting_authorities (
      id TEXT PRIMARY KEY,
      placsp_id TEXT UNIQUE,
      dir3 TEXT,
      nif TEXT,
      name TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'Directa Municipal',
      active INTEGER NOT NULL DEFAULT 1,
      historical_names_json TEXT NOT NULL DEFAULT '[]'
    );
  `);

  if (!fs.existsSync(CONTRACTING_AUTHORITIES_PATH)) {
    throw new Error(`Missing contracting authority configuration: ${CONTRACTING_AUTHORITIES_PATH}`);
  }
  const config = JSON.parse(fs.readFileSync(CONTRACTING_AUTHORITIES_PATH, 'utf8'));
  const insert = db.prepare(`
    INSERT INTO contracting_authorities(id, placsp_id, nif, name, scope, active, historical_names_json)
    VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  for (const row of config.contracting_authorities || []) {
    insert.run(row.id, row.placsp_id || null, row.nif || null, row.name, row.scope || 'Directa Municipal', JSON.stringify(row.historical_names || []));
  }
}

function ensureLegacyContractColumns(db) {
  if (!hasTable(db, 'contracts')) return;
  const existing = new Set(columns(db, 'contracts'));
  const additions = {
    placsp_id: 'TEXT',
    contracting_authority_id: 'TEXT',
    contracting_authority_name: 'TEXT',
    contracting_authority_nif: 'TEXT',
    contracting_authority_dir3: 'TEXT',
    contracting_authority_city: 'TEXT',
  };
  for (const [name, type] of Object.entries(additions)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE contracts ADD COLUMN "${name}" ${type}`);
  }
}

function backfillLegacyContractingAuthorities(db) {
  if (!hasTable(db, 'contracts') || !hasTable(db, 'contracting_authorities')) return;
  const contractCols = new Set(columns(db, 'contracts'));
  const legacyName = contractCols.has('organo_contratante') ? 'organo_contratante' : null;
  const legacyNif = contractCols.has('nif_organo') ? 'nif_organo' : null;
  const legacyDir3 = contractCols.has('dir3_organo') ? 'dir3_organo' : null;
  const legacyCity = contractCols.has('ciudad_organo') ? 'ciudad_organo' : null;
  if (!legacyName && !legacyNif) return;

  const authorities = db.prepare('SELECT id, nif, name, historical_names_json FROM contracting_authorities WHERE active = 1').all();
  const byName = new Map();
  const byNif = new Map();
  for (const authority of authorities) {
    if (authority.name) byName.set(String(authority.name).trim(), authority);
    for (const historical of JSON.parse(authority.historical_names_json || '[]')) {
      byName.set(String(historical).trim(), authority);
    }
    if (authority.nif) byNif.set(String(authority.nif).trim(), authority);
  }

  const select = [
    'rowid', 'id', 'contracting_authority_id', 'placsp_id',
    legacyName ? legacyName : "'' AS organo_contratante",
    legacyNif ? legacyNif : "'' AS nif_organo",
    legacyDir3 ? legacyDir3 : "NULL AS dir3_organo",
    legacyCity ? legacyCity : "NULL AS ciudad_organo",
  ].join(', ');
  const rows = db.prepare(`SELECT ${select} FROM contracts ORDER BY rowid`).all();
  const update = db.prepare(`UPDATE contracts SET
    placsp_id = COALESCE(NULLIF(placsp_id, ''), ?),
    contracting_authority_id = ?,
    contracting_authority_name = COALESCE(NULLIF(contracting_authority_name, ''), ?),
    contracting_authority_nif = COALESCE(NULLIF(contracting_authority_nif, ''), ?),
    contracting_authority_dir3 = COALESCE(NULLIF(contracting_authority_dir3, ''), ?),
    contracting_authority_city = COALESCE(NULLIF(contracting_authority_city, ''), ?)
    WHERE rowid = ?`);

  for (const row of rows) {
    let authority = row.contracting_authority_id
      ? authorities.find(a => String(a.id) === String(row.contracting_authority_id))
      : null;
    if (!authority && row.organo_contratante) authority = byName.get(String(row.organo_contratante).trim());
    if (!authority && row.nif_organo) authority = byNif.get(String(row.nif_organo).trim());
    if (!authority) {
      throw new Error(`Unable to resolve contracting authority for contract rowid=${row.rowid}, name=${row.organo_contratante || ''}, nif=${row.nif_organo || ''}`);
    }
    update.run(
      row.placsp_id || row.id || null,
      authority.id,
      row.organo_contratante || authority.name,
      row.nif_organo || authority.nif || null,
      row.dir3_organo || null,
      row.ciudad_organo || null,
      row.rowid,
    );
  }

  for (const legacy of ['organo_contratante', 'nif_organo', 'dir3_organo', 'ciudad_organo', 'organo_agrupado', 'organismo_id']) {
    if (columns(db, 'contracts').includes(legacy)) db.exec(`ALTER TABLE contracts DROP COLUMN "${legacy}"`);
  }
}

function assertNoSpanishSchema(db) {
  const objects = db.prepare(`
    SELECT type, name
    FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%'
      AND type IN ('table','index','view')
    ORDER BY type, name
  `).all();

  const forbidden = new Set([
    ...Object.entries(TABLES).filter(([from, to]) => from !== to).map(([from]) => from),
    ...Object.values(COLUMNS).flatMap(map =>
      Object.entries(map).filter(([from, to]) => from !== to).map(([from]) => from)
    ),
    // Legacy schema identifiers that were not direct COLUMNS mappings.
    'ano', 'ambito', 'organo_agrupado', 'organismo_id',
    'organo_contratante', 'nif_organo', 'dir3_organo', 'ciudad_organo',
    'organismo', 'organismo_objetivo', 'licitacion_id', 'alerta_id', 'contrato_id',
    // Historical Spanish index identifiers must not survive the physical-schema migration.
    'idx_contracts_fecha_actualizacion',
    'idx_contracts_contract_type_codigo',
    'idx_contracts_procedure_codigo',
    'idx_contracts_naturaleza',
    'idx_contract_lots_licitacion_id',
    'idx_contract_lots_expediente',
    'idx_alerts_score',
  ]);
  const bad = [];
  for (const object of objects) {
    if (forbidden.has(object.name)) bad.push(object.name);
    if (object.type === 'table') {
      for (const col of columns(db, object.name)) {
        if (forbidden.has(col)) bad.push(`${object.name}.${col}`);
      }
    }
  }
  if (bad.length) throw new Error(`Spanish schema identifiers remain: ${bad.join(', ')}`);
}

function migrate(dbPath = DEFAULT_DB_PATH) {
  if (!fs.existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);
  const backup = `${dbPath}.before-english-schema.bak`;
  if (fs.existsSync(backup)) {
    throw new Error(`Backup already exists; refusing to overwrite the recoverable database: ${backup}`);
  }
  fs.copyFileSync(dbPath, backup);

  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN IMMEDIATE');

    // Rebuild FTS from the canonical English columns. Drop both possible names
    // so an existing legacy/canonical FTS table cannot collide with the new one.
    db.exec('DROP TABLE IF EXISTS contracts_fts');
    db.exec('DROP TABLE IF EXISTS licitaciones_fts');

    // Tables first. SQLite automatically updates references in table definitions.
    for (const [from, to] of Object.entries(TABLES)) renameTable(db, from, to);

    for (const [table, map] of Object.entries(COLUMNS)) renameColumns(db, TABLES[table] || table, map);

    ensureCanonicalColumns(db);

    // Older generated databases (before the contracting-authority migration)
    // still carry authority data in organo_contratante/nif_organo/etc. Promote
    // those fields into the canonical authority model before dropping the legacy columns.
    dropNonSystemIndexes(db);
    ensureContractingAuthorities(db);
    ensureLegacyContractColumns(db);
    backfillLegacyContractingAuthorities(db);
    db.exec('DROP TABLE IF EXISTS organismos_objetivo');

    // Final schema uses English index identifiers. Existing indexes are dropped
    // and rebuilt from the physical column names so no stale identifiers survive.
    const indexes = db.prepare(`
      SELECT name, sql FROM sqlite_master
      WHERE type='index' AND name NOT LIKE 'sqlite_%'
    `).all();
    for (const index of indexes) db.exec(`DROP INDEX IF EXISTS "${index.name}"`);

    const canonicalIndexes = [
      ['idx_contracts_authority_id', 'contracts', 'contracting_authority_id'],
      ['uq_contracts_case_authority', 'contracts', 'case_number, contracting_authority_id', true],
      ['idx_contracts_placsp_id', 'contracts', 'placsp_id'],
      ['idx_contracts_contracting_authority_name', 'contracts', 'contracting_authority_name'],
      ['idx_contracts_awardee', 'contracts', 'awardee'],
      ['idx_contracts_awardee_nif', 'contracts', 'awardee_nif'],
      ['idx_contracts_year', 'contracts', 'year'],
      ['idx_contracts_contract_type', 'contracts', 'contract_type'],
      ['idx_contracts_contract_type_code', 'contracts', 'contract_type_code'],
      ['idx_contracts_procedure', 'contracts', 'procedure'],
      ['idx_contracts_procedure_code', 'contracts', 'procedure_code'],
      ['idx_contracts_status', 'contracts', 'status'],
      ['idx_contracts_publication_date', 'contracts', 'publication_date'],
      ['idx_contracts_updated_at', 'contracts', 'updated_at'],
      ['idx_contracts_documents_synced_at', 'contracts', 'documents_synced_at'],
      ['idx_contracts_scope', 'contracts', 'scope'],
      ['idx_contracts_economic_nature', 'contracts', 'economic_nature'],
      ['idx_contracts_awarded_amount', 'contracts', 'awarded_amount'],
      ['idx_contract_lots_contract_id', 'contract_lots', 'contract_id'],
      ['idx_contract_lots_case_number', 'contract_lots', 'case_number'],
      ['idx_modifications_contract_id', 'modifications', 'contract_id'],
      ['idx_modifications_case_number', 'modifications', 'case_number'],
      ['idx_contract_documents_contract_id', 'contract_documents', 'contract_id'],
      ['idx_contract_documents_abnormality', 'contract_documents', 'is_abnormally_low_bid_justification'],
      ['idx_grants_beneficiary_nif', 'grants', 'beneficiary_nif'],
      ['idx_grants_is_alcazar', 'grants', 'is_alcazar'],
      ['idx_grants_grant_date', 'grants', 'grant_date'],
      ['idx_company_resolution_canonical_id', 'company_resolution', 'canonical_id'],
      ['idx_company_resolution_group_id', 'company_resolution', 'group_id'],
      ['idx_verified_repairs_entity', 'verified_data_repairs', 'entity_type, entity_id, active'],
      ['idx_contracting_authorities_active', 'contracting_authorities', 'active'],
      ['idx_contracting_authorities_dir3', 'contracting_authorities', 'dir3'],
      ['idx_contracting_authorities_nif', 'contracting_authorities', 'nif'],
      ['idx_contracting_authorities_placsp', 'contracting_authorities', 'placsp_id'],
      ['idx_alerts_type', 'alerts', 'type'],
      ['idx_alerts_severity', 'alerts', 'severity'],
      ['idx_alerts_scale_score', 'alerts', 'scale_score'],
      ['idx_alerts_category', 'alerts', 'category'],
      ['idx_alert_contracts_contract_id', 'alert_contracts', 'contract_id'],
      ['idx_related_contracts_group_id', 'related_contracts', 'group_id'],
    ];
    for (const [name, table, expr, unique = false] of canonicalIndexes) {
      if (!hasTable(db, table)) continue;
      db.exec(`CREATE ${unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS "${name}" ON "${table}"(${expr});`);
    }

    db.exec(`
      CREATE VIRTUAL TABLE contracts_fts USING fts5(
        id UNINDEXED,
        case_number,
        object_description,
        contracting_authority_name,
        awardee,
        tokenize='porter unicode61'
      );
      INSERT INTO contracts_fts(id, case_number, object_description, contracting_authority_name, awardee)
      SELECT id, case_number, object_description, contracting_authority_name, awardee
      FROM contracts;
    `);

    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (!integrity.some(r => r.integrity_check === 'ok')) throw new Error(JSON.stringify(integrity));
    const foreignKeyErrors = db.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeyErrors.length) throw new Error(JSON.stringify(foreignKeyErrors));
    assertNoSpanishSchema(db);

    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');
    const foreignKeysEnabled = db.prepare('PRAGMA foreign_keys').get();
    if (foreignKeysEnabled.foreign_keys !== 1) throw new Error('Failed to re-enable SQLite foreign-key enforcement');
    db.exec('VACUUM');
    return { backup, tables: db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name) };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  try {
    const result = migrate(process.argv.find(a => a.startsWith('--db='))?.slice(5) || DEFAULT_DB_PATH);
    console.log('English schema migration completed:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('English schema migration failed:', error.message);
    process.exit(1);
  }
}

module.exports = { migrate, assertNoSpanishSchema };
