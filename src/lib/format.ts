export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    useGrouping: 'always',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return new Intl.NumberFormat('es-ES', {
    useGrouping: 'always',
  }).format(val);
}

export function formatUrgencia(value: string | number | null | undefined): string {
  const codigo = value == null ? '' : String(value).trim();
  if (!codigo) return 'Ordinaria';

  const labels: Record<string, string> = {
    '1': 'Ordinaria',
    '2': 'Urgente',
    '3': 'Emergencia',
  };

  return labels[codigo] || codigo;
}

export function formatDecimal(val: number | null | undefined, decimals: number = 1): string {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: 'always',
  }).format(val);
}

export function formatPercent(val: number | null | undefined, decimals: number = 1): string {
  if (val === null || val === undefined || isNaN(val)) return '0%';
  const numStr = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
  return `${numStr}%`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}

export { isPersonaFisicaNif, isOpaquePersonaFisicaId } from './nif-rules.ts';
import { isPersonaFisicaNif, isOpaquePersonaFisicaId } from './nif-rules.ts';

/**
 * Enmascara de forma segura el DNI o NIE de una persona física conforme a la
 * Disposición Adicional Séptima de la Ley Orgánica 3/2018 (LOPDGDD), conservando
 * únicamente cuatro dígitos numéricos centrales acompañados de asteriscos.
 * Preserva intactos los identificadores seudonimizados opacos (pf-*) y los CIF societarios.
 */
export function maskDniNie(nif: string | null | undefined): string {
  if (!nif) return '';
  const trimmed = nif.trim();
  if (!trimmed) return '';

  // Si ya es un identificador opaco pf-*, devolver intacto
  if (isOpaquePersonaFisicaId(trimmed)) {
    return trimmed.toLowerCase();
  }

  const clean = trimmed.toUpperCase();

  // Si ya se encuentra previamente enmascarado
  if (clean.includes('*')) {
    return clean;
  }

  // Comprobar si es persona física (DNI o NIE)
  if (isPersonaFisicaNif(clean)) {
    const digits = clean.replace(/[^0-9]/g, '');
    if (digits.length >= 4) {
      // Tomar 4 cifras numéricas intermedias conforme a la DA 7ª LOPDGDD
      const startIdx = Math.max(0, Math.floor((digits.length - 4) / 2));
      const centralFour = digits.substring(startIdx, startIdx + 4);
      return `***${centralFour}**`;
    }
    // Si tuviera menos de 4 dígitos por anomalía en los datos
    return '***' + digits + '**';
  }

  // Personas jurídicas: CIF societario ordinario (A, B, C, D, etc.)
  return clean;
}

export function formatNif(nif: string | null | undefined): string {
  if (!nif) return '';
  return maskDniNie(nif);
}

export function formatCompactCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '0 €';
  if (amount >= 1_000_000) {
    const val = amount / 1_000_000;
    return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, minimumFractionDigits: 1 }).format(val)} M€`;
  }
  if (amount >= 1_000) {
    const val = amount / 1_000;
    return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(val)} k€`;
  }
  return formatCurrency(amount);
}
