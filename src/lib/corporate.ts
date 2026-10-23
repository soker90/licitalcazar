export {
  isPersonaFisicaNif,
  isOpaquePersonaFisicaId,
  normalizeFiscalId,
  getDniSalt,
  getOpaqueEmpresaId,
  sanitizeNifForStorage,
} from './nif-privacy.ts';
import {
  isPersonaFisicaNif,
  isOpaquePersonaFisicaId,
  getOpaqueEmpresaId,
} from './nif-privacy.ts';




export interface CorporateGroup {
  id: string;
  nombre: string;
  name?: string;
  description: string;
  ambito: string;
  scope?: string;
  cifs: string[]; // CIFs de filiales asociadas
  sede?: string;
  color?: string;
}

export interface DenominationChangeInfo {
  cif: string;
  nombreActual: string;
  divisionesActivas?: {
    nombre: string;
    descripcion?: string;
    description?: string;
  }[];
  nombresAnteriores: {
    nombre: string;
    periodo?: string;
    motivo?: string;
    reason?: string;
  }[];
  motivoGeneral: string;
  tipo: 'rebranding' | 'adquisicion' | 'denominacion_comercial' | 'fusion';
}

/**
 * Genera una clave normalizada para agrupar variantes ortográficas de un mismo nombre
 * (eliminando formas jurídicas como SA, SL, SAU, signos de puntuación, delegaciones y acentos)
 */
export function getClusterKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[,._\-/()]/g, ' ')
    .replace(/\b[A-HJ-NP-SUVW]\d{7}[0-9A-J]\b/g, '')
    .replace(/\b(S\s*A\s*U|S\s*L\s*U|S\s*A|S\s*L|S\s*C\s*L|S\s*C|S\s*C\s*C\s*L|S\s*L\s*L|SOCIEDAD ANONIMA|SOCIEDAD LIMITADA)\b/g, '')
    .replace(/\b(DELEGACION.*|AREA.*)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+[LA]$/g, '');
}

export interface DniMapping {
  nombre: string;
  canonicalId: string;
  /** @deprecated Alias histórico; contiene exclusivamente el ID opaco pf-*. */
  dniVerificado?: string;
  variantesEnmascaradas: string[];
}

export interface VerifiedPersonCatalog { [name: string]: VerifiedPersonMapping; }

export interface CorporateResolutionCatalog {
  corporateGroups: Record<string, CorporateGroup>;
  knownRebrandings: Record<string, DenominationChangeInfo>;
  cifCorrections: CifCorrectionCatalog;
  verifiedPersons: VerifiedPersonCatalog;
}

/**
 * 3. Cruce oficial de Personas Físicas (Autónomos) con DNI enmascarado RGPD vs DNI verificado
 */
export interface VerifiedPersonMapping {
  canonicalId: string;
  variantesEnmascaradas: string[];
}

export interface CifCorrectionCatalog {
  [rawCif: string]: string;
}

/**
 * Normaliza un código CIF o DNI: mayúsculas, recorta espacios y corrige erratas conocidas
 */
export function normalizeCif(rawCif: string | null | undefined, corrections: CifCorrectionCatalog = {}): string {
  if (!rawCif) return '';
  const trimmed = rawCif.trim();
  if (isOpaquePersonaFisicaId(trimmed)) {
    return trimmed.toLowerCase();
  }
  const corrected = corrections[trimmed] || corrections[trimmed.toUpperCase()] || trimmed.toUpperCase();
  return corrected;
}

/**
 * Limpia un nombre para comparación (sin acentos, mayúsculas, espacios colapsados)
 */
export function cleanNameForMatch(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca si un CIF pertenece a un grupo empresarial conocido
 */
export function getCorporateGroupForCif(cif: string, corporateGroups: Record<string, CorporateGroup>): CorporateGroup | null {
  const normCif = normalizeCif(cif);
  if (!normCif) return null;

  for (const group of Object.values(corporateGroups)) {
    if (group.cifs.includes(normCif)) {
      return group;
    }
  }
  return null;
}

/**
 * Información de resolución de una empresa
 */
export interface ResolvedEntity {
  canonicalId: string;
  canonicalCif: string;
  canonicalNombre: string;
  rawNombre: string;
  rawCif: string;
  esMismaEmpresa: boolean;
  tipoVinculo: 'cambio_denominacion' | 'dni_enmascarado' | 'variante_cif' | 'estandar';
  motivoVinculo?: string;
  rebrandingInfo?: DenominationChangeInfo;
  grupo?: CorporateGroup;
  esDniEnmascarado: boolean;
  dniVerificado?: string;
}

/**
 * Resuelve un CIF y Nombre registrado en un contrato a su identidad canónica consolidada
 */
export function resolveEntity(
  rawCif: string | null | undefined,
  rawNombre: string | null | undefined,
  catalog: CorporateResolutionCatalog = { corporateGroups: {}, knownRebrandings: {}, cifCorrections: {}, verifiedPersons: {} }
): ResolvedEntity {
  const cleanRawCif = (rawCif || '').trim();
  const cleanRawNombre = (rawNombre || '').trim();
  const normCif = normalizeCif(cleanRawCif, catalog.cifCorrections);
  const cleanNom = cleanNameForMatch(cleanRawNombre);

  // 1. Comprobar si es autónomo con cruce de DNI RGPD
  const dniMatch = catalog.verifiedPersons[cleanRawNombre.toUpperCase()] || 
                   Object.values(catalog.verifiedPersons).find(m => cleanNameForMatch(m.nombre) === cleanNom);
  
  if (dniMatch) {
    const isMasked = cleanRawCif.includes('*') || dniMatch.variantesEnmascaradas.includes(cleanRawCif);
    const canonicalCif = dniMatch.canonicalId;
    const group = getCorporateGroupForCif(canonicalCif, catalog.corporateGroups);

    return {
      canonicalId: canonicalCif,
      canonicalCif: canonicalCif,
      canonicalNombre: dniMatch.nombre,
      rawNombre: cleanRawNombre,
      rawCif: cleanRawCif,
      esMismaEmpresa: isMasked || cleanRawCif !== canonicalCif,
      tipoVinculo: isMasked ? 'dni_enmascarado' : 'estandar',
      motivoVinculo: isMasked
        ? 'Contrato con identificador físico enmascarado consolidado con un identificador opaco estable'
        : undefined,
      grupo: group || undefined,
      esDniEnmascarado: isMasked,
      dniVerificado: canonicalCif,
    };
  }

  // 2. Comprobar si hay un cambio de denominación / rebranding documentado
  const rebranding = catalog.knownRebrandings[normCif];
  if (rebranding) {
    const rawCluster = getClusterKey(cleanRawNombre);
    const activeCluster = getClusterKey(rebranding.nombreActual);
    const formerMatch = rebranding.nombresAnteriores.find(n => getClusterKey(n.nombre) === rawCluster || cleanNameForMatch(n.nombre) === cleanNom);
    const activeDivisionMatch = rebranding.divisionesActivas?.find(d => getClusterKey(d.nombre) === rawCluster);

    const isFormerName = !!formerMatch;
    let motivoVinculo = rebranding.motivoGeneral;

    if (formerMatch) {
      motivoVinculo = formerMatch.motivo || `Denominación anterior registrada: '${cleanRawNombre}'. Motivo: ${rebranding.motivoGeneral}`;
    } else if (activeDivisionMatch && rawCluster !== activeCluster) {
      motivoVinculo = activeDivisionMatch.descripcion || `División comercial activa: '${cleanRawNombre}'.`;
    } else if (rawCluster === activeCluster && cleanRawNombre !== rebranding.nombreActual) {
      motivoVinculo = `Variante de registro de la denominación principal '${rebranding.nombreActual}'.`;
    }

    const group = getCorporateGroupForCif(normCif, catalog.corporateGroups);

    return {
      canonicalId: normCif,
      canonicalCif: normCif,
      canonicalNombre: rebranding.nombreActual,
      rawNombre: cleanRawNombre,
      rawCif: cleanRawCif,
      esMismaEmpresa: true,
      tipoVinculo: isFormerName ? 'cambio_denominacion' : (activeDivisionMatch || rawCluster === activeCluster ? 'estandar' : 'cambio_denominacion'),
      motivoVinculo,
      rebrandingInfo: rebranding,
      grupo: group || undefined,
      esDniEnmascarado: false,
    };
  }

  // 3. Comprobar variantes de CIF / mayúsculas / erratas
  const group = getCorporateGroupForCif(normCif, catalog.corporateGroups);
  const hadCifFix = normCif !== cleanRawCif && normCif.length > 0;

  const isPF = isOpaquePersonaFisicaId(normCif || cleanRawCif) || isPersonaFisicaNif(normCif || cleanRawCif);
  const canonicalId = isPF 
    ? getOpaqueEmpresaId(normCif || cleanRawCif, cleanRawNombre)
    : (normCif || cleanRawNombre);
  const canonicalCif = isPF
    ? getOpaqueEmpresaId(normCif || cleanRawCif, cleanRawNombre)
    : normCif;

  return {
    canonicalId,
    canonicalCif,
    canonicalNombre: cleanRawNombre,
    rawNombre: cleanRawNombre,
    rawCif: cleanRawCif,
    esMismaEmpresa: hadCifFix,
    tipoVinculo: hadCifFix ? 'variante_cif' : 'estandar',
    motivoVinculo: hadCifFix
      ? (isPF ? 'Normalización de identificador físico a un identificador opaco estable' : `Normalización de identificador '${cleanRawCif}' a '${normCif}'`)
      : undefined,
    grupo: group || undefined,
    esDniEnmascarado: cleanRawCif.includes('*'),
  };
}
