/**
 * CODICE catalog mappings used by the PLACSP ingestion layer.
 *
 * The source code is only meaningful together with its listURI. Keeping the
 * mapping here prevents business logic from depending on numeric magic values.
 */

const TENDER_RESULT_CATALOG_202 =
  'http://contrataciondelestado.es/codice/cl/2.02/TenderResultCode-2.02.gc';

const TENDER_RESULT_CATALOG_209 =
  'http://contrataciondelestado.es/codice/cl/2.09/TenderResultCode-2.09.gc';

const STATUS_CATALOG_204 =
  'https://contrataciondelestado.es/codice/cl/2.04/SyndicationContractFolderStatusCode-2.04.gc';

const TENDER_RESULT_MAP_202 = Object.freeze({
  '3': { code: 'DESERTED', label: 'Desierto' },
  '4': { code: 'WITHDRAWN', label: 'Desistimiento' },
  '5': { code: 'RENOUNCED', label: 'Renuncia' },
  '8': { code: 'AWARDED', label: 'Adjudicado' },
  '9': { code: 'FORMALIZED', label: 'Formalizado' },
});

const TENDER_RESULT_MAP_209 = Object.freeze({
  '1': { code: 'AWARDED_PROVISIONALLY', label: 'Adjudicado provisionalmente' },
  '2': { code: 'AWARDED', label: 'Adjudicado definitivamente' },
  '3': { code: 'DESERTED', label: 'Desierto' },
  '4': { code: 'WITHDRAWN', label: 'Desistimiento' },
  '5': { code: 'RENOUNCED', label: 'Renuncia' },
  '6': { code: 'DESERTED_PROVISIONALLY', label: 'Desierto provisionalmente' },
  '7': { code: 'DESERTED', label: 'Desierto definitivamente' },
  '8': { code: 'AWARDED', label: 'Adjudicado' },
  '9': { code: 'FORMALIZED', label: 'Formalizado' },
  '10': { code: 'BEST_RATED_TENDERER', label: 'Licitador mejor valorado' },
  '11': { code: 'FORMALIZED', label: 'Encargo formalizado' },
});

const STATUS_MAP_204 = Object.freeze({
  PUB: 'Publicada',
  EV: 'En evaluación',
  EVAL: 'En evaluación',
  ADJ: 'Adjudicada',
  RES: 'Resuelta',
  ANU: 'Anulada',
  ANUL: 'Anulada',
  PRE: 'Previa',
  DES: 'Desierta',
  DESI: 'Desierta',
});

function normalizeListUri(listUri) {
  return String(listUri || '').trim();
}

function mapTenderResultCode(resultCode, listUri) {
  const code = String(resultCode || '').trim();
  const normalizedUri = normalizeListUri(listUri);

  if (normalizedUri === TENDER_RESULT_CATALOG_202) {
    return TENDER_RESULT_MAP_202[code] || { code: 'UNKNOWN', label: code || 'Resultado desconocido' };
  }

  if (normalizedUri === TENDER_RESULT_CATALOG_209) {
    return TENDER_RESULT_MAP_209[code] || { code: 'UNKNOWN', label: code || 'Resultado desconocido' };
  }

  return { code: 'UNKNOWN', label: code || 'Resultado desconocido' };
}

function mapContractFolderStatusCode(statusCode, listUri) {
  const code = String(statusCode || '').trim();
  const normalizedUri = normalizeListUri(listUri);
  if (normalizedUri === STATUS_CATALOG_204) {
    return STATUS_MAP_204[code] || code || 'Resuelta';
  }
  return code || 'Desconocido';
}

function isDesertedTenderResult(resultCode, listUri) {
  const mapped = mapTenderResultCode(resultCode, listUri);
  return mapped.code === 'DESERTED' || mapped.code === 'DESERTED_PROVISIONALLY';
}

function isAwardedTenderResult(resultCode, listUri) {
  const mapped = mapTenderResultCode(resultCode, listUri);
  return mapped.code === 'AWARDED' || mapped.code === 'AWARDED_PROVISIONALLY';
}

function isFormalizedTenderResult(resultCode, listUri) {
  return mapTenderResultCode(resultCode, listUri).code === 'FORMALIZED';
}

function isCanceledTenderResult(resultCode, listUri) {
  const code = mapTenderResultCode(resultCode, listUri).code;
  return code === 'WITHDRAWN' || code === 'RENOUNCED';
}

module.exports = {
  TENDER_RESULT_CATALOG_202,
  TENDER_RESULT_CATALOG_209,
  STATUS_CATALOG_204,
  TENDER_RESULT_MAP_202,
  TENDER_RESULT_MAP_209,
  mapTenderResultCode,
  mapContractFolderStatusCode,
  isDesertedTenderResult,
  isAwardedTenderResult,
  isFormalizedTenderResult,
  isCanceledTenderResult,
};
