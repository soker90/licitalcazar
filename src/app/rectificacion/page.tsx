import { Metadata } from 'next';
import Link from 'next/link';
import { RefreshCw, Mail, Clock, ChevronRight, ShieldCheck } from 'lucide-react';
import { LEGAL_CONFIG } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Procedimiento de Rectificación y Ejercicio de Derechos | LicitAlcázar',
  description: 'Ruta y canal previsto en la aplicación para la comunicación de rectificaciones, condicionado a que el titular configure y atienda los datos de contacto.',
};

export default function RectificacionPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10 space-y-10 bg-white text-slate-800">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/" className="hover:text-emerald-700 transition-colors">
          Inicio
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-semibold text-slate-900">Rectificación</span>
      </nav>

      {/* Header */}
      <div className="space-y-4 border-b border-slate-200 pb-6">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
            <RefreshCw className="h-5 w-5" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
            Exactitud Registral y Derechos Ciudadanos
          </span>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Procedimiento de Rectificación y Ejercicio de Derechos
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          Ruta y canal previsto en la aplicación para solicitar la corrección de erratas, actualización de razones sociales o ejercicio de derechos de protección de datos, condicionado a que el titular configure y atienda los datos de contacto.
        </p>
      </div>

      {/* Marco de Plazos y Naturaleza de las Peticiones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
          <Clock className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-700 block font-mono">
              Atención Técnica Ciudadana
            </span>
            <p className="text-xs text-slate-600">
              Al tratarse de una iniciativa cívica e independiente sin potestades públicas, las peticiones se gestionan por orden de llegada con acuse técnico estimativo en <strong>{LEGAL_CONFIG.compromisoAcuseHoras} horas hábiles</strong>.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-700 block font-mono">
              Plazo Legal General RGPD (Art. 12.3)
            </span>
            <p className="text-xs text-slate-600">
              Para el ejercicio formal de derechos de protección de datos de personas físicas (acceso, rectificación, supresión), rige el plazo legal general de <strong>un mes</strong> previsto en el artículo 12.3 del RGPD, con las ampliaciones previstas legalmente si la complejidad o volumen de solicitudes lo requiere.
            </p>
          </div>
        </div>
      </div>

      {/* Tipologías de Solicitud Admisibles */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
          Tipologías de Solicitud y Canales Específicos
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
            <span className="font-bold text-slate-900 block">Tipo A · Error material en el dato publicado</span>
            <p className="text-slate-600">Discordancia evidente entre el registro publicado en PLACSP y el valor mostrado en LicitAlcázar (importe, adjudicatario, fecha, procedimiento o estado).</p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
            <span className="font-bold text-slate-900 block">Tipo B · Error en la identificación de empresa</span>
            <p className="text-slate-600">Cambios de razón social sobrevenidos, absorciones, fusiones, corrección de filiales o desvinculación de grupos corporativos asignados por homonimia.</p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
            <span className="font-bold text-slate-900 block">Tipo C · Solicitud de ejercicio de derechos RGPD</span>
            <p className="text-slate-600">Peticiones de personas físicas (autónomos o profesionales individuales) relativas a la minimización, rectificación o supresión de sus datos personales conforme al RGPD.</p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
            <span className="font-bold text-slate-900 block">Tipo D · Observación metodológica</span>
            <p className="text-slate-600">Aportaciones técnicas o sugerencias sobre el cálculo de umbrales, segmentación temporal o ponderación algorítmica de los indicadores estadísticos.</p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1 md:col-span-2">
            <span className="font-bold text-slate-900 block">Tipo E · Aportación de documentación del expediente</span>
            <p className="text-slate-600">Aportación de documentación de pliegos, actas de mesas, justificaciones de ofertas anormalmente bajas o resoluciones oficiales (TACRC, TCu, resoluciones judiciales) para su contextualización.</p>
          </div>
        </div>
      </div>

      {/* Protocolo Paso a Paso */}
      <div className="space-y-6 text-sm leading-relaxed text-slate-700">
        <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
          ¿Cómo tramitar una solicitud?
        </h2>

        <p>
          Si usted es un licitador, contratista, representante legal o persona interesada y desea comunicar una rectificación o actualización documental, complete los siguientes puntos:
        </p>

        <div className="space-y-4 pt-1">
          {/* Paso 1 */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-800 text-xs font-mono font-bold">
                1
              </span>
              <span>Identificación del expediente o entidad</span>
            </div>
            <p className="text-xs text-slate-600 ml-8">
              Indique el enlace de la ficha en LicitAlcázar y el número oficial del expediente en PLACSP o el NIF mercantil de la entidad.
            </p>
          </div>

          {/* Paso 2 */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-800 text-xs font-mono font-bold">
                2
              </span>
              <span>Tipología y descripción del ajuste solicitado</span>
            </div>
            <p className="text-xs text-slate-600 ml-8">
              Especifique la tipología (Tipo A, B, C, D o E) y detalle el dato inexacto junto a la redacción o cifra correcta propuesta.
            </p>
          </div>

          {/* Paso 3 */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-800 text-xs font-mono font-bold">
                3
              </span>
              <span>Acreditación documental oficial contrastable</span>
            </div>
            <p className="text-xs text-slate-600 ml-8">
              Adjunte enlace a la publicación rectificada en PLACSP, resolución administrativa firme, testimonio judicial o documentación fehaciente.
            </p>
          </div>

          {/* Paso 4 */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-800 text-xs font-mono font-bold">
                4
              </span>
              <span>Remisión de la solicitud</span>
            </div>
            <p className="text-xs text-slate-600 ml-8">
              Envíe la solicitud acreditando la identidad o representación al canal formal del observatorio:
            </p>
            <div className="ml-8 pt-1">
              {LEGAL_CONFIG.rectificacionEmail ? (
                <a 
                  href={`mailto:${LEGAL_CONFIG.rectificacionEmail}?subject=Solicitud%20de%20Rectificaci%C3%B3n%20-%20LicitAlc%C3%A1zar`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-xs font-bold hover:bg-emerald-100 transition-colors"
                >
                  <Mail className="h-4 w-4 text-emerald-700" />
                  <span>{LEGAL_CONFIG.rectificacionEmail}</span>
                </a>
              ) : (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900">
                  <span className="font-semibold block">{LEGAL_CONFIG.rectificacionEmailDisplay}</span>
                  <span className="text-slate-600 text-[11px] mt-0.5 block">
                    El administrador del despliegue debe configurar la variable de entorno NEXT_PUBLIC_RECTIFICACION_EMAIL o NEXT_PUBLIC_CONTACT_EMAIL para habilitar la recepción telemática de peticiones.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Criterios Editoriales */}
        <section className="space-y-3 pt-4">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
            Criterios Editoriales y Trazabilidad del Registro de Cambios
          </h2>
          <p>
            Toda modificación o corrección realizada sobre la base de datos es registrada en el historial de revisiones del sistema, conservando:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-slate-600 ml-2">
            <li>Fecha y hora de la rectificación.</li>
            <li>Identificador del expediente o empresa corregida.</li>
            <li>Documento o enlace oficial que fundamentó el ajuste.</li>
            <li>Nota explicativa incorporada a la ficha pública del expediente cuando resulte pertinente para garantizar la transparencia histórica.</li>
          </ul>
        </section>
      </div>

      {/* Footer Nav */}
      <div className="pt-6 border-t border-slate-200 flex flex-wrap gap-4 text-xs font-semibold text-emerald-800">
        <Link href="/aviso-legal" className="hover:underline">
          Aviso Legal y Condiciones de Uso →
        </Link>
        <Link href="/privacidad" className="hover:underline">
          Política de Privacidad →
        </Link>
        <Link href="/metodologia" className="hover:underline">
          Metodología Jurídica y Algorítmica →
        </Link>
      </div>
    </div>
  );
}
