/**
 * Sincronizador de licitaciones y contratos PLACSP.
 *
 * Contracting authorities are configured in data/contracting-authorities.json.
 * La identidad del órgano procede de PLACSP (ID_PLATAFORMA/DIR3/NIF) y los
 * alias históricos son relaciones explícitas, nunca coincidencias difusas.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { sanitizeNifForStorage } = require('./nif-privacy');
const { isEligibleAwardLotStatus } = require('../src/lib/lot-status');
const { buildAwardedVolumeSql, buildAwardAmountEligibilitySql } = require('./award-volume-sql');
const { terminalContractStatusSql } = require('../src/lib/contract-status-sql.ts');
const { extractEstimatedContractAmount, extractPartyIdByScheme } = require('./placsp-xml');
const { classifyAwardAmountType, classifyAggregatedAwardAmountType } = require('./award-amount');
const { getContractIdentityKey, normalizeIdentityPart } = require('./contract-identity');
const {
  mapContractFolderStatusCode,
  mapTenderResultCode,
  isDesertedTenderResult,
  isAwardedTenderResult,
  isCanceledTenderResult,
  isFormalizedTenderResult,
} = require('../src/lib/placsp-codice');
const fs = require('node:fs');
const { spawn, execFileSync } = require('node:child_process');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const RAW_DIR = path.resolve(__dirname, '../data_raw');

const TIPO_MAP = {
  '1': 'Suministros',
  '2': 'Servicios',
  '3': 'Obras',
  '7': 'Administrativo especial',
  '8': 'Privado',
  '21': 'Gestión de Servicios Públicos',
  '22': 'Concesión de Servicios',
  '31': 'Concesión de Obras Públicas',
  '32': 'Concesión de Obras',
  '40': 'Colaboración público-privada',
  '50': 'Patrimonial',
};

const PROC_MAP = {
  '1': 'Abierto',
  '2': 'Restringido',
  '3': 'Negociado sin publicidad',
  '4': 'Negociado con publicidad',
  '5': 'Diálogo competitivo',
  '6': 'Contrato menor',
  '7': 'Derivado de acuerdo marco',
  '8': 'Concurso de proyectos',
  '9': 'Abierto simplificado',
  '10': 'Asociación para la innovación',
  '11': 'Derivado de asociación para la innovación',
  '12': 'Basado en un sistema dinámico de adquisición',
  '13': 'Licitación con negociación',
  '100': 'Basado en acuerdo marco',
  '999': 'Otros',
};

const { classifyEconomicNature } = require('../src/lib/naturaleza-economica.ts');
const STATUS_MAP = require('../src/lib/placsp-codice').STATUS_MAP_204;

function normalizeProcedimiento(raw) {
  if (!raw) return 'Otros';
  const trimmed = raw.trim();
  if (!trimmed) return 'Otros';

  const lower = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (
    lower === 'menor' ||
    lower === 'contrato menor' ||
    lower === 'contratos menores' ||
    lower === 'c. menor' ||
    lower === 'c.menor' ||
    lower === 'cm' ||
    lower === 'contrato_menor'
  ) {
    return 'Contrato menor';
  }

  if (lower === 'abierto' || lower === 'procedimiento abierto') {
    return 'Abierto';
  }
  if (lower === 'abierto simplificado' || lower === 'procedimiento abierto simplificado' || lower === 'simplificado') {
    return 'Abierto simplificado';
  }
  if (lower === 'abierto supersimplificado' || lower === 'abierto abreviado' || lower === 'supersimplificado') {
    return 'Abierto supersimplificado';
  }
  if (lower.includes('negociado sin publicidad') || lower === 'nsp' || lower === 'sin publicidad') {
    return 'Negociado sin publicidad';
  }
  if (lower.includes('negociado con publicidad') || lower === 'ncp' || lower === 'con publicidad') {
    return 'Negociado con publicidad';
  }
  if (lower === 'negociado' || lower === 'procedimiento negociado') {
    return 'Negociado sin publicidad';
  }
  if (lower.includes('sistema dinamico') || lower.includes('sda')) {
    return 'Basado en sistema dinámico';
  }
  if (lower.includes('acuerdo marco') || lower.includes('derivado de acuerdo marco')) {
    return 'Basado en acuerdo marco';
  }
  if (lower === 'restringido' || lower === 'procedimiento restringido') {
    return 'Restringido';
  }
  if (lower.includes('dialogo competitivo')) {
    return 'Diálogo competitivo';
  }
  if (lower.includes('asociacion para la innovacion')) {
    return 'Asociación para la innovación';
  }
  if (lower.includes('concurso de proyectos')) {
    return 'Concurso de proyectos';
  }
  if (lower.includes('encargo')) {
    return 'Encargo a medio propio';
  }
  if (lower === 'otros' || lower === 'otro') {
    return 'Otros';
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function extractTenderResultAwardeeNif(winningXml) {
  return sanitizeNifForStorage(extractPartyIdByScheme(winningXml, 'NIF'));
}

function decodeXmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#xD;/g, ' ')
    .replace(/&#10;/g, ' ')
    .replace(/&apos;/g, "'")
    .trim();
}

/**
 * Deduplica resultados TenderResult idénticos del feed CODICE.
 * Solo elimina duplicados estructuralmente iguales; resultados con lote explícito distinto se conservan.
 */
function parseNullableNumber(value) {
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableInteger(value) {
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number(String(value).trim().replace(',', '.'));
  return Number.isInteger(parsed) ? parsed : null;
}

function dedupeTenderResults(results) {
  const seen = new Set();
  return results.filter((tr) => {
    const key = [
      tr.numeroLote || '',
      tr.adjudicatario || '',
      tr.nifAdjudicatario || '',
      tr.importeSinIva ?? '',
      tr.importeConIva ?? '',
      tr.fechaAdjudicacion || '',
      tr.resultCode || '',
      tr.resultCodeListUri || '',
      tr.resultState || '',
      tr.descripcion || ''
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectAwardedLotsForSummary(lots) {
  return (Array.isArray(lots) ? lots : []).filter((lot) => {
    const state = String(lot.estadoLote ?? lot.estado_lote ?? lot.lot_status ?? '').trim().toLowerCase();
    const resultCode = lot.resultCode ?? lot.result_code;
    const resultCodeListUri = lot.resultCodeListUri ?? lot.result_code_list_uri;
    const hasNoAwardResult = isNoAwardTenderResult(resultCode, resultCodeListUri);
    const hasPreAwardResult = isPreAwardTenderResult(resultCode, resultCodeListUri);
    const amount = lot.importeAdjudicacion ?? lot.awarded_amount;
    return amount != null &&
      Number(amount) > 0 &&
      isEligibleAwardLotStatus(state) &&
      !hasNoAwardResult &&
      !hasPreAwardResult;
  });
}

function isEligibleAwardLot(lot) {
  if (!lot) return false;
  const state = String(lot.estadoLote ?? lot.estado_lote ?? lot.lot_status ?? '').trim().toLowerCase();
  const resultCode = lot.resultCode ?? lot.result_code;
  const listUri = lot.resultCodeListUri ?? lot.result_code_list_uri;
  const isNoAward = !isEligibleAwardLotStatus(state) ||
    isNoAwardTenderResult(resultCode, listUri);
  if (isNoAward) return false;

  if (isPreAwardTenderResult(resultCode, listUri)) return false;

  const hasAwardee = Boolean(lot.adjudicatario || lot.awardee || lot.nifAdjudicatario || lot.awardee_nif);
  const isAwardState = state.includes('adjudic') || state.includes('formaliz');
  const amount = lot.importeAdjudicacion ?? lot.awarded_amount;
  const hasAwardAmount = amount != null && Number(amount) > 0;
  const isAwardResult = isAwardedTenderResult(resultCode, listUri);

  return isAwardState || hasAwardee || hasAwardAmount || isAwardResult;
}

function deriveContractStatusFromLots(lots) {
  if (!Array.isArray(lots) || lots.length === 0) return null;
  const awardedLots = lots.filter(isEligibleAwardLot);
  if (awardedLots.length === 0) return null;

  const isFormalized = awardedLots.some((lot) => {
    const state = String(lot.estadoLote ?? lot.estado_lote ?? lot.lot_status ?? '').trim().toLowerCase();
    const resultCode = lot.resultCode ?? lot.result_code;
    const listUri = lot.resultCodeListUri ?? lot.result_code_list_uri;
    return state.includes('formaliz') || isFormalizedTenderResult(resultCode, listUri);
  });

  return isFormalized ? 'Formalizada' : 'Adjudicada';
}

function hasIncompleteConsolidatedLotAwardAmounts(lots) {
  if (!Array.isArray(lots) || lots.length === 0) return false;

  const eligibleAwardLots = lots.filter(isEligibleAwardLot);
  if (eligibleAwardLots.length <= 1) return false;

  const hasKnownAwardAmount = eligibleAwardLots.some((lot) => {
    const amount = lot.importeAdjudicacion ?? lot.awarded_amount;
    return amount != null && Number(amount) > 0;
  });

  if (!hasKnownAwardAmount) return false;

  return eligibleAwardLots.some((lot) => {
    const amount = lot.importeAdjudicacion ?? lot.awarded_amount;
    return amount == null || Number(amount) <= 0;
  });
}

function hasIncompleteLotTenderResults(tenderResults) {
  const currentLotResults = selectCurrentTenderResults(
    (Array.isArray(tenderResults) ? tenderResults : []).filter((result) => result.numeroLote)
  );
  const eligibleLotResults = currentLotResults.filter((result) =>
    !isNoAwardTenderResult(result.resultCode, result.resultCodeListUri) &&
    !isPreAwardTenderResult(result.resultCode, result.resultCodeListUri)
  );
  const explicitLotAwards = eligibleLotResults.filter((result) =>
    result.importeSinIva != null && result.importeSinIva > 0
  );

  return explicitLotAwards.length > 0 && eligibleLotResults.some((result) =>
    result.importeSinIva == null || result.importeSinIva <= 0
  );
}

function hasIncompleteLotAwardAmounts(tenderResults, consolidatedLots) {
  return hasIncompleteLotTenderResults(tenderResults) ||
    hasIncompleteConsolidatedLotAwardAmounts(consolidatedLots);
}

function calculateAwardedLotSummary(awardedLots, allLots = awardedLots) {
  if (!Array.isArray(awardedLots) || awardedLots.length === 0) return null;
  if (hasIncompleteConsolidatedLotAwardAmounts(allLots)) {
    return {
      importe_adjudicacion: null,
      importe_adj_con_iva: null,
    };
  }

  const awardedAmount = awardedLots.reduce(
    (total, lot) => total + (lot.importeAdjudicacion ?? lot.awarded_amount ?? 0),
    0
  );
  const hasCompleteInclVat = awardedLots.every((lot) => {
    const vat = lot.importeAdjConIva ?? lot.awarded_amount_incl_vat;
    return vat != null && Number(vat) > 0;
  });

  return {
    importe_adjudicacion: awardedAmount,
    importe_adj_con_iva: hasCompleteInclVat
      ? awardedLots.reduce((total, lot) => total + (lot.importeAdjConIva ?? lot.awarded_amount_incl_vat ?? 0), 0)
      : null,
  };
}

function aggregateAwardedLotAmounts(tenderResults, consolidatedLots) {
  const currentLotResults = selectCurrentTenderResults(
    (Array.isArray(tenderResults) ? tenderResults : []).filter((result) => result.numeroLote)
  );
  const eligibleLotResults = currentLotResults.filter((result) =>
    !isNoAwardTenderResult(result.resultCode, result.resultCodeListUri) &&
    !isPreAwardTenderResult(result.resultCode, result.resultCodeListUri)
  );
  const explicitLotAwards = eligibleLotResults.filter((result) =>
    result.importeSinIva != null && result.importeSinIva > 0
  );

  // A known amount from one co-awardee is not a complete parent total when
  // another current awardee has no amount. Do not silently publish a partial sum.
  if (hasIncompleteLotTenderResults(tenderResults)) {
    return { awardedAmount: null, awardedAmountInclVat: null, hasAggregatedAwardAmount: false };
  }

  if (explicitLotAwards.length === 0 && hasIncompleteConsolidatedLotAwardAmounts(consolidatedLots)) {
    return { awardedAmount: null, awardedAmountInclVat: null, hasAggregatedAwardAmount: false };
  }

  const awardedLots = explicitLotAwards.length > 0
    ? explicitLotAwards.map((result) => ({
      importeAdjudicacion: result.importeSinIva,
      importeAdjConIva: result.importeConIva,
    }))
    : selectAwardedLotsForSummary(consolidatedLots);

  if (awardedLots.length === 0) {
    return { awardedAmount: null, awardedAmountInclVat: null, hasAggregatedAwardAmount: false };
  }

  const allHaveInclVat = awardedLots.every((lot) =>
    lot.importeAdjConIva != null && lot.importeAdjConIva > 0
  );
  return {
    awardedAmount: awardedLots.reduce((total, lot) => total + (lot.importeAdjudicacion ?? 0), 0),
    awardedAmountInclVat: allHaveInclVat
      ? awardedLots.reduce((total, lot) => total + lot.importeAdjConIva, 0)
      : null,
    hasAggregatedAwardAmount: true,
  };
}

function tenderResultAwardeeKey(result) {
  const nif = String(result.nifAdjudicatario ?? result.awardee_nif ?? '').trim().toUpperCase();
  if (nif) return `nif:${nif}`;
  const name = String(result.adjudicatario ?? result.awardee ?? '').trim().toLocaleUpperCase('es');
  return name ? `name:${name}` : null;
}

function groupTenderResultsByAwardee(results) {
  const groups = new Map();
  const withoutNif = [];
  const nameKey = (result) =>
    String(result.adjudicatario ?? result.awardee ?? '').trim().toLocaleUpperCase('es');

  for (const result of results) {
    const nif = String(result.nifAdjudicatario ?? result.awardee_nif ?? '').trim().toUpperCase();
    if (!nif) {
      withoutNif.push(result);
      continue;
    }
    const key = `nif:${nif}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }

  for (const result of withoutNif) {
    const name = nameKey(result);
    if (!name) {
      const key = `unassigned:${result.resultCode ?? ''}:${result.importeSinIva ?? ''}:${result.importeConIva ?? ''}:${result.descripcion || ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(result);
      continue;
    }

    const matchingGroups = [...groups.entries()].filter(([key, group]) =>
      (key.startsWith('nif:') || key.startsWith('name:')) &&
      group.some((candidate) => nameKey(candidate) === name)
    );

    if (matchingGroups.length === 1) {
      matchingGroups[0][1].push(result);
      continue;
    }

    const key = `name:${name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }

  return [...groups.values()];
}

function mergeTenderResultLifecycle(current, incoming) {
  const incomingIsPreferred = compareTenderResultState(incoming, current) < 0;
  const preferred = incomingIsPreferred ? incoming : current;
  const fallback = incomingIsPreferred ? current : incoming;
  const merged = { ...fallback, ...preferred };
  for (const field of [
    'adjudicatario',
    'nifAdjudicatario',
    'importeSinIva',
    'importeConIva',
    'numOfertas',
    'fechaAdjudicacion',
    'descripcion',
  ]) {
    merged[field] = preferred[field] ?? fallback[field];
  }
  return merged;
}

function selectCurrentContractLevelTenderResults(results) {
  const rows = Array.isArray(results) ? results : [];
  const terminalNoAward = rows.filter((result) =>
    !tenderResultAwardeeKey(result) &&
    isDefinitiveNoAwardTenderResult(result.resultCode, result.resultCodeListUri)
  );
  if (terminalNoAward.length > 0) {
    return [terminalNoAward.toSorted(compareTenderResultState)[0]];
  }

  const groups = groupTenderResultsByAwardee(rows);

  const selected = [];
  for (const group of groups) {
    const finalResults = group.filter((result) =>
      !mapTenderResultCode(result.resultCode, result.resultCodeListUri).code.endsWith('_PROVISIONALLY')
    );
    const resultsToSelect = finalResults.length > 0 ? finalResults : group;
    let current = resultsToSelect[0];
    for (const result of resultsToSelect.slice(1)) {
      current = mergeTenderResultLifecycle(current, result);
    }
    selected.push(current);
  }
  return selected;
}

function aggregateAwardedContractAmounts(tenderResults) {
  const currentResults = selectCurrentContractLevelTenderResults(
    (Array.isArray(tenderResults) ? tenderResults : []).filter((result) => !result.numeroLote)
  );
  const eligibleAwards = currentResults.filter((result) =>
    !isNoAwardTenderResult(result.resultCode, result.resultCodeListUri) &&
    !isPreAwardTenderResult(result.resultCode, result.resultCodeListUri)
  );
  const awarded = eligibleAwards.filter((result) =>
    result.importeSinIva != null && result.importeSinIva > 0
  );
  const hasCompleteAmounts = eligibleAwards.length > 1 && awarded.length === eligibleAwards.length;

  if (!hasCompleteAmounts) {
    return { awardedAmount: null, awardedAmountInclVat: null, hasAggregatedAwardAmount: false };
  }

  const allHaveInclVat = awarded.every((result) =>
    result.importeConIva != null && result.importeConIva > 0
  );
  return {
    awardedAmount: awarded.reduce((total, result) => total + result.importeSinIva, 0),
    awardedAmountInclVat: allHaveInclVat
      ? awarded.reduce((total, result) => total + result.importeConIva, 0)
      : null,
    hasAggregatedAwardAmount: true,
  };
}

function hasIncompleteContractLevelAwardAmounts(tenderResults) {
  const currentResults = selectCurrentContractLevelTenderResults(
    (Array.isArray(tenderResults) ? tenderResults : []).filter((result) => !result.numeroLote)
  );
  const eligibleAwards = currentResults.filter((result) =>
    !isNoAwardTenderResult(result.resultCode, result.resultCodeListUri) &&
    !isPreAwardTenderResult(result.resultCode, result.resultCodeListUri)
  );

  return eligibleAwards.length > 1 && eligibleAwards.some((result) =>
    result.importeSinIva == null || result.importeSinIva <= 0
  );
}

function selectCurrentTenderResults(results) {
  // Contract-level results are independent awardees, not one shared empty lot.
  const contractLevel = [];
  const byLot = new Map();
  for (const result of results) {
    if (!result.numeroLote) {
      contractLevel.push(result);
      continue;
    }
    const lotKey = String(result.numeroLote);
    if (!byLot.has(lotKey)) byLot.set(lotKey, []);
    byLot.get(lotKey).push(result);
  }

  const selected = selectCurrentContractLevelTenderResults(contractLevel);
  for (const [lotKey, lotResults] of byLot) {
    // Ignore provisional lifecycle notices when a final result for this lot exists.
    const finalLotResults = lotResults.filter((result) =>
      !mapTenderResultCode(result.resultCode, result.resultCodeListUri).code.endsWith('_PROVISIONALLY')
    );
    const resultsToGroup = finalLotResults.length > 0 ? finalLotResults : lotResults;
    const terminalNoAward = resultsToGroup.filter((result) =>
      !tenderResultAwardeeKey(result) &&
      isDefinitiveNoAwardTenderResult(result.resultCode, result.resultCodeListUri)
    );
    if (terminalNoAward.length > 0) {
      selected.push(terminalNoAward.toSorted(compareTenderResultState)[0]);
      continue;
    }

    const groups = groupTenderResultsByAwardee(resultsToGroup);

    for (const group of groups) {
      const finalResults = group.filter((result) =>
        !mapTenderResultCode(result.resultCode, result.resultCodeListUri).code.endsWith('_PROVISIONALLY')
      );
      const resultsToSelect = finalResults.length > 0 ? finalResults : group;
      let current = resultsToSelect[0];
      for (const result of resultsToSelect.slice(1)) {
        current = mergeTenderResultLifecycle(current, result);
      }
      selected.push(current);
    }
  }
  return selected;
}

function compareTenderResultState(a, b) {
  const rank = (result) => {
    const code = mapTenderResultCode(result.resultCode, result.resultCodeListUri).code;
    if (isNoAwardTenderResult(result.resultCode, result.resultCodeListUri)) return 5;
    if (code === 'FORMALIZED') return 4;
    if (code === 'AWARDED') return 3;
    if (code === 'AWARDED_PROVISIONALLY') return 2;
    if (code === 'BEST_RATED_TENDERER') return 1;
    return 0;
  };
  const rankA = rank(a);
  const rankB = rank(b);
  if (rankA !== rankB) return rankB - rankA;
  const dateA = Date.parse(a.fechaAdjudicacion || '') || 0;
  const dateB = Date.parse(b.fechaAdjudicacion || '') || 0;
  return dateB - dateA;
}

function hasExplicitNumericLotIds(results) {
  if (!Array.isArray(results) || results.length <= 1) return false;
  const ids = results.map((tr) => String(tr.numeroLote || '').trim());
  return ids.every((id) => /^\d+$/.test(id)) && new Set(ids).size === ids.length;
}

/**
 * Asocia un TenderResult a un lote solo cuando la identidad del lote es inequívoca.
 * Un resultado sin ProcurementProjectLotID no puede copiarse a todos los lotes.
 */
function selectContractLevelTenderResults(tenderResults) {
  return tenderResults.filter((tr) => !tr.numeroLote);
}

/**
 * Conserva todas las adjudicaciones asociadas a un mismo lote.
 * CODICE permite varios TenderResult con el mismo ProcurementProjectLotID,
 * por ejemplo en acuerdos marco o sistemas dinámicos con varios adjudicatarios.
 */
function buildLotAwards(tenderResults) {
  const counters = new Map();
  return tenderResults
    .filter((tr) => tr.numeroLote)
    .map((tr) => {
      const lotNumber = String(tr.numeroLote);
      const awardIndex = (counters.get(lotNumber) || 0) + 1;
      counters.set(lotNumber, awardIndex);
      return { ...tr, numeroLote: lotNumber, awardIndex };
    });
}

function selectContractLevelTenderResult(tenderResults) {
  const candidates = selectContractLevelTenderResults(tenderResults);
  if (candidates.length <= 1) return candidates[0] || null;

  const getTag = (pattern, xml) => xml.match(pattern)?.[1] ?? null;
  const details = candidates.map((candidate) => {
    const xml = candidate.trXml || '';
    const resultCode = candidate.resultCode ?? getTag(/<cbc:ResultCode[^>]*>([^<]+)<\/cbc:ResultCode>/, xml);
    const listUriMatch = xml.match(/<cbc:ResultCode[^>]*listURI="([^"]+)"[^>]*>/);
    const resultCodeListUri = candidate.resultCodeListUri ?? (listUriMatch ? listUriMatch[1] : null);
    const winningMatch = xml.match(/<cac:WinningParty>([\s\S]*?)<\/cac:WinningParty>/);
    const winningXml = winningMatch ? winningMatch[1] : '';
    const awardee = candidate.adjudicatario ?? getTag(/<cac:PartyName>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/, winningXml);
    const awardeeNif = candidate.nifAdjudicatario ?? extractTenderResultAwardeeNif(winningXml);
    const code = mapTenderResultCode(resultCode, resultCodeListUri).code;
    const definitiveNoAward = isDefinitiveNoAwardTenderResult(resultCode, resultCodeListUri);
    const hasAwardee = Boolean(awardee || awardeeNif);
    const rank = definitiveNoAward && !hasAwardee
      ? 5
      : code === 'FORMALIZED'
        ? 4
        : code === 'AWARDED'
          ? 3
          : code === 'AWARDED_PROVISIONALLY'
            ? 2
            : code === 'BEST_RATED_TENDERER'
              ? 1
              : 0;
    return {
      candidate,
      resultCode,
      resultCodeListUri,
      hasAwardee,
      definitiveNoAward,
      rank,
      date: Date.parse(getTag(/<cbc:AwardDate>([^<]+)<\/cbc:AwardDate>/, xml) || '') || 0,
    };
  });

  const wholeContractNoAward = details.filter((detail) =>
    detail.definitiveNoAward && !detail.hasAwardee
  );
  const pool = wholeContractNoAward.length > 0
    ? wholeContractNoAward
    : details.some((detail) => !isNoAwardTenderResult(detail.resultCode, detail.resultCodeListUri) &&
      !isPreAwardTenderResult(detail.resultCode, detail.resultCodeListUri))
      ? details.filter((detail) => !isNoAwardTenderResult(detail.resultCode, detail.resultCodeListUri) &&
        !isPreAwardTenderResult(detail.resultCode, detail.resultCodeListUri))
      : details;

  return pool.toSorted((a, b) => b.rank - a.rank || b.date - a.date)[0].candidate;
}

function findTenderResultForLot(projectLots, tenderResults, lotId) {
  const matches = tenderResults.filter(
    (tr) => tr.numeroLote && String(tr.numeroLote) === String(lotId)
  );

  // Un mismo lote puede aparecer varias veces en el feed (p. ej. estados
  // sucesivos). No debemos quedarnos arbitrariamente con el primer resultado.
  // Preferimos el resultado más reciente; en empate, el adjudicado/desierto
  // prevalece sobre estados intermedios.
  if (matches.length > 0) {
    return matches.toSorted((a, b) => {
      const rank = (tr) => {
        const mapped = mapTenderResultCode(tr.resultCode, tr.resultCodeListUri).code;
        if (mapped === 'FORMALIZED') return 3;
        if (mapped === 'AWARDED' || mapped === 'DESERTED' || mapped === 'RENOUNCED' || mapped === 'WITHDRAWN') return 2;
        return 1;
      };

      // El resultado representa un estado del ciclo de vida. Un resultado
      // formalizado sigue siendo el vigente aunque otro resultado tenga una
      // AwardDate posterior por una actualización del feed.
      const rankA = rank(a);
      const rankB = rank(b);
      if (rankA !== rankB) return rankB - rankA;

      const dateA = Date.parse(a.fechaAdjudicacion || '') || 0;
      const dateB = Date.parse(b.fechaAdjudicacion || '') || 0;
      return dateB - dateA;
    })[0];
  }

  const withoutLot = tenderResults.filter((tr) => !tr.numeroLote);
  return projectLots.length === 1 && withoutLot.length === 1
    ? withoutLot[0]
    : undefined;
}

function hasLotStructure(c) {
  return Array.isArray(c?.lotes) && c.lotes.length > 0;
}

function isDesertedResultCode(resultCode, listUri) {
  return isDesertedTenderResult(resultCode, listUri);
}


function runInTransaction(db, operation) {
  db.exec('BEGIN TRANSACTION;');
  try {
    const result = operation();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch {}
    throw error;
  }
}

function preserveSnapshotField(incoming, current, allowIncomingSnapshot = true) {
  const value = allowIncomingSnapshot
    ? (incoming != null ? incoming : current)
    : (current != null ? current : incoming);

  // node:sqlite rejects undefined bind values. Missing optional data must map
  // to SQL NULL so COALESCE preserves the persisted snapshot.
  return value === undefined ? null : value;
}

function preserveSnapshotCollection(incoming, current) {
  return Array.isArray(incoming) && incoming.length > 0
    ? incoming
    : (Array.isArray(current) ? current : []);
}

function shouldReplaceSnapshotCollection(incoming) {
  return Array.isArray(incoming) && incoming.length > 0;
}

function mergeLotAwardSnapshots(incoming, previous, clearAll = false) {
  if (clearAll) return [];
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return Array.isArray(previous) ? previous : [];
  }

  // A partial snapshot may update one awardee in a multi-award lot. Preserve
  // other awardees omitted from that snapshot; only an explicit no-award outcome
  // supersedes the complete previous award set for that lot.
  const lotKey = (award) => String(award.numeroLote ?? award.lot_number ?? '').trim();
  const awardeeKey = (award) => {
    const nif = String(award.nifAdjudicatario ?? award.awardee_nif ?? '').trim().toUpperCase();
    if (nif) return `nif:${nif}`;
    const name = String(award.adjudicatario ?? award.awardee ?? '').trim().toLocaleUpperCase('es');
    if (name) return `name:${name}`;
    return null;
  };
  // Prefer tax identity when both snapshots provide it. If either snapshot
  // omits the NIF, fall back to the normalized name to avoid duplicating the
  // same awardee across partial lifecycle updates.
  const sameAwardee = (left, right) => {
    const leftNif = String(left.nifAdjudicatario ?? left.awardee_nif ?? '').trim().toUpperCase();
    const rightNif = String(right.nifAdjudicatario ?? right.awardee_nif ?? '').trim().toUpperCase();
    if (leftNif && rightNif) return leftNif === rightNif;
    const leftName = String(left.adjudicatario ?? left.awardee ?? '').trim().toLocaleUpperCase('es');
    const rightName = String(right.adjudicatario ?? right.awardee ?? '').trim().toLocaleUpperCase('es');
    return Boolean(leftName && rightName && leftName === rightName);
  };
  const resultCode = (award) => award.resultCode ?? award.result_code;
  const resultListUri = (award) => award.resultCodeListUri ?? award.result_code_list_uri;
  const incomingByLot = new Map();
  for (const award of incoming) {
    const key = lotKey(award);
    if (!incomingByLot.has(key)) incomingByLot.set(key, []);
    incomingByLot.get(key).push(award);
  }

  const previousAwards = Array.isArray(previous) ? previous : [];
  const merged = previousAwards.filter((oldAward) => {
    const currentLot = incomingByLot.get(lotKey(oldAward));
    if (!currentLot) return true;
    if (currentLot.some((award) =>
      !awardeeKey(award) &&
      isDefinitiveNoAwardTenderResult(resultCode(award), resultListUri(award))
    )) return false;

    return !currentLot.some((award) => sameAwardee(oldAward, award));
  });

  const enrichedIncoming = incoming.map((award) => {
    const key = awardeeKey(award);
    if (!key) return award;
    const oldAward = previousAwards.find((candidate) =>
      lotKey(candidate) === lotKey(award) && sameAwardee(candidate, award)
    );
    if (!oldAward) return award;

    const result = { ...oldAward, ...award };
    for (const field of [
      'adjudicatario',
      'nifAdjudicatario',
      'importeSinIva',
      'importeConIva',
      'numOfertas',
      'fechaAdjudicacion',
      'descripcion',
      'awardee',
      'awardee_nif',
      'awarded_amount',
      'awarded_amount_incl_vat',
      'offer_count',
      'award_date',
      'description',
    ]) {
      if (result[field] == null && oldAward[field] != null) result[field] = oldAward[field];
    }
    return result;
  });

  return [...merged, ...enrichedIncoming];
}

function preserveMissingLotAwardData(incomingLots, persistedLots) {
  const previousByNumber = new Map(
    (Array.isArray(persistedLots) ? persistedLots : [])
      .map((lot) => [String(lot.lot_number), lot])
  );
  const incoming = (Array.isArray(incomingLots) ? incomingLots : []).map((lot) => {
    const previous = previousByNumber.get(String(lot.numeroLote));
    previousByNumber.delete(String(lot.numeroLote));
    if (!previous) return lot;

    const incomingResultCode = lot.resultCode ?? lot.result_code;
    const incomingResultListUri = lot.resultCodeListUri ?? lot.result_code_list_uri;
    const incomingResultState = mapTenderResultCode(incomingResultCode, incomingResultListUri).code;
    const previousResultState = mapTenderResultCode(previous.result_code, previous.result_code_list_uri).code;
    const incomingIsProvisionalNoAward = incomingResultState.endsWith('_PROVISIONALLY') &&
      isNoAwardTenderResult(incomingResultCode, incomingResultListUri);
    const previousHasDefinitiveAward = previousResultState === 'AWARDED' || previousResultState === 'FORMALIZED';

    if (incomingIsProvisionalNoAward && previousHasDefinitiveAward) {
      return {
        ...lot,
        importeAdjudicacion: previous.awarded_amount,
        importeAdjConIva: previous.awarded_amount_incl_vat,
        adjudicatario: previous.awardee,
        nifAdjudicatario: previous.awardee_nif,
        estadoLote: previous.lot_status,
        fechaAdjudicacion: previous.award_date,
        resultCode: previous.result_code,
        resultCodeListUri: previous.result_code_list_uri,
        numOfertas: previous.offer_count,
      };
    }

    const hasIncomingResult = lot.resultCode != null ||
      lot.importeAdjudicacion != null ||
      lot.importeAdjConIva != null ||
      lot.adjudicatario != null ||
      lot.nifAdjudicatario != null;
    const hasPreviousResult = previous.result_code != null ||
      previous.awarded_amount != null ||
      previous.awarded_amount_incl_vat != null ||
      previous.awardee != null ||
      previous.awardee_nif != null;
    if (hasIncomingResult || !hasPreviousResult) return lot;

    return {
      ...lot,
      importeAdjudicacion: previous.awarded_amount,
      importeAdjConIva: previous.awarded_amount_incl_vat,
      adjudicatario: previous.awardee,
      nifAdjudicatario: previous.awardee_nif,
      estadoLote: previous.lot_status,
      fechaAdjudicacion: previous.award_date,
      resultCode: previous.result_code,
      resultCodeListUri: previous.result_code_list_uri,
      numOfertas: previous.offer_count,
    };
  });

  // A partial TenderResult feed can omit a known lot entirely. Keep that lot
  // and its award until PLACSP explicitly publishes a result for it.
  for (const previous of previousByNumber.values()) {
    incoming.push({
      numeroLote: String(previous.lot_number),
      nombreLote: previous.lot_name,
      importeSinIva: previous.amount_excl_vat,
      importeConIva: previous.amount_incl_vat,
      valorEstimado: previous.estimated_value,
      adjudicatario: previous.awardee,
      nifAdjudicatario: previous.awardee_nif,
      estadoLote: previous.lot_status,
      fechaAdjudicacion: previous.award_date,
      cpv: previous.cpv,
      presupuestoSinIva: previous.budget_excl_vat,
      presupuestoConIva: previous.budget_incl_vat,
      importeAdjudicacion: previous.awarded_amount,
      importeAdjConIva: previous.awarded_amount_incl_vat,
      numOfertas: previous.offer_count,
      resultCode: previous.result_code,
      resultCodeListUri: previous.result_code_list_uri,
    });
  }
  return incoming;
}

function mergeContractAwardSnapshots(incoming, previous, clearAll = false) {
  if (clearAll) return Array.isArray(incoming) ? incoming : [];
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return Array.isArray(previous) ? previous : [];
  }

  const awardeeKey = (award) => {
    const nif = String(award.nifAdjudicatario ?? award.awardee_nif ?? '').trim().toUpperCase();
    if (nif) return `nif:${nif}`;
    const name = String(award.adjudicatario ?? award.awardee ?? '').trim().toLocaleUpperCase('es');
    return name ? `name:${name}` : null;
  };
  const sameAwardee = (left, right) => {
    const leftNif = String(left.nifAdjudicatario ?? left.awardee_nif ?? '').trim().toUpperCase();
    const rightNif = String(right.nifAdjudicatario ?? right.awardee_nif ?? '').trim().toUpperCase();
    if (leftNif && rightNif) return leftNif === rightNif;
    const leftName = String(left.adjudicatario ?? left.awardee ?? '').trim().toLocaleUpperCase('es');
    const rightName = String(right.adjudicatario ?? right.awardee ?? '').trim().toLocaleUpperCase('es');
    return Boolean(leftName && rightName && leftName === rightName);
  };
  const resultCode = (award) => award.resultCode ?? award.result_code;
  const resultListUri = (award) => award.resultCodeListUri ?? award.result_code_list_uri;
  const hasDefinitiveNoAward = incoming.some((award) =>
    !awardeeKey(award) &&
    isDefinitiveNoAwardTenderResult(resultCode(award), resultListUri(award))
  );
  if (hasDefinitiveNoAward) return incoming;

  const previousAwards = Array.isArray(previous) ? previous : [];
  const preserved = previousAwards.filter((oldAward) => {
    const oldKey = awardeeKey(oldAward);
    return !oldKey || !incoming.some((award) => sameAwardee(oldAward, award));
  });
  const enrichedIncoming = incoming.map((award) => {
    if (!awardeeKey(award)) return award;
    const oldAward = previousAwards.find((candidate) => sameAwardee(candidate, award));
    if (!oldAward) return award;

    const result = { ...oldAward, ...award };
    for (const field of [
      'adjudicatario',
      'nifAdjudicatario',
      'importeSinIva',
      'importeConIva',
      'numOfertas',
      'fechaAdjudicacion',
      'descripcion',
      'awardee',
      'awardee_nif',
      'awarded_amount',
      'awarded_amount_incl_vat',
      'offer_count',
      'award_date',
      'description',
    ]) {
      if (result[field] == null && oldAward[field] != null) result[field] = oldAward[field];
    }
    return result;
  });

  return [...preserved, ...enrichedIncoming];
}

function reconcileSnapshotAwardCollections(newerSnapshot, olderSnapshot, newerSnapshotHasNoAward) {
  newerSnapshot.contract_awards = mergeContractAwardSnapshots(
    newerSnapshot.contract_awards,
    olderSnapshot.contract_awards,
    newerSnapshotHasNoAward
  );
  newerSnapshot.lot_awards = mergeLotAwardSnapshots(
    newerSnapshot.lot_awards,
    olderSnapshot.lot_awards,
    newerSnapshotHasNoAward
  );
  if (newerSnapshotHasNoAward) {
    // A contract-level cancellation/desertion supersedes previous lot awards.
    newerSnapshot._clearLotAwards = true;
  }
  return newerSnapshot;
}

function shouldAdvanceStatus(currentStatus, incomingStatus) {
  const current = String(currentStatus || '').trim();
  const incoming = String(incomingStatus || '').trim();
  if (!incoming || !current || current === incoming) return true;

  // Once a lifecycle terminal state is persisted, an inconsistent later
  // snapshot must not regress it to an earlier stage or a conflicting outcome.
  if (['Formalizada', 'Anulada', 'Desierta'].includes(current)) return false;

  // Explicit outcomes can supersede non-terminal stages, but not a terminal
  // outcome already stored.
  if (['Formalizada', 'Anulada', 'Desierta'].includes(incoming)) return true;

  const rank = {
    Publicada: 0,
    'En evaluación': 1,
    Adjudicada: 2,
    Resuelta: 3,
  };
  const currentRank = rank[current];
  const incomingRank = rank[incoming];
  if (currentRank == null || incomingRank == null) return false;
  return incomingRank >= currentRank;
}

function shouldReconcileLots(existing, incoming) {
  // La ausencia de lotes en un feed incremental no demuestra que el expediente
  // haya dejado de estar lotizado. Solo sustituimos la estructura persistida
  // cuando PLACSP nos entrega lotes estructurados de forma explícita.
  if (!existing) return hasLotStructure(incoming);
  return hasLotStructure(incoming);
}

function shouldRepairSingleTenderResultLotRows(existing, incoming) {
  return Boolean(
    existing &&
    String(existing.lots_source || '') === 'CODICE_TENDER_RESULTS' &&
    Number(existing.lot_count || 0) === 1 &&
    !hasLotStructure(incoming)
  );
}

function clearPersistedAwardSummary(db, existing) {
  db.prepare(`UPDATE contracts
    SET awarded_amount = NULL,
        awarded_amount_incl_vat = NULL,
        awardee = NULL,
        awardee_nif = NULL
    WHERE id = ?`).run(existing.id);
  existing.awarded_amount = null;
  existing.awarded_amount_incl_vat = null;
  existing.awardee = null;
  existing.awardee_nif = null;
}

function isNoAwardTenderResult(resultCode, listUri) {
  return isDesertedTenderResult(resultCode, listUri) || isCanceledTenderResult(resultCode, listUri);
}

function isDefinitiveNoAwardTenderResult(resultCode, listUri) {
  const code = mapTenderResultCode(resultCode, listUri).code;
  return isNoAwardTenderResult(resultCode, listUri) && !code.endsWith('_PROVISIONALLY');
}

function isPreAwardTenderResult(resultCode, listUri) {
  return mapTenderResultCode(resultCode, listUri).code === 'BEST_RATED_TENDERER';
}

function areAllLotsExplicitlyNoAward(lots) {
  return Array.isArray(lots) && lots.length > 0 &&
    lots.every((lot) => isDefinitiveNoAwardTenderResult(lot.resultCode, lot.resultCodeListUri));
}

function normalizeContractingAuthorityMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves a PLACSP contracting profile using explicit identifiers.
 * Historical names are only explicit, versioned aliases configured for a
 * known profile; they are never used as fuzzy inclusion criteria.
 */
function resolveContractingAuthority(ids, contractingAuthorityName, targetAuthorities) {
  if (ids.ID_PLATAFORMA && targetAuthorities.byPlacspId.has(ids.ID_PLATAFORMA)) {
    return targetAuthorities.byPlacspId.get(ids.ID_PLATAFORMA);
  }
  if (ids.DIR3 && targetAuthorities.byDir3.has(ids.DIR3)) {
    return targetAuthorities.byDir3.get(ids.DIR3);
  }
  if (ids.NIF) {
    const matches = targetAuthorities.byNif.get(ids.NIF) || [];
    if (matches.length === 1) return matches[0];
  }
  const historicalName = normalizeContractingAuthorityMatch(contractingAuthorityName);
  if (!historicalName) return null;
  const matches = targetAuthorities.byHistoricalName.get(historicalName) || [];
  return matches.length === 1 ? matches[0] : null;
}



function extractFormalizationDate(tenderXml, procedimientoCodigo, procedimiento, resultCode, resultCodeListUri, xml = '') {
  const code = String(procedimientoCodigo || '').trim();
  const normalizedProcedure = String(procedimiento || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const isFrameworkOrSda =
    ['7', '12', '100'].includes(code) ||
    normalizedProcedure.includes('acuerdo marco') ||
    normalizedProcedure.includes('sistema dinamico');

  const isFrameworkOrSdaAwarded =
    isFrameworkOrSda && isAwardedTenderResult(resultCode, resultCodeListUri);

  if (isFrameworkOrSda && !isFrameworkOrSdaAwarded) return null;

  const contractMatch =
    tenderXml.match(/<cac:Contract>([\s\S]*?)<\/cac:Contract>/) ||
    xml.match(/<cac:Contract>([\s\S]*?)<\/cac:Contract>/);
  const contractXml = contractMatch ? contractMatch[1] : '';
  const contractDate = getTagFromXml(/<cbc:IssueDate>([^<]+)<\/cbc:IssueDate>/, contractXml);

  return contractDate
    ? (contractDate.includes(' ') ? contractDate : `${contractDate} 00:00:00`)
    : null;
}

function getTagFromXml(pattern, source) {
  const match = String(source || '').match(pattern);
  return match ? decodeXmlEntities(match[1]) : null;
}

function extractPublicationDate(xml) {
  const noticeDates = [
    ...String(xml || '').matchAll(
      /<cac-place-ext:ValidNoticeInfo>[\s\S]*?<cbc-place-ext:NoticeIssueDate>([^<]+)<\/cbc-place-ext:NoticeIssueDate>[\s\S]*?<\/cac-place-ext:ValidNoticeInfo>/g
    ),
  ]
    .map((match) => match[1])
    .filter(Boolean);

  return noticeDates.toSorted()[0] || null;
}

function parseEntry(xml, conjunto, targetAuthorities) {
  const getTag = (pattern, source = xml) => {
    const m = source.match(pattern);
    return m ? decodeXmlEntities(m[1]) : null;
  };

  const placsp_id = getTag(/<id>([^<]+)<\/id>/);
  const link = getTag(/<link[^>]+href="([^"]+)"[^>]*rel="(?:alternate|deeplink)?"/) || getTag(/<link[^>]+href="([^"]+)"/);
  const expediente = getTag(/<cbc:ContractFolderID>([^<]+)<\/cbc:ContractFolderID>/);
  
  // Contracting Party
  const partyMatch = xml.match(/<cac-place-ext:LocatedContractingParty>([\s\S]*?)<\/cac-place-ext:LocatedContractingParty>/);
  const partyXml = partyMatch ? partyMatch[1] : '';
  const ids = {};
  for (const match of partyXml.matchAll(/<cbc:ID(?:\s+[^>]*)?\s+schemeName="([^"]+)"[^>]*>([^<]+)<\/cbc:ID>/g)) {
    ids[match[1]] = decodeXmlEntities(match[2]).trim();
  }
  const contracting_authority_nif = ids.NIF || null;
  const contracting_authority_dir3 = ids.DIR3 || null;
  const contracting_authority_name = getTag(/<cac:PartyName>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/, partyXml);
  const contracting_authority_city = getTag(/<cbc:CityName>([^<]+)<\/cbc:CityName>/, partyXml) || 'Alcázar de San Juan';

  const authority = resolveContractingAuthority(ids, contracting_authority_name, targetAuthorities);
  if (!authority) {
    return null;
  }

  // Procurement Project
  const projMatch = xml.match(/<cac:ProcurementProject>([\s\S]*?)<\/cac:ProcurementProject>/);
  const projXml = projMatch ? projMatch[1] : '';
  const objeto = getTag(/<cbc:Name>([\s\S]*?)<\/cbc:Name>/, projXml);
  const tipoCode = getTag(/<cbc:TypeCode[^>]*>([^<]+)<\/cbc:TypeCode>/, projXml);
  const isMenorSet = conjunto === 'menores' || conjunto === 'contratos_menores';
  const isEncargosSet = conjunto === 'encargos';
  let tipo_contrato = tipoCode ? TIPO_MAP[tipoCode] : null;
  let tipo_codigo = tipoCode || null;

  if (!tipo_contrato) {
    if (isMenorSet) {
      tipo_contrato = 'Servicios';
      tipo_codigo = tipo_codigo || '2';
    } else if (tipoCode) {
      console.warn(`⚠️ [sync] Tipo de contrato no clasificado en CODICE: "${tipoCode}" (expediente: "${expediente}"). Asignando etiqueta descriptiva.`);
      tipo_contrato = `Tipo no clasificado (código ${tipoCode})`;
    } else {
      tipo_contrato = 'Otros';
    }
  }

  // Procedure & Diligence
  const procMatch = xml.match(/<cac:TenderingProcess>([\s\S]*?)<\/cac:TenderingProcess>/);
  const procXml = procMatch ? procMatch[1] : '';
  const procCode = getTag(/<cbc:ProcedureCode[^>]*>([^<]+)<\/cbc:ProcedureCode>/, procXml);
  let procedimiento_codigo = procCode || null;
  let procedimiento_procedencia = 'codigo';
  let rawProc = null;

  if (procCode && PROC_MAP[procCode]) {
    rawProc = PROC_MAP[procCode];
    procedimiento_procedencia = 'codigo';
  } else if (isMenorSet) {
    rawProc = 'Contrato menor';
    procedimiento_codigo = procedimiento_codigo || '6';
    procedimiento_procedencia = procCode ? 'codigo' : 'inferido';
  } else if (isEncargosSet) {
    rawProc = 'Encargo a medio propio';
    procedimiento_codigo = null;
    procedimiento_procedencia = 'inferido';
  } else if (procCode) {
    console.warn(`⚠️ [sync] Procedimiento no clasificado en CODICE: "${procCode}" (expediente: "${expediente}").`);
    rawProc = `Procedimiento no clasificado (código ${procCode})`;
    procedimiento_procedencia = 'codigo';
  } else {
    rawProc = 'Abierto';
    procedimiento_procedencia = 'inferido';
  }
  const procedimiento = normalizeProcedimiento(rawProc);
  const urgencia = getTag(/<cbc:UrgencyCode[^>]*>([^<]+)<\/cbc:UrgencyCode>/, procXml) || '1';

  // Status
  const statusCode = getTag(/<cbc-place-ext:ContractFolderStatusCode[^>]*>([^<]+)<\/cbc-place-ext:ContractFolderStatusCode>/);
  const statusListUriMatch = xml.match(/<cbc-place-ext:ContractFolderStatusCode[^>]*listURI="([^"]+)"[^>]*>/);
  const statusListUri = statusListUriMatch ? statusListUriMatch[1] : null;
  let estado = mapContractFolderStatusCode(statusCode, statusListUri);

  // Budget (PBL - Presupuesto Base de Licitación, Art. 100 LCSP: límite de gasto inicial sin impuestos ni prórrogas)
  const budgetMatch = projXml.match(/<cac:BudgetAmount>([\s\S]*?)<\/cac:BudgetAmount>/);
  const budgetXml = budgetMatch ? budgetMatch[1] : '';
  const importe_sin_iva = parseNullableNumber(getTag(/<cbc:TaxExclusiveAmount[^>]*>([^<]+)<\/cbc:TaxExclusiveAmount>/, budgetXml));
  const importe_con_iva = parseNullableNumber(getTag(/<cbc:TotalAmount[^>]*>([^<]+)<\/cbc:TotalAmount>/, budgetXml));

  // Valor Estimado del Contrato (VEC - Art. 101 LCSP: incluye prórrogas, modificaciones y primas; nunca incluye IVA)
  // En CODICE el VEC se publica dentro de ProcurementProject/BudgetAmount/EstimatedOverallContractAmount.
  const valor_estimado = extractEstimatedContractAmount(projXml, xml);

  // Tender Result
  const tenderResultMatches = [...xml.matchAll(/<cac:TenderResult>([\s\S]*?)<\/cac:TenderResult>/g)];
  const tenderResultsForEntry = tenderResultMatches.map((match) => {
    const trXml = match[1];
    const lotId = getTag(/<cbc:ProcurementProjectLotID[^>]*>([^<]+)<\/cbc:ProcurementProjectLotID>/, trXml);
    return { trXml, numeroLote: lotId || null };
  });
  // A TenderResult with ProcurementProjectLotID describes that lot, not the
  // contract as a whole. Never let the first lot leak into parent-level fields.
  const contractLevelResult = selectContractLevelTenderResult(tenderResultsForEntry);
  const tenderXml = contractLevelResult?.trXml || '';
  const resultCode = getTag(/<cbc:ResultCode[^>]*>([^<]+)<\/cbc:ResultCode>/, tenderXml);
  const resultListUriMatch = tenderXml.match(/<cbc:ResultCode[^>]*listURI="([^"]+)"[^>]*>/);
  const resultCodeListUri = resultListUriMatch ? resultListUriMatch[1] : null;
  const mappedResult = mapTenderResultCode(resultCode, resultCodeListUri);
  const fecha_adjudicacion = getTag(/<cbc:AwardDate>([^<]+)<\/cbc:AwardDate>/, tenderXml);
  const num_ofertas = parseNullableNumber(getTag(/<cbc:ReceivedTenderQuantity>([^<]+)<\/cbc:ReceivedTenderQuantity>/, tenderXml));
  const smeVal = getTag(/<cbc:SMEAwardedIndicator>([^<]+)<\/cbc:SMEAwardedIndicator>/, tenderXml);
  const es_pyme = smeVal === 'true' ? 1 : (smeVal === 'false' ? 0 : null);

  const winningMatch = tenderXml.match(/<cac:WinningParty>([\s\S]*?)<\/cac:WinningParty>/);
  const winningXml = winningMatch ? winningMatch[1] : '';
  let adjudicatario = getTag(/<cac:PartyName>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/, winningXml);
  let nif_adjudicatario = extractTenderResultAwardeeNif(winningXml);

  const awardedTotalMatch = tenderXml.match(/<cac:AwardedTenderedProject>([\s\S]*?)<\/cac:AwardedTenderedProject>/);
  const awardedTotalXml = awardedTotalMatch ? awardedTotalMatch[1] : '';
  let importe_adjudicacion = parseNullableNumber(getTag(/<cbc:TaxExclusiveAmount[^>]*>([^<]+)<\/cbc:TaxExclusiveAmount>/, awardedTotalXml));
  let importe_adj_con_iva = parseNullableNumber(getTag(/<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>/, awardedTotalXml));

  // ResultCode is a separate CODICE lifecycle signal. Never infer "Desierta"
  // merely from RES + missing WinningParty: some valid results have no winner
  // for reasons that are represented explicitly by ResultCode.
  if (mappedResult.code === 'DESERTED' || mappedResult.code === 'DESERTED_PROVISIONALLY') {
    estado = 'Desierta';
  } else if (mappedResult.code === 'WITHDRAWN' || mappedResult.code === 'RENOUNCED') {
    estado = 'Anulada';
  } else if (mappedResult.code === 'FORMALIZED') {
    estado = 'Formalizada';
  } else if (mappedResult.code === 'AWARDED' || mappedResult.code === 'AWARDED_PROVISIONALLY' || mappedResult.code === 'BEST_RATED_TENDERER') {
    estado = 'Adjudicada';
  }
  if (isNoAwardTenderResult(resultCode, resultCodeListUri) ||
      isPreAwardTenderResult(resultCode, resultCodeListUri)) {
    // A best-rated tenderer is not yet an awarded supplier. Keep its lifecycle
    // status, but do not expose its bid amount as an awarded contract amount.
    importe_adjudicacion = null;
    importe_adj_con_iva = null;
    adjudicatario = null;
    nif_adjudicatario = null;
  }

  // La ausencia del importe de adjudicación no permite inferirlo del PBL:
  // son magnitudes distintas y el importe adjudicado debe permanecer desconocido.

  // CPVs
  const cpvMatches = [...projXml.matchAll(/<cbc:ItemClassificationCode[^>]*>([^<]+)<\/cbc:ItemClassificationCode>/g)];
  const cpvsList = cpvMatches.map(m => m[1].trim()).filter(Boolean);
  const cpv_principal = cpvsList[0] || null;
  const cpvs = cpvsList.join(', ') || null;

  // Realized Location
  const locMatch = projXml.match(/<cac:RealizedLocation>([\s\S]*?)<\/cac:RealizedLocation>/);
  const locXml = locMatch ? locMatch[1] : '';
  const provincia = getTag(/<cbc:CountrySubentity>([^<]+)<\/cbc:CountrySubentity>/, locXml) || 'Ciudad Real';
  const ciudad = getTag(/<cbc:CityName>([^<]+)<\/cbc:CityName>/, locXml);
  const nuts = getTag(/<cbc:CountrySubentityCode[^>]*>([^<]+)<\/cbc:CountrySubentityCode>/, locXml) || 'ES422';
  const ubicacion = ciudad ? `${ciudad} (${provincia})` : provincia;

  // Planned Period
  const periodMatch = projXml.match(/<cac:PlannedPeriod>([\s\S]*?)<\/cac:PlannedPeriod>/);
  const periodXml = periodMatch ? periodMatch[1] : '';
  const duracion = getTag(/<cbc:DurationMeasure[^>]*>([^<]+)<\/cbc:DurationMeasure>/, periodXml);
  const duracion_unit_m = periodXml.match(/<cbc:DurationMeasure[^>]+unitCode="([^"]+)"/);
  const duracion_unidad = duracion_unit_m ? duracion_unit_m[1] : null;

  // Funding
  const financiacion_ue = getTag(/<cbc:FundingProgramCode[^>]*>([^<]+)<\/cbc:FundingProgramCode>/) || 'NO-EU';

  // Dates
  // NoticeIssueDate is the publication date in the contracting profile.
  // AdditionalPublicationDocumentReference/IssueDate belongs to other
  // publication media (e.g. BOE/DOUE) and must not determine this field.
  const fecha_pub_notice = extractPublicationDate(xml);
  const updated = getTag(/<updated>([^<]+)<\/updated>/);
  let fecha_publicacion = fecha_pub_notice || (updated ? updated.substring(0, 10) : null);
  if (fecha_publicacion && !fecha_publicacion.includes(' ')) {
    fecha_publicacion = fecha_publicacion + ' 00:00:00';
  }
  const fecha_actualizacion = updated ? updated.replace('T', ' ').substring(0, 19) : (fecha_publicacion || null);

  // Ano
  let year = null;
  if (fecha_publicacion) {
    const y = parseInt(fecha_publicacion.substring(0, 4), 10);
    if (!isNaN(y)) year = y;
  }
  if (!year && fecha_adjudicacion) {
    const y = parseInt(fecha_adjudicacion.substring(0, 4), 10);
    if (!isNaN(y)) year = y;
  }

  // Deadline / TenderSubmissionDeadlinePeriod
  const deadlineMatch = xml.match(/<cac:TenderSubmissionDeadlinePeriod>([\s\S]*?)<\/cac:TenderSubmissionDeadlinePeriod>/);
  const deadlineXml = deadlineMatch ? deadlineMatch[1] : '';
  const deadlineDate = getTag(/<cbc:EndDate>([^<]+)<\/cbc:EndDate>/, deadlineXml);
  const deadlineTime = getTag(/<cbc:EndTime>([^<]+)<\/cbc:EndTime>/, deadlineXml);
  let fecha_limite = deadlineDate ? (deadlineTime ? `${deadlineDate} ${deadlineTime}` : `${deadlineDate} 00:00:00`) : null;

  // Contract Formalization Date
  // Contract/IssueDate es la fecha de formalización para resultados formalizados.
  // En contratos basados en acuerdo marco/SDA, PLACSP también exige este campo
  // cuando el resultado es adjudicado.
  const fecha_formalizacion = extractFormalizationDate(
    tenderXml,
    procedimiento_codigo,
    procedimiento,
    resultCode,
    resultCodeListUri,
    xml
  );

  // Parse CODICE Lots (cac:ProcurementProjectLot and cac:TenderResult)
  const projectLots = [];
  const lotMatches = [...xml.matchAll(/<cac:ProcurementProjectLot>([\s\S]*?)<\/cac:ProcurementProjectLot>/g)];
  for (const m of lotMatches) {
    const lotXml = m[1];
    const lotId = getTag(/<cbc:ID[^>]*>([^<]+)<\/cbc:ID>/, lotXml);
    const lotName = getTag(/<cac:ProcurementProject>[\s\S]*?<cbc:Name>([\s\S]*?)<\/cbc:Name>/, lotXml);
    const budgetMatch = lotXml.match(/<cac:BudgetAmount>([\s\S]*?)<\/cac:BudgetAmount>/);
    const budgetXml = budgetMatch ? budgetMatch[1] : '';
    const budgetEx = parseNullableNumber(getTag(/<cbc:TaxExclusiveAmount[^>]*>([^<]+)<\/cbc:TaxExclusiveAmount>/, budgetXml));
    const budgetTot = parseNullableNumber(getTag(/<cbc:TotalAmount[^>]*>([^<]+)<\/cbc:TotalAmount>/, budgetXml));
    const lotEstimatedMatch = lotXml.match(/<cac:EstimatedOverallContractAmount>([\s\S]*?)<\/cac:EstimatedOverallContractAmount>/);
    const lotEstimatedXml = lotEstimatedMatch ? lotEstimatedMatch[1] : '';
    const lotValorEstimado = parseNullableNumber(
      getTag(/<cbc:EstimatedOverallContractAmount[^>]*>([^<]+)<\/cbc:EstimatedOverallContractAmount>/, lotXml) ||
      getTag(/<cbc:TaxExclusiveAmount[^>]*>([^<]+)<\/cbc:TaxExclusiveAmount>/, lotEstimatedXml)
    );
    const lotCpv = getTag(/<cbc:ItemClassificationCode[^>]*>([^<]+)<\/cbc:ItemClassificationCode>/, lotXml);

    if (lotId) {
      projectLots.push({
        numeroLote: lotId,
        nombreLote: lotName || `Lote ${lotId}`,
        importeSinIva: budgetEx,
        importeConIva: budgetTot,
        valorEstimado: lotValorEstimado,
        cpv: lotCpv || null,
      });
    }
  }

  let award_amount_type = classifyAwardAmountType({
    awardedAmount: importe_adjudicacion,
    budgetAmount: importe_sin_iva,
    objectDescription: objeto,
    lotCount: projectLots.length,
  });

  const tenderResults = [];
  const trMatches = [...xml.matchAll(/<cac:TenderResult>([\s\S]*?)<\/cac:TenderResult>/g)];
  for (const tr of trMatches) {
    const trXml = tr[1];
    const resultCode = getTag(/<cbc:ResultCode[^>]*>([^<]+)<\/cbc:ResultCode>/, trXml);
    const resultListUriMatch = trXml.match(/<cbc:ResultCode[^>]*listURI="([^"]+)"[^>]*>/);
    const resultListUri = resultListUriMatch ? resultListUriMatch[1] : null;
    const desc = getTag(/<cbc:Description>([\s\S]*?)<\/cbc:Description>/, trXml);
    const awardDate = getTag(/<cbc:AwardDate>([^<]+)<\/cbc:AwardDate>/, trXml);
    const lotId =
      getTag(/<cbc:ProcurementProjectLotID[^>]*>([^<]+)<\/cbc:ProcurementProjectLotID>/, trXml) ||
      getTag(/<cac:ProcurementProjectLot>[\s\S]*?<cbc:ID[^>]*>([^<]+)<\/cbc:ID>/, trXml);

    const winMatch = trXml.match(/<cac:WinningParty>([\s\S]*?)<\/cac:WinningParty>/);
    const winXml = winMatch ? winMatch[1] : '';
    const lotAdjudicatario = getTag(/<cac:PartyName>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/, winXml);
    const lotNif = extractTenderResultAwardeeNif(winXml);

    const awardedMatch = trXml.match(/<cac:AwardedTenderedProject>([\s\S]*?)<\/cac:AwardedTenderedProject>/);
    const awardedXml = awardedMatch ? awardedMatch[1] : '';
    const lotAmountSinIva = parseNullableNumber(getTag(/<cbc:TaxExclusiveAmount[^>]*>([^<]+)<\/cbc:TaxExclusiveAmount>/, awardedXml));
    const lotAmountConIva = parseNullableNumber(getTag(/<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>/, awardedXml));
    const lotNumOfertas = parseNullableInteger(
      getTag(/<cbc:ReceivedTenderQuantity>([^<]+)<\/cbc:ReceivedTenderQuantity>/, trXml)
    );

    tenderResults.push({
      numeroLote: lotId || null,
      adjudicatario: lotAdjudicatario || null,
      nifAdjudicatario: sanitizeNifForStorage(lotNif || null),
      importeSinIva: lotAmountSinIva,
      importeConIva: lotAmountConIva,
      numOfertas: lotNumOfertas,
      fechaAdjudicacion: awardDate || null,
      resultCode: resultCode || null,
      resultCodeListUri: resultListUri || null,
      resultState: mapTenderResultCode(resultCode, resultListUri).code,
      descripcion: desc || null,
    });
  }

  // El feed puede contener avisos repetidos del mismo resultado. No deben convertirse en lotes.
  const uniqueTenderResults = selectCurrentTenderResults(dedupeTenderResults(tenderResults));
  tenderResults.length = 0;
  tenderResults.push(...uniqueTenderResults);

  // Determine lot structure
  let lotizado = 0;
  let num_lotes = 1;
  let lotes_origen = null;
  const consolidatedLots = [];

  if (projectLots.length > 0) {
    lotizado = 1;
    num_lotes = projectLots.length;
    lotes_origen = 'CODICE_PROJECT_LOT';
    for (const pl of projectLots) {
      // Un resultado sin ID de lote solo puede asociarse cuando el expediente
      // tiene exactamente un lote estructurado. En expedientes multi-lote sería
      // incorrecto replicar el mismo importe/adjudicatario en todos los lotes.
      const tr = findTenderResultForLot(projectLots, tenderResults, pl.numeroLote);
      const isDesierto = tr && isDesertedResultCode(tr.resultCode, tr.resultCodeListUri);
      const isAnulado = tr && isCanceledTenderResult(tr.resultCode, tr.resultCodeListUri);
      const hasNoAward = Boolean(isDesierto || isAnulado);
      const isPreAward = tr && isPreAwardTenderResult(tr.resultCode, tr.resultCodeListUri);
      const hasAwardAmount = !hasNoAward && !isPreAward;
      const isAdjudicado = tr && isAwardedTenderResult(tr.resultCode, tr.resultCodeListUri);
      const adjSinIva = (hasAwardAmount && tr && tr.importeSinIva != null) ? tr.importeSinIva : null;
      const adjConIva = (hasAwardAmount && tr && tr.importeConIva != null) ? tr.importeConIva : null;

      consolidatedLots.push({
        numeroLote: pl.numeroLote,
        nombreLote: pl.nombreLote,
        importeSinIva: adjSinIva ?? pl.importeSinIva,
        importeConIva: adjConIva ?? pl.importeConIva,
        presupuestoSinIva: pl.importeSinIva,
        presupuestoConIva: pl.importeConIva,
        importeAdjudicacion: adjSinIva,
        importeAdjConIva: adjConIva,
        valorEstimado: pl.valorEstimado || null,
        adjudicatario: (hasAwardAmount && tr) ? tr.adjudicatario : null,
        nifAdjudicatario: (hasAwardAmount && tr) ? tr.nifAdjudicatario : null,
        estadoLote: isDesierto ? 'Desierto' : tr && isCanceledTenderResult(tr.resultCode, tr.resultCodeListUri) ? 'Anulada' : tr && isFormalizedTenderResult(tr.resultCode, tr.resultCodeListUri) ? 'Formalizada' : isAdjudicado ? 'Adjudicado' : tr ? 'Resuelto' : 'Definido en pliegos',
        resultCode: tr ? tr.resultCode : null,
        resultCodeListUri: tr ? tr.resultCodeListUri : null,
        fechaAdjudicacion: tr ? tr.fechaAdjudicacion : null,
        cpv: pl.cpv,
        numOfertas: tr ? tr.numOfertas : null,
      });
    }
  } else if (hasExplicitNumericLotIds(tenderResults)) {
    lotizado = 1;
    num_lotes = tenderResults.length;
    lotes_origen = 'CODICE_TENDER_RESULT';
    tenderResults.forEach((tr, idx) => {
      const lId = String(tr.numeroLote || (idx + 1));
      const isDesierto = isDesertedResultCode(tr.resultCode, tr.resultCodeListUri);
      const isAnulado = isCanceledTenderResult(tr.resultCode, tr.resultCodeListUri);
      const hasNoAward = isDesierto || isAnulado;
      const isPreAward = isPreAwardTenderResult(tr.resultCode, tr.resultCodeListUri);
      const isAdjudicado = isAwardedTenderResult(tr.resultCode, tr.resultCodeListUri);
      consolidatedLots.push({
        numeroLote: lId,
        nombreLote: tr.descripcion || `Lote ${lId}`,
        importeSinIva: tr.importeSinIva,
        importeConIva: tr.importeConIva,
        presupuestoSinIva: null,
        presupuestoConIva: null,
        importeAdjudicacion: (hasNoAward || isPreAward) ? null : tr.importeSinIva,
        importeAdjConIva: (hasNoAward || isPreAward) ? null : tr.importeConIva,
        valorEstimado: null,
        adjudicatario: (hasNoAward || isPreAward) ? null : tr.adjudicatario,
        nifAdjudicatario: (hasNoAward || isPreAward) ? null : tr.nifAdjudicatario,
        estadoLote: isDesierto ? 'Desierto' : isCanceledTenderResult(tr.resultCode, tr.resultCodeListUri) ? 'Anulada' : isFormalizedTenderResult(tr.resultCode, tr.resultCodeListUri) ? 'Formalizada' : isAdjudicado ? 'Adjudicado' : 'Resuelto',
        resultCode: tr.resultCode || null,
        resultCodeListUri: tr.resultCodeListUri || null,
        fechaAdjudicacion: tr.fechaAdjudicacion,
        cpv: cpv_principal,
        numOfertas: tr.numOfertas,
      });
    });
  }

  // El resumen del contrato debe sumar todas las adjudicaciones vigentes por lote,
  // no solo el TenderResult elegido para representar cada lote en contract_lots.
  const lotAwardAggregate = aggregateAwardedLotAmounts(tenderResults, consolidatedLots);
  const contractAwardAggregate = aggregateAwardedContractAmounts(tenderResults);
  const hasAggregatedAwardAmount = lotAwardAggregate.hasAggregatedAwardAmount ||
    contractAwardAggregate.hasAggregatedAwardAmount;
  if (lotAwardAggregate.hasAggregatedAwardAmount) {
    importe_adjudicacion = lotAwardAggregate.awardedAmount;
    // A missing VAT-inclusive amount for any aggregated award means the parent
    // VAT-inclusive total is unknown; do not retain a representative row's amount.
    importe_adj_con_iva = lotAwardAggregate.awardedAmountInclVat;
  } else if (contractAwardAggregate.hasAggregatedAwardAmount) {
    importe_adjudicacion = contractAwardAggregate.awardedAmount;
    importe_adj_con_iva = contractAwardAggregate.awardedAmountInclVat;
  } else if (hasIncompleteContractLevelAwardAmounts(tenderResults) || hasIncompleteLotAwardAmounts(tenderResults, consolidatedLots)) {
    // Do not expose the representative TenderResult amount as the whole-contract
    // total when multiple current awardees exist but at least one amount is missing.
    importe_adjudicacion = null;
    importe_adj_con_iva = null;
    adjudicatario = null;
    nif_adjudicatario = null;
  } else if (areAllLotsExplicitlyNoAward(consolidatedLots)) {
    // Explicit no-award results for every lot supersede any stale contract-level summary.
    importe_adjudicacion = null;
    importe_adj_con_iva = null;
    adjudicatario = null;
    nif_adjudicatario = null;
  }

  // A contract with active awarded lots must reflect that awards exist,
  // even if an unassigned or lot-level deserted result was selected at the contract level.
  const lotDerivedStatus = deriveContractStatusFromLots(consolidatedLots);
  if (lotDerivedStatus && ['Desierta', 'Anulada'].includes(estado)) {
    estado = lotDerivedStatus;
  }

  // Re-evaluate after lot consolidation because the parent award may be the
  // sum of awarded lots rather than the raw TenderResult amount.
  award_amount_type = hasAggregatedAwardAmount
    ? classifyAggregatedAwardAmountType({ awardedAmount: importe_adjudicacion, budgetAmount: importe_sin_iva })
    : classifyAwardAmountType({
      awardedAmount: importe_adjudicacion,
      budgetAmount: importe_sin_iva,
      objectDescription: objeto,
      lotCount: projectLots.length || consolidatedLots.length,
    });

  const id = getContractIdentityKey(expediente, authority.id);

  const finalObjeto = objeto || 'Sin objeto especificado';
  const naturaleza_economica = classifyEconomicNature({
    id,
    placsp_id,
    tipo_codigo,
    tipo_contrato,
    objeto: finalObjeto
  });

  if (tipo_codigo === '50' && naturaleza_economica === 'sin_clasificar') {
    console.warn(`⚠️ [SYNC WARNING] Contrato patrimonial (código 50) no clasificado: ${expediente} (${id})`);
  }

  return {
    id,
    placsp_id,
    expediente: expediente || placsp_id || id,
    objeto: finalObjeto,
    contracting_authority_name: contracting_authority_name || authority.name,
    contracting_authority_nif,
    contracting_authority_dir3,
    contracting_authority_city,
    dependencia: 'Sector Público > ENTIDADES LOCALES > Castilla La Mancha > Ciudad Real > Ayuntamientos > Alcazar de san Juan',
    tipo_contrato,
    tipo_codigo,
    naturaleza_economica,
    procedimiento,
    procedimiento_codigo,
    procedimiento_procedencia,
    estado,
    importe_sin_iva,
    importe_con_iva,
    valor_estimado,
    importe_adjudicacion,
    importe_adj_con_iva,
    award_amount_type,
    adjudicatario,
    nif_adjudicatario,
    num_ofertas,
    es_pyme,
    cpv_principal,
    cpvs,
    ubicacion,
    nuts,
    duracion,
    duracion_unidad,
    financiacion_ue,
    urgencia,
    fecha_limite,
    fecha_adjudicacion: fecha_adjudicacion ? (fecha_adjudicacion.includes(' ') ? fecha_adjudicacion : fecha_adjudicacion + ' 00:00:00') : null,
    fecha_formalizacion,
    fecha_publicacion,
    fecha_actualizacion,
    url: link,
    conjunto,
    year,
    contracting_authority_id: authority.id,
    scope: authority.scope,
    lotizado,
    num_lotes,
    lotes_origen,
    lotes: consolidatedLots,
    status_code: statusCode,
    status_code_list_uri: statusListUri,
    result_code: resultCode || null,
    result_code_list_uri: resultCodeListUri,
    contract_awards: selectContractLevelTenderResults(tenderResults),
    lot_awards: buildLotAwards(tenderResults),
  };
}

async function streamParseZip(zipPath, conjunto, targetAuthorities, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(zipPath)) {
      return resolve([]);
    }

    const contracts = [];
    const proc = spawnImpl('unzip', ['-p', zipPath]);
    // Keep raw configured names in the fast path. Normalized names cannot be
    // matched with String.includes(), so using them here would skip historical
    // entries whose NIF is empty before parseEntry() can resolve the name.
    const identifiers = [
      ...targetAuthorities.byPlacspId.keys(),
      ...targetAuthorities.byDir3.keys(),
      ...targetAuthorities.byNif.keys(),
      ...targetAuthorities.searchNames
    ];
    let buffer = '';

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let entryStart;
      while ((entryStart = buffer.indexOf('<entry>')) !== -1) {
        const entryEnd = buffer.indexOf('</entry>', entryStart);
        if (entryEnd === -1) {
          buffer = buffer.substring(entryStart);
          break;
        }
        const entryXml = buffer.substring(entryStart, entryEnd + 8);
        buffer = buffer.substring(entryEnd + 8);

        // Fast regex check before full parse
        if (identifiers.some(identifier => entryXml.includes(identifier))) {
          const parsed = parseEntry(entryXml, conjunto, targetAuthorities);
          if (parsed && parsed.expediente) {
            contracts.push(parsed);
          }
        }
      }
    });

    proc.stderr.on('data', () => {}); // ignore standard unzip warnings
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    proc.on('close', (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        fail(new Error(`No se pudo extraer ${path.basename(zipPath)} con unzip (exit=${code ?? 'null'}, signal=${signal ?? 'none'}).`));
        return;
      }
      settled = true;
      resolve(contracts);
    });
    proc.on('error', fail);
  });
}

function getTargetYears() {
  const yearArg = process.argv.find(a => a.startsWith('--year=') || a.startsWith('-y='));
  if (yearArg) {
    const val = yearArg.split('=')[1].trim();
    if (val.toLowerCase() === 'all') {
      return ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018'];
    }
    return val.split(',').map(y => y.trim()).filter(Boolean);
  }
  const yIndex = process.argv.findIndex(a => a === '-y' || a === '--year');
  if (yIndex !== -1 && process.argv[yIndex + 1]) {
    const val = process.argv[yIndex + 1].trim();
    if (val.toLowerCase() === 'all') {
      return ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018'];
    }
    return val.split(',').map(y => y.trim()).filter(Boolean);
  }
  return ['2026'];
}

function ensureZipFilesForYear(year, { download = process.argv.includes('--download'), execFileSyncImpl = execFileSync, fsImpl = fs, rawDir = RAW_DIR } = {}) {
  fsImpl.mkdirSync(rawDir, { recursive: true });

  const files = [
    {
      name: `contratosMenores${year}.zip`,
      url: `https://contrataciondelestado.es/sindicacion/sindicacion_1143/contratosMenoresPerfilesContratantes_${year}.zip`
    },
    {
      name: `licitaciones${year}.zip`,
      url: `https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3_${year}.zip`
    }
  ];

  for (const f of files) {
    const target = path.join(rawDir, f.name);
    const exists = fsImpl.existsSync(target);

    if (!exists || download) {
      console.log(`⬇️  Descargando paquete oficial de PLACSP (${year}): ${f.name}...`);
      const temporaryTarget = `${target}.download-${process.pid}`;
      try {
        if (fsImpl.existsSync(temporaryTarget)) fsImpl.unlinkSync(temporaryTarget);
        execFileSyncImpl('curl', [
          '-fL', '--retry', '3', '--retry-delay', '2', '-sS',
          f.url,
          '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          '-o', temporaryTarget
        ], { stdio: 'inherit' });
        const size = fsImpl.statSync(temporaryTarget).size;
        if (size === 0) throw new Error('el archivo descargado está vacío');
        fsImpl.renameSync(temporaryTarget, target);
        console.log(`✅ ${f.name} descargado (${Math.round(size / 1024 / 1024)} MB)`);
      } catch (err) {
        try { if (fsImpl.existsSync(temporaryTarget)) fsImpl.unlinkSync(temporaryTarget); } catch {}
        throw new Error(`No se pudo descargar ${f.name}: ${err.message}`, { cause: err });
      }
    } else {
      console.log(`📂 Utilizando archivo local en caché: ${f.name} (${Math.round(fsImpl.statSync(target).size / 1024 / 1024)} MB)`);
    }
  }
}

function ensureSyncSchema(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS contracting_authorities (
      id TEXT PRIMARY KEY,
      placsp_id TEXT UNIQUE,
      dir3 TEXT,
      nif TEXT,
      name TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'Directa Municipal',
      active INTEGER NOT NULL DEFAULT 1,
      historical_names_json TEXT NOT NULL DEFAULT '[]'
    )`);

    // Ensure schema columns exist
    const cols = db.prepare('PRAGMA table_info(contracts)').all().map(c => c.name);
    if (!cols.includes('contracting_authority_id')) {
      db.exec('ALTER TABLE contracts ADD COLUMN contracting_authority_id TEXT;');
    }
    if (!cols.includes('placsp_id')) {
      db.exec('ALTER TABLE contracts ADD COLUMN placsp_id TEXT;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_contracts_placsp_id ON contracts(placsp_id);');
    }
    const existingColumns = db.prepare('PRAGMA table_info(contracts)').all().map(c => c.name);
    const ensureColumn = (name, type) => {
      if (!existingColumns.includes(name)) {
        db.exec(`ALTER TABLE contracts ADD COLUMN ${name} ${type};`);
        existingColumns.push(name);
      }
    };
    ensureColumn('contracting_authority_name', 'TEXT');
    ensureColumn('contracting_authority_nif', 'TEXT');
    ensureColumn('contracting_authority_dir3', 'TEXT');
    ensureColumn('contracting_authority_city', 'TEXT');
    ensureColumn('year', 'INTEGER');
    ensureColumn('scope', 'TEXT');
    ensureColumn('award_amount_type', "TEXT NOT NULL DEFAULT 'desconocido'");

    // Ensure fecha_formalizacion column exists
    if (!cols.includes('formalization_date')) {
      db.exec('ALTER TABLE contracts ADD COLUMN formalization_date TEXT;');
    }
    if (!cols.includes('is_lotized')) {
      db.exec('ALTER TABLE contracts ADD COLUMN is_lotized INTEGER DEFAULT 0;');
    }
    if (!cols.includes('lot_count')) {
      db.exec('ALTER TABLE contracts ADD COLUMN lot_count INTEGER DEFAULT 1;');
    }
    if (!cols.includes('lots_source')) {
      db.exec('ALTER TABLE contracts ADD COLUMN lots_source TEXT;');
    }
    if (!cols.includes('estimated_value')) {
      db.exec('ALTER TABLE contracts ADD COLUMN estimated_value REAL;');
    }
    if (!cols.includes('updated_at')) {
      db.exec('ALTER TABLE contracts ADD COLUMN updated_at TEXT;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_contracts_updated_at ON contracts(updated_at);');
    }
    if (!cols.includes('documents_synced_at')) {
      db.exec('ALTER TABLE contracts ADD COLUMN documents_synced_at TEXT;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_contracts_documents_synced_at ON contracts(documents_synced_at);');
    }
    if (!cols.includes('contract_type_code')) {
      db.exec('ALTER TABLE contracts ADD COLUMN contract_type_code TEXT;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_contracts_contract_type_code ON contracts(contract_type_code);');
    }
    if (!cols.includes('procedure_code')) {
      db.exec('ALTER TABLE contracts ADD COLUMN procedure_code TEXT;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_contracts_procedure_code ON contracts(procedure_code);');
    }
    if (!cols.includes('procedure_source')) {
      db.exec("ALTER TABLE contracts ADD COLUMN procedure_source TEXT DEFAULT 'codigo';");
    }
    if (!cols.includes('economic_nature')) {
      db.exec("ALTER TABLE contracts ADD COLUMN economic_nature TEXT DEFAULT 'gasto';");
      db.exec('CREATE INDEX IF NOT EXISTS idx_contracts_economic_nature ON contracts(economic_nature);');
    }
    ensureColumn('status_code', 'TEXT');
    ensureColumn('status_code_list_uri', 'TEXT');
    ensureColumn('result_code', 'TEXT');
    ensureColumn('result_code_list_uri', 'TEXT');

    // Ensure licitaciones_lotes table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS contract_lots (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        case_number TEXT,
        lot_number TEXT NOT NULL,
        lot_name TEXT,
        amount_excl_vat REAL,
        amount_incl_vat REAL,
        estimated_value REAL,
        awardee TEXT,
        awardee_nif TEXT,
        lot_status TEXT,
        award_date TEXT,
        cpv TEXT,
        budget_excl_vat REAL,
        budget_incl_vat REAL,
        awarded_amount REAL,
        awarded_amount_incl_vat REAL,
        offer_count INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_contract_lots_contract_id ON contract_lots(contract_id);
      CREATE INDEX IF NOT EXISTS idx_contract_lots_case_number ON contract_lots(case_number);
      CREATE TABLE IF NOT EXISTS contract_awards (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        case_number TEXT,
        award_index INTEGER NOT NULL,
        awardee TEXT,
        awardee_nif TEXT,
        awarded_amount REAL,
        awarded_amount_incl_vat REAL,
        offer_count INTEGER,
        award_date TEXT,
        result_code TEXT,
        result_code_list_uri TEXT,
        result_state TEXT,
        description TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_contract_awards_contract_id ON contract_awards(contract_id);
      CREATE INDEX IF NOT EXISTS idx_contract_awards_case_number ON contract_awards(case_number);
      CREATE TABLE IF NOT EXISTS lot_awards (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        case_number TEXT,
        lot_number TEXT NOT NULL,
        award_index INTEGER NOT NULL,
        awardee TEXT,
        awardee_nif TEXT,
        awarded_amount REAL,
        awarded_amount_incl_vat REAL,
        offer_count INTEGER,
        award_date TEXT,
        result_code TEXT,
        result_code_list_uri TEXT,
        result_state TEXT,
        description TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_lot_awards_contract_id ON lot_awards(contract_id);
      CREATE INDEX IF NOT EXISTS idx_lot_awards_case_number ON lot_awards(case_number);
      CREATE INDEX IF NOT EXISTS idx_lot_awards_lot_number ON lot_awards(contract_id, lot_number);
    `);

    const loteCols = db.prepare('PRAGMA table_info(contract_lots)').all().map(c => c.name);
    if (!loteCols.includes('estimated_value')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN estimated_value REAL;');
    }
    if (!loteCols.includes('budget_excl_vat')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN budget_excl_vat REAL;');
    }
    if (!loteCols.includes('budget_incl_vat')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN budget_incl_vat REAL;');
    }
    if (!loteCols.includes('awarded_amount')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN awarded_amount REAL;');
    }
    if (!loteCols.includes('awarded_amount_incl_vat')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN awarded_amount_incl_vat REAL;');
    }
    if (!loteCols.includes('offer_count')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN offer_count INTEGER;');
    }
    if (!loteCols.includes('result_code')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN result_code TEXT;');
    }
    if (!loteCols.includes('result_code_list_uri')) {
      db.exec('ALTER TABLE contract_lots ADD COLUMN result_code_list_uri TEXT;');
    }


    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

async function main({ dbPath = DB_PATH, argv = process.argv, db: suppliedDb = null, closeDb = !suppliedDb } = {}) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Uso:
  node scripts/sync.js [opciones]
  pnpm run sync [--opciones]

Opciones:
  --year=<año>       Año a sincronizar (ej: --year=2025 o --year=2025,2026 o --year=all) [defecto: 2026]
  --download         Fuerza la descarga de los paquetes ZIP de PLACSP aunque existan en local
  --help, -h         Muestra esta ayuda
`);
    return;
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🏛️  LICITALCÁZAR - SINCRONIZADOR DE CONTRATACIÓN PÚBLICA (PLACSP)  ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (!suppliedDb && !fs.existsSync(dbPath)) {
    console.error(`❌ No se encontró la base de datos en: ${dbPath}`);
    process.exitCode = 1;
    return;
  }

  const db = suppliedDb || new DatabaseSync(dbPath);
  try {

  // The contracting authority list is configuration data, not business logic.
  // init-db.js la siembra; las siguientes ejecuciones solo la leen.
  ensureSyncSchema(db);
  const awardedVolumeSql = buildAwardedVolumeSql('contracts');
  const awardAmountEligibilitySql = buildAwardAmountEligibilitySql('contracts');
  const targetRows = db.prepare(`SELECT id, placsp_id, dir3, nif, name, scope, historical_names_json FROM contracting_authorities WHERE active = 1`).all();
  const targetAuthorities = {
    byPlacspId: new Map(),
    byDir3: new Map(),
    byNif: new Map(),
    byHistoricalName: new Map(),
    searchNames: new Set(),
  };
  for (const row of targetRows) {
    const info = { id: row.id, placsp_id: row.placsp_id, dir3: row.dir3, nif: row.nif, name: row.name, scope: row.scope };
    if (row.placsp_id) targetAuthorities.byPlacspId.set(row.placsp_id, info);
    if (row.dir3) targetAuthorities.byDir3.set(row.dir3, info);
    if (row.nif) {
      const list = targetAuthorities.byNif.get(row.nif) || [];
      list.push(info);
      targetAuthorities.byNif.set(row.nif, list);
    }
    for (const name of [row.name, ...JSON.parse(row.historical_names_json || '[]')]) {
      const normalized = normalizeContractingAuthorityMatch(name);
      if (normalized) {
        const matches = targetAuthorities.byHistoricalName.get(normalized) || [];
        if (!matches.some(existing => existing.id === info.id)) matches.push(info);
        targetAuthorities.byHistoricalName.set(normalized, matches);
      }
      if (name) targetAuthorities.searchNames.add(name);
    }
  }
  if (targetRows.length === 0) {
    throw new Error('No hay contracting_authorities actives en la BD. Ejecuta pnpm run init-db.');
  }

  const { initDocumentsTable } = require('./sync-documentos');
  initDocumentsTable(db);

  const initialStats = db.prepare(`
    SELECT count(*) as total, 
           min(publication_date) as min_date, 
           max(publication_date) as max_date,
           round(sum(CASE
             WHEN NOT ${terminalContractStatusSql('contracts')}
               AND ${awardAmountEligibilitySql}
             THEN ${awardedVolumeSql}
             ELSE 0
           END), 2) as volumen
    FROM contracts
  `).get();

  console.log(`📊 Estado actual en base de datos:`);
  console.log(`   • Total contratos: ${initialStats.total.toLocaleString()}`);
  console.log(`   • Rango temporal: ${initialStats.min_date ? initialStats.min_date.substring(0, 10) : 'N/A'} ➡️ ${initialStats.max_date ? initialStats.max_date.substring(0, 10) : 'N/A'}`);
  console.log(`   • Volumen total: ${(initialStats.volumen / 1e6).toFixed(2)} M€\n`);

  const targetYears = getTargetYears();
  console.log(`🎯 Años a sincronizar: ${targetYears.join(', ')}`);

  const allMenores = [];
  const allLicitaciones = [];

  for (const yr of targetYears) {
    console.log(`\n📦 Preparando paquetes de datos para el año ${yr}...`);
    ensureZipFilesForYear(yr);

    const menoresPath = path.join(RAW_DIR, `contratosMenores${yr}.zip`);
    const licitacionesPath = path.join(RAW_DIR, `licitaciones${yr}.zip`);

    if (fs.existsSync(menoresPath) && fs.existsSync(licitacionesPath)) {
      console.log(`🔍 Escaneando y extrayendo licitaciones de ${yr}...`);
      const [m, l] = await Promise.all([
        streamParseZip(menoresPath, 'menores', targetAuthorities),
        streamParseZip(licitacionesPath, 'licitaciones', targetAuthorities)
      ]);

      console.log(`   • Contratos menores ${yr} encontrados: ${m.length}`);
      console.log(`   • Licitaciones mayores ${yr} encontradas: ${l.length}`);
      allMenores.push(...m);
      allLicitaciones.push(...l);
    } else {
      console.warn(`⚠️ No se encontraron ambos archivos ZIP para el año ${yr}`);
    }
  }

  const incomingContracts = [...allLicitaciones, ...allMenores];

  // Deduplicate incoming feeds by (expediente + contracting_authority_id), keeping the
  // newest PLACSP snapshot as the authoritative structure. Older notices may
  // still contain award/date information, so we merge only fields that the
  // newest snapshot does not provide.
  const incomingMap = new Map();
  for (const c of incomingContracts) {
    const key = normalizeIdentityPart(c.expediente) + '|' + normalizeIdentityPart(c.contracting_authority_id);
    const existing = incomingMap.get(key);
    if (!existing) {
      incomingMap.set(key, c);
      continue;
    }

    const incomingIsNewer = Boolean(
      c.fecha_actualizacion &&
      (!existing.updated_at || c.fecha_actualizacion > existing.updated_at)
    );

    const newerSnapshot = incomingIsNewer ? c : existing;
    const olderSnapshot = incomingIsNewer ? existing : c;

    // CRITICAL: Preserve the EARLIEST initial publication date across all notices.
    const publicationDates = [existing.fecha_publicacion, c.fecha_publicacion].filter(Boolean);
    newerSnapshot.fecha_publicacion = publicationDates.length > 0
      ? publicationDates.toSorted()[0]
      : null;

    // An explicit cancellation/desertion supersedes the older award summary.
    const newerSnapshotHasNoAward = isDefinitiveNoAwardTenderResult(
      newerSnapshot.result_code,
      newerSnapshot.result_code_list_uri
    );
    // Preserve data published by an older notice when the newest snapshot omits it.
    for (const field of [
      'fecha_limite',
      'fecha_formalizacion',
      'estimated_value',
      'adjudicatario',
      'nif_adjudicatario',
      'awarded_amount',
      'awarded_amount_incl_vat',
      'fecha_adjudicacion',
    ]) {
      const isAwardSummaryField = ['adjudicatario', 'nif_adjudicatario', 'awarded_amount', 'awarded_amount_incl_vat'].includes(field);
      if (!(newerSnapshotHasNoAward && isAwardSummaryField) &&
          newerSnapshot[field] == null && olderSnapshot[field] != null) {
        newerSnapshot[field] = olderSnapshot[field];
      }
    }

    // Lot structure is part of the snapshot: never let an older notice replace
    // the newer lot structure. If the newest snapshot has no lot structure,
    // retain the older explicit structure rather than deleting it.
    if (!hasLotStructure(newerSnapshot) && hasLotStructure(olderSnapshot)) {
      newerSnapshot.lotes = olderSnapshot.lotes;
      newerSnapshot.lotizado = olderSnapshot.lotizado;
      newerSnapshot.num_lotes = olderSnapshot.num_lotes;
      newerSnapshot.lotes_origen = olderSnapshot.lotes_origen;
      newerSnapshot._lotesFromOlderSnapshot = true;
    }

    // TenderResult puede faltar en un snapshot más nuevo aunque el expediente
    // conserve adjudicaciones publicadas previamente. La ausencia de resultados
    // no demuestra que esas adjudicaciones hayan sido retiradas: una retirada
    // explícita llega como un TenderResult con su estado correspondiente.
    reconcileSnapshotAwardCollections(
      newerSnapshot,
      olderSnapshot,
      newerSnapshotHasNoAward
    );

    incomingMap.set(key, newerSnapshot);
  }

  console.log(`   • Total contratos únicos procesados (${targetYears.join(', ')}): ${incomingMap.size}\n`);

  // Existing database map
  const existingRows = db.prepare('SELECT id, case_number, contracting_authority_id, contracting_authority_name, status, awardee, awarded_amount, award_amount_type, publication_date, updated_at, estimated_value, is_lotized, lot_count, lots_source FROM contracts').all();
  const existingByExp = new Map();

  for (const r of existingRows) {
    existingByExp.set(`${normalizeIdentityPart(r.case_number)}|${normalizeIdentityPart(r.contracting_authority_id)}`, r);
  }

  const insertStmt = db.prepare(`
    INSERT INTO contracts (
      id, contracting_authority_id, placsp_id, case_number, object_description, contracting_authority_name, contracting_authority_nif, contracting_authority_dir3, contracting_authority_city, department,
      contract_type, contract_type_code, procedure, procedure_code, procedure_source, economic_nature, status,
      amount_excl_vat, amount_incl_vat, estimated_value, awarded_amount,
      awarded_amount_incl_vat, award_amount_type, awardee, awardee_nif, offer_count, is_sme, primary_cpv,
      cpvs, location, nuts, duration, duration_unit, eu_funding, urgency, deadline_date,
      award_date, formalization_date, publication_date, updated_at, source_url, dataset, year, scope,
      is_lotized, lot_count, lots_source, status_code, status_code_list_uri, result_code, result_code_list_uri
    ) VALUES (${Array(51).fill('?').join(', ')})
  `);

  const updateStmt = db.prepare(`
    UPDATE contracts SET
      contracting_authority_id = coalesce(?, contracting_authority_id),
      placsp_id = coalesce(?, placsp_id),
      object_description = coalesce(?, object_description),
      contracting_authority_name = coalesce(?, contracting_authority_name),
      contracting_authority_nif = coalesce(?, contracting_authority_nif),
      contracting_authority_dir3 = coalesce(?, contracting_authority_dir3),
      contracting_authority_city = coalesce(?, contracting_authority_city),
      department = coalesce(?, department),
      status = coalesce(?, status),
      contract_type = coalesce(?, contract_type),
      contract_type_code = coalesce(?, contract_type_code),
      procedure = coalesce(?, procedure),
      procedure_code = coalesce(?, procedure_code),
      procedure_source = coalesce(?, procedure_source),
      economic_nature = coalesce(?, economic_nature),
      amount_excl_vat = coalesce(?, amount_excl_vat),
      amount_incl_vat = coalesce(?, amount_incl_vat),
      estimated_value = coalesce(?, estimated_value),
      awarded_amount = coalesce(?, awarded_amount),
      awarded_amount_incl_vat = coalesce(?, awarded_amount_incl_vat),
      award_amount_type = coalesce(?, award_amount_type),
      awardee = coalesce(?, awardee),
      awardee_nif = coalesce(?, awardee_nif),
      offer_count = coalesce(?, offer_count),
      is_sme = coalesce(?, is_sme),
      primary_cpv = coalesce(?, primary_cpv),
      cpvs = coalesce(?, cpvs),
      location = coalesce(?, location),
      nuts = coalesce(?, nuts),
      duration = coalesce(?, duration),
      duration_unit = coalesce(?, duration_unit),
      eu_funding = coalesce(?, eu_funding),
      urgency = coalesce(?, urgency),
      deadline_date = coalesce(?, deadline_date),
      award_date = coalesce(?, award_date),
      formalization_date = coalesce(?, formalization_date),
      publication_date = coalesce(?, publication_date),
      updated_at = coalesce(?, updated_at),
      source_url = coalesce(?, source_url),
      dataset = coalesce(?, dataset),
      year = coalesce(?, year),
      scope = coalesce(?, scope),
      is_lotized = coalesce(?, is_lotized),
      lot_count = coalesce(?, lot_count),
      lots_source = coalesce(?, lots_source),
      status_code = coalesce(?, status_code),
      status_code_list_uri = coalesce(?, status_code_list_uri),
      result_code = coalesce(?, result_code),
      result_code_list_uri = coalesce(?, result_code_list_uri)
    WHERE case_number = ? AND contracting_authority_id = ?
  `);

  const insertLoteStmt = db.prepare(`
    INSERT OR REPLACE INTO contract_lots (
      id, contract_id, case_number, lot_number, lot_name, amount_excl_vat,
      amount_incl_vat, estimated_value, awardee, awardee_nif, lot_status, award_date, cpv,
      budget_excl_vat, budget_incl_vat, awarded_amount, awarded_amount_incl_vat, offer_count,
      result_code, result_code_list_uri
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteLotesStmt = db.prepare(`
    DELETE FROM contract_lots
    WHERE contract_id = ?
  `);

  const insertContractAwardStmt = db.prepare(`
    INSERT OR REPLACE INTO contract_awards (
      id, contract_id, case_number, award_index, awardee, awardee_nif,
      awarded_amount, awarded_amount_incl_vat, offer_count, award_date,
      result_code, result_code_list_uri, result_state, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteContractAwardsStmt = db.prepare(`
    DELETE FROM contract_awards
    WHERE contract_id = ?
  `);

  const insertLotAwardStmt = db.prepare(`
    INSERT OR REPLACE INTO lot_awards (
      id, contract_id, case_number, lot_number, award_index, awardee, awardee_nif,
      awarded_amount, awarded_amount_incl_vat, offer_count, award_date,
      result_code, result_code_list_uri, result_state, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteLotAwardsStmt = db.prepare(`
    DELETE FROM lot_awards
    WHERE contract_id = ?
  `);

  const deleteLotAwardsForLotStmt = db.prepare(`
    DELETE FROM lot_awards
    WHERE contract_id = ? AND lot_number = ?
  `);

  const repairFalseTenderResultLotsStmt = db.prepare(`
    DELETE FROM contract_lots
    WHERE contract_id = ?
      AND lot_number <> '1'
      AND EXISTS (
        SELECT 1 FROM contract_lots
        WHERE contract_id = ? AND lot_number = '1'
      )
  `);

  const { insertedCount } = runInTransaction(db, () => {
  let insertedCount = 0;
  let updatedCount = 0;
  let insertedLotsCount = 0;
  const newByAuthority = {};

  for (const [key, c] of incomingMap.entries()) {
    const existing = existingByExp.get(key);
    if (existing && hasLotStructure(c) && !c._lotesFromOlderSnapshot && !isDefinitiveNoAwardTenderResult(c.result_code, c.result_code_list_uri)) {
      const persistedLots = db.prepare(`
        SELECT lot_number, lot_name, amount_excl_vat, amount_incl_vat, estimated_value,
               awardee, awardee_nif, lot_status, award_date, cpv, budget_excl_vat,
               budget_incl_vat, awarded_amount, awarded_amount_incl_vat, offer_count,
               result_code, result_code_list_uri
        FROM contract_lots
        WHERE contract_id = ?
      `).all(existing.id);
      c.lotes = preserveMissingLotAwardData(c.lotes, persistedLots);
      if (persistedLots.length > 0) {
        c.lotizado = 1;
        c.num_lotes = Math.max(Number(c.num_lotes || 0), persistedLots.length);
        c.lotes_origen = c.lotes_origen || existing.lots_source;
      }

      const awardedLotSummary = calculateAwardedLotSummary(
        selectAwardedLotsForSummary(c.lotes),
        c.lotes
      );
      if (awardedLotSummary) {
        Object.assign(c, awardedLotSummary);
        c.award_amount_type = classifyAggregatedAwardAmountType({
          awardedAmount: c.importe_adjudicacion,
          budgetAmount: c.importe_sin_iva,
        });
      }
      const lotDerivedStatus = deriveContractStatusFromLots(c.lotes);
      if (lotDerivedStatus && ['Desierta', 'Anulada'].includes(c.estado)) {
        c.estado = lotDerivedStatus;
      }
    }
    const incomingIsNewer = existing && c.fecha_actualizacion &&
      (!existing.updated_at || c.fecha_actualizacion > existing.updated_at);
    const incomingStatusCanAdvance = shouldAdvanceStatus(existing?.status, c.estado);
    const clearLotAwards = Boolean(
      (incomingIsNewer && incomingStatusCanAdvance && isDefinitiveNoAwardTenderResult(c.result_code, c.result_code_list_uri)) ||
      (c._clearLotAwards && (!existing || (incomingIsNewer && incomingStatusCanAdvance)))
    );

    if (!existing) {
      insertStmt.run(
        c.id, c.contracting_authority_id, c.placsp_id, c.expediente, c.objeto, c.contracting_authority_name, c.contracting_authority_nif, c.contracting_authority_dir3, c.contracting_authority_city, c.dependencia,
        c.tipo_contrato, c.tipo_codigo, c.procedimiento, c.procedimiento_codigo, c.procedimiento_procedencia, c.naturaleza_economica, c.estado,
        c.importe_sin_iva, c.importe_con_iva, c.valor_estimado, c.importe_adjudicacion,
        c.importe_adj_con_iva, c.award_amount_type, c.adjudicatario, c.nif_adjudicatario, c.num_ofertas, c.es_pyme, c.cpv_principal,
        c.cpvs, c.ubicacion, c.nuts, c.duracion, c.duracion_unidad, c.financiacion_ue, c.urgencia, c.fecha_limite,
        c.fecha_adjudicacion, c.fecha_formalizacion, c.fecha_publicacion, c.fecha_actualizacion, c.url, c.conjunto, c.year, c.scope,
        c.lotizado, c.num_lotes, c.lotes_origen,
        c.status_code, c.status_code_list_uri, c.result_code, c.result_code_list_uri
      );
      insertedCount++;
      newByAuthority[c.contracting_authority_name] = (newByAuthority[c.contracting_authority_name] || 0) + 1;
    } else {
      // Check if update provides newer or more complete data
      const hasIncomingLotStructure = hasLotStructure(c);
      const lotStructureChanged = hasIncomingLotStructure && (
        Number(existing.is_lotized || 0) !== Number(c.lotizado || 0) ||
        Number(existing.lot_count || 0) !== Number(c.num_lotes || 0) ||
        String(existing.lots_source || '') !== String(c.lotes_origen || '')
      );

      // Un feed más reciente es la fuente de verdad para los campos que PLACSP
      // vuelve a publicar. Los coalesce del UPDATE evitan destruir datos válidos
      // cuando un XML omite un campo, mientras que esta condición evita reescribir
      // el mismo snapshot en cada ejecución semanal.
      const needsUpdate = incomingIsNewer ||
                          (!existing.awardee && c.adjudicatario) ||
                          shouldAdvanceStatus(existing.status, c.estado) ||
                          (existing.deadline_date == null && c.fecha_limite != null) ||
                          (existing.formalization_date == null && c.fecha_formalizacion != null) ||
                          (existing.estimated_value == null && c.valor_estimado != null) ||
                          lotStructureChanged ||
                          (c.lotes && c.lotes.length > 0);

      if (needsUpdate) {
        // Un registro con fecha_actualizacion más nueva puede reemplazar el snapshot
        // publicado anteriormente. Si el registro entrante no es más nuevo, solo
        // rellenamos campos que faltaban en BD; nunca dejamos que un snapshot viejo
        // haga retroceder importes, estado, adjudicatario u otros datos vigentes.
        const allowIncomingSnapshot = Boolean(incomingIsNewer && incomingStatusCanAdvance);
        const clearAwardSummary = clearLotAwards || (
          allowIncomingSnapshot &&
          !c._lotesFromOlderSnapshot &&
          areAllLotsExplicitlyNoAward(c.lotes)
        );
        if (clearAwardSummary) {
          clearPersistedAwardSummary(db, existing);
        }

        const preserveOrFill = (incoming, current) =>
          preserveSnapshotField(incoming, current, allowIncomingSnapshot);

        // CRITICAL: Preserve the EARLIEST initial publication date.
        const finalFechaPub = (existing.publication_date && c.fecha_publicacion)
          ? (existing.publication_date < c.fecha_publicacion ? existing.publication_date : c.fecha_publicacion)
          : (c.fecha_publicacion || existing.publication_date);

        const estadoIncoming = c.estado && shouldAdvanceStatus(existing.status, c.estado)
          ? c.estado
          : null;

        const canApplyIncomingLotStructure =
          hasIncomingLotStructure &&
          (allowIncomingSnapshot ||
            !Number(existing.is_lotized || 0) ||
            !Number(existing.lot_count || 0));

        updateStmt.run(
          preserveOrFill(c.contracting_authority_id, existing.contracting_authority_id),
          preserveOrFill(c.placsp_id, existing.placsp_id),
          preserveOrFill(c.objeto, existing.object_description),
          preserveOrFill(c.contracting_authority_name, existing.contracting_authority_name),
          preserveOrFill(c.contracting_authority_nif, existing.contracting_authority_nif),
          preserveOrFill(c.contracting_authority_dir3, existing.contracting_authority_dir3),
          preserveOrFill(c.contracting_authority_city, existing.contracting_authority_city),
          preserveOrFill(c.dependencia, existing.department),
          estadoIncoming,
          preserveOrFill(c.tipo_contrato, existing.contract_type),
          preserveOrFill(c.tipo_codigo, existing.contract_type_code),
          preserveOrFill(c.procedimiento, existing.procedure),
          preserveOrFill(c.procedimiento_codigo, existing.procedure_code),
          preserveOrFill(c.procedimiento_procedencia, existing.procedure_source),
          preserveOrFill(c.naturaleza_economica, existing.economic_nature),
          preserveOrFill(c.importe_sin_iva, existing.amount_excl_vat),
          preserveOrFill(c.importe_con_iva, existing.amount_incl_vat),
          preserveOrFill(c.valor_estimado, existing.estimated_value),
          preserveOrFill(c.importe_adjudicacion, existing.awarded_amount),
          preserveOrFill(c.importe_adj_con_iva, existing.awarded_amount_incl_vat),
          allowIncomingSnapshot ? c.award_amount_type : existing.award_amount_type,
          preserveOrFill(c.adjudicatario, existing.awardee),
          preserveOrFill(c.nif_adjudicatario, existing.awardee_nif),
          preserveOrFill(c.num_ofertas, existing.offer_count),
          preserveOrFill(c.es_pyme, existing.is_sme),
          preserveOrFill(c.cpv_principal, existing.primary_cpv),
          preserveOrFill(c.cpvs, existing.cpvs),
          preserveOrFill(c.ubicacion, existing.location),
          preserveOrFill(c.nuts, existing.nuts),
          preserveOrFill(c.duracion, existing.duration),
          preserveOrFill(c.duracion_unidad, existing.duration_unit),
          preserveOrFill(c.financiacion_ue, existing.eu_funding),
          preserveOrFill(c.urgencia, existing.urgency),
          preserveOrFill(c.fecha_limite, existing.deadline_date),
          preserveOrFill(c.fecha_adjudicacion, existing.award_date),
          preserveOrFill(c.fecha_formalizacion, existing.formalization_date),
          finalFechaPub,
          preserveOrFill(c.fecha_actualizacion, existing.updated_at),
          preserveOrFill(c.url, existing.source_url),
          preserveOrFill(c.conjunto, existing.dataset),
          preserveOrFill(c.year, existing.year),
          preserveOrFill(c.scope, existing.scope),
          canApplyIncomingLotStructure ? c.lotizado : null,
          canApplyIncomingLotStructure ? c.num_lotes : null,
          canApplyIncomingLotStructure ? c.lotes_origen : null,
          preserveOrFill(c.status_code, existing.status_code),
          preserveOrFill(c.status_code_list_uri, existing.status_code_list_uri),
          preserveOrFill(c.result_code, existing.result_code),
          preserveOrFill(c.result_code_list_uri, existing.result_code_list_uri),
          existing.case_number, existing.contracting_authority_id
        );
        updatedCount++;
      }
    }

    // Reconcile lot records only when the current PLACSP feed provides an
    // explicit structured lot set. An incremental feed without lot nodes is
    // not evidence that previously known lots disappeared.
    const persistedLicitacionId = existing?.id || c.id;

    // Algunas migraciones históricas confundieron Contract/ID con lot_number.
    // Si el expediente es de lote único y conserva una fila canónica "1",
    // eliminamos únicamente esas filas sintéticas sobrantes. Nunca aplicamos
    // esta reparación cuando el feed actual proporciona lotes explícitos.
    if (shouldRepairSingleTenderResultLotRows(existing, c)) {
      repairFalseTenderResultLotsStmt.run(persistedLicitacionId, persistedLicitacionId);
    }

    // Los lotes forman parte del snapshot del expediente. No debemos sustituir
    // lotes ya conocidos con una versión más antigua del feed. Sí permitimos
    // completar una licitación que todavía no tenía estructura de lotes.
    const reconcileLots =
      hasLotStructure(c) &&
      (!c._lotesFromOlderSnapshot ||
        !existing ||
        !Number(existing.is_lotized || 0) ||
        !Number(existing.lot_count || 0)) &&
      (!existing ||
        Boolean(incomingIsNewer) ||
        !Number(existing.is_lotized || 0) ||
        !Number(existing.lot_count || 0));
    const idsToClean = new Set([c.id, existing?.id].filter(Boolean));
    if (reconcileLots) {
      for (const licitacionId of idsToClean) {
        deleteLotesStmt.run(licitacionId);
      }
    }

    // Persist the current lot records, if any, under the same parent ID used by the database.
    if (reconcileLots && c.lotes && c.lotes.length > 0) {
      for (const lote of c.lotes) {
        const loteId = `${persistedLicitacionId}_lote_${lote.numeroLote}`;
        insertLoteStmt.run(
          loteId,
          persistedLicitacionId,
          c.expediente,
          String(lote.numeroLote),
          lote.nombreLote || null,
          lote.importeSinIva != null ? lote.importeSinIva : null,
          lote.importeConIva != null ? lote.importeConIva : null,
          lote.valorEstimado != null ? lote.valorEstimado : null,
          lote.adjudicatario || null,
          lote.nifAdjudicatario || null,
          lote.estadoLote || null,
          lote.fechaAdjudicacion || null,
          lote.cpv || null,
          lote.presupuestoSinIva != null ? lote.presupuestoSinIva : null,
          lote.presupuestoConIva != null ? lote.presupuestoConIva : null,
          lote.importeAdjudicacion != null ? lote.importeAdjudicacion : null,
          lote.importeAdjConIva != null ? lote.importeAdjConIva : null,
          lote.numOfertas != null ? lote.numOfertas : null,
          lote.resultCode || null,
          lote.resultCodeListUri || null
        );
        insertedLotsCount++;
      }
    }

    // Un snapshot sin TenderResult no demuestra que las adjudicaciones
    // publicadas previamente hayan desaparecido. Solo sustituimos la colección
    // persistida cuando el snapshot trae resultados explícitos.
    if (shouldReplaceSnapshotCollection(c.contract_awards)) {
      deleteContractAwardsStmt.run(persistedLicitacionId);
    }
    for (const [index, award] of (c.contract_awards || []).entries()) {
      insertContractAwardStmt.run(
        `${persistedLicitacionId}_award_${index + 1}`,
        persistedLicitacionId,
        c.expediente,
        index + 1,
        award.adjudicatario || null,
        award.nifAdjudicatario || null,
        award.importeSinIva != null ? award.importeSinIva : null,
        award.importeConIva != null ? award.importeConIva : null,
        award.numOfertas != null ? award.numOfertas : null,
        award.fechaAdjudicacion || null,
        award.resultCode || null,
        award.resultCodeListUri || null,
        award.resultState || null,
        award.descripcion || null
      );
    }

    const existingAwardLotNumbers = new Set(existing
      ? db.prepare('SELECT DISTINCT lot_number FROM lot_awards WHERE contract_id = ?')
        .all(persistedLicitacionId).map((row) => String(row.lot_number))
      : []);
    if (clearLotAwards) {
      deleteLotAwardsStmt.run(persistedLicitacionId);
    } else if (!existing || incomingIsNewer) {
      const incomingLotNumbers = new Set((c.lot_awards || []).map((award) => String(award.numeroLote)));
      for (const lotNumber of incomingLotNumbers) {
        deleteLotAwardsForLotStmt.run(persistedLicitacionId, lotNumber);
      }
    }
    for (const award of (clearLotAwards ? [] : (c.lot_awards || []))) {
      // An older snapshot may fill a missing lot, but must not overwrite a lot
      // whose newer award data is already persisted.
      if (existing && !incomingIsNewer && existingAwardLotNumbers.has(String(award.numeroLote))) continue;
      insertLotAwardStmt.run(
        persistedLicitacionId + '_lot_' + award.numeroLote + '_award_' + award.awardIndex,
        persistedLicitacionId,
        c.expediente,
        award.numeroLote,
        award.awardIndex,
        award.adjudicatario || null,
        award.nifAdjudicatario || null,
        award.importeSinIva != null ? award.importeSinIva : null,
        award.importeConIva != null ? award.importeConIva : null,
        award.numOfertas != null ? award.numOfertas : null,
        award.fechaAdjudicacion || null,
        award.resultCode || null,
        award.resultCodeListUri || null,
        award.resultState || null,
        award.descripcion || null
      );
    }
  }

  console.log(`💾 Transacción completada en SQLite:`);
  console.log(`   ➕ Contratos nuevos insertados: ${insertedCount}`);
  console.log(`   🔄 Contratos existentes actualizados: ${updatedCount}`);
  if (Object.keys(newByAuthority).length > 0) {
    console.log(`   📋 Nuevos contratos por entidad:`);
    for (const [org, cnt] of Object.entries(newByAuthority)) {
      console.log(`      • ${org}: +${cnt}`);
    }
  }

  // Refresh Full-Text Search (FTS5) index
  console.log('\n⚡ Actualizando índice de búsqueda de texto completo (FTS5)...');
  db.exec(`
    DROP TABLE IF EXISTS contracts_fts;

    CREATE VIRTUAL TABLE contracts_fts USING fts5(
      id UNINDEXED, 
      case_number, 
      object_description, 
      contracting_authority_name, 
      awardee, 
      tokenize='porter unicode61'
    );

    INSERT INTO contracts_fts(id, case_number, object_description, contracting_authority_name, awardee)
    SELECT id, case_number, object_description, contracting_authority_name, awardee FROM contracts;

    CREATE INDEX IF NOT EXISTS idx_contracts_contracting_authority_name ON contracts(contracting_authority_name);
    CREATE INDEX IF NOT EXISTS idx_contracts_awardee ON contracts(awardee);
    CREATE INDEX IF NOT EXISTS idx_contracts_awardee_nif ON contracts(awardee_nif);
    CREATE INDEX IF NOT EXISTS idx_contracts_year ON contracts(year);
    CREATE INDEX IF NOT EXISTS idx_contracts_contract_type ON contracts(contract_type);
    CREATE INDEX IF NOT EXISTS idx_contracts_procedure ON contracts(procedure);
    CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
    CREATE INDEX IF NOT EXISTS idx_contracts_awarded_amount ON contracts(awarded_amount);
    CREATE INDEX IF NOT EXISTS idx_contracts_publication_date ON contracts(publication_date);
    CREATE INDEX IF NOT EXISTS idx_contracts_scope ON contracts(scope);
  `);

  console.log('⚡ Optimizando estadísticas de consulta (ANALYZE)...');
  db.exec('ANALYZE;');

  // Guardar metadata de sincronización
  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT OR REPLACE INTO metadata (key, value, updated_at) 
    VALUES ('ultima_sincronizacion', datetime('now', 'localtime'), datetime('now', 'localtime'));
  `);

    return { insertedCount, updatedCount, insertedLotsCount, newByAuthority };
  });

  const finalStats = db.prepare(`
    SELECT count(*) as total, 
           min(publication_date) as min_date, 
           max(publication_date) as max_date,
           round(sum(CASE
             WHEN NOT ${terminalContractStatusSql('contracts')}
               AND ${awardAmountEligibilitySql}
             THEN ${awardedVolumeSql}
             ELSE 0
           END), 2) as volumen
    FROM contracts
  `).get();

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('🎉 RESUMEN DE SINCRONIZACIÓN EXITOSA:');
  console.log(`   • Total contratos en plataforma: ${finalStats.total.toLocaleString()} (+${insertedCount})`);
  console.log(`   • Última fecha de publicación: ${finalStats.max_date ? finalStats.max_date.substring(0, 10) : 'N/A'}`);
  console.log(`   • Volumen total adjudicado: ${(finalStats.volumen / 1e6).toFixed(2)} M€`);
  console.log('═══════════════════════════════════════════════════════════════════\n');
  } finally {
    if (closeDb) db.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Error fatal en el proceso de sincronización:', err);
    process.exitCode = 1;
  });
}

module.exports = {  parseEntry, isNoAwardTenderResult, isDefinitiveNoAwardTenderResult, isPreAwardTenderResult, areAllLotsExplicitlyNoAward, clearPersistedAwardSummary, extractFormalizationDate,
 extractPublicationDate,
 parseNullableNumber, parseNullableInteger,
  streamParseZip,
  TIPO_MAP,
  PROC_MAP,
  STATUS_MAP,
  dedupeTenderResults,
  selectCurrentTenderResults,
  aggregateAwardedLotAmounts,
  aggregateAwardedContractAmounts,
  selectAwardedLotsForSummary,
  calculateAwardedLotSummary,
  buildAwardedVolumeSql,
  isEligibleAwardLot,
  deriveContractStatusFromLots,
  hasIncompleteConsolidatedLotAwardAmounts,
  hasIncompleteLotTenderResults,
  hasIncompleteLotAwardAmounts,
  hasExplicitNumericLotIds,
  selectContractLevelTenderResult,
  selectContractLevelTenderResults,
  findTenderResultForLot,
  hasLotStructure,
  isDesertedResultCode,
  shouldReconcileLots,
  shouldRepairSingleTenderResultLotRows,
  shouldAdvanceStatus,
  preserveSnapshotField,
  preserveSnapshotCollection,
  shouldReplaceSnapshotCollection,
  mergeLotAwardSnapshots,
  mergeContractAwardSnapshots,
  preserveMissingLotAwardData,
  reconcileSnapshotAwardCollections,
  normalizeContractingAuthorityMatch,
  resolveContractingAuthority,
  extractTenderResultAwardeeNif,
  buildLotAwards,
  ensureSyncSchema,
  ensureZipFilesForYear,
  runInTransaction,
  main,
};
