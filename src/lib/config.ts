/**
 * Central application configuration and environment settings.
 */

function resolveSiteUrl(): string {
  // 1. Explicitly configured public site URL
  if (process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL.trim().length > 0) {
    return process.env.NEXT_PUBLIC_SITE_URL.trim().replace(/\/+$/, '');
  }

  // 2. Vercel production deployment URL (provided by Vercel environment)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`;
  }

  // 3. Vercel deployment preview / current URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.trim()}`;
  }

  // 4. Default canonical production domain
  return 'https://licitalcazar.vercel.app';
}

export const SITE_URL = resolveSiteUrl();

export type LegalConfigStatus = 'configured' | 'incomplete';

/**
 * Parámetros jurídicos, de contacto y configuración de privacidad.
 * Los datos identificativos exigibles deberán completarse atendiendo a la identidad del titular, su actividad y la normativa que resulte aplicable.
 * No genera direcciones ni titulares ficticios en ausencia de variables de entorno;
 * expone estados no configurados para advertir al administrador del despliegue.
 */
const rawTitular = (process.env.NEXT_PUBLIC_LEGAL_TITULAR || '').trim();
const rawContactoEmail = (process.env.NEXT_PUBLIC_CONTACT_EMAIL || '').trim();
const rawRectificacionEmail = (process.env.NEXT_PUBLIC_RECTIFICACION_EMAIL || '').trim();
const rawDomicilio = (process.env.NEXT_PUBLIC_LEGAL_DOMICILIO || '').trim();

// El estado configured solo se activará cuando existan valores reales para titular, correo de contacto y canal de rectificación
const isConfigured = Boolean(rawTitular && rawContactoEmail && (rawRectificacionEmail || rawContactoEmail));
const status: LegalConfigStatus = isConfigured ? 'configured' : 'incomplete';

export const LEGAL_CONFIG = {
  status,
  isConfigured,
  titular: rawTitular || null,
  titularDisplay: rawTitular || '[Identificación del titular de la iniciativa pendiente de configuración]',
  contactoEmail: rawContactoEmail || null,
  contactoEmailDisplay: rawContactoEmail || '[Canal de contacto técnico pendiente de configuración por el titular]',
  rectificacionEmail: rawRectificacionEmail || rawContactoEmail || null,
  rectificacionEmailDisplay: rawRectificacionEmail || rawContactoEmail || '[Canal de rectificación pendiente de configuración por el titular]',
  domicilioNotificaciones: rawDomicilio || null,
  domicilioNotificacionesDisplay: rawDomicilio || '[Los datos identificativos exigibles deberán completarse atendiendo a la identidad del titular, su actividad y la normativa que resulte aplicable]',
  finalidad: 'Análisis estadístico cívico, fomento de la transparencia en la contratación pública local y divulgación de datos abiertos.',
  baseJuridica: 'La base jurídica de cada tratamiento se determinará atendiendo a su finalidad concreta. Cuando se invoque el interés legítimo (art. 6.1.f RGPD), el responsable deberá realizar y conservar la correspondiente ponderación entre dicho interés y los derechos y libertades de las personas afectadas.',
  plazoLegalRgpdTexto: 'Plazo legal general de un mes a partir de la recepción de la solicitud (art. 12.3 RGPD), con las ampliaciones previstas legalmente en atención a la complejidad y al número de solicitudes.',
  plazoLegalRgpdMeses: 1,
  compromisoAcuseHoras: 48, // Estimación organizativa interna de acuse técnico, no sustitutiva del plazo legal
  versionMetodologia: 'v2.1 (Revisión Jurídica y Metodológica)',
  fechaRevisionNormativa: 'Septiembre 2026',
};

export function getLegalConfigValidationErrors(): string[] {
  const errors: string[] = [];
  if (!rawTitular) {
    errors.push('Falta variable NEXT_PUBLIC_LEGAL_TITULAR: Identificación real de la persona física o jurídica titular.');
  }
  if (!rawContactoEmail) {
    errors.push('Falta variable NEXT_PUBLIC_CONTACT_EMAIL: Buzón telemático funcional y operativo de contacto general.');
  }
  return errors;
}

