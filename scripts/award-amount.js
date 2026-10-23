/**
 * Classifies the PLACSP awarded amount before it is compared with the PBL.
 *
 * PLACSP can contain a price that is economically valid but expressed as a
 * unit price while the PBL is a total contract amount. OIReScon explicitly
 * documents this data-quality issue and excludes apparent reductions above
 * 80% from some aggregate analyses for that reason.
 *
 * We only auto-classify as unitary when BOTH conditions hold:
 *   1. awarded/PBL < 20% (same 80% reduction threshold used by OIReScon)
 *   2. the contract object contains explicit unit-price vocabulary.
 *
 * Everything else remains total/unknown rather than inventing a correction.
 */

const UNIT_PRICE_TERMS = [
  /\bprecio\s+de\s+(la\s+)?hora\b/i,
  /\bprecio\s+hora\b/i,
  /\bprecio\s*\/\s*hora\b/i,
  /\bprecio\s+por\s+hora\b/i,
  /\bpor\s+hora\b/i,
  /\bprecio\s*\/\s*km\b/i,
  /\bprecio\s+por\s+(?:kilometro|km)\b/i,
  /\bprecio\s+unitario\b/i,
  /\bprecio\s+unitari[oa]s?\b/i,
  /\bpor\s+unidad(?:es)?\b/i,
  /\bprecio\s+por\s+unidad(?:es)?\b/i,
  /\bunidad(?:es)?\s+(?:de|a)\b/i,
  /\btarifa\s+(?:por\s+)?(?:hora|km|kilometro|unidad|servicio)\b/i,
  /(?:euros?\s*|€\s*)(?:por|\/)\s*(?:hora|km|kilometro|unidad|ud\.?|servicio)\b/i,
];

function hasUnitPriceVocabulary(text) {
  const normalized = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return UNIT_PRICE_TERMS.some((pattern) => pattern.test(normalized));
}

function classifyAggregatedAwardAmountType({ awardedAmount, budgetAmount }) {
  if (awardedAmount == null || Number.isNaN(Number(awardedAmount)) || Number(awardedAmount) <= 0) return 'desconocido';
  if (budgetAmount == null || Number.isNaN(Number(budgetAmount)) || Number(budgetAmount) <= 0) return 'desconocido';
  return 'total';
}

function classifyAwardAmountType({ awardedAmount, budgetAmount, objectDescription, lotCount = 1 }) {
  if (awardedAmount == null || Number.isNaN(Number(awardedAmount)) || Number(awardedAmount) <= 0) {
    return 'desconocido';
  }
  if (budgetAmount == null || Number.isNaN(Number(budgetAmount)) || Number(budgetAmount) <= 0) {
    return 'desconocido';
  }

  const ratio = Number(awardedAmount) / Number(budgetAmount);

  // Lotized parent amounts can be aggregate totals; do not classify them as
  // unit prices merely because the ratio is low.
  if (Number(lotCount) > 1) return 'desconocido';

  if (ratio < 0.20) {
    if (hasUnitPriceVocabulary(objectDescription)) return 'unitario';

    // An apparent reduction above 80% is not safely comparable without
    // supporting evidence: PLACSP may contain a unit price where the PBL is
    // the total contract amount. Keep it unknown instead of creating a false
    // saving/low-bid signal.
    return 'desconocido';
  }

  return 'total';
}

module.exports = { UNIT_PRICE_TERMS, hasUnitPriceVocabulary, classifyAwardAmountType, classifyAggregatedAwardAmountType };
