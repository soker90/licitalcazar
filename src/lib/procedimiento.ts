/**
 * Normalización y utilidades para procedimientos de contratación pública según la LCSP y PLACSP.
 */

/**
 * Tabla de alias y sinónimos para normalizar valores textuales o códigos de procedimiento.
 */
export function normalizeProcedimiento(raw: string | null | undefined): string {
  if (!raw) return 'Otros';
  const trimmed = raw.trim();
  if (!trimmed) return 'Otros';

  const lower = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Quitar tildes para comparación robusta

  // 1. Contratos menores
  if (
    lower === 'menor' ||
    lower === 'contrato menor' ||
    lower === 'contratos menores' ||
    lower === 'c. menor' ||
    lower === 'c.menor' ||
    lower === 'cm' ||
    lower === 'contrato_menor'
  ) {
    return 'Contrato menor';
  }

  // 2. Abierto y variantes
  if (lower === 'abierto' || lower === 'procedimiento abierto') {
    return 'Abierto';
  }
  if (
    lower === 'abierto simplificado' ||
    lower === 'procedimiento abierto simplificado' ||
    lower === 'simplificado'
  ) {
    return 'Abierto simplificado';
  }
  if (
    lower === 'abierto supersimplificado' ||
    lower === 'abierto abreviado' ||
    lower === 'supersimplificado' ||
    lower === 'abierto simplificado abreviado'
  ) {
    return 'Abierto supersimplificado';
  }

  // 3. Procedimientos negociados
  if (
    lower.includes('negociado sin publicidad') ||
    lower === 'nsp' ||
    lower === 'sin publicidad'
  ) {
    return 'Negociado sin publicidad';
  }
  if (
    lower.includes('negociado con publicidad') ||
    lower === 'ncp' ||
    lower === 'con publicidad'
  ) {
    return 'Negociado con publicidad';
  }
  if (lower === 'negociado' || lower === 'procedimiento negociado') {
    return 'Negociado sin publicidad';
  }

  // 4. Sistemas dinámicos y acuerdos marco
  if (lower.includes('sistema dinamico') || lower.includes('sda')) {
    return 'Basado en sistema dinámico';
  }
  if (lower.includes('acuerdo marco') || lower.includes('derivado de acuerdo marco')) {
    return 'Basado en acuerdo marco';
  }

  // 5. Restringido, Diálogo competitivo, Asociación para la innovación, Concurso
  if (lower === 'restringido' || lower === 'procedimiento restringido') {
    return 'Restringido';
  }
  if (lower.includes('dialogo competitivo')) {
    return 'Diálogo competitivo';
  }
  if (lower.includes('asociacion para la innovacion')) {
    return 'Asociación para la innovación';
  }
  if (lower.includes('concurso de proyectos')) {
    return 'Concurso de proyectos';
  }

  // 6. Encargos a medios propios
  if (lower.includes('encargo')) {
    return 'Encargo a medio propio';
  }

  // 7. Otros / Patrimonial
  if (lower === 'otros' || lower === 'otro') {
    return 'Otros';
  }

  // Capitalizar primera letra si no coincide explícitamente
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Determina si un procedimiento o licitación corresponde a un contrato menor.
 */
export function isContratoMenor(procedimiento?: string | null, conjunto?: string | null): boolean {
  if (conjunto === 'menores' || conjunto === 'contratos_menores') {
    return true;
  }
  if (!procedimiento) return false;
  const norm = normalizeProcedimiento(procedimiento);
  return norm === 'Contrato menor';
}
