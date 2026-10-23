import { describe, it, expect } from 'vitest';
import {
  detectarFraccionamiento,
  casosDelAno,
  bucketDeTipo,
  tokensDeObjeto,
  FraccionamientoContrato,
} from './fraccionamiento';

function contrato(partial: Partial<FraccionamientoContrato> = {}): FraccionamientoContrato {
  return {
    canonicalId: 'B00000000',
    adjudicatario: 'EMPRESA TEST SL',
    nif: 'B00000000',
    grupoId: null,
    grupoNombre: null,
    authorityId: 'authority-test',
    organo: 'Ayuntamiento Test',
    tipoContrato: 'Servicios',
    objeto: '',
    cpv: null,
    importeSinIva: 0,
    fechaAdjudicacion: '2022-01-01',
    ...partial,
  };
}

describe('bucketDeTipo', () => {
  it('asigna bucket por igualdad sobre el tipo normalizado, no por inclusión', () => {
    expect(bucketDeTipo('Obras')).toBe('obras');
    expect(bucketDeTipo(' OBRAS ')).toBe('obras');
    // "igualdad, no includes": un tipo que contiene la palabra no es Obras
    expect(bucketDeTipo('Obras de acondicionamiento')).toBe('no-obras');
    expect(bucketDeTipo('Servicios')).toBe('no-obras');
    expect(bucketDeTipo(null)).toBe('no-obras');
  });
});

describe('tokensDeObjeto', () => {
  it('normaliza tildes, puntuación y stopwords + términos de dominio', () => {
    const tokens = tokensDeObjeto('Servicio de Pintura Viaria: Pintura-Verde, para el Ayuntamiento de Alcázar de San Juan');
    expect(tokens).toContain('pintura');
    expect(tokens).toContain('viaria');
    expect(tokens).toContain('verde');
    expect(tokens).not.toContain('servicio');
    expect(tokens).not.toContain('ayuntamiento');
    expect(tokens).not.toContain('alcazar');
    expect(tokens).not.toContain('de');
  });
});

describe('ventana deslizante de 365 días', () => {
  it('no combina adjudicaciones de órganos distintos con el mismo nombre visible', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ id: 'contract-a', authorityId: 'authority-a', importeSinIva: 8000, fechaAdjudicacion: '2022-01-01' }),
      contrato({ id: 'contract-b', authorityId: 'authority-b', importeSinIva: 8000, fechaAdjudicacion: '2022-02-01' }),
    ]);
    expect(casos).toHaveLength(0);
  });

  it('does not combine contracts without a stable authority identity', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ id: 'unlinked-a', authorityId: null, importeSinIva: 8000, fechaAdjudicacion: '2022-01-01' }),
      contrato({ id: 'unlinked-b', authorityId: null, importeSinIva: 8000, fechaAdjudicacion: '2022-02-01' }),
    ]);
    expect(casos).toHaveLength(0);
  });

  it('dos contratos de 7.500 € separados 364 días → candidato', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 7500, fechaAdjudicacion: '2022-01-01' }),
      contrato({ importeSinIva: 7500, fechaAdjudicacion: '2022-12-31' }),
    ]);
    expect(casos).toHaveLength(1);
    expect(casos[0].suma).toBe(15000);
    expect(casos[0].excesoPct).toBe(0);
    expect(casos[0].numContratos).toBe(2);
  });

  it('dos contratos de 7.500 € separados 366 días → no candidato', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 7500, fechaAdjudicacion: '2022-01-01' }),
      contrato({ importeSinIva: 7500, fechaAdjudicacion: '2023-01-02' }),
    ]);
    expect(casos).toHaveLength(0);
  });

  it('tres contratos de 6.000 € donde el del medio es de otro organismo → no', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 6000, fechaAdjudicacion: '2022-01-01' }),
      contrato({ importeSinIva: 6000, fechaAdjudicacion: '2022-02-01', organo: 'Otro Organismo', authorityId: 'authority-other' }),
      contrato({ importeSinIva: 6000, fechaAdjudicacion: '2022-03-01' }),
    ]);
    expect(casos).toHaveLength(0);
  });

  it('un único contrato de 39.000 € de obras → no', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 39000, tipoContrato: 'Obras', fechaAdjudicacion: '2022-05-01' }),
    ]);
    expect(casos).toHaveLength(0);
  });
});

describe('umbral por tipo (obras 40.000 / no-obras 15.000)', () => {
  it('14.000 € + 2.000 € de obras → no (umbral 40.000)', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 14000, tipoContrato: 'Obras', fechaAdjudicacion: '2022-01-01' }),
      contrato({ importeSinIva: 2000, tipoContrato: 'Obras', fechaAdjudicacion: '2022-02-01' }),
    ]);
    expect(casos).toHaveLength(0);
  });

  it('14.000 € + 2.000 € en no-obras → sí (umbral 15.000)', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 14000, tipoContrato: 'Servicios', fechaAdjudicacion: '2022-01-01' }),
      contrato({ importeSinIva: 2000, tipoContrato: 'Servicios', fechaAdjudicacion: '2022-02-01' }),
    ]);
    expect(casos).toHaveLength(1);
    expect(casos[0].bucketUmbral).toBe('no-obras');
    expect(casos[0].suma).toBe(16000);
  });
});

describe('agregación por grupo empresarial', () => {
  it('does not aggregate company group contracts across same-name authority identities', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ canonicalId: 'B11111111', nif: 'B11111111', adjudicatario: 'FILIAL A SL', authorityId: 'authority-a', importeSinIva: 8000, fechaAdjudicacion: '2022-01-01', grupoId: 'grupo-x', grupoNombre: 'Grupo X' }),
      contrato({ canonicalId: 'B22222222', nif: 'B22222222', adjudicatario: 'FILIAL B SL', authorityId: 'authority-b', importeSinIva: 8000, fechaAdjudicacion: '2022-02-01', grupoId: 'grupo-x', grupoNombre: 'Grupo X' }),
    ]);
    expect(casos).toHaveLength(0);
  });

  it('dos filiales con 8.000 € cada una, mismo organismo → viaGrupo: true', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ canonicalId: 'B11111111', nif: 'B11111111', adjudicatario: 'FILIAL A SL', importeSinIva: 8000, fechaAdjudicacion: '2022-01-01', grupoId: 'grupo-x', grupoNombre: 'Grupo X' }),
      contrato({ canonicalId: 'B22222222', nif: 'B22222222', adjudicatario: 'FILIAL B SL', importeSinIva: 8000, fechaAdjudicacion: '2022-02-01', grupoId: 'grupo-x', grupoNombre: 'Grupo X' }),
    ]);
    expect(casos).toHaveLength(1);
    expect(casos[0].viaGrupo).toBe(true);
    expect(casos[0].grupoNombre).toBe('Grupo X');
    expect(casos[0].suma).toBe(16000);
  });

  it('si una filial sola suma 16.000 € → caso individual con viaGrupo: false, sin duplicar el grupo', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ canonicalId: 'B11111111', nif: 'B11111111', adjudicatario: 'FILIAL A SL', importeSinIva: 8000, fechaAdjudicacion: '2022-01-01', grupoId: 'grupo-x', grupoNombre: 'Grupo X' }),
      contrato({ canonicalId: 'B11111111', nif: 'B11111111', adjudicatario: 'FILIAL A SL', importeSinIva: 8000, fechaAdjudicacion: '2022-02-01', grupoId: 'grupo-x', grupoNombre: 'Grupo X' }),
      contrato({ canonicalId: 'B22222222', nif: 'B22222222', adjudicatario: 'FILIAL B SL', importeSinIva: 8000, fechaAdjudicacion: '2022-03-01', grupoId: 'grupo-x', grupoNombre: 'Grupo X' }),
    ]);
    expect(casos).toHaveLength(1);
    expect(casos[0].viaGrupo).toBe(false);
    expect(casos[0].adjudicatario).toBe('FILIAL A SL');
    expect(casos[0].suma).toBe(16000);
  });
});

describe('ventanas disjuntas', () => {
  it('no fusiona una cadena de ventanas solapadas cuya unión supera 365 días', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 12100, fechaAdjudicacion: '2024-05-13' }),
      contrato({ importeSinIva: 12100, fechaAdjudicacion: '2025-02-23' }),
      contrato({ importeSinIva: 11850, fechaAdjudicacion: '2023-11-02' }),
    ]);
    expect(casos).toHaveLength(1);
    expect(casos[0].numVentanas).toBe(2);
    expect(casos[0].suma).toBe(24200);
    expect(casos[0].fechaInicio).toBe('2024-05-13');
    expect(casos[0].fechaFin).toBe('2025-02-23');
    expect(casos[0].numContratos).toBe(2);
  });

  it('dos ventanas que superan el umbral (2019 y 2023) → numVentanas = 2 y principal la de mayor suma', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 9000, fechaAdjudicacion: '2019-01-10' }),
      contrato({ importeSinIva: 9000, fechaAdjudicacion: '2019-02-10' }),
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2023-01-10' }),
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2023-02-10' }),
    ]);
    expect(casos).toHaveLength(1);
    expect(casos[0].numVentanas).toBe(2);
    expect(casos[0].suma).toBe(18000);
    expect(casos[0].fechaInicio).toBe('2019-01-10');
    expect(casos[0].fechaFin).toBe('2019-02-10');
    expect(casos[0].numContratos).toBe(2);
  });
});

describe('similitud de objetos', () => {
  it('objetos idénticos → similitud cercana a 1', () => {
    const objeto = 'Pintura vial de la avenida constitución';
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2022-01-01', objeto }),
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2022-02-01', objeto }),
    ]);
    expect(casos[0].similitudObjetos).toBeGreaterThanOrEqual(0.99);
    // sim >= 0.5 pero exceso < 20% → severidad media
    expect(casos[0].severidad).toBe('media');
  });

  it('objetos idénticos y exceso ≥ 20% → severidad alta', () => {
    const objeto = 'Pintura vial de la avenida constitución';
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 10000, fechaAdjudicacion: '2022-01-01', objeto }),
      contrato({ importeSinIva: 10000, fechaAdjudicacion: '2022-02-01', objeto }),
    ]);
    expect(casos[0].similitudObjetos).toBeGreaterThanOrEqual(0.99);
    expect(casos[0].excesoPct).toBeGreaterThanOrEqual(20);
    expect(casos[0].severidad).toBe('alta');
  });

  it('objetos sin tokens comunes tras normalizar → similitud cercana a 0', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2022-01-01', objeto: 'Reforma de fachada del museo municipal' }),
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2022-02-01', objeto: 'Compra de ordenadores portátiles para biblioteca' }),
    ]);
    expect(casos[0].similitudObjetos).toBeLessThanOrEqual(0.05);
    expect(casos[0].severidad).toBe('baja');
  });

  it('CPV compartido a 5 dígitos refuerza la similitud a 0.8', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2022-01-01', objeto: 'Reforma de fachada del museo', cpv: '45223210' }),
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2022-02-01', objeto: 'Compra de ordenadores portátiles', cpv: '45223998' }),
    ]);
    expect(casos[0].similitudObjetos).toBe(0.8);
  });
});

describe('preRDL2020', () => {
  it('ventana que termina en 2019-12 → preRDL2020: true', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2019-12-01' }),
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2019-12-15' }),
    ]);
    expect(casos[0].preRDL2020).toBe(true);
  });

  it('ventana que termina en 2020-03 → preRDL2020: false', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2020-02-20' }),
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2020-03-05' }),
    ]);
    expect(casos[0].preRDL2020).toBe(false);
  });
});

describe('contratos sin importe de adjudicación', () => {
  it('se excluyen de la suma y se contabilizan en contratosSinImporte', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2022-01-10' }),
      contrato({ importeSinIva: 0, fechaAdjudicacion: '2022-01-20' }),
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2022-02-10' }),
    ]);
    expect(casos).toHaveLength(1);
    expect(casos[0].suma).toBe(16000);
    expect(casos[0].numContratos).toBe(2);
    expect(casos[0].contratosSinImporte).toBe(1);
  });
});

describe('casosDelAno', () => {
  function casoBase(fechaInicio: string, fechaFin: string) {
    return {
      adjudicatario: 'EMPRESA SL', nif: 'B00000000', canonicalId: 'B00000000',
      grupoNombre: null, viaGrupo: false, organo: 'Ayuntamiento Test',
      bucketUmbral: 'no-obras' as const, umbral: 15000, numContratos: 2,
      suma: 16000, excesoPct: 7, fechaInicio, fechaFin,
      spanDias: 30, numVentanas: 1, similitudObjetos: 0.8,
      severidad: 'media' as const, preRDL2020: false,
      objetos: [], contratosSinImporte: 0,
      scoreEscala: 5,
    };
  }

  it('incluye casos cuyo periodo solapa el ejercicio y excluye el resto', () => {
    const casos = [
      casoBase('2024-03-01', '2025-01-15'),  // toca 2024 y 2025
      casoBase('2025-06-01', '2026-03-01'),  // toca 2025 y 2026
      casoBase('2022-01-01', '2022-12-31'),  // solo 2022
    ];
    expect(casosDelAno(casos, 2025)).toHaveLength(2);
    expect(casosDelAno(casos, 2026)).toHaveLength(1);
    expect(casosDelAno(casos, 2023)).toHaveLength(0);
  });
});

describe('orden de salida', () => {
  it('desempata casos con misma severidad y exceso de forma determinista', () => {
    const { casos } = detectarFraccionamiento([
      contrato({ canonicalId: 'B22222222', nif: 'B22222222', adjudicatario: 'ZETA SL', importeSinIva: 10000, fechaAdjudicacion: '2022-01-01', objeto: 'Servicio Z' }),
      contrato({ canonicalId: 'B22222222', nif: 'B22222222', adjudicatario: 'ZETA SL', importeSinIva: 10000, fechaAdjudicacion: '2022-02-01', objeto: 'Servicio Z' }),
      contrato({ canonicalId: 'B11111111', nif: 'B11111111', adjudicatario: 'ALFA SL', importeSinIva: 10000, fechaAdjudicacion: '2022-01-01', objeto: 'Servicio A' }),
      contrato({ canonicalId: 'B11111111', nif: 'B11111111', adjudicatario: 'ALFA SL', importeSinIva: 10000, fechaAdjudicacion: '2022-02-01', objeto: 'Servicio A' }),
    ]);
    expect(casos).toHaveLength(2);
    expect(casos[0].adjudicatario).toBe('ALFA SL');
    expect(casos[1].adjudicatario).toBe('ZETA SL');
  });

  it('ordena por severidad (alta → baja) y luego por exceso descendente', () => {
    const objeto = 'Pintura vial de la avenida constitución';
    const { casos } = detectarFraccionamiento([
      // baja: sin similitud, exceso bajo
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2022-01-01', objeto: 'Reforma de fachada del museo' }),
      contrato({ importeSinIva: 8000, fechaAdjudicacion: '2022-02-01', objeto: 'Compra de ordenadores portátiles' }),
      // alta: objetos idénticos y exceso > 20%
      contrato({ canonicalId: 'B99999999', nif: 'B99999999', adjudicatario: 'OTRA SL', importeSinIva: 10000, fechaAdjudicacion: '2022-03-01', objeto }),
      contrato({ canonicalId: 'B99999999', nif: 'B99999999', adjudicatario: 'OTRA SL', importeSinIva: 10000, fechaAdjudicacion: '2022-04-01', objeto }),
    ]);
    expect(casos).toHaveLength(2);
    expect(casos[0].severidad).toBe('alta');
    expect(casos[1].severidad).toBe('baja');
  });
});

describe('clasificador de continuidad y periodicidad (reducción de falsos positivos)', () => {
  it('clasifica seguros anuales en ejercicios sucesivos como recurrente_anual y modera severidad', () => {
    const { casos } = detectarFraccionamiento([
      contrato({
        adjudicatario: 'ZURICH INSURANCE PLC',
        importeSinIva: 10000,
        fechaAdjudicacion: '2024-01-10',
        objeto: 'Póliza de seguro de daños materiales ejercicio 2024',
      }),
      contrato({
        adjudicatario: 'ZURICH INSURANCE PLC',
        importeSinIva: 10000,
        fechaAdjudicacion: '2024-12-15',
        objeto: 'Póliza de seguro de daños materiales ejercicio 2025',
      }),
    ]);
    expect(casos).toHaveLength(1);
    expect(casos[0].patronContinuidad).toBe('recurrente_anual');
    expect(casos[0].severidad).not.toBe('alta');
    expect(casos[0].justificacionPatron).toContain('Contratación distribuida periódicamente');
  });

  it('clasifica contratos con públicos diferenciados (infantil vs juvenil) como patron_concentracion', () => {
    const { casos } = detectarFraccionamiento([
      contrato({
        adjudicatario: 'TURIAVENTURA SL',
        importeSinIva: 10000,
        fechaAdjudicacion: '2024-06-01',
        objeto: 'Campamento infantil multiaventura verano',
      }),
      contrato({
        adjudicatario: 'TURIAVENTURA SL',
        importeSinIva: 10000,
        fechaAdjudicacion: '2024-06-20',
        objeto: 'Campamento juvenil multiaventura verano',
      }),
    ]);
    expect(casos).toHaveLength(1);
    expect(casos[0].patronContinuidad).toBe('patron_concentracion');
    expect(casos[0].justificacionPatron).toContain('públicos o proyectos diferenciados');
    expect(casos[0].severidad).toBe('media');
    expect(casos[0].scoreEscala).toBeGreaterThanOrEqual(3.0);
    expect(casos[0].scoreEscala).toBeLessThanOrEqual(5.0);
    expect(casos[0].explicacionesAlternativas?.length).toBeGreaterThan(0);
    expect(casos[0].documentosInvestigacion?.length).toBeGreaterThan(0);
  });

  it('clasifica servicios para distintos eventos culturales como patron_concentracion con severidad media', () => {
    const { casos } = detectarFraccionamiento([
      contrato({
        adjudicatario: 'TECNICA SONIDO SL',
        importeSinIva: 10000,
        cpv: '92312000',
        fechaAdjudicacion: '2025-08-25',
        objeto: 'Sonido e iluminación para la Feria y Fiestas 2025',
      }),
      contrato({
        adjudicatario: 'TECNICA SONIDO SL',
        importeSinIva: 10000,
        cpv: '92312000',
        fechaAdjudicacion: '2025-10-10',
        objeto: 'Sonido e iluminación para el evento Lebowski Blues Festival',
      }),
    ]);
    expect(casos).toHaveLength(1);
    expect(casos[0].patronContinuidad).toBe('patron_concentracion');
    expect(casos[0].severidad).toBe('media');
    expect(casos[0].scoreEscala).toBeGreaterThanOrEqual(3.0);
    expect(casos[0].scoreEscala).toBeLessThanOrEqual(5.0);
  });

  it('clasifica contratos idénticos en ventana muy corta (< 90 días) como posible_fraccionamiento con escala > 5', () => {
    const { casos } = detectarFraccionamiento([
      contrato({
        adjudicatario: 'CONSTRUCTORA TEST SL',
        importeSinIva: 12000,
        tipoContrato: 'Servicios',
        fechaAdjudicacion: '2024-05-01',
        objeto: 'Pintura y marcaje de viales zona norte',
      }),
      contrato({
        adjudicatario: 'CONSTRUCTORA TEST SL',
        importeSinIva: 12000,
        tipoContrato: 'Servicios',
        fechaAdjudicacion: '2024-05-25',
        objeto: 'Pintura y marcaje de viales zona norte',
      }),
    ]);
    expect(casos).toHaveLength(1);
    expect(casos[0].patronContinuidad).toBe('posible_fraccionamiento');
    expect(casos[0].severidad).toBe('alta');
    expect(casos[0].scoreEscala).toBeGreaterThan(5.0);
  });

  it('clasifica contratos separados > 240 días sin palabras clave anuales como recurrente_anual y modera severidad', () => {
    const { casos } = detectarFraccionamiento([
      contrato({
        adjudicatario: 'CONSTRUCTORA TEST SL',
        importeSinIva: 10000,
        fechaAdjudicacion: '2022-01-01',
        objeto: 'Pintura y marcaje de viales zona norte',
      }),
      contrato({
        adjudicatario: 'CONSTRUCTORA TEST SL',
        importeSinIva: 10000,
        fechaAdjudicacion: '2022-09-01',
        objeto: 'Pintura y marcaje de viales zona norte',
      }),
    ]);
    expect(casos).toHaveLength(1);
    expect(casos[0].patronContinuidad).toBe('recurrente_anual');
    expect(casos[0].spanDias).toBeGreaterThanOrEqual(240);
    expect(casos[0].severidad).toBe('media');
    expect(casos[0].scoreEscala).toBeGreaterThanOrEqual(3.0);
    expect(casos[0].scoreEscala).toBeLessThanOrEqual(5.0);
  });
});
