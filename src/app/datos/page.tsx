import { Metadata } from 'next';
import Link from 'next/link';
import { 
  Download, 
  Database, 
  FileSpreadsheet, 
  Code, 
  Scale, 
  FileText, 
  Briefcase, 
  ShieldAlert,
  ChevronRight,
  Info,
  Rss
} from 'lucide-react';
import AmbitoSelector from '@/components/AmbitoSelector';
import { getStats } from '@/lib/db';
import { getAlertasExportData } from '@/lib/export';
import { formatNumber, formatCompactCurrency } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Portal de Datos Abiertos y Exportaciones | LicitAlcázar',
  description:
    'Descarga directa de los conjuntos de datos de licitaciones, empresas y auditoría cívica de Alcázar de San Juan en formatos abiertos CSV y JSON.',
};

interface DatosPageProps {
  searchParams: Promise<{
    ambito?: string;
  }>;
}

export default async function DatosPage({ searchParams }: DatosPageProps) {
  const params = await searchParams;
  const currentAmbito = params.ambito || 'directa';
  const effectiveAmbito = currentAmbito === 'todos' ? undefined : currentAmbito;
  const stats = getStats(undefined, effectiveAmbito);
  const totalAlertas = getAlertasExportData(effectiveAmbito).length;

  const datasets = [
    {
      id: 'licitaciones',
      title: 'Catálogo de Contratos y Licitaciones Municipales',
      description:
        'Registro íntegro de todos los expedientes de contratación tramitados por el Ayuntamiento de Alcázar de San Juan y entes asociados, extraídos de la Plataforma de Contratación del Sector Público (PLACSP).',
      registrosAprox: `${formatNumber(stats.totalLicitaciones)} expedientes`,
      periodo: '2018 – 2026',
      icon: FileText,
      color: 'emerald',
      fields: [
        'Expediente',
        'Objeto del contrato',
        'Tipo y procedimiento',
        'Estado de tramitación',
        'Órgano contratante y ámbito',
        'Adjudicatario y CIF',
        'Importes de licitación y adjudicación (sin y con IVA)',
        'Número de ofertas recibidas',
        'Fechas clave (publicación, adjudicación, formalización)',
        'Duración y código CPV',
        'Enlace oficial directo a PLACSP',
      ],
      csvUrl: `/api/export/licitaciones?format=csv&ambito=${currentAmbito}`,
      jsonUrl: `/api/export/licitaciones?format=json&ambito=${currentAmbito}`,
    },
    {
      id: 'empresas',
      title: 'Censo Consolidado de Contratistas y Grupos',
      description:
        'Base de datos unificada de adjudicatarios con normalización de razones sociales, cruce de CIF y vinculación de grupos empresariales.',
      registrosAprox: `${formatNumber(stats.totalEmpresas)} razones sociales`,
      periodo: '2018 – 2026',
      icon: Briefcase,
      color: 'blue',
      fields: [
        'Nombre comercial / Razón social',
        'CIF / NIF',
        'Volumen total adjudicado (€)',
        'Número de contratos obtenidos',
        'Primer y último contrato adjudicado',
        'Grupo empresarial matriz (si aplica)',
        'Órganos municipales contratantes',
      ],
      csvUrl: `/api/export/empresas?format=csv&ambito=${currentAmbito}`,
      jsonUrl: `/api/export/empresas?format=json&ambito=${currentAmbito}`,
    },
    {
      id: 'alertas',
      title: 'Señales y Factores del Centro de Análisis de Riesgos (V2)',
      description:
        'Conjunto estructurado de señales analíticas precomputadas por LicitAlcázar para el análisis cívico y periodístico de la contratación, con su nivel de consistencia analítica y factores ponderados.',
      registrosAprox: `${formatNumber(totalAlertas)} señales analíticas`,
      periodo: 'Algoritmo V2 (LCSP)',
      icon: ShieldAlert,
      color: 'amber',
      fields: [
        'ID único de la señal',
        'Tipología (Fraccionamiento menor, Oferta única, Bajas acusadas)',
        'Nivel de severidad (ALTA, MEDIA, INFORMATIVA)',
        'Intensidad analítica de la señal (0 a 100%)',
        'Título y descripción ciudadana',
        'Factores explicativos con su peso ponderado (+X%)',
        'Expedientes y contratos relacionados',
        'Fecha de detección',
      ],
      csvUrl: `/api/export/alertas?format=csv&ambito=${currentAmbito}`,
      jsonUrl: `/api/export/alertas?format=json&ambito=${currentAmbito}`,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8 bg-[#ffffff]">
      {/* Breadcrumb & Header */}
      <div className="space-y-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/" className="hover:text-blue-700 transition-colors">
            Inicio
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-semibold text-slate-900">Datos Abiertos</span>
        </nav>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#ecfdf5] text-[#0d9373] border border-[#a7f3d0]">
              <Database className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Portal de Datos Abiertos y Exportaciones
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Descarga libre de los conjuntos de datos en formatos abiertos CSV (Excel) y JSON para análisis independiente
              </p>
            </div>
          </div>
        </div>

        {/* Ámbito Selector */}
        <div className="pt-1 space-y-2">
          <AmbitoSelector currentAmbito={currentAmbito} basePath="/datos" />
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 font-mono">
            <span>
              Ámbito activo: <strong>{currentAmbito === 'directa' ? 'Directa Municipal (Ayto, Aguas, Patronato, IMD)' : currentAmbito === 'mancomunidad' ? 'Indirecta (Mancomunidad COMSERMANCHA)' : 'Todos los entes consolidados'}</strong>
            </span>
            <span className="text-[#0d9373] font-bold">
              {formatNumber(stats.totalLicitaciones)} expedientes · {formatCompactCurrency(stats.totalImporte)} volumen económico del conjunto de datos
            </span>
          </div>
        </div>
      </div>

      {/* Explicación de Calidad y Formato */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="mint-card p-4 space-y-1.5 border-l-4 border-l-[#0d9373]">
          <div className="flex items-center gap-2 text-[#0d9373] font-bold text-xs">
            <FileSpreadsheet className="h-4 w-4" />
            <span>CSV Compatible con Excel</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Codificado en <strong>UTF-8 con BOM (\uFEFF)</strong> y estándar RFC 4180. Abre perfectamente caracteres españoles (tildes, eñes, €) en Excel y Google Sheets sin desconfiguración.
          </p>
        </div>

        <div className="mint-card p-4 space-y-1.5 border-l-4 border-l-blue-500">
          <div className="flex items-center gap-2 text-blue-700 font-bold text-xs">
            <Code className="h-4 w-4" />
            <span>JSON Estructurado para Analistas</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Objetos JavaScript legibles y tipados, ideales para importar en Python (Pandas), R, Observable, Jupyter Notebooks o bases de datos relacionales.
          </p>
        </div>

        <div className="mint-card p-4 space-y-1.5 border-l-4 border-l-purple-500">
          <div className="flex items-center gap-2 text-purple-700 font-bold text-xs">
            <Scale className="h-4 w-4" />
            <span>Reutilización Libre (Datos Abiertos)</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Datos públicos procedentes de fuentes oficiales de PLACSP conforme a la <strong>Ley 37/2007</strong> de reutilización de información del sector público.
          </p>
        </div>
      </div>

      {/* Catálogo de Datasets */}
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <span>Catálogo de Conjuntos de Datos Disponibles</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-normal">
            Ámbito actual: {currentAmbito === 'directa' ? 'Solo Ayuntamiento' : currentAmbito === 'mancomunidad' ? 'Comsermancha' : 'Total Consolidado'}
          </span>
        </h2>

        <div className="grid grid-cols-1 gap-6">
          {datasets.map((ds) => {
            const Icon = ds.icon;
            return (
              <div
                key={ds.id}
                className="mint-card p-6 sm:p-8 space-y-6 border border-slate-200 hover:border-slate-300 transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-slate-100 text-slate-700 shrink-0 mt-0.5">
                      <Icon className="h-6 w-6 text-[#0d9373]" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900">
                          {ds.title}
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {ds.registrosAprox}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-[#0d9373] border border-emerald-200">
                          {ds.periodo}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-3xl">
                        {ds.description}
                      </p>
                    </div>
                  </div>

                  {/* Botones de Descarga Directa */}
                  <div className="flex flex-row lg:flex-col gap-2 shrink-0">
                    <a
                      href={ds.csvUrl}
                      download
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0d9373] text-white hover:bg-[#0b7a60] transition-colors shadow-xs"
                    >
                      <Download className="h-4 w-4" />
                      <span>Descargar CSV (Excel)</span>
                    </a>
                    <a
                      href={ds.jsonUrl}
                      download
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition-colors"
                    >
                      <Code className="h-4 w-4 text-slate-500" />
                      <span>Descargar JSON</span>
                    </a>
                  </div>
                </div>

                {/* Desglose de Campos Incluidos */}
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Campos incluidos en la exportación:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ds.fields.map((f, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-50 text-slate-700 border border-slate-200"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Nota Metodológica y API */}
      <div className="mint-card p-6 border-dashed border-2 border-slate-200 space-y-3">
        <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
          <Info className="h-4 w-4 text-[#0d9373]" />
          <span>Acceso Programático vía API REST</span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Puedes consultar o descargar estos mismos ficheros de forma automatizada mediante llamadas HTTP GET. Los endpoints admiten los parámetros <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[11px]">?format=csv|json</code> y <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[11px]">?ambito=directa|mancomunidad|total</code>:
        </p>
        <div className="space-y-1 font-mono text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div>GET /api/export/licitaciones?format=csv&ambito=directa</div>
          <div>GET /api/export/empresas?format=json&ambito=directa</div>
          <div>GET /api/export/alertas?format=csv&severidad=ALTA</div>
        </div>
      </div>

      {/* Sindicación RSS 2.0 */}
      <div className="mint-card p-6 bg-amber-50/40 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800 shrink-0 mt-0.5">
            <Rss className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-sm">
              Sindicación y Notificaciones Cívicas en Tiempo Real (Canal RSS 2.0)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
              Suscríbete en tu lector RSS preferido (Feedly, Thunderbird, Slack o bots) para recibir avisos automáticos cada vez que se publique una nueva licitación o se detecte una alerta de auditoría relevante.
            </p>
          </div>
        </div>

        <div className="shrink-0">
          <a
            href="/feed.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-xs"
          >
            <Rss className="h-4 w-4" />
            <span>Abrir Feed RSS (/feed.xml)</span>
          </a>
        </div>
      </div>
    </div>
  );
}
