// Canonical physical-schema contract tests.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { initDb } = require('./init-db.js');
const { TABLES, COLUMNS } = require('./canonical-schema.js');

describe('canonical schema map', () => {
  it('declares PLACSP/CODICE provenance fields for contracts and lots', () => {
    expect(COLUMNS.contracts).toMatchObject({
      codigo_estado_placsp: 'status_code',
      uri_catalogo_estado_placsp: 'status_code_list_uri',
      codigo_resultado_placsp: 'result_code',
      uri_catalogo_resultado_placsp: 'result_code_list_uri',
    });
    expect(COLUMNS.contract_lots).toMatchObject({
      codigo_resultado_placsp: 'result_code',
      uri_catalogo_resultado_placsp: 'result_code_list_uri',
    });
  });

  it('matches the physical schema created by init-db', () => {
    const db = new DatabaseSync(':memory:');
    try {
      initDb(db);

      const expectedTables = new Set(Object.values(TABLES).filter(name => name !== 'contracts_fts'));
      const actualTables = new Set(
        db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name)
      );

      for (const table of expectedTables) {
        expect(actualTables.has(table), `missing canonical table: ${table}`).toBe(true);
      }

      for (const [table, map] of Object.entries(COLUMNS)) {
        const physicalTable = TABLES[table] || table;
        expect(actualTables.has(physicalTable), `missing table for column map: ${physicalTable}`).toBe(true);
        const actualColumns = new Set(
          db.prepare(`PRAGMA table_info("${physicalTable}")`).all().map(r => r.name)
        );
        for (const target of Object.values(map)) {
          expect(actualColumns.has(target), `missing canonical column: ${physicalTable}.${target}`).toBe(true);
        }
      }
    } finally {
      db.close();
    }
  });
});
