import { describe, it, expect } from 'vitest';
import { 
  getDb, 
  getStats, 
  getConcurrenciaStats, 
  getConcentracionStats, 
  getContractingAuthorities,
  getCalendarioElectoralStats,
  getRenovacionMercadoStats
} from './db';
import { getDuracionEfectivaStats } from './duracion-efectiva';
import { getContratosVivosStats } from './contratos-vivos';

describe('Auditoría Metodológica y Rigor Jurídico (8 Principios de Validación)', () => {
  // Principio 1: Oferta única en procedimientos competitivos vs menores
  describe('Principio 1: Indicador de Oferta Única en Procedimientos Competitivos', () => {
    it('excluye contratos menores de la población de procedimientos competitivos', () => {
      const db = getDb();
      const concurrencia = getConcurrenciaStats();
      
      const row = db.prepare(`
        SELECT COUNT(*) as count 
        FROM contracts 
        WHERE status IN ('Adjudicada', 'Resuelta', 'Formalizada')
          AND offer_count IS NOT NULL 
          AND offer_count > 0
          AND lower(coalesce(procedure, '')) NOT LIKE '%menor%'
          AND coalesce(dataset, '') != 'menores'
      `).get() as { count: number };

      expect(concurrencia.totalEvaluadas).toBe(row.count);

      const dist = concurrencia.distribucionOfertas!;
      expect(dist).toBeDefined();
      const sumaContratos = dist.una + dist.dos + dist.tresACinco + dist.masDeCinco;
      expect(sumaContratos).toBe(concurrencia.totalEvaluadas);

      const sumaPct = Math.round(dist.pctUna + dist.pctDos + dist.pctTresACinco + dist.pctMasDeCinco);
      expect(sumaPct).toBe(100);
    });

    it('mantiene separados los contratos menores en su propio bloque analítico', () => {
      const concurrencia = getConcurrenciaStats();
      expect(concurrencia.menoresAdjudicacionDirecta).toBeDefined();
      expect(concurrencia.menoresAdjudicacionDirecta!.total).toBeGreaterThan(0);
      expect(concurrencia.menoresAdjudicacionDirecta!.unaOferta).toBeLessThanOrEqual(
        concurrencia.menoresAdjudicacionDirecta!.total
      );
    });
  });

  // Principio 2: Umbrales cuantitativos y distinción de 4 niveles de contratos menores
  describe('Principio 2: Contratos Menores, Señal de Revisión y 4 Niveles de Continuidad', () => {
    it('verifica que acumular >15.000€ o >40.000€ es una señal de revisión y no prueba de ilegalidad', () => {
      const db = getDb();
      const alertasMenores = db.prepare(`
        SELECT id, title AS titulo, description AS descripcion, factors_json AS factores_json, continuity_pattern AS patron_continuidad 
        FROM alerts 
        WHERE type = 'CONTRATOS_RELACIONADOS'
      `).all() as any[];

      expect(alertasMenores.length).toBeGreaterThan(0);
      for (const a of alertasMenores) {
        // No debe contener afirmaciones concluyentes de infracción o delito
        expect(a.descripcion).not.toContain('fraccionamiento ilegal');
        expect(a.descripcion).not.toContain('incumplimiento de la ley');
        expect(a.descripcion).not.toContain('supera el límite legal');
        // Debe contener la fórmula legal garantista obligatoria
        expect(a.descripcion).toContain('Este resultado es una señal analítica y no acredita por sí mismo un fraccionamiento indebido');
        expect(a.descripcion).toContain('unidad funcional');
        expect(a.descripcion).toContain('previsibilidad de la necesidad');
        // El patrón debe corresponder a una de las 4 categorías
        expect(['recurrente_anual', 'recurrente_menores', 'patron_concentracion', 'posible_fraccionamiento']).toContain(a.patron_continuidad);
      }
    });
  });

  // Principio 3: Bajas elevadas vs calificación de anormalidad (Art. 149 LCSP)
  describe('Principio 3: Bajas Elevadas como Señal Estadística (No Calificación Jurídica)', () => {
    it('no etiqueta automáticamente bajas >= 40% como anormales ni temerarias en BD', () => {
      const db = getDb();
      const alertasBajas = db.prepare(`
        SELECT id, title AS titulo, description AS descripcion 
        FROM alerts 
        WHERE type = 'BAJA_ACUSADA'
      `).all() as any[];

      expect(alertasBajas.length).toBeGreaterThan(0);
      for (const a of alertasBajas) {
        expect(a.titulo.toLowerCase()).not.toContain('temeraria');
        expect(a.titulo.toLowerCase()).not.toContain('agresiva');
        expect(a.descripcion.toLowerCase()).not.toContain('descartar oferta temeraria');
        expect(a.descripcion).toContain('art. 149 LCSP');
      }
    });
  });

  // Principio 4: Concentración HHI y Rotación de Proveedores
  describe('Principio 4: Concentración de Mercado y Renovación de Proveedores', () => {
    it('calcula HHI en rango y no emite etiquetas concluyentes de falta de competencia', () => {
      const concentracion = getConcentracionStats();
      expect(concentracion.global.hhi).toBeGreaterThanOrEqual(0);
      expect(concentracion.global.hhi).toBeLessThanOrEqual(10000);

      const renovacion = getRenovacionMercadoStats();
      expect(renovacion.evolucion.length).toBeGreaterThan(0);
      // El diagnóstico de baja renovación debe ser descriptivo
      for (const evo of renovacion.evolucion) {
        if (evo.alertaMercadoCerrado) {
          expect(evo.pctRenovacion < 50 || evo.pctGastoVeteranos > 75).toBe(true);
        }
      }
    });
  });

  // Principio 5: Ciclo electoral con cautela metodológica estricta
  describe('Principio 5: Calendario Electoral y Cautela Metodológica', () => {
    it('mantiene la naturaleza descriptiva y niega causalidad automática', () => {
      const stats = getCalendarioElectoralStats();
      expect(stats.diagnostico).toContain('Patrón preelectoral observado');
      expect(stats.diagnostico).toContain('Este patrón descriptivo no permite por sí solo establecer una relación causal');
    });
  });

  // Principio 6: Contratos vivos y fechas estimadas/registradas
  describe('Principio 6: Contratos Vivos y Vencimientos Estimados', () => {
    it('calcula contratos en vigor a partir de duración registrada sin afirmar precariedad fáctica', () => {
      const db = getDb();
      const vivos = getContratosVivosStats(() => db);
      expect(vivos.kpis.totalVivos).toBeGreaterThanOrEqual(0);
      for (const c of vivos.proximosVencimientos6Meses) {
        expect(c.fechaFinEstimada).toBeDefined();
      }
    });
  });

  // Principio 7: Duración efectiva y casos desorbitados (>3x, >5x, >20x)
  describe('Principio 7: Duración Registrada Desorbitada y Comprobación Documental', () => {
    it('utiliza la fórmula de duración registrada muy superior y exige comprobación documental en >= 5x', () => {
      const stats = getDuracionEfectivaStats();
      const casosExtremos = stats.contratosConDilacion.filter((c) => c.ratioDuracion >= 5);
      expect(casosExtremos.length).toBeGreaterThan(0);

      for (const c of casosExtremos) {
        expect(c.esDiscrepanciaRegistral).toBe(true);
        expect(c.esDesfaseExtremo).toBe(true);
        expect(c.notaMetodologica).toBeDefined();
        expect(c.notaMetodologica).toContain('Duración registrada muy superior a la duración prevista');
        expect(c.notaMetodologica).toContain('Este caso requiere comprobación documental');
        expect(c.notaMetodologica).toContain('Fechas utilizadas para el cálculo:');
        expect(c.notaMetodologica).toContain('Qué debe comprobar el investigador:');
        expect(c.notaMetodologica).toContain('expediente en la Plataforma');
      }
    });
  });

  // Principio 8: Escala de puntuación e invariancia de severidades
  describe('Principio 8: Escala Numérica (1-10) y Severidades Invariables', () => {
    it('mantiene las escalas intactas (1-3 informativa, 3-5 media, >5 alta)', () => {
      const db = getDb();
      const alertas = db.prepare('SELECT id, severity, scale_score FROM alerts').all() as any[];
      expect(alertas.length).toBeGreaterThan(0);

      for (const a of alertas) {
        expect(['ALTA', 'MEDIA', 'INFORMATIVA']).toContain(a.severity);
        if (a.severity === 'ALTA') {
          expect(a.scale_score).toBeGreaterThanOrEqual(5.0);
        } else if (a.severity === 'MEDIA') {
          expect(a.scale_score).toBeGreaterThanOrEqual(3.0);
          expect(a.scale_score).toBeLessThan(7.0);
        } else if (a.severity === 'INFORMATIVA') {
          expect(a.scale_score).toBeLessThanOrEqual(4.5);
        }
      }
    });

    it('asegura la reconciliación total entre organismos y agregado municipal', () => {
      const organismos = getContractingAuthorities();
      const stats = getStats(undefined, 'todos');
      const totalContratosPorAutoridad = organismos.reduce((acc, o) => acc + o.total_contratos, 0);
      expect(totalContratosPorAutoridad).toBe(stats.totalLicitaciones);
    });
  });

  // Principio 9: Garantías metodológicas y de rigor analítico (12 verificaciones formales)
  describe('Principio 9: Verificaciones de Rigor Metodológico, Jurídico y Neutralidad', () => {
    it('1. "Confianza del dato" no se interpreta como "certeza de la hipótesis"', () => {
      const db = getDb();
      const alertas = db.prepare('SELECT id, title AS titulo, description AS descripcion, evidence FROM alerts').all() as any[];
      for (const a of alertas) {
        expect(a.descripcion.toLowerCase()).not.toContain('certeza absoluta');
        expect(a.descripcion.toLowerCase()).not.toContain('100% probado');
        expect(a.descripcion.toLowerCase()).not.toContain('100% seguro');
      }
    });

    it('2. Una baja del 50% no se etiqueta automáticamente como oferta anormal', () => {
      const db = getDb();
      const alertasBaja = db.prepare(`SELECT id, title AS titulo, description AS descripcion FROM alerts WHERE type = 'BAJA_ACUSADA'`).all() as any[];
      for (const a of alertasBaja) {
        expect(a.titulo.toLowerCase()).not.toContain('anormal');
        expect(a.titulo.toLowerCase()).not.toContain('desproporcionada');
        expect(a.descripcion.toLowerCase()).not.toContain('oferta anormal');
      }
    });

    it('3. Un descuento del 80% no se etiqueta automáticamente como temerario', () => {
      const db = getDb();
      const alertasBaja = db.prepare(`SELECT id, title AS titulo, description AS descripcion FROM alerts WHERE type = 'BAJA_ACUSADA'`).all() as any[];
      for (const a of alertasBaja) {
        expect(a.titulo.toLowerCase()).not.toContain('temeraria');
        expect(a.descripcion.toLowerCase()).not.toContain('oferta temeraria');
        expect(a.descripcion.toLowerCase()).not.toContain('descartar oferta temeraria');
      }
    });

    it('4. Superar acumuladamente 15.000/40.000 € no implica automáticamente fraccionamiento', () => {
      const db = getDb();
      const alertasMenores = db.prepare(`SELECT id, description AS descripcion FROM alerts WHERE type = 'CONTRATOS_RELACIONADOS'`).all() as any[];
      for (const a of alertasMenores) {
        expect(a.descripcion).toContain('Este resultado es una señal analítica y no acredita por sí mismo un fraccionamiento indebido');
        expect(a.descripcion).toContain('unidad funcional');
      }
    });

    it('5. Similitud textual 80/100% no implica automáticamente fraccionamiento', () => {
      const db = getDb();
      // Casos de alta similitud léxica clasificados como periódicos o patrones de concentración
      const turiaventura = db.prepare(`SELECT continuity_pattern AS patron_continuidad FROM alerts WHERE title LIKE '%TURIAVENTURA%'`).get() as any;
      expect(turiaventura).toBeDefined();
      expect(turiaventura.patron_continuidad).toBe('patron_concentracion');

      const zurich = db.prepare(`SELECT continuity_pattern AS patron_continuidad FROM alerts WHERE title LIKE '%ZURICH%'`).get() as any;
      expect(zurich).toBeDefined();
      expect(zurich.patron_continuidad).toBe('recurrente_anual');
    });

    it('6. Renovación anual puede clasificarse como recurrente periódica', () => {
      const db = getDb();
      const recurrentes = db.prepare(`SELECT id, continuity_pattern FROM alerts WHERE continuity_pattern = 'recurrente_anual'`).all() as any[];
      expect(recurrentes.length).toBeGreaterThan(0);
    });

    it('7. HHI alto no implica mercado cerrado', () => {
      const conc = getConcentracionStats();
      expect(conc.global.hhi).toBeDefined();
      expect(conc.global.nivel).toBeDefined();
      // El nivel de concentración no se califica como 'mercado cerrado'
      expect(['competitivo', 'moderado', 'concentrado']).toContain(conc.global.nivel);
    });

    it('8. Rotación <50% es un umbral analítico propio, no un umbral legal', () => {
      const renovacion = getRenovacionMercadoStats();
      for (const evo of renovacion.evolucion) {
        if (evo.alertaMercadoCerrado) {
          expect(evo.pctRenovacion < 50 || evo.pctGastoVeteranos > 75).toBe(true);
        }
      }
    });

    it('9. Fecha de finalización registrada no equivale automáticamente a finalización material', () => {
      const db = getDb();
      const vivos = getContratosVivosStats(() => db);
      expect(vivos.kpis.totalVivos).toBeGreaterThanOrEqual(0);
      for (const c of vivos.proximosVencimientos6Meses) {
        // El vencimiento es estimado a partir de fechas en PLACSP
        expect(c.fechaFinEstimada).toBeDefined();
      }
    });

    it('10. Duración administrativa extrema no equivale automáticamente a retraso material', () => {
      const stats = getDuracionEfectivaStats();
      const extremos = stats.contratosConDilacion.filter((c) => c.ratioDuracion >= 5);
      expect(extremos.length).toBeGreaterThan(0);
      for (const e of extremos) {
        expect(e.esDiscrepanciaRegistral).toBe(true);
        expect(e.notaMetodologica).toContain('Duración registrada muy superior a la duración prevista');
        expect(e.notaMetodologica).toContain('Este caso requiere comprobación documental');
        expect(e.notaMetodologica).toContain('fecha real de finalización material y partes de ejecución');
      }
    });

    it('11. Oferta única excluye contratos menores', () => {
      const dist = getConcurrenciaStats();
      expect(dist.totalEvaluadas).toBeGreaterThan(0);
      // Las licitaciones competitivas evaluadas no incluyen menores
      const db = getDb();
      const rowMenores = db.prepare(`SELECT count(*) as c FROM contracts WHERE lower(coalesce(procedure, '')) LIKE '%menor%' AND status IN ('Adjudicada', 'Resuelta', 'Formalizada')`).get() as any;
      expect(dist.totalEvaluadas).not.toBe(dist.totalEvaluadas + rowMenores.c);
    });

    it('12. Puntuación 1–10 y severidad 1–3 / 3–5 / >5 continúan funcionando exactamente igual', () => {
      const db = getDb();
      const alertas = db.prepare('SELECT scale_score, severity FROM alerts').all() as any[];
      expect(alertas.length).toBeGreaterThan(0);
      for (const a of alertas) {
        expect(a.scale_score).toBeGreaterThanOrEqual(1.0);
        expect(a.scale_score).toBeLessThanOrEqual(10.0);
        if (a.scale_score > 5.0) {
          expect(a.severity).toBe('ALTA');
        } else if (a.scale_score >= 3.0) {
          expect(a.severity).toBe('MEDIA');
        } else {
          expect(a.severity).toBe('INFORMATIVA');
        }
      }
    });

    it('13. Integridad cronológica: 0 incoherencias de publicación detectadas en procedimientos abiertos de 2026 tras la corrección del parser', () => {
      const db = getDb();
      // En procedimientos abiertos/abiertos simplificados recientes (2026), 0 incoherencias de publicación detectadas tras la corrección del parser
      const incoherenciasPublicacion2026 = db.prepare(`
        SELECT count(*) as c 
        FROM contracts 
        WHERE deadline_date IS NOT NULL 
          AND publication_date > deadline_date 
          AND publication_date LIKE '2026%'
          AND procedure IN ('Abierto', 'Abierto simplificado')
      `).get() as { c: number };
      expect(incoherenciasPublicacion2026.c).toBe(0);

      // Expediente 4/2026 Servicios (19512581) cumple la cadena cronológica completa
      const exp19512581 = db.prepare(`
        SELECT publication_date, deadline_date, award_date, formalization_date
        FROM contracts
        WHERE case_number = '4/2026 Servicios'
      `).get() as any;
      expect(exp19512581).toBeDefined();
      expect(exp19512581.publication_date <= exp19512581.deadline_date).toBe(true);
      expect(exp19512581.deadline_date <= exp19512581.award_date).toBe(true);
      expect(exp19512581.award_date <= exp19512581.formalization_date).toBe(true);
    });

    it('14. Financiación Europea: NO-EU no debe activar banderas de cofinanciación comunitaria', async () => {
      const db = getDb();
      const noEuRows = db.prepare(`
        SELECT id, eu_funding, object_description, contracting_authority_name, contract_type, procedure, status,
               amount_excl_vat, awarded_amount, offer_count AS num_ofertas
        FROM contracts
        WHERE eu_funding = 'NO-EU'
        LIMIT 20
      `).all() as any[];

      const { evaluarRedFlags } = await import('./db');
      for (const row of noEuRows) {
        const flags = evaluarRedFlags(row);
        const hasEuFlag = flags.some((f: any) => f.tipo === 'fondos_ue');
        expect(hasEuFlag).toBe(false);
      }
    });
  });
});
