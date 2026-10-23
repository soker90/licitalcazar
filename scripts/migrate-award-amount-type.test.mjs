import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import migrateModule from './migrate-award-amount-type.js';

const { migrateAwardAmountType } = migrateModule;

describe('migrate-award-amount-type', () => {
  it('classifies existing contracts using the canonical award classifier', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        awarded_amount REAL,
        amount_excl_vat REAL,
        object_description TEXT,
        award_amount_type TEXT
      );
      CREATE TABLE contract_lots (id TEXT PRIMARY KEY, contract_id TEXT);
      INSERT INTO contracts VALUES
        ('total', 800, 1000, 'Obras de reforma', 'desconocido'),
        ('unitario', 34, 9270, 'Servicio de reparación y mantenimiento con precio de la hora', 'desconocido'),
        ('unknown', 0.32, 2210, 'Servicio de impresión con alquiler de fotocopiadora', 'desconocido');
    `);

    const result = migrateAwardAmountType(db);

    expect(result.processed).toBe(3);
    expect(result.counts).toEqual({ total: 1, unitario: 1, desconocido: 1 });
    expect(db.prepare('SELECT award_amount_type FROM contracts WHERE id = ?').get('unitario').award_amount_type).toBe('unitario');
    expect(db.prepare('SELECT award_amount_type FROM contracts WHERE id = ?').get('unknown').award_amount_type).toBe('desconocido');
    db.close();
  });

  it('is idempotent', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        awarded_amount REAL,
        amount_excl_vat REAL,
        object_description TEXT,
        award_amount_type TEXT
      );
      CREATE TABLE contract_lots (id TEXT PRIMARY KEY, contract_id TEXT);
      INSERT INTO contracts VALUES ('one', 500, 1000, 'Obras', 'desconocido');
    `);

    migrateAwardAmountType(db);
    migrateAwardAmountType(db);

    expect(db.prepare('SELECT award_amount_type FROM contracts WHERE id = ?').get('one').award_amount_type).toBe('total');
    db.close();
  });
});
