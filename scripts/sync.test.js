import { describe, it, expect } from 'vitest';
const { extractEstimatedContractAmount, extractPartyIdByScheme, extractTenderResultLotId } = require('./placsp-xml.js');
const { DatabaseSync } = require('node:sqlite');
const { parseEntry, isNoAwardTenderResult, isDefinitiveNoAwardTenderResult, isPreAwardTenderResult, areAllLotsExplicitlyNoAward, clearPersistedAwardSummary, parseNullableNumber, dedupeTenderResults, selectCurrentTenderResults, aggregateAwardedLotAmounts, aggregateAwardedContractAmounts, selectAwardedLotsForSummary, calculateAwardedLotSummary, deriveContractStatusFromLots, hasIncompleteConsolidatedLotAwardAmounts, hasIncompleteLotAwardAmounts, hasExplicitNumericLotIds, findTenderResultForLot, selectContractLevelTenderResult, extractTenderResultAwardeeNif, selectContractLevelTenderResults, hasLotStructure, isDesertedResultCode, shouldReconcileLots, shouldRepairSingleTenderResultLotRows, shouldAdvanceStatus, preserveSnapshotField, preserveSnapshotCollection, shouldReplaceSnapshotCollection, mergeLotAwardSnapshots, reconcileSnapshotAwardCollections, preserveMissingLotAwardData, buildLotAwards, extractFormalizationDate, extractPublicationDate } = require('./sync.js');
const { TENDER_RESULT_CATALOG_209, isAwardedTenderResult } = require('../src/lib/placsp-codice.js');


describe('Deduplicación de TenderResult por catálogo CODICE', () => {
  it('no fusiona resultados idénticos con distinto listURI', () => {
    const base = {
      numeroLote: '1',
      adjudicatario: 'ACME',
      nifAdjudicatario: 'A1',
      importeSinIva: 100,
      importeConIva: 121,
      fechaAdjudicacion: '2026-01-01',
      resultCode: '8',
      resultState: 'Adjudicado',
      descripcion: 'Resolución',
    };

    const results = dedupeTenderResults([
      { ...base, resultCodeListUri: 'http://catalogo-1' },
      { ...base, resultCodeListUri: 'http://catalogo-2' },
    ]);

    expect(results).toHaveLength(2);
  });
});

describe('Resultados sin adjudicación firme', () => {
  it('identifica BEST_RATED_TENDERER como resultado previo a la adjudicación', () => {
    expect(isPreAwardTenderResult('10', TENDER_RESULT_CATALOG_209)).toBe(true);
    expect(isPreAwardTenderResult('9', TENDER_RESULT_CATALOG_209)).toBe(false);
  });

  it('no suma importes de BEST_RATED_TENDERER al total adjudicado', () => {
    const aggregate = aggregateAwardedLotAmounts([
      { numeroLote: '1', adjudicatario: 'Candidato', importeSinIva: 150, importeConIva: 181.5, resultCode: '10', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ], [
      { importeAdjudicacion: null, importeAdjConIva: null },
    ]);

    expect(aggregate).toEqual({
      awardedAmount: null,
      awardedAmountInclVat: null,
      hasAggregatedAwardAmount: false,
    });
  });
});

describe('Agregación de adjudicaciones a nivel de contrato', () => {
  it('does not double-count an awardee when a lifecycle update adds its NIF', () => {
    const results = [
      { numeroLote: null, adjudicatario: 'ACME', nifAdjudicatario: null, importeSinIva: 100, importeConIva: 121, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: null, adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, importeConIva: 121, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: null, adjudicatario: 'BETA', nifAdjudicatario: 'B2', importeSinIva: 200, importeConIva: 242, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];

    const selected = selectCurrentTenderResults(results);

    expect(selected).toHaveLength(2);
    expect(aggregateAwardedContractAmounts(results)).toEqual({
      awardedAmount: 300,
      awardedAmountInclVat: 363,
      hasAggregatedAwardAmount: true,
    });
  });

  it('sums multiple contract awardees without double-counting lifecycle updates', () => {
    const results = [
      { numeroLote: null, adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, importeConIva: 121, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: null, adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: null, importeConIva: null, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: null, adjudicatario: 'BETA', nifAdjudicatario: 'B2', importeSinIva: 200, importeConIva: 242, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];

    expect(selectCurrentTenderResults(results)).toHaveLength(2);
    expect(aggregateAwardedContractAmounts(results)).toEqual({
      awardedAmount: 300,
      awardedAmountInclVat: 363,
      hasAggregatedAwardAmount: true,
    });
  });

  it('prefers an active contract award over one awardee renouncing', () => {
    const renounced = {
      numeroLote: null,
      trXml: `<cbc:ResultCode listURI="${TENDER_RESULT_CATALOG_209}">5</cbc:ResultCode>
        <cbc:AwardDate>2026-02-10</cbc:AwardDate>
        <cac:WinningParty><cac:PartyName><cbc:Name>ACME</cbc:Name></cac:PartyName></cac:WinningParty>`,
    };
    const formalized = {
      numeroLote: null,
      trXml: `<cbc:ResultCode listURI="${TENDER_RESULT_CATALOG_209}">9</cbc:ResultCode>
        <cbc:AwardDate>2026-02-09</cbc:AwardDate>
        <cac:WinningParty><cac:PartyName><cbc:Name>BETA</cbc:Name></cac:PartyName></cac:WinningParty>`,
    };

    expect(selectContractLevelTenderResult([renounced, formalized])).toBe(formalized);
  });
});

describe('Resumen IVA incluido de adjudicaciones por lote', () => {
  it('clears a representative contract VAT amount when the lot aggregate VAT total is incomplete', () => {
    const catalog = TENDER_RESULT_CATALOG_209;
    const targetAuthorities = {
      byPlacspId: new Map([['authority-placsp-id', { id: 'authority-1', name: 'Ayuntamiento', scope: 'municipal' }]]),
      byDir3: new Map(),
      byNif: new Map(),
      byHistoricalName: new Map(),
      searchNames: [],
    };
    const xml = `<entry>
      <id>placsp-entry-incomplete-vat-aggregate</id>
      <cbc:ContractFolderID>EXP/2026/INCOMPLETE-VAT</cbc:ContractFolderID>
      <cac-place-ext:LocatedContractingParty>
        <cac:PartyName><cbc:Name>Ayuntamiento</cbc:Name></cac:PartyName>
        <cbc:ID schemeName="ID_PLATAFORMA">authority-placsp-id</cbc:ID>
      </cac-place-ext:LocatedContractingParty>
      <cac:ProcurementProject>
        <cbc:Name>Servicio por lotes</cbc:Name><cbc:TypeCode>2</cbc:TypeCode>
        <cac:ProcurementProjectLot><cbc:ID>1</cbc:ID><cac:ProcurementProject><cbc:Name>Lote 1</cbc:Name></cac:ProcurementProject></cac:ProcurementProjectLot>
        <cac:ProcurementProjectLot><cbc:ID>2</cbc:ID><cac:ProcurementProject><cbc:Name>Lote 2</cbc:Name></cac:ProcurementProject></cac:ProcurementProjectLot>
      </cac:ProcurementProject>
      <cac:TenderResult>
        <cbc:ResultCode listURI="${catalog}">9</cbc:ResultCode>
        <cac:WinningParty><cac:PartyName><cbc:Name>Empresa del contrato</cbc:Name></cac:PartyName></cac:WinningParty>
        <cac:AwardedTenderedProject><cbc:TaxExclusiveAmount>50</cbc:TaxExclusiveAmount><cbc:PayableAmount>60.5</cbc:PayableAmount></cac:AwardedTenderedProject>
      </cac:TenderResult>
      <cac:TenderResult>
        <cbc:ProcurementProjectLotID>1</cbc:ProcurementProjectLotID>
        <cbc:ResultCode listURI="${catalog}">9</cbc:ResultCode>
        <cac:WinningParty><cac:PartyName><cbc:Name>Empresa A</cbc:Name></cac:PartyName></cac:WinningParty>
        <cac:AwardedTenderedProject><cbc:TaxExclusiveAmount>100</cbc:TaxExclusiveAmount><cbc:PayableAmount>121</cbc:PayableAmount></cac:AwardedTenderedProject>
      </cac:TenderResult>
      <cac:TenderResult>
        <cbc:ProcurementProjectLotID>2</cbc:ProcurementProjectLotID>
        <cbc:ResultCode listURI="${catalog}">9</cbc:ResultCode>
        <cac:WinningParty><cac:PartyName><cbc:Name>Empresa B</cbc:Name></cac:PartyName></cac:WinningParty>
        <cac:AwardedTenderedProject><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount></cac:AwardedTenderedProject>
      </cac:TenderResult>
    </entry>`;

    const parsed = parseEntry(xml, 'licitaciones', targetAuthorities);

    expect(parsed.importe_adjudicacion).toBe(300);
    expect(parsed.importe_adj_con_iva).toBeNull();
  });
});

describe('Estado de expedientes multi-lote con adjudicaciones vigentes', () => {
  it('derives Formalizada when any eligible lot is formalized', () => {
    expect(deriveContractStatusFromLots([
      { estadoLote: 'Desierto' },
      { estadoLote: 'Adjudicado', importeAdjudicacion: 100 },
      { estadoLote: 'Formalizada', importeAdjudicacion: 200 },
    ])).toBe('Formalizada');
  });

  it('derives Adjudicada when lots are awarded without formalization', () => {
    expect(deriveContractStatusFromLots([
      { estadoLote: 'Desierto' },
      { estadoLote: 'Adjudicado', importeAdjudicacion: 100 },
      { estadoLote: 'Desierto' },
    ])).toBe('Adjudicada');
  });

  it('returns null when all lots are deserted or no-award', () => {
    expect(deriveContractStatusFromLots([
      { estadoLote: 'Desierto' },
      { estadoLote: 'Anulada' },
    ])).toBeNull();
  });

  it('sets parent status to Adjudicada when a contract-level deserted result coexists with awarded lots', () => {
    const catalog = TENDER_RESULT_CATALOG_209;
    const targetAuthorities = {
      byPlacspId: new Map([['authority-placsp-id', { id: 'authority-1', name: 'Ayuntamiento', scope: 'municipal' }]]),
      byDir3: new Map(),
      byNif: new Map(),
      byHistoricalName: new Map(),
      searchNames: [],
    };
    const xml = `<entry>
      <id>placsp-entry-multilot-awards-with-deserted-result</id>
      <cbc:ContractFolderID>EXP/2026/MULTILOT-AWARDS</cbc:ContractFolderID>
      <cac-place-ext:LocatedContractingParty>
        <cac:PartyName><cbc:Name>Ayuntamiento</cbc:Name></cac:PartyName>
        <cbc:ID schemeName="ID_PLATAFORMA">authority-placsp-id</cbc:ID>
      </cac-place-ext:LocatedContractingParty>
      <cac:ProcurementProject>
        <cbc:Name>Enajenación parcelas industriales</cbc:Name><cbc:TypeCode>50</cbc:TypeCode>
        <cac:ProcurementProjectLot><cbc:ID>1</cbc:ID><cac:ProcurementProject><cbc:Name>Lote 1</cbc:Name></cac:ProcurementProject></cac:ProcurementProjectLot>
        <cac:ProcurementProjectLot><cbc:ID>2</cbc:ID><cac:ProcurementProject><cbc:Name>Lote 2</cbc:Name></cac:ProcurementProject></cac:ProcurementProjectLot>
        <cac:ProcurementProjectLot><cbc:ID>3</cbc:ID><cac:ProcurementProject><cbc:Name>Lote 3</cbc:Name></cac:ProcurementProject></cac:ProcurementProjectLot>
      </cac:ProcurementProject>
      <cac:TenderResult>
        <cbc:ResultCode listURI="${catalog}">3</cbc:ResultCode>
        <cbc:Description>Procedimiento desierto</cbc:Description>
      </cac:TenderResult>
      <cac:TenderResult>
        <cbc:ProcurementProjectLotID>1</cbc:ProcurementProjectLotID>
        <cbc:ResultCode listURI="${catalog}">3</cbc:ResultCode>
      </cac:TenderResult>
      <cac:TenderResult>
        <cbc:ProcurementProjectLotID>2</cbc:ProcurementProjectLotID>
        <cbc:ResultCode listURI="${catalog}">8</cbc:ResultCode>
        <cac:WinningParty><cac:PartyName><cbc:Name>Empresa Ganadora</cbc:Name></cac:PartyName></cac:WinningParty>
        <cac:AwardedTenderedProject><cbc:TaxExclusiveAmount>90000</cbc:TaxExclusiveAmount><cbc:PayableAmount>108900</cbc:PayableAmount></cac:AwardedTenderedProject>
      </cac:TenderResult>
      <cac:TenderResult>
        <cbc:ProcurementProjectLotID>3</cbc:ProcurementProjectLotID>
        <cbc:ResultCode listURI="${catalog}">3</cbc:ResultCode>
      </cac:TenderResult>
    </entry>`;

    const parsed = parseEntry(xml, 'licitaciones', targetAuthorities);

    expect(parsed.estado).toBe('Adjudicada');
    expect(parsed.importe_adjudicacion).toBe(90000);
    expect(parsed.importe_adj_con_iva).toBe(108900);
  });
});

describe('Resumen del contrato con varias adjudicaciones incompletas', () => {
  it('no expone el importe de un adjudicatario como total cuando falta el de otro', () => {
    const catalog = TENDER_RESULT_CATALOG_209;
    const targetAuthorities = {
      byPlacspId: new Map([['authority-placsp-id', { id: 'authority-1', name: 'Ayuntamiento', scope: 'municipal' }]]),
      byDir3: new Map(),
      byNif: new Map(),
      byHistoricalName: new Map(),
      searchNames: [],
    };
    const xml = `<entry>
      <id>placsp-entry-incomplete-contract-awards</id>
      <cbc:ContractFolderID>EXP/2026/INCOMPLETE</cbc:ContractFolderID>
      <cac-place-ext:LocatedContractingParty>
        <cac:PartyName><cbc:Name>Ayuntamiento</cbc:Name></cac:PartyName>
        <cbc:ID schemeName="ID_PLATAFORMA">authority-placsp-id</cbc:ID>
      </cac-place-ext:LocatedContractingParty>
      <cac:ProcurementProject>
        <cbc:Name>Servicio compartido</cbc:Name><cbc:TypeCode>2</cbc:TypeCode>
        <cac:BudgetAmount><cbc:TaxExclusiveAmount>1000</cbc:TaxExclusiveAmount><cbc:TotalAmount>1210</cbc:TotalAmount></cac:BudgetAmount>
      </cac:ProcurementProject>
      <cac:TenderResult>
        <cbc:ResultCode listURI="${catalog}">9</cbc:ResultCode>
        <cac:WinningParty><cac:PartyName><cbc:Name>Empresa A</cbc:Name></cac:PartyName></cac:WinningParty>
        <cac:AwardedTenderedProject><cbc:TaxExclusiveAmount>100</cbc:TaxExclusiveAmount><cbc:PayableAmount>121</cbc:PayableAmount></cac:AwardedTenderedProject>
      </cac:TenderResult>
      <cac:TenderResult>
        <cbc:ResultCode listURI="${catalog}">9</cbc:ResultCode>
        <cac:WinningParty><cac:PartyName><cbc:Name>Empresa B</cbc:Name></cac:PartyName></cac:WinningParty>
      </cac:TenderResult>
    </entry>`;

    const parsed = parseEntry(xml, 'licitaciones', targetAuthorities);

    expect(parsed.importe_adjudicacion).toBeNull();
    expect(parsed.importe_adj_con_iva).toBeNull();
    expect(parsed.adjudicatario).toBeNull();
    expect(parsed.nif_adjudicatario).toBeNull();
  });

  it('no expone el importe del contrato cuando las adjudicaciones por lote son incompletas', () => {
    const catalog = TENDER_RESULT_CATALOG_209;
    const targetAuthorities = {
      byPlacspId: new Map([['authority-placsp-id', { id: 'authority-1', name: 'Ayuntamiento', scope: 'municipal' }]]),
      byDir3: new Map(),
      byNif: new Map(),
      byHistoricalName: new Map(),
      searchNames: [],
    };
    const xml = `<entry>
      <id>placsp-entry-incomplete-lot-awards</id>
      <cbc:ContractFolderID>EXP/2026/INCOMPLETE-LOTS</cbc:ContractFolderID>
      <cac-place-ext:LocatedContractingParty>
        <cac:PartyName><cbc:Name>Ayuntamiento</cbc:Name></cac:PartyName>
        <cbc:ID schemeName="ID_PLATAFORMA">authority-placsp-id</cbc:ID>
      </cac-place-ext:LocatedContractingParty>
      <cac:ProcurementProject>
        <cbc:Name>Servicio multi-lote</cbc:Name><cbc:TypeCode>2</cbc:TypeCode>
        <cac:ProcurementProjectLot><cbc:ID>1</cbc:ID><cac:ProcurementProject><cbc:Name>Lote 1</cbc:Name></cac:ProcurementProject></cac:ProcurementProjectLot>
        <cac:ProcurementProjectLot><cbc:ID>2</cbc:ID><cac:ProcurementProject><cbc:Name>Lote 2</cbc:Name></cac:ProcurementProject></cac:ProcurementProjectLot>
      </cac:ProcurementProject>
      <cac:TenderResult>
        <cbc:ResultCode listURI="${catalog}">9</cbc:ResultCode>
        <cac:WinningParty><cac:PartyName><cbc:Name>Empresa General</cbc:Name></cac:PartyName></cac:WinningParty>
        <cac:AwardedTenderedProject><cbc:TaxExclusiveAmount>500</cbc:TaxExclusiveAmount><cbc:PayableAmount>605</cbc:PayableAmount></cac:AwardedTenderedProject>
      </cac:TenderResult>
      <cac:TenderResult>
        <cbc:ProcurementProjectLotID>1</cbc:ProcurementProjectLotID>
        <cbc:ResultCode listURI="${catalog}">9</cbc:ResultCode>
        <cac:WinningParty><cac:PartyName><cbc:Name>Empresa A</cbc:Name></cac:PartyName></cac:WinningParty>
        <cac:AwardedTenderedProject><cbc:TaxExclusiveAmount>100</cbc:TaxExclusiveAmount><cbc:PayableAmount>121</cbc:PayableAmount></cac:AwardedTenderedProject>
      </cac:TenderResult>
      <cac:TenderResult>
        <cbc:ProcurementProjectLotID>2</cbc:ProcurementProjectLotID>
        <cbc:ResultCode listURI="${catalog}">9</cbc:ResultCode>
        <cac:WinningParty><cac:PartyName><cbc:Name>Empresa B</cbc:Name></cac:PartyName></cac:WinningParty>
      </cac:TenderResult>
    </entry>`;

    const parsed = parseEntry(xml, 'licitaciones', targetAuthorities);

    expect(parsed.importe_adjudicacion).toBeNull();
    expect(parsed.importe_adj_con_iva).toBeNull();
    expect(parsed.adjudicatario).toBeNull();
    expect(parsed.nif_adjudicatario).toBeNull();
  });
});

describe('Agregación de importes por lote', () => {
  it('does not double-count duplicate lifecycle entries for one awardee in the parent total', () => {
    const results = [
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, importeConIva: 121, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209, fechaAdjudicacion: '2026-01-01' },
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, importeConIva: 121, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209, fechaAdjudicacion: '2026-01-02' },
      { numeroLote: '1', adjudicatario: 'MENGANITO', nifAdjudicatario: 'B2', importeSinIva: 120, importeConIva: 145.2, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209, fechaAdjudicacion: '2026-01-02' },
    ];

    const aggregate = aggregateAwardedLotAmounts(results, []);

    expect(aggregate).toEqual({
      awardedAmount: 220,
      awardedAmountInclVat: 266.2,
      hasAggregatedAwardAmount: true,
    });
  });

  it('suma todas las adjudicaciones vigentes de un lote con varios adjudicatarios', () => {
    const results = selectCurrentTenderResults([
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, importeConIva: 121, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: '1', adjudicatario: 'MENGANITO', nifAdjudicatario: 'B2', importeSinIva: 120, importeConIva: 145.2, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ]);
    const aggregate = aggregateAwardedLotAmounts(results, [
      { importeAdjudicacion: 100, importeAdjConIva: 121 },
    ]);

    expect(aggregate).toEqual({
      awardedAmount: 220,
      awardedAmountInclVat: 266.2,
      hasAggregatedAwardAmount: true,
    });
  });

  it('does not report a partial parent total when a co-awardee amount is missing', () => {
    const results = [
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, importeConIva: 121, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: '1', adjudicatario: 'MENGANITO', nifAdjudicatario: 'B2', importeSinIva: null, importeConIva: null, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];

    expect(aggregateAwardedLotAmounts(results, [
      { numeroLote: '1', importeAdjudicacion: 100, importeAdjConIva: 121 },
    ])).toEqual({
      awardedAmount: null,
      awardedAmountInclVat: null,
      hasAggregatedAwardAmount: false,
    });
  });
});

describe('Agregación con fallback a lotes consolidados', () => {
  it('excludes stale amounts from deserted, annulled, and cancelled lots when TenderResult amounts are absent', () => {
    const aggregate = aggregateAwardedLotAmounts([], [
      { numeroLote: '1', importeAdjudicacion: 50000, importeAdjConIva: 60500, estadoLote: 'Formalizada' },
      { numeroLote: '2', importeAdjudicacion: 10000, importeAdjConIva: 12100, estadoLote: 'Desierto' },
      { numeroLote: '3', importeAdjudicacion: 5000, importeAdjConIva: 6050, estadoLote: 'Anulada' },
      { numeroLote: '4', importeAdjudicacion: 2000, importeAdjConIva: 2420, estadoLote: 'Cancelado' },
    ]);

    expect(aggregate).toEqual({
      awardedAmount: 50000,
      awardedAmountInclVat: 60500,
      hasAggregatedAwardAmount: true,
    });
  });

  it('does not report a partial parent total when an awarded lot amount is missing in consolidated lots', () => {
    const aggregate = aggregateAwardedLotAmounts([], [
      { numeroLote: '1', importeAdjudicacion: 50000, importeAdjConIva: 60500, estadoLote: 'Formalizada' },
      { numeroLote: '2', importeAdjudicacion: null, importeAdjConIva: null, estadoLote: 'Formalizada' },
      { numeroLote: '3', importeAdjudicacion: 10000, importeAdjConIva: 12100, estadoLote: 'Desierto' },
    ]);

    expect(aggregate).toEqual({
      awardedAmount: null,
      awardedAmountInclVat: null,
      hasAggregatedAwardAmount: false,
    });
  });

  it('detects incomplete consolidated lot award amounts when an awardee has no amount', () => {
    expect(hasIncompleteConsolidatedLotAwardAmounts([
      { numeroLote: '1', adjudicatario: 'ACME', importeAdjudicacion: 50000 },
      { numeroLote: '2', adjudicatario: 'BETA', importeAdjudicacion: null },
    ])).toBe(true);

    expect(hasIncompleteConsolidatedLotAwardAmounts([
      { numeroLote: '1', importeAdjudicacion: 50000, estadoLote: 'Formalizada' },
      { numeroLote: '2', importeAdjudicacion: 20000, estadoLote: 'Formalizada' },
    ])).toBe(false);
  });

  it('detects incomplete lot awards from tender results or consolidated lots', () => {
    expect(hasIncompleteLotAwardAmounts([
      { numeroLote: '1', importeSinIva: 100, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: '2', importeSinIva: null, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ], [])).toBe(true);

    expect(hasIncompleteLotAwardAmounts([], [
      { numeroLote: '1', importeAdjudicacion: 100, estadoLote: 'Formalizada' },
      { numeroLote: '2', importeAdjudicacion: null, estadoLote: 'Formalizada' },
    ])).toBe(true);

    expect(hasIncompleteLotAwardAmounts([
      { numeroLote: '1', importeSinIva: 100, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: '2', importeSinIva: 200, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ], [])).toBe(false);
  });
});

describe('Resumen de importes de lotes vigentes', () => {
  it('excluye importes residuales de todos los estados terminales sin adjudicación', () => {
    const lots = selectAwardedLotsForSummary([
      { numeroLote: '1', importeAdjudicacion: 50000, estadoLote: 'Formalizada' },
      { numeroLote: '2', importeAdjudicacion: 10000, estadoLote: 'Desierto' },
      { numeroLote: '3', importeAdjudicacion: 5000, estadoLote: 'Anulada' },
      { numeroLote: '4', importeAdjudicacion: 2000, estadoLote: 'Cancelado' },
      { numeroLote: '5', importeAdjudicacion: 1800, estadoLote: 'Renunciado' },
      { numeroLote: '6', importeAdjudicacion: 1700, estadoLote: 'Desestimado' },
      { numeroLote: '7', importeAdjudicacion: 1600, estadoLote: 'Desistido' },
      { numeroLote: '8', importeAdjudicacion: 1500, estadoLote: 'Retirado' },
      { numeroLote: '9', importeAdjudicacion: 1400, estadoLote: 'Withdrawn' },
      { numeroLote: '10', importeAdjudicacion: 1300, estadoLote: 'Rejected' },
      { numeroLote: '11', importeAdjudicacion: 1200, estadoLote: 'Cancelled' },
      { numeroLote: '12', importeAdjudicacion: 1100, estadoLote: 'Deserted' },
    ]);

    expect(lots).toEqual([
      expect.objectContaining({ numeroLote: '1', importeAdjudicacion: 50000 }),
    ]);
  });

  it('prioritizes explicit terminal result codes over stale eligible lot statuses', () => {
    const lots = selectAwardedLotsForSummary([
      {
        numeroLote: '1',
        importeAdjudicacion: 50000,
        estadoLote: 'Adjudicado',
        resultCode: '9',
        resultCodeListUri: TENDER_RESULT_CATALOG_209,
      },
      {
        numeroLote: '2',
        importeAdjudicacion: 1200,
        estadoLote: 'Adjudicado',
        resultCode: '7',
        resultCodeListUri: TENDER_RESULT_CATALOG_209,
      },
    ]);

    expect(lots).toEqual([
      expect.objectContaining({ numeroLote: '1', importeAdjudicacion: 50000 }),
    ]);
  });
});

describe('Resumen de adjudicación de lotes', () => {
  it('detecta solo cuando todos los lotes tienen un resultado explícito sin adjudicación', () => {
    expect(areAllLotsExplicitlyNoAward([
      { resultCode: '3', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { resultCode: '4', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ])).toBe(true);
    expect(areAllLotsExplicitlyNoAward([
      { resultCode: '3', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ])).toBe(false);
    expect(areAllLotsExplicitlyNoAward([
      { resultCode: '3', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { resultCode: null, resultCodeListUri: null },
    ])).toBe(false);
    expect(areAllLotsExplicitlyNoAward([])).toBe(false);
  });
});

describe('Resultados TenderResult sin lote', () => {
  it('conserva resultados independientes a nivel de contrato en vez de agruparlos por un lote vacío', () => {
    const parentResults = [
      { numeroLote: null, adjudicatario: 'Empresa A', nifAdjudicatario: 'A1', importeSinIva: 100, importeConIva: 121, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: null, adjudicatario: 'Empresa B', nifAdjudicatario: 'B2', importeSinIva: 200, importeConIva: 242, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];

    const selected = selectCurrentTenderResults(parentResults);

    expect(selected).toEqual(parentResults);
    expect(selected).toHaveLength(2);
    expect(selected.reduce((total, result) => total + result.importeSinIva, 0)).toBe(300);
  });
});

describe('Estado vigente de TenderResult', () => {
  it('evita contar dos veces el mismo adjudicatario cuando el feed incluye estados sucesivos', () => {
    const results = selectCurrentTenderResults([
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209, fechaAdjudicacion: '2026-01-01' },
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209, fechaAdjudicacion: '2026-01-02' },
      { numeroLote: '1', adjudicatario: 'MENGANITO', nifAdjudicatario: 'B2', importeSinIva: 120, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209, fechaAdjudicacion: '2026-01-01' },
    ]);

    expect(results).toHaveLength(2);
    expect(results.find((result) => result.nifAdjudicatario === 'A1').resultCode).toBe('9');
    expect(results.reduce((total, result) => total + result.importeSinIva, 0)).toBe(220);
  });

  it('preserves known award amounts when the selected later lifecycle state omits them', () => {
    const results = selectCurrentTenderResults([
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, importeConIva: 121, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209, fechaAdjudicacion: '2026-01-01' },
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: null, importeConIva: null, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209, fechaAdjudicacion: '2026-01-02' },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(expect.objectContaining({
      resultCode: '9',
      importeSinIva: 100,
      importeConIva: 121,
      adjudicatario: 'ACME',
      nifAdjudicatario: 'A1',
    }));
  });

  it('does not let provisional desertion override a formally awarded lot', () => {
    const results = selectCurrentTenderResults([
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, importeConIva: 121, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: '1', adjudicatario: null, nifAdjudicatario: null, importeSinIva: null, importeConIva: null, resultCode: '6', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(expect.objectContaining({
      resultCode: '9',
      adjudicatario: 'ACME',
      importeSinIva: 100,
      importeConIva: 121,
    }));
  });

  it('prefers a final result over a provisional award for the same lot', () => {
    const results = selectCurrentTenderResults([
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, importeConIva: 121, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 90, importeConIva: 108.9, resultCode: '1', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(expect.objectContaining({ resultCode: '9', importeSinIva: 100 }));
  });

  it('still lets explicit definitive desertion supersede earlier awards', () => {
    const results = selectCurrentTenderResults([
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: '1', adjudicatario: null, nifAdjudicatario: null, importeSinIva: null, resultCode: '7', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].resultCode).toBe('7');
  });

  it('descarta resultados de adjudicación anteriores cuando el lote figura explícitamente como desierto sin adjudicatario', () => {
    const results = selectCurrentTenderResults([
      { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: '1', adjudicatario: null, nifAdjudicatario: null, importeSinIva: null, resultCode: '3', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].resultCode).toBe('3');
    expect(results[0].adjudicatario).toBeNull();
  });
});

describe('Resultados provisionales sin adjudicación firme', () => {
  it('does not treat provisional desertion as a definitive no-award outcome', () => {
    expect(isNoAwardTenderResult('6', TENDER_RESULT_CATALOG_209)).toBe(true);
    expect(isDefinitiveNoAwardTenderResult('6', TENDER_RESULT_CATALOG_209)).toBe(false);
    expect(isDefinitiveNoAwardTenderResult('7', TENDER_RESULT_CATALOG_209)).toBe(true);
    expect(areAllLotsExplicitlyNoAward([
      { resultCode: '6', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ])).toBe(false);
  });

  it('preserves a persisted definitive award when a newer snapshot only reports provisional desertion', () => {
    const merged = preserveMissingLotAwardData(
      [{
        numeroLote: '1',
        estadoLote: 'Desierto',
        importeAdjudicacion: null,
        resultCode: '6',
        resultCodeListUri: TENDER_RESULT_CATALOG_209,
      }],
      [{
        lot_number: '1',
        lot_status: 'Formalizada',
        awarded_amount: 100,
        awarded_amount_incl_vat: 121,
        awardee: 'ACME',
        awardee_nif: 'A1',
        award_date: '2026-01-01',
        result_code: '9',
        result_code_list_uri: TENDER_RESULT_CATALOG_209,
        offer_count: 3,
      }],
    );

    expect(merged[0]).toEqual(expect.objectContaining({
      estadoLote: 'Formalizada',
      importeAdjudicacion: 100,
      importeAdjConIva: 121,
      adjudicatario: 'ACME',
      nifAdjudicatario: 'A1',
      resultCode: '9',
    }));
  });

  it('keeps other awardees when a lot only receives a provisional desertion notice', () => {
    const previous = [
      { numeroLote: '1', nifAdjudicatario: 'A1', adjudicatario: 'ACME', importeSinIva: 100, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];
    const incoming = [
      { numeroLote: '1', adjudicatario: null, nifAdjudicatario: null, importeSinIva: null, resultCode: '6', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];

    const merged = mergeLotAwardSnapshots(incoming, previous);

    expect(merged).toEqual(expect.arrayContaining([
      expect.objectContaining({ nifAdjudicatario: 'A1', adjudicatario: 'ACME', resultCode: '9' }),
      expect.objectContaining({ resultCode: '6' }),
    ]));
  });
});

describe('Adjudicaciones múltiples por lote CODICE', () => {
  it('conserva todos los TenderResult del mismo lote y les asigna índice estable', () => {
    const awards = buildLotAwards([
      { numeroLote: '1', adjudicatario: 'ACME', importeSinIva: 100 },
      { numeroLote: '1', adjudicatario: 'MENGANITO', importeSinIva: 120 },
      { numeroLote: '2', adjudicatario: 'OTRA', importeSinIva: 80 },
      { numeroLote: null, adjudicatario: 'PADRE', importeSinIva: 999 },
    ]);

    expect(awards).toEqual([
      expect.objectContaining({ numeroLote: '1', awardIndex: 1, adjudicatario: 'ACME' }),
      expect.objectContaining({ numeroLote: '1', awardIndex: 2, adjudicatario: 'MENGANITO' }),
      expect.objectContaining({ numeroLote: '2', awardIndex: 1, adjudicatario: 'OTRA' }),
    ]);
    expect(awards).toHaveLength(3);
  });
});

describe('Identidad de lotes CODICE', () => {
  it('solo acepta ProcurementProjectLotID como identificador explícito de lote', () => {
    const tenderResult = `
      <cac:Contract>
        <cbc:ID>1</cbc:ID>
      </cac:Contract>
    `;

    expect(extractTenderResultLotId(tenderResult)).toBeNull();
  });

  it('extrae ProcurementProjectLotID cuando está presente', () => {
    const tenderResult = `
      <cbc:ProcurementProjectLotID schemeName="ID_LOTE">2</cbc:ProcurementProjectLotID>
      <cac:Contract>
        <cbc:ID>1</cbc:ID>
      </cac:Contract>
    `;

    expect(extractTenderResultLotId(tenderResult)).toBe('2');
  });
});

describe('Identificadores de adjudicatarios CODICE', () => {
  it('extrae el NIF de TenderResult por schemeName aunque ID_PLATAFORMA aparezca primero', () => {
    const winningParty = `
      <cac:PartyIdentification>
        <cbc:ID schemeName="ID_PLATAFORMA">10000150014144</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeName="NIF">S2826011E</cbc:ID>
      </cac:PartyIdentification>
    `;

    expect(extractTenderResultAwardeeNif(winningParty)).toBe('S2826011E');
  });


  it('extrae el NIF por schemeName aunque ID_PLATAFORMA aparezca antes', () => {
    const winningParty = `
      <cac:PartyIdentification>
        <cbc:ID schemeName="ID_PLATAFORMA">10000150014144</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeName="NIF">S2826011E</cbc:ID>
      </cac:PartyIdentification>
    `;

    expect(extractPartyIdByScheme(winningParty, 'NIF')).toBe('S2826011E');
  });

  it('devuelve null si WinningParty no contiene un NIF', () => {
    const winningParty = `
      <cac:PartyIdentification>
        <cbc:ID schemeName="TENDER">28077054</cbc:ID>
      </cac:PartyIdentification>
    `;

    expect(extractPartyIdByScheme(winningParty, 'NIF')).toBeNull();
  });
});

describe('extractPublicationDate', () => {
  it('usa NoticeIssueDate y no la fecha de publicación en diarios oficiales', () => {
    const xml = `
      <cac-place-ext:ValidNoticeInfo>
        <cbc-place-ext:NoticeIssueDate>2026-05-20</cbc-place-ext:NoticeIssueDate>
        <cbc-place-ext:NoticeTypeCode>DOC_CN</cbc-place-ext:NoticeTypeCode>
        <cac-place-ext:AdditionalPublicationStatus>
          <cbc-place-ext:PublicationMediaName>BOE</cbc-place-ext:PublicationMediaName>
          <cac-place-ext:AdditionalPublicationDocumentReference>
            <cbc:IssueDate>2026-05-18</cbc:IssueDate>
          </cac-place-ext:AdditionalPublicationDocumentReference>
        </cac-place-ext:AdditionalPublicationStatus>
      </cac-place-ext:ValidNoticeInfo>
    `;
    expect(extractPublicationDate(xml)).toBe('2026-05-20');
  });

  it('elige la primera fecha del anuncio cuando hay varios anuncios válidos', () => {
    const xml = `
      <cac-place-ext:ValidNoticeInfo>
        <cbc-place-ext:NoticeIssueDate>2026-08-04</cbc-place-ext:NoticeIssueDate>
      </cac-place-ext:ValidNoticeInfo>
      <cac-place-ext:ValidNoticeInfo>
        <cbc-place-ext:NoticeIssueDate>2026-04-17</cbc-place-ext:NoticeIssueDate>
      </cac-place-ext:ValidNoticeInfo>
    `;
    expect(extractPublicationDate(xml)).toBe('2026-04-17');
  });
});

describe('parseNullableNumber', () => {
  it('preserves explicit zero while treating missing values as null', () => {
    expect(parseNullableNumber('0')).toBe(0);
    expect(parseNullableNumber('0.00')).toBe(0);
    expect(parseNullableNumber(null)).toBeNull();
    expect(parseNullableNumber('')).toBeNull();
  });

  it('accepts decimal commas and rejects non-finite values', () => {
    expect(parseNullableNumber('123,45')).toBe(123.45);
    expect(parseNullableNumber('NaN')).toBeNull();
    expect(parseNullableNumber('Infinity')).toBeNull();
  });
});

describe('sync status progression', () => {
  it('does not let a newer snapshot regress a terminal state', () => {
    for (const status of ['Formalizada', 'Anulada', 'Desierta']) {
      expect(shouldAdvanceStatus(status, 'Publicada')).toBe(false);
      expect(shouldAdvanceStatus(status, 'En evaluación')).toBe(false);
      expect(shouldAdvanceStatus(status, 'Adjudicada')).toBe(false);
      expect(shouldAdvanceStatus(status, 'Resuelta')).toBe(false);
    }
  });

  it('allows forward progression and explicit no-award outcomes from non-terminal states', () => {
    expect(shouldAdvanceStatus('Publicada', 'En evaluación')).toBe(true);
    expect(shouldAdvanceStatus('Adjudicada', 'Resuelta')).toBe(true);
    expect(shouldAdvanceStatus('Resuelta', 'Formalizada')).toBe(true);
    expect(shouldAdvanceStatus('Adjudicada', 'Anulada')).toBe(true);
    expect(shouldAdvanceStatus('Adjudicada', 'Desierta')).toBe(true);
    expect(shouldAdvanceStatus('En evaluación', 'Publicada')).toBe(false);
  });

  it('does not regress Formalizada to Resuelta or Adjudicada', () => {
    expect(shouldAdvanceStatus('Formalizada', 'Resuelta')).toBe(false);
    expect(shouldAdvanceStatus('Formalizada', 'Adjudicada')).toBe(false);
  });

  it('does not regress terminal states to older snapshots', () => {
    for (const status of ['Anulada', 'Desierta']) {
      expect(shouldAdvanceStatus(status, 'Resuelta')).toBe(false);
      expect(shouldAdvanceStatus(status, 'Adjudicada')).toBe(false);
    }
  });

  it('allows the expected progression to Resuelta or Adjudicada', () => {
    expect(shouldAdvanceStatus('Adjudicada', 'Resuelta')).toBe(true);
    expect(shouldAdvanceStatus('Publicada', 'Adjudicada')).toBe(true);
  });
});

describe('extractEstimatedContractAmount', () => {
  it('extrae el VEC desde ProcurementProject/BudgetAmount/EstimatedOverallContractAmount', () => {
    const projXml = `
      <cac:ProcurementProject>
        <cac:BudgetAmount>
          <cbc:EstimatedOverallContractAmount currencyID="EUR">100000.00</cbc:EstimatedOverallContractAmount>
        </cac:BudgetAmount>
      </cac:ProcurementProject>
    `;

    expect(extractEstimatedContractAmount(projXml)).toBe(100000);
  });

  it('acepta prefijos XML alternativos y separadores decimales', () => {
    const projXml = `
      <cac:BudgetAmount>
        <cbc:EstimatedOverallContractAmount currencyID="EUR">12345,67</cbc:EstimatedOverallContractAmount>
      </cac:BudgetAmount>
    `;

    expect(extractEstimatedContractAmount(projXml)).toBe(12345.67);
  });

  it('devuelve null cuando no hay VEC', () => {
    expect(extractEstimatedContractAmount('<cac:BudgetAmount><cbc:TaxExclusiveAmount>100</cbc:TaxExclusiveAmount></cac:BudgetAmount>')).toBeNull();
  });
});


describe('Selección de TenderResult a nivel de expediente', () => {
  it('conserva todos los resultados sin lote y excluye los resultados de lote', () => {
    const parentA = { numeroLote: null, adjudicatario: 'Empresa A' };
    const lot = { numeroLote: '1', adjudicatario: 'Empresa Lote' };
    const parentB = { numeroLote: null, adjudicatario: 'Empresa B' };

    expect(selectContractLevelTenderResults([parentA, lot, parentB])).toEqual([parentA, parentB]);
  });
});

describe('Selección del TenderResult de lote', () => {
  it('prioriza el estado formalizado sobre una adjudicación con fecha posterior', () => {
    const result = findTenderResultForLot(
      [{ numeroLote: '1' }],
      [
        { numeroLote: '1', resultCode: '9', resultCodeListUri: 'http://contrataciondelestado.es/codice/cl/2.09/TenderResultCode-2.09.gc', fechaAdjudicacion: '2024-11-26' },
        { numeroLote: '1', resultCode: '8', resultCodeListUri: 'http://contrataciondelestado.es/codice/cl/2.09/TenderResultCode-2.09.gc', fechaAdjudicacion: '2026-02-08' },
      ],
      '1'
    );
    expect(result.resultCode).toBe('9');
  });
});

describe('Selección del TenderResult del expediente', () => {
  it('no usa un resultado de lote como resultado del expediente', () => {
    const result = selectContractLevelTenderResult([
      { numeroLote: '1', trXml: '<cbc:AwardDate>2026-01-10</cbc:AwardDate>' },
      { numeroLote: '2', trXml: '<cbc:AwardDate>2026-01-11</cbc:AwardDate>' },
    ]);
    expect(result).toBeNull();
  });

  it('usa el TenderResult sin ProcurementProjectLotID como resultado del expediente', () => {
    const parent = { numeroLote: null, trXml: '<cbc:AwardDate>2026-01-12</cbc:AwardDate>' };
    const result = selectContractLevelTenderResult([
      { numeroLote: '1', trXml: '<cbc:AwardDate>2026-01-10</cbc:AwardDate>' },
      parent,
    ]);
    expect(result).toBe(parent);
  });

  it('no muta el array de entrada al seleccionar resultados ordenados', () => {
    const r1 = { numeroLote: null, trXml: '<cbc:AwardDate>2026-01-10</cbc:AwardDate><cbc:ResultCode>8</cbc:ResultCode>' };
    const r2 = { numeroLote: null, trXml: '<cbc:AwardDate>2026-01-12</cbc:AwardDate><cbc:ResultCode>9</cbc:ResultCode>' };
    const candidates = [r1, r2];
    const originalOrder = [...candidates];

    selectContractLevelTenderResult(candidates);
    expect(candidates).toEqual(originalOrder);
  });
});

describe('TenderResult deduplication and lot identity', () => {
  it('elimina resultados TenderResult estructuralmente duplicados', () => {
    const result = {
      numeroLote: null,
      adjudicatario: 'Empresa A',
      nifAdjudicatario: 'A12345678',
      importeSinIva: 1870406.94,
      importeConIva: 2263192.4,
      fechaAdjudicacion: '2025-07-29',
      resultCode: '8',
      descripcion: 'Resultado de adjudicación'
    };

    expect(dedupeTenderResults([result, { ...result }])).toHaveLength(1);
  });

  it('no considera dos resultados sin ID de lote como lotes explícitos', () => {
    const results = [
      { numeroLote: null, importeSinIva: 100, importeConIva: 121 },
      { numeroLote: null, importeSinIva: 200, importeConIva: 242 }
    ];

    expect(hasExplicitNumericLotIds(results)).toBe(false);
  });


  it('no replica un TenderResult sin ID entre varios lotes estructurados', () => {
    const result = { numeroLote: null, importeSinIva: 100, adjudicatario: 'Empresa A' };
    const lots = [{ numeroLote: '1' }, { numeroLote: '2' }];

    expect(findTenderResultForLot(lots, [result], '1')).toBeUndefined();
    expect(findTenderResultForLot(lots, [result], '2')).toBeUndefined();
  });

  it('permite asociar un TenderResult sin ID cuando solo existe un lote', () => {
    const result = { numeroLote: null, importeSinIva: 100, adjudicatario: 'Empresa A' };
    const lots = [{ numeroLote: '1' }];

    expect(findTenderResultForLot(lots, [result], '1')).toEqual(result);
  });

  it('prioriza el ID explícito del lote aunque exista otro TenderResult sin ID', () => {
    const byLot = { numeroLote: '2', importeSinIva: 200, adjudicatario: 'Empresa B' };
    const withoutLot = { numeroLote: null, importeSinIva: 100, adjudicatario: 'Empresa A' };
    const lots = [{ numeroLote: '1' }, { numeroLote: '2' }];

    expect(findTenderResultForLot(lots, [withoutLot, byLot], '2')).toEqual(byLot);
    expect(findTenderResultForLot(lots, [withoutLot, byLot], '1')).toBeUndefined();
  });

  it('elige el TenderResult más reciente cuando el mismo lote aparece varias veces', () => {
    const lots = [{ numeroLote: '1' }];
    const result = findTenderResultForLot(lots, [
      { numeroLote: '1', importeSinIva: 100, fechaAdjudicacion: '2025-01-10', resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: '1', importeSinIva: 120, fechaAdjudicacion: '2025-02-10', resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ], '1');
    expect(result.importeSinIva).toBe(120);
  });

  it('prefiere un resultado final adjudicado en empate de fecha', () => {
    const lots = [{ numeroLote: '1' }];
    const result = findTenderResultForLot(lots, [
      { numeroLote: '1', importeSinIva: 100, fechaAdjudicacion: '2025-02-10', resultCode: '10', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: '1', importeSinIva: 120, fechaAdjudicacion: '2025-02-10', resultCode: '2', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ], '1');
    expect(result.importeSinIva).toBe(120);
  });

  it('solo considera lotización explícita cuando todos los resultados tienen IDs numéricos únicos', () => {
    expect(hasExplicitNumericLotIds([
      { numeroLote: '1' },
      { numeroLote: '2' }
    ])).toBe(true);

    expect(hasExplicitNumericLotIds([
      { numeroLote: '1' },
      { numeroLote: '1' }
    ])).toBe(false);
  });
});


describe('Semántica de TenderResultCode', () => {
  it('no trata Licitador mejor valorado (10) como adjudicado', () => {
    expect(isAwardedTenderResult('10', TENDER_RESULT_CATALOG_209)).toBe(false);
    expect(isAwardedTenderResult('8', TENDER_RESULT_CATALOG_209)).toBe(true);
    expect(isAwardedTenderResult('2', TENDER_RESULT_CATALOG_209)).toBe(true);
  });
});

describe('Códigos de resultado desierto', () => {
  it('interpreta el catalogo oficial cuando se proporciona la listURI', () => {
    const catalog = TENDER_RESULT_CATALOG_209;
    expect(isDesertedResultCode('3', catalog)).toBe(true);
    expect(isDesertedResultCode('7', catalog)).toBe(true);
    expect(isDesertedResultCode('2', catalog)).toBe(false);
    expect(isDesertedResultCode('8', catalog)).toBe(false);
  });

  it('no adivina la semantica con un catalogo desconocido', () => {
    expect(isDesertedResultCode('3', 'https://example.test/unknown.gc')).toBe(false);
  });
});



describe('Estados terminales de lotes heredados', () => {
  it('no deriva una adjudicación activa de importes residuales en lotes terminales', () => {
    const terminalLots = [
      'Desierto', 'Deserted', 'Anulada', 'Annulled', 'Cancelado', 'Cancelled',
      'Renunciado', 'Renounced', 'Desestimado', 'Rejected', 'Desistido',
      'Retirado', 'Withdrawn',
    ].map((lot_status, index) => ({
      lot_number: String(index + 1),
      lot_status,
      awardee: 'Empresa antigua',
      awarded_amount: 1000,
    }));

    expect(deriveContractStatusFromLots(terminalLots)).toBeNull();
  });
});

describe('Adjudicaciones de lotes cancelados', () => {
  it('no asigna importe ni adjudicatario a lotes con desistimiento o renuncia', () => {
    const catalog = TENDER_RESULT_CATALOG_209;
    const targetAuthorities = {
      byPlacspId: new Map([['authority-placsp-id', { id: 'authority-1', name: 'Ayuntamiento', scope: 'municipal' }]]),
      byDir3: new Map(),
      byNif: new Map(),
      byHistoricalName: new Map(),
      searchNames: [],
    };
    const xml = `<entry>
      <id>placsp-entry-1</id>
      <cbc:ContractFolderID>EXP/2026/1</cbc:ContractFolderID>
      <cac-place-ext:LocatedContractingParty>
        <cac:PartyName><cbc:Name>Ayuntamiento</cbc:Name></cac:PartyName>
        <cbc:ID schemeName="ID_PLATAFORMA">authority-placsp-id</cbc:ID>
      </cac-place-ext:LocatedContractingParty>
      <cac:ProcurementProject>
        <cbc:Name>Servicio por lotes</cbc:Name><cbc:TypeCode>2</cbc:TypeCode>
        <cac:ProcurementProjectLot><cbc:ID>1</cbc:ID><cac:ProcurementProject><cbc:Name>Lote 1</cbc:Name></cac:ProcurementProject></cac:ProcurementProjectLot>
        <cac:ProcurementProjectLot><cbc:ID>2</cbc:ID><cac:ProcurementProject><cbc:Name>Lote 2</cbc:Name></cac:ProcurementProject></cac:ProcurementProjectLot>
      </cac:ProcurementProject>
      <cac:TenderResult>
        <cbc:ResultCode listURI="${catalog}">4</cbc:ResultCode>
        <cac:WinningParty><cac:PartyName><cbc:Name>Empresa cabecera retirada</cbc:Name></cac:PartyName></cac:WinningParty>
        <cac:AwardedTenderedProject><cbc:TaxExclusiveAmount>9000</cbc:TaxExclusiveAmount><cbc:PayableAmount>10890</cbc:PayableAmount></cac:AwardedTenderedProject>
      </cac:TenderResult>
      <cac:TenderResult>
        <cbc:ProcurementProjectLotID>1</cbc:ProcurementProjectLotID>
        <cbc:ResultCode listURI="${catalog}">4</cbc:ResultCode>
        <cac:WinningParty><cac:PartyName><cbc:Name>Empresa desistida</cbc:Name></cac:PartyName></cac:WinningParty>
        <cac:AwardedTenderedProject><cbc:TaxExclusiveAmount>5000</cbc:TaxExclusiveAmount><cbc:PayableAmount>6050</cbc:PayableAmount></cac:AwardedTenderedProject>
      </cac:TenderResult>
      <cac:TenderResult>
        <cbc:ProcurementProjectLotID>2</cbc:ProcurementProjectLotID>
        <cbc:ResultCode listURI="${catalog}">5</cbc:ResultCode>
        <cac:WinningParty><cac:PartyName><cbc:Name>Empresa renunciante</cbc:Name></cac:PartyName></cac:WinningParty>
        <cac:AwardedTenderedProject><cbc:TaxExclusiveAmount>3000</cbc:TaxExclusiveAmount><cbc:PayableAmount>3630</cbc:PayableAmount></cac:AwardedTenderedProject>
      </cac:TenderResult>
    </entry>`;

    const parsed = parseEntry(xml, 'licitaciones', targetAuthorities);

    expect(parsed.estado).toBe('Anulada');
    expect(parsed.importe_adjudicacion).toBeNull();
    expect(parsed.importe_adj_con_iva).toBeNull();
    expect(parsed.adjudicatario).toBeNull();
    expect(parsed.nif_adjudicatario).toBeNull();
    expect(parsed.lotes).toEqual(expect.arrayContaining([
      expect.objectContaining({ numeroLote: '1', estadoLote: 'Anulada', importeAdjudicacion: null, adjudicatario: null, nifAdjudicatario: null }),
      expect.objectContaining({ numeroLote: '2', estadoLote: 'Anulada', importeAdjudicacion: null, adjudicatario: null, nifAdjudicatario: null }),
    ]));
    expect(parsed.lot_awards).toEqual(expect.arrayContaining([
      expect.objectContaining({ resultState: 'WITHDRAWN', importeSinIva: 5000 }),
      expect.objectContaining({ resultState: 'RENOUNCED', importeSinIva: 3000 }),
    ]));
  });
});

describe('Resumen de adjudicación del contrato padre', () => {
  it('limpia los campos persistidos al recibir un resultado explícito sin adjudicación', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        awarded_amount REAL,
        awarded_amount_incl_vat REAL,
        awardee TEXT,
        awardee_nif TEXT
      );
      INSERT INTO contracts VALUES ('ctr-1', 9000, 10890, 'Empresa anterior', 'B12345678');
    `);

    try {
      const existing = db.prepare('SELECT id, awarded_amount, awardee FROM contracts WHERE id = ?').get('ctr-1');
      expect(isNoAwardTenderResult('4', TENDER_RESULT_CATALOG_209)).toBe(true);
      clearPersistedAwardSummary(db, existing);

      expect(db.prepare('SELECT awarded_amount, awarded_amount_incl_vat, awardee, awardee_nif FROM contracts WHERE id = ?').get('ctr-1'))
        .toEqual({ awarded_amount: null, awarded_amount_incl_vat: null, awardee: null, awardee_nif: null });
      expect(existing).toMatchObject({ awarded_amount: null, awardee: null });
    } finally {
      db.close();
    }
  });
});

describe('Fecha de formalización PLACSP', () => {
  it('no interpreta Contract/IssueDate como formalización en contratos derivados de acuerdo marco', () => {
    const tenderXml = '<cac:Contract><cbc:IssueDate>2026-08-20</cbc:IssueDate></cac:Contract>';
    expect(extractFormalizationDate(
      tenderXml,
      '7',
      'Derivado de acuerdo marco',
      '8',
      TENDER_RESULT_CATALOG_209
    )).toBe('2026-08-20 00:00:00');
  });

  it('no interpreta Contract/IssueDate como formalización en contratos basados en SDA', () => {
    const tenderXml = '<cac:Contract><cbc:IssueDate>2026-08-20</cbc:IssueDate></cac:Contract>';
    expect(extractFormalizationDate(
      tenderXml,
      '12',
      'Basado en un sistema dinámico de adquisición',
      '8',
      TENDER_RESULT_CATALOG_209
    )).toBe('2026-08-20 00:00:00');
  });

  it('no usa Contract/IssueDate de un AM/SDA cuando el resultado no es adjudicado', () => {
    const tenderXml = '<cac:Contract><cbc:IssueDate>2026-08-20</cbc:IssueDate></cac:Contract>';
    expect(extractFormalizationDate(
      tenderXml,
      '7',
      'Derivado de acuerdo marco',
      '3',
      TENDER_RESULT_CATALOG_209
    )).toBeNull();
  });

  it('mantiene Contract/IssueDate como formalización para procedimientos ordinarios', () => {
    const tenderXml = '<cac:Contract><cbc:IssueDate>2026-08-20</cbc:IssueDate></cac:Contract>';
    expect(extractFormalizationDate(tenderXml, '1', 'Abierto')).toBe('2026-08-20 00:00:00');
  });
});

describe('Preservación de campos en snapshots nuevos', () => {
  it('mantiene el valor anterior cuando el snapshot más nuevo omite el campo', () => {
    expect(preserveSnapshotField(null, '2026-03-01')).toBe('2026-03-01');
    expect(preserveSnapshotField(undefined, 123)).toBe(123);
  });

  it('usa el valor nuevo cuando el snapshot lo proporciona', () => {
    expect(preserveSnapshotField('2026-04-01', '2026-03-01')).toBe('2026-04-01');
    expect(preserveSnapshotField(456, 123)).toBe(456);
  });
});

describe('Persistencia de adjudicaciones en snapshots incompletos', () => {
  it('solo sustituye colecciones persistidas cuando el snapshot trae resultados explícitos', () => {
    expect(shouldReplaceSnapshotCollection([])).toBe(false);
    expect(shouldReplaceSnapshotCollection([{ awardIndex: 1 }])).toBe(true);
    expect(shouldReplaceSnapshotCollection(null)).toBe(false);
  });
});

describe('Preservación de adjudicaciones en snapshots', () => {
  it('mantiene adjudicaciones anteriores cuando el snapshot nuevo no trae TenderResult', () => {
    const older = {
      contract_awards: [{ awardIndex: 1, adjudicatario: 'ACME' }],
      lot_awards: [{ lotNumber: '1', awardIndex: 1, adjudicatario: 'ACME' }],
    };

    expect(preserveSnapshotCollection([], older.contract_awards)).toEqual(older.contract_awards);
    expect(preserveSnapshotCollection([], older.lot_awards)).toEqual(older.lot_awards);
  });

  it('preserves awardees omitted from a partial snapshot for a lot with multiple awardees', () => {
    const previous = [
      { numeroLote: '1', nifAdjudicatario: 'A1', adjudicatario: 'ACME', importeSinIva: 100, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: '1', nifAdjudicatario: 'B2', adjudicatario: 'BETA', importeSinIva: 200, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: '2', nifAdjudicatario: 'C3', adjudicatario: 'GAMMA', importeSinIva: 300, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];
    const incoming = [
      { numeroLote: '1', nifAdjudicatario: 'A1', adjudicatario: 'ACME', importeSinIva: 125, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];

    expect(mergeLotAwardSnapshots(incoming, previous)).toEqual([
      previous[1],
      previous[2],
      incoming[0],
    ]);
  });

  it('retains a known award amount when the same awardee lifecycle update omits it', () => {
    const previous = [
      { numeroLote: '1', nifAdjudicatario: 'A1', adjudicatario: 'ACME', importeSinIva: 100, importeConIva: 121, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];
    const incoming = [
      { numeroLote: '1', nifAdjudicatario: 'A1', adjudicatario: 'ACME', importeSinIva: null, importeConIva: null, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];

    expect(mergeLotAwardSnapshots(incoming, previous)).toEqual([
      { ...incoming[0], importeSinIva: 100, importeConIva: 121 },
    ]);
  });

  it('matches the same awardee by name when a partial lifecycle update omits its NIF', () => {
    const previous = [
      { numeroLote: '1', nifAdjudicatario: 'A1', adjudicatario: 'ACME', importeSinIva: 100, importeConIva: 121, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];
    const incoming = [
      { numeroLote: '1', nifAdjudicatario: null, adjudicatario: 'ACME', importeSinIva: null, importeConIva: null, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];

    const merged = mergeLotAwardSnapshots(incoming, previous);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(expect.objectContaining({
      nifAdjudicatario: 'A1',
      adjudicatario: 'ACME',
      importeSinIva: 100,
      importeConIva: 121,
      resultCode: '9',
    }));
  });

  it('preserves other awardees when one awardee renounces a lot award', () => {
    const previous = [
      { numeroLote: '1', nifAdjudicatario: 'A1', adjudicatario: 'ACME', importeSinIva: 100, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: '1', nifAdjudicatario: 'B2', adjudicatario: 'BETA', importeSinIva: 200, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];
    const incoming = [
      { numeroLote: '1', nifAdjudicatario: 'A1', adjudicatario: 'ACME', importeSinIva: null, resultCode: '5', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];

    const merged = mergeLotAwardSnapshots(incoming, previous);

    expect(merged).toHaveLength(2);
    expect(merged).toEqual(expect.arrayContaining([
      expect.objectContaining({ nifAdjudicatario: 'A1', resultCode: '5' }),
      expect.objectContaining({ nifAdjudicatario: 'B2', resultCode: '8', importeSinIva: 200 }),
    ]));
  });

  it('clears prior awardees only when a lot has an explicit definitive no-award result', () => {
    const previous = [
      { numeroLote: '1', nifAdjudicatario: 'A1', adjudicatario: 'ACME', importeSinIva: 100, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      { numeroLote: '1', nifAdjudicatario: 'B2', adjudicatario: 'BETA', importeSinIva: 200, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];
    const incoming = [
      { numeroLote: '1', importeSinIva: null, resultCode: '7', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
    ];

    expect(mergeLotAwardSnapshots(incoming, previous)).toEqual(incoming);
  });

  it('usa las adjudicaciones del snapshot nuevo cuando sí existen', () => {
    const older = [{ awardIndex: 1, adjudicatario: 'ACME' }];
    const newer = [{ awardIndex: 1, adjudicatario: 'OTRA' }];

    expect(preserveSnapshotCollection(newer, older)).toEqual(newer);
  });
});

describe('Preservación de adjudicaciones a nivel de contrato', () => {
  it('preserves omitted contract awardees when a partial snapshot updates another awardee', () => {
    const older = {
      contract_awards: [
        { adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
        { adjudicatario: 'BETA', nifAdjudicatario: 'B2', importeSinIva: 200, resultCode: '8', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      ],
      lot_awards: [],
    };
    const newer = {
      contract_awards: [
        { adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: null, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      ],
      lot_awards: [],
    };

    reconcileSnapshotAwardCollections(newer, older, false);

    expect(newer.contract_awards).toHaveLength(2);
    expect(newer.contract_awards).toEqual(expect.arrayContaining([
      expect.objectContaining({ adjudicatario: 'ACME', importeSinIva: 100, resultCode: '9' }),
      expect.objectContaining({ adjudicatario: 'BETA', importeSinIva: 200, resultCode: '8' }),
    ]));
  });

  it('clears previous contract awardees on an explicit contract-level no-award outcome', () => {
    const older = {
      contract_awards: [
        { adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      ],
      lot_awards: [
        { numeroLote: '1', adjudicatario: 'ACME', nifAdjudicatario: 'A1', importeSinIva: 100, resultCode: '9', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      ],
    };
    const newer = {
      contract_awards: [
        { adjudicatario: null, nifAdjudicatario: null, importeSinIva: null, resultCode: '7', resultCodeListUri: TENDER_RESULT_CATALOG_209 },
      ],
      lot_awards: [],
    };

    reconcileSnapshotAwardCollections(newer, older, true);

    expect(newer.contract_awards).toEqual([
      expect.objectContaining({ resultCode: '7', adjudicatario: null }),
    ]);
    expect(newer.lot_awards).toEqual([]);
    expect(newer._clearLotAwards).toBe(true);
  });
});

describe('Merge de snapshots de PLACSP', () => {
  it('preserves formalization from an older snapshot when the newer snapshot omits it', () => {
    const newer = { fecha_formalizacion: null };
    const older = { fecha_formalizacion: '2026-03-01' };
    for (const field of ['fecha_formalizacion']) {
      if (newer[field] == null && older[field] != null) newer[field] = older[field];
    }
    expect(newer.fecha_formalizacion).toBe('2026-03-01');
  });
});

describe('Reparación de lotes sintéticos históricos', () => {
  it('repara expedientes TenderResult de lote único cuando no llegan lotes explícitos', () => {
    expect(shouldRepairSingleTenderResultLotRows(
      { lots_source: 'CODICE_TENDER_RESULTS', lot_count: 1 },
      {}
    )).toBe(true);
  });

  it('no repara otras fuentes ni snapshots con lotes explícitos', () => {
    expect(shouldRepairSingleTenderResultLotRows(
      { lots_source: 'CODICE_PROJECT_LOT', lot_count: 1 },
      {}
    )).toBe(false);
    expect(shouldRepairSingleTenderResultLotRows(
      { lots_source: 'CODICE_TENDER_RESULTS', lot_count: 1 },
      { lotes: [{ numeroLote: '1' }] }
    )).toBe(false);
    expect(shouldRepairSingleTenderResultLotRows(
      { lots_source: 'CODICE_TENDER_RESULTS', lot_count: 2 },
      {}
    )).toBe(false);
  });
});

describe('Preservación de lotes en sincronización incremental', () => {
  it('clears a stale parent VAT total when preserved awarded lots have incomplete VAT data', () => {
    const awardedLots = [
      { importeAdjudicacion: 100, importeAdjConIva: 121 },
      { importeAdjudicacion: 200, importeAdjConIva: null },
    ];
    const contract = { importe_adjudicacion: 50, importe_adj_con_iva: 60.5 };

    Object.assign(contract, calculateAwardedLotSummary(awardedLots));

    expect(contract.importe_adjudicacion).toBe(300);
    expect(contract.importe_adj_con_iva).toBeNull();
  });

  it('clears parent award amounts when preserved awarded lots have incomplete award amounts', () => {
    const lots = [
      { importeAdjudicacion: 100, importeAdjConIva: 121, estadoLote: 'Formalizada' },
      { importeAdjudicacion: null, importeAdjConIva: null, estadoLote: 'Formalizada' },
    ];
    const contract = { importe_adjudicacion: 50, importe_adj_con_iva: 60.5 };

    Object.assign(contract, calculateAwardedLotSummary(selectAwardedLotsForSummary(lots), lots));

    expect(contract.importe_adjudicacion).toBeNull();
    expect(contract.importe_adj_con_iva).toBeNull();
  });

  it('reconoce una estructura de lotes explícita', () => {
    expect(hasLotStructure({ lotes: [{ numeroLote: '1' }] })).toBe(true);
    expect(hasLotStructure({ lotes: [] })).toBe(false);
    expect(hasLotStructure({})).toBe(false);
  });

  it('no borra lotes históricos cuando el feed actual no los informa', () => {
    const existing = { id: 'old', lotizado: 1, num_lotes: 2 };
    expect(shouldReconcileLots(existing, { lotes: [] })).toBe(false);
    expect(shouldReconcileLots(existing, {})).toBe(false);
  });

  it('sí reconcilia lotes cuando el feed actual proporciona la estructura', () => {
    const existing = { id: 'old', lotizado: 1, num_lotes: 2 };
    expect(shouldReconcileLots(existing, { lotes: [{ numeroLote: '1' }] })).toBe(true);
  });

  it('updates parent contract status when lots contain active awards', () => {
    const lots = [
      { importeAdjudicacion: 100, importeAdjConIva: 121, estadoLote: 'Formalizada' },
      { importeAdjudicacion: null, importeAdjConIva: null, estadoLote: 'Desierto' },
    ];
    const contract = { estado: 'Desierta', importe_adjudicacion: null };
    const lotDerivedStatus = deriveContractStatusFromLots(lots);
    if (lotDerivedStatus && ['Desierta', 'Anulada'].includes(contract.estado)) {
      contract.estado = lotDerivedStatus;
    }
    expect(contract.estado).toBe('Formalizada');
  });
});
