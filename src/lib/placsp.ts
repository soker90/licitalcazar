/**
 * Utilidades para resolver enlaces oficiales y localizadores canónicos
 * en la Plataforma de Contratación del Sector Público (PLACSP).
 */

export interface LicitacionPlacspRef {
  url?: string | null;
  id?: string | null;
  placsp_id?: string | null;
  expediente?: string | null;
  contracting_authority_name?: string | null;
}

export function getPlacspUrl(lic: LicitacionPlacspRef): string {
  if (lic.url && lic.url.trim().length > 0) return lic.url.trim();
  if (lic.id && lic.id.startsWith('http')) return lic.id.trim();
  const sourceId = getPlacspId(lic.placsp_id);
  if (sourceId) {
    return `https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/${encodeURIComponent(sourceId)}`;
  }
  return 'https://contrataciondelestado.es/wps/poc?uri=deeplink:perfilContratante';
}

export function getContractSlug(id: string | null | undefined): string {
  if (!id) return '';
  const decoded = decodeURIComponent(id).trim();
  const numMatch = decoded.match(/\/(\d+)\/?(?:[?#].*)?$/);
  if (numMatch) return numMatch[1];
  if (/^\d+$/.test(decoded)) return decoded;
  if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
    try {
      const url = new URL(decoded);
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length > 0) return segments[segments.length - 1];
    } catch {
      const parts = decoded.replace(/[?#].*$/, '').split('/').filter(Boolean);
      if (parts.length > 0) return parts[parts.length - 1];
    }
  }
  return decoded;
}

/**
 * Extrae el identificador PLACSP desde una URI/slug de origen.
 * Las identidades internas ctr_... nunca se consideran identificadores PLACSP.
 */
export function getPlacspId(id: string | null | undefined): string | null {
  if (!id) return null;
  const value = String(id).trim();
  if (value.startsWith('ctr_')) return null;
  const slug = getContractSlug(value);
  return slug.length > 0 ? slug : null;
}
