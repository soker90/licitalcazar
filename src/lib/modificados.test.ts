import { afterEach, describe, it, expect } from 'vitest';
import { getModificadosStats } from './modificados';
import { evaluarRedFlags, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';
import fs from 'node:fs';

describe('Análisis de modificaciones contractuales (Art. 203-207 LCSP)', () => {
  it('atribuye los modificados a los adjudicatarios reales de los lotes', () => {
    const source = fs.readFileSync(new URL('./modificados.ts', import.meta.url), 'utf8');
    const query = source;
    expect(query).toContain('const lotAwardsAwardeeCovered = hasLotAwardsTable');
    expect(query).toContain('NOT EXISTS (');
    expect(query).toContain('award.lot_number = lot.lot_number');
    expect(query).not.toContain('count(DISTINCT award.lot_number)');
    expect(query).toContain('FROM lot_awards award');
    expect(query).toContain('SELECT group_concat(DISTINCT lot.awardee)');
    expect(query).toContain('lot.contract_id = l.id');
    expect(query).toContain("eligibleAwardLotStatusSql('lot')");
    expect(query).toContain('THEN NULL');
  });

  afterEach(() => setDbForTests(null));
  it('solo incluye expedientes con modificaciones publicadas en la tabla de modificaciones', () => {
    const stats = getModificadosStats();
    expect(stats).toBeDefined();

    for (const item of stats.rankingObras) {
      expect(['modificacion_contractual', 'proyecto_modificado']).toContain(item.tipoModificado);
      expect(item.id).toBeTruthy();
      expect(item.expediente).toBeTruthy();
    }
  });

  it('usa el total adjudicado de los lotes al calcular el importe inicial del modificado', () => {
    const db = createGeneratedTestDb(20261001, 1);
    const contractId = 'generated-20261001-1';
    db.prepare(`
      UPDATE contracts
      SET year = 2024, status = 'Adjudicada', award_amount_type = 'total',
          awarded_amount = NULL, awardee = 'Varios adjudicatarios',
          is_lotized = 1, lot_count = 3, award_date = '2024-01-10'
      WHERE id = ?
    `).run(contractId);
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, lot_status, award_date, awardee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('mod-lot-a', contractId, 'GEN/2024/1', '1', 'A', 6000, 'Adjudicado', '2024-01-10', 'Empresa Lote A');
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, lot_status, award_date, awardee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('mod-lot-b', contractId, 'GEN/2024/1', '2', 'B', 4000, 'Adjudicado', '2024-01-10', 'Empresa Lote B');
    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, lot_status, award_date, awardee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('mod-lot-c', contractId, 'GEN/2024/1', '3', 'C', 5000, 'Adjudicado', '2024-01-10', 'Empresa Lote C');
    db.prepare(`
      INSERT INTO modifications (
        id, contract_id, case_number, modification_number,
        modification_date, modification_amount, final_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('mod-1', contractId, 'GEN/2024/1', 1, '2024-06-01', 1000, 11000);

    db.prepare("INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run('mod-award-a', contractId, 'GEN/2024/1', '1', 0, 'Empresa Award A', 4500, 'Adjudicado');
    db.prepare("INSERT INTO lot_awards (id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run('mod-award-b', contractId, 'GEN/2024/1', '2', 0, 'Empresa Award B', 3500, 'Adjudicado');

    setDbForTests(db);
    try {
      const stats = getModificadosStats();
      const item = stats.rankingObras.find((row) => row.id === contractId);
      expect(item?.importeInicial).toBe(15000);
      expect(item?.importeFinal).toBe(11000);
      expect(item?.awardee).toBe('Empresa Lote A,Empresa Lote B,Empresa Lote C');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('ignora resultados previos a la adjudicación en el informe de modificados', () => {
    const db = createGeneratedTestDb(20261031, 1);
    const contractId = 'generated-20261031-1';

    db.prepare(`
      UPDATE contracts
      SET year = 2024, status = 'Adjudicada', award_amount_type = 'total',
          awarded_amount = NULL, awardee = 'Varios adjudicatarios',
          is_lotized = 1, lot_count = 1, award_date = '2024-01-10'
      WHERE id = ?
    `).run(contractId);

    db.prepare(`
      INSERT INTO contract_lots (
        id, contract_id, case_number, lot_number, lot_name,
        awarded_amount, lot_status, award_date, awardee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('mod-pre-award-lot', contractId, 'GEN/2024/31', '1',
      'Lote único', 1000, 'Adjudicado', '2024-01-10', 'Empresa adjudicada');

    db.prepare(`
      INSERT INTO modifications (
        id, contract_id, case_number, modification_number,
        modification_date, modification_amount, final_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('mod-pre-award-mod', contractId, 'GEN/2024/31', 1,
      '2024-06-01', 100, 1100);

    db.prepare(`
      INSERT INTO lot_awards (
        id, contract_id, case_number, lot_number, award_index,
        awardee, awarded_amount, result_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('mod-pre-award-result', contractId, 'GEN/2024/31', '1', 0,
      'Licitador mejor valorado', 900, 'BEST_RATED_TENDERER');

    setDbForTests(db);
    try {
      const stats = getModificadosStats();
      const item = stats.rankingObras.find((row) => row.id === contractId);
      expect(item).toBeDefined();
      expect(item?.importeInicial).toBe(1000);
      expect(item?.awardee).toBe('Empresa adjudicada');
      expect(item?.awardee).not.toContain('Licitador mejor valorado');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('no usa un snapshot parcial de lot_awards cuando otro lote no tiene importe adjudicado', () => {
    const db = createGeneratedTestDb(20261022, 1);
    const contractId = 'generated-20261022-1';

    db.prepare(`UPDATE contracts
      SET year = 2024, status = 'Adjudicada', award_amount_type = 'total',
          awarded_amount = 2000, awardee = 'Varios adjudicatarios',
          is_lotized = 1, lot_count = 2, award_date = '2024-01-10'
      WHERE id = ?`).run(contractId);

    const insertLot = db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      awarded_amount, lot_status, award_date, awardee
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertLot.run('mod-partial-amount-lot-a', contractId, 'GEN/2024/1', '1', 'A', 1000, 'Adjudicado', '2024-01-10', 'Empresa A');
    insertLot.run('mod-partial-amount-lot-b', contractId, 'GEN/2024/1', '2', 'B', null, 'Adjudicado', '2024-01-10', 'Empresa B');

    db.prepare(`INSERT INTO modifications (
      id, contract_id, case_number, modification_number,
      modification_date, modification_amount, final_amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'mod-partial-amount-mod', contractId, 'GEN/2024/1', 1, '2024-06-01', 100, 1100
    );

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'mod-partial-amount-award', contractId, 'GEN/2024/1', '1', 0,
      'Empresa A', 900, 'Adjudicado'
    );

    setDbForTests(db);
    try {
      const stats = getModificadosStats();
      const item = stats.rankingObras.find((row) => row.id === contractId);
      expect(item).toBeDefined();
      expect(item?.importeInicial).toBe(1000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('rechaza cobertura de lot_awards con la misma cardinalidad pero lotes distintos', () => {
    const db = createGeneratedTestDb(20261001, 1);
    const contractId = 'generated-20261001-1';

    db.prepare(`UPDATE contracts
      SET year = 2024, status = 'Adjudicada', award_amount_type = 'total',
          awarded_amount = NULL, awardee = 'Varios adjudicatarios',
          is_lotized = 1, lot_count = 2, award_date = '2024-01-10'
      WHERE id = ?`).run(contractId);

    const insertLot = db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name,
      awarded_amount, lot_status, award_date, awardee
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertLot.run('mod-set-lot-a', contractId, 'GEN/2024/1', '1', 'A', 6000, 'Adjudicado', '2024-01-10', 'Empresa Lote A');
    insertLot.run('mod-set-lot-b', contractId, 'GEN/2024/1', '2', 'B', 4000, 'Adjudicado', '2024-01-10', 'Empresa Lote B');

    db.prepare(`INSERT INTO modifications (
      id, contract_id, case_number, modification_number,
      modification_date, modification_amount, final_amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('mod-set-1', contractId, 'GEN/2024/1', 1, '2024-06-01', 1000, 11000);

    const insertAward = db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertAward.run('mod-set-award-a', contractId, 'GEN/2024/1', '1', 0, 'Empresa Award A', 4500, 'Adjudicado');
    insertAward.run('mod-set-award-c', contractId, 'GEN/2024/1', '3', 0, 'Empresa Award C', 3500, 'Adjudicado');

    setDbForTests(db);
    try {
      const stats = getModificadosStats();
      const item = stats.rankingObras.find((row) => row.id === contractId);
      expect(item).toBeDefined();
      expect(item?.importeInicial).toBe(10000);
      expect(item?.importeFinal).toBe(11000);
      expect(item?.awardee).toBe('Empresa Lote A,Empresa Lote B');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('usa lot_awards cuando solo uno de varios lotes heredados carece de adjudicatario', () => {
    const db = createGeneratedTestDb(20261015, 1);
    const contractId = 'generated-20261015-1';
    db.prepare(`UPDATE contracts SET year = 2024, status = 'Adjudicada',
      award_amount_type = 'total', awarded_amount = NULL,
      awardee = 'Varios adjudicatarios', is_lotized = 1, lot_count = 2,
      award_date = '2024-01-10' WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'mod-partial-awardee-lot-a', contractId, '1', 'Lote con awardee', 6000, 'Adjudicado', 'Empresa Legacy'
    );
    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'mod-partial-awardee-lot-b', contractId, '2', 'Lote sin awardee', 4000, 'Adjudicado', null
    );

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'mod-partial-awardee-award-a', contractId, 'GEN/2024/1', '1', 0,
      'Empresa Award A', 5500, 'Adjudicado'
    );
    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'mod-partial-awardee-award-b', contractId, 'GEN/2024/1', '2', 0,
      'Empresa Award B', 3500, 'Adjudicado'
    );

    db.prepare(`INSERT INTO modifications (
      id, contract_id, case_number, modification_number,
      modification_date, modification_amount, final_amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'mod-partial-awardee-mod', contractId, 'GEN/2024/1', 1, '2024-06-01', 500, 9500
    );

    setDbForTests(db);
    try {
      const stats = getModificadosStats();
      const item = stats.rankingObras.find((row) => row.id === contractId);
      expect(item).toBeDefined();
      expect(item?.importeInicial).toBe(9000);
      expect(item?.awardee).toBe('Empresa Award A,Empresa Award B');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('usa los adjudicatarios de lot_awards en las prórrogas de contratos lotizados', () => {
    const db = createGeneratedTestDb(20261015, 1);
    const contractId = 'generated-20261015-1';
    db.prepare(`UPDATE contracts SET year = 2024, status = 'Formalizada',
      award_amount_type = 'total', awarded_amount = NULL,
      awardee = 'Varios adjudicatarios', awardee_nif = NULL,
      is_lotized = 1, lot_count = 2, award_date = '2024-01-10'
      WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'prorroga-lot-a', contractId, '1', 'Lote A', 6000, 'Adjudicado', 'Empresa Legacy A'
    );
    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'prorroga-lot-b', contractId, '2', 'Lote B', 4000, 'Adjudicado', 'Empresa Legacy B'
    );
    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'prorroga-award-a', contractId, 'GEN/2024/1', '1', 0, 'Empresa Real A', 5500, 'Adjudicado'
    );
    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'prorroga-award-b', contractId, 'GEN/2024/1', '2', 0, 'Empresa Real B', 3500, 'Adjudicado'
    );
    db.prepare(`INSERT INTO modifications (
      id, contract_id, case_number, modification_number, modification_date,
      modification_type, duration_value, duration_unit, duration_days
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'prorroga-mod', contractId, 'GEN/2024/1', 1, '2024-06-01',
      'Ampliación de plazo', 30, 'DAY', 30
    );

    setDbForTests(db);
    try {
      const stats = getModificadosStats();
      const item = stats.rankingProrrogas.find((row) => row.licitacionId === contractId);
      expect(item).toBeDefined();
      expect(item?.awardee).toBe('Empresa Real A,Empresa Real B');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('conserva reducciones de importe cuando no se publica final_amount', () => {
    const db = createGeneratedTestDb(20261020, 1);
    const contractId = 'generated-20261020-1';
    db.prepare(`UPDATE contracts SET year = 2024, status = 'Adjudicada',
      award_amount_type = 'total', awarded_amount = 10000,
      awardee = 'Empresa', award_date = '2024-01-10'
      WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO modifications (
      id, contract_id, case_number, modification_number,
      modification_date, modification_amount, final_amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'mod-negative', contractId, 'GEN/2024/1', 1, '2024-06-01', -1500, null
    );

    setDbForTests(db);
    try {
      const stats = getModificadosStats();
      const item = stats.rankingObras.find((row) => row.id === contractId);
      expect(item).toBeDefined();
      expect(item?.importeInicial).toBe(10000);
      expect(item?.importeFinal).toBe(8500);
      expect(item?.desviacionEuros).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('no interpreta la diferencia PBL/adjudicación como una modificación contractual', () => {
    const stats = getModificadosStats();
    const crisfel = stats.rankingObras.find((item) => item.expediente === '7/2025 Obras');

    // El expediente sí tiene una modificación oficial publicada en PLACSP.
    // Lo que no debe ocurrir es inferirla únicamente por la diferencia PBL/adjudicación.
    expect(crisfel).toBeDefined();
    expect(crisfel?.tipoModificado).toBe('modificacion_contractual');
    expect(crisfel?.importeInicial).toBe(1870406.94);
    expect(crisfel?.importeFinal).toBe(1870406.94);

    const cadena = stats.cadenasProyectos.find((item) => item.expedienteOriginal === '7/2025 Obras');
    expect(cadena).toBeDefined();
    expect(cadena?.tipo).toBe('Obras');
  });

  it('reconstruye las cadenas exclusivamente desde los registros de modificaciones de la BD', () => {
    const stats = getModificadosStats();

    for (const cadena of stats.cadenasProyectos) {
      expect(cadena.idProyecto).toBeTruthy();
      expect(cadena.titulo).not.toContain('Teatro CRISFEL');
      expect(cadena.contratosCadena.length).toBeGreaterThanOrEqual(2);
      expect(cadena.contratosCadena[0].rol).toBe('contrato_original');
      expect(cadena.contratosCadena.slice(1).every((c) => c.rol === 'modificacion_contractual')).toBe(true);
    }
  });

  it('trata el 20% como señal cuantitativa, no como conclusión automática del art. 205', () => {
    const stats = getModificadosStats();

    for (const item of stats.rankingObras.filter((o) => o.supera20Pct)) {
      expect(item.artLCSP).toContain('señal cuantitativa');
      expect(item.artLCSP).not.toContain('improcedente');
    }
  });

  it('no clasifica contratos patrimoniales como modificados por superar su PBL', () => {
    const stats = getModificadosStats();
    expect(stats.rankingObras.some((item) => /patrimonial|privado/i.test(item.tipo))).toBe(false);
  });

  describe('evaluarRedFlags para anomalías de adjudicación', () => {
    it('puede señalar una adjudicación superior al PBL como anomalía independiente', () => {
      const flags = evaluarRedFlags({
        importe_sin_iva: 100000,
        importe_adjudicacion: 130000,
        tipo_contrato: 'Obras',
        procedimiento: 'Abierto',
      });

      const flag = flags.find((f) => f.tipo === 'sobrecoste_licitacion');
      expect(flag).toBeDefined();
      expect(flag?.nivel).toBe('alerta');
    });

    it('calcula el sobrecoste con los importes agregados de los lotes', () => {
      const flags = evaluarRedFlags(
        {
          importe_sin_iva: 100000,
          importe_adjudicacion: 150000,
          tipo_contrato: 'Obras',
          procedimiento: 'Abierto',
        },
        [
          { presupuestoSinIva: 60000, importeAdjudicacion: 60000, estadoLote: 'Adjudicado' },
          { presupuestoSinIva: 40000, importeAdjudicacion: 54000, estadoLote: 'Adjudicado' },
        ]
      );

      const flag = flags.find((f) => f.tipo === 'sobrecoste_licitacion');
      expect(flag).toBeDefined();
      expect(flag?.titulo).toContain('+14%');
      expect(flag?.nivel).toBe('aviso');
      expect(flag?.descripcion).toContain('114.000');
    });

    it('no activa la anomalía para contratos patrimoniales', () => {
      const flags = evaluarRedFlags({
        importe_sin_iva: 50000,
        importe_adjudicacion: 90000,
        tipo_contrato: 'Patrimonial',
        procedimiento: 'Abierto',
      });

      expect(flags.find((f) => f.tipo === 'sobrecoste_licitacion')).toBeUndefined();
    });

    it('mantiene la señal de proyecto modificado cuando la descripción lo documenta', () => {
      const flags = evaluarRedFlags({
        expediente: '2023/11A/CM',
        objeto: 'Redacción del proyecto modificado a partir del proyecto de ejecución de las obras',
        tipo_contrato: 'Servicios',
        procedimiento: 'Contrato menor',
      });

      expect(flags.find((f) => f.tipo === 'modificado_proyecto')).toBeDefined();
    });

    it('no marca la ejecución de obras solo por mencionar el proyecto modificado', () => {
      const flags = evaluarRedFlags({
        id: 'https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/17354524',
        expediente: '7/2025 Obras',
        objeto: 'Obras de rehabilitación descritas en el proyecto técnico de actualización derivado del proyecto modificado del Teatro CRISFEL',
        tipo_contrato: 'Obras',
        procedimiento: 'Abierto simplificado',
        naturaleza_economica: 'gasto',
        importe_sin_iva: 1954951.66,
        importe_adjudicacion: 1870406.94,
      });

      expect(flags.find((f) => f.tipo === 'modificado_proyecto')).toBeUndefined();
    });
  });
  it('usa lot_awards cuando el lote no tiene adjudicatario en contract_lots', () => {
    const db = createGeneratedTestDb(20261015, 1);
    const contractId = 'generated-20261015-1';
    db.prepare(`UPDATE contracts SET year = 2024, status = 'Adjudicada',
      award_amount_type = 'total', awarded_amount = NULL,
      awardee = 'Varios adjudicatarios', is_lotized = 1, lot_count = 1,
      award_date = '2024-01-10' WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'mod-null-awardee-lot', contractId, '1', 'Lote sin awardee', null, 'Adjudicado', null
    );

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'mod-null-awardee-award', contractId, 'GEN/2024/1', '1', 0,
      'Empresa Award', 7000, 'Adjudicado'
    );

    db.prepare(`INSERT INTO modifications (
      id, contract_id, case_number, modification_number,
      modification_date, modification_amount, final_amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'mod-null-awardee-mod', contractId, 'GEN/2024/1', 1, '2024-06-01', 500, 7500
    );

    setDbForTests(db);
    try {
      const stats = getModificadosStats();
      const item = stats.rankingObras.find((row) => row.id === contractId);
      expect(item).toBeDefined();
      expect(item?.importeInicial).toBe(7000);
      expect(item?.awardee).toBe('Empresa Award');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });


  it('no mezcla el NIF de lot_awards parciales con los adjudicatarios de contract_lots en prórrogas', () => {
    const db = createGeneratedTestDb(20261015, 1);
    const contractId = 'generated-20261015-1';
    db.prepare(`UPDATE contracts SET year = 2024, status = 'Formalizada',
      award_amount_type = 'total', awarded_amount = NULL,
      awardee = 'Varios adjudicatarios', awardee_nif = NULL,
      is_lotized = 1, lot_count = 2, award_date = '2024-01-10'
      WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee, awardee_nif
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'prorroga-partial-nif-lot-a', contractId, '1', 'Lote A', 6000, 'Adjudicado', 'Empresa Legacy A', 'B11111111'
    );
    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, lot_number, lot_name, awarded_amount, lot_status, awardee, awardee_nif
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'prorroga-partial-nif-lot-b', contractId, '2', 'Lote B', 4000, 'Adjudicado', 'Empresa Legacy B', 'B22222222'
    );
    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awardee_nif, awarded_amount, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'prorroga-partial-nif-award-a', contractId, 'GEN/2024/1', '1', 0,
      'Empresa Real A', 'A11111111', 5500, 'Adjudicado'
    );
    db.prepare(`INSERT INTO modifications (
      id, contract_id, case_number, modification_number, modification_date,
      modification_type, duration_value, duration_unit, duration_days
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'prorroga-partial-nif-mod', contractId, 'GEN/2024/1', 1, '2024-06-01',
      'Ampliación de plazo', 30, 'DAY', 30
    );

    setDbForTests(db);
    try {
      const stats = getModificadosStats();
      const item = stats.rankingProrrogas.find((row) => row.licitacionId === contractId);
      expect(item).toBeDefined();
      expect(item?.awardee).toBe('Empresa Legacy A,Empresa Legacy B');
      expect(item?.nifAdjudicatario).toBeNull();
    } finally {
      setDbForTests(null);
      db.close();
    }
  });
});