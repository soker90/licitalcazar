import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { calculatePercentiles, getTiemposStats, getStats, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';

describe('calculatePercentiles', () => {
  it('handles empty array gracefully', () => {
    const res = calculatePercentiles([]);
    expect(res.min).toBe(0);
    expect(res.mediana).toBe(0);
    expect(res.media).toBe(0);
  });

  it('computes exact percentiles and IQR on known data', () => {
    // Array: [10, 20, 30, 40, 50]
    const data = [10, 20, 30, 40, 50];
    const res = calculatePercentiles(data);
    expect(res.min).toBe(10);
    expect(res.max).toBe(50);
    expect(res.mediana).toBe(30);
    expect(res.media).toBe(30);
    expect(res.p25).toBe(20);
    expect(res.p75).toBe(40);
    expect(res.iqr).toBe(20);
    expect(res.umbralOutlier).toBe(70); // 40 + 1.5 * 20 = 70
  });

  it('detects positive skewness (right-skewed: media > mediana)', () => {
    // Highly skewed distribution with long-tail outliers
    const skewed = [5, 6, 7, 8, 9, 10, 12, 15, 100, 250];
    const res = calculatePercentiles(skewed);
    expect(res.media).toBeGreaterThan(res.mediana);
    expect(res.p90).toBeGreaterThan(res.p75);
    expect(res.max).toBe(250);
  });
});

describe('getTiemposStats (Issue #12)', () => {
  it('usa los adjudicatarios reales de los lotes en expedientes multilot', () => {
    const source = fs.readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
    const fnStart = source.indexOf('export function getTiemposStats');
    const fnEnd = source.indexOf('export function getStats', fnStart);
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain('group_concat(DISTINCT lot.awardee)');
    expect(fn).toContain('lot.contract_id = contracts.id');
    expect(fn).toContain("eligibleAwardLotStatusSql('lot')");
  });


  it('excluye importes y adjudicatarios de lotes cancelados en las métricas de tiempos', () => {
    const db = createGeneratedTestDb(20261015, 1);
    setDbForTests(db);
    const contractId = 'generated-20261015-1';

    try {
      db.exec("DELETE FROM lot_awards; DELETE FROM contract_lots; DELETE FROM contracts WHERE id != 'generated-20261015-1';");
      db.prepare(`
        UPDATE contracts
        SET year = 2026,
            status = 'Adjudicada',
            procedure = 'Abierto',
            economic_nature = 'gasto',
            deadline_date = '2026-01-01',
            award_date = '2026-01-20',
            publication_date = '2026-02-01',
            awardee = 'Varios adjudicatarios',
            award_amount_type = 'total',
            awarded_amount = NULL,
            amount_excl_vat = 1000,
            is_lotized = 1,
            lot_count = 2
        WHERE id = ?
      `).run(contractId);

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          awarded_amount, awardee, lot_status
        ) VALUES
          ('tiempos-active-lot-15', ?, 'GEN/2026/15', '1', 'Lote adjudicado', 100, 'Empresa Activa', 'Adjudicado'),
          ('tiempos-cancelled-lot-15', ?, 'GEN/2026/15', '2', 'Lote cancelado', 200, 'Empresa Cancelada', 'Cancelled')
      `).run(contractId, contractId);

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awarded_amount, result_state
        ) VALUES
          ('tiempos-active-award-15', ?, 'GEN/2026/15', '1', 0, 'Empresa Activa', 100, 'Adjudicado'),
          ('tiempos-cancelled-award-15', ?, 'GEN/2026/15', '2', 0, 'Empresa Cancelada', 200, 'Adjudicado')
      `).run(contractId, contractId);

      const tiempos = getTiemposStats(2026);
      const contract = [...tiempos.masRapidas, ...tiempos.masLentas].find((item) => item.id === contractId);

      expect(contract).toBeDefined();
      expect(contract?.amount).toBe(100);
      expect(contract?.awardee).toBe('Empresa Activa');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('excludes best-rated-tenderer results from awarded timing metrics', () => {
    const db = createGeneratedTestDb(20261016, 1);
    setDbForTests(db);
    const contractId = 'generated-20261016-1';

    try {
      db.exec("DELETE FROM lot_awards; DELETE FROM contract_lots; DELETE FROM contracts WHERE id != 'generated-20261016-1';");
      db.prepare(`
        UPDATE contracts
        SET year = 2026,
            status = 'Adjudicada',
            procedure = 'Abierto',
            economic_nature = 'gasto',
            deadline_date = '2026-01-01',
            award_date = '2026-01-20',
            publication_date = '2026-02-01',
            awardee = NULL,
            award_amount_type = 'total',
            awarded_amount = NULL,
            amount_excl_vat = 1000,
            is_lotized = 1,
            lot_count = 1
        WHERE id = ?
      `).run(contractId);

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awarded_amount, result_state
        ) VALUES ('pre-award-only', ?, 'GEN/2026/16', '1', 0, 'Empresa Previa', 900, 'BEST_RATED_TENDERER')
      `).run(contractId);

      const tiempos = getTiemposStats(2026);
      const contract = [...tiempos.masRapidas, ...tiempos.masLentas].find((item) => item.id === contractId);

      expect(contract).toBeDefined();
      expect(contract?.amount).toBe(0);
      expect(contract?.awardee ?? '').not.toContain('Empresa Previa');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it.each(['Anulada', 'Cancelled', 'Desierta', 'Deserted'])(
    'excludes terminal contract %s residual dates and amounts from timing statistics',
    (status) => {
      const db = createGeneratedTestDb(20261017, 1);
      setDbForTests(db);
      try {
        db.prepare(`
          UPDATE contracts
          SET year = 2026,
              status = ?,
              procedure = 'Abierto',
              economic_nature = 'gasto',
              deadline_date = '2026-01-01',
              award_date = '2026-01-20',
              publication_date = '2025-12-01',
              awardee = 'Empresa residual',
              award_amount_type = 'total',
              awarded_amount = 1000,
              amount_excl_vat = 10000,
              is_lotized = 0,
              lot_count = 0
          WHERE id = 'generated-20261017-1'
        `).run(status);

        const tiempos = getTiemposStats(2026);

        expect(tiempos.totalEvaluados).toBe(0);
        expect(tiempos.masRapidas).toHaveLength(0);
        expect(tiempos.masLentas).toHaveLength(0);
        expect(tiempos.bajaPercentiles.media).toBe(0);
      } finally {
        setDbForTests(null);
        db.close();
      }
    }
  );

  it('prefiere adjudicatarios de lot_awards sobre el fallback de contract_lots', () => {
    const db = createGeneratedTestDb(20261003, 1);
    setDbForTests(db);
    try {
      db.exec("DELETE FROM lot_awards; DELETE FROM contract_lots; DELETE FROM contracts WHERE id != 'generated-20261003-1';");
      db.prepare("UPDATE contracts SET deadline_date = '2026-01-01', award_date = '2026-01-20', awardee = '', publication_date = '2026-02-01', award_amount_type = 'total' WHERE id = 'generated-20261003-1'").run();
      db.prepare("INSERT INTO contract_lots (id, contract_id, case_number, lot_number, lot_name, awardee, lot_status) VALUES (?, ?, ?, ?, ?, ?, ?)").run('tiempos-award-fallback-1', 'generated-20261003-1', 'GEN/2026/1', '1', 'Lote 1', 'Empresa Fallback A', 'Adjudicado');
      db.prepare("INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run('tiempos-award-1', 'generated-20261003-1', 'GEN/2026/1', '1', 0, 'Empresa Award A', 1000, 'Adjudicado');

      const tiempos = getTiemposStats();
      expect(tiempos.masRapidas[0]?.awardee).toBe('Empresa Award A');
      expect(tiempos.masRapidas[0]?.amount).toBe(1000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
  it('mantiene contract_lots cuando lot_awards solo cubre parte de los lotes', () => {
    const db = createGeneratedTestDb(20261007, 1);
    setDbForTests(db);
    try {
      db.exec("DELETE FROM lot_awards; DELETE FROM contract_lots; DELETE FROM contracts WHERE id != 'generated-20261007-1';");
      db.prepare(`
        UPDATE contracts
        SET deadline_date = '2026-01-01',
            award_date = '2026-01-20',
            awardee = '',
            publication_date = '2026-02-01',
            status = 'Adjudicada',
            procedure = 'Abierto',
            economic_nature = 'gasto',
            award_amount_type = 'total',
            amount_excl_vat = 10000,
            awarded_amount = 9000,
            is_lotized = 1,
            lot_count = 2
        WHERE id = 'generated-20261007-1'
      `).run();

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          budget_excl_vat, awarded_amount, awardee, lot_status
        ) VALUES
          ('tiempos-partial-lot-1', 'generated-20261007-1', 'GEN/2026/1', '1', 'Lote 1', 6000, 5000, 'Empresa Fallback A', 'Adjudicado'),
          ('tiempos-partial-lot-2', 'generated-20261007-1', 'GEN/2026/1', '2', 'Lote 2', 4000, 3000, 'Empresa Fallback B', 'Adjudicado')
      `).run();
      db.prepare(`INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
      ) VALUES ('tiempos-partial-award-1', 'generated-20261007-1', 'GEN/2026/1', '1', 0, 'Empresa Award', 2500, 'Adjudicado')
      `).run();

      const tiempos = getTiemposStats();
      expect(tiempos.masRapidas[0]?.amount).toBe(8000);
      expect(tiempos.masRapidas[0]?.awardee).toContain('Empresa Fallback A');
      expect(tiempos.masRapidas[0]?.awardee).toContain('Empresa Fallback B');
      expect(tiempos.bajaPercentiles?.mediana).toBe(20);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('usa adjudicaciones de lotes y no usa PBL como fallback del importe', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/lib/db.ts'), 'utf8');
    expect(source).toContain('sum(lot.awarded_amount)');
    expect(source).toContain("eligibleAwardLotStatusSql('lot')");
    expect(source).toContain("allowParentAwardAmountFallbackSql('contracts', hasLotAwardsTable)");
    expect(source).not.toContain("coalesce(awarded_amount, amount_excl_vat, 0) ELSE 0 END as amount,");
  });

  it('computes robust distribution metrics for Alcázar tenders', () => {
    const tiempos = getTiemposStats();

    expect(tiempos.totalEvaluados).toBeGreaterThan(600);
    expect(tiempos.medianaDiasResolucion).toBeGreaterThan(15);
    expect(tiempos.medianaDiasResolucion).toBeLessThan(tiempos.mediaDiasResolucion);

    // Verified in DB: median is ~23-24 days, media is ~33-35 days
    expect(tiempos.medianaDiasResolucion).toBeGreaterThan(15);
    expect(tiempos.medianaDiasResolucion).toBeLessThan(35);
    expect(tiempos.mediaDiasResolucion).toBeGreaterThan(25);
    expect(tiempos.mediaDiasResolucion).toBeLessThan(45);

    const { percentiles } = tiempos;
    expect(percentiles.p25).toBeLessThanOrEqual(percentiles.mediana);
    expect(percentiles.mediana).toBeLessThanOrEqual(percentiles.p75);
    expect(percentiles.p75).toBeLessThanOrEqual(percentiles.p90);
    expect(percentiles.p90).toBeLessThanOrEqual(percentiles.max);
    expect(percentiles.iqr).toBe(percentiles.p75 - percentiles.p25);
  });

  it('histogram buckets sum exactly to total evaluated tenders', () => {
    const tiempos = getTiemposStats();
    expect(tiempos.distribucion.length).toBe(6);

    const sumCount = tiempos.distribucion.reduce((acc, t) => acc + t.count, 0);
    expect(sumCount).toBe(tiempos.totalEvaluados);

    const sumPct = tiempos.distribucion.reduce((acc, t) => acc + t.pct, 0);
    expect(Math.round(sumPct)).toBe(100);
  });

  it('breaks down times by organism dynamically with media and mediana', () => {
    const tiempos = getTiemposStats();
    expect(tiempos.porOrganismo.length).toBeGreaterThanOrEqual(3);

    for (const org of tiempos.porOrganismo) {
      expect(org.organo).toBeTruthy();
      expect(org.contratos).toBeGreaterThan(0);
      expect(org.mediaDias).toBeGreaterThan(0);
      expect(org.medianaDias).toBeGreaterThan(0);
      expect(org.p90Dias).toBeGreaterThanOrEqual(org.medianaDias);
    }
  });

  it('identifies slowest contracts and long-tail outliers', () => {
    const tiempos = getTiemposStats();
    expect(tiempos.masLentas.length).toBe(5);

    const slowest = tiempos.masLentas[0];
    expect(slowest.dias).toBeGreaterThan(0);
    expect(slowest.desviacionSobreMediana).toBeGreaterThan(0);
    for (let i = 0; i < tiempos.masLentas.length - 1; i++) {
      expect(tiempos.masLentas[i].dias).toBeGreaterThanOrEqual(tiempos.masLentas[i + 1].dias);
    }

    expect(tiempos.outliers.length).toBeGreaterThan(0);
    for (const out of tiempos.outliers) {
      expect(out.dias).toBeGreaterThanOrEqual(tiempos.percentiles.umbralOutlier);
      expect(out.desviacionSobreMediana).toBeGreaterThan(0);
    }
  });

  it('calcula la baja con PBL y adjudicación de lotes', () => {
    const db = createGeneratedTestDb(20261002, 1);
    setDbForTests(db);
    try {
      db.exec("DELETE FROM contract_lots WHERE contract_id != 'generated-20261002-1'; DELETE FROM contracts WHERE id != 'generated-20261002-1';");
      db.prepare(`
        UPDATE contracts
        SET status = 'Adjudicada',
            procedure = 'Abierto',
            economic_nature = 'gasto',
            award_amount_type = 'total',
            amount_excl_vat = 10000,
            awarded_amount = 9000,
            is_lotized = 1,
            lot_count = 2,
            publication_date = '2026-05-01',
            deadline_date = '2026-05-15',
            award_date = '2026-06-01'
        WHERE id = 'generated-20261002-1'
      `).run();

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          budget_excl_vat, awarded_amount, awardee, lot_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('tiempos-lot-1', 'generated-20261002-1', 'GEN/2026/1', '1', 'Lote 1', 6000, 3000, 'Empresa A', 'Adjudicado');

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          budget_excl_vat, awarded_amount, awardee, lot_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('tiempos-lot-2', 'generated-20261002-1', 'GEN/2026/1', '2', 'Lote 2', 4000, 1000, 'Empresa B', 'Adjudicado');

      const row = db.prepare(`
        SELECT round(((pbl - awarded) * 100.0 / pbl), 1) as baja_pct
        FROM (
          SELECT
            (
              SELECT round(sum(coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0)), 2)
              FROM contract_lots lot
              WHERE lot.contract_id = contracts.id
                AND lot.awarded_amount IS NOT NULL
                AND lower(coalesce(lot.lot_status, '')) NOT LIKE '%desiert%'
            ) as pbl,
            (
              SELECT round(sum(lot.awarded_amount), 2)
              FROM contract_lots lot
              WHERE lot.contract_id = contracts.id
                AND lot.awarded_amount IS NOT NULL
                AND lower(coalesce(lot.lot_status, '')) NOT LIKE '%desiert%'
            ) as awarded
          FROM contracts
          WHERE id = 'generated-20261002-1'
        )
      `).get();

      const tiempos = getTiemposStats();

      expect(row?.baja_pct).toBe(60);
      expect(tiempos.bajaPercentiles).toBeDefined();
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('calculates competitive baja percentiles', () => {
    const tiempos = getTiemposStats();
    expect(tiempos.bajaPercentiles).toBeDefined();
    expect(tiempos.bajaPercentiles!.mediana).toBeGreaterThan(0);
    expect(tiempos.bajaPercentiles!.mediana).toBeLessThanOrEqual(100);
  });

  it('mantiene el importe de contract_lots ante un snapshot parcial de lot_awards', () => {
    const db = createGeneratedTestDb(20261013, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2024,
          procedure = 'Abierto',
          status = 'Adjudicada',
          deadline_date = '2024-02-01',
          award_date = '2024-03-01',
          amount_excl_vat = 10000,
          awarded_amount = NULL,
          award_amount_type = 'total',
          is_lotized = 1
      WHERE id = 'generated-20261013-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, lot_status
      ) VALUES
        ('tiempos-partial-lot-1', 'generated-20261013-1', 'GEN/2024/1', '1', 'Lote 1', 5000, 'Adjudicado'),
        ('tiempos-partial-lot-2', 'generated-20261013-1', 'GEN/2024/1', '2', 'Lote 2', NULL, 'Pendiente')
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, result_state
      ) VALUES ('tiempos-partial-award-1', 'generated-20261013-1', 'GEN/2024/1', '1', 0, 'Empresa Award', 2500, 'Adjudicado')
    `).run();

    setDbForTests(db);
    try {
      const stats = getTiemposStats(2024);
      expect(stats.masRapidas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'generated-20261013-1', amount: 5000 }),
        ]),
      );
    } finally {
      setDbForTests(null);
      db.close();
    }
  });


  it('is integrated in global getStats', () => {
    const stats = getStats();
    expect(stats.tiempos).toBeDefined();
    expect(stats.tiempos.medianaDiasResolucion).toBeGreaterThan(15);
    expect(stats.tiempos.medianaDiasResolucion).toBeLessThan(35);
    expect(stats.tiempos.percentiles).toBeDefined();
    expect(stats.tiempos.distribucion.length).toBe(6);
  });
});
