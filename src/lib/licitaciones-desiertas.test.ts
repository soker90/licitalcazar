import { describe, it, expect } from 'vitest';
import { getDb, evaluarRedFlags } from './db';

describe('Integridad metodológica: Licitaciones desiertas y alertas de concurrencia única', () => {
  it('la base contiene licitaciones desiertas sin adjudicatario', () => {
    const db = getDb();
    const lic = db.prepare("SELECT * FROM contracts WHERE status = 'Desierta' AND publication_date IS NOT NULL ORDER BY publication_date DESC LIMIT 1").get() as any;
    expect(lic).toBeDefined();
    expect(lic.awardee).toBeFalsy();
    expect(lic.awarded_amount).toBeNull();

    const flags = evaluarRedFlags(lic);
    expect(flags.some((f) => f.tipo === 'oferta_unica')).toBe(false);
    expect(flags.some((f) => f.tipo === 'baja_cero')).toBe(false);
  });

  it('evaluarRedFlags no activa alerta de oferta_unica cuando el contrato está en estado Desierta', () => {
    const mockDesertedLic: any = {
      id: 'test-desierta-1',
      expediente: 'TEST/2025',
      objeto: 'Suministro de prueba',
      procedimiento: 'Abierto simplificado',
      estado: 'Desierta',
      num_ofertas: 1, // 1 oferta presentada pero inadmitida
      adjudicatario: null,
      importe_sin_iva: 50000,
      importe_adjudicacion: null,
      conjunto: 'licitaciones',
    };

    const flags = evaluarRedFlags(mockDesertedLic);
    const ofertaUnicaFlag = flags.find((f) => f.tipo === 'oferta_unica');
    expect(ofertaUnicaFlag).toBeUndefined();
  });

  it('evaluarRedFlags no activa alerta de oferta_unica cuando no hay adjudicatario formal aunque num_ofertas sea 1', () => {
    const mockUnawardedLic: any = {
      id: 'test-sin-adj-1',
      expediente: 'TEST/2025-2',
      objeto: 'Servicio de prueba sin adjudicación',
      procedimiento: 'Abierto',
      estado: 'Resuelta',
      num_ofertas: 1,
      adjudicatario: '',
      importe_sin_iva: 100000,
      importe_adjudicacion: null,
      conjunto: 'licitaciones',
    };

    const flags = evaluarRedFlags(mockUnawardedLic);
    expect(flags.some((f) => f.tipo === 'oferta_unica')).toBe(false);
    expect(flags.some((f) => f.tipo === 'baja_cero')).toBe(false);
  });

  it('evaluarRedFlags sí activa oferta_unica si el procedimiento competitivo concluyó con adjudicatario y oferta única admitida', () => {
    const mockAwardedSingleBidder: any = {
      id: 'test-adjudicada-1',
      expediente: 'TEST/2025-3',
      objeto: 'Servicio adjudicado con licitador único',
      procedimiento: 'Abierto',
      estado: 'Formalizada',
      num_ofertas: 1,
      adjudicatario: 'EMPRESA ADJUDICATARIA S.L.',
      importe_sin_iva: 80000,
      importe_adjudicacion: 75000,
      conjunto: 'licitaciones',
    };

    const flags = evaluarRedFlags(mockAwardedSingleBidder);
    const ofertaUnicaFlag = flags.find((f) => f.tipo === 'oferta_unica');
    expect(ofertaUnicaFlag).toBeDefined();
    expect(ofertaUnicaFlag?.tipo).toBe('oferta_unica');
  });

  it('la tabla precalculada de alertas en la BD no contiene ninguna alerta OFERTA_UNICA para contratos sin adjudicatario o desiertos', () => {
    const db = getDb();
    const invalidAlerts = db.prepare(`
      SELECT a.id, a.title, l.case_number, l.status, l.awardee AS adjudicatario
      FROM alerts a
      JOIN alert_contracts ac ON a.id = ac.alert_id
      JOIN contracts l ON ac.contract_id = l.id
      WHERE a.type = 'OFERTA_UNICA'
        AND (
          l.status IN ('Desierta', 'Anulada')
          OR l.awardee IS NULL
          OR trim(l.awardee) = ''
          OR l.awardee = 'Sin adjudicatario'
        );
    `).all();

    expect(invalidAlerts).toEqual([]);
  });

  it('calcula una cronometría coherente para una licitación desierta actual', async () => {
    const { calcularCronometriaContrato } = await import('./cronometria');
    const db = getDb();
    const lic = db.prepare("SELECT * FROM contracts WHERE status = 'Desierta' AND publication_date IS NOT NULL AND deadline_date IS NOT NULL ORDER BY publication_date DESC LIMIT 1").get() as any;
    expect(lic).toBeDefined();
    const crono = calcularCronometriaContrato(lic);
    expect(crono.estadoCiclo).toBe('desierta_anulada');
    expect(crono.esHistoricoTerminado).toBe(true);
    expect(crono.diasFormalizacion).toBeNull();
    expect(crono.fechaInicioEjecucion).toBeNull();
    expect(crono.fechaFinPrevista).toBeNull();
    expect(crono.fases.some((f) => f.id === 'ejecucion')).toBe(false);
    expect(crono.fases.some((f) => f.id === 'formalizacion')).toBe(false);
  });
});
