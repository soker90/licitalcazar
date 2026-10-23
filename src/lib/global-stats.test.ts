import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getFilterValues, getStats, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';

describe('getStats unknown parent amount lot coverage', () => {
  it('includes complete lot awards in global totals and rankings', () => {
    const db = createGeneratedTestDb(20261025, 1);
    db.prepare(`
      UPDATE contracts
      SET status = 'Formalizada', economic_nature = 'gasto',
          award_amount_type = 'desconocido', awarded_amount = NULL,
          awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          is_lotized = 1, lot_count = 2, year = 2026
      WHERE id = 'generated-20261025-1'
    `).run();
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('global-unknown-lot-1', 'generated-20261025-1', '1', 2000, NULL, 'Shared Lot Company', 'Adjudicado'),
        ('global-unknown-lot-2', 'generated-20261025-1', '2', 3000, NULL, 'Shared Lot Company', 'Adjudicado')
    `).run();
    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, lot_number, award_index, awardee, awardee_nif, awarded_amount, result_state
      ) VALUES
        ('global-unknown-award-1', 'generated-20261025-1', '1', 0, 'Shared Lot Company', 'B12345678', 1800, 'Adjudicado'),
        ('global-unknown-award-2', 'generated-20261025-1', '2', 0, 'Shared Lot Company', 'B12345678', 2700, 'Adjudicado')
    `).run();
    setDbForTests(db);

    try {
      const stats = getStats();

      expect(stats.totalImporte).toBe(4500);
      expect(stats.gastoAdjudicado).toBe(4500);
      expect(stats.ahorroMedioPct).toBe(10);
      expect(stats.desgloseAmbito.directa.volumen + stats.desgloseAmbito.mancomunidad.volumen).toBe(4500);
      expect(stats.porTipo.reduce((sum, item) => sum + item.volumen, 0)).toBe(4500);
      expect(stats.porProcedimiento.reduce((sum, item) => sum + item.volumen, 0)).toBe(4500);
      expect(stats.topOrganismos.reduce((sum, item) => sum + item.volumen, 0)).toBe(4500);
      expect(stats.topEmpresasVolumen.reduce((sum, item) => sum + item.volumen, 0)).toBe(4500);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('excludes a partial unknown lot award amount from global totals', () => {
    const db = createGeneratedTestDb(20261026, 1);
    db.prepare(`
      UPDATE contracts
      SET status = 'Formalizada', economic_nature = 'gasto',
          award_amount_type = 'desconocido', awarded_amount = NULL,
          awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          is_lotized = 1, lot_count = 2, year = 2026
      WHERE id = 'generated-20261026-1'
    `).run();
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('global-partial-lot-1', 'generated-20261026-1', '1', 2000, NULL, 'Shared Lot Company', 'Adjudicado'),
        ('global-partial-lot-2', 'generated-20261026-1', '2', 3000, NULL, 'Shared Lot Company', 'Adjudicado')
    `).run();
    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, lot_number, award_index, awardee, awardee_nif, awarded_amount, result_state
      ) VALUES
        ('global-partial-award-1', 'generated-20261026-1', '1', 0, 'Shared Lot Company', 'B12345678', 1800, 'Adjudicado'),
        ('global-partial-award-2', 'generated-20261026-1', '2', 0, 'Shared Lot Company', 'B12345678', NULL, 'Adjudicado')
    `).run();
    setDbForTests(db);

    try {
      const stats = getStats();

      expect(stats.totalImporte).toBe(0);
      expect(stats.desgloseAmbito.directa.volumen + stats.desgloseAmbito.mancomunidad.volumen).toBe(0);
      expect(stats.topOrganismos.reduce((sum, item) => sum + item.volumen, 0)).toBe(0);
      expect(stats.topEmpresasVolumen.reduce((sum, item) => sum + item.volumen, 0)).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});

  it('cuenta Al Máximo usando todos los lotes adjudicados', () => {
    const db = createGeneratedTestDb(20261004, 1);

    db.prepare(`
      UPDATE contracts
      SET procedure = 'Abierto',
          status = 'Adjudicada',
          economic_nature = 'gasto',
          award_amount_type = 'total',
          amount_excl_vat = 10000,
          awarded_amount = 9000,
          awardee = 'Empresa Cabecera',
          is_lotized = 1
      WHERE id = 'generated-20261004-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('max-lot-1', 'generated-20261004-1', '1', 6000, 5000, 'Empresa A', 'Adjudicado'),
        ('max-lot-2', 'generated-20261004-1', '2', 4000, 3000, 'Empresa B', 'Adjudicado')
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, result_state
      ) VALUES
        ('max-award-1a', 'generated-20261004-1', 'GEN/2026/1', '1', 0, 'Empresa A1', 2500, 'Adjudicado'),
        ('max-award-1b', 'generated-20261004-1', 'GEN/2026/1', '1', 1, 'Empresa A2', 3500, 'Adjudicado'),
        ('max-award-2a', 'generated-20261004-1', 'GEN/2026/1', '2', 0, 'Empresa B1', 1500, 'Adjudicado'),
        ('max-award-2b', 'generated-20261004-1', 'GEN/2026/1', '2', 1, 'Empresa B2', 2500, 'Adjudicado')
    `).run();

    setDbForTests(db);

    try {
      const filters = getFilterValues();
      expect(filters.alertasCounts.alMaximo).toBe(1);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });


describe('getFilterValues alerta Al Máximo con lot_awards', () => {
  it('detecta todos los lotes adjudicados al PBL cuando contract_lots no conserva el importe adjudicado', () => {
    const db = createGeneratedTestDb(20261014, 1);
    setDbForTests(db);
    try {
      db.prepare(`
        UPDATE contracts
        SET procedure = 'Abierto',
            status = 'Adjudicada',
            economic_nature = 'gasto',
            award_amount_type = 'total',
            amount_excl_vat = 15000,
            awarded_amount = 12000,
            awardee = 'Empresa Cabecera',
            is_lotized = 1,
            lot_count = 2
        WHERE id = 'generated-20261014-1'
      `).run();

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, budget_excl_vat,
          awarded_amount, awardee, lot_status
        ) VALUES
          ('max-award-lot-1', 'generated-20261014-1', '1', 6000, null, 'Empresa A', 'Adjudicado'),
          ('max-award-lot-2', 'generated-20261014-1', '2', 4000, null, 'Empresa B', 'Adjudicado')
      `).run();

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awarded_amount, result_state
        ) VALUES
          ('max-award-only-1', 'generated-20261014-1', 'GEN/2026/1', '1', 0, 'Empresa A', 6000, 'Adjudicado'),
          ('max-award-only-2', 'generated-20261014-1', 'GEN/2026/1', '2', 0, 'Empresa B', 4000, 'Adjudicado')
      `).run();

      expect(getFilterValues().alertasCounts.alMaximo).toBe(1);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});

describe('getFilterValues excluye lotes terminales de Al Máximo', () => {
  it('no cuenta un lote Cancelled con importe residual como un segundo lote adjudicado', () => {
    const db = createGeneratedTestDb(20261034, 1);
    const contractId = 'generated-20261034-1';
    setDbForTests(db);

    try {
      db.prepare(`
        UPDATE contracts
        SET year = 2026,
            procedure = 'Abierto',
            status = 'Adjudicada',
            economic_nature = 'gasto',
            award_amount_type = 'total',
            amount_excl_vat = 10000,
            awarded_amount = 10000,
            awardee = 'Empresa Cabecera',
            is_lotized = 1,
            lot_count = 2
        WHERE id = ?
      `).run(contractId);
      db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(contractId);
      db.prepare('DELETE FROM lot_awards WHERE contract_id = ?').run(contractId);

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, budget_excl_vat,
          awarded_amount, awardee, lot_status
        ) VALUES
          ('filter-max-active-lot', ?, '1', 6000, 6000, 'Empresa Activa', 'Adjudicado'),
          ('filter-max-cancelled-lot', ?, '2', 4000, 4000, 'Empresa Cancelada', 'Cancelled')
      `).run(contractId, contractId);

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awarded_amount, result_state
        ) VALUES
          ('filter-max-active-award', ?, 'GEN/2026/34', '1', 0, 'Empresa Activa', 6000, 'Adjudicado'),
          ('filter-max-cancelled-award', ?, 'GEN/2026/34', '2', 0, 'Empresa Cancelada', 4000, 'Adjudicado')
      `).run(contractId, contractId);

      expect(getFilterValues().alertasCounts.alMaximo).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});

describe('terminal status in contract-list alert badges', () => {
  it('uses the canonical terminal status instead of Spanish-only string checks', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/licitaciones/page.tsx'),
      'utf8',
    );

    expect(source).toContain("import { getContractStatus } from '@/lib/contract-status';");
    expect(source).toContain('!isTerminalContract(lic)');
    expect(source).not.toContain("lic.estado !== 'Desierta'");
    expect(source).not.toContain("lic.estado !== 'Anulada'");
  });
});

describe('getFilterValues excludes terminal parent contracts from award alerts', () => {
  it.each(['Anulada', 'Cancelled', 'Desierta', 'Deserted'])(
    'does not count terminal %s residuals as unique-offer or at-budget awards',
    (status) => {
      const db = createGeneratedTestDb(20261035, 1);
      setDbForTests(db);
      try {
        db.prepare(`
          UPDATE contracts
          SET status = ?,
              year = 2026,
              procedure = 'Abierto',
              dataset = 'licitaciones',
              award_amount_type = 'total',
              amount_excl_vat = 10000,
              awarded_amount = 10000,
              awardee = 'Empresa residual',
              offer_count = 1,
              is_lotized = 0
          WHERE id = 'generated-20261035-1'
        `).run(status);

        const counts = getFilterValues().alertasCounts;
        expect(counts.alMaximo).toBe(0);
        expect(counts.ofertaUnica).toBe(0);
      } finally {
        setDbForTests(null);
        db.close();
      }
    }
  );
});

describe('getStats rankings de empresas', () => {
  it('incluye adjudicatarios de lot_awards en ambos rankings globales', () => {
    const db = createGeneratedTestDb(20261004, 1);

    db.prepare(`
      UPDATE contracts
      SET procedure = 'Abierto',
          award_amount_type = 'total',
          amount_excl_vat = 10000,
          awarded_amount = 9000,
          awardee = 'Empresa Cabecera',
          awardee_nif = 'B99999999',
          is_lotized = 1,
          lot_count = 1
      WHERE id = 'generated-20261004-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, lot_name,
        budget_excl_vat, awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'ranking-lot-1', 'generated-20261004-1', '1', 'Lote 1',
      10000, 3000, 'Empresa B', 'B10000002', 'Adjudicado'
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        offer_count, award_date, result_state
      ) VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'ranking-award-1', 'generated-20261004-1', 'GEN/2026/1', '1', 0,
      'Empresa B', 'B10000002', 3000, 3630, 2, '2026-06-01', 'Adjudicado',
      'ranking-award-2', 'generated-20261004-1', 'GEN/2026/1', '1', 1,
      'Empresa B', 'B10000002', 2000, 2420, 1, '2026-06-02', 'Adjudicado'
    );

    setDbForTests(db);
    try {
      const stats = getStats();

      expect(stats.topEmpresasVolumen).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ awardee: 'Empresa B', contratos: 1 }),
        ])
      );
      expect(stats.topEmpresasContratos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ awardee: 'Empresa B', contratos: 1 }),
        ])
      );
      expect(stats.topEmpresasVolumen).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ awardee: 'Empresa Cabecera' }),
        ])
      );
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});

describe('getStats authority identity', () => {
  it('keeps same-name contracting authorities separate in the homepage ranking', () => {
    const db = createGeneratedTestDb(20261020, 2);
    db.prepare("UPDATE contracts SET award_amount_type = 'unitario', year = 2026").run();
    db.prepare("UPDATE contracting_authorities SET name = 'Organismo con nombre compartido'").run();
    db.prepare(`UPDATE contracts
      SET contracting_authority_name = 'Organismo con nombre compartido',
          award_amount_type = 'total', awarded_amount = 1000, status = 'Adjudicada'
      WHERE id = 'generated-20261020-1'`).run();
    db.prepare(`UPDATE contracts
      SET contracting_authority_name = 'Organismo con nombre compartido',
          award_amount_type = 'total', awarded_amount = 3000, status = 'Adjudicada'
      WHERE id = 'generated-20261020-2'`).run();
    setDbForTests(db);

    try {
      const stats = getStats(2026);
      const rows = stats.topOrganismos;

      expect(stats.totalOrganismos).toBe(2);
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.organo)).toEqual([
        'Organismo con nombre compartido',
        'Organismo con nombre compartido',
      ]);
      expect(rows.map((row) => row.authorityId)).toEqual([
        'generated-authority-2',
        'generated-authority-1',
      ]);
      expect(rows.map((row) => row.volumen)).toEqual([3000, 1000]);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});

describe('getStats total empresas', () => {
  it('incluye adjudicatarios de lot_awards en el total de empresas', () => {
    const db = createGeneratedTestDb(20261004, 1);
    db.prepare(`
      UPDATE contracts
      SET status = 'Adjudicada',
          procedure = 'Abierto',
          economic_nature = 'gasto',
          award_amount_type = 'total',
          amount_excl_vat = 10000,
          awarded_amount = 9000,
          awardee = 'Empresa Cabecera',
          awardee_nif = 'B99999999',
          is_lotized = 1
      WHERE id = 'generated-20261004-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount,
        awardee, awardee_nif, lot_status
      ) VALUES ('total-company-lot', 'generated-20261004-1', '1', 10000, 3000,
        'Empresa B', 'B10000002', 'Adjudicado')
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES ('total-company-award', 'generated-20261004-1', 'GEN/2026/1', '1', 0,
        'Empresa B', 'B10000002', 3000, 'Adjudicado')
    `).run();

    setDbForTests(db);
    try {
      expect(getStats().totalEmpresas).toBe(1);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});


describe('getStats gasto en curso lot-aware', () => {
  it('incluye convocatorias Published en gasto en curso', () => {
    const db = createGeneratedTestDb(20261024, 1);
    setDbForTests(db);
    try {
      db.prepare(`UPDATE contracts SET status = 'Published', economic_nature = 'gasto',
        amount_excl_vat = 10000, awarded_amount = NULL, awardee = NULL,
        award_amount_type = 'total', is_lotized = 0 WHERE id = 'generated-20261024-1'`).run();

      expect(getStats().gastoEnCurso).toBe(10000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('no cuenta como gasto en curso un expediente lotizado ya adjudicado en lot_awards', () => {
    const db = createGeneratedTestDb(20261015, 1);
    setDbForTests(db);
    try {
      db.prepare(`
        UPDATE contracts
        SET status = 'Publicada',
            award_amount_type = 'total',
            amount_excl_vat = 10000,
            awarded_amount = NULL,
            awardee = NULL,
            is_lotized = 1,
            lot_count = 1,
            economic_nature = 'gasto'
        WHERE id = 'generated-20261015-1'
      `).run();

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'curso-lot-1', 'generated-20261015-1', '1', 10000, null,
        'Empresa Adjudicataria', 'Adjudicado'
      );

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awarded_amount, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'curso-award-1', 'generated-20261015-1', 'GEN/2026/1', '1', 0,
        'Empresa Adjudicataria', 8000, 'Adjudicado'
      );

      const stats = getStats();
      expect(stats.gastoAdjudicado).toBe(8000);
      expect(stats.gastoEnCurso).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});

describe('getStats volumen lot-aware', () => {
  it('usa adjudicaciones de lotes en los agregados del dashboard', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/db.ts'), 'utf8');
    const start = source.indexOf('export function getStats');
    const end = source.indexOf('  // Últimas Licitaciones', start);
    const stats = source.slice(start, end);

    expect(stats).toContain('as flow_awarded');
    expect(stats).toContain('SELECT round(sum(lot.awarded_amount), 2)');
    expect(stats).toContain("eligibleAwardLotStatusSql('lot')");
  });
});


describe('getStats agregados económicos lot-aware', () => {
  it('usa la suma de adjudicaciones de lotes aunque el padre tenga otro adjudicatario', () => {
    const db = createGeneratedTestDb(20261002, 1);
    setDbForTests(db);
    try {
      db.prepare(`
        UPDATE contracts
        SET status = 'Adjudicada',
            award_amount_type = 'total',
            amount_excl_vat = 10000,
            awarded_amount = NULL,
            awardee = 'Empresa Padre',
            awardee_nif = 'B99999999',
            is_lotized = 1,
            lot_count = 2,
            award_date = '2026-06-01',
            publication_date = '2026-05-01',
            economic_nature = 'gasto'
        WHERE id = 'generated-20261002-1'
      `).run();

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          budget_excl_vat, awarded_amount, awardee, awardee_nif, lot_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'stats-lot-1', 'generated-20261002-1', 'GEN/2026/1', '1',
        'Lote 1', 5000, 9000, 'Empresa Lote A', 'B11111111', 'Adjudicado'
      );
      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          budget_excl_vat, awarded_amount, awardee, awardee_nif, lot_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'stats-lot-2', 'generated-20261002-1', 'GEN/2026/1', '2',
        'Lote 2', 5000, 9000, 'Empresa Lote B', 'B22222222', 'Adjudicado'
      );
      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          budget_excl_vat, awarded_amount, awardee, awardee_nif, lot_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'stats-lot-3', 'generated-20261002-1', 'GEN/2026/1', '3',
        'Lote cancelado', 5000, 5000, 'Empresa Lote C', 'B33333333', 'Cancelled'
      );

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'stats-award-1', 'generated-20261002-1', 'GEN/2026/1', '1', 0,
        'Empresa Lote A', 'B11111111', 1500, 'Adjudicado'
      );
      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'stats-award-2', 'generated-20261002-1', 'GEN/2026/1', '2', 0,
        'Empresa Lote B', 'B22222222', 2500, 'Adjudicado'
      );
      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'stats-award-cancelled', 'generated-20261002-1', 'GEN/2026/1', '3', 0,
        'Empresa Lote C', 'B33333333', 5000, 'Adjudicado'
      );

      const stats = getStats();

      expect(stats.totalLicitaciones).toBe(1);
      expect(stats.totalImporte).toBe(4000);
      expect(stats.gastoAdjudicado).toBe(4000);
      expect(stats.ahorroMedioPct).toBe(60);
      expect(stats.desgloseAmbito.directa.volumen).toBe(4000);
      expect(stats.porTipo[0]?.volumen).toBe(4000);
      expect(stats.porProcedimiento[0]?.volumen).toBe(4000);
      expect(stats.topOrganismos[0]?.volumen).toBe(4000);
      expect(stats.topOrganismos[0]?.contratos).toBe(1);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});


describe('getStats English deserted status', () => {
  it('counts Deserted as PBL without treating residual parent amounts as awards', () => {
    const db = createGeneratedTestDb(20261019, 1);
    setDbForTests(db);
    try {
      db.prepare(`
        UPDATE contracts
        SET status = 'Deserted',
            procedure = 'Abierto',
            dataset = 'licitaciones',
            year = 2026,
            award_amount_type = 'total',
            amount_excl_vat = 10000,
            awarded_amount = 1000,
            awardee = 'Empresa residual',
            award_date = '2026-09-01',
            deadline_date = '2026-08-01',
            economic_nature = 'gasto',
            scope = 'Directa Municipal',
            is_lotized = 0
        WHERE id = 'generated-20261019-1'
      `).run();

      const stats = getStats();
      expect(stats.gastoDesierto).toBe(10000);
      expect(stats.gastoAdjudicado).toBe(0);
      expect(stats.totalImporte).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});

describe('getStats deserted lot budgets', () => {
  it('counts only the budget of a deserted lot in a partially awarded contract', () => {
    const db = createGeneratedTestDb(20261026, 1);
    db.prepare(`
      UPDATE contracts
      SET status = 'Formalizada',
          procedure = 'Abierto',
          dataset = 'licitaciones',
          year = 2026,
          award_amount_type = 'total',
          amount_excl_vat = 21000,
          awarded_amount = 7000,
          awardee = 'Varios adjudicatarios',
          economic_nature = 'gasto',
          is_lotized = 1,
          lot_count = 5
      WHERE id = 'generated-20261026-1'
    `).run();
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('deserted-budget-awarded-lot', 'generated-20261026-1', '1', 7000, 6500, 'Vendor A', 'Adjudicado'),
        ('deserted-budget-terminal-lot', 'generated-20261026-1', '2', 5000, 5000, 'Residual Vendor', 'Desierto'),
        ('deserted-budget-structured-lot', 'generated-20261026-1', '3', 3000, NULL, NULL, 'Adjudicado'),
        ('deserted-budget-cancelled-lot', 'generated-20261026-1', '4', 4000, 4000, 'Cancelled Vendor', 'Cancelado'),
        ('deserted-budget-overridden-lot', 'generated-20261026-1', '5', 2000, 1800, 'Vendor B', 'Desierto')
    `).run();
    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES
        ('deserted-budget-structured-result', 'generated-20261026-1', '3', 0, NULL, NULL, 'DESERTED'),
        ('deserted-budget-overriding-award', 'generated-20261026-1', '5', 0, 'Vendor B', 1800, 'Adjudicado')
    `).run();
    setDbForTests(db);

    try {
      expect(getStats().gastoDesierto).toBe(8000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});


describe('getStats terminal parent statuses', () => {
  it('excludes residual amounts from canceled contracts in totals and savings averages', () => {
    const db = createGeneratedTestDb(20261014, 2);
    setDbForTests(db);
    try {
      db.prepare(`
        UPDATE contracts
        SET status = 'Adjudicada',
            procedure = 'Abierto',
            dataset = 'licitaciones',
            year = 2026,
            award_amount_type = 'total',
            amount_excl_vat = 10000,
            awarded_amount = 8000,
            awardee = 'Empresa válida',
            award_date = '2026-09-01',
            deadline_date = '2026-08-01',
            economic_nature = 'gasto',
            scope = 'Directa Municipal',
            is_lotized = 0
        WHERE id = 'generated-20261014-1'
      `).run();
      db.prepare(`
        UPDATE contracts
        SET status = 'Cancelled',
            procedure = 'Abierto',
            dataset = 'licitaciones',
            year = 2026,
            award_amount_type = 'total',
            amount_excl_vat = 10000,
            awarded_amount = 1000,
            awardee = 'Empresa residual',
            award_date = '2026-09-01',
            deadline_date = '2026-08-01',
            economic_nature = 'gasto',
            scope = 'Directa Municipal',
            is_lotized = 0
        WHERE id = 'generated-20261014-2'
      `).run();

      const stats = getStats();
      expect(stats.totalImporte).toBe(8000);
      expect(stats.gastoAdjudicado).toBe(8000);
      expect(stats.ahorroMedioPct).toBe(20);
      expect(stats.desgloseAmbito.directa.volumen).toBe(8000);
      expect(stats.porTipo.reduce((sum, item) => sum + item.volumen, 0)).toBe(8000);
      expect(stats.porProcedimiento.reduce((sum, item) => sum + item.volumen, 0)).toBe(8000);
      expect(stats.topEmpresasVolumen.reduce((sum, item) => sum + item.volumen, 0)).toBe(8000);
      expect(stats.topOrganismos.reduce((sum, item) => sum + item.volumen, 0)).toBe(8000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});

describe('getStats ahorro medio lot-aware', () => {
  it('usa el PBL de los lotes cuando la adjudicación solo existe en lot_awards', () => {
    const db = createGeneratedTestDb(20261013, 1);
    setDbForTests(db);
    try {
      db.prepare(`
        UPDATE contracts
        SET status = 'Adjudicada',
            award_amount_type = 'total',
            amount_excl_vat = 15000,
            awarded_amount = NULL,
            awardee = 'Varios adjudicatarios',
            awardee_nif = NULL,
            is_lotized = 1,
            lot_count = 2,
            economic_nature = 'gasto'
        WHERE id = 'generated-20261013-1'
      `).run();

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          budget_excl_vat, awarded_amount, awardee, awardee_nif, lot_status
        ) VALUES
          ('ahorro-pbl-lot-1', 'generated-20261013-1', 'GEN/2026/1', '1', 'Lote 1',
           4000, null, 'Empresa A', 'B11111111', 'Adjudicado'),
          ('ahorro-pbl-lot-2', 'generated-20261013-1', 'GEN/2026/1', '2', 'Lote 2',
           6000, null, 'Empresa B', 'B22222222', 'Adjudicado')
      `).run();

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, result_state
        ) VALUES
          ('ahorro-pbl-award-1', 'generated-20261013-1', 'GEN/2026/1', '1', 0,
           'Empresa A', 'B11111111', 3000, 'Adjudicado'),
          ('ahorro-pbl-award-2', 'generated-20261013-1', 'GEN/2026/1', '2', 0,
           'Empresa B', 'B22222222', 5000, 'Adjudicado')
      `).run();

      expect(getStats().ahorroMedioPct).toBe(20);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});

describe('getStats importes lot_awards', () => {
  it('mantiene contract_lots cuando lot_awards solo cubre parte de los lotes', () => {
    const db = createGeneratedTestDb(20261004, 1);
    db.prepare(`
      UPDATE contracts
      SET status = 'Adjudicada',
          procedure = 'Abierto',
          economic_nature = 'gasto',
          award_amount_type = 'total',
          amount_excl_vat = 10000,
          awarded_amount = 9000,
          is_lotized = 1,
          lot_count = 2
      WHERE id = 'generated-20261004-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, lot_status
      ) VALUES
        ('stats-coverage-lot-1', 'generated-20261004-1', '1', 6000, 5000, 'Adjudicado'),
        ('stats-coverage-lot-2', 'generated-20261004-1', '2', 4000, NULL, 'Adjudicado')
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awarded_amount, result_state
      ) VALUES ('stats-coverage-award-1', 'generated-20261004-1', 'GEN/2026/1', '1', 0, 2500, 'Adjudicado')
    `).run();

    setDbForTests(db);
    try {
      expect(getStats().totalImporte).toBe(5000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
  it('mantiene contract_lots cuando los awards tienen la misma cantidad pero no cubren los mismos lotes', () => {
    const db = createGeneratedTestDb(20261004, 1);
    db.prepare(`
      UPDATE contracts
      SET status = 'Adjudicada',
          procedure = 'Abierto',
          economic_nature = 'gasto',
          award_amount_type = 'total',
          amount_excl_vat = 10000,
          awarded_amount = 9000,
          is_lotized = 1,
          lot_count = 2
      WHERE id = 'generated-20261004-1'
    `).run();

    db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run('generated-20261004-1');
    db.prepare('DELETE FROM lot_awards WHERE contract_id = ?').run('generated-20261004-1');

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, lot_status
      ) VALUES
        ('stats-duplicate-lot-1', 'generated-20261004-1', '1', 6000, 5000, 'Adjudicado'),
        ('stats-duplicate-lot-2', 'generated-20261004-1', '2', 4000, 3000, 'Adjudicado')
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awarded_amount, result_state
      ) VALUES
        ('stats-duplicate-award-1', 'generated-20261004-1', 'GEN/2026/1', '1', 0, 2500, 'Adjudicado'),
        ('stats-duplicate-award-2', 'generated-20261004-1', 'GEN/2026/1', '3', 0, 3000, 'Adjudicado')
    `).run();

    setDbForTests(db);
    try {
      expect(getStats().totalImporte).toBe(8000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

});


describe('getStats parent amount fallback after terminal lot results', () => {
  it('does not count parent award amounts or pending PBL after structured or legacy terminal results', () => {
    const db = createGeneratedTestDb(20261035, 3);
    const awardedContractId = 'generated-20261035-1';
    const pendingContractId = 'generated-20261035-2';
    const legacyTerminalContractId = 'generated-20261035-3';
    setDbForTests(db);

    try {
      db.prepare(`
        UPDATE contracts
        SET year = 2026, status = 'Adjudicada', procedure = 'Abierto',
            economic_nature = 'gasto', award_amount_type = 'total',
            amount_excl_vat = 10000, awarded_amount = 6000,
            awardee = 'Empresa residual', is_lotized = 1, lot_count = 1
        WHERE id = ?
      `).run(awardedContractId);
      db.prepare(`
        UPDATE contracts
        SET year = 2026, status = 'En evaluación', procedure = 'Abierto',
            economic_nature = 'gasto', award_amount_type = 'total',
            amount_excl_vat = 10000, awarded_amount = 6000,
            awardee = NULL, is_lotized = 1, lot_count = 1
        WHERE id = ?
      `).run(pendingContractId);
      db.prepare(`
        UPDATE contracts
        SET year = 2026, status = 'Adjudicada', procedure = 'Abierto',
            economic_nature = 'gasto', award_amount_type = 'total',
            amount_excl_vat = 10000, awarded_amount = 6000,
            awardee = 'Empresa residual legado', is_lotized = 1, lot_count = 1
        WHERE id = ?
      `).run(legacyTerminalContractId);

      db.prepare('DELETE FROM contract_lots WHERE contract_id IN (?, ?, ?)').run(
        awardedContractId, pendingContractId, legacyTerminalContractId,
      );
      db.prepare('DELETE FROM lot_awards WHERE contract_id IN (?, ?, ?)').run(
        awardedContractId, pendingContractId, legacyTerminalContractId,
      );
      const insertAward = db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awarded_amount, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertAward.run('parent-terminal-only-award', awardedContractId, 'GEN/2026/35', '1', 0, null, 6000, 'CANCELLED');
      insertAward.run('parent-terminal-pending-award', pendingContractId, 'GEN/2026/35B', '1', 0, null, 6000, 'CANCELLED');
      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_status, awarded_amount, awardee
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'parent-terminal-legacy-lot', legacyTerminalContractId, '1',
        'Cancelled', 6000, 'Empresa residual legado',
      );

      const stats = getStats();
      expect(stats.totalImporte).toBe(0);
      expect(stats.gastoAdjudicado).toBe(0);
      expect(stats.gastoEnCurso).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});

describe('Estados CODICE de adjudicaciones por lote', () => {
  it('excluye resultados desiertos, desistidos y renunciados del volumen adjudicado', () => {
    const db = createGeneratedTestDb(20261004, 1);
    const contractId = 'generated-20261004-1';

    db.prepare(`UPDATE contracts
      SET status = 'Adjudicada',
          procedure = 'Abierto',
          economic_nature = 'gasto',
          award_amount_type = 'total',
          awarded_amount = NULL,
          is_lotized = 1,
          lot_count = 1
      WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'stats-deserted-code-lot', contractId, 'GEN/2026/1', '1', 10000, null, 'Empresa', 'Adjudicado'
    );

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awarded_amount, result_state
    ) VALUES
      (?, ?, ?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?, ?, ?)`).run(
      'stats-deserted-code-award', contractId, 'GEN/2026/1', '1', 0, 5000, 'DESERTED',
      'stats-withdrawn-code-award', contractId, 'GEN/2026/1', '1', 1, 3000, 'WITHDRAWN',
      'stats-renounced-code-award', contractId, 'GEN/2026/1', '1', 2, 2000, 'RENOUNCED'
    );

    setDbForTests(db);
    try {
      expect(getStats().totalImporte).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});

describe('getFilterValues alertas de oferta única', () => {
  it('ignora un snapshot parcial de lot_awards al contar ofertas únicas', () => {
    const db = createGeneratedTestDb(20261008, 1);

    db.prepare(`
      UPDATE contracts
      SET procedure = 'Abierto',
          status = 'Adjudicada',
          offer_count = 2,
          awardee = 'Empresa Cabecera',
          is_lotized = 1,
          lot_count = 2
      WHERE id = 'generated-20261008-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, offer_count, awardee, lot_status
      ) VALUES
        ('filter-partial-lot-1', 'generated-20261008-1', '1', 2, 'Empresa Lote A', 'Adjudicado'),
        ('filter-partial-lot-2', 'generated-20261008-1', '2', 3, 'Empresa Lote B', 'Adjudicado')
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, offer_count, result_state
      ) VALUES (
        'filter-partial-award-1', 'generated-20261008-1', 'GEN/2026/8', '1', 0,
        'Empresa Lote A', 1, 'Adjudicado'
      )
    `).run();

    setDbForTests(db);

    try {
      expect(getFilterValues().alertasCounts.ofertaUnica).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('cuenta expedientes con oferta única registrada solo en un lote', () => {
    const db = createGeneratedTestDb(20261005, 1);

    db.prepare(`
      UPDATE contracts
      SET procedure = 'Abierto',
          status = 'Adjudicada',
          offer_count = 2,
          awardee = 'Empresa Cabecera'
      WHERE id = 'generated-20261005-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, offer_count, awardee, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'filter-alert-lot-1',
      'generated-20261005-1',
      '1',
      1,
      'Empresa Lote',
      'Adjudicado'
    );

    setDbForTests(db);

    try {
      expect(getFilterValues().alertasCounts.ofertaUnica).toBe(1);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
  it('does not fall back to residual legacy amounts when a structured lot result is Cancelled', () => {
    const db = createGeneratedTestDb(20261019, 1);
    setDbForTests(db);
    try {
      const contractId = 'generated-20261019-1';
      db.prepare(`UPDATE contracts SET status = 'Adjudicada', award_amount_type = 'total',
        awarded_amount = NULL, awardee = 'Empresa residual', is_lotized = 1, lot_count = 1,
        economic_nature = 'gasto' WHERE id = ?`).run(contractId);
      db.prepare(`INSERT INTO contract_lots (
        id, contract_id, lot_number, awarded_amount, awardee, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?)`).run(
        'stats-terminal-legacy-lot', contractId, '1', 6000, 'Empresa residual', 'Adjudicado'
      );
      db.prepare(`INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'stats-terminal-structured-award', contractId, 'GEN/2024/19', '1', 0,
        null, 6000, 'CANCELLED'
      );

      expect(getStats().totalImporte).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

});
