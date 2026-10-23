'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatCompactCurrency, formatNumber, formatNif } from '@/lib/format';
import { Trophy, ArrowRight, ChevronRight } from 'lucide-react';

interface EmpresaItem {
  adjudicatario: string;
  nif: string;
  id?: string;
  contratos: number;
  volumen: number;
  grupo?: string;
  tipoVinculo?: string;
}

export default function TopEmpresasSection({
  topVolumen,
  topContratos,
}: {
  topVolumen: EmpresaItem[];
  topContratos: EmpresaItem[];
}) {
  const [tab, setTab] = useState<'volumen' | 'contratos'>('volumen');
  const items = tab === 'volumen' ? topVolumen : topContratos;

  return (
    <div className="mint-card p-6 sm:p-7">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
              <Trophy className="h-4 w-4" />
            </span>
            <h3 className="font-bold text-[#1e293b] text-base sm:text-lg tracking-tight">
              Top 10 Empresas Adjudicatarias
            </h3>
          </div>
          <p className="text-xs text-[#64748b] mt-1">
            Principales contratistas y proveedores por volumen presupuestario adjudicado en Alcázar de San Juan
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center rounded-lg bg-[#f1f5f7] p-1 border border-[#e2e8f0] self-start sm:self-auto">
          <button
            onClick={() => setTab('volumen')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
              tab === 'volumen'
                ? 'bg-white text-[#1e293b] shadow-xs font-bold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Por Facturación (€)
          </button>
          <button
            onClick={() => setTab('contratos')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
              tab === 'contratos'
                ? 'bg-white text-[#1e293b] shadow-xs font-bold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Por Nº Contratos
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {items.map((empresa, idx) => {
          const rank = idx + 1;

          return (
            <Link
              key={empresa.adjudicatario + idx}
              href={`/empresas/${encodeURIComponent(empresa.id || empresa.nif || empresa.adjudicatario)}`}
              className="group relative flex items-center justify-between p-4 rounded-xl bg-[#f8fafb] hover:bg-white border border-[#e2e8f0] hover:border-[#cbd5e1] hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3.5 min-w-0 pr-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono font-bold text-xs transition-transform group-hover:scale-105 ${
                    rank === 1
                      ? 'bg-[#ecfdf5] border border-[#d1fae5] text-[#0d9373]'
                      : rank === 2
                      ? 'bg-slate-100 text-slate-700 border border-slate-200'
                      : rank === 3
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-white text-slate-500 border border-[#e2e8f0]'
                  }`}
                >
                  {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `0${rank}`}
                </span>

                <div className="min-w-0">
                  <p className="font-semibold text-[#1e293b] text-xs sm:text-sm truncate group-hover:text-[#0d9373] transition-colors">
                    {empresa.adjudicatario}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500 font-mono">
                    {empresa.nif && (
                      <span className="bg-white px-1.5 py-0.5 rounded border border-[#e2e8f0] text-slate-600">
                        {formatNif(empresa.nif)}
                      </span>
                    )}
                    {empresa.grupo && (
                      <span className="bg-[#eff6ff] text-[#2563eb] px-1.5 py-0.5 rounded border border-[#dbeafe] text-[10px] font-sans font-medium">
                        {empresa.grupo}
                      </span>
                    )}
                    <span>{formatNumber(empresa.contratos)} adjudicaciones</span>
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="font-bold font-mono text-slate-900 text-xs sm:text-sm group-hover:text-[#0d9373] transition-colors">
                  {formatCompactCurrency(empresa.volumen)}
                </p>
                <span className="text-[11px] text-[#0d9373] group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-0.5 font-medium mt-0.5">
                  Ver ficha <ChevronRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-5 pt-4 border-t border-[#e2e8f0] flex items-center justify-between">
        <span className="text-xs text-slate-500">Datos consolidados procedentes del perfil del contratante oficial</span>
        <Link
          href="/empresas"
          className="text-xs font-semibold text-[#0d9373] hover:text-[#00b48a] flex items-center gap-1.5 transition-colors"
        >
          <span>Ver directorio completo de empresas</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
