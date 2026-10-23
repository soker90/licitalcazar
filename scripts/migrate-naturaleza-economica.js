/**
 * Migration script: Populates naturaleza_economica across all contracts.
 * 
 * Values:
 * - 'gasto': Municipal public expenditure.
 * - 'ingreso': Municipal revenue (patrimonial, auctions, demanial concessions, social rentals).
 * - 'concesion': Public service / works concessions under procurement legislation (LCSP).
 * - 'sin_clasificar': Unclassified / ambiguous / requires review.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');

const { classifyEconomicNature } = require('../src/lib/naturaleza-economica.ts');

function migrateEconomicNature(database, classifier = classifyEconomicNature) {
  const counts = { gasto: 0, ingreso: 0, concesion: 0, sin_clasificar: 0 };
  const unclassified = [];
  let rows = [];

  database.exec('BEGIN TRANSACTION;');
  try {
    const cols = database.prepare("PRAGMA table_info('contracts')").all().map(c => c.name);
    if (!cols.includes('economic_nature')) {
      database.exec('ALTER TABLE contracts ADD COLUMN economic_nature TEXT DEFAULT "gasto";');
      database.exec('CREATE INDEX IF NOT EXISTS idx_contracts_economic_nature ON contracts(economic_nature);');
    }

    rows = database.prepare('SELECT id, placsp_id, case_number AS expediente, object_description AS objeto, contract_type_code AS tipo_codigo, contract_type AS tipo_contrato FROM contracts').all();
    const updateStmt = database.prepare('UPDATE contracts SET economic_nature = ? WHERE id = ?');

    
    for (const row of rows) {
      const nature = classifier(row);
      counts[nature]++;
      if (nature === 'sin_clasificar') unclassified.push(row);
      updateStmt.run(nature, row.id);
    }
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }

  return { counts, unclassified, total: rows.length };
}

function main(database = new DatabaseSync(DB_PATH)) {
  console.log('Migrating economic_nature in database...');

  const result = migrateEconomicNature(database);
  console.log(`Processing ${result.total} contracts...`);
  console.log('\\nMigration complete! Breakdown:');
  console.table(result.counts);

  if (result.unclassified.length > 0) {
    console.warn(`\\n⚠️ Warning: ${result.unclassified.length} contracts remained sin_clasificar:`);
    console.table(result.unclassified.map(u => ({ id: u.id, expediente: u.expediente, tipo_codigo: u.tipo_codigo, objeto: String(u.objeto ?? '').slice(0, 60) })));
  } else {
    console.log('\\n✅ 100% of contracts successfully classified. 0 unclassified.');
  }

  const the79 = database.prepare("SELECT economic_nature, count(*) as count FROM contracts WHERE contract_type_code IN ('50', '999') GROUP BY economic_nature").all();
  console.log('\\nBreakdown of the 79 contracts (code 50 & 999):');
  console.table(the79);
}

if (require.main === module) {
  const database = new DatabaseSync(DB_PATH);
  try {
    main(database);
  } finally {
    database.close();
  }
}

module.exports = { migrateEconomicNature, main };
