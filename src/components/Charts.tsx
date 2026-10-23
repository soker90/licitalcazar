'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatCurrency, formatCompactCurrency, formatNumber } from '@/lib/format';
import { TrendingUp, ArrowUpRight } from 'lucide-react';

interface YearData {
  year: number;
  contratos: number;
  volumen: number;
}

export function AnnualEvolutionChart({ data }: { data: YearData[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const maxVolumen = Math.max(...data.map((d) => d.volumen), 1);

  return (
    <div className="w-full mint-card p-6 sm:p-7">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
              <TrendingUp className="h-4 w-4" />
            </span>
            <h3 className="font-bold text-[#1e293b] text-base sm:text-lg tracking-tight">
              Evolución Histórica de Inversión Pública
            </h3>
          </div>
          <p className="text-xs text-[#64748b] mt-1">
            Volumen presupuestario adjudicado y número de contratos tramitados por año en Alcázar de San Juan
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs self-start sm:self-auto bg-[#f8fafb] px-3.5 py-1.5 rounded-lg border border-[#e2e8f0]">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#00d4a4]" />
            <span className="text-slate-700 font-medium">Completa (≥2018)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-xs bg-amber-200 border border-dashed border-amber-500" />
            <span className="text-slate-700 font-medium">Parcial (&lt;2018)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-3 rounded-full bg-slate-400" />
            <span className="text-slate-700 font-medium">Contratos</span>
          </div>
        </div>
      </div>

      {/* Bar Chart Canvas with guidelines */}
      <div className="relative h-64 sm:h-72 w-full flex items-end gap-2 sm:gap-4 pt-8 pb-7 px-2">
        {/* Background horizontal lines */}
        <div className="absolute inset-x-0 top-8 bottom-7 flex flex-col justify-between pointer-events-none opacity-60">
          <div className="w-full border-b border-dashed border-slate-200" />
          <div className="w-full border-b border-dashed border-slate-200" />
          <div className="w-full border-b border-dashed border-slate-200" />
          <div className="w-full border-b border-slate-200" />
        </div>

        {data.map((item, idx) => {
          const heightPercent = Math.max(8, (item.volumen / maxVolumen) * 100);
          const isHovered = hoveredIndex === idx;
          const isParcial = item.year < 2018;

          return (
            <div
              key={item.year}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="relative flex-1 flex flex-col items-center h-full justify-end group cursor-pointer z-10"
            >
              {/* Tooltip */}
              {isHovered && (
                <div className={`absolute -top-20 z-30 whitespace-nowrap rounded-xl bg-white border border-[#cbd5e1] px-3.5 py-2 text-xs shadow-xl pointer-events-none transition-all scale-100 ${
                  idx === 0
                    ? 'left-0'
                    : idx === data.length - 1
                    ? 'right-0'
                    : 'left-1/2 -translate-x-1/2'
                }`}>
                  {isParcial && (
                    <p className="text-[10px] font-bold text-[#b45309] bg-[#fffbeb] px-1.5 py-0.5 rounded border border-[#fef3c7] mb-1 inline-block">
                      Cobertura parcial pre-LCSP
                    </p>
                  )}
                  <p className="font-bold text-[#1e293b] flex items-center justify-between gap-3">
                    <span>Año {item.year}</span>
                    <span className="text-[#64748b] font-mono text-[11px]">{formatNumber(item.contratos)} contratos</span>
                  </p>
                  <p className="text-[#0d9373] font-bold font-mono text-sm mt-0.5">
                    {formatCurrency(item.volumen)}
                  </p>
                </div>
              )}

              {/* Bar */}
              <div
                style={{ height: `${heightPercent}%` }}
                className={`w-full rounded-t-md transition-all duration-200 relative overflow-hidden ${
                  isParcial
                    ? isHovered
                      ? 'bg-amber-300/80 border-2 border-dashed border-amber-600 shadow-md shadow-amber-500/20 scale-105'
                      : 'bg-amber-200/70 border-2 border-dashed border-amber-500/80 hover:bg-amber-300/80'
                    : isHovered
                    ? 'bg-[#00b48a] shadow-md shadow-[#00d4a4]/20 scale-105'
                    : 'bg-[#00d4a4] hover:bg-[#00b48a]'
                }`}
              />

              {/* Year label */}
              <span
                className={`text-[10px] sm:text-xs mt-2.5 transition-colors font-mono ${
                  isParcial
                    ? isHovered
                      ? 'font-bold text-amber-700'
                      : 'text-amber-600 font-medium'
                    : isHovered
                    ? 'font-bold text-[#0d9373]'
                    : 'text-slate-500 font-medium'
                }`}
              >
                {item.year}{isParcial ? '*' : ''}
              </span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-[#e2e8f0] pt-4 mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
        <span>Datos oficiales extraídos de la Plataforma de Contratación (PLACSP)</span>
        <Link
          href="/metodologia#cobertura-temporal"
          className="font-mono text-slate-600 hover:text-[#0d9373] transition-colors font-medium inline-flex items-center gap-1 group"
        >
          <span>Cobertura completa desde 2018 (LCSP), parcial antes</span>
          <ArrowUpRight className="h-3 w-3 text-slate-400 group-hover:text-[#0d9373]" />
        </Link>
      </div>
    </div>
  );
}

export function HorizontalBarList({
  title,
  filterType,
  items,
  total,
}: {
  title: string;
  filterType: 'tipo' | 'procedimiento';
  items: { label: string; count: number; volumen: number }[];
  total: number;
}) {
  const maxVal = Math.max(...items.map((i) => i.volumen), 1);

  return (
    <div className="mint-card p-6 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-[#1e293b] text-base tracking-tight">{title}</h3>
          <span className="text-[11px] text-slate-400 font-medium">Filtrar contratos</span>
        </div>

        <div className="space-y-4">
          {items.slice(0, 5).map((item, idx) => {
            const pct = Math.round((item.volumen / maxVal) * 100);
            const pctTotal = Math.round((item.volumen / (total || 1)) * 100);
            const queryParam = filterType === 'tipo' ? `tipo=${encodeURIComponent(item.label)}` : `procedimiento=${encodeURIComponent(item.label)}`;

            return (
              <Link
                key={idx}
                href={`/licitaciones?${queryParam}`}
                className="group block space-y-1.5 p-2 -mx-2 rounded-lg hover:bg-[#f8fafb] transition-colors"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span className="font-mono text-[10px] text-slate-400 group-hover:text-[#0d9373] font-semibold">
                      0{idx + 1}
                    </span>
                    <span className="text-slate-800 font-semibold truncate group-hover:text-[#0d9373] transition-colors">
                      {item.label}
                    </span>
                    <ArrowUpRight className="h-3 w-3 text-slate-400 group-hover:text-[#0d9373] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <span className="font-bold font-mono text-slate-900">{formatCompactCurrency(item.volumen)}</span>
                    <span className="text-[10px] font-mono text-[#0d9373] bg-[#ecfdf5] border border-[#d1fae5] px-1.5 py-0.5 rounded font-semibold">
                      {pctTotal}%
                    </span>
                  </div>
                </div>

                <div className="h-2 w-full bg-[#f1f5f7] rounded-full overflow-hidden border border-[#e2e8f0]/60">
                  <div
                    style={{ width: `${pct}%` }}
                    className="h-full bg-[#00d4a4] group-hover:bg-[#00b48a] rounded-full transition-all duration-500"
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[#e2e8f0] pt-4 mt-5 flex items-center justify-between text-xs text-slate-500">
        <span>Gasto total evaluado en esta categoría</span>
        <span className="font-bold font-mono text-slate-800">{formatCompactCurrency(total)}</span>
      </div>
    </div>
  );
}
