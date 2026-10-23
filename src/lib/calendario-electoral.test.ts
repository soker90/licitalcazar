import { afterEach, describe, it, expect } from 'vitest';
import { createGeneratedTestDb } from './test-db';
import { setDbForTests } from './db';
import { getCalendarioElectoralStats, getStats } from './db';

describe('Adjudicaciones vs Calendario Electoral (Issue #7)', () => {
  afterEach(() => {
    setDbForTests(null);
  });

  it('excluye lotes terminales del volumen electoral y mensual', () => {
    const db = createGeneratedTestDb(20261001, 1);

    db.prepare(`
      UPDATE contracts
      SET year = 2023,
          status = 'Adjudicada',
          award_amount_type = 'total',
          awarded_amount = NULL,
          awardee = 'Varios adjudicatarios',
          is_lotized = 1,
          contract_type = 'Obras',
          award_date = '2023-04-15',
          publication_date = '2023-03-15'
      WHERE id = 'generated-20261001-1'
    `).run();

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        amount_excl_vat, awarded_amount, awardee, lot_status
      ) VALUES
        ('lot-1', 'generated-20261001-1', 'GEN/2023/1', '1', 'Lote 1', 6000, 6000, 'Empresa Lote 1', 'Adjudicado'),
        ('lot-2', 'generated-20261001-1', 'GEN/2023/1', '2', 'Lote 2', 5000, 5000, 'Empresa Lote 2', 'Cancelled')
    `).run();

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'award-1', 'generated-20261001-1', 'GEN/2023/1', '1', 0,
      'Empresa Canonica', 'C11111111', 4000, 'Adjudicado'
    );

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awardee_nif, awarded_amount, result_state
      ) VALUES ('award-cancelled', 'generated-20261001-1', 'GEN/2023/1', '2', 0,
        'Empresa Cancelada', 'X11111111', 5000, 'Adjudicado')
    `).run();

    setDbForTests(db);

    const stats = getCalendarioElectoralStats();
    const period = stats.periodosElectorales.find((item) => item.year === 2023);
    const april = stats.evolucionMensual.find((item) => item.mesAno === '2023-04');

    expect(period?.volumen).toBe(4000);
    expect(period?.volumenObras).toBe(4000);
    expect(period?.topLicitaciones[0]?.amount).toBe(4000);
    expect(april?.volumen).toBe(4000);
  });

  it('no usa PBL como volumen preelectoral cuando falta el importe adjudicado', () => {
    const db = createGeneratedTestDb(20260930, 2);

    db.prepare(`
      UPDATE contracts
      SET year = 2023,
          award_amount_type = 'total',
          contract_type = 'Obras',
          amount_excl_vat = 10000,
          awarded_amount = NULL,
          awardee = 'Empresa Sin Importe',
          awardee_nif = 'B11111111',
          award_date = '2023-04-15',
          publication_date = '2023-03-15'
      WHERE id = 'generated-20260930-1'
    `).run();

    db.prepare(`
      UPDATE contracts
      SET year = 2023,
          award_amount_type = 'total',
          contract_type = 'Servicios',
          amount_excl_vat = 8000,
          awarded_amount = 4000,
          awardee = 'Empresa Con Importe',
          awardee_nif = 'B22222222',
          award_date = '2023-04-20',
          publication_date = '2023-03-20'
      WHERE id = 'generated-20260930-2'
    `).run();

    setDbForTests(db);

    const stats = getCalendarioElectoralStats();
    const period = stats.periodosElectorales.find((item) => item.year === 2023);

    expect(period?.volumen).toBe(4000);
    expect(period?.volumenObras + period?.volumenServicios).toBe(4000);
    expect(period?.topLicitaciones[0]?.amount).toBe(4000);
    expect(period?.topLicitaciones[1]?.amount).toBe(0);
  });


  it('debe calcular la comparativa preelectoral frente a ejercicios no electorales', () => {
    const stats = getCalendarioElectoralStats();

    expect(stats.mediaNoElectoral).toBeDefined();
    expect(stats.mediaNoElectoral.contratosTrimestre).toBeGreaterThan(0);
    expect(stats.mediaNoElectoral.volumenTrimestre).toBeGreaterThan(0);
    expect(stats.mediaNoElectoral.ejerciciosAnalizados.length).toBeGreaterThanOrEqual(4);

    expect(stats.periodosElectorales).toBeDefined();
    expect(stats.periodosElectorales.length).toBe(3); // 2015, 2019, 2023
  });

  it('debe contener datos preelectorales para las elecciones municipales de 2019 y 2023', () => {
    const stats = getCalendarioElectoralStats();
    const p2019 = stats.periodosElectorales.find((p) => p.year === 2019);
    const p2023 = stats.periodosElectorales.find((p) => p.year === 2023);

    expect(p2019).toBeDefined();
    expect(p2023).toBeDefined();

    expect(p2019!.contratos).toBeGreaterThan(20);
    expect(p2019!.volumen).toBeGreaterThan(400000);

    expect(p2023!.contratos).toBeGreaterThan(50);
    expect(p2023!.volumen).toBeGreaterThan(2000000);
    expect(p2023!.contratosObras).toBeGreaterThan(0);
    expect(p2023!.topLicitaciones.length).toBeGreaterThan(0);
  });

  it('las licitaciones del periodo preelectoral 2023 deben incluir obras o servicios urbanos visibles', () => {
    const stats = getCalendarioElectoralStats();
    const p2023 = stats.periodosElectorales.find((p) => p.year === 2023);

    expect(p2023).toBeDefined();
    const objetos = p2023!.topLicitaciones.map((l) => l.objeto.toLowerCase());
    const hasVisibleWorks = objetos.some(
      (o) => o.includes('paviment') || o.includes('obra') || o.includes('reforma') || o.includes('foso')
    );
    expect(hasVisibleWorks).toBe(true);
  });

  it('la serie mensual debe identificar los meses de ventana preelectoral (marzo-mayo)', () => {
    const stats = getCalendarioElectoralStats();

    expect(stats.evolucionMensual.length).toBeGreaterThan(40);
    const preelecItems = stats.evolucionMensual.filter((m) => m.esPreelectoral);
    expect(preelecItems.length).toBeGreaterThanOrEqual(6); // 3 meses en 2019 + 3 meses en 2023

    for (const m of preelecItems) {
      expect([2019, 2023]).toContain(m.year);
      expect([3, 4, 5]).toContain(m.mes);
    }
  });

  it('admite filtrado por ámbito institucional (directa municipal)', () => {
    const globalStats = getCalendarioElectoralStats();
    const directaStats = getCalendarioElectoralStats('directa');

    expect(directaStats.mediaNoElectoral).toBeDefined();
    expect(directaStats.periodosElectorales.length).toBe(3);

    const globVol2023 = globalStats.periodosElectorales.find((p) => p.year === 2023)!.volumen;
    const dirVol2023 = directaStats.periodosElectorales.find((p) => p.year === 2023)!.volumen;
    expect(dirVol2023).toBeLessThanOrEqual(globVol2023);
  });

  it('getStats() integra calendarioElectoral correctamente', () => {
    const stats = getStats();

    expect(stats.calendarioElectoral).toBeDefined();
    expect(stats.calendarioElectoral.mediaNoElectoral.contratosTrimestre).toBeGreaterThan(0);
    expect(stats.calendarioElectoral.periodosElectorales.length).toBe(3);
    expect(stats.calendarioElectoral.diagnostico).toBeTruthy();
  });
});
