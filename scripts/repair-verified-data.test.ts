import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { repairVerifiedData } = require('./repair-verified-data.js');

describe('repairVerifiedData', () => {
  it('corrige el expediente 17354524 de forma idempotente', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        placsp_id TEXT,
        case_number TEXT,
        awarded_amount REAL,
        awarded_amount_incl_vat REAL,
        is_lotized INTEGER,
        lot_count INTEGER,
        lots_source TEXT
      );
      CREATE TABLE verified_data_repairs (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        field_name TEXT NOT NULL,
        corrected_value TEXT,
        source TEXT NOT NULL,
        reason TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(entity_type, entity_id, field_name)
      );
      CREATE TABLE contract_lots (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL
      );
    `);

    db.prepare('INSERT INTO contracts VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/17354524',
      '17354524',
      '17354524',
      3740813.88,
      4526384.80,
      0,
      2,
      'CODICE_TENDER_RESULTS'
    );
    db.prepare('INSERT INTO contract_lots VALUES (?, ?)').run(
      'lote1',
      'https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/17354524'
    );

    const repairs = [
      ['repair-17354524-award', 'awarded_amount', '1870406.94', 'Importe adjudicado verificado'],
      ['repair-17354524-award-iva', 'awarded_amount_incl_vat', '2263192.40', 'Importe adjudicado con IVA verificado'],
      ['repair-17354524-lotizado', 'is_lotized', '0', 'Expediente sin lotización'],
      ['repair-17354524-num-lotes', 'lot_count', '1', 'Valor estructurado verificado'],
      ['repair-17354524-origen', 'lots_source', 'VERIFICADO_PLACSP', 'Origen verificado'],
    ];
    const insert = db.prepare(`
      INSERT INTO verified_data_repairs
        (id, entity_type, entity_id, field_name, corrected_value, source, reason, active)
      VALUES (?, 'licitacion', '17354524', ?, ?, 'VERIFICADO_PLACSP', ?, 1)
    `);
    for (const [id, field, value, reason] of repairs) insert.run(id, field, value, reason);

    repairVerifiedData(db);
    repairVerifiedData(db);

    const row = db.prepare('SELECT * FROM contracts').get();
    expect(row.awarded_amount).toBe(1870406.94);
    expect(row.awarded_amount_incl_vat).toBe(2263192.40);
    expect(row.is_lotized).toBe(0);
    expect(row.lot_count).toBe(1);
    expect(row.lots_source).toBe('VERIFICADO_PLACSP');
    expect(db.prepare('SELECT count(*) as c FROM contract_lots').get().c).toBe(0);
    db.close();
  });
});
