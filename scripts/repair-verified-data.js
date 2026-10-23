#!/usr/bin/env node
/**
 * Aplica correcciones verificadas almacenadas en la propia base de datos.
 *
 * Este módulo no contiene IDs, importes, municipios ni otros datos de negocio.
 * Las correcciones se cargan mediante migrate-verified-repairs.js y se aplican
 * genéricamente según entity_type/entity_id/field_name.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { getContractIdentityKey } = require('./contract-identity');

function ensureRepairTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS verified_data_repairs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      corrected_value TEXT,
      source TEXT NOT NULL,
      reason TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_type, entity_id, field_name)
    );
    CREATE INDEX IF NOT EXISTS idx_verified_repairs_entity
      ON verified_data_repairs(entity_type, entity_id, active);
  `);
}

function findLicitacionId(db, entityId, expectedAuthorityId = null) {
  const exact = db.prepare('SELECT id FROM contracts WHERE id = ?').get(entityId);
  if (exact?.id) return exact.id;

  const columns = db.prepare('PRAGMA table_info(contracts)').all();
  if (!columns.some((column) => column.name === 'placsp_id')) {
    const rows = db.prepare('SELECT id FROM contracts').all();
    const suffix = String(entityId);
    const matches = rows.filter((row) => String(row.id || '').replace(/\/$/, '').endsWith('/' + suffix));
    if (matches.length > 1) {
      throw new Error(`El identificador PLACSP ${entityId} es ambiguo (${matches.length} contratos).`);
    }
    return matches[0]?.id || null;
  }

  const candidates = expectedAuthorityId
    ? db.prepare(
        "SELECT id FROM contracts WHERE contracting_authority_id = ? AND (placsp_id = ? OR placsp_id LIKE '%/' || ?)"
      ).all(expectedAuthorityId, entityId, entityId)
    : db.prepare(
        "SELECT id FROM contracts WHERE placsp_id = ? OR placsp_id LIKE '%/' || ?"
      ).all(entityId, entityId);

  if (candidates.length > 1) {
    throw new Error(
      `El identificador PLACSP ${entityId} es ambiguo (${candidates.length} contratos). ` +
      'La corrección verificada debe usar el ID interno ctr_... o incluir una identidad lógica.'
    );
  }
  return candidates[0]?.id || null;
}

function ensureIdentityMoveHasNoChildCollisions(db, currentContractId, nextContractId) {
  const checks = [
    ['contract_lots', 'contract_id'],
    ['contract_awards', 'contract_id'],
    ['lot_awards', 'contract_id'],
    ['modifications', 'contract_id'],
    ['contract_documents', 'contract_id'],
    ['alert_contracts', 'contract_id'],
    ['related_contracts', 'contract_id'],
    ['verified_contract_metadata', 'contract_id'],
    ['contracts_fts', 'id'],
  ];

  for (const [table, column] of checks) {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);
    if (!exists) continue;

    const row = db.prepare(`SELECT 1 AS present FROM ${table} WHERE ${column} = ? LIMIT 1`).get(nextContractId);
    if (row?.present) {
      throw new Error(
        `La corrección de identidad para ${currentContractId} produciría filas hijas ya existentes en ${table} para ${nextContractId}`
      );
    }
  }
}

function convertValue(fieldName, value) {
  if (value === null || value === undefined) return null;
  if (fieldName === 'contracting_authority_id') return String(value);
  if (['is_lotized', 'lot_count'].includes(fieldName)) return Number(value);
  if (['awarded_amount', 'awarded_amount_incl_vat'].includes(fieldName)) return Number(value);
  return String(value);
}

function repairVerifiedData(db) {
  ensureRepairTable(db);
  const repairs = db.prepare(`
    SELECT entity_id, field_name, corrected_value, source, reason
    FROM verified_data_repairs
    WHERE entity_type = 'licitacion' AND active = 1
    ORDER BY entity_id, field_name
  `).all();

  const grouped = new Map();
  for (const repair of repairs) {
    const list = grouped.get(repair.entity_id) || [];
    list.push(repair);
    grouped.set(repair.entity_id, list);
  }

  const results = [];
  db.exec('BEGIN');
  try {
    for (const [entityId, entityRepairs] of grouped) {
      const authorityRepair = entityRepairs.find((r) => r.field_name === 'contracting_authority_id');
      const expectedAuthorityId = authorityRepair ? String(authorityRepair.corrected_value).trim() : null;
      const licitacionId = findLicitacionId(db, entityId, expectedAuthorityId);
      if (!licitacionId) {
        throw new Error(`No se encontró la licitación ${entityId}`);
      }

      const before = db.prepare(
        'SELECT * FROM contracts WHERE id = ?'
      ).get(licitacionId);

      const allowedFields = new Set([
        'awarded_amount',
        'awarded_amount_incl_vat',
        'is_lotized',
        'lot_count',
        'lots_source',
        'contracting_authority_id',
      ]);

      const nextAuthorityId = authorityRepair
        ? String(authorityRepair.corrected_value).trim()
        : String(before.contracting_authority_id || '').trim();
      const identityChanged = nextAuthorityId !== String(before.contracting_authority_id || '').trim();
      const nextContractId = identityChanged
        ? getContractIdentityKey(before.case_number, nextAuthorityId)
        : licitacionId;

      if (identityChanged) {
        const collision = db.prepare('SELECT id FROM contracts WHERE id = ? AND id <> ?').get(nextContractId, licitacionId);
        if (collision) {
          throw new Error(
            `La corrección de organismo para ${entityId} produciría una identidad contractual ya existente: ${nextContractId}`
          );
        }
        ensureIdentityMoveHasNoChildCollisions(db, licitacionId, nextContractId);
      }

      for (const repair of entityRepairs) {
        if (!allowedFields.has(repair.field_name)) {
          throw new Error(`Campo de corrección no permitido: ${repair.field_name}`);
        }

        const value = convertValue(repair.field_name, repair.corrected_value);
        if (repair.field_name === 'contracting_authority_id') continue;
        db.prepare(
          `UPDATE contracts SET ${repair.field_name} = ? WHERE id = ?`
        ).run(value, licitacionId);
      }

      if (identityChanged) {
        db.prepare('UPDATE contract_lots SET contract_id = ? WHERE contract_id = ?').run(nextContractId, licitacionId);
        if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contract_awards'").get()) {
          db.prepare('UPDATE contract_awards SET contract_id = ? WHERE contract_id = ?').run(nextContractId, licitacionId);
        }
        if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lot_awards'").get()) {
          db.prepare('UPDATE lot_awards SET contract_id = ? WHERE contract_id = ?').run(nextContractId, licitacionId);
        }
        db.prepare('UPDATE modifications SET contract_id = ? WHERE contract_id = ?').run(nextContractId, licitacionId);
        db.prepare('UPDATE contract_documents SET contract_id = ? WHERE contract_id = ?').run(nextContractId, licitacionId);
        if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='alert_contracts'").get()) {
          db.prepare('UPDATE alert_contracts SET contract_id = ? WHERE contract_id = ?').run(nextContractId, licitacionId);
        }
        if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='related_contracts'").get()) {
          db.prepare('UPDATE related_contracts SET contract_id = ? WHERE contract_id = ?').run(nextContractId, licitacionId);
        }
        if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contracts_fts'").get()) {
          db.prepare('UPDATE contracts_fts SET id = ? WHERE id = ?').run(nextContractId, licitacionId);
        }

        if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contract_awards'").get()) {
          const contractAwards = db.prepare('SELECT id, award_index FROM contract_awards WHERE contract_id = ?').all(nextContractId);
          for (const award of contractAwards) {
            const nextId = nextContractId + '_award_' + award.award_index;
            if (nextId !== award.id) db.prepare('UPDATE contract_awards SET id = ? WHERE id = ?').run(nextId, award.id);
          }
        }

        if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='verified_contract_metadata'").get()) {
          db.prepare('UPDATE verified_contract_metadata SET contract_id = ? WHERE contract_id = ?').run(nextContractId, licitacionId);
        }

        const docs = db.prepare('SELECT id FROM contract_documents WHERE contract_id = ?').all(nextContractId);
        for (const doc of docs) {
          const suffix = String(doc.id).match(/_doc_(\d+)$/)?.[1];
          if (suffix) db.prepare('UPDATE contract_documents SET id = ? WHERE id = ?').run(nextContractId + '_doc_' + suffix, doc.id);
        }

        const mods = db.prepare('SELECT id, modification_number FROM modifications WHERE contract_id = ?').all(nextContractId);
        for (const mod of mods) {
          const nextId = nextContractId + '|mod-' + mod.modification_number;
          if (nextId !== mod.id) db.prepare('UPDATE modifications SET id = ? WHERE id = ?').run(nextId, mod.id);
        }

        const lots = db.prepare('SELECT id, lot_number FROM contract_lots WHERE contract_id = ?').all(nextContractId);
        for (const lot of lots) {
          const nextId = nextContractId + '_lote_' + lot.lot_number;
          if (nextId !== lot.id) db.prepare('UPDATE contract_lots SET id = ? WHERE id = ?').run(nextId, lot.id);
        }

        if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lot_awards'").get()) {
          const lotAwards = db.prepare('SELECT id, lot_number, award_index FROM lot_awards WHERE contract_id = ?').all(nextContractId);
          for (const award of lotAwards) {
            const nextId = nextContractId + '_lot_' + award.lot_number + '_award_' + award.award_index;
            if (nextId !== award.id) db.prepare('UPDATE lot_awards SET id = ? WHERE id = ?').run(nextId, award.id);
          }
        }

        db.prepare('UPDATE contracts SET id = ?, contracting_authority_id = ? WHERE id = ?')
          .run(nextContractId, nextAuthorityId, licitacionId);
      }

      // Si la corrección establece explícitamente que no hay lotización,
      // eliminamos únicamente los lotes asociados a esa licitación.
      const lotizadoRepair = entityRepairs.find((r) => r.field_name === 'is_lotized');
      if (lotizadoRepair && Number(lotizadoRepair.corrected_value) === 0) {
        db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(nextContractId);
        const hasLotAwards = db.prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='lot_awards'"
        ).get();
        if (hasLotAwards) {
          db.prepare('DELETE FROM lot_awards WHERE contract_id = ?').run(nextContractId);
        }
      }

      const after = db.prepare(
        'SELECT * FROM contracts WHERE id = ?'
      ).get(nextContractId);

      results.push({
        expedienteId: entityId,
        id: nextContractId,
        antes: before,
        despues: after,
        reparacionesAplicadas: entityRepairs.length,
      });
    }

    db.exec('COMMIT');
    return results;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function getDbPath() {
  return path.resolve(__dirname, '../data/licitaciones_alcazar.db');
}

if (require.main === module) {
  const db = new DatabaseSync(getDbPath());
  try {
    const results = repairVerifiedData(db);
    if (results.length === 0) {
      console.log('No hay correcciones verificadas activas.');
    }
    for (const result of results) {
      console.log(`Correcciones aplicadas a ${result.expedienteId}: ${result.reparacionesAplicadas}`);
    }
  } finally {
    db.close();
  }
}

module.exports = {
  repairVerifiedData,
  ensureRepairTable,
};
