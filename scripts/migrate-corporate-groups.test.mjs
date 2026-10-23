import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { migrateCorporateGroups } = require('./migrate-corporate-groups');

describe('migrate-corporate-groups', () => {
  it('creates the complete catalog and removes stale generated rows', () => {
    const dbPath = path.join(os.tmpdir(), `corporate_groups_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    const db = new DatabaseSync(dbPath);

    try {
      db.exec(`
        CREATE TABLE corporate_groups (
          group_id TEXT PRIMARY KEY,
          group_name TEXT NOT NULL,
          associated_nifs_json TEXT NOT NULL,
          scope TEXT,
          description TEXT
        );
        INSERT INTO corporate_groups(group_id, group_name, associated_nifs_json)
        VALUES ('stale-group', 'Stale Group', '[]');
      `);

      const firstCount = migrateCorporateGroups(db);
      const columns = db.prepare("PRAGMA table_info('corporate_groups')").all().map((row) => row.name);
      const groups = db.prepare('SELECT group_id, group_name, sede, color FROM corporate_groups ORDER BY group_id').all();

      expect(firstCount).toBeGreaterThan(0);
      expect(columns).toEqual(expect.arrayContaining(['sede', 'color']));
      expect(groups.some((group) => group.group_id === 'stale-group')).toBe(false);
      expect(groups.some((group) => group.group_id === 'grupo-serveo')).toBe(true);

      const secondCount = migrateCorporateGroups(db);
      const total = db.prepare('SELECT count(*) AS n FROM corporate_groups').get().n;
      expect(secondCount).toBe(firstCount);
      expect(total).toBe(firstCount);
    } finally {
      db.close();
      try { fs.unlinkSync(dbPath); } catch {}
    }
  });
  it('rolls back schema changes when catalog writes fail', () => {
    const dbPath = path.join(os.tmpdir(), `corporate_groups_atomic_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    const db = new DatabaseSync(dbPath);

    try {
      db.exec(`
        CREATE TABLE corporate_groups (
          group_id TEXT PRIMARY KEY,
          group_name TEXT NOT NULL,
          associated_nifs_json TEXT NOT NULL,
          scope TEXT,
          description TEXT
        );
        INSERT INTO corporate_groups(group_id, group_name, associated_nifs_json)
        VALUES ('stale-group', 'Stale Group', '[]');
        CREATE TRIGGER fail_corporate_group_insert
        BEFORE INSERT ON corporate_groups
        BEGIN
          SELECT RAISE(ABORT, 'forced catalog failure');
        END;
      `);

      expect(() => migrateCorporateGroups(db)).toThrow('forced catalog failure');

      const columns = db.prepare("PRAGMA table_info('corporate_groups')").all().map((row) => row.name);
      const groups = db.prepare('SELECT group_id FROM corporate_groups').all();

      expect(columns).not.toContain('sede');
      expect(columns).not.toContain('color');
      expect(groups).toEqual([{ group_id: 'stale-group' }]);
    } finally {
      db.close();
      try { fs.unlinkSync(dbPath); } catch {}
    }
  });

});
