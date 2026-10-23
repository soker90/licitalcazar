'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getPlacspId } from '@/lib/placsp';
import { TiemposStats } from '@/lib/db';
import { formatNumber } from '@/lib/format';
import { 
  Activity, 
  ChevronRight, 
  AlertTriangle, 
  HelpCircle
} from 'lucide-react';

interface DistribucionTiemposProps {
  tiempos: TiemposStats;
}

export default function DistribucionTiempos({ tiempos }: DistribucionTiemposProps) {
  const [activeTab, setActiveTab] = useState<'histograma' | 'organismos' | 'outliers'>('histograma');

  const { percentiles, distribucion, porOrganismo, outliers, totalEvaluados, bajaPercentiles } = tiempos;

  // Skew calculation (Media - Mediana)
  const sesgoDias = Math.round((percentiles.media - percentiles.mediana) * 10) / 10;
  const sesgoPct = percentiles.mediana > 0 
    ? Math.round(((percentiles.media - percentiles.mediana) / percentiles.mediana) * 100) 
    : 0;

  return (
    <div className="mint-card p-6 sm:p-7 space-y-6">
      {/* Cabecera de la sección */}
      <div className="border-b border-[#e2e8f0] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
              <Activity className="h-4 w-4" />
            </span>
            <h3 className="font-bold text-[#1e293b] text-base">
              Distribución Real de Tiempos de Tramitación (Mediana y Percentiles)
            </h3>
          </div>
          <p className="text-xs text-[#64748b] mt-1">
            La media aritmética oculta la realidad en distribuciones asimétricas. La mediana y los percentiles reflejan el tiempo efectivo de tramitación libre de la distorsión de casos extremos.
          </p>
        </div>

        <Link
          href="/metodologia#distribucion-tiempos"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-[#0d9373] bg-[#ecfdf5] hover:bg-[#d1fae5] border border-[#a7f3d0] transition-colors self-start sm:self-auto shrink-0"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span>Criterio P50 / P90</span>
        </Link>
      </div>

      {/* Tarjetas de Percentiles (Caja y Bigotes conceptual) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
        {/* P25 */}
        <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0]">
          <span className="text-[10px] uppercase font-bold text-slate-500 font-mono block">
            P25 (Rápido)
          </span>
          <span className="text-xl font-black font-mono text-[#0f172a]">
            {percentiles.p25} <span className="text-xs font-normal text-slate-500">días</span>
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">25% más ágil</span>
        </div>

        {/* Mediana (P50) - Protagonista */}
        <div className="p-3 rounded-xl bg-[#ecfdf5] border-2 border-[#10b981] shadow-2xs col-span-2 sm:col-span-1">
          <span className="text-[10px] uppercase font-bold text-[#065f46] font-mono block">
            Mediana (P50)
          </span>
          <span className="text-2xl font-black font-mono text-[#064e3b]">
            {percentiles.mediana} <span className="text-xs font-normal text-[#047857]">días</span>
          </span>
          <span className="text-[10px] font-semibold text-[#065f46] block mt-0.5">Centro real (50%)</span>
        </div>

        {/* Media aritmética (sesgada) */}
        <div className="p-3 rounded-xl bg-[#fffbeb] border border-[#fde68a]">
          <span className="text-[10px] uppercase font-bold text-[#b45309] font-mono block">
            Media Aritmética
          </span>
          <span className="text-xl font-black font-mono text-[#78350f]">
            {percentiles.media} <span className="text-xs font-normal text-[#b45309]">días</span>
          </span>
          <span className="text-[10px] font-medium text-[#b45309] block mt-0.5">+{sesgoDias}d (+{sesgoPct}%)</span>
        </div>

        {/* P75 */}
        <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0]">
          <span className="text-[10px] uppercase font-bold text-slate-500 font-mono block">
            P75 (Lento)
          </span>
          <span className="text-xl font-black font-mono text-[#0f172a]">
            {percentiles.p75} <span className="text-xs font-normal text-slate-500">días</span>
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">75% resuelto</span>
        </div>

        {/* P90 */}
        <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] col-span-2 sm:col-span-1">
          <span className="text-[10px] uppercase font-bold text-[#991b1b] font-mono block">
            P90 (Cola Larga)
          </span>
          <span className="text-xl font-black font-mono text-[#7f1d1d]">
            {percentiles.p90} <span className="text-xs font-normal text-slate-500">días</span>
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Máx: {percentiles.max}d</span>
        </div>
      </div>

      {/* Callout explicativo del sesgo */}
      <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] flex items-start gap-2.5 text-xs text-slate-600">
        <AlertTriangle className="h-4 w-4 text-[#d97706] shrink-0 mt-0.5" />
        <div>
          <strong>Diagnóstico de Asimetría Positiva:</strong> La mitad de los expedientes municipales se resuelven en <strong>{percentiles.mediana} días o menos</strong>. La media ({percentiles.media} días) está artificialmente inflada por un reducido grupo de procedimientos complejos o de gran envergadura (como la limpieza viaria, con {percentiles.max} días) que estiran la cola estadística.
        </div>
      </div>

      {/* Pestañas de Navegación del Panel */}
      <div className="space-y-4">
        <div className="flex p-1 bg-[#f1f5f9] rounded-xl self-start">
          <button
            onClick={() => setActiveTab('histograma')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'histograma'
                ? 'bg-white text-[#0f172a] shadow-xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Histograma de Duración
          </button>
          <button
            onClick={() => setActiveTab('organismos')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'organismos'
                ? 'bg-white text-[#0f172a] shadow-xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Mediana vs Media por Organismo
          </button>
          <button
            onClick={() => setActiveTab('outliers')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'outliers'
                ? 'bg-white text-[#0f172a] shadow-xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Outliers con Mayor Dilación ({outliers.length})
          </button>
        </div>

        {/* Tab 1: Histograma de Tramos */}
        {activeTab === 'histograma' && (
          <div className="space-y-3 pt-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono block">
              Distribución de Frecuencias ({totalEvaluados} contratos evaluados)
            </span>
            <div className="space-y-2.5">
              {distribucion.map((tramo) => {
                const maxPct = Math.max(...distribucion.map((d) => d.pct));
                const barWidth = maxPct > 0 ? (tramo.pct / maxPct) * 100 : 0;
                const isOutlierBucket = tramo.min > 180;

                return (
                  <div key={tramo.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        {isOutlierBucket && <AlertTriangle className="h-3 w-3 text-[#dc2626]" />}
                        {tramo.label}
                      </span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-slate-500">{tramo.count} contratos</span>
                        <span className={`font-bold ${isOutlierBucket ? 'text-[#dc2626]' : 'text-[#0f172a]'}`}>
                          {tramo.pct}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-[#f1f5f9] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isOutlierBucket
                            ? 'bg-[#ef4444]'
                            : tramo.min >= 90
                            ? 'bg-[#f59e0b]'
                            : tramo.min >= 30
                            ? 'bg-[#2563eb]'
                            : 'bg-[#10b981]'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Por Organismo */}
        {activeTab === 'organismos' && (
          <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] text-[#475569] font-bold border-b border-[#e2e8f0]">
                  <th className="py-2.5 px-3">Organismo</th>
                  <th className="py-2.5 px-3 text-right">Contratos</th>
                  <th className="py-2.5 px-3 text-right text-[#065f46]">Mediana (P50)</th>
                  <th className="py-2.5 px-3 text-right text-[#b45309]">Media</th>
                  <th className="py-2.5 px-3 text-right text-[#7f1d1d]">Percentil 90</th>
                  <th className="py-2.5 px-3 text-right">Sesgo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9] bg-white">
                {porOrganismo.map((org) => {
                  const skew = Math.round((org.mediaDias - org.medianaDias) * 10) / 10;
                  return (
                    <tr key={org.organo} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-[#1e293b]">
                        {org.organo}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                        {formatNumber(org.contratos)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0d9373]">
                        {org.medianaDias} d
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#b45309]">
                        {org.mediaDias} d
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#dc2626]">
                        {org.p90Dias} d
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {skew > 0 ? `+${skew} d` : `${skew} d`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Outliers y Cola Larga */}
        {activeTab === 'outliers' && (
          <div className="space-y-2.5">
            <div className="text-xs text-slate-600 pb-1">
              Expedientes con tramitación superior al umbral de valores atípicos (<strong>&ge; {percentiles.umbralOutlier} días</strong>), responsables del sesgo de la media:
            </div>
            {outliers.slice(0, 5).map((exp, idx) => (
              <Link
                key={`${exp.id}-${idx}`}
                href={`/licitaciones/${encodeURIComponent(getPlacspId(exp.id) || exp.case_number)}`}
                className="group p-3 rounded-lg bg-[#ffffff] hover:bg-[#f8fafc] border border-[#e2e8f0] hover:border-[#0d9373] text-xs flex items-center justify-between gap-3 transition-all block shadow-2xs"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <span className="font-bold text-slate-800 group-hover:text-[#0d9373] line-clamp-1 transition-colors">
                    {exp.object_description}
                  </span>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5 flex-wrap">
                    <span>Exp: {exp.case_number}</span>
                    <span>•</span>
                    <span>{exp.organo}</span>
                    <span>•</span>
                    <span>Adj: {exp.awardee}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded bg-[#fef2f2] text-[#b91c1c] border border-[#fee2e2] font-mono font-bold text-xs block">
                      {exp.dias} días
                    </span>
                    <span className="text-[10px] text-[#dc2626] font-mono block">
                      +{exp.desviacionSobreMediana}d vs mediana
                    </span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#0d9373] group-hover:translate-x-0.5 transition-all" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Resumen opcional de Baja Percentiles si existe */}
      {bajaPercentiles && bajaPercentiles.media > 0 && (
        <div className="pt-3 border-t border-[#e2e8f0] flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
          <span>
            <strong>Baja Media en Contratos Competitivos:</strong> {bajaPercentiles.media}%
          </span>
          <span className="font-mono text-slate-500">
            Mediana: <strong className="text-[#0d9373]">{bajaPercentiles.mediana}%</strong> · P75: {bajaPercentiles.p75}% · P90: {bajaPercentiles.p90}%
          </span>
        </div>
      )}
    </div>
  );
}
