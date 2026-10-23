#!/usr/bin/env node
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const CONTRACTING_AUTHORITIES_PATH = path.resolve(__dirname, '../data/contracting-authorities.json');
function validateUnique(authorities, field) {
  const seen = new Set();
  for (const row of authorities) {
    const value = row[field];
    if (!value) continue;
    if (seen.has(value)) {
      throw new Error(`Duplicate contracting authority ${field}: ${value}`);
    }
    seen.add(value);
  }
}

function migrate(db, authorities) {
  if (authorities.length === 0) {
    throw new Error('El catálogo de contracting_authorities está vacío; no se modificará el estado activo de la BD.');
  }

  validateUnique(authorities, 'id');
  validateUnique(authorities, 'placsp_id');
  validateUnique(authorities, 'dir3');

  db.exec('BEGIN IMMEDIATE');
  try {
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
      CREATE INDEX IF NOT EXISTS idx_contracting_authorities_active ON contracting_authorities(active);
      CREATE INDEX IF NOT EXISTS idx_contracting_authorities_nif ON contracting_authorities(nif);
      CREATE INDEX IF NOT EXISTS idx_contracting_authorities_placsp ON contracting_authorities(placsp_id);
    `);

    // Older generated databases may already have contracting_authorities without DIR3.
    const authorityColumns = db.prepare('PRAGMA table_info(contracting_authorities)').all().map(c => c.name);
    if (!authorityColumns.includes('dir3')) {
      db.exec('ALTER TABLE contracting_authorities ADD COLUMN dir3 TEXT;');
    }

    const stmt = db.prepare(`
      INSERT INTO contracting_authorities(id, placsp_id, dir3, nif, name, scope, active, historical_names_json)
      VALUES (?,?,?,?,?,?,1,?)
      ON CONFLICT(id) DO UPDATE SET
        placsp_id=excluded.placsp_id,
        dir3=excluded.dir3,
        nif=excluded.nif,
        name=excluded.name,
        scope=excluded.scope,
        historical_names_json=excluded.historical_names_json,
        active=excluded.active
    `);

    for (const row of authorities) {
      stmt.run(row.id, row.placsp_id || null, row.dir3 || null, row.nif || null, row.name,
        row.scope || 'Directa Municipal',
        JSON.stringify(row.historical_names || []));
    }

    // The JSON catalog is authoritative for which contracting authorities are
    // currently active. Keep removed authorities for historical foreign keys,
    // but stop treating them as current targets.
    const deactivateMissing = db.prepare(
      `UPDATE contracting_authorities
       SET active = 0
       WHERE active = 1
         AND id NOT IN (${authorities.map(() => '?').join(',')})`
    );
    deactivateMissing.run(...authorities.map((row) => row.id));

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return db.prepare('SELECT count(*) n FROM contracting_authorities WHERE active=1').get().n;
}

if (require.main === module) {
  if (!fs.existsSync(CONTRACTING_AUTHORITIES_PATH)) throw new Error(`Missing ${CONTRACTING_AUTHORITIES_PATH}`);

  const config = JSON.parse(fs.readFileSync(CONTRACTING_AUTHORITIES_PATH, 'utf8'));
  const authorities = config.contracting_authorities || [];
  const db = new DatabaseSync(DB_PATH);
  try {
    const activeCount = migrate(db, authorities);
    console.log(`✅ contracting_authorities: ${activeCount} active contracting authorities`);
  } finally {
    db.close();
  }
}

module.exports = { migrate };
