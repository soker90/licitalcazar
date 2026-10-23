'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getPlacspId } from '@/lib/placsp';
import { FlujoStats } from '@/lib/db';
import { formatCurrency, formatCompactCurrency, formatNumber } from '@/lib/format';
import { 
  GitBranch, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Ban, 
  ArrowRight, 
  HelpCircle,
  AlertTriangle,
  Search,
  ExternalLink,
  Sparkles
} from 'lucide-react';

interface FlujoSectionProps {
  data: FlujoStats;
  year?: string | number | null;
  scope?: string | null;
  ano?: string | number | null;
  ambito?: string | null;
}

export default function FlujoSection({ data, year, scope, ano, ambito }: FlujoSectionProps) {
  const effectiveYear = year ?? ano;
  const effectiveScope = scope ?? ambito;
  const [activeTab, setActiveTab] = useState<'tipo' | 'procedimiento' | 'organismo' | 'evolucion'>('tipo');
  const [showAllPairs, setShowAllPairs] = useState(false);
  const [pairFilter, setPairFilter] = useState('');

  const { kpis, readjudicaciones, porTipo, porProcedimiento, porOrganismo, evolucion } = data;

  const filteredPairs = readjudicaciones.filter((p) => {
    if (!pairFilter) return true;
    const term = pairFilter.toLowerCase();
    return (
      p.desierta.case_number.toLowerCase().includes(term) ||
      p.desierta.object_description.toLowerCase().includes(term) ||
      p.posterior.case_number.toLowerCase().includes(term) ||
      p.posterior.object_description.toLowerCase().includes(term) ||
      (p.posterior.awardee && p.posterior.awardee.toLowerCase().includes(term)) ||
      p.desierta.organo.toLowerCase().includes(term)
    );
  });

  const displayedPairs = showAllPairs ? filteredPairs : filteredPairs.slice(0, 6);

  return (
    <div id="flujo" className="mint-card p-6 sm:p-8 space-y-8">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e2e8f0] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
              <GitBranch className="h-5 w-5" />
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-[#1e293b] tracking-tight">
              Estado del Flujo de Contratación y Licitaciones Desiertas
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#64748b] mt-1">
            Supervisión integral del ciclo de vida de los expedientes en PLACSP: adjudicaciones, expedientes que quedan desiertos o sin ofertas, licitaciones en curso y detección de re-adjudicaciones posteriores.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
          {effectiveScope && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
              {effectiveScope === 'directa' ? 'Directa Municipal' : effectiveScope === 'mancomunidad' ? 'Mancomunidad' : effectiveScope}
            </span>
          )}
          {effectiveYear && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
              Año {effectiveYear}
            </span>
          )}
          <Link
            href="/metodologia#flujo"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] text-slate-700 hover:text-[#0d9373] border border-[#e2e8f0] text-xs font-semibold transition-all"
          >
            <HelpCircle className="h-3.5 w-3.5 text-[#0d9373]" />
            <span>Metodología del Flujo</span>
          </Link>
        </div>
      </div>

      {/* 4 KPIs de Estado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Adjudicadas / Formalizadas */}
        <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-4.5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#166534] flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#16a34a]" />
                Adjudicadas / Formalizadas
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#15803d]">
                {kpis.adjudicadas.pctContratos}%
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#14532d] tracking-tight">
              {formatNumber(kpis.adjudicadas.contratos)}
            </div>
            <div className="text-xs text-[#15803d] font-medium mt-0.5">
              expedientes adjudicados
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#bbf7d0]/60 flex items-center justify-between text-xs text-[#166534]">
            <span>Volumen económico:</span>
            <span className="font-bold text-[#14532d]">{formatCompactCurrency(kpis.adjudicadas.volumen)}</span>
          </div>
        </div>

        {/* Desiertas / Sin Adjudicar */}
        <div className="bg-[#fffbeb] border border-[#fde68a] rounded-xl p-4.5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#92400e] flex items-center gap-1.5">
                <XCircle className="h-4 w-4 text-[#d97706]" />
                Desiertas / Sin Adjudicar
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#b45309]">
                {kpis.desiertas.pctContratos}%
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#78350f] tracking-tight">
              {formatNumber(kpis.desiertas.contratos)}
            </div>
            <div className="text-xs text-[#b45309] font-medium mt-0.5">
              licitaciones sin ofertas o desiertas
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#fde68a]/60 flex items-center justify-between text-xs text-[#92400e]">
            <span>Importe en juego:</span>
            <span className="font-bold text-[#78350f]">{formatCompactCurrency(kpis.desiertas.volumen)}</span>
          </div>
        </div>

        {/* En Licitación / En Curso */}
        <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-4.5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#1e40af] flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-[#2563eb]" />
                En Curso / Evaluación
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#dbeafe] text-[#1d4ed8]">
                {kpis.enCurso.pctContratos}%
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#1e3a8a] tracking-tight">
              {formatNumber(kpis.enCurso.contratos)}
            </div>
            <div className="text-xs text-[#1d4ed8] font-medium mt-0.5">
              publicadas o en baremación
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#bfdbfe]/60 flex items-center justify-between text-xs text-[#1e40af]">
            <span>Presupuesto base:</span>
            <span className="font-bold text-[#1e3a8a]">{formatCompactCurrency(kpis.enCurso.volumen)}</span>
          </div>
        </div>

        {/* Anuladas */}
        <div className="bg-[#fef2f2] border border-[#fecaca] rounded-xl p-4.5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#991b1b] flex items-center gap-1.5">
                <Ban className="h-4 w-4 text-[#dc2626]" />
                Anuladas
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#fee2e2] text-[#b91c1c]">
                {kpis.anuladas.pctContratos}%
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#7f1d1d] tracking-tight">
              {formatNumber(kpis.anuladas.contratos)}
            </div>
            <div className="text-xs text-[#b91c1c] font-medium mt-0.5">
              retiradas o anuladas
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#fecaca]/60 flex items-center justify-between text-xs text-[#991b1b]">
            <span>Presupuesto anulado:</span>
            <span className="font-bold text-[#7f1d1d]">{formatCompactCurrency(kpis.anuladas.volumen)}</span>
          </div>
        </div>
      </div>

      {/* Mini banner de Tasa de Desiertas */}
      <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#fff7ed] text-[#ea580c] border border-[#ffedd5]">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#1e293b]">
              Tasa de Licitaciones Desiertas sobre Procedimientos Concluidos
            </div>
            <div className="text-xs text-[#64748b]">
              Porcentaje de licitaciones resueltas que no lograron adjudicarse en primera convocatoria ({kpis.desiertas.contratos} de {kpis.adjudicadas.contratos + kpis.desiertas.contratos} resueltas).
            </div>
          </div>
        </div>
        <div className="text-right self-end sm:self-auto shrink-0">
          <span className="text-2xl font-black text-[#d97706]">
            {kpis.tasaDesiertasPct}%
          </span>
          <span className="text-xs text-[#64748b] block">tasa global</span>
        </div>
      </div>

      {/* PATRÓN A VIGILAR: Re-adjudicaciones / Negociados Posteriores */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-[#fef3c7] text-[#b45309] border border-[#fde68a]">
                <Sparkles className="h-4 w-4" />
              </span>
              <h3 className="text-base sm:text-lg font-bold text-[#1e293b]">
                Patrón a Vigilar: Procedimiento Desierto → Re-adjudicación Posterior
              </h3>
            </div>
            <p className="text-xs text-[#64748b] mt-0.5">
              Expedientes que quedaron sin adjudicar en su primera licitación y posteriormente fueron adjudicados mediante un nuevo concurso, tramitación negociada o procedimiento simplificado.
            </p>
          </div>
          <div className="text-xs text-[#64748b] font-medium bg-[#f1f5f9] px-3 py-1.5 rounded-lg border border-[#e2e8f0] self-start sm:self-auto">
            <span className="font-bold text-[#0f172a]">{readjudicaciones.length}</span> pares detectados
          </div>
        </div>

        {readjudicaciones.length > 0 && (
          <div className="flex items-center gap-2 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
              <input
                type="text"
                value={pairFilter}
                onChange={(e) => setPairFilter(e.target.value)}
                placeholder="Filtrar por expediente, adjudicatario u objeto..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#cbd5e1] focus:outline-none focus:ring-1 focus:ring-[#0d9373] bg-white"
              />
            </div>
            {pairFilter && (
              <button
                onClick={() => setPairFilter('')}
                className="text-xs text-[#64748b] hover:text-[#0f172a] underline shrink-0 px-1"
              >
                Limpiar
              </button>
            )}
          </div>
        )}

        {displayedPairs.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-[#cbd5e1] rounded-xl text-xs text-[#64748b]">
            No se han encontrado pares coincidentes con los filtros seleccionados.
          </div>
        ) : (
          <div className="space-y-3">
            {displayedPairs.map((pair, idx) => (
              <div
                key={`${pair.desierta.id}-${pair.posterior.id}-${idx}`}
                className="p-4 rounded-xl border border-[#e2e8f0] bg-[#ffffff] hover:border-[#cbd5e1] hover:shadow-xs transition-all space-y-3"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                  {/* Licitación Desierta */}
                  <div className="lg:col-span-5 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#fffbeb] text-[#b45309] border border-[#fde68a]">
                        Desierta / Sin Ofertas
                      </span>
                      <span className="text-xs font-mono font-bold text-[#0f172a]">
                        {pair.desierta.case_number}
                      </span>
                      <span className="text-[11px] text-[#64748b]">
                        ({pair.desierta.year})
                      </span>
                    </div>

                    <Link
                      href={`/licitaciones/${encodeURIComponent(getPlacspId(pair.desierta.id) || pair.desierta.id)}`}
                      className="text-xs font-semibold text-[#1e293b] hover:text-[#0d9373] line-clamp-2 transition-colors flex items-center gap-1 group"
                    >
                      <span>{pair.desierta.object_description}</span>
                      <ExternalLink className="h-3 w-3 text-[#94a3b8] group-hover:text-[#0d9373] shrink-0 inline opacity-70" />
                    </Link>

                    <div className="flex items-center gap-3 text-[11px] text-[#64748b] flex-wrap">
                      <span>Org: <strong className="text-[#334155]">{pair.desierta.organo}</strong></span>
                      <span>Proc: <strong className="text-[#334155]">{pair.desierta.procedimiento}</strong></span>
                      <span>Importe: <strong className="text-[#0f172a]">{formatCurrency(pair.desierta.amount)}</strong></span>
                    </div>
                  </div>

                  {/* Flecha Central / Resumen de Transición */}
                  <div className="lg:col-span-2 flex flex-col items-center justify-center py-2 lg:py-0 border-y lg:border-y-0 lg:border-x border-[#f1f5f9] px-2 text-center">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64748b] mb-1">
                      <span>Re-licitado</span>
                      <ArrowRight className="h-3.5 w-3.5 text-[#0d9373]" />
                    </div>
                    {pair.diasTranscurridos !== null && (
                      <span className="text-[11px] text-[#0f172a] font-medium bg-[#f8fafc] px-2 py-0.5 rounded-full border border-[#e2e8f0]">
                        {pair.diasTranscurridos} días después
                      </span>
                    )}
                    {pair.diferenciaImporte !== 0 && (
                      <span className={`text-[10px] font-bold mt-1 ${pair.diferenciaImporte > 0 ? 'text-[#b45309]' : 'text-[#0d9373]'}`}>
                        {pair.diferenciaImporte > 0 ? `+${pair.pctVariacionImporte}%` : `${pair.pctVariacionImporte}%`} importe
                      </span>
                    )}
                    {pair.desierta.procedimiento !== pair.posterior.procedimiento && (
                      <span className="text-[9px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 mt-1" title="Cambio en el procedimiento de adjudicación">
                        Proc: {pair.desierta.procedimiento} → {pair.posterior.procedimiento}
                      </span>
                    )}
                  </div>

                  {/* Licitación Posterior Adjudicada */}
                  <div className="lg:col-span-5 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]">
                        Adjudicada Posteriormente
                      </span>
                      <span className="text-xs font-mono font-bold text-[#0f172a]">
                        {pair.posterior.case_number}
                      </span>
                      <span className="text-[11px] text-[#64748b]">
                        ({pair.posterior.year})
                      </span>
                    </div>

                    <Link
                      href={`/licitaciones/${encodeURIComponent(getPlacspId(pair.posterior.id) || pair.posterior.id)}`}
                      className="text-xs font-semibold text-[#1e293b] hover:text-[#0d9373] line-clamp-2 transition-colors flex items-center gap-1 group"
                    >
                      <span>{pair.posterior.object_description}</span>
                      <ExternalLink className="h-3 w-3 text-[#94a3b8] group-hover:text-[#0d9373] shrink-0 inline opacity-70" />
                    </Link>

                    <div className="flex items-center gap-3 text-[11px] text-[#64748b] flex-wrap">
                      <span>Adjudicatario: <strong className="text-[#0d9373]">{pair.posterior.awardee}</strong></span>
                      <span>Proc: <strong className="text-[#334155]">{pair.posterior.procedimiento}</strong></span>
                      <span>Importe: <strong className="text-[#0f172a]">{formatCurrency(pair.posterior.amount)}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {filteredPairs.length > 6 && (
              <div className="text-center pt-2">
                <button
                  onClick={() => setShowAllPairs(!showAllPairs)}
                  className="px-4 py-2 text-xs font-bold text-[#0d9373] bg-[#ecfdf5] hover:bg-[#d1fae5] border border-[#a7f3d0] rounded-lg transition-all"
                >
                  {showAllPairs
                    ? 'Mostrar solo los primeros 6 casos'
                    : `Ver todos los ${filteredPairs.length} casos de re-adjudicación detectados`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desglose por dimensiones (Pestañas) */}
      <div className="space-y-4 pt-4 border-t border-[#e2e8f0]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#1e293b]">
              Desglose y Tasas de Éxito de la Licitación
            </h3>
            <p className="text-xs text-[#64748b]">
              Análisis comparativo de procedimientos resueltos con adjudicatario frente a expedientes desiertos.
            </p>
          </div>

          <div className="flex p-1 bg-[#f1f5f9] rounded-xl self-start sm:self-auto shrink-0">
            <button
              onClick={() => setActiveTab('tipo')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'tipo'
                  ? 'bg-white text-[#0f172a] shadow-xs'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              Por Tipo
            </button>
            <button
              onClick={() => setActiveTab('procedimiento')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'procedimiento'
                  ? 'bg-white text-[#0f172a] shadow-xs'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              Por Procedimiento
            </button>
            <button
              onClick={() => setActiveTab('organismo')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'organismo'
                  ? 'bg-white text-[#0f172a] shadow-xs'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              Por Organismo
            </button>
            <button
              onClick={() => setActiveTab('evolucion')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'evolucion'
                  ? 'bg-white text-[#0f172a] shadow-xs'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              Evolución Anual
            </button>
          </div>
        </div>

        {/* Tab content: Tipo, Procedimiento, Organismo */}
        {activeTab !== 'evolucion' && (
          <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] text-[#475569] font-bold border-b border-[#e2e8f0]">
                  <th className="py-3 px-4">
                    {activeTab === 'tipo' ? 'Tipo de Contrato' : activeTab === 'procedimiento' ? 'Procedimiento' : 'Organismo'}
                  </th>
                  <th className="py-3 px-3 text-right">Adjudicadas</th>
                  <th className="py-3 px-3 text-right">Volumen Adj.</th>
                  <th className="py-3 px-3 text-right">Desiertas</th>
                  <th className="py-3 px-3 text-right">Volumen Desierto</th>
                  <th className="py-3 px-3 text-right">En Curso</th>
                  <th className="py-3 px-3 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Tasa Desiertas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9] bg-white">
                {(activeTab === 'tipo' ? porTipo : activeTab === 'procedimiento' ? porProcedimiento : porOrganismo).map((row) => (
                  <tr key={row.nombre} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-[#1e293b]">
                      {row.nombre}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#16a34a] font-bold">
                      {formatNumber(row.adjudicadas)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#64748b]">
                      {formatCompactCurrency(row.adjudicadasVol)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#d97706] font-bold">
                      {formatNumber(row.desiertas)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#64748b]">
                      {row.desiertasVol > 0 ? formatCompactCurrency(row.desiertasVol) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#2563eb]">
                      {row.enCurso > 0 ? formatNumber(row.enCurso) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#0f172a]">
                      {formatNumber(row.total)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <span className={`inline-block font-bold px-2 py-0.5 rounded-full text-[11px] ${
                        row.tasaDesiertasPct > 20
                          ? 'bg-[#fef2f2] text-[#dc2626] border border-[#fee2e2]'
                          : row.tasaDesiertasPct > 10
                          ? 'bg-[#fffbeb] text-[#b45309] border border-[#fef3c7]'
                          : 'bg-[#f0fdf4] text-[#16a34a] border border-[#dcfce7]'
                      }`}>
                        {row.tasaDesiertasPct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab content: Evolución Anual */}
        {activeTab === 'evolucion' && (
          <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] text-[#475569] font-bold border-b border-[#e2e8f0]">
                  <th className="py-3 px-4">Año</th>
                  <th className="py-3 px-3 text-right">Adjudicadas</th>
                  <th className="py-3 px-3 text-right">Desiertas</th>
                  <th className="py-3 px-3 text-right">Volumen Desierto</th>
                  <th className="py-3 px-3 text-right">En Curso</th>
                  <th className="py-3 px-3 text-right">Anuladas</th>
                  <th className="py-3 px-3 text-right">Total Licitaciones</th>
                  <th className="py-3 px-4 text-right">Tasa Desiertas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9] bg-white">
                {evolucion.map((row) => (
                  <tr key={row.year} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="py-2.5 px-4 font-bold text-[#1e293b]">
                      {row.year}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#16a34a] font-bold">
                      {formatNumber(row.adjudicadas)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#d97706] font-bold">
                      {formatNumber(row.desiertas)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#64748b]">
                      {row.volumenDesiertas > 0 ? formatCompactCurrency(row.volumenDesiertas) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#2563eb]">
                      {row.enCurso > 0 ? formatNumber(row.enCurso) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#dc2626]">
                      {row.anuladas > 0 ? formatNumber(row.anuladas) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#0f172a]">
                      {formatNumber(row.total)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <span className={`inline-block font-bold px-2 py-0.5 rounded-full text-[11px] ${
                        row.tasaDesiertasPct > 20
                          ? 'bg-[#fef2f2] text-[#dc2626] border border-[#fee2e2]'
                          : row.tasaDesiertasPct > 10
                          ? 'bg-[#fffbeb] text-[#b45309] border border-[#fef3c7]'
                          : 'bg-[#f0fdf4] text-[#16a34a] border border-[#dcfce7]'
                      }`}>
                        {row.tasaDesiertasPct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
