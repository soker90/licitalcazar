import { Metadata } from 'next';
import Link from 'next/link';
import { Scale, AlertTriangle, ChevronRight } from 'lucide-react';
import { LEGAL_CONFIG } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Aviso Legal y Condiciones de Uso | LicitAlcázar',
  description: 'Condiciones de uso, exoneración de potestades públicas, marco de reutilización de datos abiertos y régimen de responsabilidad de LicitAlcázar.',
};

export default function AvisoLegalPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10 space-y-10 bg-white text-slate-800">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/" className="hover:text-emerald-700 transition-colors">
          Inicio
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-semibold text-slate-900">Aviso Legal</span>
      </nav>

      {/* Header */}
      <div className="space-y-4 border-b border-slate-200 pb-6">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
            <Scale className="h-5 w-5" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
            Información Legal y Regulatoria
          </span>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Aviso Legal y Régimen Jurídico
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          Términos de uso, naturaleza cívica del proyecto y delimitación de responsabilidades informativas conforme a la legislación española y europea.
        </p>
      </div>

      {/* Declaración Central */}
      <div className="p-5 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-amber-950 space-y-3">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0" />
          <h2 className="font-bold text-sm sm:text-base">
            Naturaleza Cívica, Informativa y No Vinculante
          </h2>
        </div>
        <p className="text-xs sm:text-sm leading-relaxed text-amber-900">
          <strong>LicitAlcázar es una iniciativa cívica e independiente de análisis de información pública sobre contratación.</strong> Sus resultados consisten en datos, cálculos e indicadores elaborados a partir de las fuentes identificadas. No constituyen informes de fiscalización, auditoría pública, dictámenes jurídicos vinculantes, resoluciones administrativas ni declaraciones de ilegalidad, nulidad, responsabilidad o infracción.
        </p>
      </div>

      {/* Alerta de Configuración Pendiente si no está configurado */}
      {!LEGAL_CONFIG.isConfigured && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 space-y-2">
          <div className="font-bold text-xs uppercase tracking-wider font-mono text-rose-800">
            Aviso de Configuración Legal Incompleta en el Despliegue
          </div>
          <p className="text-xs leading-relaxed text-rose-900">
            Este despliegue no cuenta actualmente con la configuración efectiva de las variables de entorno de identificación del titular (<code className="font-mono text-[11px] bg-white/70 px-1 py-0.5 rounded">NEXT_PUBLIC_LEGAL_TITULAR</code>) ni canal de contacto telemático (<code className="font-mono text-[11px] bg-white/70 px-1 py-0.5 rounded">NEXT_PUBLIC_CONTACT_EMAIL</code>). El presente texto refleja las condiciones marco del software de código abierto, pero no sustituye la identificación preceptiva exigida por la normativa vigente para un servicio telemático en explotación definitiva.
          </p>
        </div>
      )}

      {/* Secciones */}
      <div className="space-y-8 text-sm leading-relaxed text-slate-700">
        {/* 1. Titularidad y Contacto */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
            1. Identificación del Proyecto
          </h2>
          <p>
            Información identificativa: Los datos identificativos exigibles deberán completarse atendiendo a la identidad del titular, su actividad y la normativa que resulte aplicable.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-slate-600 ml-2">
            <li><strong>Denominación del proyecto:</strong> LicitAlcázar (Iniciativa de Datos Abiertos de Alcázar de San Juan).</li>
            <li><strong>Titularidad:</strong> {LEGAL_CONFIG.titularDisplay}</li>
            <li><strong>Canal de contacto general:</strong> {LEGAL_CONFIG.contactoEmail ? <a href={`mailto:${LEGAL_CONFIG.contactoEmail}`} className="text-emerald-700 underline font-medium">{LEGAL_CONFIG.contactoEmail}</a> : LEGAL_CONFIG.contactoEmailDisplay}</li>
            <li><strong>Canal de rectificación y ejercicio de derechos:</strong> {LEGAL_CONFIG.rectificacionEmail ? <a href={`mailto:${LEGAL_CONFIG.rectificacionEmail}`} className="text-emerald-700 underline font-medium">{LEGAL_CONFIG.rectificacionEmail}</a> : LEGAL_CONFIG.rectificacionEmailDisplay}</li>
            <li><strong>Datos identificativos y de notificación:</strong> {LEGAL_CONFIG.domicilioNotificacionesDisplay}</li>
          </ul>
        </section>

        {/* 2. Delimitación de Potestades Públicas */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
            2. Ausencia de Potestades Oficiales y No Sustitución Institucional
          </h2>
          <p>
            LicitAlcázar carece de potestades administrativas, inspectoras, fiscalizadoras o sancionadoras. La plataforma y sus algoritmos analíticos <strong>no sustituyen</strong> en ningún caso las funciones ni los pronunciamientos de:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-bold text-slate-800 block mb-1">Órganos Locales de Gestión y Control:</span>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                <li>Al órgano de contratación competente.</li>
                <li>A la Intervención General municipal.</li>
                <li>A la Secretaría General del Ayuntamiento.</li>
              </ul>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-bold text-slate-800 block mb-1">Órganos Fiscalizadores y Jurisdiccionales:</span>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                <li>Al Tribunal de Cuentas (art. 136 CE).</li>
                <li>A la Cámara de Cuentas de Castilla-La Mancha (Ley 7/2021).</li>
                <li>A los tribunales administrativos de recursos contractuales (TACRC / TARC).</li>
                <li>A los Juzgados y Tribunales del orden jurisdiccional contencioso-administrativo o penal.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 3. Fuentes Oficiales y Reutilización */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
            3. Fuentes Oficiales y Régimen de Reutilización
          </h2>
          <p>
            Los datos analizados proceden íntegramente de los canales públicos sindicados de la <strong>Plataforma de Contratación del Sector Público (PLACSP)</strong> gestionada por la Dirección General del Patrimonio del Estado (Ministerio de Hacienda), en el marco de la <strong>Ley 37/2007, de 16 de noviembre, sobre reutilización de la información del sector público</strong> y el artículo 8 de la Ley 19/2013 de Transparencia.
          </p>
          <p className="text-xs text-slate-600">
            La plataforma procesa y estructura estos datos de manera automatizada. No puede garantizar la exactitud, exhaustividad o integridad de los documentos o metadatos volcados en origen por las entidades contratantes en la plataforma estatal. Cuando un documento no se localiza en la fuente telemática, ello no permite concluir que no exista en el expediente físico o electrónico custodiado por la administración.
          </p>
        </section>

        {/* 4. Interpretación de las Señales de Riesgo */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
            4. Interpretación de Señales de Riesgo (Banderas Rojas)
          </h2>
          <p>
            Las etiquetas de alerta o indicadores mostrados en el portal son <strong>señales estadísticas y analíticas de priorización investigadora</strong> basadas en metodologías de la OCDE, la Comisión Europea y principios de la Ley 9/2017 (LCSP).
          </p>
          <p className="text-xs text-slate-600">
            Una señal analítica no presupone fraude, delito, fraccionamiento irregular ni incorrección jurídica. Cualquier valoración concluyente exige el examen individualizado del expediente administrativo completo, incluidos los pliegos, memorias técnicas de necesidad, justificaciones económicas y actas de las mesas de contratación.
          </p>
        </section>

        {/* 5. Enlaces Externos y Propiedad Intelectual */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
            5. Enlaces Oficiales y Licencia de Datos
          </h2>
          <p>
            Cada ficha de licitación proporciona un enlace directo al expediente original en PLACSP. LicitAlcázar no ejerce control sobre el contenido de los servidores estatales ni se responsabiliza de caídas temporales o modificaciones en las URL institucionales.
          </p>
          <p className="text-xs text-slate-600">
            Los datos públicos agregados se ofrecen bajo criterios de datos abiertos con fines cívicos, docentes y de investigación ciudadana. El código fuente de la plataforma se distribuye bajo licencia libre accesible en el repositorio del proyecto.
          </p>
        </section>
      </div>

      {/* Footer Nav */}
      <div className="pt-6 border-t border-slate-200 flex flex-wrap gap-4 text-xs font-semibold text-emerald-800">
        <Link href="/privacidad" className="hover:underline">
          Política de Privacidad y Protección de Datos →
        </Link>
        <Link href="/rectificacion" className="hover:underline">
          Procedimiento de Rectificación y Ejercicio de Derechos →
        </Link>
        <Link href="/metodologia" className="hover:underline">
          Metodología Jurídica y Algorítmica →
        </Link>
      </div>
    </div>
  );
}
