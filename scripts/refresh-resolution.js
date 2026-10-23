const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { eligibleAwardLotStatusSql, eligibleAwardResultStateSql, terminalNoAwardResultStateSql } = require('../src/lib/lot-status.js');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');

function buildPairsQuery(hasLotAwards, hasContractAwards = false) {
  return `
    SELECT DISTINCT raw_nif, raw_name
    FROM (
      SELECT
        coalesce(awardee_nif, '') AS raw_nif,
        coalesce(awardee, '') AS raw_name
      FROM contracts
      WHERE trim(coalesce(awardee, '')) <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM contract_lots parent_lot
          WHERE parent_lot.contract_id = contracts.id
        )
        ${hasLotAwards ? `AND NOT EXISTS (
          SELECT 1
          FROM lot_awards award
          WHERE award.contract_id = contracts.id
        )` : ''}
        ${hasContractAwards ? `AND NOT EXISTS (
          SELECT 1
          FROM contract_awards award
          WHERE award.contract_id = contracts.id
        )` : ''}

      UNION ALL

      SELECT
        coalesce(ll.awardee_nif, '') AS raw_nif,
        coalesce(ll.awardee, '') AS raw_name
      FROM contract_lots ll
      WHERE trim(coalesce(ll.awardee, '')) <> ''
        AND ${eligibleAwardLotStatusSql('ll')}
        ${hasLotAwards ? `AND NOT EXISTS (
          SELECT 1
          FROM lot_awards award
          WHERE award.contract_id = ll.contract_id
            AND award.lot_number = ll.lot_number
            AND (
              (
                award.awardee IS NOT NULL
                AND trim(award.awardee) <> ''
                AND ${eligibleAwardResultStateSql('award')}
              )
              OR ${terminalNoAwardResultStateSql('award')}
            )
        )` : ''}

      ${hasLotAwards ? `
      UNION ALL

      SELECT
        coalesce(award.awardee_nif, '') AS raw_nif,
        coalesce(award.awardee, '') AS raw_name
      FROM lot_awards award
      WHERE trim(coalesce(award.awardee, '')) <> ''
        AND ${eligibleAwardResultStateSql('award')}
        AND NOT EXISTS (
          SELECT 1
          FROM contract_lots lot
          WHERE lot.contract_id = award.contract_id
            AND lot.lot_number = award.lot_number
            AND NOT ${eligibleAwardLotStatusSql('lot')}
        )
      ` : ''}

      ${hasContractAwards ? `
      UNION ALL

      SELECT
        coalesce(award.awardee_nif, '') AS raw_nif,
        coalesce(award.awardee, '') AS raw_name
      FROM contract_awards award
      WHERE trim(coalesce(award.awardee, '')) <> ''
        AND ${eligibleAwardResultStateSql('award')}
        AND NOT EXISTS (
          SELECT 1
          FROM contract_lots lot
          WHERE lot.contract_id = award.contract_id
        )
        ${hasLotAwards ? `AND NOT EXISTS (
          SELECT 1
          FROM lot_awards lot_award
          WHERE lot_award.contract_id = award.contract_id
        )` : ''}
      ` : ''}
    )
  `;
}

async function refreshTable(db = new DatabaseSync(DB_PATH)) {
  const { resolveEntityFromDb } = await import('../src/lib/db-corporate.ts');

  db.exec('BEGIN TRANSACTION;');
  try {
    db.exec('DELETE FROM company_resolution;');

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO company_resolution (
        raw_nif, raw_name, canonical_id, canonical_nif, canonical_name,
        group_id, group_name, link_type, link_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const hasLotAwards = Boolean(db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
    ).get());
    const hasContractAwards = Boolean(db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'contract_awards' LIMIT 1"
    ).get());

    const pairs = db.prepare(buildPairsQuery(hasLotAwards, hasContractAwards)).all();

    for (const pair of pairs) {
      const resolved = resolveEntityFromDb(db, pair.raw_nif, pair.raw_name);
      insertStmt.run(
        pair.raw_nif,
        pair.raw_name,
        resolved.canonicalId,
        resolved.canonicalCif,
        resolved.canonicalNombre,
        resolved.grupo?.id || null,
        resolved.grupo?.nombre || null,
        resolved.tipoVinculo,
        resolved.motivoVinculo || null
      );
    }

    db.exec('COMMIT;');
    const count = db.prepare('SELECT count(*) AS cnt FROM company_resolution').get().cnt;
    if (!process.argv.includes('--skip-vacuum')) {
      db.exec('PRAGMA journal_mode = DELETE; VACUUM;');
    }
    console.log(`✅ company_resolution refreshed successfully with ${count} records${process.argv.includes('--skip-vacuum') ? ' (sin VACUUM)' : ''}.`);
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* transaction may already be committed */ }
    throw error;
  }
}

if (require.main === module) {
  const db = new DatabaseSync(DB_PATH);
  refreshTable(db)
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { buildPairsQuery, refreshTable };
