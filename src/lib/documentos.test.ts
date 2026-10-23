import { describe, it, expect } from 'vitest';
import { getLicitacionById, getAlertasForContract, getDocumentosForContract } from './db';
import { classifyDocument } from '../../scripts/sync-documentos';

describe('Document Classification and Risk Mitigation', () => {
  it('correctly identifies abnormality justification reports by title', () => {
    const report = classifyDocument('Informe sobre las ofertas incursas en presunción de anormalidad');
    expect(report.es_justificacion_anormalidad).toBe(1);
    expect(report.tipo_documento).toBe('INFORME_ANORMALIDAD');

    const regularDoc = classifyDocument('Pliego de Cláusulas Administrativas Particulares');
    expect(report.es_justificacion_anormalidad).not.toBe(0);
    expect(regularDoc.es_justificacion_anormalidad).toBe(0);
    expect(regularDoc.tipo_documento).toBe('PLIEGO');

    const minutesDoc = classifyDocument('Acta 1ª Sesión Mesa Contratación');
    expect(minutesDoc.tipo_documento).toBe('ACTA_MESA');
    expect(minutesDoc.es_justificacion_anormalidad).toBe(0);
  });

  it('verifies that contract 19512581 has official documents and justified low bid alert', () => {
    const lic = getLicitacionById('19512581');
    expect(lic).not.toBeNull();

    // 1. Single lot verification
    expect(lic?.lotizacion?.lotizado).toBe(false);
    expect(lic?.lotizacion?.numLotes).toBe(1);

    // 2. Attached documents
    const docs = getDocumentosForContract(lic!.id);
    expect(docs.length).toBeGreaterThan(0);
    const docAnormalidad = docs.find(d => d.es_justificacion_anormalidad);
    expect(docAnormalidad).toBeDefined();
    expect(docAnormalidad?.titulo).toContain('anormalidad');
    expect(docAnormalidad?.url).toContain('GetDocumentByIdServlet');

    // 3. Alert is marked as justified with reduced severity
    const alertas = getAlertasForContract(lic!.id);
    const alertaBaja = alertas.find(a => a.tipo === 'BAJA_ACUSADA');
    expect(alertaBaja).toBeDefined();
    expect(alertaBaja?.severidad).toBe('INFORMATIVA');
    expect(alertaBaja?.justificada).toBe(true);
    expect(alertaBaja?.documentoJustificacionUrl).toBe(docAnormalidad?.url);
    expect(alertaBaja?.titulo).toContain('baja justificada y admitida');
  });
});
