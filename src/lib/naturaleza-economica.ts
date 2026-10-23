/**
 * Economic nature classifier for public contracts.
 * 
 * Classifies contracts into:
 * - 'gasto': Municipal expenditure (procurement of works, supplies, services, property acquisition).
 * - 'ingreso': Municipal revenue (patrimonial sales, auctions, demanial concessions, municipal rentals).
 * - 'concesion': Public service / works concessions under procurement legislation (LCSP).
 * - 'sin_clasificar': Unclassified / ambiguous / requires human review.
 */

import exceptionsData from './naturaleza-excepciones.json' with { type: 'json' };

export type EconomicNature = 'gasto' | 'ingreso' | 'concesion' | 'sin_clasificar';

export interface EconomicNatureInput {
  id?: string | null;
  placsp_id?: string | null;
  tipo_codigo?: string | null;
  tipo_contrato?: string | null;
  objeto?: string | null;
}

const EXCEPTIONS_MAP: Record<string, { naturaleza: EconomicNature; motivo?: string }> = exceptionsData as any;

function getException(contract: EconomicNatureInput): { naturaleza: EconomicNature; motivo?: string } | undefined {
  const candidates = [
    contract.placsp_id,
    contract.id,
  ]
    .map(value => String(value ?? '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (EXCEPTIONS_MAP[candidate]) return EXCEPTIONS_MAP[candidate];

    const numericMatch = candidate.match(/(?:^|\/)(\d+)(?:[/?#].*)?$/);
    if (numericMatch && EXCEPTIONS_MAP[numericMatch[1]]) {
      return EXCEPTIONS_MAP[numericMatch[1]];
    }
  }

  return undefined;
}

function normalizeText(text: string | null | undefined) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Classifies the economic nature of a contract following strict rules:
 * 1. Versioned exceptions table (src/lib/naturaleza-excepciones.json).
 * 2. Standard public procurement (LCSP 9/2017 Art. 12-18): 'gasto'.
 *    - 1: Suministros
 *    - 2: Servicios
 *    - 3: Obras
 *    - 7: Administrativo especial
 *    - 8: Privado
 * 3. Procurement concessions (LCSP 9/2017 Art. 14-15): 'concesion'.
 *    - 22: Concesión de servicios
 *    - 31: Concesión de obras públicas
 *    - 32: Concesión de obras
 * 4. Codes requiring manual review / unclassified: 'sin_clasificar'.
 *    - 21: 'Gestión de Servicios Públicos' (TRLCSP 3/2011). Replaced in LCSP 9/2017 by either Concesión
 *          de Servicios (if operational risk transferred) or Servicios (if not); requires documentary check.
 *    - 40: 'Colaboración entre el sector público y sector privado' (TRLCSP 3/2011); requires human review.
 * 5. Patrimonial (code 50) and unclassified historical (code 999): strictly evaluated by title keywords using word boundaries (\b).
 *    - Gasto: \b(adquisicion|compra)\b
 *    - Ingreso: \b(enajenacion|venta|subasta|concesion|explotacion)\b, \buso\s+privativo\b, \bdominio\s+publico\b
 *    - Arrendamiento: only 'ingreso' if indicating municipal property ("cedida por", \b(propiedad|titularidad|bien|finca)\s+municipal\b)
 *    - Strict check: if title matches both gasto and ingreso -> 'sin_clasificar'.
 * 6. Anything else / unknown code -> 'sin_clasificar' (strict safety, no fallback).
 */
export function classifyEconomicNature(contract: EconomicNatureInput): EconomicNature {
  const exception = getException(contract);
  if (exception) {
    return exception.naturaleza;
  }

  const rawCode = String(contract.tipo_codigo || '').trim();
  const obj = normalizeText(contract.objeto);

  // Standard public procurement contracts: gasto (LCSP 9/2017)
  if (['1', '2', '3', '7', '8'].includes(rawCode)) {
    return 'gasto';
  }

  // Concessions under procurement law (LCSP 9/2017 Art. 14-15)
  if (['22', '31', '32'].includes(rawCode)) {
    return 'concesion';
  }

  // Codes 21 and 40 map to sin_clasificar for mandatory documentary verification
  if (['21', '40'].includes(rawCode)) {
    return 'sin_clasificar';
  }

  // Patrimonial contracts (code 50) and unclassified historical entries (code 999)
  if (rawCode === '50' || rawCode === '999') {
    const isGastoRule = /\b(adquisicion|compra)\b/.test(obj);

    let isIngresoRule = false;

    // Subastas, enajenación, venta de bienes/materiales
    if (/\b(enajenacion|venta|subasta)\b/.test(obj)) {
      isIngresoRule = true;
    }

    // Concesiones demaniales, explotación, uso privativo de bienes de dominio público
    if (
      /\b(concesion|explotacion)\b/.test(obj) ||
      /\buso\s+privativo\b/.test(obj) ||
      /\bdominio\s+publico\b/.test(obj)
    ) {
      isIngresoRule = true;
    }

    // Arrendamientos: strictly municipal property, social housing, or rural plot
    if (/\barrendamiento\b/.test(obj)) {
      const isArrendamientoMunicipal =
        obj.includes('cedida por') ||
        /\b(propiedad|titularidad|bien|finca)\s+municipal\b/.test(obj) ||
        (/\bvivienda\b/.test(obj) && obj.includes('junta de comunidades'));

      if (isArrendamientoMunicipal) {
        isIngresoRule = true;
      }
    }

    // If title matches both gasto and ingreso rules -> ambiguous, mark as sin_clasificar
    if (isGastoRule && isIngresoRule) {
      return 'sin_clasificar';
    }

    if (isGastoRule) {
      return 'gasto';
    }

    if (isIngresoRule) {
      return 'ingreso';
    }

    // Code 50 or 999 with no matching keywords -> sin_clasificar
    return 'sin_clasificar';
  }

  // Any unknown or unclassified code -> sin_clasificar (strict safety, no fallback)
  return 'sin_clasificar';
}


export type EconomicFlow = 'paga' | 'recibe' | 'sin_flujo_directo' | 'no_determinado';

/**
 * Reduces the economic nature to the direction that matters to users:
 * who is expected to pay, receive, or whether no direct municipal flow
 * can be established from the structured classification alone.
 */
export function getEconomicFlow(naturaleza: EconomicNature | null | undefined): EconomicFlow {
  switch (naturaleza) {
    case 'gasto':
      return 'paga';
    case 'ingreso':
      return 'recibe';
    case 'concesion':
      return 'sin_flujo_directo';
    default:
      return 'no_determinado';
  }
}
