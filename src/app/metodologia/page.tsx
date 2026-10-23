import Link from 'next/link';
import { Metadata } from 'next';
import { 
  ShieldCheck, 
  ExternalLink, 
  Calendar, 
  Building2, 
  UserX, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  Database,
  ArrowRight,
  FolderGit2,
  GitBranch,
  CalendarClock,
  Clock,
  TrendingUp,
  Users,
  Vote,
  Layers,
  Scale, 
  Hourglass, 
  MapPin,
  ShieldAlert
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Metodología y Verificabilidad de Datos | LicitAlcázar',
  description: 'Criterios técnicos, fuentes de datos, tratamiento de UTE, lotes, Comsermancha y definición de indicadores de auditoría en LicitAlcázar.',
};

export default function MetodologiaPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 space-y-12 bg-[#ffffff] text-slate-800">
      {/* Header Hero */}
      <div className="space-y-4 border-b border-[#e2e8f0] pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
            <ShieldCheck className="h-3.5 w-3.5" />
            Transparencia y Neutralidad
          </span>
          <span className="font-mono text-xs px-2.5 py-1 rounded bg-[#f8fafb] border border-[#e2e8f0] text-slate-600">
            Versión 2.1 · Actualizado 2026
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1e293b] tracking-tight">
          Metodología y Verificabilidad de Datos
        </h1>
        <p className="text-sm sm:text-base text-slate-600 max-w-3xl leading-relaxed">
          En LicitAlcázar la neutralidad e integridad son absolutas. Esta guía detalla la fundamentación técnica, legal y algorítmica aplicada a cada expediente, explicando de forma rigurosa cómo se procesan los datos para garantizar su contraste directo en la Plataforma de Contratación del Sector Público.
        </p>

        {/* Quick Anchor Navigation */}
        <div className="pt-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2 font-mono">
            Índice de secciones
          </span>
          <div className="flex flex-wrap gap-2 text-xs">
            <a href="#fuente-y-actualizacion" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              1. Fuente Oficial y Sincronización
            </a>
            <a href="#cobertura-temporal" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              2. Cobertura Temporal
            </a>
            <a href="#comsermancha" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              3. Tratamiento de Comsermancha
            </a>
            <a href="#oferta-unica" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              4. Criterio de Oferta Única
            </a>
            <a href="#utes" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              5. Tratamiento de UTE
            </a>
            <a href="#division-lotes" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              6. División en Lotes y PYMEs (Art. 99)
            </a>
            <a href="#banderas-rojas" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              7. Indicadores de Auditoría
            </a>
            <a href="#factores-auditoria" className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 transition-colors font-bold">
              8. Guía Ciudadana de Factores de Auditoría (V2)
            </a>
            <a href="#hhi" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              9. Concentración HHI y CR5
            </a>
            <a href="#flujo" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              9. Flujo y Licitaciones Desiertas
            </a>
            <a href="#contratos-vivos" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              10. Contratos Vivos y Vencimientos
            </a>
            <a href="#distribucion-tiempos" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              11. Tiempos, Mediana y Outliers
            </a>
            <a href="#evolucion-temporal" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              12. Series Temporales y Cobertura LCSP
            </a>
            <a href="#renovacion-mercado" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              13. Renovación de Proveedores y Rotación
            </a>
            <a href="#calendario-electoral" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              14. Calendario Electoral y Ciclo Político
            </a>
            <a href="#modificados-sobrecostes" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              15. Modificados, Sobrecostes y Art. 204/205 LCSP
            </a>
            <a href="#duracion-efectiva" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              16. Duración Registrada vs. Prevista (Art. 29 y 195)
            </a>
            <a href="#empresas-locales" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              17. Empresas Locales vs. Externas y Criterio BORME
            </a>
            <a href="#verificabilidad" className="px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] hover:text-[#0d9373] border border-[#e2e8f0] transition-colors font-medium">
              18. Enlaces y Verificación PLACSP
            </a>
            <a href="#vigilancia-datos" className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors font-bold">
              19. Contratos en Curso y Datos Abiertos (V2)
            </a>
          </div>
        </div>
      </div>

      {/* SECCIÓN 1: FUENTE Y ACTUALIZACIÓN */}
      <section id="fuente-y-actualizacion" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
            <Database className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            1. Fuente Oficial y Frecuencia de Actualización
          </h2>
        </div>

        <div className="mint-card p-6 space-y-4">
          <p className="text-sm leading-relaxed text-slate-700">
            LicitAlcázar opera bajo un principio rector inquebrantable: <strong>la Plataforma de Contratación del Sector Público (PLACSP) es la única fuente de verdad</strong>. Todos los contratos, importes, adjudicatarios y resoluciones provienen de los canales oficiales de datos abiertos del Ministerio de Hacienda de España.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#0d9373]" />
                ¿Desde qué fuentes se obtienen los datos?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Los datos se descargan de los feeds sindicados normalizados bajo el estándar europeo <strong>CODICE (Componentes y Documentos para la Contratación Electrónica)</strong>:
              </p>
              <ul className="text-xs text-slate-600 list-disc list-inside space-y-1">
                <li>Feed oficial Atom de licitaciones de perfiles de contratante (contratos mayores).</li>
                <li>Feed oficial de contratos menores publicados por las administraciones públicas.</li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-[#2563eb]" />
                ¿Por qué NO se extraen datos directamente de las webs municipales?
              </h3>
              <ul className="text-xs text-slate-600 space-y-1.5">
                <li>
                  <strong>Prevención de alteraciones:</strong> Los portales locales suelen publicar borradores provisionales o anuncios que sufren modificaciones posteriores sin trazabilidad.
                </li>
                <li>
                  <strong>Trazabilidad jurídica:</strong> Cada expediente en PLACSP cuenta con firma electrónica, identificador canónico legal y fecha fehaciente de registro.
                </li>
                <li>
                  <strong>Completitud de recursos:</strong> PLACSP refleja resoluciones oficiales, recursos ante el TACRC y modificaciones formales que los portales locales frecuentemente omiten.
                </li>
              </ul>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#eff6ff] border border-[#bfdbfe] text-xs text-[#1e40af] space-y-1.5">
            <span className="font-bold block">Frecuencia de sincronización:</span>
            <p className="leading-relaxed">
              El sistema ejecuta un proceso automatizado de ingesta incremental (script de sincronización) que consulta y descarga periódicamente las nuevas licitaciones y contratos menores del ejercicio en curso volcados por los órganos de contratación de Alcázar en la plataforma estatal.
            </p>
          </div>
        </div>
      </section>

      {/* SECCIÓN 2: COBERTURA TEMPORAL */}
      <section id="cobertura-temporal" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
            <Calendar className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            2. Cobertura Temporal y Calidad Histórica del Dato
          </h2>
        </div>

        <div className="mint-card p-6 space-y-4">
          <p className="text-sm leading-relaxed text-slate-700">
            Para interpretar los análisis históricos con honestidad intelectual y rigor estadístico, es imprescindible distinguir dos etapas temporales bien diferenciadas:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-[#d1fae5] bg-[#ecfdf5]/60 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0d9373] font-mono block">
                Cobertura según Registros Oficiales
              </span>
              <h3 className="font-bold text-sm text-slate-900">Desde marzo de 2018 hasta la actualidad (LCSP)</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Con la entrada en vigor de la <strong>Ley 9/2017 de Contratos del Sector Público (LCSP)</strong> el 9 de marzo de 2018, la publicación telemática en la PLACSP en esquemas estructurados CODICE pasó a ser preceptiva para todos los entes locales. LicitAlcázar ofrece <strong>cobertura completa según los registros PLACSP incluidos en nuestra extracción desde 2018</strong> para los 5 entes del sector público municipal. Por rigor epistemológico, se distingue entre: 1) los <em>registros formalmente disponibles en PLACSP</em>; 2) los <em>datos efectivamente capturados</em> en las extracciones del perfil; y 3) la <em>cobertura temporal</em>, sin presumir la inexistencia de contratación no volcada a la plataforma estatal por los cauces obligatorios.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-[#fed7aa] bg-[#fff7ed] space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#ea580c] font-mono block">
                Archivo Histórico Pre-LCSP
              </span>
              <h3 className="font-bold text-sm text-slate-900">Periodo 2013 – febrero de 2018</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Bajo el anterior <em>TRLCSP de 2011</em>, los ayuntamientos alojaban sus licitaciones en perfiles municipales propios en PDF o anuncios escaneados en el BOP de Ciudad Real, sin APIs públicas ni esquemas abiertos normalizados. La plataforma estatal PLACSP no era vinculante para contratos menores locales. Por rigor metodológico y para evitar sesgos, LicitAlcázar documenta esta limitación estructural en lugar de extrapolar estimaciones artificiales no verificables.
              </p>
            </div>
          </div>

          {/* Subapartado: Explicación técnica de la serie 2018-2019 */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-[#0d9373]" />
              <span>¿Por qué en 2018 (116 contratos) y 2019 (122 contratos) hay significativamente menos expedientes que en años posteriores (~300/año)?</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              La evolución temporal no refleja un cambio drástico en el ritmo de contratación municipal, sino <strong>tres factores de implantación técnica y normativa en la plataforma estatal PLACSP</strong>:
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse border border-slate-200 bg-white rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 border-r border-slate-200">Organismo / Entidad</th>
                    <th className="p-2.5 border-r border-slate-200">Primer contrato en PLACSP</th>
                    <th className="p-2.5 border-r border-slate-200">Contratos 2018–2019</th>
                    <th className="p-2.5">Causa técnica del volumen inicial</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-600">
                  <tr>
                    <td className="p-2.5 font-semibold text-slate-800 border-r border-slate-200">Ayuntamiento de Alcázar</td>
                    <td className="p-2.5 font-mono border-r border-slate-200">17 de abril de 2018</td>
                    <td className="p-2.5 font-mono border-r border-slate-200">197 (93 en 2018 + 104 en 2019)</td>
                    <td className="p-2.5">Arranque de la LCSP 9/2017 (marzo 2018). Integración progresiva de los contratos menores mediante gestores electrónicos municipales.</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold text-slate-800 border-r border-slate-200">Aguas de Alcázar</td>
                    <td className="p-2.5 font-mono border-r border-slate-200">28 de marzo de 2022</td>
                    <td className="p-2.5 font-mono border-r border-slate-200">0 (sin registros 2018–2021)</td>
                    <td className="p-2.5">Empresa mixta de aguas. No habilitó su perfil de contratante en PLACSP hasta marzo de 2022 (previamente tramitaba en portal propio).</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold text-slate-800 border-r border-slate-200">Patronato Municipal de Cultura</td>
                    <td className="p-2.5 font-mono border-r border-slate-200">Agosto de 2018</td>
                    <td className="p-2.5 font-mono border-r border-slate-200">2 (1 en 2018 + 1 en 2019)</td>
                    <td className="p-2.5">Inicialmente solo publicaba contratos mayores. A partir de 2020-2021 integró el volcado masivo de contratos menores artísticos y eventos (~60-80/año).</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold text-slate-800 border-r border-slate-200">Mancomunidad COMSERMANCHA</td>
                    <td className="p-2.5 font-mono border-r border-slate-200">20 de septiembre de 2018</td>
                    <td className="p-2.5 font-mono border-r border-slate-200">33 (19 en 2018 + 14 en 2019)</td>
                    <td className="p-2.5">Entidad supramunicipal (21 municipios). Adaptación paulatina a PLACSP iniciada a finales del ejercicio 2018.</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold text-slate-800 border-r border-slate-200">Instituto Municipal de Deportes</td>
                    <td className="p-2.5 font-mono border-r border-slate-200">Agosto de 2018</td>
                    <td className="p-2.5 font-mono border-r border-slate-200">6 (3 en 2018 + 3 en 2019)</td>
                    <td className="p-2.5">Contratación habitualmente centralizada a través del propio Ayuntamiento de Alcázar.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Subapartado: Fuentes Institucionales Complementarias (JCCM y Diputación) */}
          <div className="pt-4 border-t border-[#e2e8f0] space-y-3">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Info className="h-4 w-4 text-[#2563eb]" />
              <span>Contratos de la Junta (JCCM) y Diputación ejecutados en Alcázar de San Juan</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Otras administraciones territoriales adjudican obras y servicios ejecutados íntegramente dentro del término de Alcázar de San Juan (por ejemplo, el mantenimiento del <strong>Hospital General La Mancha Centro</strong> a través del SESCAM, centros educativos comarcales o la red de carreteras provinciales como la CR-1222).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-lg bg-[#f8fafb] border border-[#e2e8f0] space-y-1">
                <strong className="text-slate-800 block font-bold">Portal de Datos Abiertos JCCM</strong>
                <p className="text-slate-600">
                  Explorados los volcados del portal <code>datosabiertos.castillalamancha.es</code> para contratos menores y mayores de Sanidad, Educación y Fomento con destino territorial en Alcázar.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-[#f8fafb] border border-[#e2e8f0] space-y-1">
                <strong className="text-slate-800 block font-bold">Diputación Provincial de Ciudad Real</strong>
                <p className="text-slate-600">
                  Consultado el portal de transparencia (<code>transparencia.dipucr.es</code>) para planes de obras municipales (POM) e infraestructuras viarias.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#eff6ff] border border-[#bfdbfe] text-xs text-[#1e40af] space-y-1">
              <strong className="block font-bold">Control Antiduplicidad y Marcador de Origen:</strong>
              <p className="leading-relaxed">
                Para no alterar las estadísticas del presupuesto estrictamente municipal de Alcázar de San Juan, los contratos procedentes de la JCCM o Diputación se procesan con <strong>marcador de origen explícito</strong> (<code>origenFuente</code>) y se someten a una regla de deduplicación (mismo código de expediente o coincidencia de NIF + importe exacto + similitud de objeto &ge; 35%) para impedir el doble cómputo de inversiones cofinanciadas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 3: TRATAMIENTO DE COMSEMANCHA */}
      <section id="comsermancha" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#fef3c7] text-[#d97706] border border-[#fde68a]">
            <Building2 className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            3. Tratamiento de Comsermancha y Ámbitos de Contratación
          </h2>
        </div>

        <div className="mint-card p-6 space-y-4">
          <div className="p-4 rounded-xl bg-[#fffbeb] border border-[#fef3c7] text-[#92400e] text-xs leading-relaxed">
            <strong>Aviso de relevancia presupuestaria:</strong> La Mancomunidad de Servicios Comsermancha tiene su sede institucional en Alcázar de San Juan (NIF P1300024E), pero presta servicio mancomunado a <strong>21 municipios</strong> de las provincias de Ciudad Real, Toledo y Cuenca. Sus expedientes de gestión de residuos y maquinaria (que superan los 14 millones de euros) <strong>no constituyen gasto exclusivo del Ayuntamiento ni de la ciudadanía de Alcázar</strong>.
          </div>

          <p className="text-sm leading-relaxed text-slate-700">
            Para evitar distorsionar los agregados del gasto municipal y las comparativas de coste por habitante, LicitAlcázar clasifica cada contrato en dos ámbitos nítidos:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-1.5">
              <span className="font-mono text-xs font-bold text-[#0d9373]">Directa Municipal</span>
              <p className="text-xs text-slate-600 leading-relaxed">
                Contratos licitados y financiados directamente por el Ayuntamiento de Alcázar de San Juan y sus organismos autónomos o sociedades mercantiles dependientes: Aguas de Alcázar, Patronato Municipal de Cultura e Instituto Municipal de Deportes (IMD).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-1.5">
              <span className="font-mono text-xs font-bold text-[#d97706]">Indirecta (Mancomunidad)</span>
              <p className="text-xs text-slate-600 leading-relaxed">
                Expedientes tramitados por la Mancomunidad de Servicios Comsermancha, cuyo coste es sufragado de forma mancomunada por los 21 municipios asociados. El explorador de licitaciones permite filtrar o aislar ambos ámbitos en todo momento.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 4: CRITERIO DE OFERTA ÚNICA */}
      <section id="oferta-unica" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#fee2e2] text-[#dc2626] border border-[#fecaca]">
            <UserX className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            4. Qué cuenta exactamente como «Oferta Única»
          </h2>
        </div>

        <div className="mint-card p-6 space-y-4">
          <p className="text-sm leading-relaxed text-slate-700">
            El indicador de <strong>Oferta Única</strong> es uno de los termómetros más estandarizados a nivel internacional por la <strong>Comisión Europea</strong> y la <strong>OCDE</strong> para medir el nivel de concurrencia y competitividad en las licitaciones públicas.
          </p>

          <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-2">
            <span className="font-mono text-xs font-bold text-slate-800 uppercase tracking-wider block">
              Fórmula de identificación exacta:
            </span>
            <div className="p-3 bg-white rounded-lg border border-[#e2e8f0] font-mono text-xs text-slate-800">
              Procedimiento ≠ &apos;Contrato menor&apos; &nbsp;AND&nbsp; num_ofertas = 1
            </div>
          </div>

          <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
            <h4 className="font-bold text-slate-800 text-sm">Criterios de inclusión y exclusión:</h4>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Procedimientos evaluados:</strong> Procedimiento Abierto, Abierto Simplificado, Negociado con publicidad, Diálogo competitivo o contratos basados en Acuerdos Marco o Sistemas Dinámicos de Adquisición. En todos ellos la ley exige publicidad y concurrencia.
              </li>
              <li>
                <strong>Exclusión de contratos menores:</strong> Los contratos menores quedan <strong>expresamente excluidos</strong> de esta métrica. Por imperativo del art. 118 LCSP, los contratos menores son de adjudicación directa y carecen por definición de mesa de contratación o licitación concurrencial pública.
              </li>
              <li>
                <strong>¿Qué riesgos señala un alto porcentaje de licitador único?</strong> Pliegos técnicos excesivamente restrictivos orientados a una empresa preconcebida (*trajes a medida*), plazos de presentación muy ajustados que desincentivan a competidores externos o ausencia de lotización en grandes contratos.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* SECCIÓN 5: TRATAMIENTO DE LAS UTE */}
      <section id="utes" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
            <FolderGit2 className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            5. Cómo se tratan las UTE (Uniones Temporales de Empresas)
          </h2>
        </div>

        <div className="mint-card p-6 space-y-4">
          <p className="text-sm leading-relaxed text-slate-700">
            Una <strong>Unión Temporal de Empresas (UTE)</strong> es una figura asociativa transitoria regulada por la Ley 18/1982 que permite a dos o más empresas unirse para ejecutar conjuntamente una obra, servicio o suministro público, compartiendo solvencia técnica y económica.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-2">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Identificación y Cómputo</h4>
              <p className="text-slate-600 leading-relaxed">
                Las UTE disponen de un NIF específico (habitualmente con letra inicial <strong>U</strong>) y personalidad jurídica propia frente a la administración contratante. En LicitAlcázar se computan y perfilan como un adjudicatario independiente, preservando la identidad formal que consta en la resolución de adjudicación.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-2">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Limitación Metodológica Documentada</h4>
              <p className="text-slate-600 leading-relaxed">
                Los volcados sindicados de la PLACSP no desglosan de forma sistemática el porcentaje de participación ni los CIFs individuales de cada empresa socia de la UTE en los campos estructurados. Por rigor analítico, no se descomponen artificialmente los importes entre sus matrices para evitar imputaciones arbitrarias.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 6: TRATAMIENTO DE LOS LOTES Y ART. 99 LCSP */}
      <section id="division-lotes" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#ecfdf5] text-[#0d9373] border border-[#a7f3d0]">
            <Layers className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            6. División en Lotes y Acceso de PYMEs (Art. 99 LCSP)
          </h2>
        </div>

        <div className="mint-card p-6 sm:p-8 space-y-6">
          <p className="text-sm leading-relaxed text-slate-700">
            El <strong>artículo 99 de la Ley 9/2017 (LCSP)</strong> consagra como principio rector de la contratación pública la <strong>regla general de la división en lotes</strong>. Su objetivo es democratizar el acceso a las licitaciones públicas, permitiendo que el tejido empresarial local y las pequeñas y medianas empresas (PYMEs) de Alcázar de San Juan puedan competir en igualdad de condiciones frente a grandes conglomerados.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">1. Obligación de Justificación Expresa</strong>
              <p className="text-slate-600 leading-relaxed">
                El art. 99.3 de la LCSP establece que cuando el órgano de contratación decida no dividir el contrato en lotes, <em>«deberá justificar debidamente en el expediente los motivos»</em> (riesgo técnico de ejecución, desproporción económica o dificultad grave de coordinación).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">2. Detección Algorítmica y Tramos</strong>
              <p className="text-slate-600 leading-relaxed">
                El sistema audita los pliegos y títulos contractuales para identificar licitaciones divididas en lotes frente a adjudicaciones en lote único. Se clasifica el gasto en 5 tramos (Megacontratos ≥500k€, Grandes ≥100k€, Medianos 40k-100k€, Pequeños y Menores).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">3. Correlación con la Concurrencia</strong>
              <p className="text-slate-600 leading-relaxed">
                Los datos demuestran empíricamente que en Alcázar la división en lotes incrementa la concurrencia media de licitadores (+14%) y <strong>reduce la tasa de oferta única en más de 10 puntos porcentuales</strong> (30.8% frente a 41.7% en lote único).
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-2 text-xs text-slate-600">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Auditoría Ciudadana de Pliegos</h4>
            <p>
              Para cada gran contrato adjudicado en lote único (&gt; 100.000 €), LicitAlcázar proporciona el enlace oficial directo a la licitación en la Plataforma de Contratación del Sector Público (PLACSP), facilitando a investigadores, concejales y ciudadanos contrastar si la <strong>Memoria Justificativa</strong> y el Pliego de Cláusulas Administrativas Particulares (PCAP) motivaron legalmente la exclusión de la división en lotes conforme exige el art. 99.3 LCSP.
            </p>
          </div>
        </div>
      </section>

      {/* SECCIÓN 7: INDICADORES DE AUDITORÍA Y BANDERAS ROJAS */}
      <section id="banderas-rojas" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#fffbeb] text-[#d97706] border border-[#fde68a]">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            7. Los 5 Indicadores de Auditoría y Banderas Rojas
          </h2>
        </div>

        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-700">
            Una <em>Bandera Roja (Red Flag)</em> no constituye por sí sola una prueba de ilegalidad ni una acusación de corrupción, sino un <strong>indicador estadístico de riesgo o anomalía</strong> que aconseja una revisión pormenorizada por parte de los servicios de intervención, medios de comunicación o ciudadanía activa.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Indicador 1 */}
            <div className="mint-card p-5 space-y-2 border-l-4 border-l-[#d97706]">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#b45309] uppercase tracking-wider font-mono">Indicador 1</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#fffbeb] text-[#b45309] border border-[#fef3c7]">Falta de Concurrencia</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900">Oferta Única en Contratos Mayores</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Contratos de licitación abierta o competitiva donde sólo concurrió un único licitador. Mide el riesgo de pliegos dirigidos o falta de concurrencia efectiva en el mercado local.
              </p>
              <div className="font-mono text-[11px] bg-[#f8fafb] p-2 rounded border border-[#e2e8f0] text-slate-700">
                procedimiento ≠ &apos;Contrato menor&apos; ∧ num_ofertas = 1
              </div>
            </div>

            {/* Indicador 2 */}
            <div className="mint-card p-5 space-y-2 border-l-4 border-l-[#0d9373]">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#0d9373] uppercase tracking-wider font-mono">Indicador 2</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">0% Rebaja</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900">Al Máximo Presupuestado (Baja Cero)</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Expedientes donde la adjudicación coincide con el 100% del Presupuesto Base de Licitación (PBL) con margen de redondeo (±0,05 €), sin reducción económica respecto al importe licitado. Constituye una señal analítica puramente descriptiva y preventiva que refleja ausencia de baja en el precio adjudicado, sin que de ello pueda deducirse por sí solo connivencia o conocimiento previo de concurrencia.
              </p>
              <div className="font-mono text-[11px] bg-[#f8fafb] p-2 rounded border border-[#e2e8f0] text-slate-700">
                |importe_adjudicacion - importe_sin_iva| ≤ 0.05 ∧ importe_sin_iva &gt; 0
              </div>
            </div>

            {/* Indicador 3 */}
            <div className="mint-card p-5 space-y-2 border-l-4 border-l-[#ea580c]">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#ea580c] uppercase tracking-wider font-mono">Indicador 3</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#fff7ed] text-[#c2410c] border border-[#ffedd5]">Proximidad Umbral</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900">Contratos Menores al 90% del Límite Legal</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Contratos menores adjudicados mediante el régimen de contratación menor conforme al art. 118 de la LCSP por importes superiores a 13.500 € en servicios/suministros (límite 15.000 €) o 36.000 € en obras (límite 40.000 €), situándose en el segmento superior del umbral del precepto.
              </p>
              <div className="font-mono text-[11px] bg-[#f8fafb] p-2 rounded border border-[#e2e8f0] text-slate-700">
                (tipo = &apos;Obras&apos; ∧ imp ≥ 36.000€) ∨ (tipo ≠ &apos;Obras&apos; ∧ imp ≥ 13.500€)
              </div>
            </div>

            {/* Indicador 4 */}
            <div className="mint-card p-5 space-y-2 border-l-4 border-l-[#2563eb]">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#2563eb] uppercase tracking-wider font-mono">Indicador 4</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">Control Reforzado</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900">Financiación con Fondos Europeos (PRTR / UE)</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Contratos cofinanciados mediante fondos NextGenerationEU, FEDER o Fondo Social Europeo. Requieren controles adicionales antifraude y análisis de titularidad real (herramienta MINERVA).
              </p>
              <div className="font-mono text-[11px] bg-[#f8fafb] p-2 rounded border border-[#e2e8f0] text-slate-700">
                financiacion_ue IN (&apos;1&apos;, &apos;EU&apos;, &apos;FEDER&apos;, &apos;PRTR&apos;)
              </div>
            </div>

            {/* Indicador 5 */}
            <div id="baja-temeraria" className="mint-card p-6 space-y-4 border-l-4 border-l-[#dc2626] scroll-mt-20">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#991b1b] uppercase tracking-wider font-mono">Indicador 5 (Económico / Riesgo)</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]">Art. 100, 101 y 149 LCSP</span>
              </div>
              <h3 className="font-bold text-base text-slate-900">Descuento Significativo o Baja Acusada respecto al PBL (Art. 149 LCSP)</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Este indicador detecta expedientes adjudicados con una rebaja económica sustancial respecto al presupuesto de licitación. El porcentaje calculado constituye una <strong>señal analítica de revisión preventiva</strong> y no una declaración jurídica de anormalidad ni temeridad. La presunción formal de anormalidad solo puede determinarse conforme a los parámetros fijados en los pliegos y requiere un trámite preceptivo de audiencia y justificación contradictoria ante la mesa de contratación (art. 149.4 LCSP).
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                <div className="p-3.5 bg-[#f8fafc] rounded-xl border border-[#e2e8f0] space-y-1.5">
                  <span className="font-bold text-slate-800 block text-xs">Distinción Preceptiva: PBL vs. VEC</span>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    • <strong>PBL (Art. 100 LCSP):</strong> Presupuesto Base de Licitación. Límite máximo de gasto para el periodo inicial ordinario del contrato (<code className="font-mono text-[10px]">&lt;cac:BudgetAmount&gt;</code>). Es el único denominador válido para medir la baja licitada.<br/>
                    • <strong>VEC (Art. 101 LCSP):</strong> Valor Estimado del Contrato. Engloba el periodo inicial más todas las prórrogas previstas y modificaciones contractuales (hasta un 20%). Nunca incluye IVA. Utilizar el VEC en el denominador generaría porcentajes de baja artificialmente inflados en contratos plurianuales.
                  </p>
                </div>
                <div className="p-3.5 bg-[#f8fafc] rounded-xl border border-[#e2e8f0] space-y-1.5">
                  <span className="font-bold text-slate-800 block text-xs">Régimen de Concurrencia (Art. 149 LCSP y Art. 85 RGLCAP)</span>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    • <strong>1 único licitador (N=1):</strong> No existe media de ofertas sobre la que calcular desviación estándar. Rige el umbral fijado en el PCAP o subsidiariamente el 25% del art. 85 RGLCAP sobre el PBL.<br/>
                    • <strong>2 o más licitadores (N≥2):</strong> La presunción legal de anormalidad se mide contra la media de ofertas válidas. Dado que los feeds sindicados de PLACSP <em>solo publican la oferta ganadora</em>, el sistema emite una señal preventiva sobre PBL y advierte de la limitación de la fuente de datos.
                  </p>
                </div>
              </div>

              <div className="font-mono text-[11px] bg-[#f8fafb] p-3 rounded-lg border border-[#e2e8f0] text-slate-700 space-y-1">
                <div><strong>Fórmula canónica:</strong> Baja = (PBL_sin_IVA - Adjudicación_sin_IVA) / PBL_sin_IVA</div>
                <div className="text-[10px] text-slate-500 font-sans">
                  * Ambas magnitudes son homogéneas y corresponden a la Base Imponible sin impuestos. Se detectan y segregan expedientes con tarifas o precios unitarios (ej. combustible o reparaciones) para evitar distorsiones del 99%.
                </div>
              </div>
            </div>
          </div>

          {/* Indicador 6: Acumulación de Menores */}
          <div className="mint-card p-6 space-y-3 border-l-4 border-l-[#dc2626] bg-[#fef2f2]/20">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-[#991b1b] uppercase tracking-wider font-mono">Indicador 6 (Agregado)</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#fee2e2] text-[#991b1b] border border-[#fecaca]">
                Art. 99.2 y 118 LCSP
              </span>
            </div>
            <h3 className="font-bold text-base text-slate-900">Acumulación de Contratos Menores y Posibles Coincidencias</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Se ha detectado una acumulación de contratos menores con elementos coincidentes durante el periodo analizado. La coincidencia temporal, la similitud del objeto, la repetición del proveedor o la suma de importes son parámetros de priorización analítica. No permiten concluir por sí solos que exista fraccionamiento indebido. La valoración exige examinar la unidad funcional, la previsibilidad de la necesidad, la planificación, la homogeneidad de las prestaciones y el expediente completo.
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              El sistema clasifica las acumulaciones en <strong>4 niveles diferenciados</strong>: 🟢 <em>Recurrente periódico</em> (renovación anual ordinaria), 🟡 <em>Recurrente mediante contratos menores</em> (atención reiterada de necesidades estructurales según doctrina OIReScon), 🟠 <em>Patrón que merece revisión</em> (prestaciones heterogéneas o vinculadas a eventos) y 🔴 <em>Posible fraccionamiento</em> (ventana corta y alta similitud funcional que exige revisión prioritaria).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="p-3 bg-white rounded-lg border border-[#e2e8f0]">
                <strong className="block text-slate-800 mb-1">Ventana Deslizante 365d</strong>
                <span className="text-slate-600">Suma móvil backwards de 365 días con fusión de ventanas candidatas solapadas en tramos disjuntos.</span>
              </div>
              <div className="p-3 bg-white rounded-lg border border-[#e2e8f0]">
                <strong className="block text-slate-800 mb-1">Similitud Textual Jaccard</strong>
                <span className="text-slate-600">Análisis léxico de coincidencia de objeto sin stopwords y refuerzo por coincidencia de código CPV.</span>
              </div>
              <div className="p-3 bg-white rounded-lg border border-[#e2e8f0]">
                <strong className="block text-slate-800 mb-1">Resolución Corporativa</strong>
                <span className="text-slate-600">Agrupación por identidad corporativa canónica (resolución de cambios de marca o razón social, grupos filiales y CIFs).</span>
              </div>
            </div>
          </div>

          {/* Indicador 6: Concentración de Mercado (HHI & CR5) */}
          <div id="hhi" className="mint-card p-6 space-y-3 border-l-4 border-l-[#2563eb] bg-[#eff6ff]/20 scroll-mt-20">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-[#1d4ed8] uppercase tracking-wider font-mono">Indicador 7 (Económico / Competencia)</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#dbeafe] text-[#1e40af] border border-[#bfdbfe]">
                CNMC / Antitrust
              </span>
            </div>
            <h3 className="font-bold text-base text-slate-900">Concentración de Mercado: Índice Herfindahl-Hirschman (HHI) y Ratios CR5 / CR1</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Mide el nivel de dispersión o concentración matemática de las adjudicaciones públicas entre el tejido empresarial contratista. Permite evaluar objetivamente la distribución de las cuotas de mercado adjudicadas. Los índices HHI y ratios CR1/CR5 reflejan exclusivamente la distribución cuantitativa del volumen contratado y no constituyen prueba de dependencia económica, favoritismo, colusión ni falta de competencia efectiva.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="p-3 bg-white rounded-lg border border-[#e2e8f0]">
                <strong className="block text-slate-800 mb-1">Índice HHI (0 a 10.000)</strong>
                <span className="text-slate-600">Suma de los cuadrados de las cuotas porcentuales de cada empresa (HHI = Σ s_i²). &lt;1.500: Mercado competitivo; 1.500–2.500: Concentración moderada; &gt;2.500: Alta concentración.</span>
              </div>
              <div className="p-3 bg-white rounded-lg border border-[#e2e8f0]">
                <strong className="block text-slate-800 mb-1">Ratio CR5 y CR1</strong>
                <span className="text-slate-600">Porcentaje del volumen económico total absorbido por las 5 mayores empresas adjudicatarias (CR5) y por el contratista líder (CR1).</span>
              </div>
              <div className="p-3 bg-white rounded-lg border border-[#e2e8f0]">
                <strong className="block text-slate-800 mb-1">Identidad Canónica</strong>
                <span className="text-slate-600">Agrupación por grupo empresarial y entidad canónica para no diluir la concentración cuando una misma matriz licita a través de múltiples filiales.</span>
              </div>
            </div>

            {/* Delimitación metodológica de consolidación corporativa */}
            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2 text-xs text-slate-600">
              <strong className="text-slate-900 block font-bold text-xs uppercase tracking-wider">
                Delimitación: Consolidación Analítica vs. Identidad Jurídica Individual
              </strong>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div className="p-3 bg-[#f8fafb] rounded-lg border border-slate-200 space-y-1">
                  <span className="font-bold text-slate-800 block">Indicadores que consolidan por grupo / identidad canónica:</span>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                    <li>Concentración HHI y ratios CR1 / CR5 (para evitar diluir cuotas de mercado entre filiales).</li>
                    <li>Evolución anual de proveedores únicos (dinamismo empresarial deduplicado).</li>
                    <li>Señales de acumulación en contratos menores entre entidades vinculadas.</li>
                    <li>Mapa de relaciones corporativas y grupos empresariales.</li>
                  </ul>
                </div>
                <div className="p-3 bg-[#f8fafb] rounded-lg border border-slate-200 space-y-1">
                  <span className="font-bold text-slate-800 block">Registros que preservan estrictamente la identidad jurídica individual:</span>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                    <li><strong>Número de ofertas (<code className="font-mono">num_ofertas</code>):</strong> no se modifica jamás el cómputo oficial de proposiciones admitidas por la mesa.</li>
                    <li><strong>Identidad del adjudicatario:</strong> se conserva la razón social y CIF individual adjudicado en la resolución oficial.</li>
                    <li><strong>Expedientes administrativos:</strong> cada expediente conserva su numeración, procedimiento y objeto oficial.</li>
                    <li><strong>Contratos individuales:</strong> no se fusionan contratos ni se transfieren obligaciones entre personas jurídicas distintas.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 8: GUÍA CIUDADANA DE FACTORES Y SEÑALES DE AUDITORÍA */}
      <section id="factores-auditoria" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            8. Guía Ciudadana de Factores y Criterios del Centro de Análisis de Riesgos (V2)
          </h2>
        </div>

        <div className="mint-card p-6 sm:p-8 space-y-6">
          {/* Declaración de Principios */}
          <div className="p-4 rounded-xl bg-[#fffbeb] border border-[#fde68a] flex items-start gap-3">
            <Scale className="h-5 w-5 text-[#b45309] shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 leading-relaxed space-y-1">
              <p>
                <strong>Principio de Neutralidad y Verificabilidad:</strong> Las señales analíticas de LicitAlcázar no constituyen denuncias, conclusiones jurídicas ni presunciones de delito. Son <strong>alertas analíticas cuantitativas</strong> precalculadas a partir de los datos oficiales publicados en la Plataforma de Contratación del Sector Público (PLACSP).
              </p>
              <p className="text-slate-600">
                Su única finalidad es facilitar el análisis cívico democrático y periodístico, señalando expedientes donde concurren patrones que la Ley 9/2017 (LCSP) recomienda vigilar con especial atención.
              </p>
            </div>
          </div>

          {/* El Paradigma de las 5 Dimensiones Analíticas */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[#0d9373]" />
              <h3 className="font-bold text-sm text-slate-900">
                El Paradigma de las 5 Dimensiones para el Escrutinio Cívico
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Para garantizar el máximo rigor, evitar acusaciones precipitadas y dotar al ciudadano de herramientas efectivas de contraste, cada señal auditada articula 5 dimensiones analíticas:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <span className="font-bold text-slate-900 block font-mono text-[11px]">1. Señal Factual</span>
                <span className="text-slate-600 text-[11px]">Datos descriptivos verificables del expediente o grupo de contratos.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <span className="font-bold text-slate-900 block font-mono text-[11px]">2. Causa Normativa</span>
                <span className="text-slate-600 text-[11px]">Por qué aparece la señal en base a los criterios de la LCSP (Arts. 118, 149 o concurrencia).</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <span className="font-bold text-slate-900 block font-mono text-[11px]">3. Factores Ponderados</span>
                <span className="text-slate-600 text-[11px]">Pesos y contribuciones cuantitativas que elevan la puntuación de riesgo.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <span className="font-bold text-slate-900 block font-mono text-[11px]">4. Explicaciones Alternativas</span>
                <span className="text-slate-600 text-[11px]">Hipótesis legítimas de gestión ordinaria (renovación periódica, eventos singulares, etc.).</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <span className="font-bold text-slate-900 block font-mono text-[11px]">5. Cotejo Documental</span>
                <span className="text-slate-600 text-[11px]">Documentos oficiales concretos que un investigador debe revisar en PLACSP.</span>
              </div>
            </div>
          </div>

          {/* Escala Metodológica de Severidad 1-3 / 3-5 / >5 */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-slate-100 text-slate-800 font-mono text-xs font-bold">Escala 1–10</span>
              <h3 className="font-bold text-sm text-slate-900">
                Gradación de Severidad Analítica (Escala 1–3 / 3–5 / &gt;5)
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              La severidad de cada señal se califica mediante una puntuación cuantitativa en escala de 1 a 10 dividida en tres intervalos de actuación. Es fundamental delimitar con rigor tres planos epistemológicos: <strong>1) Certeza del dato estructurado</strong> (fidelidad objetiva a los datos oficiales extraídos de PLACSP); <strong>2) Intensidad de la señal</strong> (puntuación cuantitativa basada en factores empíricos ponderados); y <strong>3) Certeza jurídica de la interpretación</strong> (inexistente per se a nivel algorítmico: una señal no constituye prueba jurídica de infracción ni prejuzga responsabilidades, cuya determinación corresponde exclusivamente a los órganos de control y tribunales tras el correspondiente procedimiento contradictorio).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-900">Escala 1–3 · Informativa</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">Leve</span>
                </div>
                <p className="text-blue-950/80 text-[11px] leading-relaxed">
                  Concentraciones moderadas de gasto, importes reducidos o avisos preventivos contextuales sin impacto presupuestario severo.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900">Escala 3–5 · Severidad Media</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">Moderada</span>
                </div>
                <p className="text-amber-950/80 text-[11px] leading-relaxed">
                  Concursos con Oferta Única, renovaciones anuales ordinarias (ej. seguros o análisis sanitarios de agua), proyectos concurrentes con destinatarios diferenciados (ej. actividades infantiles vs juveniles) o bajas de precio moderadas.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-rose-900">Escala &gt;5 · Severidad Alta</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">Prioritaria</span>
                </div>
                <p className="text-rose-950/80 text-[11px] leading-relaxed">
                  Indicios prioritarios de revisión documental: acumulación temporal muy estrecha (&lt; 120 días) con identidad de objeto sin que la justificación conste en los datos publicados en PLACSP y exceso sustancial sobre el umbral analítico de referencia (cifra tomada del art. 118.1 LCSP), o descuentos muy acusados sobre el PBL (&gt; 40%). Esta gradación indica prioridad de examen técnico, no probabilidad de infracción.
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-slate-700">
            Cada alerta desplegada en el <Link href="/auditoria" className="font-semibold text-[#0d9373] underline">Centro de Análisis</Link> detalla los factores ponderados que explican de forma transparente por qué se ha activado la señal. A continuación se describe el significado ciudadano de cada criterio:
          </p>

          {/* 1. Menores Relacionados */}
          <div className="p-5 rounded-xl bg-white border border-purple-200 space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-purple-50 text-purple-700 font-mono text-xs font-bold">Tipología 1</span>
              <h3 className="font-bold text-sm text-slate-900">
                Acumulación de Contratos Menores (Riesgo de Fraccionamiento · Arts. 118 y 99.2 LCSP)
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              La ley permite tramitar contratos de menor cuantía mediante el régimen de contrato menor (art. 118 LCSP) siempre que su valor estimado individual sea inferior a <strong>15.000 €</strong> en suministros y servicios o <strong>40.000 €</strong> en obras (art. 118.1 LCSP). El art. 118.2 LCSP exige que el órgano de contratación justifique la necesidad de la contratación y que no se está alterando el objeto del contrato para eludir las cuantías regladas. A su vez, el art. 99.2 LCSP prohíbe de forma taxativa el fraccionamiento: <em>«No podrá fraccionarse un contrato con la finalidad de disminuir la cuantía del mismo y eludir así los requisitos de publicidad o los relativos al procedimiento de adjudicación que correspondan.»</em>
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Tras la reforma operada por la Disposición final primera del Real Decreto-ley 3/2020, la LCSP no impone un límite legal acumulado por proveedor. En consecuencia, la agregación de importes por proveedor y periodo que calcula LicitAlcázar no es una infracción tipificada en la ley, sino un <strong>umbral analítico propio del portal</strong> concebido para priorizar la revisión documental de posibles unidades funcionales no integradas.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block">Mismo proveedor contratado repetidamente</span>
                <span className="text-slate-600 leading-relaxed">Se detecta que el mismo CIF o grupo empresarial recibe múltiples contratos directos del mismo departamento o entidad municipal.</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block">Trabajos muy similares entre sí (coincidencia %)</span>
                <span className="text-slate-600 leading-relaxed">El texto del objeto de los contratos describe tareas casi idénticas o continuadas, lo que indica que responden a una misma unidad funcional.</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block">Supera el umbral analítico de referencia (+X%)</span>
                <span className="text-slate-600 leading-relaxed">La suma de contratos relacionados supera el umbral analítico de referencia (cifra tomada del art. 118.1 LCSP) y requiere comprobar si las prestaciones forman una unidad funcional y si el objeto pudo haberse alterado o fraccionado.</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block">Firmados en un periodo muy concentrado</span>
                <span className="text-slate-600 leading-relaxed">Las adjudicaciones se suceden en una ventana de pocos meses o semanas en lugar de planificar una contratación anual abierta.</span>
              </div>
            </div>
          </div>

          {/* 2. Oferta Única */}
          <div className="p-5 rounded-xl bg-white border border-blue-200 space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-blue-50 text-blue-700 font-mono text-xs font-bold">Tipología 2</span>
              <h3 className="font-bold text-sm text-slate-900">
                Licitador Único en Procedimientos Competitivos (Sin Concurrencia de Ofertas)
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              La contratación pública busca que las empresas compitan en precio y calidad. Cuando un concurso competitivo formal se resuelve con un solo participante, no concurre comparación económica ni técnica entre varias propuestas en el expediente.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block">Procedimiento competitivo sin alternativa de oferta</span>
                <span className="text-slate-600 leading-relaxed">El procedimiento era formalmente abierto y competitivo, pero no concurrieron otras propuestas admisibles a disputar el contrato.</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block">Solo se presentó 1 oferta</span>
                <span className="text-slate-600 leading-relaxed">Dato oficial registrado en PLACSP (num_ofertas = 1). El procedimiento concluyó con una única oferta admisible registrada, por lo que no existió comparación competitiva entre varias ofertas en ese expediente.</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1 sm:col-span-2">
                <span className="font-bold text-slate-900 block">Más de 100.000 € de dinero público en juego</span>
                <span className="text-slate-600 leading-relaxed">En contratos de cuantía elevada, la falta de pugna comercial tiene un impacto presupuestario especialmente severo para las arcas municipales.</span>
              </div>
            </div>
          </div>

          {/* 3. Bajas Acusadas */}
          <div className="p-5 rounded-xl bg-white border border-emerald-200 space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-emerald-50 text-emerald-700 font-mono text-xs font-bold">Tipología 3</span>
              <h3 className="font-bold text-sm text-slate-900">
                Bajas Acusadas y Descuentos Significativos (Art. 149 LCSP)
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Un contratista puede ofertar una rebaja notable para ganar un concurso. Cuando el descuento es muy elevado respecto al Presupuesto Base de Licitación (PBL), se activa una señal analítica preventiva. Conviene revisar en el expediente si la mesa de contratación aplicó los mecanismos previstos para ofertas anormalmente bajas conforme al art. 149 LCSP para comprobar la viabilidad técnica, económica y laboral de la proposición.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block">Rebaja acusada del precio (-X% s/PBL)</span>
                <span className="text-slate-600 leading-relaxed">El precio final adjudicado es significativamente inferior (descuento ≥ 25% o ≥ 40%) al Presupuesto Base de Licitación estimado por los servicios técnicos.</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block">Riesgo de desviaciones de plazo o solicitud de modificados</span>
                <span className="text-slate-600 leading-relaxed">Un descuento muy pronunciado respecto a las estimaciones iniciales puede conllevar dificultades operativas si los costes reales fueron subestimados, o responder legítimamente a eficiencias tecnológicas y economías de escala del licitador.</span>
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50/60 rounded-lg border border-emerald-200 text-xs space-y-2 leading-relaxed text-slate-700">
              <span className="font-bold text-emerald-900 block font-mono text-[11px] uppercase tracking-wider">
                Fórmula de normalización algorítmica del score analítico (Escala [1 - 10]):
              </span>
              <p>
                Los factores analíticos ponderados (ej: <strong>+50%</strong> de rebaja acusada, <strong>+30%</strong> por riesgo operativo/modificados y <strong>+10%</strong> por verificación de trámite) representan la intensidad cualitativa de los indicios. Esta suma se proyecta matemáticamente en la escala de severidad mediante:
              </p>
              <div className="font-mono text-[11px] bg-white p-2 rounded border border-emerald-200 text-slate-800">
                score = pct ≥ 40 ? min(9.2, 5.5 + ((pct - 40) / 20) × 2.5) : min(4.9, 3.2 + ((pct - 25) / 15) × 1.5)
              </div>
              <p className="text-[11px] text-slate-600">
                <strong>Garantía de concurrencia y no presunción de anormalidad:</strong> En expedientes con concurrencia efectiva (2 o más ofertas), la señal no presupone alteración concurrencial ni determina formalmente que la oferta sea anormal en sentido legal. Su finalidad es estrictamente preventiva para recomendar el cotejo con los umbrales específicos fijados en los pliegos y la justificación económica exigida por el art. 149 LCSP.
              </p>
            </div>
          </div>

          {/* Definiciones Metodológicas de las Fichas de Contrato */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider font-mono">
              Categorías Metodológicas de Indicios en Fichas de Alerta (Cat. A – Cat. D)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Cada alerta generada por el sistema se clasifica en una categoría epistemológica que delimita el grado de certeza del dato y el tipo de contraste requerido por el analista cívico:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block font-mono text-[11px] text-blue-700">
                  Cat. A: Dato localizado
                </span>
                <span className="text-slate-600 leading-relaxed">
                  Dato objetivo registrado de forma explícita y estructurada en PLACSP (ej. licitador único con número formal de ofertas = 1 o coincidencia de fechas de adjudicación).
                </span>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block font-mono text-[11px] text-amber-700">
                  Cat. B: Info no localizada
                </span>
                <span className="text-slate-600 leading-relaxed">
                  Información no disponible en los campos estructurados principales de PLACSP (requiere examinar documentos adjuntos, pliegos técnicos o resoluciones en PDF).
                </span>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block font-mono text-[11px] text-emerald-700">
                  Cat. C: Indicador analítico
                </span>
                <span className="text-slate-600 leading-relaxed">
                  Cálculo métrico derivado mediante algoritmos estadísticos (ej. porcentaje de baja acusada respecto al PBL o ratios de concentración de mercado). En ningún caso se califica a priori una oferta de «baja temeraria», concepto legal que compete declarar al órgano de contratación tras el trámite del art. 149 LCSP.
                </span>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block font-mono text-[11px] text-purple-700">
                  Cat. D: Requiere examinar expediente
                </span>
                <span className="text-slate-600 leading-relaxed">
                  Indicios cuantitativos acumulados (ej. contratos menores con identidad de proveedor y prestaciones afines) que no constituyen infracción per se y exigen examinar el expediente administrativo completo y los informes de necesidad (art. 118.2 LCSP) para valorar la unidad funcional.
                </span>
              </div>
            </div>
          </div>

          {/* Cronometría y Cómputo del Plazo Total Real */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider font-mono">
              Cómputo del «Plazo Total Real» y Cronometría Contractual
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              La cronometría de los contratos desplegada en las fichas individualizadas mide la duración efectiva de los procedimientos respetando la naturaleza jurídica de cada tipología:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-lg bg-white border border-slate-200 space-y-1.5">
                <span className="font-bold text-slate-900 block text-xs">
                  Contratos Mayores y Procedimientos Concurrenciales
                </span>
                <p className="text-slate-600 leading-relaxed">
                  El <strong>plazo total real</strong> de tramitación computa desde la <em>publicación del anuncio de licitación</em> en PLACSP hasta el hito final de formalización o adjudicación definitiva. Este intervalo refleja los tiempos administrativos reales de licitación, presentación de plicas y valoración de ofertas.
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-white border border-slate-200 space-y-1.5">
                <span className="font-bold text-slate-900 block text-xs">
                  Contratos Menores (Régimen Especial Arts. 118 y 63.4 LCSP)
                </span>
                <p className="text-slate-600 leading-relaxed">
                  Los contratos menores son de adjudicación directa y carecen legalmente de anuncio previo de licitación. Su publicidad en PLACSP se realiza trimestralmente <em>a posteriori</em> conforme al art. 63.4 LCSP. Por ello, el <strong>plazo total real</strong> de ejecución computa desde la <em>fecha de adjudicación o encargo formal</em> hasta la fecha prevista de finalización o recepción, sin tomar como inicio la fecha de publicación del anuncio en la plataforma.
                </p>
              </div>
            </div>
          </div>

          {/* Distribución Temporal por Fases */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider font-mono">
              Distribución Temporal por Fases del Ciclo de Vida
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              El visor de ciclo de vida desglosa gráficamente la evolución temporal del contrato a través de sus hitos esenciales:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block font-mono text-[11px]">1. Convocatoria</span>
                <span className="text-slate-600 text-[11px] leading-relaxed">Publicación inicial de pliegos y apertura del plazo de presentación.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block font-mono text-[11px]">2. Evaluación</span>
                <span className="text-slate-600 text-[11px] leading-relaxed">Cierre de ofertas, apertura de sobres técnicos y baremación por la mesa.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block font-mono text-[11px]">3. Adjudicación</span>
                <span className="text-slate-600 text-[11px] leading-relaxed">Resolución o Decreto del órgano de contratación seleccionando al licitador.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block font-mono text-[11px]">4. Formalización / Pub.</span>
                <span className="text-slate-600 text-[11px] leading-relaxed">Firma del contrato o publicación trimestral ex post en menores (art. 63.4 LCSP).</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 9: ESTADO DEL FLUJO Y RE-ADJUDICACIONES */}
      <section id="flujo" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
            <GitBranch className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            9. Estado del Flujo de Contratación y Monitorización de Re-adjudicaciones
          </h2>
        </div>

        <div className="mint-card p-6 sm:p-8 space-y-6">
          <p className="text-sm leading-relaxed text-slate-700">
            El análisis del ciclo de vida de las licitaciones permite evaluar la eficacia de la planificación contractual municipal, identificando pliegos que resultan fallidos, procedimientos sin concurrencia y la posterior adjudicación de contratos que inicialmente quedaron desiertos.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#16a34a] flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Adjudicadas / Formalizadas
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                Expedientes que completaron satisfactoriamente la baremación y cuentan con contratista adjudicatario formalmente registrado con NIF y resolución en PLACSP.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#d97706] flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                Desiertas / Sin Adjudicar
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                Procedimientos formalmente declarados desiertos o con estado resuelto pero con 0 ofertas o sin adjudicatario registrado. Refleja presupuestos o condiciones de pliegos que el mercado consideró inviables o poco atractivos.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#2563eb] flex items-center gap-1.5">
                <Info className="h-4 w-4" />
                En Licitación / En Curso
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                Contratos publicados en plazo de presentación de ofertas o actualmente en mesa de contratación para valoración de ofertas técnicas y económicas.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#dc2626] flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                Anuladas / Desistidas
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                Expedientes revocados por el órgano de contratación por vicios de tramitación, desistimiento justificado o modificaciones sustanciales sobrevenidas antes de la adjudicación.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] space-y-3">
            <h3 className="font-bold text-sm text-[#1e293b] flex items-center gap-2">
              <span>Heurística de Emparejamiento: Desierta → Re-adjudicación Posterior</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              El artículo 168.a).1º de la Ley de Contratos del Sector Público (LCSP) contempla la posibilidad tasada de que el órgano de contratación acuda al <em>procedimiento negociado sin publicidad</em> cuando una licitación previa abierta o restringida haya quedado desierta o no se hayan presentado ofertas o solicitudes admisibles, siempre que concurran todos los supuestos y requisitos legales aplicables y no se modifiquen sustancialmente las condiciones iniciales del contrato. Esta vía no opera de forma automática ni general: ante una licitación desierta, la administración puede optar legítimamente por convocar una nueva licitación abierta ordinaria (por ejemplo, actualizando precios o condiciones de mercado), modificar los pliegos o desistir. Para auditar empíricamente las secuencias de relicitación con neutralidad y rigor:
            </p>
            <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-5">
              <li><strong>Mismo Órgano de Contratación:</strong> Ambos expedientes deben pertenecer a la misma entidad pública (Ayuntamiento, PMC, Comsermancha o Aguas de Alcázar).</li>
              <li><strong>Secuencia Temporal Estricta:</strong> La adjudicación posterior debe ser de fecha igual o posterior al expediente desierto.</li>
              <li><strong>Similitud Textual y Códigos de Expediente:</strong> Se emparejan expedientes mediante coincidencia de número base o mediante similitud léxica Jaccard (&gt;50% sobre palabras significativas del objeto tras normalización y filtrado de palabras vacías).</li>
              <li><strong>Comparativa Económica y Temporal:</strong> Se calculan automáticamente los días transcurridos entre la declaración de desierta y la adjudicación, así como la variación porcentual del importe final respecto al presupuesto inicial.</li>
            </ul>
          </div>

          <div className="p-5 rounded-xl bg-[#ecfdf5] border border-[#d1fae5] space-y-3">
            <h3 className="font-bold text-sm text-[#1e293b] flex items-center gap-2">
              <span>Sentido económico de la licitación</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Para evitar mezclar gasto municipal con operaciones en las que el Ayuntamiento actúa como receptor de un ingreso, LicitAlcázar mantiene separadas la <strong>naturaleza económica</strong> y la <strong>naturaleza jurídica del contrato</strong>. La clasificación económica se deriva de los datos estructurados y reglas documentadas del proyecto; no es un campo oficial adicional publicado por PLACSP.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-lg bg-white border border-[#d1fae5] space-y-1.5">
                <strong className="text-slate-900 block">Gasto municipal</strong>
                <p className="text-slate-600 leading-relaxed">
                  Corresponde a expedientes clasificados como <code>gasto</code>: la cifra publicada se interpreta como una obligación económica del Ayuntamiento hacia el adjudicatario o proveedor.
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-white border border-[#d1fae5] space-y-1.5">
                <strong className="text-slate-900 block">Ingreso municipal</strong>
                <p className="text-slate-600 leading-relaxed">
                  Corresponde a expedientes clasificados como <code>ingreso</code>: incluye operaciones patrimoniales y cánones/ingresos identificados por las reglas de clasificación.
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-white border border-[#d1fae5] space-y-1.5">
                <strong className="text-slate-900 block">Sin flujo municipal directo determinado</strong>
                <p className="text-slate-600 leading-relaxed">
                  Corresponde a <code>concesion</code> en el modelo económico actual. No se presume que el Ayuntamiento pague ni que el concesionario pague al Ayuntamiento sin evidencia estructurada suficiente.
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-white border border-[#d1fae5] space-y-1.5">
                <strong className="text-slate-900 block">Sentido económico no determinado</strong>
                <p className="text-slate-600 leading-relaxed">
                  Se utiliza cuando la clasificación económica es <code>sin_clasificar</code>. El sistema no convierte una ausencia de información en una afirmación sobre quién paga.
                </p>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              En la interfaz, este sentido aparece como un filtro independiente de “Tipo de contrato”. El objetivo es que un usuario pueda aislar el gasto municipal o los ingresos sin confundirlos con la clasificación jurídica del expediente. Las concesiones permanecen separadas porque su estructura económica puede requerir revisión documental específica.
            </p>
          </div>
        </div>
      </section>

      {/* SECCIÓN 10: CONTRATOS VIVOS Y VENCIMIENTOS */}
      <section id="contratos-vivos" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
            <CalendarClock className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            10. Contratos Vivos, Fechas de Fin y Régimen de Prórrogas (Art. 29 LCSP)
          </h2>
        </div>

        <div className="mint-card p-6 sm:p-8 space-y-6">
          <p className="text-sm leading-relaxed text-slate-700">
            La monitorización de contratos vivos permite conocer en tiempo real qué prestaciones públicas continúan activas en Alcázar de San Juan, quién es el contratista a cargo y cuándo concluye su periodo de vigencia.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">1. Cálculo del Vencimiento Inicial</strong>
              <p className="text-slate-600 leading-relaxed">
                Se toma la fecha formal de adjudicación (o formalización/publicación) y se suma la duración estipulada en los pliegos (años, meses o días) codificada en los datos oficiales de PLACSP.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">2. Régimen de Prórrogas (Art. 29 LCSP)</strong>
              <p className="text-slate-600 leading-relaxed">
                Los contratos de servicios y suministros de carácter periódico son legalmente prorrogables hasta un máximo general de 5 años. Los contratos menores no admiten prórroga (art. 29.8 LCSP).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">3. Aviso de Frescura de Datos</strong>
              <p className="text-slate-600 leading-relaxed">
                En el ámbito municipal, las prórrogas aprobadas por Decreto o acuerdo plenario pueden tardar semanas en publicarse formalmente en PLACSP, por lo que las fechas representan el calendario contractual mínimo consolidado.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 11: DISTRIBUCIÓN DE TIEMPOS Y OUTLIERS */}
      <section id="distribucion-tiempos" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
            <Clock className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            11. Tiempos de Tramitación: Mediana, Percentiles y Corrección de Sesgo
          </h2>
        </div>

        <div className="mint-card p-6 sm:p-8 space-y-6">
          <p className="text-sm leading-relaxed text-slate-700">
            En la contratación pública, el tiempo transcurrido entre el cierre del plazo de presentación de ofertas y el decreto de adjudicación no sigue una distribución gaussiana simétrica, sino una <strong>distribución fuertemente asimétrica con cola pesada a la derecha</strong> (<em>right-skewed</em>).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">1. El Problema de la Media</strong>
              <p className="text-slate-600 leading-relaxed">
                La media aritmética es altamente vulnerable a contratos de tramitación extraordinaria (por ejemplo, recursos especiales o pliegos complejos de limpieza de 329 días), distorsionando al alza la percepción general de lentitud administrativa.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">2. Mediana (P50) e Intervalo IQR</strong>
              <p className="text-slate-600 leading-relaxed">
                La mediana divide a la mitad el volumen de licitaciones: el 50% de los expedientes se adjudica en ese plazo o menos. El rango intercuartílico (P25 a P75) acota el comportamiento de la mitad central típica de contratos.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">3. Regla de Outliers de Tukey</strong>
              <p className="text-slate-600 leading-relaxed">
                Se catalogan estadísticamente como valores atípicos (outliers) aquellos expedientes cuya duración excede el umbral de <code>P75 + 1.5 &times; IQR</code>, permitiendo aislar con precisión qué licitaciones sufrieron demoras extraordinarias.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 12: EVOLUCIÓN TEMPORAL Y COBERTURA REGULATORIA */}
      <section id="evolucion-temporal" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
            <TrendingUp className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            12. Series Temporales, Comparador Multiserie y Cobertura Regulatoria
          </h2>
        </div>

        <div className="mint-card p-6 sm:p-8 space-y-6">
          <p className="text-sm leading-relaxed text-slate-700">
            La foto fija de un ejercicio fiscal puede estar condicionada por contratos plurianuales extraordinarios o coyunturas presupuestarias puntuales. Para evaluar la calidad democrática y la eficiencia del gasto público municipal, <strong>la tendencia interanual es el elemento probatorio central</strong>.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">1. Cobertura Plena vs Parcial</strong>
              <p className="text-slate-600 leading-relaxed">
                Con la entrada en vigor de la <strong>Ley 9/2017 de Contratos del Sector Público (LCSP) en marzo de 2018</strong>, la publicación de todas las licitaciones (incluyendo contratos menores) en la Plataforma de Contratación del Sector Público se convirtió en preceptiva y vinculante. Por ello, las series a partir de 2018 presentan <strong>cobertura completa según los registros PLACSP incluidos en nuestra extracción desde 2018</strong>. Los registros previos a 2018 corresponden a publicaciones voluntarias o históricas parciales.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">2. Asociación Descriptiva Competencia-Ahorro</strong>
              <p className="text-slate-600 leading-relaxed">
                El comparador multiserie permite contrastar el <strong>% de oferta única</strong> con la <strong>baja media (%)</strong>. Se trata de una asociación descriptiva observada en los datos entre concurrencia y rebaja media sobre el presupuesto base de licitación. <em>Correlación no implica causalidad</em>: las variaciones en los porcentajes de baja pueden obedecer a fluctuaciones sectoriales, inflación de costes o heterogeneidad en los tipos de contrato, sin que quepa atribuir mecánicamente causalidad exclusiva al nivel de concurrencia.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">3. Dinamismo de Proveedores</strong>
              <p className="text-slate-600 leading-relaxed">
                Al calcular el <strong>número de proveedores distintos</strong> mediante el motor de resolución canónica (que consolida NIFs, denominaciones con erratas y absorbe filiales de grupos corporativos y UTEs), la serie refleja fielmente si el ecosistema empresarial se diversifica o se concentra en los mismos actores año tras año.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 13: RENOVACIÓN DEL MERCADO Y SEÑAL DE BAJA ROTACIÓN */}
      <section id="renovacion-mercado" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
            <Users className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            13. Renovación de Proveedores, Primer Contrato y Señal de Baja Rotación
          </h2>
        </div>

        <div className="mint-card p-6 sm:p-8 space-y-6">
          <p className="text-sm leading-relaxed text-slate-700">
            Un mercado de contratación municipal abierto se caracteriza por una entrada regular de nuevos operadores económicos (pymes y autónomos) que compiten con las firmas consolidadas. Cuando la renovación cae y el gasto se concentra entre empresas recurrentes, se reduce la pluralidad de opciones y conviene evaluar posibles barreras de acceso.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">1. Detección del Primer Contrato</strong>
              <p className="text-slate-600 leading-relaxed">
                Mediante particionado analítico cronológico sobre el conjunto histórico municipal (desde marzo de 2018 con la entrada de la LCSP), se identifica de forma inequívoca el <strong>primer contrato adjudicado</strong> a cada empresa (por identificador canónico o NIF), evitando duplicidades por errores tipográficos o filiales corporativas.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">2. Tasa de Rotación Anual</strong>
              <p className="text-slate-600 leading-relaxed">
                Se define como el porcentaje de proveedores activos en el ejercicio que nunca antes habían recibido una adjudicación municipal:
                <span className="block my-2 p-2 rounded bg-[#f1f5f9] font-mono text-[11px] text-slate-800 text-center border border-[#e2e8f0]">
                  Tasa de Rotación = (Nuevos Entrantes / Total Proveedores Activos) × 100
                </span>
                Asimismo, se analiza la <strong>cuota de gasto</strong> captada por los debutantes frente a las firmas recurrentes.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">3. Señal de 🟠 Baja Renovación de Proveedores</strong>
              <p className="text-slate-600 leading-relaxed">
                El sistema emite una <strong>señal analítica de baja renovación de proveedores</strong> conforme a los <strong>umbrales analíticos propios de LicitAlcázar</strong> (no establecidos por ley, sino como criterio estadístico de escrutinio preventivo), cuando en un ejercicio posterior al año base (2018):
                <br />
                • La tasa de rotación desciende por debajo del <strong>50%</strong> (umbral analítico propio de LicitAlcázar).
                <br />
                • Las empresas veteranas absorben más del <strong>75% del presupuesto licitado</strong> (umbral analítico propio de LicitAlcázar).
                <br />
                En Alcázar de San Juan, este patrón se manifiesta a partir de 2023, donde la tasa de rotación se situó en el 47.5% y las veteranas absorbieron el 85.7% de los fondos.
              </p>
              <div className="p-2 rounded bg-[#fffbeb] border border-[#fde68a] text-[10px] text-[#92400e] leading-tight">
                <strong>Aviso metodológico:</strong> Este indicador describe un patrón de concentración y no demuestra por sí solo falta de competencia, favoritismo, dependencia económica o irregularidad.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 14: ADJUDICACIONES VS. CALENDARIO ELECTORAL */}
      <section id="calendario-electoral" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]">
            <Vote className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            14. Adjudicaciones vs. Calendario Electoral (Ciclo Político del Presupuesto)
          </h2>
        </div>

        <div className="mint-card p-6 sm:p-8 space-y-6">
          <p className="text-sm leading-relaxed text-slate-700">
            La literatura económica y los informes de fiscalización de los tribunales de cuentas identifican con frecuencia el <strong>ciclo político-presupuestario</strong>: un repunte anormal en el volumen y formalización de contratos públicos en las semanas y meses previos a unas elecciones locales, con especial intensidad en inversiones visibles a pie de calle.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">1. Definición de la Ventana Preelectoral</strong>
              <p className="text-slate-600 leading-relaxed">
                Se fija una ventana de <strong>90 días naturales</strong> previos a la votación de las elecciones municipales:
                <br />
                • <strong>Municipales 2019</strong>: 26 de febrero a 26 de mayo de 2019.
                <br />
                • <strong>Municipales 2023</strong>: 28 de febrero a 28 de mayo de 2023.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">2. Grupo de Control No Electoral</strong>
              <p className="text-slate-600 leading-relaxed">
                Para evitar el sesgo estacional de la primavera (cierre del primer trimestre contable), las ventanas electorales se comparan rigurosamente frente a la <strong>media histórica del mismo trimestre (marzo–mayo) en años no electorales</strong> (2020, 2021, 2022, 2024 y 2025).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">3. Inversiones Urbanas Visibles</strong>
              <p className="text-slate-600 leading-relaxed">
                Se cuantifica el peso de los contratos de <strong>obras y servicios a pie de calle</strong> (pavimentaciones, reformas de plazas, parques, alumbrado y eventos) frente a compras ordinarias de suministros o gestión interna, permitiendo al ciudadano auditar las licitaciones aceleradas antes de acudir a las urnas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 15: MODIFICADOS, SOBRECOSTES Y RÉGIMEN ART. 204/205 LCSP */}
      <section id="modificados-sobrecostes" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#fff1f2] text-[#e11d48] border border-[#fecdd3]">
            <Scale className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            15. Modificados de Obra, Sobrecostes y Régimen de los Artículos 204 y 205 LCSP
          </h2>
        </div>

        <div className="mint-card p-6 sm:p-8 space-y-6 bg-[#f8fafb]">
          <p className="text-sm leading-relaxed text-slate-700">
            La Ley de Contratos del Sector Público (LCSP) establece reglas estrictas para limitar las desviaciones económicas sobrevenidas en las obras e inversiones públicas, erradicando la práctica histórica de licitar a precios artificially bajos para posteriormente inflar el coste final mediante modificados continuados.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2 border-l-4 border-l-[#0d9373]">
              <strong className="text-slate-900 block font-bold text-sm">
                Art. 204 LCSP: Modificaciones Previstas
              </strong>
              <p className="text-slate-600 leading-relaxed">
                Admisibles únicamente si el Pliego de Cláusulas Administrativas Particulares (PCAP) fijó expresamente su posibilidad con cláusulas claras, precisas e inequívocas. Límite cuantitativo inquebrantable: <strong>máximo un 20% del precio primitivo</strong> sin que quepa alterar la naturaleza global del contrato.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2 border-l-4 border-l-[#b91c1c]">
              <strong className="text-slate-900 block font-bold text-sm">
                Art. 205 LCSP: Modificaciones No Previstas (Régimen de Modificaciones Sustanciales)
              </strong>
              <p className="text-slate-600 leading-relaxed">
                Reservadas a supuestos tasados e imprevisibles (prestaciones adicionales devenidas necesarias o circunstancias sobrevenidas imprevisibles para una administración diligente). Conforme a los arts. 205 y 211.1.g) de la LCSP, las modificaciones no previstas no pueden alterar las condiciones esenciales de la licitación ni superar los límites cuantitativos legales (entre ellos, el umbral sustancial del 20% del precio inicial). Si fuese necesario ejecutar la prestación de forma distinta y dicha alteración supera los límites del art. 205, la modificación resulta jurídicamente improcedente en el contrato en vigor; en tal supuesto, la administración debe optar entre continuar la ejecución en los términos originariamente pactados o, si resulta imprescindible para satisfacer el interés público alterar sustancialmente la prestación, acordar la resolución contractual (art. 211.1.g LCSP) y celebrar un nuevo contrato en concurrencia pública.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
            <strong className="text-slate-900 block font-bold text-sm">
              Cadenas de Modificados y Relicitaciones en Cascada
            </strong>
            <p className="text-slate-600 leading-relaxed text-xs">
              LicitAlcázar identifica modificaciones contractuales a partir de los registros publicados en la base de datos. Las variaciones económicas se calculan sobre el precio inicial del contrato y se muestran como señales cuantitativas. Las relaciones entre expedientes solo se presentan cuando pueden reconstruirse a partir de datos almacenados; no se incorporan expedientes, importes, empresas ni proyectos específicos mediante código.
            </p>
          </div>
        </div>
      </section>

      {/* SECCIÓN 16: DURACIÓN REGISTRADA VS. PREVISTA (ART. 29 Y 195 LCSP) */}
      <section id="duracion-efectiva" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
            <Hourglass className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            16. Duración Registrada vs. Prevista: Prórrogas y Registro PLACSP
          </h2>
        </div>

        <div className="mint-card p-6 sm:p-8 space-y-6 bg-[#f8fafb]">
          <p className="text-sm leading-relaxed text-slate-700">
            La duración estipulada en los pliegos administrativos es vinculante para las partes. LicitAlcázar analiza la duración registrada de cada contrato contrastando el plazo previsto inicialmente con la fecha del último evento oficial (formalización, prórroga, adenda o liquidación) publicado en la Plataforma de Contratación del Sector Público. Dado que esta métrica refleja la cronología de publicaciones telemáticas y no una acreditación de la ejecución material en obra, se califica con rigor como «duración registrada vs. prevista», advirtiendo que los desfases extremos pueden obedecer a actualizaciones administrativas tardías del perfil de contratante.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2 border-l-4 border-l-[#2563eb]">
              <strong className="text-slate-900 block font-bold text-sm">
                Art. 29 LCSP: Límite Legal de 5 Años en Servicios y Suministros
              </strong>
              <p className="text-slate-600 leading-relaxed">
                El artículo 29.4 de la LCSP prohíbe taxativamente que los contratos de servicios y suministros de tracto sucesivo superen los <strong>5 años de duración total</strong>, sumando el periodo inicial y todas las prórrogas posibles. Las prórrogas deben acordarse expresamente por el órgano de contratación y comunicarse al contratista con al menos 2 meses de antelación.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2 border-l-4 border-l-[#e11d48]">
              <strong className="text-slate-900 block font-bold text-sm">
                Art. 195 LCSP: Plazos de Ejecución en Obras y Penalidades
              </strong>
              <p className="text-slate-600 leading-relaxed">
                En contratos de obras, la demora culpable faculta a la corporación para resolver el contrato o repercutir penalidades económicas diarias de 0,60 € por cada 1.000 € del precio. Cualquier prórroga no culpable exige expediente motivado por causas sobrevenidas o fuerza mayor ajena al contratista.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 17: EMPRESAS LOCALES VS. EXTERNAS Y CRITERIO BORME */}
      <section id="empresas-locales" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
            <MapPin className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            17. Empresas Locales vs. Externas: Criterio Registral BORME y Código Postal
          </h2>
        </div>

        <div className="mint-card p-6 sm:p-8 space-y-6 bg-[#f8fafb]">
          <p className="text-sm leading-relaxed text-slate-700">
            Analizar la distribución territorial según el domicilio registral de los adjudicatarios permite evaluar la participación de contratistas domiciliados en Alcázar de San Juan y su comarca frente a empresas domiciliadas en otras provincias o comunidades autónomas, sin que el domicilio social deba confundirse con el lugar de ejecución material de las prestaciones ni con el destino económico último de los fondos.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2 border-l-4 border-l-[#0d9373]">
              <strong className="text-slate-900 block font-bold text-sm">
                Clasificación por Prefijo CIF Registral
              </strong>
              <p className="text-slate-600 leading-relaxed">
                El Registro Mercantil asigna a cada sociedad un CIF cuyos dígitos 2º y 3º indican la provincia fundacional: <strong>13 (Ciudad Real)</strong>, <strong>02, 16, 19 y 45 (Castilla-La Mancha)</strong>, y el resto para las demás comunidades autónomas (28 Madrid, 08 Barcelona, 46 Valencia). Se identifican con precisión las sociedades domiciliadas en Alcázar de San Juan (CP 13600).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2 border-l-4 border-l-[#3b82f6]">
              <strong className="text-slate-900 block font-bold text-sm">
                Autónomos y Comercios Locales
              </strong>
              <p className="text-slate-600 leading-relaxed">
                Los contratos menores y suministros adjudicados a personas físicas (NIF de 8 cifras y letra) se adscriben al ámbito local de Alcázar de San Juan, reflejando las compras de proximidad a fontaneros, cerrajeros, electricistas, academias e imprentas de la ciudad.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 18: VERIFICABILIDAD TOTAL Y ENLACES AL EXPEDIENTE */}
      <section id="verificabilidad" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
            <ExternalLink className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            18. Verificabilidad Total: Cómo contrastar cualquier dato en PLACSP
          </h2>
        </div>

        <div className="mint-card p-6 sm:p-8 space-y-5 bg-[#f8fafb]">
          <p className="text-sm leading-relaxed text-slate-700">
            En LicitAlcázar no tienes por qué creer en nuestra palabra: <strong>cada ficha técnica incluye el enlace directo al expediente original de la Plataforma de Contratación del Sector Público</strong>.
          </p>

          <div className="space-y-3 text-xs text-slate-600">
            <h4 className="font-bold text-slate-900 text-sm">¿Qué puedes verificar en el expediente original de PLACSP?</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-lg bg-white border border-[#e2e8f0] space-y-1">
                <strong className="text-slate-800 block">1. Pliegos y Anexos</strong>
                <p>Descargar los Pliegos de Cláusulas Administrativas (PCAP) y de Prescripciones Técnicas (PPT) firmados electrónicamente.</p>
              </div>
              <div className="p-3.5 rounded-lg bg-white border border-[#e2e8f0] space-y-1">
                <strong className="text-slate-800 block">2. Actas de la Mesa</strong>
                <p>Comprobar las ofertas presentadas, exclusiones técnicas, valoraciones de las proposiciones e informes de justificación de ofertas con baja elevada (art. 149 LCSP).</p>
              </div>
              <div className="p-3.5 rounded-lg bg-white border border-[#e2e8f0] space-y-1">
                <strong className="text-slate-800 block">3. Decretos y Adjudicación</strong>
                <p>Consultar la resolución formal de adjudicación, formalización de contrato e informes de necesidad del órgano competente.</p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#e2e8f0] flex flex-wrap items-center gap-4">
            <Link
              href="/licitaciones"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0d9373] hover:bg-[#0b7c61] font-semibold text-xs sm:text-sm text-white shadow-xs transition-all"
            >
              <span>Explorar Licitaciones y contrastar fichas</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/analisis"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white hover:bg-slate-50 font-semibold text-xs sm:text-sm text-slate-700 border border-[#cbd5e1] transition-all"
            >
              <span>Ver Panel de Auditoría y Métricas</span>
            </Link>
          </div>
        </div>
      </section>

      {/* SECCIÓN 19: VIGILANCIA ACTIVA Y REUTILIZACIÓN DE DATOS ABIERTOS (V2) */}
      <section id="vigilancia-datos" className="space-y-4 scroll-mt-20">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-emerald-50 text-[#0d9373] border border-emerald-200">
            <CalendarClock className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            19. Contratos en Curso y Reutilización de Datos Abiertos (V2)
          </h2>
        </div>

        <div className="mint-card p-6 sm:p-8 space-y-6">
          <p className="text-sm leading-relaxed text-slate-700">
            El módulo de <strong>Contratos en Curso</strong> (<Link href="/seguimiento" className="font-semibold text-[#0d9373] underline">/seguimiento</Link>) y el <strong>Portal de Datos Abiertos</strong> (<Link href="/datos" className="font-semibold text-[#0d9373] underline">/datos</Link>) proporcionan herramientas de supervisión prospectiva y soberanía de datos tanto a la ciudadanía como a empresas locales, medios de comunicación y entidades de control cívico.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">
                1. Convocatorias Abiertas y Cómputo de Días Hábiles
              </strong>
              <p className="text-slate-600 leading-relaxed">
                Se detectan los anuncios en estado <em>Publicada</em> y <em>En evaluación</em> en PLACSP. Para cada convocatoria en plazo, se calcula tanto el número de días naturales restantes como los <strong>días hábiles reales</strong> (excluyendo sábados y domingos) hasta la fecha y hora límite de presentación de plicas.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">
                2. Régimen de Prórrogas y Prevención de Caducidad (Art. 29 LCSP)
              </strong>
              <p className="text-slate-600 leading-relaxed">
                Se monitoriza la fecha de fin estimada de todos los contratos vigentes. Los contratos de servicios y suministros recurrentes se identifican como legalmente prorrogables (con un tope legal ordinario de 5 años), mientras que obras y contratos menores se marcan como de ejecución única no prorrogable (art. 29.8 LCSP).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">
                3. Estándar de Exportación CSV con BOM UTF-8 (RFC 4180)
              </strong>
              <p className="text-slate-600 leading-relaxed">
                Todas las descargas en CSV incorporan el Byte Order Mark UTF-8 (<code>\uFEFF</code>) y escapado RFC 4180, garantizando apertura limpia de tildes, eñes y el símbolo del euro (€) en Microsoft Excel, LibreOffice Calc y Google Sheets sin necesidad de asistentes de importación de texto.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-2">
              <strong className="text-slate-900 block font-bold text-sm">
                4. API Abierta de Exportación y Reutilización Cívica
              </strong>
              <p className="text-slate-600 leading-relaxed">
                Cualquier persona puede descargar o programar la ingesta periódica de los catálogos en JSON o CSV llamando a los endpoints públicos <code>/api/export/licitaciones</code>, <code>/api/export/empresas</code> y <code>/api/export/alertas</code> conforme a la Ley 37/2007 de reutilización de datos del sector público.
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-[#e2e8f0] flex flex-wrap items-center gap-4">
            <Link
              href="/seguimiento"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0d9373] hover:bg-[#0b7c61] font-semibold text-xs sm:text-sm text-white shadow-xs transition-all"
            >
              <CalendarClock className="h-4 w-4" />
              <span>Ver Contratos en Curso</span>
            </Link>
            <Link
              href="/datos"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white hover:bg-slate-50 font-semibold text-xs sm:text-sm text-slate-700 border border-[#cbd5e1] transition-all"
            >
              <Database className="h-4 w-4 text-slate-500" />
              <span>Ver Portal de Datos Abiertos</span>
            </Link>
          </div>
        </div>
      </section>

      {/* SECCIÓN 20: FUENTES Y METODOLOGÍA JURÍDICA */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5 text-[#1e293b]">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
            <Scale className="h-5 w-5" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            20. Fuentes y Metodología Jurídica
          </h2>
        </div>

        <div className="mint-card p-6 sm:p-8 space-y-6">
          <p className="text-sm leading-relaxed text-slate-700">
            Para garantizar el rigor técnico-jurídico y la trazabilidad de los análisis, LicitAlcázar establece una rigurosa jerarquía de fuentes normativas, distinguiendo entre preceptos sustantivos vinculantes, directrices de remisión de información, criterios orientativos de fiscalización y normas no aplicables o derogadas.
          </p>

          {/* Jerarquía de Normas Aplicables */}
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider font-mono">
              20.1. Jerarquía de Normas Aplicables
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2 border-l-4 border-l-blue-600">
                <strong className="text-slate-900 block font-bold text-sm">
                  1. Ley 9/2017 de Contratos del Sector Público (LCSP)
                </strong>
                <p className="text-slate-600 leading-relaxed">
                  <strong>Norma central y sustantiva principal.</strong> Fundamento regulador de todos los indicadores de contratación municipal: necesidad e idoneidad (art. 28), límites del contrato menor (art. 118), prohibición de fraccionamiento indebido (art. 99.2), ofertas anormalmente bajas (art. 149), criterios de adjudicación (art. 145), prórrogas (art. 29) y modificados (arts. 204 y 205).
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2 border-l-4 border-l-indigo-600">
                <strong className="text-slate-900 block font-bold text-sm">
                  2. Ley 39/2015 del Procedimiento Administrativo Común (LPACAP)
                </strong>
                <p className="text-slate-600 leading-relaxed">
                  <strong>Marco procedimental y de garantías.</strong> Referencia para plazos administrativos, eficacia de resoluciones y formalización de actos. LicitAlcázar no ejerce potestades de revisión de oficio ni anulatorias, correspondiendo estas exclusivamente a la propia administración y a los órganos judiciales.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2 border-l-4 border-l-emerald-600">
                <strong className="text-slate-900 block font-bold text-sm">
                  3. Reglamento (UE) 2016/679 (RGPD) y Ley Orgánica 3/2018 (LOPDGDD)
                </strong>
                <p className="text-slate-600 leading-relaxed">
                  <strong>Protección de datos y minimización proactiva.</strong> El tratamiento de datos en LicitAlcázar se fundamenta en el interés legítimo en la transparencia y el escrutinio cívico de la contratación municipal (art. 6.1.f RGPD), ponderado estrictamente con los derechos de las personas físicas adjudicatarias. Conforme al principio de minimización (art. 5.1.c RGPD), se aplican las siguientes medidas técnicas:
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-600 text-[11px] ml-1">
                  <li>
                    <strong>Identificadores sintéticos opacos:</strong> En rutas web (<code>/empresas/[id]</code>), enlaces internos, sitemap y exportaciones CSV, los NIF/NIE de personas físicas se sustituyen por un identificador seudonimizado determinista con sal secreta (<code>pf-[hash]</code>), evitando la verificación inversa por fuerza bruta o tablas arcoíris.
                  </li>
                  <li>
                    <strong>Redirección permanente y no indexación:</strong> Los accesos mediante DNI, NIE o nombre en bruto emiten una redirección HTTP 301 (<code>permanentRedirect</code>) al identificador canónico opaco y se marcan con directiva <code>noindex</code> para motores de búsqueda.
                  </li>
                  <li>
                    <strong>Enmascaramiento visual:</strong> En tablas y fichas públicas se enmascaran los dígitos intermedios conservando cuatro caracteres, adoptando por analogía técnica el criterio de la Disposición adicional séptima de la LOPDGDD, sin que constituya habilitación legal directa para este tratamiento.
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2 border-l-4 border-l-amber-600">
                <strong className="text-slate-900 block font-bold text-sm">
                  4. Ley 37/2007 de Reutilización de la Información del Sector Público
                </strong>
                <p className="text-slate-600 leading-relaxed">
                  <strong>Reutilización de datos abiertos.</strong> Regula el acceso y reutilización de información pública, sin constituir una autorización automática para el tratamiento de datos personales ni sustituir las exigencias del RGPD.
                </p>
              </div>
            </div>
          </div>

          {/* Instrucciones Técnicas y Normas Sectoriales */}
          <div className="space-y-4 pt-2">
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider font-mono">
              20.2. Instrucciones Técnicas, Control Interno y Normas Sectoriales
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <strong className="text-slate-900 block font-bold text-sm">
                  Resolución de 3 de julio de 2018 (Tribunal de Cuentas)
                </strong>
                <p className="text-slate-600 leading-relaxed">
                  Instrucción técnica sobre la remisión telemática al Tribunal de Cuentas de extractos de expedientes y relaciones anuales de contratos locales. <strong>No concede habilitación alguna a observatorios cívicos o plataformas privadas</strong> ni autoriza declaraciones de ilegalidad.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <strong className="text-slate-900 block font-bold text-sm">
                  Resolución de 25 de julio de 2018 (IGAE)
                </strong>
                <p className="text-slate-600 leading-relaxed">
                  Regula exclusivamente la función interventora en régimen de requisitos básicos para la <strong>Administración General del Estado (ámbito estatal)</strong>. No es una norma municipal ni rige directamente el control interno local.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <strong className="text-slate-900 block font-bold text-sm">
                  Real Decreto 424/2017 (Control Interno Local)
                </strong>
                <p className="text-slate-600 leading-relaxed">
                  Constituye la referencia institucional del control interno de las entidades locales (función interventora y control financiero municipal), sin atribuir competencias ni funciones de fiscalización a LicitAlcázar.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <strong className="text-slate-900 block font-bold text-sm">
                  Real Decreto 817/2009 y Ley 24/2011
                </strong>
                <p className="text-slate-600 leading-relaxed">
                  El RD 817/2009 contiene disposiciones de desarrollo reglamentario con advertencia temporal y previa comprobación de vigencia tras la LCSP. La Ley 24/2011 rige exclusivamente contratos de defensa y seguridad del Estado.
                </p>
              </div>
            </div>
          </div>

          {/* Advertencias Expresas sobre Normas No Aplicables o Derogadas */}
          <div className="space-y-3 pt-2">
            <h3 className="font-bold text-sm text-rose-900 uppercase tracking-wider font-mono">
              20.3. Advertencias sobre Normas No Vigentes o Inaplicables
            </h3>

            <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200 text-xs text-rose-950 space-y-2">
              <p className="leading-relaxed">
                Para evitar confusiones doctrinales, se deja constancia expresa de que:
              </p>
              <ul className="list-disc list-inside space-y-1 text-rose-900 ml-1">
                <li>
                  <strong>Ley Orgánica 15/1999:</strong> Se encuentra <strong>derogada expresamente</strong> desde el 7 de diciembre de 2018 por la Disposición Derogatoria Única de la Ley Orgánica 3/2018 (LOPDGDD). No es legislación vigente.
                </li>
                <li>
                  <strong>Ley 7/1988 sobre VPO en Euskadi:</strong> Se encuentra <strong>derogada</strong> desde el 26 de septiembre de 2015 y carece de todo ámbito aplicativo en la contratación municipal de Castilla-La Mancha. No debe confundirse con la <em>Ley 7/1988, de 5 de abril, de Funcionamiento del Tribunal de Cuentas (LFTCu)</em>.
                </li>
                <li>
                  <strong>Ley 24/2011:</strong> Regula únicamente la contratación en los sectores de defensa y seguridad del Estado; es <strong>inaplicable</strong> a la contratación municipal ordinaria de Alcázar de San Juan.
                </li>
                <li>
                  <strong>Resolución de 28 de abril de 2014:</strong> Refleja una fiscalización parlamentaria histórica de contratos estatales del ejercicio 2008 tramitados bajo legislación derogada (TRLCSP/LCP). No constituye regla jurídica automática para contratos locales actuales.
                </li>
              </ul>
            </div>
          </div>

          {/* Régimen del Contrato Menor y Real Decreto-ley 3/2020 */}
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 space-y-2">
            <strong className="font-bold text-sm text-amber-950 block">
              20.4. Régimen del Contrato Menor y Real Decreto-ley 3/2020
            </strong>
            <p className="leading-relaxed text-amber-900">
              La Disposición final primera del Real Decreto-ley 3/2020, de 4 de febrero, reformó el art. 118 de la LCSP suprimiendo la limitación acumulada por contratista que establecía la redacción originaria de la Ley 9/2017 (antiguo art. 118.3, que exigía justificar que el contratista no había suscrito contratos menores que individual o conjuntamente superasen los umbrales).
            </p>
            <p className="leading-relaxed text-amber-900">
              Bajo el régimen consolidado vigente, la LCSP no establece ningún límite acumulado legal por proveedor. La ley define umbrales de valor estimado de aplicación individual a cada contrato menor (art. 118.1 LCSP: 40.000 € en obras y 15.000 € en suministros y servicios) y prohíbe el fraccionamiento del objeto contractual con la finalidad de eludir los requisitos de publicidad o los relativos al procedimiento de adjudicación (arts. 99.2 y 118.2 LCSP).
            </p>
            <p className="leading-relaxed text-amber-900">
              En consecuencia, la suma agregada de importes por proveedor y periodo que calcula LicitAlcázar no es una regla ni una infracción tipificada en la ley, sino una <strong>convención analítica propia del portal</strong> —de modo análogo a la convención metodológica aplicada en la Sección 13 para estimar el volumen empresarial—, concebida exclusivamente para priorizar expedientes en el escrutinio cívico y la revisión documental ciudadana.
            </p>
          </div>

          {/* STS 1119/2025 */}
          <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs text-indigo-950 space-y-2">
            <strong className="font-bold text-sm text-indigo-950 block">
              20.5. Sentencia del Tribunal Supremo núm. 1119/2025 (Caso BOSCO)
            </strong>
            <p className="leading-relaxed text-indigo-900">
              STS núm. 1119/2025, de 11 de septiembre de 2025, ECLI:ES:TS:2025:3826. Resuelve una controversia sobre el acceso a la información relativa a la aplicación administrativa BOSCO y a su código fuente.
            </p>
          </div>

          {/* Criterios Técnicos de Accesibilidad */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 space-y-2">
            <strong className="font-bold text-sm text-slate-900 block">
              20.6. Criterios Técnicos de Accesibilidad
            </strong>
            <p className="leading-relaxed text-slate-700">
              Las referencias de la LCSP a accesibilidad se circunscriben al ámbito de los medios y procedimientos de contratación pública. La plataforma adopta voluntariamente WCAG y EN 301 549 como referencias técnicas. Su aplicación directa depende de que el titular o el sitio se encuentre dentro de su ámbito subjetivo.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-4 text-xs font-semibold text-blue-700">
            <Link href="/aviso-legal" className="hover:underline">
              Consultar Aviso Legal y Términos de Uso →
            </Link>
            <Link href="/privacidad" className="hover:underline">
              Ver Política de Privacidad y RGPD →
            </Link>
            <Link href="/rectificacion" className="hover:underline">
              Canal de Rectificación →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
