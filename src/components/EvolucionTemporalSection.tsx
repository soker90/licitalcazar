'use client';

import { useState, useId } from 'react';
import Link from 'next/link';
import { EvolucionAnualItem } from '@/lib/db';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { 
  TrendingUp, 
  HelpCircle, 
  Layers, 
  Table as TableIcon, 
  LineChart as ChartIcon,
  ShieldCheck
} from 'lucide-react';

export type MetricKey = 
  | 'volumen' 
  | 'contratos' 
  | 'pctOfertaUnica' 
  | 'bajaMediaPct' 
  | 'tiempoMedianaDias' 
  | 'empresasDistintas';

interface MetricConfig {
  key: MetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  color: string;
  bgBadge: string;
  borderBadge: string;
  textBadge: string;
  format: (v: number) => string;
  description: string;
}

const METRICS: MetricConfig[] = [
  {
    key: 'pctOfertaUnica',
    label: 'Oferta Única',
    shortLabel: '% Oferta Única',
    unit: '%',
    color: '#d97706', // amber-600
    bgBadge: '#fffbeb',
    borderBadge: '#fde68a',
    textBadge: '#92400e',
    format: (v) => formatPercent(v, 1),
    description: 'Proporción de licitaciones adjudicadas con una sola oferta',
  },
  {
    key: 'bajaMediaPct',
    label: 'Baja Media',
    shortLabel: 'Baja Media (%)',
    unit: '%',
    color: '#7c3aed', // violet-600
    bgBadge: '#f5f3ff',
    borderBadge: '#ddd6fe',
    textBadge: '#5b21b6',
    format: (v) => formatPercent(v, 1),
    description: 'Ahorro medio obtenido sobre el presupuesto base de licitación',
  },
  {
    key: 'volumen',
    label: 'Gasto Total',
    shortLabel: 'Gasto (€)',
    unit: '€',
    color: '#0d9373', // teal-600
    bgBadge: '#ecfdf5',
    borderBadge: '#a7f3d0',
    textBadge: '#065f46',
    format: (v) => formatCurrency(v),
    description: 'Volumen presupuestario adjudicado o licitado',
  },
  {
    key: 'contratos',
    label: 'Nº de Contratos',
    shortLabel: 'Contratos',
    unit: '',
    color: '#2563eb', // blue-600
    bgBadge: '#eff6ff',
    borderBadge: '#bfdbfe',
    textBadge: '#1e40af',
    format: (v) => `${formatNumber(v)} contratos`,
    description: 'Número total de contratos y licitaciones del ejercicio',
  },
  {
    key: 'tiempoMedianaDias',
    label: 'Mediana Resolución',
    shortLabel: 'Mediana Días',
    unit: 'd',
    color: '#0891b2', // cyan-600
    bgBadge: '#ecfeff',
    borderBadge: '#a5f3fc',
    textBadge: '#155e75',
    format: (v) => `${v} días`,
    description: 'Días transcurridos entre fin de plazo y adjudicación (P50)',
  },
  {
    key: 'empresasDistintas',
    label: 'Proveedores Únicos',
    shortLabel: 'Proveedores',
    unit: '',
    color: '#db2777', // pink-600
    bgBadge: '#fdf2f8',
    borderBadge: '#fbcfe8',
    textBadge: '#9d174d',
    format: (v) => `${formatNumber(v)} prov.`,
    description: 'Empresas adjudicatarias distintas (identidades deduplicadas)',
  },
];

const PRESETS = [
  {
    id: 'competencia',
    name: 'Concurrencia & Bajas',
    desc: 'Asociación descriptiva observada entre oferta única y baja media (correlación no implica causalidad)',
    metrics: ['pctOfertaUnica', 'bajaMediaPct'] as MetricKey[],
  },
  {
    id: 'mercado',
    name: 'Mercado & Proveedores',
    desc: 'Contratos tramitados vs empresas adjudicatarias distintas',
    metrics: ['contratos', 'empresasDistintas'] as MetricKey[],
  },
  {
    id: 'inversion',
    name: 'Inversión & Volumen',
    desc: 'Presupuesto total frente al número de expedientes',
    metrics: ['volumen', 'contratos'] as MetricKey[],
  },
  {
    id: 'tiempos',
    name: 'Eficiencia & Tiempos',
    desc: 'Duración mediana de tramitación frente a carga de contratos',
    metrics: ['tiempoMedianaDias', 'contratos'] as MetricKey[],
  },
];

interface EvolucionTemporalSectionProps {
  data: EvolucionAnualItem[];
}

export default function EvolucionTemporalSection({ data }: EvolucionTemporalSectionProps) {
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(['pctOfertaUnica', 'bajaMediaPct']);
  const [hoveredAno, setHoveredAno] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const chartId = useId();

  if (!data || data.length === 0) return null;

  // Toggle or select metrics
  const toggleMetric = (key: MetricKey) => {
    if (selectedMetrics.includes(key)) {
      if (selectedMetrics.length === 1) return; // al menos 1 seleccionado
      setSelectedMetrics(selectedMetrics.filter((m) => m !== key));
    } else {
      setSelectedMetrics([...selectedMetrics, key]);
    }
  };

  const applyPreset = (metrics: MetricKey[]) => {
    setSelectedMetrics(metrics);
  };

  // Dimensions for SVG Chart
  const svgWidth = 840;
  const svgHeight = 320;
  const padding = { top: 30, right: 40, bottom: 45, left: 50 };
  const plotWidth = svgWidth - padding.left - padding.right;
  const plotHeight = svgHeight - padding.top - padding.bottom;

  // X Coordinate for each year
  const getX = (index: number) => {
    if (data.length <= 1) return padding.left + plotWidth / 2;
    return padding.left + (index / (data.length - 1)) * plotWidth;
  };

  // Hovered item or last item as fallback
  const activeItem = hoveredAno !== null
    ? data.find((d) => d.year === hoveredAno) || data[data.length - 1]
    : data[data.length - 1];

  const activeIndex = data.findIndex((d) => d.year === activeItem.year);
  const prevItem = activeIndex > 0 ? data[activeIndex - 1] : null;

  return (
    <div className="w-full mint-card p-6 sm:p-7 space-y-6">
      {/* Header */}
      <div className="border-b border-[#e2e8f0] pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
              <TrendingUp className="h-5 w-5" />
            </span>
            <h3 className="font-bold text-[#1e293b] text-base sm:text-lg tracking-tight">
              Evolución Temporal de Indicadores Clave
            </h3>
          </div>
          <p className="text-xs text-[#64748b] mt-1.5 max-w-2xl">
            Tendencia interanual multiserie en Alcázar de San Juan. Selecciona 2 o más indicadores para analizar la asociación descriptiva observada en los datos entre concurrencia, nivel de baja y tiempos de resolución (correlación no implica causalidad).
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <div className="flex p-1 bg-[#f1f5f9] rounded-xl">
            <button
              onClick={() => setViewMode('chart')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                viewMode === 'chart'
                  ? 'bg-white text-[#0f172a] shadow-xs'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              <ChartIcon className="h-3.5 w-3.5" />
              <span>Gráfica</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-[#0f172a] shadow-xs'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Tabla</span>
            </button>
          </div>

          <Link
            href="/metodologia#evolucion-temporal"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#0d9373] bg-[#ecfdf5] hover:bg-[#d1fae5] border border-[#a7f3d0] transition-colors"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Metodología LCSP</span>
          </Link>
        </div>
      </div>

      {/* Selector de Indicadores y Presets */}
      <div className="space-y-3 bg-[#f8fafc] p-4 rounded-xl border border-[#e2e8f0]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 font-mono flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-[#0d9373]" />
            Comparador de Indicadores ({selectedMetrics.length} activos)
          </span>

          {/* Botones de presets */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400 text-[11px] mr-1 hidden sm:inline">Análisis rápido:</span>
            {PRESETS.map((p) => {
              const isPresetActive = 
                selectedMetrics.length === p.metrics.length && 
                p.metrics.every((m) => selectedMetrics.includes(m));

              return (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.metrics)}
                  title={p.desc}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    isPresetActive
                      ? 'bg-[#1e293b] text-white border-[#1e293b] shadow-2xs font-semibold'
                      : 'bg-white text-slate-600 border-[#cbd5e1] hover:bg-slate-100'
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chips de métricas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
          {METRICS.map((m) => {
            const isSelected = selectedMetrics.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggleMetric(m.key)}
                className={`p-2.5 rounded-xl text-left border transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-white shadow-xs border-current'
                    : 'bg-white/60 border-slate-200 opacity-60 hover:opacity-100 hover:bg-white'
                }`}
                style={{ borderColor: isSelected ? m.color : undefined }}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: m.color }}
                  />
                  <span
                    className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: isSelected ? m.bgBadge : '#f1f5f9',
                      color: isSelected ? m.textBadge : '#64748b',
                    }}
                  >
                    {isSelected ? 'ON' : 'OFF'}
                  </span>
                </div>
                <div className="mt-2">
                  <span className="text-xs font-bold text-slate-800 block line-clamp-1">
                    {m.label}
                  </span>
                  <span className="text-[10px] text-slate-500 block truncate">
                    {m.shortLabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Visualización Principal: Gráfica o Tabla */}
      {viewMode === 'chart' ? (
        <div className="space-y-4">
          {/* Tarjeta de Resumen del Año Activo (Hover o último) */}
          <div className="p-3.5 rounded-xl bg-white border border-[#e2e8f0] shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#f1f5f9] text-slate-700 font-mono font-black text-base border border-slate-200">
                {activeItem.year}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    Ejercicio {activeItem.year}
                  </span>
                  {activeItem.year >= 2018 ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]">
                      Cobertura completa LCSP
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-[#fffbeb] text-[#92400e] border border-[#fde68a]">
                      Cobertura parcial pre-LCSP
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Pasa el cursor por los puntos de la gráfica para inspeccionar cada ejercicio anual
                </p>
              </div>
            </div>

            {/* Valores de las métricas activas en este año */}
            <div className="flex flex-wrap items-center gap-4">
              {selectedMetrics.map((key) => {
                const conf = METRICS.find((m) => m.key === key)!;
                const currVal = activeItem[key] as number;
                const prevVal = prevItem ? (prevItem[key] as number) : null;
                const delta = prevVal !== null && prevVal !== 0 
                  ? ((currVal - prevVal) / prevVal) * 100 
                  : null;

                return (
                  <div key={key} className="text-right border-l border-slate-100 pl-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                      {conf.shortLabel}
                    </span>
                    <span 
                      className="text-base font-black font-mono block"
                      style={{ color: conf.color }}
                    >
                      {conf.format(currVal)}
                    </span>
                    {delta !== null && (
                      <span className={`text-[10px] font-mono block ${delta >= 0 ? 'text-[#0d9373]' : 'text-slate-500'}`}>
                        {delta >= 0 ? `+${formatPercent(delta, 1)}` : formatPercent(delta, 1)} YoY
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gráfica SVG de Líneas Multiserie */}
          <div className="relative w-full overflow-hidden rounded-xl bg-white border border-[#e2e8f0] p-2 sm:p-4">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-auto overflow-visible select-none"
            >
              <defs>
                {selectedMetrics.map((key) => {
                  const conf = METRICS.find((m) => m.key === key)!;
                  return (
                    <linearGradient
                      key={key}
                      id={`grad-${chartId}-${key}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={conf.color} stopOpacity="0.18" />
                      <stop offset="100%" stopColor={conf.color} stopOpacity="0.0" />
                    </linearGradient>
                  );
                })}
              </defs>

              {/* Gridlines horizontales */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                const y = padding.top + pct * plotHeight;
                return (
                  <line
                    key={idx}
                    x1={padding.left}
                    y1={y}
                    x2={svgWidth - padding.right}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray={pct === 1 ? 'none' : '4 4'}
                    strokeWidth="1"
                  />
                );
              })}

              {/* Años en el eje X */}
              {data.map((item, idx) => {
                const x = getX(idx);
                const isHovered = hoveredAno === item.year;
                const isLcsp = item.year >= 2018;

                return (
                  <g key={item.year}>
                    <line
                      x1={x}
                      y1={padding.top}
                      x2={x}
                      y2={padding.top + plotHeight}
                      stroke={isHovered ? '#94a3b8' : '#f1f5f9'}
                      strokeWidth={isHovered ? '2' : '1'}
                      strokeDasharray={isHovered ? '2 2' : 'none'}
                    />
                    <text
                      x={x}
                      y={svgHeight - padding.bottom + 22}
                      textAnchor="middle"
                      className={`text-[11px] font-mono transition-colors ${
                        isHovered
                          ? 'font-black fill-[#0f172a]'
                          : isLcsp
                          ? 'font-bold fill-slate-700'
                          : 'fill-amber-600 font-medium'
                      }`}
                    >
                      {item.year}
                    </text>
                  </g>
                );
              })}

              {/* Series de Líneas */}
              {selectedMetrics.map((key) => {
                const conf = METRICS.find((m) => m.key === key)!;
                const values = data.map((d) => d[key] as number);
                const minVal = Math.min(...values);
                const maxVal = Math.max(...values);
                const span = maxVal - minVal || 1;

                // Normalize Y
                const points = data.map((d, idx) => {
                  const val = d[key] as number;
                  const norm = (val - minVal) / span;
                  const x = getX(idx);
                  const y = padding.top + (1 - norm) * plotHeight;
                  return { x, y, val, year: d.year };
                });

                const pathString = points
                  .map((p, idx) => (idx === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`))
                  .join(' ');

                const areaString = `${pathString} L ${getX(data.length - 1)},${padding.top + plotHeight} L ${getX(0)},${padding.top + plotHeight} Z`;

                return (
                  <g key={key}>
                    {/* Area under line */}
                    <path
                      d={areaString}
                      fill={`url(#grad-${chartId}-${key})`}
                      className="pointer-events-none"
                    />

                    {/* Polyline */}
                    <path
                      d={pathString}
                      fill="none"
                      stroke={conf.color}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-all"
                    />

                    {/* Data Points */}
                    {points.map((p) => {
                      const isHovered = hoveredAno === p.year;
                      return (
                        <g key={p.year}>
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={isHovered ? 6 : 4}
                            fill="white"
                            stroke={conf.color}
                            strokeWidth={isHovered ? 3 : 2}
                            className="transition-all cursor-pointer"
                            onMouseEnter={() => setHoveredAno(p.year)}
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Invisible overlays for hover detection */}
              {data.map((item, idx) => {
                const x = getX(idx);
                const sliceWidth = plotWidth / (data.length - 1 || 1);
                return (
                  <rect
                    key={item.year}
                    x={x - sliceWidth / 2}
                    y={padding.top}
                    width={sliceWidth}
                    height={plotHeight}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredAno(item.year)}
                    onMouseLeave={() => setHoveredAno(null)}
                  />
                );
              })}
            </svg>
          </div>
        </div>
      ) : (
        /* Tabla Histórica de Indicadores Anuales */
        <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#f8fafc] text-[#475569] font-bold border-b border-[#e2e8f0]">
                <th className="py-3 px-3">Ejercicio</th>
                <th className="py-3 px-3 text-right">Gasto Total</th>
                <th className="py-3 px-3 text-right">Contratos</th>
                <th className="py-3 px-3 text-right text-[#92400e]">% Oferta Única</th>
                <th className="py-3 px-3 text-right text-[#5b21b6]">Baja Media</th>
                <th className="py-3 px-3 text-right text-[#155e75]">Mediana Días</th>
                <th className="py-3 px-3 text-right text-[#9d174d]">Proveedores</th>
                <th className="py-3 px-3 text-center">Cobertura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9] bg-white">
              {data.map((row) => (
                <tr 
                  key={row.year} 
                  className={`hover:bg-[#f8fafc] transition-colors ${
                    hoveredAno === row.year ? 'bg-[#f0fdf4]' : ''
                  }`}
                  onMouseEnter={() => setHoveredAno(row.year)}
                  onMouseLeave={() => setHoveredAno(null)}
                >
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                    {row.year}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0d9373]">
                    {formatCurrency(row.volumen)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                    {formatNumber(row.contratos)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-[#d97706]">
                    {formatPercent(row.pctOfertaUnica, 1)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-[#7c3aed]">
                    {formatPercent(row.bajaMediaPct, 1)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-[#0891b2] font-semibold">
                    {row.tiempoMedianaDias} d
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-[#db2777]">
                    {formatNumber(row.empresasDistintas)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {row.year >= 2018 ? (
                      <span className="px-2 py-0.5 rounded-xs text-[10px] font-bold font-mono bg-[#ecfdf5] text-[#065f46]">
                        LCSP
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-xs text-[10px] font-bold font-mono bg-[#fffbeb] text-[#b45309]">
                        Parcial
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Nota Metodológica y Cobertura Temporal */}
      <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-[#0d9373] shrink-0 mt-0.5" />
          <div>
            <strong>Cobertura temporal oficial:</strong> Con la entrada en vigor de la Ley 9/2017 (LCSP) en marzo de 2018, la publicación de todas las licitaciones y contratos menores en la Plataforma de Contratación del Sector Público pasó a ser de publicación preceptiva por mandato legal. Los datos anteriores a 2018 pueden presentar cobertura voluntaria o parcial en las fuentes abiertas.
          </div>
        </div>

        <Link
          href="/metodologia#evolucion-temporal"
          className="font-mono text-[#0d9373] hover:underline shrink-0 font-medium inline-flex items-center gap-1"
        >
          <span>Ver detalle metodológico</span>
        </Link>
      </div>
    </div>
  );
}
