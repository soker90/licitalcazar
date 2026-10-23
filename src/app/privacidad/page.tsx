import { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Lock, ExternalLink, ChevronRight } from 'lucide-react';
import { LEGAL_CONFIG } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Política de Privacidad y Protección de Datos | LicitAlcázar',
  description: 'Tratamiento de información, base jurídica, medidas de enmascaramiento y ejercicio de derechos conforme al RGPD y a la Ley Orgánica 3/2018.',
};

export default function PrivacidadPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10 space-y-10 bg-white text-slate-800">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/" className="hover:text-emerald-700 transition-colors">
          Inicio
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-semibold text-slate-900">Privacidad</span>
      </nav>

      {/* Header */}
      <div className="space-y-4 border-b border-slate-200 pb-6">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Lock className="h-5 w-5" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
            RGPD & Ley Orgánica 3/2018 (LOPDGDD)
          </span>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Política de Privacidad y Protección de Datos
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          Garantías aplicadas al tratamiento de información de personas físicas en el marco de la reutilización de datos abiertos de contratación pública.
        </p>
      </div>

      {/* Resumen de Garantías */}
      <div className="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200 text-emerald-950 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-700 shrink-0" />
          <h2 className="font-bold text-sm sm:text-base">
            Medidas de Minimización y Protección de Datos Personales
          </h2>
        </div>
        <p className="text-xs sm:text-sm leading-relaxed text-emerald-900">
          El código incorpora medidas de ocultación y minimización de identificadores. La licitud del tratamiento exige que el responsable determine y documente la base jurídica, la finalidad, la necesidad, la proporcionalidad, la exactitud, la conservación y las medidas de seguridad aplicables.
        </p>
        <p className="text-xs sm:text-sm leading-relaxed text-emerald-900">
          Por razones de minimización y reducción de la exposición de datos, este portal no muestra públicamente números completos de DNI o NIE de personas físicas, aplicando medidas técnicas de enmascaramiento parcial (mostrando únicamente 4 cifras centrales) para reducir riesgos sobre la privacidad.
        </p>
      </div>

      {/* Tabla Resumen de Tratamiento */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse border border-slate-200 bg-white rounded-xl overflow-hidden">
          <caption className="text-left font-bold text-slate-900 text-sm mb-3">
            Cuadro Resumen de Tratamiento de Datos Personales
          </caption>
          <tbody className="divide-y divide-slate-200 text-slate-700">
            <tr className="bg-slate-50/70">
              <th scope="row" className="p-3 font-semibold text-slate-900 w-1/3 border-r border-slate-200">
                Responsable del Tratamiento
              </th>
              <td className="p-3">
                {LEGAL_CONFIG.titularDisplay} · Contacto: {LEGAL_CONFIG.contactoEmail ? <a href={`mailto:${LEGAL_CONFIG.contactoEmail}`} className="text-emerald-700 underline font-medium">{LEGAL_CONFIG.contactoEmail}</a> : <span className="text-slate-500 italic">{LEGAL_CONFIG.contactoEmailDisplay}</span>}
              </td>
            </tr>
            <tr>
              <th scope="row" className="p-3 font-semibold text-slate-900 border-r border-slate-200">
                Finalidad Principal
              </th>
              <td className="p-3">
                {LEGAL_CONFIG.finalidad}
              </td>
            </tr>
            <tr className="bg-slate-50/70">
              <th scope="row" className="p-3 font-semibold text-slate-900 border-r border-slate-200">
                Base Jurídica Formal (RGPD)
              </th>
              <td className="p-3">
                La base jurídica de cada tratamiento se determinará atendiendo a su finalidad concreta. La invocación del interés legítimo (artículo 6.1.f RGPD) exige identificar la finalidad concreta, la necesidad del tratamiento y la ponderación entre el interés perseguido y los derechos y libertades de las personas afectadas.
              </td>
            </tr>
            <tr>
              <th scope="row" className="p-3 font-semibold text-slate-900 border-r border-slate-200">
                Categorías de Datos Distinguidas
              </th>
              <td className="p-3">
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Datos publicados en fuentes oficiales:</strong> expedientes y anuncios de PLACSP.</li>
                  <li><strong>Datos de personas jurídicas:</strong> sociedades con CIF (no constituyen datos personales protegidos por el RGPD).</li>
                  <li><strong>Datos de personas físicas:</strong> empresarios individuales, autónomos o profesionales identificados en adjudicaciones (nombre y DNI/NIE enmascarado).</li>
                  <li><strong>Datos de trazabilidad interna:</strong> claves algorítmicas de indexación de expedientes.</li>
                  <li><strong>Datos de gestión de rectificación:</strong> datos de contacto aportados por solicitantes al canal de incidencias.</li>
                </ul>
              </td>
            </tr>
            <tr className="bg-slate-50/70">
              <th scope="row" className="p-3 font-semibold text-slate-900 border-r border-slate-200">
                Medidas de Reducción de Exposición
              </th>
              <td className="p-3">
                Enmascaramiento preventivo de DNI/NIE mostrando exclusivamente 4 cifras centrales acompañadas de asteriscos (<code className="font-mono">***NNNN**</code>) para evitar la identificación unívoca desproporcionada.
              </td>
            </tr>
            <tr>
              <th scope="row" className="p-3 font-semibold text-slate-900 border-r border-slate-200">
                Plazo de Conservación
              </th>
              <td className="p-3">
                Criterio temporal vinculado al periodo de fiscalización y prescripción administrativa y contable de los contratos analizados.
              </td>
            </tr>
            <tr className="bg-slate-50/70">
              <th scope="row" className="p-3 font-semibold text-slate-900 border-r border-slate-200">
                Canal de Rectificación y Derechos
              </th>
              <td className="p-3">
                {LEGAL_CONFIG.rectificacionEmail ? (
                  <>Vía telemática a <a href={`mailto:${LEGAL_CONFIG.rectificacionEmail}`} className="text-emerald-700 underline font-medium">{LEGAL_CONFIG.rectificacionEmail}</a>. Plazo legal general de un mes (art. 12.3 RGPD), con las ampliaciones previstas legalmente.</>
                ) : (
                  <span className="text-slate-500 italic">{LEGAL_CONFIG.rectificacionEmailDisplay}</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cláusulas Detalladas */}
      <div className="space-y-8 text-sm leading-relaxed text-slate-700">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
            1. Procedencia de los Datos y Reutilización
          </h2>
          <p>
            Los datos analizados proceden de los registros públicos telemáticos de la Plataforma de Contratación del Sector Público (PLACSP). Conforme a la doctrina de la Agencia Española de Protección de Datos (AEPD), la reutilización regulada en la Ley 37/2007 no legitima por sí sola el tratamiento indiscriminado de datos personales ni sustituye las exigencias de base jurídica, minimización y exactitud del RGPD.
          </p>
          <p className="text-xs text-slate-600">
            LicitAlcázar no indexa ni difunde datos de contacto privado (teléfonos particulares, correos personales ni domicilios residenciales) aunque figuren en anexos documentales de la plataforma de contratación.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
            2. Distinción entre Personas Físicas y Personas Jurídicas
          </h2>
          <p>
            El RGPD y la LOPDGDD protegen exclusivamente a las <strong>personas físicas</strong>. Los datos referidos a sociedades de capital (sociedades anónimas, limitadas, cooperativas) con CIF societario (letras A, B, C, etc.) no constituyen datos personales.
          </p>
          <p className="text-xs text-slate-600">
            En el caso de empresarios individuales, autónomos y profesionales colegiados, su actividad mercantil se encuentra ligada a su identidad civil. Para reducir riesgos sobre su privacidad, este portal no muestra públicamente números completos de DNI o NIE, aplicando medidas de ocultación.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
            3. Decisiones Automatizadas y Perfilado (Art. 22 RGPD)
          </h2>
          <p>
            LicitAlcázar <strong>no adopta decisiones automatizadas que produzcan efectos jurídicos</strong> ni perfilados que evalúen aspectos de la personalidad de los contratistas en los términos del artículo 22 del RGPD. Los indicadores cuantitativos generados (bajas porcentuales, concurrencia única, acumulación) reflejan parámetros aritméticos del expediente y no juicios subjetivos sobre la conducta ética o legal de las personas físicas intervinientes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
            4. Derechos de los Interesados y Vía de Reclamación
          </h2>
          <p>
            Cualquier persona física identificada en los registros puede ejercitar sus derechos reconocidos en los artículos 15 a 22 del RGPD:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-600 ml-2">
            <li><strong>Derecho de acceso:</strong> conocer qué expedientes públicos asocian su identidad.</li>
            <li><strong>Derecho de rectificación:</strong> solicitar la corrección de erratas, nombres comerciales desactualizados o errores de vinculación.</li>
            <li><strong>Derecho de supresión / limitación:</strong> en los supuestos en que la conservación vulnere los principios del RGPD o la información oficial haya sido anulada o revocada.</li>
          </ul>
          <p className="text-xs text-slate-600 mt-2">
            Las solicitudes pueden canalizarse a través del <Link href="/rectificacion" className="text-emerald-700 underline font-semibold">Procedimiento de Rectificación</Link> o mediante correo electrónico a <a href={`mailto:${LEGAL_CONFIG.rectificacionEmail}`} className="text-emerald-700 underline font-medium">{LEGAL_CONFIG.rectificacionEmail}</a>. El responsable atenderá las solicitudes dentro del plazo legal previsto en el artículo 12.3 del RGPD, con las ampliaciones que puedan proceder conforme a dicho precepto. Asimismo, los interesados tienen derecho a formular reclamación ante la <strong>Agencia Española de Protección de Datos (AEPD)</strong> (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-emerald-700 hover:underline">aepd.es <ExternalLink className="h-3 w-3 inline" /></a>).
          </p>
        </section>

        <section className="space-y-3 bg-amber-50/70 p-4 rounded-xl border border-amber-200 text-amber-950">
          <h2 className="text-base font-bold text-amber-900 border-b border-amber-200 pb-2">
            5. Evaluaciones y Obligaciones Documentales Pendientes del Responsable
          </h2>
          <p className="text-xs text-amber-900 leading-relaxed">
            Para la completa conformidad con el RGPD y la LOPDGDD, el responsable de la explotación de la plataforma debe mantener documentadas las siguientes actuaciones:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-amber-900 ml-2">
            <li>Elaborar y conservar una prueba documentada de ponderación del interés legítimo (art. 6.1.f RGPD) para cada finalidad del tratamiento.</li>
            <li>Revisar periódicamente la estricta minimización de los datos de personas físicas mostrados.</li>
            <li>Justificar la necesidad de publicar datos identificativos de empresarios individuales frente a la mera referencia anónima al contrato.</li>
            <li>Documentar y protocolizar formalmente la política de plazos de conservación y supresión de datos.</li>
            <li>Revisar y verificar la exactitud de las fuentes de datos de origen (PLACSP).</li>
            <li>Establecer un procedimiento reglado de bloqueo o retirada cautelar de datos controvertidos durante la tramitación de solicitudes.</li>
            <li>Determinar formalmente si procede la realización de una Evaluación de Impacto en la Protección de Datos (EIPD) conforme al artículo 35 del RGPD.</li>
          </ul>
        </section>
      </div>

      {/* Footer Nav */}
      <div className="pt-6 border-t border-slate-200 flex flex-wrap gap-4 text-xs font-semibold text-emerald-800">
        <Link href="/aviso-legal" className="hover:underline">
          ← Volver al Aviso Legal
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
