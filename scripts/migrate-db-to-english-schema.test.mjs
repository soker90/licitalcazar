import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { migrate, assertNoSpanishSchema } = require('./migrate-db-to-english-schema');

describe('migrate-db-to-english-schema', () => {
  it('refuses to overwrite an existing recovery backup', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'licitalcazar-existing-backup-'));
    const dbPath = path.join(dir, 'test.db');
    const backupPath = `${dbPath}.before-english-schema.bak`;
    const db = new DatabaseSync(dbPath);

    try {
      db.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY); INSERT INTO contracts VALUES (\'known-good\')');
      db.close();
      fs.writeFileSync(backupPath, 'previous recovery copy');

      expect(() => migrate(dbPath)).toThrow('refusing to overwrite the recoverable database');
      expect(fs.readFileSync(backupPath, 'utf8')).toBe('previous recovery copy');

      const unchanged = new DatabaseSync(dbPath, { readOnly: true });
      try {
        expect(unchanged.prepare('SELECT id FROM contracts').all()).toEqual([{ id: 'known-good' }]);
      } finally {
        unchanged.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('keeps missing case, lot and modification numbers as TEXT identifiers', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'licitalcazar-identifier-types-'));
    const dbPath = path.join(dir, 'test.db');
    const db = new DatabaseSync(dbPath);

    try {
      db.exec(`
        CREATE TABLE contracts (
          id TEXT PRIMARY KEY,
          object_description TEXT,
          contracting_authority_name TEXT,
          contracting_authority_id TEXT,
          awardee TEXT
        );
        CREATE TABLE contract_lots (id TEXT PRIMARY KEY, contract_id TEXT);
        CREATE TABLE modifications (id TEXT PRIMARY KEY, contract_id TEXT);
      `);
      db.close();

      migrate(dbPath);
      const migrated = new DatabaseSync(dbPath);
      try {
        const typeOf = (table, column) => migrated
          .prepare(`PRAGMA table_info("${table}")`)
          .all()
          .find((item) => item.name === column)?.type;
        expect(typeOf('contracts', 'case_number')).toBe('TEXT');
        expect(typeOf('contract_lots', 'lot_number')).toBe('TEXT');
        expect(typeOf('modifications', 'modification_number')).toBe('TEXT');
      } finally {
        migrated.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('migrates the canonical Spanish physical schema to English and rebuilds FTS', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'licitalcazar-english-schema-'));
    const dbPath = path.join(dir, 'test.db');
    const db = new DatabaseSync(dbPath);

    try {
      db.exec(`
        CREATE TABLE licitaciones (
          id TEXT PRIMARY KEY,
          expediente TEXT,
          objeto TEXT,
          dependencia TEXT,
          tipo_contrato TEXT,
          procedimiento TEXT,
          estado TEXT,
          importe_adjudicacion REAL,
          awardee TEXT,
          year TEXT,
          scope TEXT,
          contracting_authority_id TEXT,
          contracting_authority_name TEXT,
          contracting_authority_nif TEXT,
          contracting_authority_dir3 TEXT,
          contracting_authority_city TEXT
        );
        CREATE TABLE grupos_empresariales (
          grupo_id TEXT PRIMARY KEY,
          nombre_grupo TEXT,
          cifs_asociados_json TEXT,
          ambito TEXT,
          descripcion TEXT
        );
        CREATE TABLE contracting_authorities (
          id TEXT PRIMARY KEY,
          placsp_id TEXT,
          dir3 TEXT,
          nif TEXT,
          name TEXT,
          scope TEXT,
          active INTEGER,
          historical_names_json TEXT
        );
        CREATE VIRTUAL TABLE licitaciones_fts USING fts5(
          id UNINDEXED, expediente, objeto, organo_contratante, adjudicatario
        );
      `);

      db.prepare(
        'INSERT INTO licitaciones(id, expediente, objeto, contracting_authority_name, awardee) VALUES (?, ?, ?, ?, ?)'
      ).run('ctr_test', 'EXP-1', 'Objeto de prueba', 'Ayuntamiento de prueba', 'Empresa de prueba');

      db.prepare(
        'INSERT INTO grupos_empresariales(grupo_id, nombre_grupo, cifs_asociados_json, ambito, descripcion) VALUES (?, ?, ?, ?, ?)'
      ).run('group_test', 'Grupo de prueba', '[]', 'Directa Municipal', 'Descripción de prueba');

      db.prepare(
        'INSERT INTO contracting_authorities(id, placsp_id, dir3, nif, name, scope, active, historical_names_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        'ayuntamiento-contratacion',
        'custom-placsp',
        'CUSTOM-DIR3',
        'CUSTOM-NIF',
        'Nombre personalizado',
        'Custom scope',
        0,
        '["Nombre histórico personalizado"]'
      );

      db.close();

      const result = migrate(dbPath);
      expect(result.tables).toContain('contracts');
      expect(result.tables).toContain('contracts_fts');
      expect(result.tables).not.toContain('licitaciones_fts');

      const migrated = new DatabaseSync(dbPath);
      try {
        expect(() => assertNoSpanishSchema(migrated)).not.toThrow();
        expect(migrated.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
        migrated.exec('PRAGMA foreign_keys = ON');
        expect(migrated.prepare('PRAGMA foreign_keys').get().foreign_keys).toBe(1);

        expect(
          migrated.prepare('SELECT case_number, object_description, awardee FROM contracts WHERE id = ?').get('ctr_test')
        ).toEqual({
          case_number: 'EXP-1',
          object_description: 'Objeto de prueba',
          awardee: 'Empresa de prueba',
        });

        expect(
          migrated.prepare('SELECT group_id, group_name, scope, description FROM corporate_groups WHERE group_id = ?').get('group_test')
        ).toEqual({
          group_id: 'group_test',
          group_name: 'Grupo de prueba',
          scope: 'Directa Municipal',
          description: 'Descripción de prueba',
        });

        expect(
          migrated.prepare('SELECT id, placsp_id, dir3, nif, name, scope, active, historical_names_json FROM contracting_authorities WHERE id = ?').get('ayuntamiento-contratacion')
        ).toEqual({
          id: 'ayuntamiento-contratacion',
          placsp_id: 'custom-placsp',
          dir3: 'CUSTOM-DIR3',
          nif: 'CUSTOM-NIF',
          name: 'Nombre personalizado',
          scope: 'Custom scope',
          active: 0,
          historical_names_json: '["Nombre histórico personalizado"]',
        });

        expect(
          migrated.prepare('SELECT id, case_number, object_description, contracting_authority_name, awardee FROM contracts_fts WHERE id = ?').get('ctr_test')
        ).toEqual({
          id: 'ctr_test',
          case_number: 'EXP-1',
          object_description: 'Objeto de prueba',
          contracting_authority_name: 'Ayuntamiento de prueba',
          awardee: 'Empresa de prueba',
        });
      } finally {
        migrated.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
