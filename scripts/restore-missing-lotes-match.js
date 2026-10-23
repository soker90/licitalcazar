#!/usr/bin/env node
/**
 * Helpers used by restore-missing-lotes.js.
 * Kept separate so the matching logic can be regression-tested without
 * mutating a production database.
 */
const { normalizeIdentityPart } = require('./contract-identity');
const { sanitizeNifForStorage } = require('./nif-privacy');
const { isEligibleAwardLotStatus } = require('../src/lib/lot-status.js');

function normalizeCaseNumber(value) {
  return String(value ?? '').trim().replace(/\.0$/, '').replace(/\s+/g, ' ');
}

function resolveCurrentContract(previousContract, currentIndex, previousId) {
  const normalizedId = String(previousId ?? '').trim().replace(/\.0$/, '');
  const exact = currentIndex.byId.get(normalizedId);
  if (exact) return exact;

  const previousCaseNumber = normalizeCaseNumber(previousContract?.case_number);
  const previousAuthorityId = normalizeIdentityPart(previousContract?.contracting_authority_id);
  if (!previousCaseNumber || !previousAuthorityId) return undefined;

  const candidates = currentIndex.byExpediente.get(previousCaseNumber) || [];
  const matchingAuthority = candidates.filter(
    candidate => normalizeIdentityPart(candidate.contracting_authority_id) === previousAuthorityId
  );
  return matchingAuthority.length === 1 ? matchingAuthority[0] : undefined;
}

/**
 * Rebuild a restored lot's identity and parent reference from the current
 * contract. Lot IDs are derived from the persisted contract ID in sync.js.
 */
function buildRestoredLotRow(lot, currentContract) {
  const restored = {
    ...lot,
    id: `${currentContract.id}_lote_${lot.lot_number}`,
    contract_id: currentContract.id,
    case_number: currentContract.case_number ?? lot.case_number ?? null,
  };

  if (!isEligibleAwardLotStatus(lot.lot_status)) {
    return {
      ...restored,
      awardee: null,
      awardee_nif: null,
      awarded_amount: null,
      awarded_amount_incl_vat: null,
    };
  }

  if (lot.awardee_nif != null) {
    restored.awardee_nif = sanitizeNifForStorage(lot.awardee_nif);
  }
  return restored;
}

module.exports = { resolveCurrentContract, buildRestoredLotRow };
