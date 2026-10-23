import { describe, expect, it } from 'vitest';
import { getDb, getEmpresaDetail, getEmpresasList } from './db';
import { getOpaqueEmpresaId as getSourceOpaqueEmpresaId } from './corporate';
import {
  getDniSalt,
  getOpaqueEmpresaId as getTsOpaqueEmpresaId,
  isOpaquePersonaFisicaId,
  isPersonaFisicaNif,
  normalizeFiscalId,
  sanitizeNifForStorage,
} from './nif-privacy';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cjsModule = require('../../scripts/nif-privacy.js') as {
  getDniSalt: () => string;
  getOpaqueEmpresaId: (nifOrId: string | null | undefined, nombre?: string | null) => string;
  isOpaquePersonaFisicaId: (value: string | null | undefined) => boolean;
  isPersonaFisicaNif: (value: string | null | undefined) => boolean;
  normalizeFiscalId: (value: string | null | undefined) => string;
  sanitizeNifForStorage: (value: string | null | undefined) => string;
};

describe('Privacidad de identificadores fiscales en la BD versionada', () => {
  it('comparte una única fuente de verdad idéntica entre TypeScript y CommonJS', () => {
    expect(typeof getTsOpaqueEmpresaId).toBe('function');
    expect(typeof cjsModule.getOpaqueEmpresaId).toBe('function');
    expect(typeof normalizeFiscalId).toBe('function');
    expect(typeof cjsModule.normalizeFiscalId).toBe('function');
    expect(typeof isOpaquePersonaFisicaId).toBe('function');
    expect(typeof cjsModule.isOpaquePersonaFisicaId).toBe('function');
    expect(isOpaquePersonaFisicaId('pf-123456789abc')).toBe(true);
    expect(cjsModule.isOpaquePersonaFisicaId('pf-123456789abc')).toBe(true);
    expect(isOpaquePersonaFisicaId('B12345678')).toBe(false);

    const testId = '12345670A';
    const tsResult = getTsOpaqueEmpresaId(testId);
    const cjsResult = cjsModule.getOpaqueEmpresaId(testId);
    expect(tsResult).toBe(cjsResult);
    expect(getSourceOpaqueEmpresaId(testId)).toBe(tsResult);
  });

  it('normaliza canónicamente formatos equivalentes con espacios, guiones y puntos al mismo pf-*', () => {
    const rawVariants = [
      '12345670A',
      ' 12345670a ',
      '12.345.670-A',
      '12-345-670 A',
      '12 345 670 - a',
      'ES-12345670-A',
    ];

    const hashes = rawVariants.map((v) => getTsOpaqueEmpresaId(v));
    const firstHash = hashes[0];

    expect(firstHash).toMatch(/^pf-[a-f0-9]{12}$/);
    for (const h of hashes) {
      expect(h).toBe(firstHash);
    }

    const nieVariants = ['X1234567B', ' x-1234567-b ', 'x.1234567.b', 'ES-X1234567-B'];
    const nieHashes = nieVariants.map((v) => getTsOpaqueEmpresaId(v));
    expect(nieHashes[0]).toMatch(/^pf-[a-f0-9]{12}$/);
    for (const h of nieHashes) {
      expect(h).toBe(nieHashes[0]);
    }
  });

  it('garantiza determinismo absoluto en la generación de hash HMAC', () => {
    const dummyA = '98765432B';
    const hash1 = getTsOpaqueEmpresaId(dummyA);
    const hash2 = getTsOpaqueEmpresaId(dummyA);
    const hash3 = cjsModule.getOpaqueEmpresaId(dummyA);

    expect(hash1).toBe(hash2);
    expect(hash1).toBe(hash3);
    expect(hash1).toMatch(/^pf-[a-f0-9]{12}$/);
  });

  it('nunca realiza rehash de identificadores que ya tengan formato pf-*', () => {
    const existingOpaque = 'pf-123456789abc';
    const uppercaseOpaque = 'PF-123456789ABC';
    const paddedOpaque = '  pf-123456789abc  ';

    expect(getTsOpaqueEmpresaId(existingOpaque)).toBe(existingOpaque);
    expect(getTsOpaqueEmpresaId(uppercaseOpaque)).toBe(existingOpaque);
    expect(getTsOpaqueEmpresaId(paddedOpaque)).toBe(existingOpaque);
    expect(getSourceOpaqueEmpresaId(existingOpaque)).toBe(existingOpaque);
    expect(cjsModule.getOpaqueEmpresaId(existingOpaque)).toBe(existingOpaque);
    expect(sanitizeNifForStorage(existingOpaque)).toBe(existingOpaque);
    expect(normalizeFiscalId(existingOpaque)).toBe(existingOpaque);
    expect(normalizeFiscalId(uppercaseOpaque)).toBe(existingOpaque);

    // Multiple nested passes must remain completely immutable
    const triplePass = getTsOpaqueEmpresaId(getTsOpaqueEmpresaId(getTsOpaqueEmpresaId(existingOpaque)));
    expect(triplePass).toBe(existingOpaque);
  });

  it('conserva identificadores de personas jurídicas (CIF) intactos sin convertirlos en IDs opacos', () => {
    const corporateCifs = ['B12345678', 'A82003815', 'Q1300001A', 'U13999888', 'F13221429'];
    for (const cif of corporateCifs) {
      expect(getTsOpaqueEmpresaId(cif)).toBe(cif);
      expect(getSourceOpaqueEmpresaId(cif)).toBe(cif);
      expect(cjsModule.getOpaqueEmpresaId(cif)).toBe(cif);
      expect(isPersonaFisicaNif(cif)).toBe(false);
    }
  });

  it('no conserva NIF/NIE físicos en claro en ninguna tabla de la base de datos', () => {
    const db = getDb();
    const clearPhysicalCount = (db.prepare(`
      SELECT COUNT(*) AS count
      FROM (
        SELECT awardee_nif AS nif FROM contracts
        UNION ALL
        SELECT awardee_nif AS nif FROM contract_lots
        UNION ALL
        SELECT awardee_nif AS nif FROM lot_awards
        UNION ALL
        SELECT beneficiary_nif AS nif FROM grants
        UNION ALL
        SELECT raw_nif AS nif FROM company_resolution
        UNION ALL
        SELECT canonical_nif AS nif FROM company_resolution
        UNION ALL
        SELECT canonical_id AS nif FROM company_resolution
      )
      WHERE nif IS NOT NULL
        AND trim(nif) <> ''
        AND instr(nif, '*') = 0
        AND nif NOT LIKE 'pf-%'
        AND (nif GLOB '[0-9]*' OR nif GLOB '[XYZxyz][0-9]*' OR nif LIKE 'ES%')
    `).get() as { count: number }).count;

    expect(clearPhysicalCount).toBe(0);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM lot_awards WHERE awardee_nif LIKE 'pf-%'`).get() as { count: number }).toBeDefined();
  });

  it('agrupa en una única ficha una persona anonimizada con varios contratos', () => {
    const db = getDb();
    const candidate = db.prepare(`
      SELECT awardee_nif AS opaque_id, COUNT(*) AS contracts
      FROM contracts
      WHERE awardee_nif LIKE 'pf-%'
      GROUP BY awardee_nif
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 1
    `).get() as { opaque_id: string; contracts: number } | undefined;

    expect(candidate?.opaque_id).toMatch(/^pf-[a-f0-9]{12}$/);

    const detail = getEmpresaDetail(candidate!.opaque_id);
    const list = getEmpresasList({ q: candidate!.opaque_id, limit: 100 });

    expect(detail).not.toBeNull();
    expect(detail?.total_contratos).toBe(candidate?.contracts);
    expect(list.data.filter((item: { id: string }) => item.id === candidate?.opaque_id)).toHaveLength(1);
  });

  it('verifica que BD, listado y ficha usan EXACTAMENTE el mismo ID en el caso de regresión de 9 contratos', () => {
    const db = getDb();
    const regressionId = 'pf-99990aba23d3';

    // 1. Capa BD
    const bdRows = db.prepare(`
      SELECT awardee_nif, COUNT(*) AS total
      FROM contracts
      WHERE awardee_nif = ?
      GROUP BY awardee_nif
    `).get(regressionId) as { awardee_nif: string; total: number } | undefined;

    expect(bdRows).toBeDefined();
    expect(bdRows?.awardee_nif).toBe(regressionId);
    expect(bdRows?.total).toBe(9);

    // 2. Capa Listado (getEmpresasList)
    const list = getEmpresasList({ q: regressionId, limit: 25 });
    const listEntry = list.data.find((item: { id: string }) => item.id === regressionId);
    expect(listEntry).toBeDefined();
    expect(listEntry?.id).toBe(regressionId);
    expect(listEntry?.nif).toBe(regressionId);
    expect(listEntry?.total_contratos).toBe(9);

    // 3. Capa Ficha (getEmpresaDetail)
    const detail = getEmpresaDetail(regressionId);
    expect(detail).not.toBeNull();
    expect(detail?.id).toBe(regressionId);
    expect(detail?.nif).toBe(regressionId);
    expect(detail?.total_contratos).toBe(9);

    // 4. Verificación de identidad exacta en las tres capas
    expect(bdRows?.awardee_nif).toBe(listEntry?.id);
    expect(listEntry?.id).toBe(detail?.id);
  });

  it('exige DNI_SALT en producción y lanza error cuando falta, permitiendo salt de prueba en test', () => {
    const origEnv = process.env.NODE_ENV;
    const origSalt = process.env.DNI_SALT;

    try {
      // En modo producción sin DNI_SALT, debe lanzar un error explícito
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.DNI_SALT;

      expect(() => getDniSalt()).toThrowError(/DNI_SALT.*production/i);
      expect(() => getTsOpaqueEmpresaId('12345670A')).toThrowError(/DNI_SALT.*production/i);

      // Un ID ya anonimizado no requiere sal y nunca lanza error
      expect(getTsOpaqueEmpresaId('pf-123456789abc')).toBe('pf-123456789abc');

      // Con DNI_SALT configurado en producción, genera hash correctamente
      process.env.DNI_SALT = 'dummy-production-stable-salt-do-not-reveal';
      expect(getDniSalt()).toBe('dummy-production-stable-salt-do-not-reveal');
      expect(getTsOpaqueEmpresaId('12345670A')).toMatch(/^pf-[a-f0-9]{12}$/);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
      if (origSalt !== undefined) {
        process.env.DNI_SALT = origSalt;
      } else {
        delete process.env.DNI_SALT;
      }
    }
  });
});
