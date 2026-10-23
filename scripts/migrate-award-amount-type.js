#!/usr/bin/env node
/**
 * Backfills award_amount_type on an existing database.
 *
 * New/rebuilt databases classify the value while syncing. Versioned databases
 * need the same deterministic classification applied before the application
 * and audit queries can use the field.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { classifyAwardAmountType } = require('./award-amount');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');

function migrateAwardAmountType(db) {
  const rows = db.prepare(`
    SELECT
      c.id,
      c.awarded_amount,
      c.amount_excl_vat,
      c.object_description,
      (
        SELECT count(*)
        FROM contract_lots l
        WHERE l.contract_id = c.id
      ) AS lot_count
    FROM contracts c
  `).all();

  const update = db.prepare(
    'UPDATE contracts SET award_amount_type = ? WHERE id = ?'
  );

  const counts = { total: 0, unitario: 0, desconocido: 0 };
  db.exec('BEGIN TRANSACTION;');
  try {
    for (const row of rows) {
      const type = classifyAwardAmountType({
        awardedAmount: row.awarded_amount,
        budgetAmount: row.amount_excl_vat,
        objectDescription: row.object_description,
        lotCount: row.lot_count,
      });
      update.run(type, row.id);
      counts[type]++;
    }
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }

  return { processed: rows.length, counts };
}

if (require.main === module) {
  const db = new DatabaseSync(DB_PATH);
  try {
    const result = migrateAwardAmountType(db);
    console.log(`Award amount type migration completed: ${result.processed} contracts processed.`);
    console.log(result.counts);
  } finally {
    db.close();
  }
}

module.exports = { migrateAwardAmountType, DB_PATH };
