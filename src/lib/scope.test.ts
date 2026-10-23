import { beforeAll, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createGeneratedTestDb } from './test-db';
import { setDbForTests } from './db';
import {
  parseScope,
  getStats,
  getConcurrenciaStats,
  getFraccionamientoMenores,
} from './db';

describe('parseScope helper', () => {
  it('correctly maps directa aliases to Directa Municipal', () => {
    expect(parseScope('directa')).toBe('Directa Municipal');
    expect(parseScope('directa municipal')).toBe('Directa Municipal');
    expect(parseScope('Directa Municipal')).toBe('Directa Municipal');
    expect(parseScope('DIRECTA')).toBe('Directa Municipal');
  });

  it('correctly maps mancomunidad aliases to Indirecta (Mancomunidad)', () => {
    expect(parseScope('mancomunidad')).toBe('Indirecta (Mancomunidad)');
    expect(parseScope('comsermancha')).toBe('Indirecta (Mancomunidad)');
    expect(parseScope('indirecta')).toBe('Indirecta (Mancomunidad)');
    expect(parseScope('Indirecta (Mancomunidad)')).toBe('Indirecta (Mancomunidad)');
  });

  it('returns null for todos or empty input', () => {
    expect(parseScope('todos')).toBeNull();
    expect(parseScope('')).toBeNull();
    expect(parseScope(undefined)).toBeNull();
  });
});

describe('getStats scope isolation (Issue #24)', () => {
  let statsConsolidado;
  let concurrenciaGlobal;

  beforeAll(() => {
    statsConsolidado = getStats();
    concurrenciaGlobal = getConcurrenciaStats();
  });
  it('returns desgloseAmbito in GlobalStats', () => {
    const stats = statsConsolidado;
    expect(stats.desgloseAmbito).toBeDefined();
    expect(stats.desgloseAmbito.directa).toBeDefined();
    expect(stats.desgloseAmbito.mancomunidad).toBeDefined();

    const { directa, mancomunidad } = stats.desgloseAmbito;
    expect(directa.contratos).toBeGreaterThan(1500);
    expect(mancomunidad.contratos).toBeGreaterThan(100);

    // Consolidated contracts equals directa + mancomunidad
    expect(directa.contratos + mancomunidad.contratos).toBe(stats.totalLicitaciones);
    expect(directa.pctVolumen + mancomunidad.pctVolumen).toBeCloseTo(100, 0);
  });

  it('returns procedure breakdowns with the GlobalStats contract', () => {
    const stats = statsConsolidado;

    expect(stats.porProcedimiento.length).toBeGreaterThan(0);
    for (const item of stats.porProcedimiento) {
      expect(typeof item.procedimiento).toBe('string');
      expect(typeof item.contratos).toBe('number');
      expect(typeof item.volumen).toBe('number');
    }
  });

  it('filters statistics correctly when Directa Municipal is selected', () => {
    
    const statsDirecta = getStats(undefined, 'directa');

    expect(statsDirecta.ambitoSeleccionado).toBe('Directa Municipal');
    expect(statsDirecta.totalLicitaciones).toBe(statsConsolidado.desgloseAmbito.directa.contratos);
    expect(statsDirecta.totalImporte).toBeCloseTo(statsConsolidado.desgloseAmbito.directa.volumen, 1);

    // Top Organismos should not contain Comsermancha
    const hasComsermancha = statsDirecta.topOrganismos.some(o => o.organo.includes('COMSERMANCHA'));
    expect(hasComsermancha).toBe(false);
  });

  it('filters statistics correctly when Mancomunidad is selected', () => {
    const statsMancomunidad = getStats(undefined, 'mancomunidad');

    expect(statsMancomunidad.ambitoSeleccionado).toBe('Indirecta (Mancomunidad)');
    expect(statsMancomunidad.totalLicitaciones).toBe(statsConsolidado.desgloseAmbito.mancomunidad.contratos);
    expect(statsMancomunidad.totalImporte).toBeCloseTo(statsConsolidado.desgloseAmbito.mancomunidad.volumen, 1);

    // All top organisms in mancomunidad should be Comsermancha
    expect(statsMancomunidad.topOrganismos.length).toBeGreaterThan(0);
    for (const org of statsMancomunidad.topOrganismos) {
      expect(org.organo).toContain('COMSERMANCHA');
    }
  });

  it('passes scope filter to concurrencia and fraccionamiento queries', () => {
    const concurrenciaDirecta = getConcurrenciaStats(undefined, 'directa');
    const concurrenciaMancomunidad = getConcurrenciaStats(undefined, 'mancomunidad');

    expect(concurrenciaDirecta.totalEvaluadas).toBeGreaterThan(0);
    expect(concurrenciaMancomunidad.totalEvaluadas).toBeGreaterThan(0);
    expect(concurrenciaDirecta.totalEvaluadas + concurrenciaMancomunidad.totalEvaluadas).toBe(
      concurrenciaGlobal.totalEvaluadas
    );

    const fraccDirecta = getFraccionamientoMenores(10, undefined, 'directa');
    expect(fraccDirecta.casos).toBeDefined();
  });

  it('uses lot awardees for lotized minor contracts instead of the parent placeholder', () => {
    const fraccGlobal = getFraccionamientoMenores(1000);

    // The parent rows for these multi-lot minor contracts say
    // "Varios adjudicatarios", but their actual lot awardees are different
    // providers. That placeholder must never become a supplier identity.
    expect(fraccGlobal.casos.some((caso) => caso.adjudicatario === 'Varios adjudicatarios')).toBe(false);
  });

  it('does not flag same-name contracting authorities with different internal IDs', () => {
    const db = createGeneratedTestDb(20261022, 2);
    const contracts = ['generated-20261022-1', 'generated-20261022-2'];

    try {
      db.exec('DELETE FROM lot_awards; DELETE FROM contract_lots;');
      db.prepare('DELETE FROM contracts WHERE id NOT IN (?, ?)').run(...contracts);
      db.prepare("UPDATE contracting_authorities SET name = 'Ayuntamiento de Prueba'").run();
      contracts.forEach((id, index) => {
        db.prepare(`
          UPDATE contracts
          SET procedure = 'Contrato menor', year = 2024, status = 'Adjudicada',
              awardee = 'Empresa Recurrente', awardee_nif = 'A11111111',
              awarded_amount = 8000, award_amount_type = 'total',
              award_date = ?, contracting_authority_name = 'Ayuntamiento de Prueba'
          WHERE id = ?
        `).run(index === 0 ? '2024-04-01' : '2024-05-01', id);
      });

      setDbForTests(db);
      const result = getFraccionamientoMenores(1000, 2024);
      expect(result.casos).toHaveLength(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('excludes cancelled legacy lots from minor-contract fallback with or without lot_awards', () => {
    for (const [seed, hasLotAwardsTable] of [[20261018, true], [20261019, false]] as const) {
      const db = createGeneratedTestDb(seed, 2);
      const contracts = [`generated-${seed}-1`, `generated-${seed}-2`];

      try {
        db.exec("DELETE FROM lot_awards; DELETE FROM contract_lots;");
        db.prepare("DELETE FROM contracts WHERE id NOT IN (?, ?)").run(...contracts);
        if (!hasLotAwardsTable) db.exec('DROP TABLE lot_awards');

        contracts.forEach((id, index) => {
          const date = index === 0 ? '2024-04-01' : '2024-05-01';
          db.prepare(`
            UPDATE contracts
            SET procedure = 'Contrato menor',
                year = 2024,
                scope = 'Directa Municipal',
                awardee = 'Varios adjudicatarios',
                awardee_nif = NULL,
                awarded_amount = NULL,
                award_amount_type = 'total',
                contracting_authority_id = 'generated-authority-1',
                contracting_authority_name = 'Ayuntamiento de Prueba',
                contract_type = 'Servicios',
                object_description = 'Mantenimiento de instalaciones municipales',
                primary_cpv = '50000000',
                award_date = ?
            WHERE id = ?
          `).run(date, id);

          db.prepare(`
            INSERT INTO contract_lots (
              id, contract_id, lot_number, lot_name, awarded_amount,
              lot_status, awardee, awardee_nif, award_date
            ) VALUES (?, ?, '1', 'Lote adjudicado', ?, 'Adjudicado', 'Empresa Activa', 'A11111111', ?),
                     (?, ?, '2', 'Lote cancelado', ?, 'Cancelled', 'Empresa Cancelada', 'B22222222', ?)
          `).run(
            `minor-active-${seed}-${index}`, id, 8000 + index * 1000, date,
            `minor-cancelled-${seed}-${index}`, id, 18000 + index * 1000, date,
          );
        });

        setDbForTests(db);
        const result = getFraccionamientoMenores(1000, 2024);
        const activeCase = result.casos.find((item) => item.adjudicatario === 'Empresa Activa');

        expect(activeCase?.suma).toBe(17000);
        expect(result.casos.some((item) => item.adjudicatario === 'Empresa Cancelada')).toBe(false);
      } finally {
        setDbForTests(null);
        db.close();
      }
    }
  });

  it.each(['Cancelled', 'Desierta'])('excludes %s minor contracts from fraccionamiento signals', (terminalStatus) => {
    const db = createGeneratedTestDb(20261020, 2);
    const contracts = ['generated-20261020-1', 'generated-20261020-2'];

    try {
      db.exec('DELETE FROM lot_awards; DELETE FROM contract_lots;');
      db.prepare('DELETE FROM contracts WHERE id NOT IN (?, ?)').run(...contracts);
      contracts.forEach((id, index) => {
        db.prepare(`UPDATE contracts SET procedure = 'Contrato menor', year = 2024,
          awardee = 'Empresa Recurrente', awardee_nif = 'A11111111',
          awarded_amount = ?, award_amount_type = 'total', award_date = ?,
          status = ? WHERE id = ?`).run(
          8000 + index * 1000,
          `2024-0${index + 4}-01`,
          index === 0 ? terminalStatus : 'Adjudicada',
          id,
        );
      });

      setDbForTests(db);
      const result = getFraccionamientoMenores(1000, 2024);
      const recurrent = result.casos.find((item) => item.adjudicatario === 'Empresa Recurrente');

      expect(recurrent).toBeUndefined();
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('uses covered lot_awards for minor-contract adjudication and falls back on partial coverage', () => {
    const db = createGeneratedTestDb(20261003, 2);
    setDbForTests(db);

    try {
      const contracts = ['generated-20261003-1', 'generated-20261003-2'];
      contracts.forEach((id, index) => {
        db.prepare(`
          UPDATE contracts
          SET procedure = 'Contrato menor',
              year = 2024,
              scope = 'Directa Municipal',
              awardee = 'Varios adjudicatarios',
              awardee_nif = NULL,
              awarded_amount = NULL,
              award_amount_type = 'desconocido',
              contracting_authority_id = 'generated-authority-1',
              contracting_authority_name = 'Ayuntamiento de Prueba',
              contract_type = 'Servicios',
              object_description = 'Mantenimiento de instalaciones municipales',
              primary_cpv = '50000000',
              award_date = ?
          WHERE id = ?
        `).run(index === 0 ? '2024-04-01' : '2024-05-01', id);

        db.prepare(`
          INSERT INTO contract_lots (
            id, contract_id, lot_number, lot_name,
            awarded_amount, lot_status, awardee, awardee_nif, award_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `minor-lot-${index + 1}`, id, '1', 'Lote 1',
          8000 + index * 1000, 'Adjudicado', 'Empresa Legacy', 'L11111111',
          index === 0 ? '2024-04-01' : '2024-05-01',
        );

        db.prepare(`
          INSERT INTO contract_lots (
            id, contract_id, lot_number, lot_name,
            awarded_amount, lot_status, awardee, awardee_nif, award_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `minor-fallback-lot-${index + 1}`, id, '3', 'Lote sin adjudicación estructurada',
          11000 + index * 1000, 'Adjudicado', 'Empresa Legacy fallback', 'F11111111',
          index === 0 ? '2024-04-01' : '2024-05-01',
        );

        db.prepare(`
          INSERT INTO contract_lots (
            id, contract_id, lot_number, lot_name,
            awarded_amount, lot_status, awardee, awardee_nif, award_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `minor-cancelled-lot-${index + 1}`, id, '2', 'Lote cancelado',
          5000 + index * 1000, 'Cancelled', 'Empresa Cancelada', 'X11111111',
          index === 0 ? '2024-04-01' : '2024-05-01',
        );

        db.prepare(`
          INSERT INTO lot_awards (
            id, contract_id, case_number, lot_number, award_index,
            awardee, awardee_nif, awarded_amount, award_date, result_state
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `minor-award-${index + 1}`, id, `GEN/2024/${index + 1}`, '1', 0,
          'Empresa Canonica', 'C11111111', 7500 + index * 1000,
          index === 0 ? '2024-04-01' : '2024-05-01', 'Adjudicado',
        );

        db.prepare(`
          INSERT INTO lot_awards (
            id, contract_id, case_number, lot_number, award_index,
            awardee, awardee_nif, awarded_amount, award_date, result_state
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `minor-cancelled-award-${index + 1}`, id, `GEN/2024/${index + 1}`, '2', 1,
          'Empresa Canonica', 'C11111111', 5000 + index * 1000,
          index === 0 ? '2024-04-01' : '2024-05-01', 'Adjudicado',
        );
      });

      const result = getFraccionamientoMenores(1000, 2024);
      const caso = result.casos.find((item) => item.adjudicatario === 'Empresa Canonica' && item.contratoIds?.length === 2);

      expect(caso).toBeDefined();
      expect(caso?.adjudicatario).toBe('Empresa Canonica');
      expect(caso?.suma).toBe(16000);

      const fallbackCase = result.casos.find((item) =>
        item.adjudicatario === 'Empresa Legacy fallback' && item.contratoIds?.length === 2
      );
      expect(fallbackCase?.suma).toBe(23000);
      expect(result.casos.some((item) => item.adjudicatario === 'Empresa Legacy')).toBe(false);

      const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/db.ts'), 'utf8');
      const minorSourceIndex = source.indexOf('const minorSource = hasLotAwardsTable');
      const minorSource = source.slice(
        minorSourceIndex,
        source.indexOf('const menoresRows', minorSourceIndex),
      );
      expect(minorSource).toContain('award.lot_number = ll.lot_number');
      expect(minorSource).toContain("excludeLegacyLotWhenStructuredTerminalResultSql('ll')");
      expect(minorSource).not.toContain('lot_awards_covered');

    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});
