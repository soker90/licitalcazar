import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { migrateVerifiedPersonMappings } = require('./migrate-verified-person-mappings');

describe('migrate-verified-person-mappings', () => {
  it('loads the opaque catalog and is idempotent', () => {
    const dbPath = path.join(os.tmpdir(), `verified_person_mappings_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    const db = new DatabaseSync(dbPath);
    try {
      const count = migrateVerifiedPersonMappings(db);
      expect(count).toBe(8);
      const row = db.prepare('SELECT person_id, person_name, masked_variants_json FROM verified_person_mappings ORDER BY person_id LIMIT 1').get();
      expect(row.person_id).toMatch(/^pf-[0-9a-f]{12}$/);
      expect(row.person_name).toBeTruthy();
      expect(JSON.parse(row.masked_variants_json)).toEqual(expect.any(Array));
      expect(migrateVerifiedPersonMappings(db)).toBe(count);
      expect(db.prepare('SELECT count(*) AS n FROM verified_person_mappings').get().n).toBe(count);
    } finally {
      db.close();
      try { fs.unlinkSync(dbPath); } catch {}
    }
  });
  it('rolls back schema creation when the catalog contains an invalid person id', () => {
    const dbPath = path.join(os.tmpdir(), `verified_person_mappings_atomic_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    const catalogPath = path.join(os.tmpdir(), `verified_person_mappings_invalid_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    const originalCatalog = fs.readFileSync(path.join(process.cwd(), 'src/data/verified-person-mappings.json'), 'utf8');
    const db = new DatabaseSync(dbPath);

    try {
      const catalog = JSON.parse(originalCatalog);
      const firstKey = Object.keys(catalog)[0];
      catalog[firstKey] = { ...catalog[firstKey], canonicalId: 'not-an-opaque-id' };
      fs.writeFileSync(catalogPath, JSON.stringify(catalog));

      expect(() => migrateVerifiedPersonMappings(db, catalogPath)).toThrow('Invalid opaque person id');

      const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'verified_person_mappings'").get();
      expect(table).toBeUndefined();
    } finally {
      db.close();
      try { fs.unlinkSync(dbPath); } catch {}
      try { fs.unlinkSync(catalogPath); } catch {}
    }
  });

});
