#!/usr/bin/env node
/**
 * Destructive rebuild of the generated database from official source feeds
 * and versioned deterministic transformations.
 *
 * The rebuild is protected by a same-filesystem backup: a failed rebuild
 * never replaces a previously valid generated database.
 *
 * Usage:
 *   pnpm run rebuild-db
 *   # For a single-year incremental sync, use: pnpm run sync --year=2026
 *   pnpm run rebuild-db -- --no-download
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const LOT_CACHE_PATH = path.resolve(__dirname, '../data/lotes_cache.json');
const REBUILD_BACKUP_PATH = `${DB_PATH}.rebuild-backup`;

function run(script, args = []) {
  console.log(`\n════════ ${script} ${args.join(' ')} ════════`);
  execFileSync(process.execPath, [path.join(__dirname, script), ...args], {
    stdio: 'inherit', cwd: path.resolve(__dirname, '..')
  });
}

function rebuildDatabase({
  dbPath = DB_PATH,
  lotCachePath = LOT_CACHE_PATH,
  backupPath = REBUILD_BACKUP_PATH,
  fsImpl = fs,
  runStep = run,
  years = ['--year=all'],
  noDownload = false,
} = {}) {
  if (years.length !== 1 || years[0] !== '--year=all') {
    throw new Error('La reconstrucción limpia debe abarcar todos los años (--year=all); para sincronizar un año sin borrar el histórico, ejecuta pnpm run sync --year=2026.');
  }

  const hadExistingDatabase = fsImpl.existsSync(dbPath);

  if (hadExistingDatabase) {
    if (fsImpl.existsSync(backupPath)) {
      throw new Error(`Existe un backup de rebuild anterior en ${backupPath}; se cancela para evitar sobrescribir una BD recuperable.`);
    }
    fsImpl.renameSync(dbPath, backupPath);
    console.log(`♻️ BD generada anterior protegida en ${backupPath}.`);
  }

  try {
    // Never reuse derived lot caches during a clean rebuild: the official
    // feeds and deterministic scripts must be the only source of truth.
    if (fsImpl.existsSync(lotCachePath)) fsImpl.unlinkSync(lotCachePath);

    runStep('init-db.js');
    runStep('migrate-corporate-name-history.js');
    runStep('migrate-db.js');
    runStep('migrate-contract-identifiers.js');
    runStep('sync.js', [...years, ...(noDownload ? [] : ['--download'])]);
    // Verified contract seeds are versioned corrections for records that must
    // be present even when the current PLACSP feed does not reproduce them.
    runStep('migrate-verified-contract-seeds.js');
    runStep('sync-subvenciones.js');
    runStep('migrate-naturaleza-economica.js');
    runStep('sync-modificaciones.js');
    runStep('migrate-verified-repairs.js');
    runStep('repair-verified-data.js');
    runStep('migrate-verified-contract-metadata.js');
    runStep('sync-documentos.js', ['--all']);
    // Resolve the small subset of PLACSP awards that are published as
    // apparent unit prices only after the official tender documents exist.
    runStep('classify-award-amount-documents.js');
    runStep('anonymize-personal-nifs.js');
    runStep('refresh-resolution.js');
    runStep('build-db.js');
    runStep('validate-rebuilt-db.js');

    if (hadExistingDatabase) fsImpl.unlinkSync(backupPath);
    console.log('\n✅ Rebuild completo finalizado y validado.');
  } catch (error) {
    // Recovery must never destroy the only known-good copy. If restoration
    // fails, keep the backup in place and surface both the original rebuild
    // error and the recovery error.
    try {
      if (fsImpl.existsSync(dbPath)) fsImpl.unlinkSync(dbPath);
      if (hadExistingDatabase && fsImpl.existsSync(backupPath)) {
        fsImpl.renameSync(backupPath, dbPath);
        console.error(`↩️ Rebuild fallido: restaurada la BD anterior desde ${backupPath}.`);
      }
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        `Rebuild failed (${error.message}); recovery also failed (${recoveryError.message}). The backup is preserved at ${backupPath} when still present.`
      );
    }
    throw error;
  }
}

if (require.main === module) {
  const cli = process.argv.slice(2);
  const yearArg = cli.find(a => a.startsWith('--year='));
  const years = yearArg ? [yearArg] : ['--year=all'];
  const noDownload = cli.includes('--no-download');

  try {
    rebuildDatabase({ years, noDownload });
  } catch (error) {
    console.error(`❌ Rebuild fallido: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { rebuildDatabase, DB_PATH, LOT_CACHE_PATH, REBUILD_BACKUP_PATH };
