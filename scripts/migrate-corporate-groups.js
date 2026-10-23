#!/usr/bin/env node
/**
 * Synchronizes the versioned corporate-group catalog into SQLite.
 *
 * The catalog file is the reproducible seed; SQLite is the runtime source of
 * truth consumed by application queries.
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const CATALOG_PATH = path.resolve(__dirname, '../src/data/corporate-groups.json');

function hasColumn(db, table, column) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() || []).some((row) => row.name === column);
}

function migrateCorporateGroups(db) {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(`Missing corporate group catalog: ${CATALOG_PATH}`);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const groups = Object.entries(catalog);

  db.exec('BEGIN TRANSACTION');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS corporate_groups (
      group_id TEXT PRIMARY KEY,
      group_name TEXT NOT NULL,
      associated_nifs_json TEXT NOT NULL,
      scope TEXT,
      description TEXT,
      sede TEXT,
        color TEXT
      );
    `);

  if (!hasColumn(db, 'corporate_groups', 'sede')) {
      db.exec('ALTER TABLE corporate_groups ADD COLUMN sede TEXT');
    }
    if (!hasColumn(db, 'corporate_groups', 'color')) {
      db.exec('ALTER TABLE corporate_groups ADD COLUMN color TEXT');
    }

    db.exec('DELETE FROM corporate_groups');

    const insert = db.prepare(`
      INSERT INTO corporate_groups(
        group_id, group_name, associated_nifs_json, scope, description, sede, color
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const [id, group] of groups) {
      if (group.id !== id) {
        throw new Error(`Corporate group catalog key/id mismatch: ${id} != ${group.id}`);
      }
      insert.run(
        id,
        group.nombre,
        JSON.stringify(group.cifs),
        group.ambito || group.scope || null,
        group.description || null,
        group.sede || null,
        group.color || null
      );
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return groups.length;
}

if (require.main === module) {
  const db = new DatabaseSync(DB_PATH);
  try {
    const count = migrateCorporateGroups(db);
    console.log(`✅ Catálogo de grupos corporativos sincronizado: ${count} grupos`);
  } finally {
    db.close();
  }
}

module.exports = { migrateCorporateGroups };
