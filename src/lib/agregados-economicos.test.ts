import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, it, expect } from 'vitest';
import { getStats, getOrganismosList, getEmpresaDetail, getDb, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';
import { getCorporateContractSource } from './db-corporate';
import { terminalContractStatusSql } from './contract-status-sql';
import { eligibleAwardResultStateSql } from './lot-status.js';

describe('Aislamiento y Semántica de Agregados Económicos (Issue Commit 4)', () => {
  let stats;
  let organismos;
  let rofeymer;

  beforeAll(() => {
    stats = getStats();
    organismos = getOrganismosList();
    rofeymer = getEmpresaDetail('B02309821');
  });
  it('el volumen económico global solo usa importes de adjudicación conocidos', () => {
    const db = getDb();
    const expected = (db.prepare(`
      SELECT round(sum(
        CASE
          WHEN status NOT IN ('Desierta', 'Anulada')
           AND (award_amount_type IS NULL OR award_amount_type = 'total')
          THEN coalesce(awarded_amount, 0)
          ELSE 0
        END
      ), 2) as s
      FROM contracts
    `).get() as any)?.s || 0;

    expect(stats.totalImporte).toBe(expected);
    expect(
      stats.desgloseAmbito.directa.volumen + stats.desgloseAmbito.mancomunidad.volumen
    ).toBe(expected);
  });

  it('los volúmenes de empresa y organismo no usan PBL como fallback de adjudicación', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/lib/db.ts'), 'utf8');
    expect(source).toContain("coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen_total");
    expect(source).not.toContain("coalesce(l.awarded_amount, l.amount_excl_vat, 0) ELSE 0 END), 2) as volumen_total");
    expect(source).toContain("coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen_menores");
    expect(source).toContain("coalesce(l.awarded_amount, 0) ELSE 0 END), 2) as volumen_mayores");
  });

  it('Test 1: ingresos no son gasto - contratos de ingreso no incrementan gastoAdjudicado', () => {
    
    expect(stats.gastoAdjudicado).toBeGreaterThan(0);
    expect(stats.ingresosAdjudicados).toBeGreaterThan(0);

    const db = getDb();
    const sumIngresos = (db.prepare("SELECT round(sum(CASE WHEN status NOT IN ('Desierta', 'Anulada') AND (award_amount_type IS NULL OR award_amount_type = 'total') THEN coalesce(awarded_amount, 0) ELSE 0 END), 2) as s FROM contracts WHERE economic_nature = 'ingreso'").get() as any)?.s;
    const sumGasto = (db.prepare("SELECT round(sum(CASE WHEN status NOT IN ('Desierta', 'Anulada') AND (award_amount_type IS NULL OR award_amount_type = 'total') THEN coalesce(awarded_amount, 0) ELSE 0 END), 2) as s FROM contracts WHERE economic_nature = 'gasto'").get() as any)?.s;

    expect(stats.ingresosAdjudicados).toBe(sumIngresos);
    expect(stats.gastoAdjudicado).toBe(sumGasto);
    expect(stats.gastoAdjudicado).toBe(sumGasto);
    expect(stats.ingresosAdjudicados).toBe(sumIngresos);
    expect(stats.gastoAdjudicado + stats.ingresosAdjudicados).toBeGreaterThan(stats.gastoAdjudicado);
  });

  it('Test 2: desiertos no son adjudicados - expedientes desiertos no incrementan gastoAdjudicado', () => {
    
    const db = getDb();

    const pblDesiertoGasto = (db.prepare(`
      SELECT round(sum(CASE
        WHEN EXISTS (SELECT 1 FROM contract_lots lot WHERE lot.contract_id = contracts.id)
        THEN (
          SELECT coalesce(sum(CASE
            WHEN (
              ((lower(coalesce(lot.lot_status, '')) LIKE '%desiert%'
                OR lower(coalesce(lot.lot_status, '')) LIKE '%desert%')
                AND NOT EXISTS (
                  SELECT 1 FROM lot_awards valid_award
                  WHERE valid_award.contract_id = lot.contract_id
                    AND valid_award.lot_number = lot.lot_number
                    AND ${eligibleAwardResultStateSql('valid_award')}
                    AND (trim(coalesce(valid_award.awardee, '')) <> '' OR valid_award.awarded_amount IS NOT NULL)
                ))
              OR EXISTS (
                SELECT 1 FROM lot_awards terminal_award
                WHERE terminal_award.contract_id = lot.contract_id
                  AND terminal_award.lot_number = lot.lot_number
                  AND (lower(coalesce(terminal_award.result_state, '')) LIKE '%desiert%'
                    OR lower(coalesce(terminal_award.result_state, '')) LIKE '%desert%')
                  AND lower(coalesce(terminal_award.result_state, '')) NOT LIKE '%provisional%'
                  AND NOT EXISTS (
                    SELECT 1 FROM lot_awards valid_award
                    WHERE valid_award.contract_id = terminal_award.contract_id
                      AND valid_award.lot_number = terminal_award.lot_number
                      AND ${eligibleAwardResultStateSql('valid_award')}
                      AND (trim(coalesce(valid_award.awardee, '')) <> '' OR valid_award.awarded_amount IS NOT NULL)
                  )
              )
            )
            THEN coalesce(lot.budget_excl_vat, lot.amount_excl_vat, 0)
            ELSE 0
          END), 0)
          FROM contract_lots lot WHERE lot.contract_id = contracts.id
        )
        WHEN lower(coalesce(status, '')) LIKE '%desiert%'
          OR lower(coalesce(status, '')) LIKE '%desert%'
        THEN coalesce(amount_excl_vat, 0)
        ELSE 0
      END), 2) as s
      FROM contracts WHERE economic_nature = 'gasto'
    `).get() as any)?.s || 0;
    expect(stats.gastoDesierto).toBe(pblDesiertoGasto);

    const adjudicadoGastoEsperado = (db.prepare(`
      SELECT round(sum(
        CASE
          WHEN economic_nature = 'gasto'
           AND status NOT IN ('Desierta', 'Anulada')
           AND (award_amount_type IS NULL OR award_amount_type = 'total')
          THEN coalesce(awarded_amount, 0)
          ELSE 0
        END
      ), 2) as s
      FROM contracts
    `).get() as any)?.s || 0;

    const adjudicadoDesiertos = (db.prepare(`
      SELECT round(sum(
        CASE
          WHEN economic_nature = 'gasto'
           AND status = 'Desierta'
           AND (award_amount_type IS NULL OR award_amount_type = 'total')
          THEN coalesce(awarded_amount, 0)
          ELSE 0
        END
      ), 2) as s
      FROM contracts
    `).get() as any)?.s || 0;

    expect(stats.gastoAdjudicado).toBe(adjudicadoGastoEsperado);
    expect(adjudicadoDesiertos).toBeGreaterThanOrEqual(0);
    // Si algún expediente desierto tiene awarded_amount, debe quedar fuera del agregado.
    if (adjudicadoDesiertos > 0) {
      expect(stats.gastoAdjudicado).not.toBe(adjudicadoGastoEsperado + adjudicadoDesiertos);
    }
  });

  it('getEmpresaDetail no usa PBL cuando falta el importe adjudicado', () => {
    const testDb = createGeneratedTestDb(20260930, 8);
    setDbForTests(testDb);
    try {
      const candidate = testDb.prepare(`
        SELECT id, awardee_nif, awardee, awarded_amount, amount_excl_vat
        FROM contracts
        WHERE awarded_amount > 0
          AND amount_excl_vat > 0
        ORDER BY id
        LIMIT 1
      `).get() as any;

      expect(candidate).toBeDefined();

      // El fixture generado no trae resolución corporativa; la añadimos de forma
      // explícita para que getEmpresaDetail pueda resolver esta empresa igual que
      // una empresa real del catálogo.
      testDb.exec(`
        CREATE TABLE IF NOT EXISTS company_resolution (
          raw_nif TEXT,
          raw_name TEXT,
          canonical_id TEXT,
          canonical_nif TEXT,
          canonical_name TEXT,
          group_id TEXT,
          group_name TEXT,
          link_type TEXT,
          link_reason TEXT,
          PRIMARY KEY (raw_nif, raw_name)
        );
      `);
      testDb.prepare(`
        INSERT INTO company_resolution
          (raw_nif, raw_name, canonical_id, canonical_nif, canonical_name)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        candidate.awardee_nif,
        candidate.awardee,
        candidate.awardee_nif,
        candidate.awardee_nif,
        candidate.awardee,
      );

      testDb.prepare(`
        UPDATE contracts
        SET status = 'Adjudicada', award_amount_type = 'total', economic_nature = 'gasto'
        WHERE id = ?
      `).run(candidate.id);

      const baseline = getEmpresaDetail(candidate.awardee_nif);
      expect(baseline).not.toBeNull();

      const originalAward = Number(candidate.awarded_amount);
      testDb.prepare('UPDATE contracts SET awarded_amount = NULL WHERE id = ?').run(candidate.id);

      const detail = getEmpresaDetail(candidate.awardee_nif);
      expect(detail).not.toBeNull();

      // Al faltar el importe adjudicado, el contrato aporta 0 al volumen:
      // nunca debe sustituirse por amount_excl_vat (PBL).
      expect(detail!.volumen_total).toBe(
        Math.round((Number(baseline!.volumen_total) - originalAward) * 100) / 100
      );
    } finally {
      setDbForTests(null);
      testDb.close();
    }
  });

  it('Test 3: gasto adjudicado sí cuenta - expedientes de gasto con awarded_amount incrementan gastoAdjudicado', () => {
    
    const db = getDb();
    const row = db.prepare("SELECT id, awarded_amount FROM contracts WHERE economic_nature = 'gasto' AND awarded_amount > 100000 LIMIT 1").get() as any;
    expect(row).toBeDefined();
    expect(row.awarded_amount).toBeGreaterThan(100000);
    expect(stats.gastoAdjudicado).toBeGreaterThan(row.awarded_amount);
  });

  it('Test 4: Rofeymer SL - la agregación de empresa distingue gasto = 0 e ingresos = 251000 de forma puramente derivada', () => {
    
    expect(rofeymer).not.toBeNull();
    expect(rofeymer?.total_contratos).toBe(4);
    expect(rofeymer?.gasto_adjudicado).toBe(0);
    expect(rofeymer?.ingresos_adjudicados).toBe(251000);
    expect(rofeymer?.desgloseMenores?.volumenMayores).toBe(0);
    expect(rofeymer?.volumen_total).toBe(251000);
  });

  it('Organismos calcula independientemente gasto_adjudicado e ingresos_adjudicados', () => {
    
    expect(organismos.length).toBe(10);

    const ayto = organismos.filter((o: any) => o.nif === 'P1300500D');
    expect(ayto).toHaveLength(3);
    const db = getDb();
    const corporateContractSource = getCorporateContractSource(db);
    const expected = db.prepare(`
      SELECT u.contracting_authority_id as authority_id,
        round(sum(CASE WHEN u.economic_nature = 'gasto' AND NOT ${terminalContractStatusSql('u')} AND (u.award_amount_type IS NULL OR u.award_amount_type = 'total') THEN coalesce(u.awarded_amount, 0) ELSE 0 END), 2) as gasto,
        round(sum(CASE WHEN u.economic_nature = 'ingreso' AND NOT ${terminalContractStatusSql('u')} AND (u.award_amount_type IS NULL OR u.award_amount_type = 'total') THEN coalesce(u.awarded_amount, 0) ELSE 0 END), 2) as ingreso
      FROM ${corporateContractSource} u
      GROUP BY u.contracting_authority_id
    `).all() as any[];
    for (const row of [...ayto, organismos.find((o: any) => o.nombre.includes('COMSERMANCHA'))]) {
      expect(row).toBeDefined();
      const exp = expected.find((e: any) => e.authority_id === row.id);
      expect(exp).toBeDefined();
      expect(row.gasto_adjudicado).toBe(exp.gasto);
      expect(row.ingresos_adjudicados).toBe(exp.ingreso);
    }
  });

  it('Los precios unitarios no entran en los agregados económicos', () => {
    const db = getDb();
    const unitarios = (db.prepare("SELECT count(*) as c FROM contracts WHERE award_amount_type = 'unitario'").get() as any)?.c || 0;
    
    if (unitarios > 0) {
      const rawGastoUnitario = (db.prepare("SELECT round(sum(CASE WHEN economic_nature = 'gasto' AND status NOT IN ('Desierta', 'Anulada') THEN coalesce(awarded_amount, 0) ELSE 0 END), 2) as s FROM contracts WHERE award_amount_type = 'unitario'").get() as any)?.s || 0;
      const expectedGasto = (db.prepare("SELECT round(sum(CASE WHEN economic_nature = 'gasto' AND status NOT IN ('Desierta', 'Anulada') AND (award_amount_type IS NULL OR award_amount_type = 'total') THEN coalesce(awarded_amount, 0) ELSE 0 END), 2) as s FROM contracts").get() as any)?.s || 0;
      expect(rawGastoUnitario).toBeGreaterThanOrEqual(0);
      expect(stats.gastoAdjudicado).toBe(expectedGasto);
    }
  });

  it('Verificación final de salidas de funciones clave', () => {
    const s = stats;
    console.log('=== getStats() Snapshot ===');
    console.log(JSON.stringify({
      totalLicitaciones: s.totalLicitaciones,
      gastoAdjudicado: s.gastoAdjudicado,
      ingresosAdjudicados: s.ingresosAdjudicados,
      concesionesAdjudicadas: s.concesionesAdjudicadas,
      gastoDesierto: s.gastoDesierto,
      gastoEnCurso: s.gastoEnCurso,
      desgloseAmbito: s.desgloseAmbito,
      topOrganismos: s.topOrganismos,
    }, null, 2));

    const orgs = organismos;
    console.log('=== getOrganismosList() Snapshot ===');
    console.log(JSON.stringify(orgs.map(o => ({
      nombre: o.nombre,
      gasto_adjudicado: o.gasto_adjudicado,
      ingresos_adjudicados: o.ingresos_adjudicados,
      total_contratos: o.total_contratos,
      volumen_total: o.volumen_total
    })), null, 2));

    
    console.log('=== getEmpresaDetail("B02309821") Snapshot ===');
    console.log(JSON.stringify({
      id: rofeymer?.id,
      nombre: rofeymer?.nombre,
      nif: rofeymer?.nif,
      total_contratos: rofeymer?.total_contratos,
      gasto_adjudicado: rofeymer?.gasto_adjudicado,
      ingresos_adjudicados: rofeymer?.ingresos_adjudicados,
      concesiones_adjudicadas: rofeymer?.concesiones_adjudicadas,
      volumen_total: rofeymer?.volumen_total,
      desgloseMenores: rofeymer?.desgloseMenores
    }, null, 2));
  });
});


describe('Organismos gasto en curso lot-aware', () => {
  it('no cuenta como gasto en curso un lote ya adjudicado en lot_awards', () => {
    const db = createGeneratedTestDb(20261016, 1);
    setDbForTests(db);
    try {
      db.prepare(`
        UPDATE contracts SET status = 'Publicada', award_amount_type = 'total',
          amount_excl_vat = 10000, awarded_amount = NULL, awardee = NULL,
          is_lotized = 1, lot_count = 1, economic_nature = 'gasto'
        WHERE id = 'generated-20261016-1'
      `).run();
      db.prepare(`
        INSERT INTO contract_lots (id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('org-curso-lot-1', 'generated-20261016-1', '1', 10000, null, 'Empresa Adjudicataria', 'Adjudicado');
      db.prepare(`
        INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('org-curso-award-1', 'generated-20261016-1', 'GEN/2026/1', '1', 0, 'Empresa Adjudicataria', 8000, 'Adjudicado');
      const contract = db.prepare(`SELECT contracting_authority_id FROM contracts WHERE id = ?`).get('generated-20261016-1') as any;
      const org = getOrganismosList().find((o: any) => o.id === contract?.contracting_authority_id);
      expect(org?.gasto_adjudicado).toBe(8000);
      expect(org?.gasto_en_curso).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});
