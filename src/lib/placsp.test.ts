import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { getPlacspUrl, getPlacspId } from './placsp';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const { initDb } = require('../../scripts/init-db.js');

async function withPlacspFixtureDb(
  run: (getLicitacionById: (id: string) => any) => void | Promise<void>,
) {
  const db = new DatabaseSync(':memory:');
  const dbModule = await import('./db');

  try {
    initDb(db);
    const insert = db.prepare(`
      INSERT INTO contracts (
        id, placsp_id, case_number, object_description,
        contracting_authority_id, contracting_authority_name,
        contracting_authority_nif, contract_type, status,
        publication_date, deadline_date, award_date, formalization_date,
        eu_funding, location, nuts, offer_count, is_lotized, lot_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
    `);

    insert.run(
      'test-contract-19763505',
      'https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/19763505',
      '3/2026 Servicios',
      'Contrato de prueba para validar fechas de ciclo de vida',
      'ayuntamiento-contratacion',
      'Ayuntamiento de Alcázar de San Juan',
      'P1300500D',
      'Servicios',
      'Resuelta',
      '2026-05-27 10:22:32',
      '2026-06-16 23:59:00',
      '2026-08-31 00:00:00',
      null,
      'NO-EU',
      'Alcázar de San Juan, Ciudad Real',
      'ES422',
      2,
    );

    insert.run(
      'test-contract-19512581',
      'https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/19512581',
      '4/2026 Servicios',
      'Auditoría Integral',
      'ayuntamiento-contratacion',
      'Ayuntamiento de Alcázar de San Juan',
      'P1300500D',
      'Servicios',
      'Resuelta',
      '2026-04-17 00:00:00',
      '2026-05-04 23:59:00',
      '2026-08-04 00:00:00',
      '2026-08-21 00:00:00',
      'NO-EU',
      'Alcázar de San Juan, Ciudad Real',
      'ES422',
      2,
    );

    dbModule.setDbForTests(db);
    await run(dbModule.getLicitacionById);
  } finally {
    dbModule.setDbForTests(null);
    db.close();
  }
}

describe('getPlacspUrl', () => {
  it('devuelve url si está presente y no vacía', () => {
    const lic = {
      url: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=TEST1234',
      id: 'https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/9999',
    };
    expect(getPlacspUrl(lic)).toBe('https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=TEST1234');
  });

  it('recurre a id si url no está disponible pero id es URL', () => {
    const lic = {
      url: null,
      id: 'https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/2339483',
    };
    expect(getPlacspUrl(lic)).toBe('https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/2339483');
  });

  it('devuelve portal canónico si ni url ni id son válidos', () => {
    const lic = {
      url: '',
      id: 'LOCAL-123',
    };
    expect(getPlacspUrl(lic)).toBe('https://contrataciondelestado.es/wps/poc?uri=deeplink:perfilContratante');
  });
});

describe('getPlacspId', () => {
  it('no confunde una identidad interna con un identificador PLACSP', () => {
    expect(getPlacspId('ctr_0123456789abcdef01234567')).toBeNull();
  });

  it('extrae el número final de la URI de sindicación', () => {
    expect(getPlacspId('https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/2339483')).toBe('2339483');
    expect(getPlacspId('https://contrataciondelestado.es/sindicacion/datosAbiertosMenores/3087637')).toBe('3087637');
  });

  it('devuelve null si la entrada es nula o vacía', () => {
    expect(getPlacspId(null)).toBeNull();
    expect(getPlacspId('')).toBeNull();
  });

  it('extrae identificador limpio de URLs codificadas (percent-encoded)', () => {
    expect(getPlacspId('https%3A%2F%2Fcontrataciondelestado.es%2Fsindicacion%2FlicitacionesPerfilContratante%2F19512581')).toBe('19512581');
  });

  it('extrae el slug final de URIs que no terminan en dígitos', () => {
    expect(getPlacspId('https://contrataciondelestado.es/sindicacion/licitaciones/7-2023-obras')).toBe('7-2023-obras');
  });

  it('devuelve el id intacto si no tiene barra final con dígitos', () => {
    expect(getPlacspId('EXP-2025-01')).toBe('EXP-2025-01');
  });
});

describe('getLicitacionById - expediente 19763505', () => {
  it('resuelve correctamente expediente y fechas del ciclo de vida', async () => {
    await withPlacspFixtureDb((getLicitacionById) => {
      const lic = getLicitacionById('19763505');
      expect(lic).not.toBeNull();
      expect(lic?.estado).toBe('Resuelta');
      expect(lic?.fecha_limite).toBe('2026-06-16 23:59:00');
      expect(lic?.fecha_adjudicacion).toBe('2026-08-31 00:00:00');
      expect(lic?.diasResolucion).toBe(75);
    });
  });
});

describe('getLicitacionById - expediente 19512581 (Auditoría Integral)', () => {
  it('garantiza la estricta integridad cronológica en la cadena de fechas PLACSP', async () => {
    await withPlacspFixtureDb(async (getLicitacionById) => {
      const { calcularCronometriaContrato } = await import('./cronometria');
      const lic = getLicitacionById('19512581');
      expect(lic).not.toBeNull();
      expect(lic?.expediente).toBe('4/2026 Servicios');

      expect(lic?.fecha_publicacion).toBe('2026-04-17 00:00:00');
      expect(lic?.fecha_limite).toBe('2026-05-04 23:59:00');
      expect(lic?.fecha_adjudicacion).toBe('2026-08-04 00:00:00');
      expect((lic as any)?.fecha_formalizacion).toBe('2026-08-21 00:00:00');

      const tPub = new Date(lic!.fecha_publicacion!).getTime();
      const tLim = new Date(lic!.fecha_limite!).getTime();
      const tAdj = new Date(lic!.fecha_adjudicacion!).getTime();
      const tForm = new Date((lic as any).fecha_formalizacion!).getTime();

      expect(tPub).toBeLessThanOrEqual(tLim);
      expect(tLim).toBeLessThanOrEqual(tAdj);
      expect(tAdj).toBeLessThanOrEqual(tForm);

      const crono = calcularCronometriaContrato(lic!);
      expect(crono.diasOfertas).toBe(18);
      expect(crono.diasEvaluacion).toBe(91);
      expect(crono.diasFormalizacion).toBe(17);
      expect(crono.diasLicitacionTotal).toBe(109);
      const diasTotalesResolucion = (crono.diasLicitacionTotal || 0) + (crono.diasFormalizacion || 0);
      expect(diasTotalesResolucion).toBe(126);

      expect(lic?.financiacion_ue).toBe('NO-EU');
      const hasEuFlag = lic?.redFlags?.some((f: { tipo: string }) => f.tipo === 'fondos_ue');
      expect(hasEuFlag).toBe(false);

      expect(lic?.ubicacion).toContain('Alcázar de San Juan');
      expect(lic?.ubicacion).toContain('Ciudad Real');
      expect(lic?.nuts).toBe('ES422');
      expect(lic?.num_ofertas).toBe(2);
    });
  });
});
