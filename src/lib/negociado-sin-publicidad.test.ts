import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { evaluarRedFlags, getLicitacionById, getRedFlagsStats, setDbForTests } from './db';
import { createGeneratedTestDb } from './test-db';

describe('Regla: Procedimiento negociado sin publicidad (Art. 168 y 170.2 LCSP)', () => {
  it('does not treat a same-name vendor contract under another authority as same-authority evidence', () => {
    const db = createGeneratedTestDb(20261022, 2);
    db.prepare("UPDATE contracting_authorities SET name = 'Shared Negotiated Authority'").run();
    db.prepare(`
      UPDATE contracts
      SET contracting_authority_name = 'Shared Negotiated Authority',
          awardee = 'Shared Vendor', awardee_nif = 'B12345678'
      WHERE id IN ('generated-20261022-1', 'generated-20261022-2')
    `).run();
    setDbForTests(db);

    try {
      const flags = evaluarRedFlags({
        id: 'generated-20261022-1',
        contracting_authority_id: 'generated-authority-1',
        contracting_authority_name: 'Shared Negotiated Authority',
        procedure: 'Negociado sin publicidad',
        economic_nature: 'gasto',
        awardee: 'Shared Vendor',
        awardee_nif: 'B12345678',
        amount_excl_vat: 1000,
        awarded_amount: 900,
        award_amount_type: 'total',
        offer_count: 3,
        status: 'Adjudicada',
      }, undefined, [{ document_type: 'PLIEGO', title: 'PCAP' }]);
      const flag = flags.find((item) => item.tipo === 'negociado_sin_publicidad');

      expect(flag?.senalesVerificables).not.toContain('El awardee acumula otros contratos registrados con el mismo órgano.');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  // Caso 1: Expediente 6/2025 (ID 18041232)
  it('Caso 1: Expediente 6/2025 (ID 18041232) activa alerta y no activa alerta de baja', () => {
    const lic = getLicitacionById('18041232');
    expect(lic).not.toBeNull();
    expect(lic!.expediente).toContain('6/2025');

    const flags = lic!.redFlags || [];
    const negFlag = flags.find(f => f.tipo === 'negociado_sin_publicidad');

    expect(negFlag).toBeDefined();
    expect(negFlag?.nivel).toBe('alerta');
    expect(negFlag?.senalesVerificables).toBeDefined();
    expect(negFlag?.senalesVerificables?.length).toBeGreaterThanOrEqual(2);
    // La baja cero no es comparable cuando PLACSP clasifica el importe como no comparable.\n    expect(negFlag?.senalesVerificables?.length).toBe(3);

    // No debe dar alerta de baja
    const bajaFlag = flags.find(f => f.tipo === 'baja_temeraria' || f.tipo === 'baja_temeraria_extrema');
    expect(bajaFlag).toBeUndefined();

    // Verificación de estructura del texto
    expect(negFlag?.hecho).toBe(
      'Según PLACSP, el contrato se tramitó como negociado sin publicidad, sin anuncio previo de licitación.'
    );
    expect(negFlag?.norma).toContain('art. 168 LCSP');
    expect(negFlag?.norma).toContain('art. 170.2 LCSP');
    expect(negFlag?.queComprobar).toBe(
      'Consultar en el expediente el supuesto invocado y las invitaciones enviadas.'
    );
    expect(negFlag?.cierre).toBe('Esta señal no implica por sí misma irregularidad.');
    expect(negFlag?.explicacionAlternativa).toBe(
      'En publicidad en medios concretos puede invocarse exclusividad (solo el titular del medio puede insertar en él), siempre que el expediente lo acredite.'
    );

    // Prohibiciones de redacción estrictas
    const textoCompleto = `${negFlag?.descripcion} ${negFlag?.hecho} ${negFlag?.norma} ${negFlag?.queComprobar} ${negFlag?.explicacionAlternativa} ${negFlag?.cierre}`.toLowerCase();
    expect(textoCompleto).not.toContain('ilegal');
    expect(textoCompleto).not.toContain('incumple');
    expect(textoCompleto).not.toContain('invitación directa a entidades seleccionadas');
    expect(textoCompleto).not.toContain('servicios repetitivos');
    expect(textoCompleto).not.toContain('los organismos fiscalizadores recomiendan');
    expect(textoCompleto).not.toContain('art. 169');
  });

  // Caso 2: Expediente negociado con publicidad -> NO debe activar la regla
  it('Caso 2: Expediente negociado con publicidad NO debe activar la regla', () => {
    const mockLic = {
      id: 'mock-ncp-1',
      expediente: 'NCP/2024/01',
      objeto: 'Servicio de mantenimiento',
      procedimiento: 'Negociado con publicidad',
      importe_sin_iva: 50000,
      importe_adjudicacion: 48000,
      num_ofertas: 3,
    };
    const flags = evaluarRedFlags(mockLic);
    const negFlag = flags.find(f => f.tipo === 'negociado_sin_publicidad');
    expect(negFlag).toBeUndefined();
  });

  // Caso 3: Expediente abierto -> NO debe activar la regla
  it('Caso 3: Expediente abierto NO debe activar la regla', () => {
    const mockLic = {
      id: 'mock-abierto-1',
      expediente: 'AB/2024/01',
      objeto: 'Obras de pavimentación',
      procedimiento: 'Abierto',
      importe_sin_iva: 100000,
      importe_adjudicacion: 95000,
      num_ofertas: 4,
    };
    const flags = evaluarRedFlags(mockLic);
    const negFlag = flags.find(f => f.tipo === 'negociado_sin_publicidad');
    expect(negFlag).toBeUndefined();
  });

  // Caso 4: Expediente con lotes desiertos en procedimiento abierto -> NO debe activar la regla por error
  it('Caso 4: Expediente con lotes desiertos en procedimiento abierto NO activa la regla', () => {
    const mockLic = {
      id: 'mock-abierto-lotes',
      expediente: 'AB-LOTES/2024/02',
      objeto: 'Suministro de mobiliario en varios lotes',
      procedimiento: 'Abierto simplificado',
      importe_sin_iva: 60000,
      importe_adjudicacion: 30000,
      num_ofertas: 1,
    };
    const mockLotes = [
      {
        id: 'lote-1',
        numeroLote: '1',
        nombreLote: 'Lote 1: Mesas',
        presupuestoSinIva: 30000,
        importeSinIva: 30000,
        importeAdjudicacion: 30000,
        estadoLote: 'Adjudicado',
        adjudicatario: 'Muebles SA',
        numOfertas: 1,
      },
      {
        id: 'lote-2',
        numeroLote: '2',
        nombreLote: 'Lote 2: Sillas',
        presupuestoSinIva: 30000,
        importeSinIva: 30000,
        importeAdjudicacion: null,
        estadoLote: 'Desierto',
        adjudicatario: null,
        numOfertas: 0,
      },
    ];
    const flags = evaluarRedFlags(mockLic, mockLotes);
    const negFlag = flags.find(f => f.tipo === 'negociado_sin_publicidad');
    expect(negFlag).toBeUndefined();
  });

  it('excluye contratos patrimoniales aunque el procedimiento sea negociado sin publicidad', () => {
    const mockLic = {
      id: 'mock-patrimonial-nsp',
      expediente: 'PAT/2024/01',
      objeto: 'Arrendamiento de inmueble',
      procedimiento: 'Negociado sin publicidad',
      tipo_contrato: 'Patrimonial',
      tipo_codigo: '50',
      naturaleza_economica: 'ingreso',
      importe_sin_iva: 50000,
      importe_adjudicacion: 50000,
      num_ofertas: 1,
    };
    const flags = evaluarRedFlags(mockLic);
    expect(flags.find(f => f.tipo === 'negociado_sin_publicidad')).toBeUndefined();
  });

  // Evaluación de umbral: nivel 'aviso' con < 2 señales y 'alerta' con >= 2 señales
  it('asigna nivel "aviso" cuando hay menos de 2 señales verificables', () => {
    const mockLic = {
      id: 'mock-nsp-aviso',
      expediente: 'NSP/2024/02',
      objeto: 'Contrato negociado con pliego publicado y múltiples ofertas',
      procedimiento: 'Negociado sin publicidad',
      importe_sin_iva: 50000,
      importe_adjudicacion: 40000, // Hay baja (20%) -> signalC = false
      num_ofertas: 3,              // Hay 3 ofertas -> signalB = false
      acumulaOtrosContratosMismoOrgano: false, // signalD = false
    };
    // Documento pliego presente -> signalA = false
    const mockDocs = [{ tipo_documento: 'PLIEGO', titulo: 'Pliego de Cláusulas' }];
    const flags = evaluarRedFlags(mockLic, undefined, mockDocs);
    const negFlag = flags.find(f => f.tipo === 'negociado_sin_publicidad');

    expect(negFlag).toBeDefined();
    expect(negFlag?.nivel).toBe('aviso');
    expect(negFlag?.senalesVerificables?.length).toBe(0);
  });

  it('escala a nivel "alerta" cuando concurren 2 o más señales verificables', () => {
    const mockLic = {
      id: 'mock-nsp-alerta',
      expediente: 'NSP/2024/03',
      objeto: 'Contrato negociado sin publicidad con 2 señales',
      procedimiento: 'Negociado sin publicidad',
      importe_sin_iva: 50000,
      importe_adjudicacion: 50000, // 0% baja -> signalC = true
      num_ofertas: 1,              // Oferta única -> signalB = true
      acumulaOtrosContratosMismoOrgano: false,
    };
    // Documento pliego presente -> signalA = false
    const mockDocs = [{ tipo_documento: 'PLIEGO', titulo: 'PCAP' }];
    const flags = evaluarRedFlags(mockLic, undefined, mockDocs);
    const negFlag = flags.find(f => f.tipo === 'negociado_sin_publicidad');

    expect(negFlag).toBeDefined();
    expect(negFlag?.nivel).toBe('alerta');
    expect(negFlag?.senalesVerificables?.length).toBe(2);
  });

  it('el resumen pasa los lotes con la forma que espera evaluarRedFlags', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT, case_number TEXT, object_description TEXT,
        contracting_authority_name TEXT, awarded_amount REAL, awardee TEXT,
        offer_count INTEGER, amount_excl_vat REAL, dataset TEXT,
        contract_type TEXT, procedure TEXT, eu_funding TEXT,
        award_amount_type TEXT, year INTEGER, scope TEXT,
        awardee_nif TEXT, economic_nature TEXT, contract_type_code TEXT,
        estimated_value REAL, urgency TEXT
      );
      CREATE TABLE contract_lots (
        contract_id TEXT, lot_number TEXT, lot_name TEXT,
        budget_excl_vat REAL, awarded_amount REAL, lot_status TEXT,
        awardee TEXT, awardee_nif TEXT, offer_count INTEGER
      );
    `);
    db.prepare(`
      INSERT INTO contracts (
        id, case_number, object_description, contracting_authority_name,
        awarded_amount, awardee, offer_count, amount_excl_vat, dataset,
        contract_type, procedure, eu_funding, award_amount_type, year,
        scope, awardee_nif, economic_nature
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'nsp-lots-1', 'NSP/2026/01', 'Suministro en dos lotes',
      'Ayuntamiento de Prueba', 20000, 'Empresa A', 1, 20000, 'licitaciones',
      'Suministros', 'Negociado sin publicidad', null, 'total', 2026,
      'Directa Municipal', 'B12345678', 'gasto'
    );
    db.prepare(`
      INSERT INTO contract_lots (
        contract_id, lot_number, lot_name, budget_excl_vat,
        awarded_amount, lot_status, awardee, awardee_nif, offer_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('nsp-lots-1', '1', 'Lote 1', 10000, 10000, 'Adjudicado', 'Empresa A', 'B12345678', 1);
    db.prepare(`
      INSERT INTO contract_lots (
        contract_id, lot_number, lot_name, budget_excl_vat,
        awarded_amount, lot_status, awardee, awardee_nif, offer_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('nsp-lots-1', '2', 'Lote 2', 10000, 10000, 'Adjudicado', 'Empresa A', 'B12345678', 1);

    setDbForTests(db);
    try {
      const stats = getRedFlagsStats(2026);
      expect(stats.topExpedientesConAlertas).toHaveLength(1);
      expect(stats.topExpedientesConAlertas[0].alerts[0]).toContain('Señal de Verificación Reforzada');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('evalúa la baja cero con cobertura completa por lote aunque el importe agregado sea desconocido', () => {
    const mockLic = {
      id: 'mock-nsp-lots-unknown-total',
      expediente: 'NSP/2026/LOTES',
      objeto: 'Servicio dividido en dos lotes',
      procedimiento: 'Negociado sin publicidad',
      importe_sin_iva: 20000,
      importe_adjudicacion: 20000,
      award_amount_type: 'desconocido',
      num_ofertas: 3,
      acumulaOtrosContratosMismoOrgano: false,
    };
    const lots = [
      {
        id: 'lot-1', numeroLote: '1', nombreLote: 'Lote 1',
        presupuestoSinIva: 10000, importeSinIva: 10000, importeAdjudicacion: 10000,
        estadoLote: 'Adjudicado', adjudicatario: 'Empresa A', numOfertas: 3,
      },
      {
        id: 'lot-2', numeroLote: '2', nombreLote: 'Lote 2',
        presupuestoSinIva: 10000, importeSinIva: 10000, importeAdjudicacion: 10000,
        estadoLote: 'Adjudicado', adjudicatario: 'Empresa B', numOfertas: 3,
      },
    ];
    const docs = [{ tipo_documento: 'PLIEGO', titulo: 'PCAP' }];
    const flags = evaluarRedFlags(mockLic, lots, docs);
    const negFlag = flags.find(f => f.tipo === 'negociado_sin_publicidad');

    expect(negFlag?.senalesVerificables).toContain(
      '0 % de baja sobre el presupuesto en los lotes adjudicados.'
    );
  });

  it('el componente ContractAlertsCard actualiza el cuadro cuando no hay señales y lo oculta cuando hay señales activas', async () => {
    const fs = await import('fs');
    const cardContent = fs.readFileSync('src/components/ContractAlertsCard.tsx', 'utf-8');

    // Comprueba el texto transparente y riguroso cuando no hay reglas activadas
    expect(cardContent).toContain(
      'No se han activado las reglas: Procedimiento negociado sin publicidad (art. 168 LCSP), Oferta única en concurso competitivo, Baja desproporcionada sobre PBL (art. 149 LCSP), ni Acumulación sobre umbral analítico de contratos menores (art. 118 LCSP).'
    );

    // Comprueba que no se muestra el cuadro verde si hay alguna alerta o aviso activo
    expect(cardContent).toContain('hasActiveSignals');
    expect(cardContent).toContain("rf.level === 'alerta' || rf.level === 'aviso'");
  });
});
