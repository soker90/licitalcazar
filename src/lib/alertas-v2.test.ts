import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
import { getAlertasV2, getAlertasForContract, getAlertasForEmpresa, getGruposEmpresarialesDB, getAuditoriaKpis, getDb, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';

describe('V2 Sistema de Auditoría y Alertas Precalculadas', () => {
  afterEach(() => {
    setDbForTests(null);
  });

  it('recupera alertas precalculadas con conteo y desglose por severidad', () => {
    const res = getAlertasV2({ limit: 10 });
    expect(res.total).toBeGreaterThan(0);
    expect(res.alertas.length).toBeGreaterThan(0);
    expect(res.conteoPorSeveridad.alta).toBeGreaterThanOrEqual(0);
    expect(res.conteoPorSeveridad.media).toBeGreaterThanOrEqual(0);

    const alerta = res.alertas[0];
    expect(alerta.id).toBeDefined();
    expect(alerta.tipo).toBeDefined();
    expect(['ALTA', 'MEDIA', 'INFORMATIVA']).toContain(alerta.severidad);
    expect(alerta.confianza).toBeGreaterThan(0);
    expect(alerta.titulo.length).toBeGreaterThan(0);
    expect(alerta.evidencia.length).toBeGreaterThan(0);
    expect(Array.isArray(alerta.factores)).toBe(true);
    expect(typeof alerta.scoreEscala).toBe('number');
    expect(alerta.scoreEscala).toBeGreaterThan(0);
    expect(Array.isArray(alerta.explicacionesAlternativas)).toBe(true);
    expect(Array.isArray(alerta.documentosInvestigacion)).toBe(true);
  });

  it('asigna severidad MEDIA (escala 3-5) y explicaciones alternativas a casos recurrentes o concentrados (Zurich, Villasante, Pintor, Turiaventura)', () => {
    const res = getAlertasV2({ limit: 500 });
    const keywords = ['ZURICH', 'VILLASANTE', 'PINTOR', 'TURIAVENTURA'];
    
    for (const kw of keywords) {
      const alerta = res.alertas.find(a => a.titulo.toUpperCase().includes(kw));
      expect(alerta, `Alerta para ${kw} debe existir`).toBeDefined();
      if (alerta) {
        expect(alerta.severidad).toBe('MEDIA');
        expect(alerta.scoreEscala).toBeGreaterThanOrEqual(3.0);
        expect(alerta.scoreEscala).toBeLessThanOrEqual(5.0);
        expect(alerta.explicacionesAlternativas?.length).toBeGreaterThan(0);
        expect(alerta.documentosInvestigacion?.length).toBeGreaterThan(0);
        expect(['recurrente_anual', 'patron_concentracion']).toContain(alerta.patronContinuidad);
      }
    }
  });

  it('no muestra como alta una alerta OFERTA_UNICA cuando el contrato es ingreso/concesión', () => {
    const res = getAlertasForContract('https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/17644639');
    const alerta = res.find((a) => a.tipo === 'OFERTA_UNICA');

    expect(alerta).toBeDefined();
    if (alerta) {
      expect(alerta.severidad).toBe('MEDIA');
      expect(alerta.nivel).toBe('MEDIA');
      expect(alerta.scoreEscala).toBe(3.2);
      expect(alerta.factores.some((f) => /fondos públicos|gasto público/i.test(f.label) && f.scoreContribution > 0)).toBe(false);
    }
  });

  it('permite filtrar alertas por severidad', () => {
    const resAlta = getAlertasV2({ severidad: 'ALTA' });
    for (const a of resAlta.alertas) {
      expect(a.severidad).toBe('ALTA');
      expect(a.scoreEscala).toBeGreaterThan(5.0);
    }

    const resMedia = getAlertasV2({ severidad: 'MEDIA' });
    for (const a of resMedia.alertas) {
      expect(a.severidad).toBe('MEDIA');
      expect(a.scoreEscala).toBeGreaterThanOrEqual(3.0);
      expect(a.scoreEscala).toBeLessThanOrEqual(5.0);
    }
  });

  it('permite filtrar alertas por tipo', () => {
    const resMenores = getAlertasV2({ tipo: 'CONTRATOS_RELACIONADOS' });
    for (const a of resMenores.alertas) {
      expect(a.tipo).toBe('CONTRATOS_RELACIONADOS');
      expect(a.contratoIds).toBeDefined();
    }
  });

  it('recupera alertas asociadas a un contrato si existen vínculos', () => {
    const res = getAlertasV2({ limit: 50 });
    const alertaConContratos = res.alertas.find(a => a.contratoIds && a.contratoIds.length > 0);
    if (alertaConContratos && alertaConContratos.contratoIds) {
      const contractId = alertaConContratos.contratoIds[0];
      const alertasContrato = getAlertasForContract(contractId);
      expect(alertasContrato.length).toBeGreaterThan(0);
      expect(alertasContrato.some(a => a.id === alertaConContratos.id)).toBe(true);
    }
  });

  it('incluye alertas del contrato cuando la empresa solo es adjudicataria de un lote multiganador', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        awardee TEXT,
        awardee_nif TEXT
      );
      CREATE TABLE contract_lots (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        lot_number TEXT,
        awardee TEXT,
        awardee_nif TEXT,
        lot_status TEXT
      );
      CREATE TABLE alerts (
        id TEXT PRIMARY KEY,
        category TEXT,
        type TEXT,
        severity TEXT,
        level TEXT NOT NULL,
        scale_score REAL,
        confidence REAL,
        title TEXT,
        description TEXT,
        target_data TEXT,
        source TEXT,
        source_url TEXT,
        extracted_at TEXT,
        applied_rule TEXT,
        methodology_version TEXT,
        limitations TEXT,
        alternative_explanation TEXT,
        requires_human_review INTEGER,
        evidence TEXT,
        factors_json TEXT,
        continuity_pattern TEXT,
        explanations_json TEXT,
        documents_json TEXT,
        created_at TEXT
      );
      CREATE TABLE alert_contracts (
        alert_id TEXT NOT NULL,
        contract_id TEXT NOT NULL
      );
      CREATE TABLE company_resolution (
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

      INSERT INTO contracts (id, awardee, awardee_nif)
      VALUES ('multi-contract', 'Varios adjudicatarios', NULL);

      INSERT INTO contract_lots (id, contract_id, lot_number, awardee, awardee_nif, lot_status)
      VALUES
        ('lot-a', 'multi-contract', '1', 'Empresa Lote A', 'A11111111', 'Adjudicado'),
        ('lot-b', 'multi-contract', '2', 'Empresa Lote B', 'B22222222', 'Adjudicado'),
        ('lot-cancelled', 'multi-contract', '3', 'Empresa Lote D', 'D44444444', 'Cancelled');

      CREATE TABLE lot_awards (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        lot_number TEXT,
        awardee TEXT,
        awardee_nif TEXT,
        result_state TEXT
      );

      INSERT INTO lot_awards (id, contract_id, lot_number, awardee, awardee_nif, result_state)
      VALUES ('award-c', 'multi-contract', '1', 'Empresa Lote C', 'C33333333', 'Adjudicado');

      INSERT INTO lot_awards (id, contract_id, lot_number, awardee, awardee_nif, result_state)
      VALUES ('award-d', 'multi-contract', '3', 'Empresa Lote D', 'D44444444', 'Adjudicado');

      INSERT INTO alerts (
        id, category, type, severity, level, scale_score, confidence, title, description, target_data, source,
        source_url, extracted_at, applied_rule, methodology_version, limitations, alternative_explanation,
        requires_human_review, evidence, factors_json, continuity_pattern, explanations_json, documents_json, created_at
      ) VALUES (
        'alert-multi', 'C', 'OFERTA_UNICA', 'MEDIA', 'MEDIA', 4.0, 0.9, 'Alerta multiganador', 'Prueba', 'Prueba',
        'Prueba', 'https://example.test', '2026-01-01', 'test', 'test', 'test', 'test',
        1, 'Prueba', '[]', NULL, '[]', '[]', '2026-01-01'
      );

      INSERT INTO alert_contracts (alert_id, contract_id)
      VALUES ('alert-multi', 'multi-contract');
    `);
    setDbForTests(db);

    const alertasEmpresaA = getAlertasForEmpresa('A11111111');
    const alertasEmpresaB = getAlertasForEmpresa('Empresa Lote B');
    const alertasEmpresaC = getAlertasForEmpresa('C33333333');
    const alertasPadre = getAlertasForEmpresa('Varios adjudicatarios');

    expect(alertasEmpresaA.map((a) => a.id)).toContain('alert-multi');
    expect(alertasEmpresaB.map((a) => a.id)).toContain('alert-multi');
    expect(alertasEmpresaC.map((a) => a.id)).not.toContain('alert-multi');
    expect(alertasPadre.map((a) => a.id)).toContain('alert-multi');

    db.prepare(`
      INSERT INTO lot_awards (id, contract_id, lot_number, awardee, awardee_nif, result_state)
      VALUES ('award-c-2', 'multi-contract', '3', 'Empresa Lote C', 'C33333333', 'Adjudicado')
    `).run();

    expect(getAlertasForEmpresa('C33333333').map((a) => a.id)).not.toContain('alert-multi');

    db.prepare('DELETE FROM lot_awards WHERE id = ?').run('award-c-2');
    db.prepare(`
      INSERT INTO lot_awards (id, contract_id, lot_number, awardee, awardee_nif, result_state)
      VALUES ('award-c-2', 'multi-contract', '2', 'Empresa Lote C', 'C33333333', 'Adjudicado')
    `).run();

    expect(getAlertasForEmpresa('C33333333').map((a) => a.id)).toContain('alert-multi');
    // Once every awarded legacy lot is covered by lot_awards, the new snapshot is authoritative.
    expect(getAlertasForEmpresa('A11111111').map((a) => a.id)).not.toContain('alert-multi');
    expect(getAlertasForEmpresa('Empresa Lote B').map((a) => a.id)).not.toContain('alert-multi');
    expect(getAlertasForEmpresa('D44444444').map((a) => a.id)).not.toContain('alert-multi');
  });

  it('valida la cobertura de lot_awards por número de lote al enriquecer alertas de contratos', () => {
    const source = fs.readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export function getAlertasForContract');
    const end = source.indexOf('export function getGruposEmpresarialesDB', start);
    const fn = source.slice(start, end);

    expect(fn).toContain("lotAwardsAmountCoverageSql('l')");
    expect(fn).not.toContain('count(DISTINCT la.lot_number)');
  });

  it('recupera alertas vinculadas a una empresa adjudicataria', () => {
    const res = getAlertasV2({ limit: 100 });
    const alerta = res.alertas.find(a => a.contratoIds && a.contratoIds.length > 0);
    expect(alerta).toBeDefined();
    if (alerta && alerta.contratoIds) {
      const contractId = alerta.contratoIds[0];
      expect(contractId).toBeDefined();
      // Verificamos que getAlertasForEmpresa responde array
      const alertasEmpresa = getAlertasForEmpresa('A80241789'); // Serveo Servicios
      expect(Array.isArray(alertasEmpresa)).toBe(true);
    }
  });

  it('recupera los grupos empresariales catalogados en la base de datos', () => {
    const grupos = getGruposEmpresarialesDB();
    expect(grupos.length).toBeGreaterThanOrEqual(10);
    const serveo = grupos.find(g => g.grupoId === 'grupo-serveo');
    expect(serveo).toBeDefined();
    expect(serveo?.nombreGrupo).toContain('Serveo');
    expect(serveo?.cifs.length).toBeGreaterThan(0);
  });

  it('incluye adjudicatario, importe comparable formateado en euros y procedimiento en alertas OFERTA_UNICA', () => {
    const res = getAlertasV2({ tipo: 'OFERTA_UNICA', limit: 10 });
    expect(res.alertas.length).toBeGreaterThan(0);

    let importeComparable = 0;
    let importeNoComparable = 0;

    for (const alerta of res.alertas) {
      expect(alerta.adjudicatario).toBeDefined();
      expect(typeof alerta.adjudicatario).toBe('string');
      expect(alerta.adjudicatario!.length).toBeGreaterThan(0);
      expect(alerta.adjudicatario).not.toBe('Sin adjudicatario');

      if (alerta.importe == null) {
        importeNoComparable++;
      } else {
        importeComparable++;
        expect(typeof alerta.importe).toBe('string');
        expect(alerta.importe).toContain('€');
      }

      expect(alerta.procedimiento).toBeDefined();
      expect(typeof alerta.procedimiento).toBe('string');
      expect(alerta.procedimiento!.length).toBeGreaterThan(0);
    }

    expect(importeComparable + importeNoComparable).toBe(res.alertas.length);
  });
  it('incluye el importe de múltiples adjudicaciones de un lote en el volumen auditado', () => {
    const db = createGeneratedTestDb(20261003, 1);
    setDbForTests(db);

    try {
      const contractId = 'generated-20261003-1';
      db.prepare(`
        UPDATE contracts
        SET awardee = 'Varios adjudicatarios',
            awardee_nif = NULL,
            awarded_amount = NULL,
            awarded_amount_incl_vat = NULL,
            award_amount_type = 'total'
        WHERE id = ?
      `).run(contractId);

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name,
          budget_excl_vat, budget_incl_vat, awarded_amount,
          awarded_amount_incl_vat, lot_status, awardee, awardee_nif
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'audit-multi-lot',
        contractId,
        '1',
        'Lote multiganador',
        12000,
        14520,
        null,
        null,
        'Adjudicado',
        null,
        null
      );

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
          offer_count, award_date, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('audit-award-1', contractId, 'GEN/2026/1', '1', 1, 'Empresa A', 'A11111111', 5000, 6050, 1, '2026-12-01', 'Adjudicado');

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
          offer_count, award_date, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('audit-award-2', contractId, 'GEN/2026/1', '1', 2, 'Empresa B', 'B11111111', 7000, 8470, 1, '2026-12-01', 'Adjudicado');

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name,
          budget_excl_vat, awarded_amount, lot_status, awardee
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('alert-lot-cancelled', contractId, '4', 'Lote cancelado', 2500, 2000, 'Cancelado', 'Empresa Cancelada');

      db.prepare(`
        INSERT INTO alerts (
          id, category, type, severity, level, scale_score, confidence, title,
          description, target_data, source, source_url, extracted_at,
          applied_rule, methodology_version, limitations, alternative_explanation,
          requires_human_review, evidence, factors_json, continuity_pattern,
          explanations_json, documents_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'audit-multi-alert', 'C', 'OFERTA_UNICA', 'MEDIA', 'MEDIA', 4, 0.9,
        'Alerta multiganador', 'Prueba', 'Prueba', 'Prueba', 'https://example.test',
        '2026-12-01', 'test', 'test', 'test', 'test', 1, 'Prueba', '[]', null,
        '[]', '[]', '2026-12-01'
      );

      db.prepare('INSERT INTO alert_contracts (alert_id, contract_id) VALUES (?, ?)').run('audit-multi-alert', contractId);

      const kpis = getAuditoriaKpis();
      expect(kpis.totalContratosConAlerta).toBe(1);
      expect(kpis.volumenAuditado).toBe(12000);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('calcula el volumen auditado desde la fuente unificada y sin duplicar contratos con varias alertas', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/db.ts'), 'utf8');
    const start = source.indexOf('const vol = db.prepare');
    const end = source.indexOf('return toPlain({', start);

    expect(source.slice(start, end)).toContain('FROM ${corporateContractSource} l');
    expect(source.slice(start, end)).toContain('SELECT DISTINCT contract_id FROM alert_contracts');
    expect(source.slice(start, end)).not.toContain('FROM contracts l');
  });

  it('usa adjudicaciones de lotes y no PBL como fallback en el detalle económico de alertas', () => {
    const db = createGeneratedTestDb(20261001, 1);
    setDbForTests(db);

    try {
      const contractId = 'generated-20261001-1';
      db.prepare(`
        UPDATE contracts
        SET award_amount_type = 'total',
            awarded_amount = NULL,
            amount_excl_vat = 9000,
            awardee = 'Varios adjudicatarios',
            status = 'Adjudicada'
        WHERE id = ?
      `).run(contractId);

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name,
          budget_excl_vat, awarded_amount, lot_status, awardee
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('alert-lot-1', contractId, '1', 'Lote 1', 3000, 3000, 'Adjudicado', 'Empresa A');

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name,
          budget_excl_vat, awarded_amount, lot_status, awardee
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('alert-lot-2', contractId, '2', 'Lote 2', 6000, 5000, 'Adjudicado', 'Empresa B');

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name,
          budget_excl_vat, awarded_amount, lot_status, awardee
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('alert-lot-3', contractId, '3', 'Lote 3', 4000, 4000, 'Desierto', 'Empresa C');

      db.prepare(`
        INSERT INTO alerts (
          id, category, type, severity, level, scale_score, confidence, title, description, target_data, source,
          source_url, extracted_at, applied_rule, methodology_version, limitations, alternative_explanation,
          requires_human_review, evidence, factors_json, continuity_pattern, explanations_json, documents_json, created_at
        ) VALUES (?, 'C', 'OFERTA_UNICA', 'MEDIA', 'MEDIA', 4, 0.9, 'Prueba', 'Prueba', 'Prueba', 'Prueba',
          'https://example.test', '2026-01-01', 'test', 'test', 'test', 'test', 1, 'Prueba', '[]', NULL, '[]', '[]', ?)
      `).run('alert-lot-test', '2026-01-01');

      db.prepare('INSERT INTO alert_contracts (alert_id, contract_id) VALUES (?, ?)').run('alert-lot-test', contractId);

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
          offer_count, award_date, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('alert-award-1', contractId, 'GEN/2026/1', '1', 1, 'Empresa C', 'C11111111', 2500, 3025, 1, '2026-01-01', 'Adjudicado');

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
          offer_count, award_date, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('alert-award-2', contractId, 'GEN/2026/1', '1', 2, 'Empresa D', 'D11111111', 3500, 4235, 1, '2026-01-01', 'Adjudicado');

      const alertasV2 = getAlertasV2({ tipo: 'OFERTA_UNICA', limit: 10 });
      const alertaV2 = alertasV2.alertas.find((a) => a.id === 'alert-lot-test');
      expect(alertaV2?.adjudicatario).toBe('Empresa A, Empresa B');
      expect(alertaV2?.importe).toContain('8.000');
      expect(alertaV2?.importe).toContain('€');

      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
          offer_count, award_date, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('alert-award-3', contractId, 'GEN/2026/1', '2', 1, 'Empresa E', 'E11111111', 4500, 5445, 1, '2026-01-01', 'Adjudicado');

      const alertasV2Completas = getAlertasV2({ tipo: 'OFERTA_UNICA', limit: 10 });
      const alertaV2Completa = alertasV2Completas.alertas.find((a) => a.id === 'alert-lot-test');
      expect(alertaV2Completa?.adjudicatario).toContain('Empresa C');
      expect(alertaV2Completa?.adjudicatario).toContain('Empresa D');
      expect(alertaV2Completa?.adjudicatario).toContain('Empresa E');
      expect(alertaV2Completa?.importe).toContain('10.500');
      expect(alertaV2Completa?.importe).toContain('€');

      db.prepare(`
        INSERT INTO contract_lots (
          id, contract_id, lot_number, lot_name,
          budget_excl_vat, awarded_amount, lot_status, awardee
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('alert-lot-cancelled', contractId, '4', 'Lote cancelado', 2000, 2000, 'Cancelled', 'Empresa Cancelada');
      db.prepare(`
        INSERT INTO lot_awards (
          id, contract_id, case_number, lot_number, award_index,
          awardee, awardee_nif, awarded_amount, awarded_amount_incl_vat,
          offer_count, award_date, result_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('alert-award-cancelled', contractId, 'GEN/2026/1', '4', 1,
        'Empresa Cancelada', 'X11111111', 2000, 2420, 1, '2026-01-01', 'Adjudicado');

      const alertasV2ConCancelado = getAlertasV2({ tipo: 'OFERTA_UNICA', limit: 10 });
      const alertaV2ConCancelado = alertasV2ConCancelado.alertas.find((a) => a.id === 'alert-lot-test');
      expect(alertaV2ConCancelado?.adjudicatario).not.toContain('Empresa Cancelada');
      expect(alertaV2ConCancelado?.importe).toContain('10.500');

      const alertasDetalleCompletas = getAlertasForContract(contractId);
      const detalleCompleto = alertasDetalleCompletas[0]?.contratosDetalle?.find((c) => c.id === contractId);
      expect(detalleCompleto?.amount).toBe(10500);

      db.prepare('DELETE FROM lot_awards WHERE id = ?').run('alert-award-3');

      const alertas = getAlertasForContract(contractId);
      const detalle = alertas[0]?.contratosDetalle?.find((c) => c.id === contractId);
      expect(detalle).toBeDefined();
      // The remaining lot_awards only cover lot 1, so the complete contract_lots
      // snapshot remains the fallback source until every awarded lot is covered.
      expect(detalle?.amount).toBe(8000);

      db.prepare('DELETE FROM lot_awards WHERE contract_id = ?').run(contractId);
      db.prepare('DELETE FROM contract_lots WHERE contract_id = ?').run(contractId);
      const sinAdjudicacion = getAlertasForContract(contractId);
      const detalleSinAdjudicacion = sinAdjudicacion[0]?.contratosDetalle?.find((c) => c.id === contractId);
      expect(detalleSinAdjudicacion?.amount).toBe(0);
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('no expone importes no comparables en el detalle de contratos de una alerta', () => {
    const vinculado = getDb().prepare(
      "SELECT ac.alert_id, ac.contract_id FROM alert_contracts ac JOIN contracts c ON c.id = ac.contract_id WHERE c.award_amount_type IN ('unitario', 'desconocido') LIMIT 1"
    ).get() as { alert_id: string; contract_id: string } | undefined;
    expect(vinculado).toBeDefined();
    if (!vinculado) return;
    const alertas = getAlertasForContract(vinculado.contract_id);
    const detalle = alertas.flatMap((a) => a.contratosDetalle || []).find((d) => d.id === vinculado.contract_id);
    expect(detalle).toBeDefined();
    expect(detalle?.amount).toBeNull();
  });
});
