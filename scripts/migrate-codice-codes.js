const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');

function migrateCodiceCodes(database) {
  console.log('🚀 Migrando columnas CODICE (contract_type_code, procedure_code, procedure_source)...');

  database.exec('BEGIN TRANSACTION;');
  try {
    const cols = database.prepare('PRAGMA table_info(contracts)').all().map(c => c.name);

    if (!cols.includes('contract_type_code')) {
      database.exec('ALTER TABLE contracts ADD COLUMN contract_type_code TEXT;');
      database.exec('CREATE INDEX IF NOT EXISTS idx_contracts_contract_type_code ON contracts(contract_type_code);');
    }
    if (!cols.includes('procedure_code')) {
      database.exec('ALTER TABLE contracts ADD COLUMN procedure_code TEXT;');
      database.exec('CREATE INDEX IF NOT EXISTS idx_contracts_procedure_code ON contracts(procedure_code);');
    }
    if (!cols.includes('procedure_source')) {
      database.exec("ALTER TABLE contracts ADD COLUMN procedure_source TEXT DEFAULT 'codigo';");
    }

    const proc3Update = database.prepare(`
      UPDATE contracts
      SET procedure = 'Negociado sin publicidad',
          procedure_code = '3',
          procedure_source = 'codigo'
      WHERE procedure = 'Negociado con publicidad';
    `).run();
    console.log(`✅ Contratos corregidos a 'Negociado sin publicidad' (código 3): ${proc3Update.changes}`);

    const encargoUpdate = database.prepare(`
      UPDATE contracts
      SET procedure_code = NULL,
          procedure_source = 'inferido'
      WHERE dataset = 'encargos' OR procedure = 'Encargo a medio propio';
    `).run();
    console.log(`✅ Encargos a medio propio actualizados (procedencia 'inferido'): ${encargoUpdate.changes}`);

    database.prepare(`
      UPDATE contracts
      SET procedure_code = '1', procedure_source = 'codigo'
      WHERE procedure = 'Abierto' AND (procedure_code IS NULL OR procedure_code = '');
    `).run();

    database.prepare(`
      UPDATE contracts
      SET procedure_code = '9', procedure_source = 'codigo'
      WHERE procedure = 'Abierto simplificado' AND (procedure_code IS NULL OR procedure_code = '');
    `).run();

    database.prepare(`
      UPDATE contracts
      SET procedure_code = '6', procedure_source = 'codigo'
      WHERE procedure = 'Contrato menor' AND (procedure_code IS NULL OR procedure_code = '');
    `).run();

    database.prepare(`
      UPDATE contracts
      SET procedure_code = '999', procedure_source = 'codigo'
      WHERE procedure = 'Otros' AND (procedure_code IS NULL OR procedure_code = '');
    `).run();

    const tipo50Update = database.prepare(`
      UPDATE contracts
      SET contract_type = 'Patrimonial', contract_type_code = '50'
      WHERE contract_type = 'Colaboración público-privada';
    `).run();
    console.log(`✅ Contratos corregidos a 'Patrimonial' (código 50): ${tipo50Update.changes}`);

    const tipo999Update = database.prepare(`
      UPDATE contracts
      SET contract_type = 'Tipo no clasificado (código 999)', contract_type_code = '999'
      WHERE contract_type = 'Patrimonial' AND (contract_type_code IS NULL OR contract_type_code = '');
    `).run();
    console.log(`✅ Contratos con tipo no clasificado (código 999): ${tipo999Update.changes}`);

    const standardTypeMap = {
      'Suministros': '1',
      'Servicios': '2',
      'Obras': '3',
      'Administrativo especial': '7',
      'Privado': '8',
      'Gestión de Servicios Públicos': '21',
      'Concesión de Servicios': '22',
      'Concesión de Obras Públicas': '31',
      'Concesión de Obras': '32',
    };

    for (const [nombre, codigo] of Object.entries(standardTypeMap)) {
      database.prepare(`
        UPDATE contracts
        SET contract_type_code = ?
        WHERE contract_type = ? AND (contract_type_code IS NULL OR contract_type_code = '');
      `).run(codigo, nombre);
    }

    const remainingNullTipo = database.prepare("SELECT count(*) as c FROM contracts WHERE contract_type_code IS NULL").get().c;
    const remainingNullProc = database.prepare("SELECT count(*) as c FROM contracts WHERE procedure_code IS NULL AND coalesce(procedure, '') != 'Encargo a medio propio'").get().c;

    console.log('\n🔍 Comprobación de integridad:');
    console.log('   • Contratos con contract_type_code nulo: ' + remainingNullTipo);
    console.log('   • Contratos con procedure_code nulo (no encargo): ' + remainingNullProc);

    if (remainingNullTipo > 0 || remainingNullProc > 0) {
      throw new Error('Integrity check failed: some contracts have null codes!');
    }

    database.exec('COMMIT;');
  } catch (error) {
    try { database.exec('ROLLBACK;'); } catch {}
    console.error('↩️ Transacción CODICE revertida tras un error.');
    throw error;
  }

  console.log('✅ Migración completada con éxito.');
}

if (require.main === module) {
  const database = new DatabaseSync(DB_PATH);
  try { migrateCodiceCodes(database); } finally { database.close(); }
}

module.exports = { migrateCodiceCodes, DB_PATH };
