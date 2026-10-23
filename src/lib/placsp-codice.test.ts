import { describe, expect, it } from 'vitest';

import {
  TENDER_RESULT_CATALOG_202,
  TENDER_RESULT_CATALOG_209,
  STATUS_CATALOG_204,
  mapTenderResultCode,
  mapContractFolderStatusCode,
  isDesertedTenderResult,
  isAwardedTenderResult,
  isFormalizedTenderResult,
  isCanceledTenderResult,
} from './placsp-codice.js';

describe('PLACSP CODICE result catalog', () => {
  it('maps the PLACSP 2.02 aggregation catalog by list URI', () => {
    expect(mapTenderResultCode('3', TENDER_RESULT_CATALOG_202).code).toBe('DESERTED');
    expect(mapTenderResultCode('4', TENDER_RESULT_CATALOG_202).code).toBe('WITHDRAWN');
    expect(mapTenderResultCode('5', TENDER_RESULT_CATALOG_202).code).toBe('RENOUNCED');
    expect(mapTenderResultCode('8', TENDER_RESULT_CATALOG_202).code).toBe('AWARDED');
    expect(mapTenderResultCode('9', TENDER_RESULT_CATALOG_202).code).toBe('FORMALIZED');
  });

  it('does not apply the 2.09 mapping to the 2.02 catalog', () => {
    expect(mapTenderResultCode('10', TENDER_RESULT_CATALOG_202).code).toBe('UNKNOWN');
  });

  it('maps the official 2.09 result codes by list URI', () => {
    expect(mapTenderResultCode('1', TENDER_RESULT_CATALOG_209).code).toBe('AWARDED_PROVISIONALLY');
    expect(mapTenderResultCode('2', TENDER_RESULT_CATALOG_209).code).toBe('AWARDED');
    expect(mapTenderResultCode('3', TENDER_RESULT_CATALOG_209).code).toBe('DESERTED');
    expect(mapTenderResultCode('4', TENDER_RESULT_CATALOG_209).code).toBe('WITHDRAWN');
    expect(mapTenderResultCode('5', TENDER_RESULT_CATALOG_209).code).toBe('RENOUNCED');
    expect(mapTenderResultCode('6', TENDER_RESULT_CATALOG_209).code).toBe('DESERTED_PROVISIONALLY');
    expect(mapTenderResultCode('7', TENDER_RESULT_CATALOG_209).code).toBe('DESERTED');
    expect(mapTenderResultCode('8', TENDER_RESULT_CATALOG_209).code).toBe('AWARDED');
    expect(mapTenderResultCode('9', TENDER_RESULT_CATALOG_209).code).toBe('FORMALIZED');
    expect(mapTenderResultCode('10', TENDER_RESULT_CATALOG_209).code).toBe('BEST_RATED_TENDERER');
    expect(mapTenderResultCode('11', TENDER_RESULT_CATALOG_209).code).toBe('FORMALIZED');
  });

  it('does not guess a catalog when listURI is missing', () => {
    expect(mapTenderResultCode('3').code).toBe('UNKNOWN');
    expect(mapTenderResultCode('8').code).toBe('UNKNOWN');
  });

  it('does not guess an unknown catalog from the numeric code', () => {
    expect(mapTenderResultCode('3', 'https://example.test/unknown.gc').code).toBe('UNKNOWN');
  });

  it('maps the contract-folder status catalog independently from TenderResult', () => {
    expect(mapContractFolderStatusCode('RES', STATUS_CATALOG_204)).toBe('Resuelta');
  });

  it('does not guess the contract-folder status without listURI', () => {
    expect(mapContractFolderStatusCode('RES')).toBe('RES');
    expect(mapContractFolderStatusCode('ADJ')).toBe('ADJ');
    expect(mapContractFolderStatusCode()).toBe('Desconocido');
  });

  it('exposes lifecycle predicates without numeric magic in callers', () => {
    expect(isDesertedTenderResult('3', TENDER_RESULT_CATALOG_209)).toBe(true);
    expect(isDesertedTenderResult('7', TENDER_RESULT_CATALOG_209)).toBe(true);
    expect(isAwardedTenderResult('2', TENDER_RESULT_CATALOG_209)).toBe(true);
    expect(isAwardedTenderResult('8', TENDER_RESULT_CATALOG_209)).toBe(true);
    expect(isFormalizedTenderResult('9', TENDER_RESULT_CATALOG_209)).toBe(true);
    expect(isCanceledTenderResult('4', TENDER_RESULT_CATALOG_209)).toBe(true);
    expect(isCanceledTenderResult('5', TENDER_RESULT_CATALOG_209)).toBe(true);
  });
});
