import { createHmac } from 'node:crypto';
import {
  isOpaquePersonaFisicaId,
  normalizeFiscalId,
  isPersonaFisicaNif,
} from './nif-rules.ts';

export {
  isOpaquePersonaFisicaId,
  normalizeFiscalId,
  isPersonaFisicaNif,
} from './nif-rules.ts';

/**
 * Resolves the server secret salt for HMAC-SHA256 physical-person pseudonymization.
 *
 * Rules:
 * 1. Production strictly requires the DNI_SALT environment variable. If missing, throws an Error.
 * 2. In test environments (Vitest / NODE_ENV === 'test'), falls back to a deterministic test salt.
 * 3. In local development (NODE_ENV !== 'production' && NODE_ENV !== 'test'), falls back to a local dev salt.
 * 4. The production secret is NEVER versioned, NEVER printed in logs, and NEVER exposed in UI or API responses.
 * 5. DNI_SALT is a stable persistent secret; changing it requires a full database migration of pf-* records.
 */
export function getDniSalt(): string {
  const salt = process.env.DNI_SALT;
  if (salt && salt.trim().length > 0) {
    return salt.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DNI_SALT environment variable is required in production.');
  }

  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return 'test-dni-salt-for-privacy-tests';
  }

  return 'licitalcazar-dev-salt-do-not-use-in-production';
}

/**
 * Generates an opaque pseudonymized identifier (pf-<12 hex>) for physical persons using HMAC-SHA256
 * with the server secret salt (art. 5.1.c RGPD minimization).
 *
 * Protections:
 * 1. NEVER re-hashes a value that already has pf-* format; returns it lowercased directly.
 * 2. Canonically normalizes physical identifiers before computing HMAC so equivalent variants yield the exact same hash.
 * 3. Preserves corporate CIFs intact without conversion to opaque IDs.
 */
export function getOpaqueEmpresaId(nifOrId: string | null | undefined, nombre?: string | null): string {
  if (!nifOrId && !nombre) return '';
  const clean = (nifOrId || '').trim();

  // 1. NEVER rehash pf-* identifiers (check FIRST before any transformation)
  if (isOpaquePersonaFisicaId(clean)) {
    return clean.toLowerCase();
  }

  // 2. Physical person identification (DNI, NIE, masked DNI, or physical person name without CIF)
  if (isPersonaFisicaNif(clean) || (!clean && nombre)) {
    const rawVal = clean || (nombre || '').trim();
    if (isOpaquePersonaFisicaId(rawVal)) {
      return rawVal.toLowerCase();
    }
    const normalized = normalizeFiscalId(rawVal);
    const salt = getDniSalt();
    const hash = createHmac('sha256', salt).update(normalized).digest('hex').slice(0, 12);
    return `pf-${hash}`;
  }

  // 3. Corporate entities: preserve CIF verbatim (or URL-encoded name)
  return clean || encodeURIComponent((nombre || '').trim());
}

/**
 * Sanitizes an identifier before storage in database tables:
 * - Opaque pf-* values are preserved verbatim (lowercased).
 * - Pre-masked values (* present) are preserved verbatim.
 * - Clear physical person NIF/NIE are converted to opaque pf-* identifiers.
 * - Corporate CIFs are preserved verbatim.
 */
export function sanitizeNifForStorage(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return value as string;
  const str = String(value).trim();
  if (isOpaquePersonaFisicaId(str)) {
    return str.toLowerCase();
  }
  if (str.includes('*')) {
    return str;
  }
  return isPersonaFisicaNif(str) ? getOpaqueEmpresaId(str) : value;
}
