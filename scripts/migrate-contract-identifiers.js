#!/usr/bin/env node
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { getContractIdentityKey, normalizeIdentityPart } = require('./contract-identity');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');

function hasColumn(db, table, column) {
  return db.prepare('PRAGMA table_info(' + table + ')').all().some(c => c.name === column);
}


function planChildReferenceUpdates(db, table, mappings) {
  const mappingsByOldId = new Map();
  for (const mapping of mappings) {
    const candidates = mappingsByOldId.get(mapping.oldId) || [];
    candidates.push(mapping);
    mappingsByOldId.set(mapping.oldId, candidates);
  }

  const rows = db.prepare(`SELECT rowid, contract_id, case_number FROM "${table}"`).all();
  const updates = [];
  for (const row of rows) {
    const candidates = mappingsByOldId.get(row.contract_id);
    if (!candidates) continue;

    if (candidates.length === 1) {
      // A unique legacy parent ID identifies the parent even when a child row
      // has a missing or stale case number.
      updates.push({ rowid: row.rowid, contractId: candidates[0].newId });
      continue;
    }

    const normalizedCase = normalizeIdentityPart(row.case_number);
    const matching = normalizedCase
      ? candidates.filter(candidate => normalizeIdentityPart(candidate.expediente) === normalizedCase)
      : [];
    if (matching.length !== 1) {
      throw new Error(
        `No se puede resolver la referencia de ${table} rowid=${row.rowid}: ID legado ambiguo ${row.contract_id} y expediente ausente o no coincidente.`
      );
    }
    updates.push({ rowid: row.rowid, contractId: matching[0].newId });
  }
  return updates;
}

function migrate(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!hasColumn(db, 'contracts', 'contracting_authority_id')) {
      db.exec('ALTER TABLE contracts ADD COLUMN contracting_authority_id TEXT;');
    }
    if (!hasColumn(db, 'contracts', 'placsp_id')) {
      db.exec('ALTER TABLE contracts ADD COLUMN placsp_id TEXT;');
    }

  // Legacy databases may still contain organismo_id. Prefer the explicit PLACSP
  // identity and only use the legacy internal id as a compatibility bridge.
  const legacyAuthorityIdColumn = hasColumn(db, 'contracts', 'organismo_id') ? 'organismo_id' : null;
  const legacyAuthorityNameColumn = hasColumn(db, 'contracts', 'organo_contratante') ? 'organo_contratante' : null;
  const authorityRows = db.prepare('SELECT id, placsp_id FROM contracting_authorities WHERE active = 1').all();
  const byPlacspId = new Map(authorityRows.filter(r => r.placsp_id).map(r => [String(r.placsp_id), r.id]));
  const validIds = new Set(authorityRows.map(r => String(r.id)));
  const authorityByName = new Map();
  for (const authority of authorityRows) authorityByName.set(String(authority.name || ''), String(authority.id));
  const hasHistoricalNames = hasColumn(db, 'contracting_authorities', 'historical_names_json');
  const authorityConfig = authorityRows.length
    ? db.prepare(`SELECT id, name${hasHistoricalNames ? ', historical_names_json' : ''} FROM contracting_authorities WHERE active = 1`).all()
    : [];
  for (const authority of authorityConfig) {
    authorityByName.set(String(authority.name || ''), String(authority.id));
    if (hasHistoricalNames) {
      for (const historicalName of JSON.parse(authority.historical_names_json || '[]')) authorityByName.set(String(historicalName), String(authority.id));
    }
  }

  const parents = db.prepare(
    `SELECT rowid, id, case_number, contracting_authority_id, placsp_id${legacyAuthorityIdColumn ? ', organismo_id' : ''}${legacyAuthorityNameColumn ? ', organo_contratante' : ''}
     FROM contracts ORDER BY rowid`
  ).all();

  const seenLogical = new Set();
  const mappings = [];

  for (const row of parents) {
    let authorityId = row.contracting_authority_id ? String(row.contracting_authority_id) : null;
    if (!authorityId && row.placsp_id) authorityId = byPlacspId.get(String(row.placsp_id)) || null;
    if (!authorityId && legacyAuthorityIdColumn && row.organismo_id && validIds.has(String(row.organismo_id))) {
      authorityId = String(row.organismo_id);
    }
    if (!authorityId && legacyAuthorityNameColumn && row.organo_contratante) {
      authorityId = authorityByName.get(String(row.organo_contratante)) || null;
    }
    if (!row.case_number || !authorityId) {
      throw new Error('Contrato sin contracting_authority_id: rowid=' + row.rowid);
    }

    const logical = getContractIdentityKey(row.case_number, authorityId);
    if (seenLogical.has(logical)) throw new Error('Identidad lógica duplicada: ' + logical);
    seenLogical.add(logical);

    mappings.push({
      rowid: row.rowid,
      oldId: row.id,
      expediente: row.case_number,
      authorityId,
      newId: getContractIdentityKey(row.case_number, authorityId),
      placspId: row.placsp_id || row.id,
    });
  }

    const hasContractAwards = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contract_awards'").get();
    const hasLotAwards = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lot_awards'").get();
    const hasRelatedContracts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='related_contracts'").get();
    const hasVerifiedContractMetadata = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='verified_contract_metadata'").get();
    const oldIdCounts = new Map();
    for (const mapping of mappings) {
      oldIdCounts.set(mapping.oldId, (oldIdCounts.get(mapping.oldId) || 0) + 1);
    }
    const ambiguousOldIds = new Set(
      [...oldIdCounts.entries()].filter(([, count]) => count > 1).map(([oldId]) => oldId)
    );
    const updateVerifiedMetadata = hasVerifiedContractMetadata
      ? db.prepare('UPDATE verified_contract_metadata SET contract_id = ? WHERE contract_id = ?')
      : null;
    if (hasVerifiedContractMetadata && ambiguousOldIds.size > 0) {
      const placeholders = [...ambiguousOldIds].map(() => '?').join(', ');
      const ambiguousMetadata = db.prepare(
        `SELECT legacy_id, contract_id FROM verified_contract_metadata WHERE contract_id IN (${placeholders})`
      ).all(...ambiguousOldIds);
      if (ambiguousMetadata.length > 0) {
        throw new Error('Metadatos contractuales verificados asociados a IDs de contrato ambiguos: ' +
          ambiguousMetadata.map(row => row.legacy_id).join(', '));
      }
    }
    const updateParent = db.prepare('UPDATE contracts SET id = ?, contracting_authority_id = ?, placsp_id = ? WHERE rowid = ?');

    const childTables = [
      'contract_lots',
      'modifications',
      'contract_documents',
      ...(hasContractAwards ? ['contract_awards'] : []),
      ...(hasLotAwards ? ['lot_awards'] : []),
    ];
    // Resolve all child references before changing any rows. If a shared legacy
    // ID cannot be disambiguated by case number, abort the transaction rather
    // than leave orphaned or incorrectly attributed child records.
    const childUpdates = childTables.map(table => ({
      table,
      updates: planChildReferenceUpdates(db, table, mappings),
    }));
    for (const { table, updates } of childUpdates) {
      const update = db.prepare(`UPDATE "${table}" SET contract_id = ? WHERE rowid = ?`);
      for (const item of updates) update.run(item.contractId, item.rowid);
    }

    for (const m of mappings) {
      if (!ambiguousOldIds.has(m.oldId)) updateVerifiedMetadata?.run(m.newId, m.oldId);
      updateParent.run(m.newId, m.authorityId, m.placspId, m.rowid);
    }

    const docs = db.prepare('SELECT id, contract_id FROM contract_documents').all();
    const updateDocId = db.prepare('UPDATE contract_documents SET id = ? WHERE id = ?');
    for (const d of docs) {
      const suffix = String(d.id).match(/_doc_(\d+)$/)?.[1];
      if (suffix) updateDocId.run(d.contract_id + '_doc_' + suffix, d.id);
    }

    const mods = db.prepare('SELECT id, contract_id, modification_number FROM modifications').all();
    const updateModId = db.prepare('UPDATE modifications SET id = ? WHERE id = ?');
    for (const m of mods) {
      const nextId = m.contract_id + '|mod-' + m.modification_number;
      if (nextId !== m.id) updateModId.run(nextId, m.id);
    }

    if (hasContractAwards) {
      const awards = db.prepare("SELECT id, contract_id, award_index FROM contract_awards").all();
      const updateAwardId = db.prepare('UPDATE contract_awards SET id = ? WHERE id = ?');
      for (const a of awards) {
        const nextId = a.contract_id + '_award_' + a.award_index;
        if (nextId !== a.id) updateAwardId.run(nextId, a.id);
      }
    }

    if (hasLotAwards) {
      const lotAwards = db.prepare("SELECT id, contract_id, lot_number, award_index FROM lot_awards").all();
      const updateLotAwardId = db.prepare('UPDATE lot_awards SET id = ? WHERE id = ?');
      for (const a of lotAwards) {
        const nextId = a.contract_id + '_lot_' + a.lot_number + '_award_' + a.award_index;
        if (nextId !== a.id) updateLotAwardId.run(nextId, a.id);
      }
    }

    const lots = db.prepare('SELECT id, contract_id, lot_number FROM contract_lots').all();
    const updateLotId = db.prepare('UPDATE contract_lots SET id = ? WHERE id = ?');
    for (const l of lots) {
      const nextId = l.contract_id + '_lote_' + l.lot_number;
      if (nextId !== l.id) updateLotId.run(nextId, l.id);
    }

    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contracts_fts'").get()) {
      const contractColumns = new Set(db.prepare("PRAGMA table_info('contracts')").all().map(column => column.name));
      const requiredFtsSourceColumns = ['id', 'case_number', 'object_description', 'contracting_authority_name', 'awardee'];
      const missingFtsSourceColumns = requiredFtsSourceColumns.filter(column => !contractColumns.has(column));
      if (missingFtsSourceColumns.length > 0) {
        throw new Error('No se puede reconstruir contracts_fts: faltan columnas en contracts: ' + missingFtsSourceColumns.join(', '));
      }

      const ftsColumns = new Set(db.prepare("PRAGMA table_info('contracts_fts')").all().map(column => column.name));
      const missingFtsColumns = requiredFtsSourceColumns.filter(column => !ftsColumns.has(column));
      if (missingFtsColumns.length > 0) {
        throw new Error('No se puede reconstruir contracts_fts: faltan columnas: ' + missingFtsColumns.join(', '));
      }

      db.exec('DELETE FROM contracts_fts;');
      db.exec(`
        INSERT INTO contracts_fts(id, case_number, object_description, contracting_authority_name, awardee)
        SELECT id, case_number, object_description, contracting_authority_name, awardee
        FROM contracts
      `);
    }

    // Alerts and their related-contract groups are derived and are rebuilt
    // later in the pipeline. Clear the groups as well as the alert links.
    if (hasRelatedContracts) db.exec('DELETE FROM related_contracts;');
    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='alert_contracts'").get()) db.exec('DELETE FROM alert_contracts;');
    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='alerts'").get()) db.exec('DELETE FROM alerts;');

    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_contracts_case_authority ON contracts(case_number, contracting_authority_id);');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_contracts_id ON contracts(id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_contracts_placsp_id ON contracts(placsp_id);');

    db.exec('COMMIT');

    return {
      contracts: mappings.length,
      changed: mappings.filter(m => m.oldId !== m.newId).length,
      duplicatedSourceIds: db.prepare('SELECT count(*) AS n FROM (SELECT placsp_id FROM contracts WHERE placsp_id IS NOT NULL GROUP BY placsp_id HAVING count(*) > 1)').get().n,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

if (require.main === module) {
  const db = new DatabaseSync(DB_PATH);
  try {
    const result = migrate(db);
    console.log('✅ Contract identity migrated: ' + result.contracts + ' contracts; ' + result.changed + ' internal IDs normalized; ' + result.duplicatedSourceIds + ' shared PLACSP source IDs preserved.');
  } finally {
    db.close();
  }
}

module.exports = { migrate };
