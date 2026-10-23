import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
import { createGeneratedTestDb } from './test-db';
import { setDbForTests } from './db';
import {
  escapeCsvCell,
  toCsv,
  getLicitacionesExportData,
  getEmpresasExportData,
  getAlertasExportData,
  LICITACIONES_CSV_COLUMNS,
  EMPRESAS_CSV_COLUMNS,
  ALERTAS_CSV_COLUMNS,
} from './export';

describe('Export CSV Utils', () => {
  it('escapa celdas con comas, comillas y saltos de línea según RFC 4180', () => {
    expect(escapeCsvCell('Texto simple')).toBe('Texto simple');
    expect(escapeCsvCell(1234)).toBe('1234');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');

    // Comas
    expect(escapeCsvCell('Alcázar, Ciudad Real')).toBe('"Alcázar, Ciudad Real"');

    // Comillas
    expect(escapeCsvCell('Empresa "Soluciones" SL')).toBe('"Empresa ""Soluciones"" SL"');

    // Salto de línea
    expect(escapeCsvCell('Línea 1\nLínea 2')).toBe('"Línea 1\nLínea 2"');
  });

  it('neutraliza fórmulas de hoja de cálculo sin alterar números', () => {
    expect(escapeCsvCell('=HYPERLINK("https://example.com","abrir")')).toBe(
      `"'=HYPERLINK(""https://example.com"",""abrir"")"`,
    );
    expect(escapeCsvCell(' +SUM(A1:A2)')).toBe("' +SUM(A1:A2)");
    expect(escapeCsvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    expect(escapeCsvCell('\t=1+1')).toBe("'\t=1+1");
    expect(escapeCsvCell(-123.45)).toBe('-123.45');
    expect(escapeCsvCell('-123.45')).toBe('-123.45');
  });

  it('genera un CSV completo con BOM UTF-8 y cabeceras correctas', () => {
    const data = [
      { id: '1', nombre: 'Limpieza Viaria', total: 1000 },
      { id: '2', nombre: 'Obras, pavimentación', total: 5000 },
    ];
    const columns = [
      { key: 'id', label: 'ID' },
      { key: 'nombre', label: 'Descripción' },
      { key: 'total', label: 'Importe (€)' },
    ];

    const csv = toCsv(data, columns);

    // Debe comenzar con BOM UTF-8
    expect(csv.startsWith('\uFEFF')).toBe(true);

    // Cabecera
    expect(csv).toContain('ID,Descripción,Importe (€)');

    // Contenido escapado
    expect(csv).toContain('"Obras, pavimentación"');
  });
});

describe('Export Datasets Queries', () => {
  afterEach(() => {
    setDbForTests(null);
  });
  it('obtiene licitaciones exportables de la base de datos', () => {
    const rows = getLicitacionesExportData();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(1000);

    const first = rows[0];
    expect(first).toHaveProperty('expediente');
    expect(first).toHaveProperty('objeto');
    expect(first).toHaveProperty('estado');

    // Generación de CSV real
    const csv = toCsv(rows.slice(0, 5), LICITACIONES_CSV_COLUMNS);
    expect(csv).toContain('Expediente,Objeto del Contrato');
  });


  it('no exporta adjudicatarios ni importes de resultados previos a la adjudicación', () => {
    const db = createGeneratedTestDb(20261031, 1);
    const contractId = 'generated-20261031-1';

    db.prepare(`
      UPDATE contracts
      SET year = 2024, award_amount_type = 'total',
          awarded_amount = NULL, awarded_amount_incl_vat = NULL,
          awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          is_lotized = 1, lot_count = 1
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        lot_status, awarded_amount, awarded_amount_incl_vat
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('export-pre-award-lot', contractId, 'GEN/2024/31', '1',
      'Lote único', 'Adjudicado', 1000, 1210);

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('export-pre-award-result', contractId, 'GEN/2024/31', '1', 0,
      'Licitador mejor valorado', 'B12345678', 900, 1089, 'BEST_RATED_TENDERER');

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row).toBeDefined();
      expect(row?.importe_adjudicacion_sin_iva).toBe(1000);
      expect(row?.importe_adjudicacion_con_iva).toBe(1210);
      expect(row?.awardee).toBeNull();
      expect(row?.awardee_nif).toBe('');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('no exporta adjudicaciones estructuradas de lotes legacy cancelados', () => {
    const db = createGeneratedTestDb(20261030, 1);
    const contractId = 'generated-20261030-1';
    db.prepare(`
      UPDATE contracts
      SET award_amount_type = 'total', awarded_amount = NULL,
          awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          is_lotized = 1, year = 2024
      WHERE id = ?
    `).run(contractId);

    const insertLot = db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, lot_status, awardee, awardee_nif
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertLot.run('export-active-30', contractId, 'GEN/2024/30', '1',
      'Lote activo', 100, 'Adjudicado', 'Empresa Activa', 'B00000018');
    insertLot.run('export-cancelled-30', contractId, 'GEN/2024/30', '2',
      'Lote cancelado', 200, 'Cancelado', 'Empresa Cancelada', 'B00000019');

    const insertAward = db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAward.run('export-award-active-30', contractId, 'GEN/2024/30', '1', 0,
      'Empresa Activa', 'B00000018', 100, 'Adjudicado');
    insertAward.run('export-award-cancelled-30', contractId, 'GEN/2024/30', '2', 0,
      'Empresa Cancelada', 'B00000019', 200, 'Adjudicado');

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row?.importe_adjudicacion_sin_iva).toBe(100);
      expect(row?.awardee).toBe('Empresa Activa');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('no recupera el adjudicatario legacy cuando el resultado estructurado del lote es Cancelled', () => {
    const db = createGeneratedTestDb(20261028, 1);
    const contractId = 'generated-20261028-1';

    db.prepare(`
      UPDATE contracts
      SET year = 2024, award_amount_type = 'total',
          awarded_amount = 6000, awarded_amount_incl_vat = 7260,
          awardee = 'Empresa Residual', awardee_nif = 'B00000031',
          is_lotized = 1, lot_count = 1
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awarded_amount_incl_vat, lot_status, awardee, awardee_nif
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('export-legacy-stale-cancelled', contractId, 'GEN/2024/28', '1',
      'Lote cancelado en resultado estructurado', 6000, 7260, 'Adjudicado',
      'Empresa Residual', 'B00000031');

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('export-structured-cancelled', contractId, 'GEN/2024/28', '1', 0,
      null, null, 6000, 'CANCELLED');

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row).toBeDefined();
      expect(row?.awardee).toBeNull();
      expect(row?.awardee_nif).toBe('');
      expect(row?.importe_adjudicacion_sin_iva).toBeNull();
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('excluye lotes Annulled del importe con IVA y sin IVA y del adjudicatario exportado', () => {
    const db = createGeneratedTestDb(20261029, 1);
    const contractId = 'generated-20261029-1';

    db.prepare(`
      UPDATE contracts
      SET year = 2024, award_amount_type = 'total',
          awarded_amount = NULL, awarded_amount_incl_vat = NULL,
          awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          is_lotized = 1, lot_count = 2
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awarded_amount_incl_vat, lot_status, awardee, awardee_nif
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('export-annulled-active', contractId, 'GEN/2024/29', '1',
      'Lote vigente', 1000, 1210, 'Adjudicado', 'Empresa Vigente', 'B00000029');
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awarded_amount_incl_vat, lot_status, awardee, awardee_nif
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('export-annulled-cancelled', contractId, 'GEN/2024/29', '2',
      'Lote anulado', 200, 242, 'Annulled', 'Empresa Anulada', 'B00000030');

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row).toBeDefined();
      expect(row?.importe_adjudicacion_sin_iva).toBe(1000);
      expect(row?.importe_adjudicacion_con_iva).toBe(1210);
      expect(row?.awardee).toBe('Empresa Vigente');
      expect(row?.awardee_nif).toBe('B00000029');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('exporta el importe de licitación sin IVA declarado por el contrato', () => {
    const db = createGeneratedTestDb(20261005, 1);
    const contractId = 'generated-20261005-1';

    db.prepare(`UPDATE contracts
      SET amount_excl_vat = 12345.67,
          amount_incl_vat = 14938.26,
          year = 2024
      WHERE id = ?`).run(contractId);

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row?.importe_licitacion_sin_iva).toBe(12345.67);
      expect(row?.importe_licitacion_con_iva).toBe(14938.26);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('exporta el CIF del adjudicatario desde la cabecera del contrato', () => {
    const db = createGeneratedTestDb(20261005, 1);
    const contractId = 'generated-20261005-1';

    db.prepare(`UPDATE contracts
      SET awardee = 'Empresa Export',
          awardee_nif = 'B12345678',
          year = 2024
      WHERE id = ?`).run(contractId);

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row?.awardee).toBe('Empresa Export');
      expect(row?.awardee_nif).toBe('B12345678');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('no exporta el adjudicatario de cabecera cuando existen lotes sin adjudicatario utilizable', () => {
    const db = createGeneratedTestDb(20261009, 1);
    const contractId = 'generated-20261009-1';

    db.prepare(`UPDATE contracts
      SET awardee = 'Varios adjudicatarios',
          awardee_nif = 'B12345678',
          award_amount_type = 'total',
          is_lotized = 1
      WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, lot_status,
      awardee, awardee_nif
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'export-parent-fallback-lot', contractId, 'GEN/2024/1', '1', 'Lote único',
      'Adjudicado', null, null
    );

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row?.awardee).toBeNull();
      expect(row?.awardee_nif).toBe('');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('exporta el NIF del adjudicatario cuando procede de lot_awards', () => {
    const db = createGeneratedTestDb(20261005, 1);
    const contractId = 'generated-20261005-1';

    db.prepare(`UPDATE contracts
      SET awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          award_amount_type = 'total',
          is_lotized = 1
      WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, lot_status
    ) VALUES (?, ?, ?, ?, ?, ?)`).run(
      'export-nif-lot', contractId, 'GEN/2024/1', '1', 'Lote único', 'Adjudicado'
    );

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awardee_nif, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'export-nif-award', contractId, 'GEN/2024/1', '1', 0,
      'Empresa Award', 'B12345678', 1000, 'Adjudicado'
    );

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row?.awardee).toBe('Empresa Award');
      expect(row?.awardee_nif).toBe('B12345678');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('no exporta un NIF parcial cuando lot_awards no cubre todos los adjudicatarios', () => {
    const db = createGeneratedTestDb(20261005, 1);
    const contractId = 'generated-20261005-1';

    db.prepare(`UPDATE contracts
      SET awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          award_amount_type = 'total',
          is_lotized = 1,
          lot_count = 1
      WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, lot_status,
      awardee, awardee_nif
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'export-nif-coverage-lot', contractId, 'GEN/2024/1', '1', 'Lote único',
      'Adjudicado', 'Empresa Completa', null
    );

    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awardee_nif, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    insertAward.run(
      'export-nif-coverage-a', contractId, 'GEN/2024/1', '1', 0,
      'Empresa Completa', 'B12345678', 400, 'Adjudicado'
    );
    insertAward.run(
      'export-nif-coverage-b', contractId, 'GEN/2024/1', '1', 1,
      'Empresa Sin NIF', null, 600, 'Adjudicado'
    );

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row?.awardee).toBe('Empresa Completa,Empresa Sin NIF');
      expect(row?.awardee_nif).toBe('');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('no presenta el PBL como importe de adjudicación cuando falta el importe adjudicado', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/export.ts'),
      'utf8',
    );

    expect(source).toContain('THEN CASE');
    expect(source).toContain('SELECT round(sum(lot.awarded_amount), 2)');
    expect(source).toContain('SELECT round(sum(lot.awarded_amount_incl_vat), 2)');
    expect(source).toContain("allowParentAwardAmountFallbackSql('contracts', hasLotAwardsTable)");
    expect(source).toContain("allowParentAwardAmountFallbackSql('contracts', hasLotAwardsTable)");
    expect(source).not.toContain('coalesce(awarded_amount, amount_excl_vat, 0) ELSE NULL END as importe_adjudicacion_sin_iva');
    expect(source).not.toContain('coalesce(awarded_amount_incl_vat, amount_incl_vat, 0) ELSE NULL END as importe_adjudicacion_con_iva');
  });

  it('incluye lot_awards en el export de adjudicatarios y mantiene fallback', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/export.ts'),
      'utf8',
    );

    expect(source).toContain("name = 'lot_awards'");
    expect(source).toContain('FROM lot_awards la');
    expect(source).toContain('const lotAwardsAwardeeCovered = hasLotAwardsTable');
    expect(source).toContain('la.lot_number = lot.lot_number');
    expect(source).not.toContain('count(DISTINCT la.lot_number)');
    expect(source).not.toContain('count(DISTINCT lot.lot_number)');
    expect(source).toContain('ELSE awardee');
  });

  it('exporta la suma de adjudicaciones de lotes en licitaciones multiganador', () => {
    const db = createGeneratedTestDb(20260930, 1);
    db.prepare(`UPDATE contracts
      SET year = 2024, awarded_amount = NULL, awarded_amount_incl_vat = NULL,
          award_amount_type = 'total', awardee = 'Varios adjudicatarios',
          is_lotized = 1, lot_count = 2
      WHERE id = 'generated-20260930-1'`).run();
    const insertLot = db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, amount_excl_vat,
      amount_incl_vat, estimated_value, awardee, awardee_nif, lot_status,
      award_date, budget_excl_vat, budget_incl_vat, awarded_amount,
      awarded_amount_incl_vat, offer_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertLot.run('export-licit-lot-a', 'generated-20260930-1', 'GEN/2024/1', '1', 'A', 2000, 2420, 2000, 'Empresa A', 'B13408349', 'Adjudicado', '2024-04-01', 2000, 2420, 1500, 1815, 2);
    insertLot.run('export-licit-lot-b', 'generated-20260930-1', 'GEN/2024/1', '2', 'B', 3000, 3630, 3000, 'Empresa B', 'B45123456', 'Adjudicado', '2024-04-01', 3000, 3630, 2500, 3025, 1);
    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === 'generated-20260930-1');
      expect(row?.importe_adjudicacion_sin_iva).toBe(4000);
      expect(row?.importe_adjudicacion_con_iva).toBe(4840);
      expect(row?.awardee).toBe('Empresa A,Empresa B');
      expect(row?.awardee_nif).toBe('B13408349,B45123456');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('prioriza lot_awards sobre contract_lots en el export de licitaciones multiganador', () => {
    const db = createGeneratedTestDb(20261003, 1);
    const contractId = 'generated-20261003-1';

    db.prepare(`UPDATE contracts
      SET year = 2024, awarded_amount = 9999, awarded_amount_incl_vat = 12098.79,
          award_amount_type = 'total', awardee = 'Varios adjudicatarios',
          awardee_nif = NULL, is_lotized = 1, lot_count = 1
      WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, lot_status,
      awarded_amount, awarded_amount_incl_vat, awardee, awardee_nif
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'export-multiaward-lot', contractId, 'GEN/2024/1', '1', 'Lote único',
      'Adjudicado', 9000, 10890, 'Empresa Lote', 'B10000001'
    );

    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    insertAward.run(
      'export-multiaward-award-a', contractId, 'GEN/2024/1', '1', 0,
      'Empresa A', 'B10000002', 400, 484, 'Adjudicado'
    );
    insertAward.run(
      'export-multiaward-award-b', contractId, 'GEN/2024/1', '1', 1,
      'Empresa B', 'B10000003', 600, 726, 'Adjudicado'
    );

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row?.importe_adjudicacion_sin_iva).toBe(1000);
      expect(row?.importe_adjudicacion_con_iva).toBe(1210);
      expect(row?.awardee).toBe('Empresa A,Empresa B');
      expect(row?.awardee_nif).toBe('B10000002,B10000003');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('mantiene el importe completo del lote cuando un adjudicatario de lot_awards no aporta importe', () => {
    const db = createGeneratedTestDb(20261003, 1);
    const contractId = 'generated-20261003-1';

    db.prepare(`UPDATE contracts
      SET year = 2024, awarded_amount = 9999, awarded_amount_incl_vat = 12098.79,
          award_amount_type = 'total', awardee = 'Varios adjudicatarios',
          awardee_nif = NULL, is_lotized = 1, lot_count = 1
      WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, lot_status,
      awarded_amount, awarded_amount_incl_vat, awardee, awardee_nif
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'export-partial-award-amount-lot', contractId, 'GEN/2024/1', '1', 'Lote único',
      'Adjudicado', 12000, 14520, 'Empresa Lote', 'B10000001'
    );

    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    insertAward.run(
      'export-partial-award-amount-a', contractId, 'GEN/2024/1', '1', 0,
      'Empresa A', 'B10000002', 7000, 8470, 'Adjudicado'
    );
    insertAward.run(
      'export-partial-award-amount-b', contractId, 'GEN/2024/1', '1', 1,
      'Empresa B', 'B10000003', null, null, 'Adjudicado'
    );

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row?.importe_adjudicacion_sin_iva).toBe(12000);
      expect(row?.importe_adjudicacion_con_iva).toBe(14520);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('mantiene contract_lots cuando lot_awards solo cubre parte de los lotes', () => {
    const db = createGeneratedTestDb(20261003, 1);
    const contractId = 'generated-20261003-1';

    db.prepare(`UPDATE contracts
      SET year = 2024, awarded_amount = 9999, awarded_amount_incl_vat = 12098.79,
          award_amount_type = 'total', awardee = 'Varios adjudicatarios',
          awardee_nif = NULL, is_lotized = 1, lot_count = 2
      WHERE id = ?`).run(contractId);

    const insertLot = db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, lot_status,
      awarded_amount, awarded_amount_incl_vat, awardee, awardee_nif
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertLot.run(
      'export-partial-lot-a', contractId, 'GEN/2024/1', '1', 'Lote 1',
      'Adjudicado', 4000, 4840, 'Empresa Lote A', 'B10000001'
    );
    insertLot.run(
      'export-partial-lot-b', contractId, 'GEN/2024/1', '2', 'Lote 2',
      'Adjudicado', 5000, 6050, 'Empresa Lote B', 'B10000002'
    );

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'export-partial-award', contractId, 'GEN/2024/1', '1', 0,
      'Empresa Award', 'B10000003', 1000, 1210, 'Adjudicado'
    );

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row?.importe_adjudicacion_sin_iva).toBe(9000);
      expect(row?.importe_adjudicacion_con_iva).toBe(10890);
      expect(row?.awardee).toBe('Empresa Lote A,Empresa Lote B');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('rechaza awards con la misma cardinalidad pero lotes distintos', () => {
    const db = createGeneratedTestDb(20261003, 1);
    const contractId = 'generated-20261003-1';

    db.prepare(`UPDATE contracts
      SET awarded_amount = 9999, awarded_amount_incl_vat = 12098.79,
          award_amount_type = 'total', awardee = 'Varios adjudicatarios',
          awardee_nif = NULL, is_lotized = 1, lot_count = 2
      WHERE id = ?`).run(contractId);

    const insertLot = db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, lot_status,
      awarded_amount, awarded_amount_incl_vat, awardee, awardee_nif
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertLot.run('export-set-lot-1', contractId, 'GEN/2024/2', '1', 'Lote 1', 'Adjudicado', 4000, 4840, 'Empresa Lote 1', 'B10000001');
    insertLot.run('export-set-lot-2', contractId, 'GEN/2024/2', '2', 'Lote 2', 'Adjudicado', 5000, 6050, 'Empresa Lote 2', 'B10000002');

    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertAward.run('export-set-award-1', contractId, 'GEN/2024/2', '1', 0, 'Empresa Award 1', 'B10000003', 1000, 1210, 'Adjudicado');
    insertAward.run('export-set-award-3', contractId, 'GEN/2024/2', '3', 0, 'Empresa Award 3', 'B10000004', 2000, 2420, 'Adjudicado');

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row?.importe_adjudicacion_sin_iva).toBe(9000);
      expect(row?.importe_adjudicacion_con_iva).toBe(10890);
      expect(row?.awardee).toBe('Empresa Lote 1,Empresa Lote 2');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('no presenta el PBL como importe de una alerta de auditoría', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/export.ts'),
      'utf8',
    );

    expect(source).toContain('WHEN l.lot_number IS NOT NULL');
    expect(source).toContain("${lotAwardsAmountCoverageSql('l')}");
    expect(source).toContain("WHEN l.lot_number IS NULL");
    expect(source).not.toContain(
      "sum(CASE WHEN l.award_amount_type IS NULL OR l.award_amount_type = 'total' THEN coalesce(l.awarded_amount, l.amount_excl_vat, 0) ELSE 0 END) as importe_total_raw",
    );
  });

  it('no presenta el PBL como volumen total adjudicado de una empresa', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/export.ts'),
      'utf8',
    );

    expect(source).toContain(
      "sum(CASE WHEN award_amount_type IS NULL OR award_amount_type IN ('total', 'desconocido') THEN coalesce(awarded_amount, 0) ELSE 0 END) as volumen_total_sin_iva,",
    );
  });

  it('incluye el volumen de empresas cuando el tipo agregado es desconocido', () => {
    const db = createGeneratedTestDb(20260930, 1);
    db.prepare(`UPDATE contracts
      SET year = 2024, awardee = 'Empresa Tipo Desconocido', awardee_nif = 'B99123456',
          awarded_amount = 2750, award_amount_type = 'desconocido'
      WHERE id = 'generated-20260930-1'`).run();
    setDbForTests(db);

    const row = getEmpresasExportData().find((item) => item.nombre === 'Empresa Tipo Desconocido');
    expect(row?.volumen_total_sin_iva).toBe(2750);
  });

  it('obtiene empresas contratistas exportables', () => {
    const rows = getEmpresasExportData();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(100);

    const first = rows[0];
    expect(first).toHaveProperty('cif');
    expect(first).toHaveProperty('nombre');
    expect(first).toHaveProperty('total_contratos');

    const csv = toCsv(rows.slice(0, 5), EMPRESAS_CSV_COLUMNS);
    expect(csv).toContain('CIF / NIF,Razón Social');
  });


  it('exporta adjudicatarios reales de los lotes multiganador, no Varios adjudicatarios', () => {
    const db = createGeneratedTestDb(20260930, 2);
    db.prepare(`UPDATE contracts SET year = 2024, awarded_amount = 9999, award_amount_type = 'total', awardee = 'Varios adjudicatarios', awardee_nif = NULL, is_lotized = 1, lot_count = 2 WHERE id = 'generated-20260930-1'`).run();
    db.prepare(`UPDATE contracts SET year = 2024, awarded_amount = 4000, award_amount_type = 'total', awardee = 'Empresa Nacional', awardee_nif = 'B28123456' WHERE id = 'generated-20260930-2'`).run();
    const insertLot = db.prepare(`INSERT INTO contract_lots (id, contract_id, case_number, lot_number, lot_name, amount_excl_vat, amount_incl_vat, estimated_value, awardee, awardee_nif, lot_status, award_date, budget_excl_vat, budget_incl_vat, awarded_amount, awarded_amount_incl_vat, offer_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertLot.run('export-lot-a', 'generated-20260930-1', 'GEN/2024/1', '1', 'A', 2000, 2420, 2000, 'Empresa Lote A', 'B13408349', 'Adjudicado', '2024-04-01', 2000, 2420, 1500, 1815, 2);
    insertLot.run('export-lot-b', 'generated-20260930-1', 'GEN/2024/1', '2', 'B', 3000, 3630, 3000, 'Empresa Lote B', 'B45123456', 'Adjudicado', '2024-04-01', 3000, 3630, 2500, 3025, 1);
    setDbForTests(db);
    const rows = getEmpresasExportData();
    expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ nombre: 'Empresa Lote A', volumen_total_sin_iva: 1500 }), expect.objectContaining({ nombre: 'Empresa Lote B', volumen_total_sin_iva: 2500 })]));
    expect(rows).not.toEqual(expect.arrayContaining([expect.objectContaining({ nombre: 'Varios adjudicatarios' })]));
  });

  it('exporta adjudicatarios secundarios de lot_awards en empresas', () => {
    const db = createGeneratedTestDb(20260930, 1);
    db.prepare(`UPDATE contracts
      SET year = 2024, awarded_amount = 9999, award_amount_type = 'total',
          awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          is_lotized = 1, lot_count = 1
      WHERE id = 'generated-20260930-1'`).run();

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, lot_status,
      budget_excl_vat, budget_incl_vat
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'export-awards-lot', 'generated-20260930-1', 'GEN/2024/1', '1',
      'Lote único', 'Adjudicado', 9000, 10890
    );

    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
      offer_count, award_date, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    insertAward.run(
      'export-award-a', 'generated-20260930-1', 'GEN/2024/1', '1', 0,
      'Empresa B', 'B10000002', 3000, 3630, 2, '2024-04-01', 'Adjudicado'
    );
    insertAward.run(
      'export-award-b', 'generated-20260930-1', 'GEN/2024/1', '1', 1,
      'Empresa C', 'B10000003', 6000, 7260, 1, '2024-04-01', 'Adjudicado'
    );

    setDbForTests(db);
    try {
      const rows = getEmpresasExportData();
      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ nombre: 'Empresa B', volumen_total_sin_iva: 3000 }),
        expect.objectContaining({ nombre: 'Empresa C', volumen_total_sin_iva: 6000 }),
      ]));
      expect(rows).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ nombre: 'Varios adjudicatarios' })])
      );
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('exporta las alertas con adjudicatarios e importes de lotes multiganador', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/export.ts'), 'utf8');
    const start = source.indexOf('export function getAlertasExportData');
    const end = source.indexOf('export const ALERTAS_CSV_COLUMNS', start);
    const query = source.slice(start, end);

    expect(query).toContain('LEFT JOIN ${getCorporateContractSource(db)} l ON ac.contract_id = l.id');
    expect(query).toContain('group_concat(distinct ac.contract_id) as related_contracts');
    expect(query).not.toContain('LEFT JOIN contracts l ON ac.contract_id = l.id');
  });

  it('obtiene alertas de auditoría exportables', () => {
    const rows = getAlertasExportData();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);

    const first = rows[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('tipo');
    expect(first).toHaveProperty('severidad');
    expect(first).toHaveProperty('confianza_pct');
    expect(first).toHaveProperty('adjudicatario');
    expect(first).toHaveProperty('importe');

    const csv = toCsv(rows.slice(0, 5), ALERTAS_CSV_COLUMNS);
    expect(csv).toContain('ID Señal,Categoría de Resultado,Tipología,Severidad');
    expect(csv).toContain('Adjudicatario');
    expect(csv).toContain('Importe (€)');
    expect(csv).toContain('Fuente Oficial');
    expect(csv).toContain('Versión Metodología');
  });

it('cuenta un contrato una sola vez aunque tenga varias adjudicaciones para la misma empresa', () => {
    const db = createGeneratedTestDb(20261004, 1);
    const contractId = 'generated-20261004-1';

    db.prepare(`UPDATE contracts
      SET awarded_amount = NULL, awarded_amount_incl_vat = NULL,
          award_amount_type = 'total', awardee = 'Varios adjudicatarios',
          awardee_nif = NULL, is_lotized = 1
      WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      awarded_amount, awarded_amount_incl_vat, awardee, awardee_nif, lot_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'export-count-lot', contractId, 'GEN/2026/2', '1', 'Lote compartido',
      1000, 1210, 'Empresa Export', 'B10000020', 'Adjudicado'
    );

    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    insertAward.run(
      'export-count-award-a', contractId, 'GEN/2026/2', '1', 0,
      'Empresa Export', 'B10000020', 400, 484, 'Adjudicado'
    );
    insertAward.run(
      'export-count-award-b', contractId, 'GEN/2026/2', '1', 1,
      'Empresa Export', 'B10000020', 600, 726, 'Adjudicado'
    );

    setDbForTests(db);
    try {
      const row = getEmpresasExportData().find((item) => item.nombre === 'Empresa Export');
      expect(row?.total_contratos).toBe(1);
      expect(row?.volumen_total_sin_iva).toBe(1000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  
});


  it('no exporta un NIF parcial cuando los lotes no cubren todos los adjudicatarios', () => {
    const db = createGeneratedTestDb(20261005, 1);
    const contractId = 'generated-20261005-1';

    db.prepare(`UPDATE contracts
      SET awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          award_amount_type = 'total',
          is_lotized = 1,
          lot_count = 2
      WHERE id = ?`).run(contractId);

    const insertLot = db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, lot_status,
      awardee, awardee_nif
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

    insertLot.run(
      'export-lot-nif-coverage-a', contractId, 'GEN/2024/1', '1', 'Lote 1',
      'Adjudicado', 'Empresa Completa', 'B12345678'
    );
    insertLot.run(
      'export-lot-nif-coverage-b', contractId, 'GEN/2024/1', '2', 'Lote 2',
      'Adjudicado', 'Empresa Sin NIF', null
    );

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row?.awardee).toBe('Empresa Completa,Empresa Sin NIF');
      expect(row?.awardee_nif).toBe('');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });


  it('no usa un snapshot parcial de lot_awards cuando otro lote no tiene importe adjudicado', () => {
    const db = createGeneratedTestDb(20261022, 1);
    const contractId = 'generated-20261022-1';

    db.prepare(`UPDATE contracts
      SET year = 2024, awarded_amount = 2000, awarded_amount_incl_vat = 2420,
          award_amount_type = 'total', awardee = 'Varios adjudicatarios',
          is_lotized = 1, lot_count = 2
      WHERE id = ?`).run(contractId);

    const insertLot = db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, lot_status,
      awarded_amount, awarded_amount_incl_vat
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertLot.run('export-partial-amount-lot-a', contractId, 'GEN/2026/1', '1', 'Lote 1', 'Adjudicado', 1000, 1210);
    insertLot.run('export-partial-amount-lot-b', contractId, 'GEN/2026/1', '2', 'Lote 2', 'Adjudicado', null, null);

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awarded_amount, awarded_amount_incl_vat, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'export-partial-amount-award', contractId, 'GEN/2026/1', '1', 0,
      'Empresa A', 900, 1089, 'Adjudicado'
    );

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row?.importe_adjudicacion_sin_iva).toBe(1000);
      expect(row?.importe_adjudicacion_con_iva).toBe(1210);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

});
