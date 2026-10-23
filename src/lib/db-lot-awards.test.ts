import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { ensureLotAwardsTable } from './db';

describe('ensureLotAwardsTable legacy fallback', () => {
  let db: DatabaseSync | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('does not promote terminal legacy lots to awarded lots', () => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (id TEXT PRIMARY KEY, case_number TEXT);
      CREATE TABLE contract_lots (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        case_number TEXT,
        lot_number TEXT NOT NULL,
        lot_status TEXT,
        awardee TEXT,
        awardee_nif TEXT,
        awarded_amount REAL,
        awarded_amount_incl_vat REAL,
        offer_count INTEGER,
        award_date TEXT,
        result_code TEXT,
        result_code_list_uri TEXT,
        lot_name TEXT
      );
      INSERT INTO contracts (id, case_number) VALUES ('C1', 'EXP/1');
    `);

    const insertLot = db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_status, awardee, awarded_amount
      ) VALUES (?, 'C1', ?, ?, ?, ?)
    `);
    const statuses = [
      ['valid', '1', 'Adjudicado', 'Empresa válida', 100],
      ['renounced', '2', 'Renunciado', 'Empresa renunciada', 200],
      ['withdrawn', '3', 'Desistido', 'Empresa desistida', 300],
      ['retired', '4', 'Retirado', 'Empresa retirada', 400],
      ['deserted', '5', 'Desierto', 'Empresa desierta', 500],
      ['cancelled', '6', 'Cancelado', 'Empresa cancelada', 600],
    ];
    for (const [id, lotNumber, status, awardee, amount] of statuses) {
      insertLot.run(id, lotNumber, status, awardee, amount);
    }

    ensureLotAwardsTable(db);

    const fallbackAwards = db.prepare(`
      SELECT lot_number, awardee, awarded_amount, result_state
      FROM lot_awards
      ORDER BY lot_number
    `).all();

    expect(fallbackAwards).toEqual([
      { lot_number: '1', awardee: 'Empresa válida', awarded_amount: 100, result_state: 'Adjudicado' },
    ]);
  });
});
