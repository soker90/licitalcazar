import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGeneratedTestDb } from './test-db';
import { setDbForTests } from './db';
import { getAlertasExportData, getLicitacionesExportData } from './export';

describe('exportación de adjudicaciones por lote con tipo agregado desconocido', () => {
  afterEach(() => setDbForTests(null));

  it('conserva importes comparables de lotes aunque el tipo del contrato padre sea desconocido', () => {
    const db = createGeneratedTestDb(20261015, 1);
    const contractId = 'generated-20261015-1';

    db.prepare(`UPDATE contracts
      SET year = 2024, award_amount_type = 'desconocido',
          awarded_amount = NULL, awarded_amount_incl_vat = NULL,
          awardee = 'Varios adjudicatarios', is_lotized = 1, lot_count = 1
      WHERE id = ?`).run(contractId);

    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, lot_status,
      awarded_amount, awarded_amount_incl_vat
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'export-unknown-parent-lot', contractId, 'GEN/2024/unknown', '1',
      'Lote único', 'Adjudicado', 1200, 1452
    );

    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awarded_amount, awarded_amount_incl_vat, result_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'export-unknown-parent-award', contractId, 'GEN/2024/unknown', '1', 0,
      'Empresa Lote', 1200, 1452, 'Adjudicado'
    );
    db.prepare(`INSERT INTO alerts (
      id, category, type, severity, level, confidence, title, description,
      target_data, source, source_url, extracted_at, applied_rule,
      methodology_version, limitations, alternative_explanation, evidence,
      factors_json, created_at
    ) VALUES (
      'export-unknown-parent-alert', 'A', 'OFERTA_UNICA', 'MEDIA', 'media', 100,
      'Alerta de prueba', 'Descripción', 'Dato objetivo', 'PLACSP',
      'https://example.test/alert', '2024-01-01T00:00:00.000Z', 'Regla', 'v1',
      'Limitaciones', 'Explicación alternativa', 'Evidencia', '[]',
      '2024-01-01T00:00:00.000Z'
    )`).run();
    db.prepare('INSERT INTO alert_contracts (alert_id, contract_id) VALUES (?, ?)')
      .run('export-unknown-parent-alert', contractId);

    setDbForTests(db);
    try {
      const row = getLicitacionesExportData().find((item) => item.id === contractId);
      expect(row?.importe_adjudicacion_sin_iva).toBe(1200);
      expect(row?.importe_adjudicacion_con_iva).toBe(1452);
      expect(row?.tipo_importe_adjudicacion).toBe('desconocido');

      const alert = getAlertasExportData().find((item) => item.id === 'export-unknown-parent-alert');
      expect(alert?.importe).toContain('1.200');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('does not export a partial lot amount when the parent amount type is unknown', () => {
    const db = createGeneratedTestDb(20261016, 1);
    const contractId = 'generated-20261016-1';
    db.prepare(`UPDATE contracts
      SET year = 2024, award_amount_type = 'desconocido',
          awarded_amount = NULL, awardee = 'Varios adjudicatarios',
          is_lotized = 1, lot_count = 2
      WHERE id = ?`).run(contractId);
    db.prepare(`INSERT INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_status, awardee, awarded_amount
    ) VALUES
      ('alert-partial-lot-1', ?, 'GEN/2024/partial-alert', '1', 'Adjudicado', 'Empresa A', 800),
      ('alert-partial-lot-2', ?, 'GEN/2024/partial-alert', '2', 'Adjudicado', 'Empresa B', 900)
    `).run(contractId, contractId);
    db.prepare(`INSERT INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index,
      awardee, awarded_amount, result_state
    ) VALUES ('alert-partial-award-1', ?, 'GEN/2024/partial-alert', '1', 0,
      'Empresa A', 800, 'Adjudicado')`).run(contractId);
    db.prepare(`INSERT INTO alerts (
      id, category, type, severity, level, confidence, title, description,
      target_data, source, source_url, extracted_at, applied_rule,
      methodology_version, limitations, alternative_explanation, evidence,
      factors_json, created_at
    ) VALUES (
      'export-partial-lot-alert', 'A', 'OFERTA_UNICA', 'MEDIA', 'media', 100,
      'Alerta de prueba', 'Descripción', 'Dato objetivo', 'PLACSP',
      'https://example.test/alert', '2024-01-01T00:00:00.000Z', 'Regla', 'v1',
      'Limitaciones', 'Explicación alternativa', 'Evidencia', '[]',
      '2024-01-01T00:00:00.000Z'
    )`).run();
    db.prepare('INSERT INTO alert_contracts (alert_id, contract_id) VALUES (?, ?)')
      .run('export-partial-lot-alert', contractId);

    setDbForTests(db);
    try {
      const alert = getAlertasExportData().find((item) => item.id === 'export-partial-lot-alert');
      expect(alert?.importe).toBe('—');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('mantiene las estadísticas de volumen coherentes con la exportación', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'src/app/api/sync/route.ts'),
      'utf8',
    );
    expect(source).toContain("WHEN award_amount_type IS NULL OR award_amount_type IN ('total', 'desconocido')");
  });

});
