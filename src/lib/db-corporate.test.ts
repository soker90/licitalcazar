import { afterEach, describe, expect, it } from 'vitest';
import { createGeneratedTestDb } from './test-db';
import { getCorporateProfile, refreshCorporateResolutionTable } from './db-corporate';

describe('corporate awarded volume', () => {
  const databases: ReturnType<typeof createGeneratedTestDb>[] = [];

  afterEach(() => {
    for (const db of databases.splice(0)) db.close();
  });

  it('excludes deserted lots regardless of status casing when lot_awards is unavailable', () => {
    const db = createGeneratedTestDb(31015, 1);
    databases.push(db);
    db.exec("DROP TABLE lot_awards");
    db.exec(`
      UPDATE contracts
      SET awardee = 'Adjudicatario de cabecera', awardee_nif = 'B00000015',
          award_amount_type = 'total', is_lotized = 1
      WHERE id = 'generated-31015-1'
    `);
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'lot-desierto-15', 'generated-31015-1', 'GEN/2020/15', '1',
      'Lote desierto', 5000, 'Empresa Desierta', 'B00000016', 'LOTE DESIERTO',
    );

    refreshCorporateResolutionTable(db);
    const profile = getCorporateProfile(db, 'B00000016');

    expect(profile.denominacionesRegistradas).toHaveLength(0);
  });

  it('excludes deserted legacy lots when lot_awards is only a partial snapshot', () => {
    const db = createGeneratedTestDb(31017, 1);
    databases.push(db);
    db.exec(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          award_amount_type = 'total', is_lotized = 1
      WHERE id = 'generated-31017-1'
    `);

    const insertLot = db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertLot.run('lot-active-covered-17', 'generated-31017-1', 'GEN/2020/17', '1',
      'Lote cubierto', 4000, 'Empresa Cubierta', 'B00000017', 'Adjudicado');
    insertLot.run('lot-active-uncovered-17', 'generated-31017-1', 'GEN/2020/17', '2',
      'Lote no cubierto', 5000, 'Empresa No Cubierta', 'B00000018', 'Adjudicado');
    insertLot.run('lot-desierto-partial-17', 'generated-31017-1', 'GEN/2020/17', '3',
      'Lote desierto', 6000, 'Empresa Desierta Parcial', 'B00000019', 'LOTE DESIERTO');

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('lot-award-covered-17', 'generated-31017-1', 'GEN/2020/17', '1', 0,
      'Empresa Award', 'B00000020', 3000, 'Adjudicado');

    refreshCorporateResolutionTable(db);
    const profile = getCorporateProfile(db, 'B00000019');

    expect(profile.denominacionesRegistradas).toHaveLength(0);
  });

  it('ignores pre-award results in corporate profiles and volumes', () => {
    const db = createGeneratedTestDb(31031, 1);
    databases.push(db);
    const contractId = 'generated-31031-1';
    db.exec(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          awarded_amount = NULL, awarded_amount_incl_vat = NULL,
          award_amount_type = 'total', is_lotized = 1, lot_count = 1
      WHERE id = '${contractId}'
    `);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awarded_amount_incl_vat, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('corporate-pre-award-lot', contractId, 'GEN/2024/31', '1',
      'Lote único', 1000, 1210, 'Empresa adjudicada', 'B00000031', 'Adjudicado');

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('corporate-pre-award-result', contractId, 'GEN/2024/31', '1', 0,
      'Licitador mejor valorado', 'B00000032', 900, 1089, 'BEST_RATED_TENDERER');

    refreshCorporateResolutionTable(db);
    const awardedCompany = getCorporateProfile(db, 'B00000031');
    const preAwardCompany = getCorporateProfile(db, 'B00000032');

    expect(awardedCompany.denominacionesRegistradas).toHaveLength(1);
    expect(awardedCompany.denominacionesRegistradas[0]?.volumen).toBe(1000);
    expect(preAwardCompany.denominacionesRegistradas).toHaveLength(0);
  });

  it('does not resurrect legacy company amounts after a structured CANCELLED result', () => {
    const db = createGeneratedTestDb(31032, 1);
    databases.push(db);
    const contractId = 'generated-31032-1';
    db.exec(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          awarded_amount = NULL, award_amount_type = 'total', is_lotized = 1
      WHERE id = '${contractId}'
    `);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'lot-structured-cancelled-residual', contractId, 'GEN/2026/32', '1',
      'Lote cancelado en resultado estructurado', 6000, 'Empresa residual', 'B00000032', 'Adjudicado',
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'award-structured-cancelled-residual', contractId, 'GEN/2026/32', '1', 0,
      null, null, 6000, 'CANCELLED',
    );

    refreshCorporateResolutionTable(db);
    const profile = getCorporateProfile(db, 'B00000032');

    expect(profile.denominacionesRegistradas).toHaveLength(0);
  });

  it('excludes structured awards that point to cancelled legacy lots', () => {
    const db = createGeneratedTestDb(31020, 1);
    databases.push(db);
    db.exec(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          awarded_amount = NULL, award_amount_type = 'total', is_lotized = 1
      WHERE id = 'generated-31020-1'
    `);

    const insertLot = db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertLot.run('lot-active-20', 'generated-31020-1', 'GEN/2020/20', '1',
      'Lote activo', 100, 'Empresa Activa', 'B00000018', 'Adjudicado');
    insertLot.run('lot-cancelled-20', 'generated-31020-1', 'GEN/2020/20', '2',
      'Lote cancelado', 200, 'Empresa Cancelada', 'B00000019', 'Cancelado');

    const insertAward = db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAward.run('award-active-20', 'generated-31020-1', 'GEN/2020/20', '1', 0,
      'Empresa Activa', 'B00000018', 100, 'Adjudicado');
    insertAward.run('award-cancelled-20', 'generated-31020-1', 'GEN/2020/20', '2', 0,
      'Empresa Cancelada', 'B00000019', 200, 'Adjudicado');

    refreshCorporateResolutionTable(db);

    expect(getCorporateProfile(db, 'B00000018').denominacionesRegistradas[0]?.volumen).toBe(100);
    expect(getCorporateProfile(db, 'B00000019').denominacionesRegistradas).toHaveLength(0);
  });

  it('excludes English annulled lots from corporate profiles and award volume', () => {
    const db = createGeneratedTestDb(31021, 1);
    databases.push(db);
    const contractId = 'generated-31021-1';

    db.prepare(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          awarded_amount = NULL, awarded_amount_incl_vat = NULL,
          award_amount_type = 'total', is_lotized = 1, lot_count = 2
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awarded_amount_incl_vat, lot_status, awardee, awardee_nif
      ) VALUES
        ('corporate-annulled-active', ?, 'GEN/2024/21', '1', 'Lote vigente', 1000, 1210, 'Adjudicado', 'Empresa Vigente', 'B00000021'),
        ('corporate-annulled-terminal', ?, 'GEN/2024/21', '2', 'Lote anulado', 200, 242, 'Annulled', 'Empresa Anulada', 'B00000022')
    `).run(contractId, contractId);

    refreshCorporateResolutionTable(db);
    const activeCompany = getCorporateProfile(db, 'B00000021');
    const annulledCompany = getCorporateProfile(db, 'B00000022');

    expect(activeCompany.denominacionesRegistradas).toHaveLength(1);
    expect(activeCompany.denominacionesRegistradas[0]?.volumen).toBe(1000);
    expect(annulledCompany.denominacionesRegistradas).toHaveLength(0);
  });

  it('excludes cancelled legacy lots from corporate award volume', () => {
    const db = createGeneratedTestDb(31018, 1);
    databases.push(db);
    db.exec("DROP TABLE lot_awards");
    db.exec(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          award_amount_type = 'total', is_lotized = 1
      WHERE id = 'generated-31018-1'
    `);

    const insertLot = db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertLot.run('lot-active-18', 'generated-31018-1', 'GEN/2020/18', '1',
      'Lote adjudicado', 100, 'Empresa Activa', 'B00000018', 'Adjudicado');
    insertLot.run('lot-cancelled-18', 'generated-31018-1', 'GEN/2020/18', '2',
      'Lote cancelado', 200, 'Empresa Cancelada', 'B00000019', 'Cancelado');

    refreshCorporateResolutionTable(db);

    const active = getCorporateProfile(db, 'B00000018');
    const cancelled = getCorporateProfile(db, 'B00000019');
    expect(active.denominacionesRegistradas[0].volumen).toBe(100);
    expect(cancelled.denominacionesRegistradas).toHaveLength(0);
  });

  it('does not use the PBL when a normal contract has no awarded amount', () => {
    const db = createGeneratedTestDb(31001, 2);
    databases.push(db);
    db.exec(`
      UPDATE contracts
      SET awardee = 'Empresa Volumen', awardee_nif = 'B00000001',
          award_amount_type = 'total',
          amount_excl_vat = CASE id WHEN 'generated-31001-1' THEN 12000 ELSE 14000 END,
          awarded_amount = CASE id WHEN 'generated-31001-1' THEN 10000 ELSE NULL END
    `);

    const profile = getCorporateProfile(db, 'B00000001');

    expect(profile.denominacionesRegistradas).toHaveLength(1);
    expect(profile.denominacionesRegistradas[0].volumen).toBe(10000);
    expect(profile.dnisRegistrados[0].volumen).toBe(10000);
  });

  it('excludes unit amounts from corporate awarded volume', () => {
    const db = createGeneratedTestDb(31002, 2);
    databases.push(db);
    db.exec(`
      UPDATE contracts
      SET awardee = 'Empresa Unitaria', awardee_nif = 'B00000002',
          award_amount_type = CASE id WHEN 'generated-31002-1' THEN 'total' ELSE 'unitario' END,
          amount_excl_vat = 14000,
          awarded_amount = 10000
    `);

    const profile = getCorporateProfile(db, 'B00000002');

    expect(profile.denominacionesRegistradas[0].volumen).toBe(10000);
  });

  it('uses awarded amounts from lots and excludes lot PBLs', () => {
    const db = createGeneratedTestDb(31003, 1);
    databases.push(db);
    db.exec(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          award_amount_type = 'total', is_lotized = 1
    `);
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, budget_incl_vat, awarded_amount, awardee, awardee_nif
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('lot-1', 'generated-31003-1', 'GEN/2020/1', '1', 'Adjudicado', 7000, 8470, 5000, 'Empresa Lotes', 'B00000003');
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, budget_incl_vat, awarded_amount, awardee, awardee_nif
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('lot-2', 'generated-31003-1', 'GEN/2020/1', '2', 'Sin adjudicar', 9000, 10890, null, 'Empresa Lotes', 'B00000003');

    const profile = getCorporateProfile(db, 'B00000003');

    expect(profile.denominacionesRegistradas[0].totalContratos).toBe(1);
    expect(profile.denominacionesRegistradas[0].volumen).toBe(5000);
  });

  it('uses awarded lots when a lotized parent names a different lead awardee', () => {
    const db = createGeneratedTestDb(31006, 1);
    databases.push(db);
    db.exec(`UPDATE contracts
      SET awardee = 'Adjudicatario cabecera', awardee_nif = 'B00000006',
          award_amount_type = 'total', is_lotized = 1`);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      budget_excl_vat, awarded_amount, awardee, awardee_nif, lot_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('lot-6-a', 'generated-31006-1', 'GEN/2020/1', '1', 'Lote A', 5000, 4000, 'Empresa Lote A', 'B00000007', 'Adjudicado');
    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      budget_excl_vat, awarded_amount, awardee, awardee_nif, lot_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('lot-6-b', 'generated-31006-1', 'GEN/2020/1', '2', 'Lote B', 7000, 6000, 'Empresa Lote B', 'B00000008', 'Adjudicado');

    refreshCorporateResolutionTable(db);

    const lead = getCorporateProfile(db, 'B00000006');
    const lotA = getCorporateProfile(db, 'B00000007');
    const lotB = getCorporateProfile(db, 'B00000008');

    expect(lead.denominacionesRegistradas).toHaveLength(0);
    expect(lotA.denominacionesRegistradas[0].volumen).toBe(4000);
    expect(lotB.denominacionesRegistradas[0].volumen).toBe(6000);
  });
  it('includes secondary lot awardees in corporate profiles', () => {
    const db = createGeneratedTestDb(31007, 1);
    databases.push(db);
    db.exec(`
      UPDATE contracts
      SET awardee = 'Adjudicatario cabecera', awardee_nif = 'B00000009',
          award_amount_type = 'total', is_lotized = 1;

    `);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        budget_excl_vat, awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'lot-7',
      'generated-31007-1',
      'GEN/2020/1',
      '1',
      'Lote compartido',
      12000,
      9000,
      'Adjudicatario cabecera',
      'B00000009',
      'Adjudicado',
    );

    const insertAward = db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        award_date, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAward.run(
      'lot-award-7-0',
      'generated-31007-1',
      'GEN/2020/1',
      '1',
      0,
      'Empresa Secundaria A',
      'B00000010',
      4000,
      4840,
      '2026-01-10',
      'Adjudicado',
    );
    insertAward.run(
      'lot-award-7-1',
      'generated-31007-1',
      'GEN/2020/1',
      '1',
      1,
      'Empresa Secundaria B',
      'B00000011',
      5000,
      6050,
      '2026-01-10',
      'Adjudicado',
    );

    refreshCorporateResolutionTable(db);

    const secondaryA = getCorporateProfile(db, 'B00000010');
    const secondaryB = getCorporateProfile(db, 'B00000011');
    const lead = getCorporateProfile(db, 'B00000009');

    expect(secondaryA.denominacionesRegistradas[0].totalContratos).toBe(1);
    expect(secondaryA.denominacionesRegistradas[0].volumen).toBe(4000);
    expect(secondaryB.denominacionesRegistradas[0].totalContratos).toBe(1);
    expect(secondaryB.denominacionesRegistradas[0].volumen).toBe(5000);
    expect(lead.denominacionesRegistradas).toHaveLength(0);
  });

  it('mantiene contract_lots cuando lot_awards solo cubre parte de los lotes', () => {
    const db = createGeneratedTestDb(31008, 1);
    databases.push(db);
    db.exec(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          award_amount_type = 'total', is_lotized = 1
    `);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      awarded_amount, awardee, awardee_nif, lot_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'lot-8-a', 'generated-31008-1', 'GEN/2020/1', '1', 'Lote A',
      5000, 'Empresa Lote A', 'B00000012', 'Adjudicado'
    );
    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      awarded_amount, awardee, awardee_nif, lot_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'lot-8-b', 'generated-31008-1', 'GEN/2020/1', '2', 'Lote B',
      6000, 'Empresa Lote B', 'B00000013', 'Adjudicado'
    );

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awardee_nif, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'lot-award-8-0', 'generated-31008-1', 'GEN/2020/1', '1', 0,
      'Empresa Award', 'B00000012', 4000, 'Adjudicado'
    );



    refreshCorporateResolutionTable(db);

    const lotA = getCorporateProfile(db, 'B00000012');
    const lotB = getCorporateProfile(db, 'B00000013');

    expect(lotA.denominacionesRegistradas[0].volumen).toBe(5000);
    expect(lotB.denominacionesRegistradas[0].volumen).toBe(6000);
  });


  it('conserva el importe de contract_lots cuando lot_awards solo aporta el adjudicatario', () => {
    const db = createGeneratedTestDb(31011, 1);
    databases.push(db);

    db.exec(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          award_amount_type = 'total',
          is_lotized = 1
      WHERE id = 'generated-31011-1'
    `);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'lot-11',
      'generated-31011-1',
      'GEN/2020/1',
      '1',
      'Lote con importe',
      5000,
      'Empresa Importe',
      'B00000021',
      'Adjudicado',
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'lot-award-11',
      'generated-31011-1',
      'GEN/2020/1',
      '1',
      0,
      'Empresa Importe',
      'B00000021',
      null,
      'Adjudicado',
    );

    refreshCorporateResolutionTable(db);

    const profile = getCorporateProfile(db, 'B00000021');
    expect(profile.denominacionesRegistradas[0].volumen).toBe(5000);
  });

  it('uses lot_awards when duplicate lot rows still cover all distinct lots', () => {
    const db = createGeneratedTestDb(31009, 1);
    databases.push(db);
    db.exec(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          award_amount_type = 'total', is_lotized = 1
    `);

    const insertLot = db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      awarded_amount, awardee, awardee_nif, lot_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertLot.run('lot-9-a', 'generated-31009-1', 'GEN/2020/1', '1', 'Lote A', 5000, 'Empresa Lote A', 'B00000014', 'Adjudicado');
    insertLot.run('lot-9-b', 'generated-31009-1', 'GEN/2020/1', '2', 'Lote B', 6000, 'Empresa Lote B', 'B00000015', 'Adjudicado');
    insertLot.run('lot-9-b-duplicate', 'generated-31009-1', 'GEN/2020/1', '2', 'Lote B duplicado', 6000, 'Empresa Lote B', 'B00000015', 'Adjudicado');

    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awardee_nif, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertAward.run('lot-award-9-a', 'generated-31009-1', 'GEN/2020/1', '1', 0, 'Empresa Award A', 'B00000014', 4000, 'Adjudicado');
    insertAward.run('lot-award-9-b', 'generated-31009-1', 'GEN/2020/1', '2', 0, 'Empresa Award B', 'B00000015', 3500, 'Adjudicado');

    const profile = getCorporateProfile(db, 'B00000014');
    expect(profile.denominacionesRegistradas[0].volumen).toBe(4000);
  });

  it('keeps resolution refresh volume consistent with the corporate profile', () => {
    const db = createGeneratedTestDb(31004, 2);
    databases.push(db);
    db.exec(`
      UPDATE contracts
      SET awardee = 'Empresa Resolución', awardee_nif = 'B00000004',
          award_amount_type = 'total',
          amount_excl_vat = CASE id WHEN 'generated-31004-1' THEN 12000 ELSE 14000 END,
          awarded_amount = CASE id WHEN 'generated-31004-1' THEN 10000 ELSE NULL END
    `);

    refreshCorporateResolutionTable(db);
    const resolution = db.prepare(`
      SELECT volumen FROM (
        SELECT coalesce(awardee_nif, '') AS raw_nif,
               sum(CASE WHEN award_amount_type IS NULL OR award_amount_type = 'total' THEN coalesce(awarded_amount, 0) ELSE 0 END) AS volumen
        FROM contracts GROUP BY coalesce(awardee_nif, '')
      ) WHERE raw_nif = 'B00000004'
    `).get() as { volumen: number };
    const profile = getCorporateProfile(db, 'B00000004');

    expect(resolution.volumen).toBe(10000);
    expect(profile.denominacionesRegistradas[0].volumen).toBe(resolution.volumen);
  });

  it('does not include lot PBLs in consolidated group volume', () => {
    const db = createGeneratedTestDb(31005, 1);
    databases.push(db);
    db.exec(`
      INSERT INTO corporate_groups(group_id, group_name, associated_nifs_json, scope, description)
      VALUES ('group-test', 'Grupo de prueba', '["B00000005"]', 'Nacional', 'Prueba');
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          award_amount_type = 'total', is_lotized = 1
    `);
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, budget_excl_vat,
        budget_incl_vat, awarded_amount, awardee, awardee_nif
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('lot-group-1', 'generated-31005-1', 'GEN/2020/1', '1', 9000, 10890, 5000, 'Empresa Grupo', 'B00000005');
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, budget_excl_vat,
        budget_incl_vat, awarded_amount, awardee, awardee_nif
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('lot-group-2', 'generated-31005-1', 'GEN/2020/1', '2', 11000, 13310, null, 'Empresa Grupo', 'B00000005');

    const profile = getCorporateProfile(db, 'B00000005');

    expect(profile.grupoCorporativo?.volumenConsolidadoGrupo).toBe(5000);
  });

it('cuenta un contrato una sola vez aunque tenga varios adjudicatarios en el mismo lote', () => {
    const db = createGeneratedTestDb(31010, 1);
    databases.push(db);

    db.exec(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          award_amount_type = 'total', is_lotized = 1
      WHERE id = 'generated-31010-1'
    `);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      awarded_amount, awardee, awardee_nif, lot_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'lot-10', 'generated-31010-1', 'GEN/2020/1', '1', 'Lote compartido',
      1000, 'Empresa Multiganadora', 'B00000020', 'Adjudicado'
    );

    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awardee_nif, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    insertAward.run(
      'lot-award-10-0', 'generated-31010-1', 'GEN/2020/1', '1', 0,
      'Empresa Multiganadora', 'B00000020', 400, 'Adjudicado'
    );
    insertAward.run(
      'lot-award-10-1', 'generated-31010-1', 'GEN/2020/1', '1', 1,
      'Empresa Multiganadora', 'B00000020', 600, 'Adjudicado'
    );

    refreshCorporateResolutionTable(db);

    const profile = getCorporateProfile(db, 'B00000020');

    expect(profile.denominacionesRegistradas[0].totalContratos).toBe(1);
    expect(profile.denominacionesRegistradas[0].volumen).toBe(1000);
  
  });


  it('usa lot_awards cuando contract_lots no tiene adjudicatario', () => {
    const db = createGeneratedTestDb(31012, 1);
    databases.push(db);

    db.exec(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios', awardee_nif = NULL,
          award_amount_type = 'total', is_lotized = 1
      WHERE id = 'generated-31012-1'
    `);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      awarded_amount, awardee, awardee_nif, lot_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'lot-12', 'generated-31012-1', 'GEN/2020/1', '1',
      'Lote sin adjudicatario en contract_lots', null, null, null, 'Adjudicado',
    );

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awardee_nif, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'lot-award-12', 'generated-31012-1', 'GEN/2020/1', '1', 0,
      'Empresa Award', 'B00000022', 7000, 'Adjudicado',
    );

    refreshCorporateResolutionTable(db);

    const profile = getCorporateProfile(db, 'B00000022');

    expect(profile.denominacionesRegistradas).toHaveLength(1);
    expect(profile.denominacionesRegistradas[0].totalContratos).toBe(1);
    expect(profile.denominacionesRegistradas[0].volumen).toBe(7000);
  });


  it('usa el adjudicatario de lot_awards cuando contract_lots solo aporta el importe', () => {
    const db = createGeneratedTestDb(31013, 1);
    databases.push(db);

    db.exec(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          award_amount_type = 'total',
          is_lotized = 1
      WHERE id = 'generated-31013-1'
    `);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'lot-13',
      'generated-31013-1',
      'GEN/2020/1',
      '1',
      'Lote con importe sin adjudicatario',
      5000,
      null,
      null,
      'Adjudicado',
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'lot-award-13',
      'generated-31013-1',
      'GEN/2020/1',
      '1',
      0,
      'Empresa Award',
      'B00000023',
      null,
      'Adjudicado',
    );

    refreshCorporateResolutionTable(db);

    const profile = getCorporateProfile(db, 'B00000023');

    expect(profile.denominacionesRegistradas).toHaveLength(1);
    expect(profile.denominacionesRegistradas[0].totalContratos).toBe(1);
    expect(profile.denominacionesRegistradas[0].volumen).toBe(5000);
  });


  it('conserva el NIF de contract_lots cuando lot_awards no lo aporta', () => {
    const db = createGeneratedTestDb(31014, 1);
    databases.push(db);

    db.exec(`
      UPDATE contracts
      SET awardee = 'Varios adjudicatarios',
          awardee_nif = NULL,
          award_amount_type = 'total',
          is_lotized = 1
      WHERE id = 'generated-31014-1'
    `);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, awardee, awardee_nif, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'lot-14', 'generated-31014-1', 'GEN/2020/1', '1',
      'Lote con NIF legacy', 5000, 'Empresa Award', 'B00000024', 'Adjudicado',
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'lot-award-14', 'generated-31014-1', 'GEN/2020/1', '1', 0,
      'Empresa Award', null, 5000, 'Adjudicado',
    );

    refreshCorporateResolutionTable(db);

    const profile = getCorporateProfile(db, 'B00000024');

    expect(profile.denominacionesRegistradas).toHaveLength(1);
    expect(profile.denominacionesRegistradas[0].cif).toBe('B00000024');
    expect(profile.denominacionesRegistradas[0].totalContratos).toBe(1);
    expect(profile.denominacionesRegistradas[0].volumen).toBe(5000);
  });

});