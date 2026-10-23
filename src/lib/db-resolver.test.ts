import { describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { getCorporateProfile, resolveEntityFromDb } from './db-corporate.ts';
import { initDb } from '../../scripts/init-db.js';

describe('DB corporate resolver', () => {
  it('resolves a historical company name from SQLite', () => {
    const db = new DatabaseSync(':memory:');

    db.exec(`
      CREATE TABLE corporate_groups (
        group_id TEXT PRIMARY KEY,
        group_name TEXT NOT NULL,
        associated_nifs_json TEXT NOT NULL,
        scope TEXT,
        description TEXT,
        sede TEXT,
        color TEXT
      );
      CREATE TABLE cif_corrections (raw_cif TEXT PRIMARY KEY, corrected_cif TEXT NOT NULL);
      CREATE TABLE verified_person_mappings (
        person_id TEXT PRIMARY KEY,
        person_name TEXT NOT NULL,
        masked_variants_json TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE corporate_rebrandings (
        cif TEXT PRIMARY KEY,
        current_name TEXT NOT NULL,
        active_divisions_json TEXT NOT NULL DEFAULT '[]',
        previous_names_json TEXT NOT NULL DEFAULT '[]',
        general_reason TEXT NOT NULL,
        type TEXT NOT NULL
      );
      INSERT INTO cif_corrections(raw_cif, corrected_cif) VALUES ('B13567950', 'B13597950');
      INSERT INTO corporate_rebrandings(
        cif, current_name, active_divisions_json, previous_names_json, general_reason, type
      ) VALUES (
        'A80241789',
        'SERVEO SERVICIOS, S.A.U.',
        '[]',
        '[{"nombre":"Ferrovial Servicios S.A.","periodo":"2020 - 2021","motivo":"Cambio de denominación"}]',
        'Reestructuración corporativa',
        'rebranding'
      );
    `);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const resolved = resolveEntityFromDb(db, 'A80241789', 'Ferrovial Servicios S.A.');
    const corrected = resolveEntityFromDb(db, 'B13567950', 'Plus Comunica Alcázar');

    expect(resolved.canonicalCif).toBe('A80241789');
    expect(resolved.canonicalNombre).toBe('SERVEO SERVICIOS, S.A.U.');
    expect(resolved.tipoVinculo).toBe('cambio_denominacion');
    expect(corrected.canonicalCif).toBe('B13597950');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();

    db.close();
  });
});


describe('older corporate group schemas', () => {
  it('loads groups when optional sede/color columns are absent', async () => {
    const db = new DatabaseSync(':memory:');

    db.exec(`
      CREATE TABLE corporate_groups (
        group_id TEXT PRIMARY KEY,
        group_name TEXT NOT NULL,
        associated_nifs_json TEXT NOT NULL,
        scope TEXT,
        description TEXT
      );
      CREATE TABLE corporate_rebrandings (
        cif TEXT PRIMARY KEY,
        current_name TEXT NOT NULL,
        active_divisions_json TEXT NOT NULL DEFAULT '[]',
        previous_names_json TEXT NOT NULL DEFAULT '[]',
        general_reason TEXT NOT NULL,
        type TEXT NOT NULL
      );
      CREATE TABLE cif_corrections (raw_cif TEXT PRIMARY KEY, corrected_cif TEXT NOT NULL);
      CREATE TABLE verified_person_mappings (
        person_id TEXT PRIMARY KEY,
        person_name TEXT NOT NULL,
        masked_variants_json TEXT NOT NULL DEFAULT '[]'
      );
      INSERT INTO corporate_groups(group_id, group_name, associated_nifs_json, scope, description)
      VALUES ('group-1', 'Grupo de prueba', '[\"B12345678\"]', 'Nacional', 'Prueba');
    `);

    const { loadCorporateResolutionCatalog } = await import('./db-corporate.ts');
    const catalog = loadCorporateResolutionCatalog(db);

    expect(catalog.corporateGroups['group-1']).toMatchObject({
      id: 'group-1',
      nombre: 'Grupo de prueba',
      sede: undefined,
      color: undefined,
    });

    db.close();
  });
});


it('counts each contract once in corporate group branches despite multiple lot awards', () => {
  const db = new DatabaseSync(':memory:');
  initDb(db);

  db.exec(`
    INSERT INTO corporate_groups(group_id, group_name, associated_nifs_json, scope, description)
    VALUES ('group-1', 'Grupo de prueba', '[\"B12345678\"]', 'Nacional', 'Prueba');

    INSERT INTO contracts(
      id, case_number, object_description, contracting_authority_name, status,
      award_amount_type, scope
    ) VALUES (
      'contract-1', '1/2026', 'Servicio de prueba', 'Ayuntamiento de Alcázar',
      'Adjudicada', 'total', 'Directa Municipal'
    );

    INSERT INTO contract_lots(
      id, contract_id, case_number, lot_number, awardee, awardee_nif, lot_status
    ) VALUES (
      'lot-1', 'contract-1', '1/2026', '1', 'ACME TEST, S.L.', 'B12345678', 'Adjudicado'
    );

    INSERT INTO lot_awards(
      id, contract_id, case_number, lot_number, award_index, awardee, awardee_nif,
      awarded_amount, result_state
    ) VALUES
      ('award-1', 'contract-1', '1/2026', '1', 0, 'ACME TEST, S.L.', 'B12345678', 40, 'Adjudicado'),
      ('award-2', 'contract-1', '1/2026', '1', 1, 'ACME TEST, S.L.', 'B12345678', 60, 'Adjudicado');

    INSERT INTO company_resolution(
      raw_nif, raw_name, canonical_id, canonical_nif, canonical_name,
      group_id, group_name, link_type, link_reason
    ) VALUES (
      'B12345678', 'ACME TEST, S.L.', 'B12345678', 'B12345678',
      'ACME TEST, S.L.', 'group-1', 'Grupo de prueba', 'grupo_empresarial', 'Prueba'
    );
  `);

  const profile = getCorporateProfile(db, 'group-1');
  const filial = profile.grupoCorporativo?.filiales.find((item) => item.cif === 'B12345678');

  expect(filial).toMatchObject({
    contratos: 1,
    volumen: 100,
  });
  expect(profile.grupoCorporativo?.contratosConsolidadoGrupo).toBe(1);
  expect(profile.grupoCorporativo?.volumenConsolidadoGrupo).toBe(100);

  db.close();
});

it('uses the unified contract source for corporate group filials', async () => {
  const source = readFileSync(new URL('./db-corporate.ts', import.meta.url), 'utf8');
  const groupQuery = source.slice(source.indexOf('const filialesRows = db.prepare'));
  expect(groupQuery).toContain('FROM ${corporateContractSource} l');
  expect(groupQuery).not.toContain('FROM contracts l');
});
