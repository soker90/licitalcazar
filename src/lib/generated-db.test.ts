import { describe, expect, it } from 'vitest';
import { getEmpresaDetail, getEmpresasList, getFilterValues, getLicitacionById, getLicitaciones, searchQuick, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';

describe('database behaviour with generated canonical fixtures', () => {
  it('does not mix related contract records from authorities sharing a display name', () => {
    const db = createGeneratedTestDb(24675, 3);
    db.prepare("UPDATE contracts SET contracting_authority_name = 'Shared Related Authority'").run();
    setDbForTests(db);

    try {
      const detail = getLicitacionById('generated-24675-1') as any;

      expect(detail?.relacionadas.map((contract: any) => contract.id)).toEqual(['generated-24675-3']);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('returns the internal authority ID when no public authority identifier exists', () => {
    const db = createGeneratedTestDb(24676, 1);
    db.prepare("UPDATE contracting_authorities SET placsp_id = NULL").run();
    setDbForTests(db);

    try {
      const detail = getLicitacionById('generated-24676-1') as any;

      expect(detail?.organismoPlacspId).toBeNull();
      expect(detail?.organismoAuthorityId).toBe('generated-authority-1');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('filters contracts by authority ID when authorities share the same display name', () => {
    const db = createGeneratedTestDb(24677, 2);
    db.prepare("UPDATE contracting_authorities SET name = 'Shared Filter Authority'").run();
    db.prepare("UPDATE contracts SET contracting_authority_name = 'Shared Filter Authority'").run();
    setDbForTests(db);

    try {
      const authorities = getFilterValues().organismos;
      expect(authorities).toHaveLength(2);
      expect(authorities.map((authority: any) => authority.authorityId).sort()).toEqual([
        'generated-authority-1',
        'generated-authority-2',
      ]);

      expect(getLicitaciones({ organo: 'generated-authority-1' }).data.map((contract) => contract.id)).toEqual([
        'generated-24677-1',
      ]);
      expect(getLicitaciones({ organo: 'generated-authority-2' }).data.map((contract) => contract.id)).toEqual([
        'generated-24677-2',
      ]);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('keeps same-name authorities separate in quick search without public identifiers', () => {
    const db = createGeneratedTestDb(24678, 2);
    db.prepare("UPDATE contracting_authorities SET name = 'Shared Search Authority', placsp_id = NULL").run();
    db.prepare("UPDATE contracts SET contracting_authority_name = 'Shared Search Authority'").run();
    db.exec('CREATE VIRTUAL TABLE contracts_fts USING fts5(id UNINDEXED, object_description, case_number, awardee, awardee_nif)');
    setDbForTests(db);

    try {
      const authorities = searchQuick('Shared Search Authority').organismos;

      expect(authorities).toHaveLength(2);
      expect(authorities.map((authority) => authority.authorityId).sort()).toEqual([
        'generated-authority-1',
        'generated-authority-2',
      ]);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('keeps contracting authorities with the same name separate in company aggregates', () => {
    const db = createGeneratedTestDb(24679, 2);
    db.prepare(`
      UPDATE contracts
      SET awardee = 'Shared Company', awardee_nif = 'B12345678',
          contracting_authority_name = 'Same Authority Name', status = 'Formalizada'
      WHERE id IN ('generated-24679-1', 'generated-24679-2')
    `).run();
    setDbForTests(db);

    try {
      const detail = getEmpresaDetail('B12345678');
      const company = getEmpresasList({ q: 'Shared Company' }).data[0];

      expect(detail?.organismos_distintos).toBe(2);
      expect(detail?.organismos).toHaveLength(2);
      expect(detail?.organismos.map((authority: any) => authority.authority_key).sort()).toEqual([
        'generated-authority-1',
        'generated-authority-2',
      ]);
      expect(company?.organismos_distintos).toBe(2);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('resolves legacy IDs through TEMP verified metadata when the main table is absent', () => {
    const db = createGeneratedTestDb(20261012, 1);
    const contractId = 'generated-20261012-1';

    db.exec('DROP TABLE verified_contract_metadata');
    setDbForTests(db);
    try {
      db.prepare(`
        INSERT INTO verified_contract_metadata (
          legacy_id, contract_id, explicit_end_date, source, reason
        ) VALUES (?, ?, ?, ?, ?)
      `).run('LEGACY-2020', contractId, '2027-12-31', 'test', 'verified alias');

      expect(getLicitacionById('LEGACY-2020')?.id).toBe(contractId);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('seeds the TEMP lot_awards fallback from legacy contract_lots when the table is absent', () => {
    const db = createGeneratedTestDb(20261011, 1);
    const contractId = 'generated-20261011-1';

    db.exec('DROP TABLE lot_awards');
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        offer_count, award_date, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-lot-award-1',
      contractId,
      'GEN/2026/1',
      '1',
      'Lote legado',
      'Empresa Legada',
      'B12345678',
      1200,
      1452,
      3,
      '2026-10-01',
      'Adjudicado',
    );
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awardee, awarded_amount, lot_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-lot-award-cancelled',
      contractId,
      'GEN/2026/1',
      '2',
      'Lote anulado',
      'Empresa Antigua',
      900,
      'Anulada',
    );

    setDbForTests(db);
    try {
      const fallbackRows = db.prepare(`
        SELECT contract_id, case_number, lot_number, awardee, awardee_nif,
               awarded_amount, awarded_amount_incl_vat, offer_count, result_state
        FROM lot_awards
      `).all() as Array<Record<string, unknown>>;
      const fallback = fallbackRows[0];

      expect(fallbackRows).toHaveLength(1);
      expect(fallback).toMatchObject({
        contract_id: contractId,
        case_number: 'GEN/2026/1',
        lot_number: '1',
        awardee: 'Empresa Legada',
        awardee_nif: 'B12345678',
        awarded_amount: 1200,
        awarded_amount_incl_vat: 1452,
        offer_count: 3,
        result_state: 'Adjudicado',
      });
      expect(db.prepare(`
        SELECT name FROM sqlite_temp_master
        WHERE type = 'table' AND name = 'lot_awards'
      `).get()).toBeDefined();
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('cuenta una sola vez un expediente con varios awards en el detalle de empresa', () => {
    const db = createGeneratedTestDb(24680, 1);

    db.prepare(`
      UPDATE contracts
      SET awardee = 'Empresa Detail', awardee_nif = 'B12345678',
          awarded_amount = NULL, award_amount_type = 'total',
          status = 'Adjudicada'
      WHERE id = 'generated-24680-1'
    `).run();

    db.exec(`
      CREATE TABLE IF NOT EXISTS lot_awards (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        case_number TEXT,
        lot_number TEXT NOT NULL,
        award_index INTEGER NOT NULL,
        awardee TEXT,
        awardee_nif TEXT,
        awarded_amount REAL,
        awarded_amount_incl_vat REAL,
        offer_count INTEGER,
        award_date TEXT,
        result_state TEXT
      );
    `);

    const insertAward = db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
        offer_count, award_date, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAward.run('detail-award-1', 'generated-24680-1', 'GEN/2026/1', '1', 0, 'Empresa Detail', 'B12345678', 600, 726, 1, '2026-01-01', 'Adjudicado');
    insertAward.run('detail-award-2', 'generated-24680-1', 'GEN/2026/1', '1', 1, 'Empresa Detail', 'B12345678', 400, 484, 1, '2026-01-01', 'Adjudicado');

    setDbForTests(db);

    try {
      const detail = getEmpresaDetail('B12345678');
      expect(detail?.organismos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ contratos: 1, volumen: 1000 }),
        ]),
      );
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('usa el importe de lot_awards en el desglose de un lote cuando contract_lots no lo tiene', () => {
    const db = createGeneratedTestDb(20261017, 1);
    setDbForTests(db);

    try {
      const contractId = 'generated-20261017-1';
      db.prepare(`
        UPDATE contracts
        SET awardee = 'Varios adjudicatarios',
            awarded_amount = NULL,
            award_amount_type = 'total',
            is_lotized = 1,
            lot_count = 2,
            status = 'Adjudicada',
            year = 2026
        WHERE id = ?
      `).run(contractId);

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name,
          budget_excl_vat, awarded_amount, lot_status, awardee
        ) VALUES
          (?, ?, ?, ?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'detail-lot-award-fallback-lot-1',
        contractId,
        '1',
        'Lote 1',
        5000,
        null,
        'Adjudicado',
        'Empresa Lote',
        'detail-lot-award-fallback-lot-2',
        contractId,
        '2',
        'Lote 2',
        3000,
        3000,
        'Adjudicado',
        'Otra Empresa',
      );

      db.exec(`
        CREATE TABLE IF NOT EXISTS lot_awards (
          id TEXT PRIMARY KEY,
          contract_id TEXT NOT NULL,
          case_number TEXT,
          lot_number TEXT NOT NULL,
          award_index INTEGER NOT NULL,
          awardee TEXT,
          awardee_nif TEXT,
          awarded_amount REAL,
          awarded_amount_incl_vat REAL,
          offer_count INTEGER,
          award_date TEXT,
          result_state TEXT
        );
      `);

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
          offer_count, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'detail-lot-award-fallback-award',
        contractId,
        'GEN/2026/1',
        '1',
        0,
        'Empresa Lote',
        'B12345678',
        4200,
        5082,
        2,
        'Adjudicado',
      );

      const detail = getLicitacionById(contractId) as any;
      expect(detail?.lotes).toHaveLength(2);
      const lot = detail?.lotes.find((item: any) => item.numeroLote === '1');
      expect(lot?.importeAdjudicacion).toBe(4200);
      expect(lot?.importeAdjConIva).toBe(5082);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('reads canonical contracts without relying on the checked-in production database', () => {
    const db = createGeneratedTestDb(12345, 80);
    setDbForTests(db);

    try {
      const rows = getLicitaciones({ page: 1, limit: 20 });
      expect(rows.data).toHaveLength(20);
      expect(rows.total).toBe(80);

      const detail = getLicitacionById('generated-12345-1');
      expect(detail).not.toBeNull();
      expect(detail?.case_number).toMatch(/^GEN\/\d{4}\/1$/);
      expect(detail?.object_description).toContain('generado');
      expect(detail?.amount_excl_vat).toBeGreaterThan(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('resolves legacy case-number lookup after normalizing whitespace', () => {
    const db = createGeneratedTestDb(12345, 2);
    const original = db.prepare('SELECT id, case_number FROM contracts ORDER BY id LIMIT 1').get() as {
      id: string; case_number: string;
    };
    const variant = `  ${String(original.case_number).replace(/\s+/g, '   ')}  `;
    setDbForTests(db);

    try {
      expect(getLicitacionById(variant)?.id).toBe(original.id);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('does not resolve an ambiguous case number across contracting authorities', () => {
    const db = createGeneratedTestDb(12345, 2);
    setDbForTests(db);

    try {
      const original = db.prepare('SELECT case_number FROM contracts ORDER BY id LIMIT 1').get() as { case_number: string };
      db.prepare(
        'INSERT INTO contracts(id, contracting_authority_id, case_number, status, scope) VALUES (?, ?, ?, ?, ?)'
      ).run('ambiguous-case', 'different-authority', original.case_number, 'Adjudicado', 'Directa Municipal');

      expect(getLicitacionById(original.case_number)).toBeNull();
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('still resolves a unique case number through the compatibility fallback', () => {
    const db = createGeneratedTestDb(54321, 2);
    setDbForTests(db);

    try {
      const original = db.prepare('SELECT id, case_number FROM contracts ORDER BY id LIMIT 1').get() as { id: string; case_number: string };
      const detail = getLicitacionById(original.case_number);
      expect(detail?.id).toBe(original.id);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('does not mix lots from another authority sharing the same case number', () => {
    const db = createGeneratedTestDb(78901, 2);
    setDbForTests(db);

    try {
      const original = db.prepare('SELECT id, case_number, contracting_authority_id FROM contracts ORDER BY id LIMIT 1').get() as {
        id: string; case_number: string; contracting_authority_id: string;
      };
      const otherId = 'other-lots-authority';
      db.prepare(
        'INSERT INTO contracts(id, contracting_authority_id, placsp_id, case_number, status, scope) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(otherId, 'different-authority', 'placsp-other-lots', original.case_number, 'Adjudicado', 'Directa Municipal');
      db.prepare(
        'INSERT INTO contract_lots(id, contract_id, case_number, lot_number, lot_name) VALUES (?, ?, ?, ?, ?)'
      ).run('other-lot-1', otherId, original.case_number, '99', 'Lote de otro organismo');

      const detail = getLicitacionById(original.id);
      expect(detail).not.toBeNull();
      expect((detail as any)?.lotes?.some((lot: any) => lot.nombreLote === 'Lote de otro organismo')).toBe(false);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('does not mix modifications from another authority sharing the same case number', () => {
    const db = createGeneratedTestDb(67890, 2);
    setDbForTests(db);

    try {
      const original = db.prepare('SELECT id, case_number, contracting_authority_id FROM contracts ORDER BY id LIMIT 1').get() as {
        id: string; case_number: string; contracting_authority_id: string;
      };
      db.prepare(
        'INSERT INTO contracts(id, contracting_authority_id, placsp_id, case_number, object_description, status, scope) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run('other-authority-contract', 'other-authority', 'PLACSP-OTHER', original.case_number, 'Otro contrato', 'Adjudicada', 'Directa Municipal');

      db.prepare(
        'INSERT INTO modifications(id, contract_id, case_number, modification_number, reason) VALUES (?, ?, ?, ?, ?)'
      ).run('mod-other', 'other-authority-contract', original.case_number, 1, 'Modificación de otro organismo');

      const detail = getLicitacionById(original.id);
      expect(detail).not.toBeNull();
      expect(detail?.modificadosInfo.modifications).toHaveLength(0);
      expect(detail?.modificadosInfo.totalModificaciones).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('does not mix documents from another authority sharing the same case number', async () => {
    const db = createGeneratedTestDb(67891, 2);
    setDbForTests(db);

    try {
      const original = db.prepare('SELECT id, case_number FROM contracts ORDER BY id LIMIT 1').get() as {
        id: string; case_number: string;
      };
      db.prepare(
        'INSERT INTO contracts(id, contracting_authority_id, placsp_id, case_number, object_description, status, scope) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run('other-authority-document-contract', 'other-authority', 'PLACSP-OTHER-DOC', original.case_number, 'Otro contrato', 'Adjudicada', 'Directa Municipal');

      db.prepare(
        'INSERT INTO contract_documents(id, contract_id, case_number, title, source_url) VALUES (?, ?, ?, ?, ?)'
      ).run('other-doc', 'other-authority-document-contract', original.case_number, 'Documento de otro organismo', 'https://example.test/other-doc');

      const { getDocumentosForContract } = await import('./db');
      const documents = getDocumentosForContract(original.id);
      expect(documents).toHaveLength(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('excludes awards linked to English terminal lots from the listing amount and awardee', () => {
    const db = createGeneratedTestDb(20261032, 1);
    const contractId = 'generated-20261032-1';
    setDbForTests(db);

    try {
      db.prepare(`
        UPDATE contracts
        SET year = 2026,
            scope = 'Directa Municipal',
            procedure = 'Abierto',
            status = 'Adjudicada',
            award_amount_type = 'total',
            awarded_amount = NULL,
            awardee = 'Varios adjudicatarios',
            is_lotized = 1,
            lot_count = 2
        WHERE id = ?
      `).run(contractId);
      db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(contractId);
      db.prepare('DELETE FROM lot_awards WHERE contract_id = ?').run(contractId);

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          awarded_amount, awardee, lot_status
        ) VALUES
          ('listing-active-lot', ?, 'GEN/2026/32', '1', 'Lote activo', 100, 'Empresa Activa', 'Adjudicado'),
          ('listing-cancelled-lot', ?, 'GEN/2026/32', '2', 'Lote cancelado', 200, 'Empresa Cancelada', 'Cancelled')
      `).run(contractId, contractId);

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awarded_amount, result_state
        ) VALUES
          ('listing-active-award', ?, 'GEN/2026/32', '1', 0, 'Empresa Activa', 90, 'Adjudicado'),
          ('listing-cancelled-award', ?, 'GEN/2026/32', '2', 0, 'Empresa Cancelada', 180, 'Adjudicado')
      `).run(contractId, contractId);

      const withinAwardedAmount = getLicitaciones({ year: 2026, maxImporte: 100, limit: 100 });
      expect(withinAwardedAmount.data.some((row: any) => row.id === contractId)).toBe(true);

      const cancelledAwardee = getLicitaciones({ year: 2026, awardee: 'Empresa Cancelada', limit: 100 });
      expect(cancelledAwardee.data.some((row: any) => row.id === contractId)).toBe(false);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('does not expose structured awards linked to English terminal lots in contract detail', () => {
    const db = createGeneratedTestDb(20261033, 1);
    const contractId = 'generated-20261033-1';
    setDbForTests(db);

    try {
      db.prepare(`
        UPDATE contracts
        SET year = 2026,
            status = 'Adjudicada',
            award_amount_type = 'total',
            awarded_amount = NULL,
            awardee = 'Varios adjudicatarios',
            is_lotized = 1,
            lot_count = 2
        WHERE id = ?
      `).run(contractId);
      db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(contractId);
      db.prepare('DELETE FROM lot_awards WHERE contract_id = ?').run(contractId);

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          awarded_amount, awardee, lot_status
        ) VALUES
          ('detail-active-lot', ?, 'GEN/2026/33', '1', 'Lote activo', 100, 'Empresa Activa', 'Adjudicado'),
          ('detail-cancelled-lot', ?, 'GEN/2026/33', '2', 'Lote cancelado', 200, 'Empresa Cancelada', 'Cancelled')
      `).run(contractId, contractId);

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awarded_amount, result_state
        ) VALUES
          ('detail-active-award', ?, 'GEN/2026/33', '1', 0, 'Empresa Activa', 90, 'Adjudicado'),
          ('detail-cancelled-award', ?, 'GEN/2026/33', '2', 0, 'Empresa Cancelada', 180, 'Adjudicado')
      `).run(contractId, contractId);

      const detail = getLicitacionById(contractId) as any;
      const activeLot = detail?.lotes.find((lot: any) => lot.numeroLote === '1');
      const cancelledLot = detail?.lotes.find((lot: any) => lot.numeroLote === '2');

      expect(activeLot?.adjudicaciones).toHaveLength(1);
      expect(activeLot?.adjudicaciones[0]?.importeAdjudicacion).toBe(90);
      expect(cancelledLot?.adjudicaciones).toHaveLength(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('excludes English terminal lot awards from quick search amount and awardee matching', () => {
    const db = createGeneratedTestDb(20261035, 1);
    const contractId = 'generated-20261035-1';
    setDbForTests(db);

    try {
      db.prepare(`
        UPDATE contracts
        SET case_number = 'GEN/2026/35',
            year = 2026,
            status = 'Adjudicada',
            award_amount_type = 'total',
            awarded_amount = NULL,
            awardee = 'Varios adjudicatarios',
            is_lotized = 1,
            lot_count = 2
        WHERE id = ?
      `).run(contractId);
      db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(contractId);
      db.prepare('DELETE FROM lot_awards WHERE contract_id = ?').run(contractId);

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, case_number, lot_number, lot_name,
          awarded_amount, awardee, lot_status
        ) VALUES
          ('quick-active-lot', ?, 'GEN/2026/35', '1', 'Lote activo', 100, 'Empresa Activa', 'Adjudicado'),
          ('quick-cancelled-lot', ?, 'GEN/2026/35', '2', 'Lote cancelado', 200, 'Empresa Cancelada', 'Cancelled')
      `).run(contractId, contractId);

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awarded_amount, result_state
        ) VALUES
          ('quick-active-award', ?, 'GEN/2026/35', '1', 0, 'Empresa Activa', 90, 'Adjudicado'),
          ('quick-cancelled-award', ?, 'GEN/2026/35', '2', 0, 'Empresa Cancelada', 180, 'Adjudicado')
      `).run(contractId, contractId);

      db.exec('CREATE VIRTUAL TABLE contracts_fts USING fts5(id UNINDEXED, content)');
      db.prepare('INSERT INTO contracts_fts (id, content) VALUES (?, ?)').run(contractId, 'GEN/2026/35');

      const byCaseNumber = searchQuick('GEN/2026/35');
      const contract = byCaseNumber.contracts.find((row: any) => row.id === contractId);
      expect(contract?.amount).toBe(90);

      const byCancelledAwardee = searchQuick('Empresa Cancelada');
      expect(byCancelledAwardee.contracts.some((row: any) => row.id === contractId)).toBe(false);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('produces different but reproducible datasets from different seeds', () => {
    const first = createGeneratedTestDb(1, 20);
    const second = createGeneratedTestDb(2, 20);

    try {
      const a = first.prepare('SELECT amount_excl_vat, awardee FROM contracts ORDER BY id').all();
      const b = second.prepare('SELECT amount_excl_vat, awardee FROM contracts ORDER BY id').all();
      expect(a).not.toEqual(b);
    } finally {
      first.close();
      second.close();
    }
  });

  it('aplica filtros de importe y baja cero usando adjudicaciones de lotes', () => {
    const db = createGeneratedTestDb(24680, 80);
    setDbForTests(db);

    try {
      const contract = db.prepare("SELECT id FROM contracts WHERE id = 'generated-24680-1'").get() as { id: string };
      db.prepare(`
        UPDATE contracts
        SET awarded_amount = NULL,
            award_amount_type = 'total',
            awardee = 'Varios adjudicatarios',
            amount_excl_vat = 9000,
            offer_count = 2,
            procedure = 'Abierto',
            status = 'Adjudicada',
            year = 2026
        WHERE id = ?
      `).run(contract.id);
      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name, budget_excl_vat,
          awarded_amount, lot_status, awardee
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('generated-filter-lot-1', contract.id, '1', 'Lote 1', 3000, 3000, 'Adjudicado', 'Empresa A');
      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name, budget_excl_vat,
          awarded_amount, lot_status, awardee
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('generated-filter-lot-2', contract.id, '2', 'Lote 2', 5000, 5000, 'Adjudicado', 'Empresa B');

      expect(getLicitaciones({ minImporte: 7900, year: 2026, limit: 100 }).data.some((r: any) => r.id === contract.id)).toBe(true);
      expect(getLicitaciones({ minImporte: 8100, year: 2026, limit: 100 }).data.some((r: any) => r.id === contract.id)).toBe(false);
      expect(getLicitaciones({ maxImporte: 8000, year: 2026, limit: 100 }).data.some((r: any) => r.id === contract.id)).toBe(true);
      expect(getLicitaciones({ maxImporte: 7900, year: 2026, limit: 100 }).data.some((r: any) => r.id === contract.id)).toBe(false);
      expect(getLicitaciones({ bajaCero: true, year: 2026, limit: 100 }).data.some((r: any) => r.id === contract.id)).toBe(true);
      expect(getLicitaciones({ conAlertas: true, year: 2026, limit: 100 }).data.some((r: any) => r.id === contract.id)).toBe(true);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it.each(['Anulada', 'Cancelled', 'Desierta', 'Deserted'])(
    'does not match terminal parent %s residuals in award alert filters',
    (status) => {
      const db = createGeneratedTestDb(24682, 1);
      setDbForTests(db);
      try {
        db.prepare(`
          UPDATE contracts
          SET status = ?,
              procedure = 'Abierto',
              dataset = 'licitaciones',
              year = 2026,
              award_amount_type = 'total',
              amount_excl_vat = 10000,
              awarded_amount = 10000,
              awardee = 'Empresa residual',
              offer_count = 1,
              is_lotized = 0
          WHERE id = 'generated-24682-1'
        `).run(status);

        expect(getLicitaciones({ ofertaUnica: true, year: 2026, limit: 100 }).data.some((row: any) => row.id === 'generated-24682-1')).toBe(false);
        expect(getLicitaciones({ bajaCero: true, year: 2026, limit: 100 }).data.some((row: any) => row.id === 'generated-24682-1')).toBe(false);
      } finally {
        setDbForTests(null);
        db.close();
      }
    }
  );

  it('muestra en búsqueda rápida el importe adjudicado de lotes', () => {
    const db = createGeneratedTestDb(97531, 80);
    setDbForTests(db);

    try {
      const contract = db.prepare("SELECT id, case_number FROM contracts WHERE id = 'generated-97531-1'").get() as { id: string; case_number: string };
      db.prepare(`
        UPDATE contracts
        SET awarded_amount = NULL,
            award_amount_type = 'total',
            awardee = 'Varios adjudicatarios',
            status = 'Adjudicada',
            year = 2026
        WHERE id = ?
      `).run(contract.id);
      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name, budget_excl_vat,
          awarded_amount, lot_status, awardee
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('generated-search-lot-1', contract.id, '1', 'Lote 1', 3000, 3000, 'Adjudicado', 'Empresa A');
      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name, budget_excl_vat,
          awarded_amount, lot_status, awardee
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('generated-search-lot-2', contract.id, '2', 'Lote 2', 5000, 5000, 'Adjudicado', 'Empresa B');

      db.exec(`
        CREATE VIRTUAL TABLE contracts_fts USING fts5(
          id UNINDEXED, case_number, object_description, contracting_authority_name, awardee
        );
        INSERT INTO contracts_fts(id, case_number, object_description, contracting_authority_name, awardee)
        SELECT id, case_number, object_description, contracting_authority_name, awardee FROM contracts;
      `);
      const result = searchQuick(contract.case_number);
      const match = result.contracts.find((item) => item.id === contract.id);
      expect(match?.amount).toBe(8000);
      expect(match?.amount_label).toBe('Importe adjudicado');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });


  it.each(['Anulada', 'Cancelled', 'Desierta', 'Deserted'])(
    'shows PBL instead of residual award amount in quick search for %s contracts',
    (status) => {
      const db = createGeneratedTestDb(97532, 80);
      setDbForTests(db);

      try {
        const contract = db.prepare(
          "SELECT id, case_number FROM contracts WHERE id = 'generated-97532-1'"
        ).get() as { id: string; case_number: string };
        db.prepare(`
          UPDATE contracts
          SET amount_excl_vat = 100000,
              awarded_amount = 85000,
              award_amount_type = 'total',
              awardee = 'Empresa residual',
              award_date = '2026-09-01',
              status = ?,
              year = 2026
          WHERE id = ?
        `).run(status, contract.id);

        db.exec(`
          CREATE VIRTUAL TABLE contracts_fts USING fts5(
            id UNINDEXED, case_number, object_description, contracting_authority_name, awardee
          );
          INSERT INTO contracts_fts(id, case_number, object_description, contracting_authority_name, awardee)
          SELECT id, case_number, object_description, contracting_authority_name, awardee FROM contracts;
        `);

        const result = searchQuick(contract.case_number);
        const match = result.contracts.find((item) => item.id === contract.id);
        expect(match?.amount).toBe(100000);
        expect(match?.amount_label).toBe('Presupuesto base');
      } finally {
        setDbForTests(null);
        db.close();
      }
    }
  );

  it('muestra en búsqueda rápida el volumen real de lotes para organismos', () => {
    const db = createGeneratedTestDb(86420, 80);
    setDbForTests(db);

    try {
      const contract = db.prepare("SELECT id FROM contracts WHERE id = 'generated-86420-1'").get() as { id: string };
      db.prepare(`
        UPDATE contracts
        SET contracting_authority_name = 'Organismo Lotes Test',
            awarded_amount = 9000,
            award_amount_type = 'total',
            awardee = 'Varios adjudicatarios',
            is_lotized = 1,
            status = 'Adjudicada',
            year = 2026
        WHERE id = ?
      `).run(contract.id);
      db.prepare(`
        UPDATE contracting_authorities
        SET name = 'Organismo Lotes Test'
        WHERE id = (SELECT contracting_authority_id FROM contracts WHERE id = ?)
      `).run(contract.id);
      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name, budget_excl_vat,
          awarded_amount, lot_status, awardee
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('generated-org-search-lot-1', contract.id, '1', 'Lote 1', 3000, 3000, 'Adjudicado', 'Empresa A');
      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name, budget_excl_vat,
          awarded_amount, lot_status, awardee
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('generated-org-search-lot-2', contract.id, '2', 'Lote 2', 5000, 5000, 'Adjudicado', 'Empresa B');

      db.exec(`
        CREATE VIRTUAL TABLE contracts_fts USING fts5(
          id UNINDEXED, case_number, object_description, contracting_authority_name, awardee
        );
        INSERT INTO contracts_fts(id, case_number, object_description, contracting_authority_name, awardee)
        SELECT id, case_number, object_description, contracting_authority_name, awardee FROM contracts;
      `);
      const result = searchQuick('Organismo Lotes Test');
      const organismo = result.organismos.find((item) => item.nombre === 'Organismo Lotes Test');
      expect(organismo?.volumen).toBe(8000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });


  it('incluye expedientes relacionados cuando el adjudicatario solo aparece en lotes', () => {
    const db = createGeneratedTestDb(86422, 80);
    setDbForTests(db);

    try {
      const contract = db.prepare("SELECT id FROM contracts WHERE id = 'generated-86422-1'").get() as { id: string };
      const related = db.prepare("SELECT id FROM contracts WHERE id = 'generated-86422-2'").get() as { id: string };

      db.prepare(`
        UPDATE contracts
        SET awardee = 'Varios adjudicatarios',
            awardee_nif = NULL,
            awarded_amount = 9000,
            award_amount_type = 'total',
            is_lotized = 1,
            status = 'Adjudicada'
        WHERE id = ?
      `).run(contract.id);

      db.prepare(`
        UPDATE contracts
        SET awardee = 'Otra Empresa',
            awardee_nif = 'B99999999',
            awarded_amount = 700,
            award_amount_type = 'total',
            status = 'Adjudicada'
        WHERE id = ?
      `).run(related.id);

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name, budget_excl_vat,
          awarded_amount, lot_status, awardee, awardee_nif
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('generated-related-lot-1', contract.id, '1', 'Lote 1', 3000, 3000, 'Adjudicado', 'Empresa A', 'B12345678');

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name, budget_excl_vat,
          awarded_amount, lot_status, awardee, awardee_nif
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('generated-related-lot-2-source', contract.id, '2', 'Lote 2', 4000, 4000, 'Adjudicado', 'Empresa B', 'B87654321');

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name, budget_excl_vat,
          awarded_amount, lot_status, awardee, awardee_nif
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('generated-related-lot-2', related.id, '1', 'Lote 1', 1200, 1200, 'Adjudicado', 'Empresa A', 'B12345678');

      const detail = getLicitacionById(contract.id) as any;
      const empresaA = detail?.lotesAdjudicatariosInfo?.find((item: any) => item.awardee === 'Empresa A');
      expect(empresaA?.relacionadas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: related.id,
            awarded_amount: 1200,
          }),
        ]),
      );
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('usa el importe de lot_awards en el listado principal', () => {
    const db = createGeneratedTestDb(20261004, 1);
    setDbForTests(db);

    try {
      const contract = db.prepare("SELECT id FROM contracts WHERE id = 'generated-20261004-1'").get() as { id: string };
      db.prepare("UPDATE contracts SET awardee = 'Empresa Principal', awarded_amount = 9000, award_amount_type = 'total', is_lotized = 1, status = 'Adjudicada', year = 2026 WHERE id = ?").run(contract.id);
      db.prepare("INSERT INTO contract_lots (id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee) VALUES (?, ?, ?, ?, ?, ?, ?)").run('generated-list-lot-source-1', contract.id, '1', 'Lote 1', 9000, 'Adjudicado', 'Empresa Principal');
      db.prepare("INSERT INTO contract_lots (id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee) VALUES (?, ?, ?, ?, ?, ?, ?)").run('generated-list-lot-source-2', contract.id, '2', 'Lote 2', 3000, 'Adjudicado', 'Empresa Secundaria');
      db.prepare("INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run('generated-list-lot-award-1', contract.id, 'GEN/2024/1', '1', 0, 'Empresa Principal', 1000, 'Adjudicado');

      // A partial lot_awards snapshot must not replace the complete contract_lots amount.
      expect(getLicitaciones({ minImporte: 11000, year: 2026, limit: 100 }).data.some((item: any) => item.id === contract.id)).toBe(true);
      expect(getLicitaciones({ minImporte: 12001, year: 2026, limit: 100 }).data.some((item: any) => item.id === contract.id)).toBe(false);

      db.prepare("INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run('generated-list-lot-award-2', contract.id, 'GEN/2024/1', '2', 0, 'Empresa Secundaria', 2000, 'Adjudicado');

      // Once coverage is complete, lot_awards becomes the canonical amount source.
      expect(getLicitaciones({ minImporte: 2999, maxImporte: 3001, year: 2026, limit: 100 }).data.some((item: any) => item.id === contract.id)).toBe(true);
      expect(getLicitaciones({ minImporte: 3001, year: 2026, limit: 100 }).data.some((item: any) => item.id === contract.id)).toBe(false);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });


  it('detecta baja cero con el PBL de los lotes cuando la adjudicación solo existe en lot_awards', () => {
    const db = createGeneratedTestDb(20261013, 1);
    setDbForTests(db);

    try {
      const contract = db.prepare("SELECT id FROM contracts WHERE id = 'generated-20261013-1'").get() as { id: string };
      db.prepare(`
        UPDATE contracts
        SET awardee = 'Varios adjudicatarios',
            awardee_nif = NULL,
            amount_excl_vat = 15000,
            awarded_amount = NULL,
            award_amount_type = 'total',
            is_lotized = 1,
            lot_count = 2,
            status = 'Adjudicada',
            procedure = 'Abierto',
            year = 2026
        WHERE id = ?
      `).run(contract.id);

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name,
          budget_excl_vat, awarded_amount, lot_status, awardee
        ) VALUES
          ('baja-cero-pbl-lot-1', ?, '1', 'Lote 1', 4000, NULL, 'Adjudicado', 'Empresa A'),
          ('baja-cero-pbl-lot-2', ?, '2', 'Lote 2', 6000, NULL, 'Adjudicado', 'Empresa B')
      `).run(contract.id, contract.id);

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awarded_amount, result_state
        ) VALUES
          ('baja-cero-pbl-award-1', ?, 'GEN/2026/1', '1', 0, 'Empresa A', 4000, 'Adjudicado'),
          ('baja-cero-pbl-award-2', ?, 'GEN/2026/1', '2', 0, 'Empresa B', 6000, 'Adjudicado')
      `).run(contract.id, contract.id);

      expect(getLicitaciones({ bajaCero: true, year: 2026, limit: 100 }).data.some((item: any) => item.id === contract.id)).toBe(true);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('incluye adjudicatarios secundarios de lot_awards y usa su importe de adjudicación', () => {
    const db = createGeneratedTestDb(86423, 80);
    setDbForTests(db);

    try {
      const contract = db.prepare("SELECT id FROM contracts WHERE id = 'generated-86423-1'").get() as { id: string };
      db.prepare("UPDATE contracts SET awardee = 'Empresa Principal', awarded_amount = 9000, award_amount_type = 'total', is_lotized = 1, status = 'Adjudicada', year = 2026 WHERE id = ?").run(contract.id);
      db.prepare("INSERT INTO contract_lots (id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee) VALUES (?, ?, ?, ?, ?, ?, ?)").run('generated-related-lot-awards-source', contract.id, '1', 'Lote 1', 3000, 'Adjudicado', 'Empresa Principal');
      db.prepare("INSERT INTO contract_lots (id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee) VALUES (?, ?, ?, ?, ?, ?, ?)").run('generated-lot-awards-secondary-lot', contract.id, '2', 'Lote 2', 4000, 'Adjudicado', 'Empresa Secundaria');
      db.prepare("INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awardee, awardee_nif, awarded_amount, result_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run('generated-lot-award-source', contract.id, 'GEN/2024/1', '2', 0, 'Empresa Secundaria', 'B33333333', 4000, 'Adjudicado');

      const detail = getLicitacionById(contract.id) as any;
      const empresa = detail?.lotesAdjudicatariosInfo?.find((item: any) => item.awardee === 'Empresa Secundaria');
      expect(empresa).toBeDefined();
      expect(empresa?.stats).toEqual({ totalContratos: 1, volumenTotal: 4000 });
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('calcula las estadisticas de adjudicatarios por lotes', () => {
    const db = createGeneratedTestDb(86421, 80);
    setDbForTests(db);

    try {
      const contract = db.prepare("SELECT id FROM contracts WHERE id = 'generated-86421-1'").get() as { id: string };
      const otherContract = db.prepare("SELECT id FROM contracts WHERE id = 'generated-86421-2'").get() as { id: string };
      db.prepare(`
        UPDATE contracts
        SET awardee = 'Varios adjudicatarios',
            awardee_nif = NULL,
            awarded_amount = 9000,
            award_amount_type = 'total',
            is_lotized = 1,
            status = 'Adjudicada'
        WHERE id = ?
      `).run(contract.id);
      db.prepare(`
        UPDATE contracts
        SET awardee = 'Empresa A',
            awarded_amount = 700,
            award_amount_type = 'total',
            status = 'Adjudicada'
        WHERE id = ?
      `).run(otherContract.id);
      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name, budget_excl_vat,
          awarded_amount, lot_status, awardee
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('generated-company-stats-lot-1', contract.id, '1', 'Lote 1', 3000, 3000, 'Adjudicado', 'Empresa A');
      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name, budget_excl_vat,
          awarded_amount, lot_status, awardee
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('generated-company-stats-lot-2', contract.id, '2', 'Lote 2', 5000, 5000, 'Adjudicado', 'Empresa B');

      const detail = getLicitacionById(contract.id) as any;
      const empresaA = detail?.lotesAdjudicatariosInfo?.find((item: any) => item.awardee === 'Empresa A');
      expect(empresaA?.stats).toEqual({ totalContratos: 2, volumenTotal: 3700 });
    } finally {
      setDbForTests(null);
      db.close();
    }
  });


  it('no filtra por un lot_awards parcial hasta que cubre todos los lotes adjudicados', () => {
    const db = createGeneratedTestDb(20261006, 1);
    setDbForTests(db);

    try {
      const contract = db.prepare("SELECT id FROM contracts WHERE id = 'generated-20261006-1'").get() as { id: string };
      db.prepare("UPDATE contracts SET awardee = 'Varios adjudicatarios', awardee_nif = NULL, awarded_amount = 9000, award_amount_type = 'total', is_lotized = 1, status = 'Adjudicada', year = 2026 WHERE id = ?").run(contract.id);
      db.prepare("INSERT INTO contract_lots (id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee, awardee_nif) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run('generated-awardee-filter-lot-1', contract.id, '1', 'Lote 1', 3000, 'Adjudicado', 'Empresa Lote A', 'B11111111');
      db.prepare("INSERT INTO contract_lots (id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee, awardee_nif) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run('generated-awardee-filter-lot-2', contract.id, '2', 'Lote 2', 5000, 'Adjudicado', 'Empresa Lote B', 'B22222222');
      db.prepare("INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awardee, awardee_nif, awarded_amount, result_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run('generated-awardee-filter-award-1', contract.id, 'GEN/2024/1', '1', 0, 'Empresa Parcial', 'B33333333', 1000, 'Adjudicado');

      expect(getLicitaciones({ awardee: 'Empresa Parcial', limit: 100 }).data.some((item: any) => item.id === contract.id)).toBe(false);
      expect(getLicitaciones({ awardee: 'Empresa Lote A', limit: 100 }).data.some((item: any) => item.id === contract.id)).toBe(true);
      expect(getLicitaciones({ nif: 'B33333333', limit: 100 }).data.some((item: any) => item.id === contract.id)).toBe(false);

      db.prepare("INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awardee, awardee_nif, awarded_amount, result_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run('generated-awardee-filter-award-2', contract.id, 'GEN/2024/1', '2', 0, 'Empresa Parcial', 'B33333333', 2000, 'Adjudicado');

      expect(getLicitaciones({ awardee: 'Empresa Parcial', limit: 100 }).data.some((item: any) => item.id === contract.id)).toBe(true);
      expect(getLicitaciones({ nif: 'B33333333', limit: 100 }).data.some((item: any) => item.id === contract.id)).toBe(true);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('busca por texto en el listado de licitaciones', () => {
    const db = createGeneratedTestDb(20261016, 1);
    db.prepare(`UPDATE contracts SET awardee = 'Empresa Busqueda', year = 2026 WHERE id = 'generated-20261016-1'`).run();
    db.exec(`CREATE VIRTUAL TABLE contracts_fts USING fts5(id UNINDEXED, object_description, case_number, contracting_authority_name, awardee)`);
    db.exec(`INSERT INTO contracts_fts(id, object_description, case_number, contracting_authority_name, awardee) SELECT id, object_description, case_number, contracting_authority_name, awardee FROM contracts`);
    setDbForTests(db);

    try {
      const result = getLicitaciones({ q: 'Empresa Busqueda', year: 2026, limit: 100 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe('generated-20261016-1');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

});

describe('searchQuick importes lot-aware', () => {
  it('usa lot_awards cuando cubre todos los lotes y no el importe legado de contract_lots', () => {
    const db = createGeneratedTestDb(20261008, 1);
    db.prepare(`
      UPDATE contracts
      SET status = 'Adjudicada',
          procedure = 'Abierto',
          award_amount_type = 'total',
          awarded_amount = 9000,
          awardee = 'Varios adjudicatarios',
          is_lotized = 1,
          lot_count = 2
      WHERE id = 'generated-20261008-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('search-quick-award-lot-1', 'generated-20261008-1', '1', 6000, 5000, 'Empresa Lote 1', 'Adjudicado'),
        ('search-quick-award-lot-2', 'generated-20261008-1', '2', 4000, 4000, 'Empresa Lote 2', 'Adjudicado')
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, result_state
      ) VALUES
        ('search-quick-award-1', 'generated-20261008-1', 'GEN/2026/1', '1', 0, 'Empresa Award 1', 1500, 'Adjudicado'),
        ('search-quick-award-2', 'generated-20261008-1', 'GEN/2026/1', '2', 0, 'Empresa Award 2', 2500, 'Adjudicado')
    `).run();

    db.exec(`CREATE VIRTUAL TABLE contracts_fts USING fts5(id UNINDEXED, object_description, case_number, awardee, awardee_nif)`);
    setDbForTests(db);
    try {
      const result = searchQuick('Empresa Award 1');
      const match = result.contracts.find((item) => item.id === 'generated-20261008-1');
      expect(match?.amount).toBe(4000);
      expect(match?.amount_label).toBe('Importe adjudicado');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});


describe('searchQuick agregados lot-aware', () => {
  it('no cuenta varios lot_awards como contratos y usa sus importes para organismos', () => {
    const db = createGeneratedTestDb(20261009, 1);
    db.prepare(`
      UPDATE contracts
      SET status = 'Adjudicada',
          procedure = 'Abierto',
          award_amount_type = 'total',
          awarded_amount = 9000,
          awardee = 'Varios adjudicatarios',
          contracting_authority_name = 'Organismo Search Test',
          is_lotized = 1,
          lot_count = 2
      WHERE id = 'generated-20261009-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('search-quick-aggregate-lot-1', 'generated-20261009-1', '1', 6000, 5000, 'Empresa Search Test', 'Adjudicado'),
        ('search-quick-aggregate-lot-2', 'generated-20261009-1', '2', 4000, 4000, 'Empresa Search Test', 'Adjudicado')
    `).run();

    db.prepare(`
      UPDATE contracting_authorities
      SET name = 'Organismo Search Test'
      WHERE id = (SELECT contracting_authority_id FROM contracts WHERE id = 'generated-20261009-1')
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, result_state
      ) VALUES
        ('search-quick-aggregate-award-1', 'generated-20261009-1', 'GEN/2026/2', '1', 0, 'Empresa Search Test', 1500, 'Adjudicado'),
        ('search-quick-aggregate-award-2', 'generated-20261009-1', 'GEN/2026/2', '2', 0, 'Empresa Search Test', 2500, 'Adjudicado')
    `).run();

    db.exec(`CREATE VIRTUAL TABLE contracts_fts USING fts5(id UNINDEXED, object_description, case_number, awardee, awardee_nif)`);
    setDbForTests(db);
    try {
      const empresa = searchQuick('Empresa Search Test').empresas.find((item) => item.nombre === 'Empresa Search Test');
      expect(empresa?.contratos).toBe(1);
      expect(empresa?.volumen).toBe(4000);

      const organismo = searchQuick('Organismo Search Test').organismos.find((item) => item.nombre === 'Organismo Search Test');
      expect(organismo?.contratos).toBe(1);
      expect(organismo?.volumen).toBe(4000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});


describe('getLicitaciones baja cero lot-aware', () => {
  it('incluye contratos lotizados cuyo adjudicatario solo figura en el lote', () => {
    const db = createGeneratedTestDb(20261008, 1);

    db.prepare(`
      UPDATE contracts
      SET status = 'Adjudicada',
          procedure = 'Abierto',
          award_amount_type = 'total',
          awarded_amount = NULL,
          awardee = NULL,
          amount_excl_vat = 1000,
          is_lotized = 1,
          lot_count = 1
      WHERE id = 'generated-20261008-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, lot_number, budget_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('baja-cero-lot-1', 'generated-20261008-1', '1', 1000, 1000, NULL, 'Adjudicado')
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, result_state
      ) VALUES
        ('baja-cero-award-1', 'generated-20261008-1', 'GEN/2026/1', '1', 0, 'Empresa Lote', 1000, 'Adjudicado')
    `).run();

    setDbForTests(db);
    try {
      const result = getLicitaciones({ bajaCero: true, limit: 20 });
      expect(result.total).toBe(1);
      expect(result.data[0]?.id).toBe('generated-20261008-1');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});
