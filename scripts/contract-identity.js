const crypto = require('node:crypto');

/**
 * Stable internal identity for a contract.
 * PLACSP syndication IDs are source identifiers and are not globally unique:
 * the same source id can legitimately occur for different expedientes.
 */
function normalizeIdentityPart(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function getContractIdentityKey(expediente, contractingAuthorityId) {
  const exp = normalizeIdentityPart(expediente);
  const org = normalizeIdentityPart(contractingAuthorityId);
  if (!exp || !org) throw new Error('No se puede construir la identidad contractual sin expediente y organismo');
  return `ctr_${crypto.createHash('sha256').update(`${org}\\0${exp}`, 'utf8').digest('hex').slice(0, 24)}`;
}

module.exports = { getContractIdentityKey, normalizeIdentityPart };
