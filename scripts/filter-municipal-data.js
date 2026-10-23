const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const BACKUP_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.backup.db');

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function filterMunicipalData(db) {
  const directOrgs = db.prepare("SELECT id FROM contracting_authorities WHERE active = 1 AND scope = 'Directa Municipal'").all().map(r => r.id);
  const indirectOrgs = db.prepare("SELECT id FROM contracting_authorities WHERE active = 1 AND scope = 'Indirecta (Mancomunidad)'").all().map(r => r.id);
  const allMunicipalOrgs = [...directOrgs, ...indirectOrgs];

  // This script is destructive: an empty authority catalog must never turn
  // into a DELETE of every contract because NOT IN () has surprising semantics.
  if (allMunicipalOrgs.length === 0) {
    throw new Error('No hay organismos municipales activos; se cancela la depuración para proteger los contratos.');
  }

  const initialCount = db.prepare('SELECT count(*) as c FROM contracts').get().c;
  console.log(`Total contratos iniciales: ${initialCount}`);

  db.exec('BEGIN IMMEDIATE');
  let finalCount;
  try {
    // Resolve the exact parent set before deleting anything so dependent
    // records can be removed first and never become orphans.
    const externalContractIds = db.prepare(`
      SELECT id FROM contracts
      WHERE contracting_authority_id NOT IN (${allMunicipalOrgs.map(() => '?').join(',')})
    `).all(...allMunicipalOrgs).map(row => row.id);

    if (externalContractIds.length > 0) {
      const placeholders = externalContractIds.map(() => '?').join(',');
      const childTables = [
        'contract_lots',
        'modifications',
        'contract_documents',
        'contract_awards',
        'lot_awards',
        'verified_contract_metadata',
        'related_contracts',
        'alert_contracts',
      ];
      for (const table of childTables) {
        if (tableExists(db, table)) {
          db.prepare(`DELETE FROM "${table}" WHERE contract_id IN (${placeholders})`).run(...externalContractIds);
        }
      }
      if (tableExists(db, 'alerts') && tableExists(db, 'alert_contracts')) {
        db.exec('DELETE FROM alerts WHERE id NOT IN (SELECT DISTINCT alert_id FROM alert_contracts)');
      }
    }

    // Delete external non-municipal contracts only after their child rows.
    const deleteStmt = db.prepare(`
      DELETE FROM contracts
      WHERE contracting_authority_id NOT IN (${allMunicipalOrgs.map(() => '?').join(',')})
    `);
    deleteStmt.run(...allMunicipalOrgs);

    db.prepare(`
      UPDATE contracts
      SET scope = 'Directa Municipal'
      WHERE contracting_authority_id IN (${directOrgs.map(() => '?').join(',')})
    `).run(...directOrgs);

    db.prepare(`
      UPDATE contracts
      SET scope = 'Indirecta (Mancomunidad)'
      WHERE contracting_authority_id IN (${indirectOrgs.map(() => '?').join(',')})
    `).run(...indirectOrgs);

    finalCount = db.prepare('SELECT count(*) as c FROM contracts').get().c;

    // Rebuild FTS5 in the same transaction so a schema/indexing error rolls
    // back the contract deletions instead of leaving the database half-updated.
    console.log('🔄 Reconstruyendo índice FTS5 de búsqueda de texto completo...');
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

      CREATE INDEX IF NOT EXISTS idx_contracts_authority_id ON contracts(contracting_authority_id);
      CREATE INDEX IF NOT EXISTS idx_contracts_scope ON contracts(scope);
      CREATE INDEX IF NOT EXISTS idx_contracts_awardee ON contracts(awardee);
      CREATE INDEX IF NOT EXISTS idx_contracts_awardee_nif ON contracts(awardee_nif);
      CREATE INDEX IF NOT EXISTS idx_contracts_year ON contracts(year);
      CREATE INDEX IF NOT EXISTS idx_contracts_contract_type ON contracts(contract_type);
      CREATE INDEX IF NOT EXISTS idx_contracts_procedure ON contracts(procedure);
      CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
      CREATE INDEX IF NOT EXISTS idx_contracts_publication_date ON contracts(publication_date);
    `);

    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Preserve the original failure if the transaction has already ended.
    }
    throw error;
  }

  console.log(`✅ Registros depurados. Total contratos municipales: ${finalCount} (Eliminados: ${initialCount - finalCount})`);
  console.log('⚡ Ejecutando VACUUM y ANALYZE...');
  db.exec('VACUUM;');
  db.exec('ANALYZE;');
  console.log('🎉 Migración y optimización completadas con éxito.');

  return { initialCount, finalCount, removedCount: initialCount - finalCount };
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
    console.log('🧹 Depurando registros no dependientes del Ayuntamiento de Alcázar...');
    return filterMunicipalData(db);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('❌ Error al depurar los contratos municipales:', error);
    process.exitCode = 1;
  }
}

module.exports = { filterMunicipalData, main };
