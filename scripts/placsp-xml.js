/**
 * Utilidades puras para extraer datos estructurados de XML de PLACSP.
 * No depende de Node ni del resto del sincronizador, por lo que puede reutilizarse en tests.
 */

function extractPartyIdByScheme(partyXml, schemeName) {
  const normalizedScheme = String(schemeName || '').trim().toUpperCase();
  if (!normalizedScheme) return null;

  const pattern = new RegExp(
    `<cbc:ID\\b[^>]*\\bschemeName=["']${normalizedScheme}["'][^>]*>([^<]+)<\\/cbc:ID>`,
    'i'
  );
  const match = String(partyXml || '').match(pattern);
  return match ? match[1].trim() : null;
}

function extractTenderResultLotId(tenderResultXml) {
  const match = String(tenderResultXml || '').match(
    /<cbc:ProcurementProjectLotID\b[^>]*>([^<]+)<\/cbc:ProcurementProjectLotID>/
  );
  return match ? match[1].trim() : null;
}

function extractEstimatedContractAmount(projXml, xml = '') {
  const sources = [];
  const budgetMatch = String(projXml || '').match(/<cac:BudgetAmount>([\s\S]*?)<\/cac:BudgetAmount>/);
  if (budgetMatch) sources.push(budgetMatch[1]);
  sources.push(String(projXml || ''), String(xml || ''));

  const pattern = /<(?:[A-Za-z0-9_-]+:)?EstimatedOverallContractAmount\b[^>]*>([^<]+)<\/(?:[A-Za-z0-9_-]+:)?EstimatedOverallContractAmount>/i;

  for (const source of sources) {
    const match = source.match(pattern);
    if (!match) continue;

    const value = Number.parseFloat(match[1].trim().replace(',', '.'));
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

module.exports = {
  extractEstimatedContractAmount,
  extractPartyIdByScheme,
  extractTenderResultLotId,
};
