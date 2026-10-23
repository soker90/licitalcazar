/**
 * Checks whether a value is already an opaque pseudonymized identifier for a physical person (pf-<12-hex>).
 * Case-insensitive check.
 *
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
function isOpaquePersonaFisicaId(value) {
  if (!value) return false;
  const str = String(value).trim();
  return /^pf-[a-f0-9]{12}$/i.test(str) || str.toLowerCase().startsWith('pf-');
}

/**
 * Normalizes a fiscal identifier (NIF/NIE/CIF or existing opaque ID):
 * - If already an opaque ID (pf-*), returns it lowercased without removing hyphens or modifying characters.
 * - For real physical IDs:
 *   - Converts to uppercase
 *   - Trims leading and trailing whitespace
 *   - Strips interior whitespace (spaces, tabs, newlines)
 *   - Strips hyphens (-), dots (.), slashes (/), underscores (_), and commas (,)
 *   - Strips country prefix 'ES' if followed by tax ID digits/NIE
 * - Guarantees that equivalent physical NIF/NIE formats always produce the exact same normalized string.
 *
 * @param {string | null | undefined} value
 * @returns {string}
 */
function normalizeFiscalId(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (isOpaquePersonaFisicaId(trimmed)) {
    return trimmed.toLowerCase();
  }

  let clean = trimmed.toUpperCase();
  clean = clean.replace(/[\s\-_./,]/g, '');

  if (clean.startsWith('ES') && clean.length > 9) {
    clean = clean.substring(2);
  }

  return clean;
}

/**
 * Determines if an identifier corresponds to a physical person NIF/NIE (DNI, NIE, masked DNI with asterisks),
 * rather than an opaque pf-* identifier or corporate CIF (mercantile societies A, B, etc.).
 *
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
function isPersonaFisicaNif(value) {
  if (!value) return false;
  const raw = String(value).trim();
  if (!raw) return false;

  // Opaque pf-* identifiers are pseudonymized hashes, not raw DNI/NIE
  if (isOpaquePersonaFisicaId(raw)) return false;
  if (raw.includes('*')) return true;

  const clean = normalizeFiscalId(raw);

  // Spanish DNI starts with a numeric digit: [0-9]
  if (/^[0-9]/.test(clean)) return true;

  // Spanish NIE starts with X, Y, or Z followed by a numeric digit: [XYZ][0-9]
  if (/^[XYZ][0-9]/.test(clean)) return true;

  return false;
}

module.exports = {
  isOpaquePersonaFisicaId,
  normalizeFiscalId,
  isPersonaFisicaNif,
};
