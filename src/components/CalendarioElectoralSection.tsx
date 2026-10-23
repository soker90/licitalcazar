'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getPlacspId } from '@/lib/placsp';
import { CalendarioElectoralStats } from '@/lib/db';
import { formatCurrency } from '@/lib/format';
import { 
  Vote, 
  HelpCircle, 
  AlertTriangle, 
  Calendar, 
  ChevronRight, 
  Hammer,
  LineChart as ChartIcon,
  Table as TableIcon
} from 'lucide-react';

interface CalendarioElectoralSectionProps {
  data: CalendarioElectoralStats;
}

export default function CalendarioElectoralSection({ data }: CalendarioElectoralSectionProps) {
  const [activeTab, setActiveTab] = useState<'comparativa' | 'cronograma' | 'licitaciones'>('comparativa');
  const [selectedElectionAno, setSelectedElectionAno] = useState<number>(2023);

  const { mediaNoElectoral, periodosElectorales, evolucionMensual, diagnostico } = data;

  const periodoActivo = periodosElectorales.find((p) => p.year === selectedElectionAno) || periodosElectorales[periodosElectorales.length - 1];

  // Max volume for monthly chart
  const maxMensualVolumen = Math.max(...evolucionMensual.map((m) => m.volumen), 1);

  return (
    <div className="w-full mint-card p-6 sm:p-7 space-y-6">
      {/* Cabecera */}
      <div className="border-b border-[#e2e8f0] pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#fef2f2] text-[#dc2626] border border-[#fee2e2]">
              <Vote className="h-5 w-5" />
            </span>
            <h3 className="font-bold text-[#1e293b] text-base sm:text-lg tracking-tight">
              Adjudicaciones vs. Calendario Electoral (Ciclo Político)
            </h3>
          </div>
          <p className="text-xs text-[#64748b] mt-1.5 max-w-2xl">
            Comparativa del volumen y tipología de contratación en la ventana preelectoral (90 días previos a las elecciones municipales de mayo de 2019 y 2023) frente a la media de ejercicios no electorales.
          </p>
        </div>

        <Link
          href="/metodologia#calendario-electoral"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#0d9373] bg-[#ecfdf5] hover:bg-[#d1fae5] border border-[#a7f3d0] transition-colors self-start md:self-auto shrink-0"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span>Criterio Preelectoral</span>
        </Link>
      </div>

      {/* Tarjetas Comparativas de Ventanas Electorales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Ventana 2023 */}
        {(() => {
          const p2023 = periodosElectorales.find((p) => p.year === 2023);
          const desv = p2023?.desviacionContratosPct ?? 0;
          return (
            <div className="p-4 rounded-xl bg-white border-2 border-[#dc2626]/20 shadow-2xs space-y-2 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]">
                  Elecciones 28-M 2023
                </span>
                <span className="text-[11px] font-mono text-slate-400">Mar – May 2023</span>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black font-mono text-slate-900">
                    {p2023?.contratos ?? 0}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">contratos</span>
                  {desv !== 0 && (
                    <span className={`text-xs font-mono font-bold ${desv > 0 ? 'text-[#dc2626]' : 'text-[#0d9373]'}`}>
                      {desv > 0 ? `+${desv}%` : `${desv}%`} vs media
                    </span>
                  )}
                </div>
                <span className="text-sm font-bold font-mono text-[#0d9373] block mt-0.5">
                  {formatCurrency(p2023?.volumen ?? 0)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
                <span>Obras y servicios visibles:</span>
                <span className="font-mono font-bold text-slate-800">
                  {p2023 ? p2023.contratosObras + p2023.contratosServicios : 0} ({p2023?.pctObrasYServicios}%)
                </span>
              </div>
            </div>
          );
        })()}

        {/* Ventana 2019 */}
        {(() => {
          const p2019 = periodosElectorales.find((p) => p.year === 2019);
          const desv = p2019?.desviacionContratosPct ?? 0;
          return (
            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-[#f1f5f9] text-slate-700 border border-slate-200">
                  Elecciones 26-M 2019
                </span>
                <span className="text-[11px] font-mono text-slate-400">Mar – May 2019</span>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black font-mono text-slate-900">
                    {p2019?.contratos ?? 0}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">contratos</span>
                  {desv !== 0 && (
                    <span className="text-xs font-mono text-slate-500">
                      {desv > 0 ? `+${desv}%` : `${desv}%`} vs media
                    </span>
                  )}
                </div>
                <span className="text-sm font-bold font-mono text-slate-700 block mt-0.5">
                  {formatCurrency(p2019?.volumen ?? 0)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
                <span>Obras y servicios visibles:</span>
                <span className="font-mono font-bold text-slate-800">
                  {p2019 ? p2019.contratosObras + p2019.contratosServicios : 0} ({p2019?.pctObrasYServicios}%)
                </span>
              </div>
            </div>
          );
        })()}

        {/* Referencia Media No Electoral */}
        <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-white text-slate-600 border border-[#e2e8f0]">
              Media No Electoral
            </span>
            <span className="text-[10px] font-mono text-slate-400">5 ejercicios</span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-slate-700">
                {mediaNoElectoral.contratosTrimestre}
              </span>
              <span className="text-xs text-slate-500 font-medium">contratos / trimestre</span>
            </div>
            <span className="text-sm font-bold font-mono text-slate-600 block mt-0.5">
              {formatCurrency(mediaNoElectoral.volumenTrimestre)}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
            <span>Trimestre mar–may en:</span>
            <span className="font-mono">2020, 2021, 2022, 2024, 2025</span>
          </div>
        </div>
      </div>

      {/* Callout de Diagnóstico */}
      <div className="p-4 rounded-xl bg-[#fffbeb] border border-[#fde68a] flex items-start gap-3 text-xs text-[#92400e]">
        <AlertTriangle className="h-4 w-4 text-[#d97706] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="block font-bold">Patrón Preelectoral Observado:</strong>
          <p className="leading-relaxed">{diagnostico}</p>
          <p className="text-[11px] text-[#b45309] pt-1 border-t border-[#fde68a]/60">
            <strong>Cautela metodológica:</strong> La concentración temporal de expedientes en fechas previas a comicios es una descripción empírica del ritmo registral en PLACSP y no permite por sí sola establecer una relación causal con la agenda electoral.
          </p>
        </div>
      </div>

      {/* Pestañas de Navegación */}
      <div className="space-y-4">
        <div className="flex p-1 bg-[#f1f5f9] rounded-xl self-start overflow-x-auto">
          <button
            onClick={() => setActiveTab('comparativa')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 ${
              activeTab === 'comparativa'
                ? 'bg-white text-[#0f172a] shadow-xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            <TableIcon className="h-3.5 w-3.5" />
            <span>Comparativa Preelectoral</span>
          </button>
          <button
            onClick={() => setActiveTab('cronograma')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 ${
              activeTab === 'cronograma'
                ? 'bg-white text-[#0f172a] shadow-xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            <ChartIcon className="h-3.5 w-3.5" />
            <span>Cronograma Mensual & Marcas</span>
          </button>
          <button
            onClick={() => setActiveTab('licitaciones')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 ${
              activeTab === 'licitaciones'
                ? 'bg-white text-[#0f172a] shadow-xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            <Hammer className="h-3.5 w-3.5" />
            <span>Obras y Servicios Preelectorales</span>
          </button>
        </div>

        {/* Tab 1: Comparativa */}
        {activeTab === 'comparativa' && (
          <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] text-[#475569] font-bold border-b border-[#e2e8f0]">
                  <th className="py-2.5 px-3">Periodo Analizado</th>
                  <th className="py-2.5 px-3 text-right">Contratos</th>
                  <th className="py-2.5 px-3 text-right">Volumen Total</th>
                  <th className="py-2.5 px-3 text-right text-[#b45309]">Obras</th>
                  <th className="py-2.5 px-3 text-right text-[#2563eb]">Servicios</th>
                  <th className="py-2.5 px-3 text-right">% Obras + Servicios</th>
                  <th className="py-2.5 px-3 text-right">Desviación Contratos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9] bg-white">
                {periodosElectorales.map((row) => (
                  <tr key={row.year} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-800">
                      <span className="font-mono font-bold block">{row.nombre}</span>
                      <span className="text-[10px] text-slate-400 font-mono block">{row.periodo}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {row.contratos}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0d9373]">
                      {formatCurrency(row.volumen)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#b45309] font-medium">
                      {row.contratosObras} ({formatCurrency(row.volumenObras)})
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#2563eb] font-medium">
                      {row.contratosServicios} ({formatCurrency(row.volumenServicios)})
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">
                      {row.pctObrasYServicios}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {row.desviacionContratosPct !== 0 ? (
                        <span className={`font-bold ${row.desviacionContratosPct > 0 ? 'text-[#dc2626]' : 'text-[#0d9373]'}`}>
                          {row.desviacionContratosPct > 0 ? `+${row.desviacionContratosPct}%` : `${row.desviacionContratosPct}%`}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {/* Fila de Referencia Media No Electoral */}
                <tr className="bg-[#f8fafc] font-semibold text-slate-700 border-t-2 border-slate-200">
                  <td className="py-2.5 px-3 font-mono">
                    Media Trimestre Años No Electorales (2020-25)
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold">
                    {mediaNoElectoral.contratosTrimestre}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">
                    {formatCurrency(mediaNoElectoral.volumenTrimestre)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-[#b45309]">
                    {mediaNoElectoral.contratosObras} ({formatCurrency(mediaNoElectoral.volumenObras)})
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-[#2563eb]">
                    {mediaNoElectoral.contratosServicios} ({formatCurrency(mediaNoElectoral.volumenServicios)})
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold">
                    {mediaNoElectoral.pctObrasYServicios}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                    Base (0.0%)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Cronograma Mensual con Marcas Electorales */}
        {activeTab === 'cronograma' && (
          <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-slate-700 uppercase tracking-wider font-mono text-[11px]">
                Evolución Mensual de Contratación (Línea de Tiempo 2018–2026)
              </span>
              <div className="flex items-center gap-4 text-[11px] font-mono">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-[#dc2626]" />
                  <span className="text-slate-700 font-bold">Ventana Preelectoral (Mar–May)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-[#0d9373]" />
                  <span className="text-slate-600">Mes Ordinario</span>
                </span>
              </div>
            </div>

            <div className="h-64 sm:h-72 w-full flex items-end gap-1 sm:gap-1.5 pt-6 pb-6 overflow-x-auto">
              {evolucionMensual.map((m) => {
                const heightPct = Math.max(8, (m.volumen / maxMensualVolumen) * 100);
                return (
                  <div
                    key={m.mesAno}
                    title={`${m.mesAno}: ${formatCurrency(m.volumen)} (${m.contratos} contratos)${m.esPreelectoral ? ' [VENTANA PREELECTORAL]' : ''}`}
                    className="flex-1 min-w-[12px] flex flex-col items-center h-full justify-end group cursor-pointer relative"
                  >
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded-t-xs transition-all ${
                        m.esPreelectoral
                          ? 'bg-[#dc2626] group-hover:bg-[#b91c1c] shadow-xs'
                          : 'bg-[#0d9373]/50 group-hover:bg-[#0d9373]'
                      }`}
                    />
                    <span className="text-[9px] font-mono text-slate-400 mt-1 opacity-70 group-hover:opacity-100 rotate-90 origin-left translate-y-3">
                      {m.mes === 1 ? `${m.year}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="pt-2 text-[11px] text-slate-500 border-t border-slate-100 flex items-center justify-between">
              <span>Las barras rojas señalan los meses inmediatamente previos a las elecciones municipales de 2019 y 2023.</span>
              <span className="font-mono text-[10px] text-slate-400">PLACSP</span>
            </div>
          </div>
        )}

        {/* Tab 3: Licitaciones de la Ventana Preelectoral */}
        {activeTab === 'licitaciones' && (
          <div className="space-y-4">
            {/* Selector de periodo */}
            <div className="flex flex-wrap items-center gap-2 bg-[#f8fafc] p-3 rounded-xl border border-[#e2e8f0]">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mr-2">
                <Calendar className="h-3.5 w-3.5 text-[#0d9373]" />
                Ver licitaciones del periodo:
              </span>
              <div className="flex gap-2">
                {periodosElectorales.filter((p) => p.year >= 2019).map((p) => (
                  <button
                    key={p.year}
                    onClick={() => setSelectedElectionAno(p.year)}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                      selectedElectionAno === p.year
                        ? 'bg-[#1e293b] text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-[#e2e8f0]'
                    }`}
                  >
                    {p.nombre} ({p.contratos})
                  </button>
                ))}
              </div>
            </div>

            {/* Listado de licitaciones destacadas */}
            <div className="space-y-2.5">
              <div className="text-xs text-slate-600 pb-1">
                Principales contratos adjudicados en la ventana preelectoral de <strong>{periodoActivo.nombre}</strong> ({periodoActivo.periodo}):
              </div>

              {periodoActivo.topLicitaciones.map((lic, idx) => (
                <Link
                  key={`${lic.id}-${idx}`}
                  href={`/licitaciones/${encodeURIComponent(getPlacspId(lic.id) || lic.case_number)}`}
                  className="group p-3.5 rounded-xl bg-white hover:bg-[#f8fafc] border border-[#e2e8f0] hover:border-[#0d9373] text-xs flex items-center justify-between gap-3 transition-all shadow-2xs block"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-slate-800 group-hover:text-[#0d9373] transition-colors line-clamp-1">
                        {lic.object_description}
                      </span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold font-mono ${
                        lic.tipoContrato === 'Obras'
                          ? 'bg-[#fef3c7] text-[#92400e] border border-[#fde68a]'
                          : lic.tipoContrato === 'Servicios'
                          ? 'bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe]'
                          : 'bg-[#f1f5f9] text-slate-600'
                      }`}>
                        {lic.tipoContrato}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                      <span>Exp: {lic.case_number}</span>
                      <span>•</span>
                      <span>Adj: {lic.awardee}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <span className="font-mono font-bold text-xs text-[#0d9373] block">
                        {formatCurrency(lic.amount)}
                      </span>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {lic.document_date}
                      </span>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#0d9373] group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
