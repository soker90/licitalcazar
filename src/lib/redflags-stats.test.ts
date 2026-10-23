import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluarRedFlags, getRedFlagsStats, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';

describe('getRedFlagsStats y expedientes multilot', () => {
  it('usa offer_count de lot_awards cuando falta en contract_lots para las alertas de lotes', () => {
    const db = createGeneratedTestDb(20261010, 1);
    const contractId = 'generated-20261010-1';

    db.prepare(`UPDATE contracts SET
      status = 'Adjudicada', awardee = 'Varios adjudicatarios', offer_count = 2,
      year = 2026, scope = 'Directa Municipal', procedure = 'Abierto', is_lotized = 1
      WHERE id = ?`).run(contractId);
    db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(contractId);
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee, offer_count
      ) VALUES
        ('redflag-award-count-lot-1', ?, '1', 'Lote 1', 7000, 'Adjudicado', 'Empresa Lote 1', NULL),
        ('redflag-award-count-lot-2', ?, '2', 'Lote 2', 5000, 'Adjudicado', 'Empresa Lote 2', NULL)
    `).run(contractId, contractId);
    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, offer_count, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'redflag-award-count-1', contractId, 'GEN/2026/1', '1', 0,
      'Empresa Lote 1', 7000, 1, 'Adjudicado',
    );

    setDbForTests(db);
    try {
      const expediente = getRedFlagsStats(2026, 'Directa Municipal')
        .topExpedientesConAlertas.find((item) => item.id === contractId);

      expect(expediente).toBeDefined();
      expect(expediente?.alerts.some((alert) => alert.includes('Oferta Única'))).toBe(true);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });


  it('no detecta una baja cuando el snapshot de lot_awards es parcial', () => {
    const db = createGeneratedTestDb(20261016, 1);
    const contractId = 'generated-20261016-1';

    db.prepare(`UPDATE contracts SET
      status = 'Adjudicada', awardee = 'Varios adjudicatarios', offer_count = 2,
      year = 2026, scope = 'Directa Municipal', procedure = 'Abierto',
      economic_nature = 'gasto', award_amount_type = 'total', awarded_amount = NULL,
      amount_excl_vat = 15000, is_lotized = 1
      WHERE id = ?`).run(contractId);
    db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(contractId);
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_name, budget_excl_vat, awarded_amount,
        lot_status, awardee, offer_count
      ) VALUES
        (?, ?, '1', 'Lote 1', 10000, NULL, 'Adjudicado', 'Empresa Lote 1', 2),
        (?, ?, '2', 'Lote 2', 5000, 5000, 'Adjudicado', 'Empresa Lote 2', 2)
    `).run(
      'redflag-lot-awards-amount-lot-1', contractId,
      'redflag-lot-awards-amount-lot-2', contractId,
    );
    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, '1', 0, 'Empresa Lote 1', 5000, 'Adjudicado')
    `).run(
      'redflag-lot-awards-amount-award',
      contractId,
      'GEN/2026/1',
    );

    setDbForTests(db);
    try {
      const stats = getRedFlagsStats(2026, 'Directa Municipal');
      const expediente = stats.topExpedientesConAlertas.find((item) => item.id === contractId);

      // A partial structured snapshot must not create a false discount alert.
      // If no independent red flag remains, the contract is correctly absent from this list.
      expect(expediente).toBeUndefined();
      expect(stats.totalBajaCero).toBe(0);
      expect(stats.volumenBajaCero).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  afterEach(() => {
    setDbForTests(null);
  });

  it('usa lot_awards para el volumen de una red flag', () => {
    const db = createGeneratedTestDb(20260932, 1);
    db.prepare(`UPDATE contracts SET
      status = 'Adjudicada', awardee = 'Varios adjudicatarios', award_amount_type = 'total',
      awarded_amount = 999, amount_excl_vat = 20000, offer_count = 1, year = 2026,
      scope = 'Directa Municipal', procedure = 'Abierto'
      WHERE id = 'generated-20260932-1'`).run();
    db.prepare(`DELETE FROM contract_lots WHERE contract_id = 'generated-20260932-1'`).run();
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee
      ) VALUES
        ('redflag-lot-1', 'generated-20260932-1', '1', 'Lote 1', 7000, 'Adjudicado', 'Empresa RedFlag A'),
        ('redflag-lot-2', 'generated-20260932-1', '2', 'Lote 2', 5000, 'Adjudicado', 'Empresa RedFlag B'),
        ('redflag-lot-cancelled', 'generated-20260932-1', '4', 'Lote cancelado', 3000, 'Cancelled', 'Empresa RedFlag C')
    `).run();
    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'redflag-award-1', 'generated-20260932-1', 'GEN/2026/1', '1', 0, 'Empresa RedFlag A', 6000, 'Adjudicado',
    );
    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'redflag-award-cancelled', 'generated-20260932-1', 'GEN/2026/1', '4', 0, 'Empresa RedFlag C', 3000, 'Adjudicado',
    );

    setDbForTests(db);
    const partial = getRedFlagsStats(2026, 'Directa Municipal');
    const partialExpediente = partial.topExpedientesConAlertas.find((item) => item.id === 'generated-20260932-1');

    expect(partialExpediente).toBeDefined();
    expect(partialExpediente?.amount).toBe(12000);

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'redflag-award-2', 'generated-20260932-1', 'GEN/2026/1', '3', 0, 'Empresa RedFlag B', 4000, 'Adjudicado',
    );

    const mismatched = getRedFlagsStats(2026, 'Directa Municipal');
    const mismatchedExpediente = mismatched.topExpedientesConAlertas.find((item) => item.id === 'generated-20260932-1');
    expect(mismatchedExpediente?.amount).toBe(12000);

    db.prepare('DELETE FROM lot_awards WHERE id = ?').run('redflag-award-2');
    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'redflag-award-2', 'generated-20260932-1', 'GEN/2026/1', '2', 0, 'Empresa RedFlag B', 4000, 'Adjudicado',
    );

    const complete = getRedFlagsStats(2026, 'Directa Municipal');
    const completeExpediente = complete.topExpedientesConAlertas.find((item) => item.id === 'generated-20260932-1');
    expect(completeExpediente?.amount).toBe(10000);
  });

  it('pasa los lotes a evaluarRedFlags para detectar adjudicatarios que solo aparecen en lotes', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        case_number TEXT,
        object_description TEXT,
        contracting_authority_name TEXT,
        awarded_amount REAL,
        awardee TEXT,
        awardee_nif TEXT,
        offer_count INTEGER,
        amount_excl_vat REAL,
        dataset TEXT,
        contract_type TEXT,
        procedure TEXT,
        eu_funding TEXT,
        award_amount_type TEXT,
        year INTEGER,
        scope TEXT,
        estimated_value REAL
      );

      CREATE TABLE contract_lots (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        lot_number TEXT,
        lot_name TEXT,
        budget_excl_vat REAL,
        awarded_amount REAL,
        lot_status TEXT,
        awardee TEXT,
        awardee_nif TEXT,
        offer_count INTEGER
      );

      INSERT INTO contracts (
        id, case_number, object_description, contracting_authority_name,
        awarded_amount, awardee, awardee_nif, offer_count, amount_excl_vat,
        dataset, contract_type, procedure, eu_funding, award_amount_type, year, scope, estimated_value
      ) VALUES
        ('parent-nsp-lots', 'NSP/2026/01', 'Servicio en dos lotes', 'Ayuntamiento de Prueba',
         900, 'Varios adjudicatarios', NULL, 1, 1000,
         'licitaciones', 'Servicios', 'Negociado sin publicidad', NULL, 'total', 2026, 'Directa Municipal', 1000),
        ('other-contract', 'AB/2025/99', 'Otro servicio', 'Ayuntamiento de Prueba',
         800, 'LoteCo', 'B12345678', 2, 900,
         'licitaciones', 'Servicios', 'Abierto', NULL, 'total', 2025, 'Directa Municipal', 900);

      INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_name, budget_excl_vat, awarded_amount,
        lot_status, awardee, awardee_nif, offer_count
      ) VALUES
        ('lot-1', 'parent-nsp-lots', '1', 'Lote uno', 500, 450,
         'Adjudicado', 'LoteCo', 'B12345678', 2),
        ('lot-2', 'parent-nsp-lots', '2', 'Lote dos', 500, 450,
         'Adjudicado', 'OtraCo', 'B87654321', 2);
    `);

    setDbForTests(db);

    const directFlags = evaluarRedFlags(
      {
        id: 'parent-nsp-lots',
        procedure: 'Negociado sin publicidad',
        contract_type: 'Servicios',
        economic_nature: 'gasto',
        amount_excl_vat: 1000,
        awarded_amount: 900,
        award_amount_type: 'total',
        awardee: 'Varios adjudicatarios',
        offer_count: 1,
        contracting_authority_name: 'Ayuntamiento de Prueba',
      },
      [
        {
          lot_number: '1',
          amount_excl_vat: 500,
          awarded_amount: 450,
          lot_status: 'Adjudicado',
          awardee: 'LoteCo',
          awardee_nif: 'B12345678',
          offer_count: 2,
        },
        {
          lot_number: '2',
          amount_excl_vat: 500,
          awarded_amount: 450,
          lot_status: 'Adjudicado',
          awardee: 'OtraCo',
          awardee_nif: 'B87654321',
          offer_count: 2,
        },
      ],
      [{ document_type: 'PLIEGO', title: 'PCAP' }],
    );
    const directNsp = directFlags.find((flag) => flag.tipo === 'negociado_sin_publicidad');
    expect(directNsp).toBeDefined();

    const stats = getRedFlagsStats(2026, 'Directa Municipal');
    const expediente = stats.topExpedientesConAlertas.find((item) => item.id === 'parent-nsp-lots');

    expect(expediente).toBeDefined();
    expect(expediente?.alerts).toBeDefined();

    const source = fs.readFileSync('src/lib/db.ts', 'utf8');
    expect(source).toContain('evaluarRedFlags(lic, lotes.length > 1 ? lotes : undefined)');
  });


  it('usa el importe adjudicado de los lotes para el top y detecta 0% de baja por lote', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY, case_number TEXT, object_description TEXT,
        contracting_authority_name TEXT, awarded_amount REAL, awardee TEXT,
        awardee_nif TEXT, offer_count INTEGER, amount_excl_vat REAL,
        dataset TEXT, contract_type TEXT, procedure TEXT, eu_funding TEXT,
        award_amount_type TEXT, year INTEGER, scope TEXT, estimated_value REAL,
        is_lotized INTEGER, status TEXT, economic_nature TEXT
      );
      CREATE TABLE contract_lots (
        id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, lot_number TEXT,
        lot_name TEXT, budget_excl_vat REAL, awarded_amount REAL,
        lot_status TEXT, awardee TEXT, awardee_nif TEXT, offer_count INTEGER
      );
      INSERT INTO contracts (
        id, case_number, object_description, contracting_authority_name,
        awarded_amount, awardee, offer_count, amount_excl_vat, dataset,
        contract_type, procedure, award_amount_type, year, scope, estimated_value, is_lotized, status, economic_nature
      ) VALUES (
        'lot-zero-baja', 'EXP/2026/02', 'Servicio en dos lotes', 'Ayuntamiento de Prueba',
        NULL, 'Empresa A', 2, 2000, 'licitaciones',
        'Servicios', 'Abierto', 'total', 2026, 'Directa Municipal', 2000, 1, 'Adjudicada', 'gasto'
      );
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount,
        lot_status, awardee, offer_count
      ) VALUES
        ('lot-zb-1', 'lot-zero-baja', '1', 1000, 1000, 'Adjudicado', 'Empresa A', 2),
        ('lot-zb-2', 'lot-zero-baja', '2', 1000, 1000, 'Adjudicado', 'Empresa B', 2);
    `);

    setDbForTests(db);
    try {
      const stats = getRedFlagsStats(2026, 'Directa Municipal');
      const expediente = stats.topExpedientesConAlertas.find((item) => item.id === 'lot-zero-baja');

      expect(expediente).toBeDefined();
      expect(expediente?.amount).toBe(2000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });


  it('usa adjudicaciones de lotes en los volúmenes agregados de red flags', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY, case_number TEXT, object_description TEXT,
        contracting_authority_name TEXT, awarded_amount REAL, awardee TEXT,
        awardee_nif TEXT, offer_count INTEGER, amount_excl_vat REAL,
        dataset TEXT, contract_type TEXT, procedure TEXT, eu_funding TEXT,
        award_amount_type TEXT, year INTEGER, scope TEXT, estimated_value REAL,
        is_lotized INTEGER, status TEXT, economic_nature TEXT
      );
      CREATE TABLE contract_lots (
        id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, lot_number TEXT,
        lot_name TEXT, budget_excl_vat REAL, awarded_amount REAL,
        lot_status TEXT, awardee TEXT, awardee_nif TEXT, offer_count INTEGER
      );
      INSERT INTO contracts (
        id, case_number, object_description, contracting_authority_name,
        awarded_amount, awardee, offer_count, amount_excl_vat, dataset,
        contract_type, procedure, eu_funding, award_amount_type, year, scope, estimated_value, is_lotized, status, economic_nature
      ) VALUES
        ('unique-lots', 'EXP/2026/10', 'Servicio con una oferta', 'Ayuntamiento',
         NULL, 'Empresa A', 1, 9000, 'licitaciones',
         'Servicios', 'Abierto', NULL, 'total', 2026, 'Directa Municipal', 9000, 1, 'Adjudicada', 'gasto'),
        ('minor-lots', 'EXP/2026/11', 'Contrato menor cercano al umbral', 'Ayuntamiento',
         NULL, 'Empresa C', 2, 14000, 'menores',
         'Servicios', 'Contrato menor', NULL, 'total', 2026, 'Directa Municipal', 14000, 1, 'Adjudicada', 'gasto'),
        ('eu-lots', 'EXP/2026/12', 'Servicio PRTR', 'Ayuntamiento',
         NULL, 'Empresa E', 2, 8000, 'licitaciones',
         'Servicios', 'Abierto', '1', 'total', 2026, 'Directa Municipal', 8000, 1, 'Adjudicada', 'gasto'),
        ('zero-lots', 'EXP/2026/13', 'Obra al presupuesto', 'Ayuntamiento',
         NULL, 'Empresa G', 2, 2000, 'licitaciones',
         'Obras', 'Abierto', NULL, 'total', 2026, 'Directa Municipal', 2000, 1, 'Adjudicada', 'gasto');
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount,
        lot_status, awardee, offer_count
      ) VALUES
        ('unique-1', 'unique-lots', '1', 3000, 3000, 'Adjudicado', 'Empresa A', 1),
        ('unique-2', 'unique-lots', '2', 2000, 2000, 'Adjudicado', 'Empresa B', 1),
        ('minor-1', 'minor-lots', '1', 7000, 6500, 'Adjudicado', 'Empresa C', 1),
        ('minor-2', 'minor-lots', '2', 5000, 4500, 'Adjudicado', 'Empresa D', 1),
        ('eu-1', 'eu-lots', '1', 5000, 3000, 'Adjudicado', 'Empresa E', 2),
        ('eu-2', 'eu-lots', '2', 3000, 2000, 'Adjudicado', 'Empresa F', 2),
        ('zero-1', 'zero-lots', '1', 1000, 1000, 'Adjudicado', 'Empresa G', 2),
        ('zero-2', 'zero-lots', '2', 1000, 1000, 'Adjudicado', 'Empresa H', 2);
    `);
    setDbForTests(db);
    try {
      const stats = getRedFlagsStats(2026, 'Directa Municipal');
      expect(stats.volumenOfertaUnica).toBe(5000);
      expect(stats.volumenAlertaMenor).toBe(11000);
      expect(stats.volumenFondosUe).toBe(5000);
      expect(stats.volumenBajaCero).toBe(7000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('no cuenta como oferta única el expediente multilot cuando las ofertas reales de sus lotes no son únicas', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY, case_number TEXT, object_description TEXT,
        contracting_authority_name TEXT, awarded_amount REAL, awardee TEXT,
        awardee_nif TEXT, offer_count INTEGER, amount_excl_vat REAL,
        dataset TEXT, contract_type TEXT, procedure TEXT, eu_funding TEXT,
        award_amount_type TEXT, year INTEGER, scope TEXT, estimated_value REAL,
        is_lotized INTEGER, status TEXT, economic_nature TEXT
      );
      CREATE TABLE contract_lots (
        id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, lot_number TEXT,
        lot_name TEXT, budget_excl_vat REAL, awarded_amount REAL,
        lot_status TEXT, awardee TEXT, awardee_nif TEXT, offer_count INTEGER
      );
      INSERT INTO contracts (
        id, case_number, object_description, contracting_authority_name,
        awarded_amount, awardee, offer_count, amount_excl_vat, dataset,
        contract_type, procedure, eu_funding, award_amount_type, year, scope,
        estimated_value, is_lotized, status, economic_nature
      ) VALUES (
        'unique-parent-not-lot', 'EXP/2026/20', 'Servicio en dos lotes',
        'Ayuntamiento', NULL, 'Varios adjudicatarios', 1, 2000,
        'licitaciones', 'Servicios', 'Abierto', NULL, 'total', 2026,
        'Directa Municipal', 2000, 1, 'Adjudicada', 'gasto'
      );
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount,
        lot_status, awardee, offer_count
      ) VALUES
        ('unique-parent-not-lot-1', 'unique-parent-not-lot', '1', 1000, 900, 'Adjudicado', 'Empresa A', 2),
        ('unique-parent-not-lot-2', 'unique-parent-not-lot', '2', 1000, 900, 'Adjudicado', 'Empresa B', 2);
    `);
    setDbForTests(db);
    try {
      const stats = getRedFlagsStats(2026, 'Directa Municipal');
      expect(stats.totalOfertaUnica).toBe(0);
      expect(stats.volumenOfertaUnica).toBe(0);
      expect(stats.topExpedientesConAlertas).toHaveLength(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});


describe('getRedFlagsStats: snapshots parciales de lot_awards', () => {
  it('no rebaja artificialmente un lote con snapshot parcial de lot_awards', () => {
    const db = createGeneratedTestDb(20261020, 1);
    const contractId = 'generated-20261020-1';

    db.prepare(`UPDATE contracts SET
      status = 'Adjudicada',
      awardee = 'Varios adjudicatarios',
      offer_count = 2,
      year = 2026,
      scope = 'Directa Municipal',
      procedure = 'Abierto',
      economic_nature = 'gasto',
      award_amount_type = 'total',
      awarded_amount = NULL,
      amount_excl_vat = 12000,
      is_lotized = 1
      WHERE id = ?`).run(contractId);

    db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(contractId);
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_name, budget_excl_vat, awarded_amount,
        lot_status, awardee, offer_count
      ) VALUES
        ('partial-redflag-lot-1', ?, '1', 'Lote 1', 6000, 6000, 'Adjudicado', 'Empresa A', 2),
        ('partial-redflag-lot-2', ?, '2', 'Lote 2', 6000, 6000, 'Adjudicado', 'Empresa B', 2)
    `).run(contractId, contractId);

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, '1', 0, 'Empresa A', 3000, 'Adjudicado')
    `).run('partial-redflag-award-1', contractId, 'GEN/2026/1');

    setDbForTests(db);
    try {
      const stats = getRedFlagsStats(2026, 'Directa Municipal');
      const expediente = stats.topExpedientesConAlertas.find((item) => item.id === contractId);

      expect(expediente).toBeDefined();
      expect(expediente?.alerts.some((alert) => alert.includes('Baja Elevada') || alert.includes('Baja Extrema'))).toBe(false);
      expect(expediente?.amount).toBe(12000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});
