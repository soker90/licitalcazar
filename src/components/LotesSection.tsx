'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { getPlacspId } from '@/lib/placsp';
import { 
  Layers, 
  Boxes, 
  CheckCircle2, 
  ExternalLink, 
  Search, 
  Building2, 
  Users, 
  TrendingUp, 
  Filter, 
  Info, 
  ChevronRight,
  ShieldAlert,
  ArrowUpRight
} from 'lucide-react';
import { formatCurrency, formatCompactCurrency, formatPercent } from '@/lib/format';
import type { LotesStats } from '@/lib/db';

interface LotesSectionProps {
  data: LotesStats;
}

export function LotesSection({ data }: LotesSectionProps) {
  const [activeTab, setActiveTab] = useState<'grandes' | 'lotizados' | 'tramos' | 'tipologia'>('grandes');
  const [searchQuery, setSearchQuery] = useState('');
  const [soloOfertaUnica, setSoloOfertaUnica] = useState(false);
  const [tipoFiltro, setTipoFiltro] = useState('todos');

  const { resumen, porTipo, porAno, porTramo, grandesNoLotizados, contratosLotizados, diagnostico } = data;

  // Filtered list of large single-lot contracts
  const grandesFiltrados = useMemo(() => {
    return grandesNoLotizados.filter((c) => {
      if (soloOfertaUnica && c.offer_count !== 1) return false;
      if (tipoFiltro !== 'todos' && c.tipo.toLowerCase() !== tipoFiltro.toLowerCase()) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesExp = c.case_number?.toLowerCase().includes(q);
        const matchesObj = c.object_description?.toLowerCase().includes(q);
        const matchesAdj = c.awardee?.toLowerCase().includes(q);
        const matchesOrg = c.organo?.toLowerCase().includes(q);
        if (!matchesExp && !matchesObj && !matchesAdj && !matchesOrg) return false;
      }
      return true;
    });
  }, [grandesNoLotizados, soloOfertaUnica, tipoFiltro, searchQuery]);

  // Unique types in grandes contracts
  const tiposGrandes = useMemo(() => {
    const set = new Set<string>();
    grandesNoLotizados.forEach((c) => {
      if (c.tipo) set.add(c.tipo);
    });
    return Array.from(set).sort();
  }, [grandesNoLotizados]);

  return (
    <section id="lotes" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e2e8f0] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[#ecfdf5] border border-[#a7f3d0] text-[#0d9373]">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#1e293b] flex items-center gap-2">
                <span>División en Lotes y Acceso de PYMEs</span>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-[#f8fafb] border border-[#cbd5e1] text-slate-700">
                  Art. 99 LCSP
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Cumplimiento de la regla general de división en lotes, barreras de entrada y correlación empírica con la oferta única.
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/metodologia#division-lotes"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0d9373] hover:text-[#0b7a5f] bg-[#ecfdf5] hover:bg-[#d1fae5] border border-[#a7f3d0] px-3 py-1.5 rounded-lg transition-colors self-start sm:self-auto"
        >
          <Info className="h-3.5 w-3.5" />
          <span>Ver Metodología Art. 99</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Callout Legal LCSP */}
      <div className="p-4 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] text-slate-700 text-xs sm:text-sm leading-relaxed flex items-start gap-3 shadow-2xs">
        <ShieldAlert className="h-5 w-5 text-[#0d9373] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-[#065f46]">
            Marco Legal Vinculante: Principio de División en Lotes (Ley 9/2017 LCSP)
          </p>
          <p className="text-slate-600 text-xs">
            El <strong>artículo 99.3 de la LCSP</strong> consagra la división en lotes como la regla general obligatoria de la contratación pública para fomentar la competencia y facilitar el acceso a la licitación de pequeñas y medianas empresas (PYMEs). Cuando el órgano de contratación adjudica en un único lote, <em>debe justificar motivadamente en el expediente</em> las razones técnicas o económicas de dicha decisión.
          </p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Grandes contratos sin lotes */}
        <div className="mint-card p-5 border-l-4 border-l-[#ef4444] bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Lote Único en Contratos ≥ 100k€</span>
            <div className="p-1.5 rounded-lg bg-[#fef2f2] text-[#ef4444] border border-[#fecaca]">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-[#991b1b]">
            {formatPercent(100 - resumen.pctLotizadosGrandes100k, 1)}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            <strong>{resumen.totalGrandes100k - resumen.lotizadosGrandes100k} de {resumen.totalGrandes100k}</strong> grandes licitaciones adjudicadas como paquete único sin fragmentar.
          </p>
        </div>

        {/* Card 2: Tasa global de lotización */}
        <div className="mint-card p-5 border-l-4 border-l-[#f59e0b] bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Lotización Contratos Mayores</span>
            <div className="p-1.5 rounded-lg bg-[#fffbeb] text-[#f59e0b] border border-[#fde68a]">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-[#1e293b]">
            {resumen.pctLotizadosMayores}%
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Apenas <strong>{resumen.lotizadosMayores} de {resumen.totalMayores}</strong> contratos no menores se dividieron en lotes ({formatCompactCurrency(resumen.volumenLotizados)}).
          </p>
        </div>

        {/* Card 3: Concurrencia comparada */}
        <div className="mint-card p-5 border-l-4 border-l-[#0d9373] bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Licitadores: Lotes vs. Único</span>
            <div className="p-1.5 rounded-lg bg-[#ecfdf5] text-[#0d9373] border border-[#a7f3d0]">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-[#065f46] flex items-baseline gap-2">
            <span>{resumen.concurrencia.mediaOfertasLotizados}</span>
            <span className="text-xs font-normal text-slate-400">vs {resumen.concurrencia.mediaOfertasNoLotizados}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            En la muestra competitiva (n={resumen.concurrencia.lotesEvaluados} lotes vs n={resumen.concurrencia.contratosEvaluadosNoLotizados} contratos únicos), se comparan las ofertas registradas en cada unidad competitiva.
          </p>
        </div>

        {/* Card 4: Reducción de oferta única */}
        <div className="mint-card p-5 border-l-4 border-l-[#2563eb] bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Tasa de Oferta Única</span>
            <div className="p-1.5 rounded-lg bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-[#1e40af] flex items-baseline gap-2">
            <span>{resumen.concurrencia.pctOfertaUnicaLotizados}%</span>
            <span className="text-xs font-normal text-slate-400">vs {resumen.concurrencia.pctOfertaUnicaNoLotizados}%</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            En la muestra competitiva, la proporción de oferta única se calcula por lote en expedientes lotizados y por contrato en los no lotizados.
          </p>
        </div>
      </div>

      {/* Tabs selector */}
      <div className="flex flex-wrap gap-2 border-b border-[#e2e8f0] pb-2">
        <button
          onClick={() => setActiveTab('grandes')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === 'grandes'
              ? 'bg-[#1e293b] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-[#e2e8f0]'
          }`}
        >
          <Boxes className="h-3.5 w-3.5" />
          <span>Grandes Contratos Lote Único ({grandesNoLotizados.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('lotizados')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === 'lotizados'
              ? 'bg-[#1e293b] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-[#e2e8f0]'
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-[#10b981]" />
          <span>Contratos Divididos en Lotes ({contratosLotizados.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('tramos')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === 'tramos'
              ? 'bg-[#1e293b] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-[#e2e8f0]'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Tramos de Presupuesto</span>
        </button>

        <button
          onClick={() => setActiveTab('tipologia')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === 'tipologia'
              ? 'bg-[#1e293b] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-[#e2e8f0]'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          <span>Por Objeto y Año</span>
        </button>
      </div>

      {/* TAB 1: GRANDES CONTRATOS EN LOTE ÚNICO (>= 100.000 €) */}
      {activeTab === 'grandes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#f8fafb] p-3 rounded-xl border border-[#e2e8f0]">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por objeto, expediente, adjudicatario u órgano..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-[#cbd5e1] bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0d9373]/30"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-[#cbd5e1] bg-white text-slate-700 focus:outline-hidden"
              >
                <option value="todos">Todos los tipos ({grandesNoLotizados.length})</option>
                {tiposGrandes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <button
                onClick={() => setSoloOfertaUnica(!soloOfertaUnica)}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 border ${
                  soloOfertaUnica
                    ? 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border-[#cbd5e1]'
                }`}
              >
                <Users className="h-3 w-3" />
                <span>Solo Oferta Única</span>
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-500 px-1 flex items-center justify-between">
            <span>Mostrando <strong>{grandesFiltrados.length}</strong> de {grandesNoLotizados.length} contratos grandes en lote único</span>
            <span className="text-[11px] text-slate-400 font-mono">Consulte la justificación técnica en los pliegos de PLACSP</span>
          </div>

          <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl bg-white shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8fafb] border-b border-[#e2e8f0] text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Expediente / Objeto</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-3">Importe Adjudicado</th>
                  <th className="py-3 px-3">Licitadores</th>
                  <th className="py-3 px-3">Adjudicatario</th>
                  <th className="py-3 px-3 text-right">Pliegos / PLACSP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {grandesFiltrados.slice(0, 50).map((c) => {
                  const esUnico = c.offer_count === 1;
                  return (
                    <tr key={c.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="py-3 px-4 max-w-sm">
                        <div className="font-mono font-semibold text-slate-700 text-[11px] mb-0.5">
                          {c.case_number}
                        </div>
                        <Link
                          href={`/licitaciones/${encodeURIComponent(getPlacspId(c.id) || c.id)}`}
                          className="font-medium text-[#1e293b] hover:text-[#0d9373] line-clamp-2 leading-relaxed"
                          title={c.object_description}
                        >
                          {c.object_description}
                        </Link>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          <span>{c.organo}</span>
                          {c.year && <span>· {c.year}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-[#f1f5f9] text-slate-700 border border-[#e2e8f0]">
                          {c.tipo}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">
                        {c.amount == null ? '—' : formatCurrency(c.amount)}
                      </td>
                      <td className="py-3 px-3 font-mono">
                        {esUnico ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#fffbeb] text-[#b45309] border border-[#fde68a]">
                            <Users className="h-3 w-3" />
                            1 oferta (Único)
                          </span>
                        ) : c.offer_count ? (
                          <span className="text-slate-600 font-semibold text-[11px]">
                            {c.offer_count} ofertas
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[10px]">No reg.</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-700 max-w-[180px] truncate" title={c.awardee || ''}>
                        {c.awardee || 'Sin adjudicatario'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/licitaciones/${encodeURIComponent(getPlacspId(c.id) || c.id)}`}
                            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-[#0d9373] transition-colors"
                            title="Ver ficha interna del expediente"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                          {c.url && (
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-md hover:bg-[#ecfdf5] text-slate-400 hover:text-[#0d9373] transition-colors inline-flex items-center"
                              title="Auditar pliegos y justificación art. 99 LCSP en PLACSP oficial"
                            >
                              <ArrowUpRight className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CONTRATOS LOTIZADOS DETECTADOS */}
      {activeTab === 'lotizados' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[#ecfdf5] border border-[#a7f3d0] text-slate-700 text-xs sm:text-sm">
            <p className="font-semibold text-[#065f46] mb-1">
              Buenas Prácticas de Contratación: Expedientes con División en Lotes
            </p>
            <p className="text-slate-600 text-xs">
              Estos contratos dividieron formalmente sus prestaciones en submódulos (lotes 1, 2, 3...), permitiendo a distintas empresas locales y PYMEs ofertar a partes específicas del contrato según su especialización técnica.
            </p>
          </div>

          <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl bg-white shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8fafb] border-b border-[#e2e8f0] text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Expediente / Objeto</th>
                  <th className="py-3 px-3">Lotes</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-3">Importe Adjudicado</th>
                  <th className="py-3 px-3">Licitadores</th>
                  <th className="py-3 px-3">Adjudicatario</th>
                  <th className="py-3 px-3 text-right">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {contratosLotizados.map((c) => (
                  <tr key={c.id} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="py-3 px-4 max-w-sm">
                      <div className="font-mono font-semibold text-slate-700 text-[11px] mb-0.5">
                        {c.case_number}
                      </div>
                      <Link
                        href={`/licitaciones/${encodeURIComponent(getPlacspId(c.id) || c.id)}`}
                        className="font-medium text-[#1e293b] hover:text-[#0d9373] line-clamp-2 leading-relaxed"
                        title={c.object_description}
                      >
                        {c.object_description}
                      </Link>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        <span>{c.organo}</span>
                        {c.year && <span>· {c.year}</span>}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]">
                        <Layers className="h-3 w-3 text-[#10b981]" />
                        {c.numLotes || 2} lotes
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-[#f1f5f9] text-slate-700 border border-[#e2e8f0]">
                        {c.tipo}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">
                      {c.amount == null ? '—' : formatCurrency(c.amount)}
                    </td>
                    <td className="py-3 px-3 font-mono">
                      {c.offer_count ? (
                        <span className="text-[#065f46] font-semibold text-[11px]">
                          {c.offer_count} ofertas
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[10px]">Licitado</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-700 max-w-[180px] truncate" title={c.awardee || ''}>
                      {c.awardee || 'Varios adjudicatarios'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/licitaciones/${encodeURIComponent(getPlacspId(c.id) || c.id)}`}
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-[#0d9373] transition-colors"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                        {c.url && (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-md hover:bg-[#ecfdf5] text-slate-400 hover:text-[#0d9373] transition-colors inline-flex items-center"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TRAMOS DE PRESUPUESTO */}
      {activeTab === 'tramos' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {porTramo.map((t, idx) => {
              const isMega = t.tramo.includes('Megacontratos');
              const isGrandes = t.tramo.includes('Grandes');
              return (
                <div 
                  key={idx} 
                  className={`mint-card p-5 border-l-4 ${
                    isMega
                      ? 'border-l-[#ef4444] bg-[#fef2f2]/20'
                      : isGrandes
                      ? 'border-l-[#f59e0b]'
                      : 'border-l-[#0d9373]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800">{t.tramo}</span>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white border border-[#e2e8f0]">
                      {t.pctLotizados}% lotizado
                    </span>
                  </div>

                  <div className="text-xl font-extrabold font-mono text-slate-900 mt-2">
                    {formatCompactCurrency(t.volumenTotal)}
                  </div>

                  <div className="w-full bg-[#f1f5f9] rounded-full h-2 mt-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        t.pctLotizados > 0 ? 'bg-[#10b981]' : 'bg-slate-300'
                      }`}
                      style={{ width: `${Math.max(t.pctLotizados, 2)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 font-mono">
                    <span>{t.lotizados} lotizados de {t.totalContratos}</span>
                    <span>{formatCompactCurrency(t.volumenLotizados)} en lotes</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Diagnostic note */}
          <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-xs text-slate-600 leading-relaxed font-mono">
            <strong>Diagnóstico del modelo de contratación:</strong> {diagnostico}
          </div>
        </div>
      )}

      {/* TAB 4: POR OBJETO Y EVOLUCIÓN ANUAL */}
      {activeTab === 'tipologia' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tipología */}
          <div className="mint-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Filter className="h-4 w-4 text-[#0d9373]" />
              <span>Lotización por Tipo de Contrato (Mayores)</span>
            </h3>

            <div className="space-y-3">
              {porTipo.map((t, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafb] space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">{t.tipo}</span>
                    <span className="font-mono font-bold text-slate-700">
                      {t.pctLotizados}% ({t.lotizados} de {t.totalMayores})
                    </span>
                  </div>
                  <div className="w-full bg-[#e2e8f0] rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#0d9373] transition-all"
                      style={{ width: `${Math.min(t.pctLotizados * 2, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>Volumen total: {formatCompactCurrency(t.volumenTotal)}</span>
                    <span>En lotes: {formatCompactCurrency(t.volumenLotizados)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Evolución anual */}
          <div className="mint-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#2563eb]" />
              <span>Evolución Anual de Lotización (2018-2026)</span>
            </h3>

            <div className="space-y-2.5">
              {porAno.map((y) => (
                <div key={y.year} className="flex items-center justify-between p-2.5 rounded-lg border border-[#e2e8f0] hover:bg-slate-50 text-xs">
                  <span className="font-mono font-bold text-slate-800">{y.year}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 text-[11px]">
                      {y.lotizados} de {y.totalMayores} contratos
                    </span>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                      y.pctLotizados > 0 
                        ? 'bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]' 
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      {y.pctLotizados}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
