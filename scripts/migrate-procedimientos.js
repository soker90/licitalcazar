const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const BACKUP_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.pre-proc-migration.db');

function migrateProcedures(db) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const updateProcResult = db.prepare(`
      UPDATE contracts
      SET procedure = 'Contrato menor'
      WHERE procedure = 'Menor';
    `).run();

    const updateConjuntoResult = db.prepare(`
      UPDATE contracts
      SET dataset = 'menores'
      WHERE dataset = 'contratos_menores';
    `).run();

    const updateNullProcResult = db.prepare(`
      UPDATE contracts
      SET procedure = 'Encargo a medio propio'
      WHERE procedure IS NULL AND dataset = 'encargos';
    `).run();

    db.exec(`
      DROP TABLE IF EXISTS contracts_fts;

      CREATE VIRTUAL TABLE contracts_fts USING fts5(
        id UNINDEXED,
        case_number,
        object_description,
        contracting_authority_name,
        awardee,
        tokenize='porter unicode61'
      );

      INSERT INTO contracts_fts(id, case_number, object_description, contracting_authority_name, awardee)
      SELECT id, case_number, object_description, contracting_authority_name, awardee FROM contracts;
    `);

    db.exec('ANALYZE;');
    db.exec('COMMIT;');

    return {
      procedures: updateProcResult.changes,
      datasets: updateConjuntoResult.changes,
      nullProcedures: updateNullProcResult.changes,
    };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* transaction may already have rolled back */ }
    throw error;
  }
}

function main({ dbPath = DB_PATH, backupPath = BACKUP_PATH } = {}) {
  console.log('📦 Creando copia de seguridad de la base de datos...');
  try {
    fs.copyFileSync(dbPath, backupPath, fs.constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`Ya existe un backup recuperable en ${backupPath}; se cancela para evitar sobrescribirlo.`);
    }
    throw error;
  }
  console.log(`✅ Copia de seguridad creada en: ${backupPath}`);

  const db = new DatabaseSync(dbPath);
  try {
    console.log('\n📊 Estado previo de procedimientos:');
    console.table(db.prepare("SELECT coalesce(procedure, 'NULL') as procedure, count(*) as count FROM contracts GROUP BY procedure ORDER BY count DESC").all());

    console.log('\n📊 Estado previo de conjuntos:');
    console.table(db.prepare("SELECT coalesce(dataset, 'NULL') as dataset, count(*) as count FROM contracts GROUP BY dataset ORDER BY count DESC").all());

    console.log('\n🔄 Aplicando unificación de procedimientos y conjuntos...');
    const result = migrateProcedures(db);
    console.log(`✅ Contratos actualizados de 'Menor' a 'Contrato menor': ${result.procedures}`);
    console.log(`✅ Contratos actualizados de 'contratos_menores' a 'menores': ${result.datasets}`);
    console.log(`✅ Contratos con procedure NULL asignados a 'Encargo a medio propio': ${result.nullProcedures}`);

    console.log('\n📊 Estado POST-MIGRACIÓN de procedimientos:');
    console.table(db.prepare("SELECT coalesce(procedure, 'NULL') as procedure, count(*) as count FROM contracts GROUP BY procedure ORDER BY count DESC").all());

    console.log('\n📊 Estado POST-MIGRACIÓN de conjuntos:');
    console.table(db.prepare("SELECT coalesce(dataset, 'NULL') as dataset, count(*) as count FROM contracts GROUP BY dataset ORDER BY count DESC").all());

    console.log('\n🎉 Migración completada exitosamente.');
  } finally {
    db.close();
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = { migrateProcedures, main };
