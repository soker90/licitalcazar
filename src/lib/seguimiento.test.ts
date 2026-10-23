import { describe, it, expect } from 'vitest';
import { clasificarPlazo, calcularDiasHabiles, getLicitacionesAbiertas, getSeguimientoData } from './seguimiento';
import { createGeneratedTestDb } from './test-db';
import { setDbForTests } from './db';

describe('Seguimiento - clasificarPlazo', () => {
  const refDate = new Date('2026-09-07T12:00:00Z');

  it('clasifica correctamente cuando no hay fecha límite (sin plazo de licitación abierta)', () => {
    const res = clasificarPlazo(null, refDate);
    expect(res.fase).toBe('evaluacion_plicas');
    expect(res.urgencia).toBe('evaluacion');
    expect(res.diasRestantes).toBeNull();
  });

  it('clasifica como plazo cerrado / evaluacion_plicas cuando la fecha límite ya pasó', () => {
    const res = clasificarPlazo('2026-09-01 23:59:00', refDate);
    expect(res.fase).toBe('evaluacion_plicas');
    expect(res.urgencia).toBe('evaluacion');
    expect(res.diasRestantes).toBeLessThan(0);
  });

  it('clasifica como urgencia crítica cuando quedan 3 días o menos', () => {
    const res = clasificarPlazo('2026-09-09 23:59:00', refDate);
    expect(res.fase).toBe('plazo_abierto');
    expect(res.urgencia).toBe('critica');
    expect(res.diasRestantes).toBeLessThanOrEqual(3);
  });

  it('clasifica como urgencia alta cuando quedan entre 4 y 7 días', () => {
    const res = clasificarPlazo('2026-09-13 23:59:00', refDate);
    expect(res.fase).toBe('plazo_abierto');
    expect(res.urgencia).toBe('alta');
  });

  it('clasifica como urgencia media cuando quedan entre 8 y 15 días', () => {
    const res = clasificarPlazo('2026-09-18 23:59:00', refDate);
    expect(res.fase).toBe('plazo_abierto');
    expect(res.urgencia).toBe('media');
  });

  it('clasifica como urgencia normal cuando quedan más de 15 días', () => {
    const res = clasificarPlazo('2026-10-15 23:59:00', refDate);
    expect(res.fase).toBe('plazo_abierto');
    expect(res.urgencia).toBe('normal');
  });
});

describe('Seguimiento - calcularDiasHabiles', () => {
  it('cuenta correctamente días laborables excluyendo fines de semana', () => {
    // Viernes 2026-09-04 a Lunes 2026-09-07: hay 1 día hábil de plazo (el propio lunes)
    const fri = new Date('2026-09-04T00:00:00Z');
    const mon = new Date('2026-09-07T00:00:00Z');
    const dias = calcularDiasHabiles(fri, mon);
    expect(dias).toBe(1);

    // Viernes a Domingo: sábado y domingo excluidos, 0 días laborables
    const sun = new Date('2026-09-06T00:00:00Z');
    expect(calcularDiasHabiles(fri, sun)).toBe(0);

    // Lunes a Viernes de la misma semana
    const friNext = new Date('2026-09-11T00:00:00Z');
    const habiles = calcularDiasHabiles(mon, friNext);
    expect(habiles).toBe(4);
  });

  it('devuelve 0 si la fecha final es anterior o igual a la inicial', () => {
    const d1 = new Date('2026-09-10T00:00:00Z');
    const d2 = new Date('2026-09-05T00:00:00Z');
    expect(calcularDiasHabiles(d1, d2)).toBe(0);
  });
});

describe('Seguimiento - Consultas sobre la base de datos real', () => {
  it('incluye convocatorias con estado canónico Published', () => {
    const db = createGeneratedTestDb(20261021, 1);
    db.prepare(`UPDATE contracts SET status = 'Published', publication_date = '2026-10-01',
      deadline_date = '2026-12-01', scope = 'Directa Municipal' WHERE id = 'generated-20261021-1'`).run();
    setDbForTests(db);

    try {
      const abiertas = getLicitacionesAbiertas();
      expect(abiertas.some((item) => item.id === 'generated-20261021-1')).toBe(true);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('obtiene licitaciones abiertas respetando los estados de PLACSP', () => {
    const abiertas = getLicitacionesAbiertas();
    expect(Array.isArray(abiertas)).toBe(true);
    expect(abiertas.length).toBeGreaterThan(0);

    const first = abiertas[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('expediente');
    expect(first).toHaveProperty('fase');
    expect(first).toHaveProperty('urgencia');
  });

  it('calcula KPIs consolidados para la página de seguimiento', () => {
    const data = getSeguimientoData();
    expect(data.kpis).toBeDefined();
    expect(data.kpis.totalConvocatoriasActivas).toBeGreaterThan(0);
    expect(data.kpis.totalContratosVivos).toBeGreaterThan(0);
    expect(data.licitacionesAbiertas.length).toBeGreaterThan(0);
  });
});
