'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { getPlacspId } from '@/lib/placsp';
import { 
  TrendingDown, 
  AlertTriangle, 
  ShieldAlert, 
  Building2, 
  Search, 
  ChevronRight, 
  Users, 
  Info, 
  ArrowUpRight, 
  Award,
  Layers
} from 'lucide-react';
import { formatCurrency, formatCompactCurrency, formatNif } from '@/lib/format';
import type { BajaTemerariaStats } from '@/lib/db';

interface BajaTemerariaSectionProps {
  data: BajaTemerariaStats;
}

export function BajaTemerariaSection({ data }: BajaTemerariaSectionProps) {
  const [activeTab, setActiveTab] = useState<'top' | 'empresas' | 'tramos'>('top');
  const [searchQuery, setSearchQuery] = useState('');
  const [nivelFiltro, setNivelFiltro] = useState<'todos' | 'extrema' | 'muy_agresiva'>('todos');
  const [orden, setOrden] = useState<'baja' | 'importe'>('baja');

  const { resumen, tramos, topBajas, rankingEmpresas, diagnostico } = data;

  const bajasFiltradas = useMemo(() => {
    return topBajas
      .filter((b) => {
        if (nivelFiltro !== 'todos' && b.nivelRiesgo !== nivelFiltro) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesExp = b.expediente?.toLowerCase().includes(q);
          const matchesObj = b.objeto?.toLowerCase().includes(q);
          const matchesAdj = b.adjudicatario?.toLowerCase().includes(q);
          const matchesOrg = b.organo?.toLowerCase().includes(q);
          if (!matchesExp && !matchesObj && !matchesAdj && !matchesOrg) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (orden === 'importe') {
          return b.amount_excl_vat - a.amount_excl_vat;
        }
        return b.baja_pct - a.baja_pct;
      });
  }, [topBajas, nivelFiltro, searchQuery, orden]);

  return (
    <section id="baja-temeraria" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e2e8f0] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[#fef2f2] border border-[#fecaca] text-[#dc2626]">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#1e293b] flex items-center gap-2">
                <span>Bajas Acusadas y Descuentos Significativos</span>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c]">
                  Art. 149 LCSP
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Detección analítica de ofertas con descuentos elevados sobre el Presupuesto Base de Licitación. Señal estadística de revisión preventiva (Art. 149 LCSP).
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/metodologia#baja-temeraria"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#dc2626] hover:text-[#b91c1c] bg-[#fef2f2] hover:bg-[#fee2e2] border border-[#fecaca] px-3 py-1.5 rounded-lg transition-colors self-start sm:self-auto"
        >
          <Info className="h-3.5 w-3.5" />
          <span>Ver Metodología Art. 149</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Callout Legal LCSP */}
      <div className="p-4 rounded-xl bg-[#fef2f2] border border-[#fecaca] text-slate-700 text-xs sm:text-sm leading-relaxed flex items-start gap-3 shadow-2xs">
        <ShieldAlert className="h-5 w-5 text-[#dc2626] shrink-0 mt-0.5" />
        <div className="space-y-1.5">
          <p className="font-semibold text-[#991b1b]">
            Distinción legal y metodológica preceptiva (Art. 100, 101 y 149 LCSP)
          </p>
          <p className="text-slate-600 text-xs leading-relaxed">
            <strong>PBL vs VEC:</strong> La baja se calcula exclusivamente sobre el <strong>Presupuesto Base de Licitación (PBL sin IVA - Art. 100 LCSP)</strong> de la duración inicial ordinaria. El Valor Estimado del Contrato (VEC - Art. 101 LCSP) engloba prórrogas y modificaciones previstas y nunca debe usarse como denominador de la baja.
          </p>
          <p className="text-slate-600 text-xs leading-relaxed">
            <strong>Señal analítica preventiva:</strong> Un descuento elevado refleja un ahorro de gasto para el municipio, no una oferta anormalmente baja automática. Con 1 licitador (N=1) rige el umbral del 25% subsidiario del art. 85 RGLCAP o pliegos. Con 2 o más licitadores (N≥2), los datos sindicados de PLACSP no incluyen las ofertas no adjudicatarias; por ello, este módulo emite <strong>señales estadísticas de revisión</strong>. La presunción formal de temeridad exige cotejo de todas las ofertas y trámite de justificación contradictoria (art. 149.4 LCSP).
          </p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Contratos en riesgo */}
        <div className="mint-card p-5 border-l-4 border-l-[#dc2626] bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Bajas Elevadas (≥ 25%)</span>
            <div className="p-1.5 rounded-lg bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-[#991b1b]">
            {resumen.pctContratosRiesgo}%
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            <strong>{resumen.bajasExtremasCount + resumen.bajasAgresivasCount} de {resumen.totalEvaluados}</strong> licitaciones competitivas evaluadas con baja elevada respecto al PBL (señal de revisión).
          </p>
        </div>

        {/* Card 2: Bajas extremas */}
        <div className="mint-card p-5 border-l-4 border-l-[#ea580c] bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Bajas Muy Elevadas (≥ 40%)</span>
            <div className="p-1.5 rounded-lg bg-[#fff7ed] text-[#ea580c] border border-[#ffedd5]">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-[#c2410c]">
            {resumen.bajasExtremasCount}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Expedientes con rebajas superiores al 40% sobre el PBL; señal estadística de revisión para comprobar si se tramitó el art. 149 LCSP.
          </p>
        </div>

        {/* Card 3: Volumen en riesgo */}
        <div className="mint-card p-5 border-l-4 border-l-[#f59e0b] bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Volumen Adjudicado</span>
            <div className="p-1.5 rounded-lg bg-[#fffbeb] text-[#f59e0b] border border-[#fde68a]">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-[#1e293b]">
            {formatCompactCurrency(resumen.volumenEnRiesgo)}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Importe adjudicado en contratos con descuento elevado respecto al PBL (señal de revisión analítica).
          </p>
        </div>

        {/* Card 4: Baja media global */}
        <div className="mint-card p-5 border-l-4 border-l-[#0d9373] bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Rebaja Media Global</span>
            <div className="p-1.5 rounded-lg bg-[#ecfdf5] text-[#0d9373] border border-[#a7f3d0]">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-[#065f46]">
            -{resumen.bajaMediaGlobal}%
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Descuento medio ponderado de todas las adjudicaciones respecto al Presupuesto Base de Licitación (PBL).
          </p>
        </div>
      </div>

      {/* Tabs selector */}
      <div className="flex flex-wrap gap-2 border-b border-[#e2e8f0] pb-2">
        <button
          onClick={() => setActiveTab('top')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === 'top'
              ? 'bg-[#1e293b] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-[#e2e8f0]'
          }`}
        >
          <TrendingDown className="h-3.5 w-3.5" />
          <span>Top Bajas Acusadas ({topBajas.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('empresas')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === 'empresas'
              ? 'bg-[#1e293b] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-[#e2e8f0]'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          <span>Ranking Empresas con Bajas Elevadas ({rankingEmpresas.length})</span>
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
          <span>Tramos de Descuento</span>
        </button>
      </div>

      {/* TAB 1: EXPEDIENTES CON MAYOR DESCUENTO / BAJA ELEVADA */}
      {activeTab === 'top' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#f8fafb] p-3 rounded-xl border border-[#e2e8f0]">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por expediente, objeto, adjudicatario u órgano..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-[#cbd5e1] bg-white focus:outline-hidden focus:ring-2 focus:ring-[#dc2626]/30"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={nivelFiltro}
                onChange={(e) => setNivelFiltro(e.target.value as any)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-[#cbd5e1] bg-white text-slate-700 focus:outline-hidden"
              >
                <option value="todos">Todos los niveles ({topBajas.length})</option>
                <option value="extrema">Bajas Muy Elevadas ≥ 40% ({resumen.bajasExtremasCount})</option>
                <option value="muy_agresiva">Bajas Elevadas 25%-40% ({resumen.bajasAgresivasCount})</option>
              </select>

              <select
                value={orden}
                onChange={(e) => setOrden(e.target.value as any)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-[#cbd5e1] bg-white text-slate-700 focus:outline-hidden"
              >
                <option value="baja">Ordenar por % Descuento</option>
                <option value="importe">Ordenar por Presupuesto (€)</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-500 px-1 flex items-center justify-between">
            <span>Mostrando <strong>{bajasFiltradas.length}</strong> expedientes con descuento elevado respecto al PBL (señal de revisión)</span>
            <span className="text-[11px] text-slate-400 font-mono">Consulte el expediente e informes en PLACSP</span>
          </div>

          <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl bg-white shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8fafb] border-b border-[#e2e8f0] text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Expediente / Objeto</th>
                  <th className="py-3 px-3">Presupuesto (PBL)</th>
                  <th className="py-3 px-3">Adjudicado</th>
                  <th className="py-3 px-3">Rebaja (%)</th>
                  <th className="py-3 px-3">Licitadores</th>
                  <th className="py-3 px-3">Adjudicatario</th>
                  <th className="py-3 px-3 text-right">Pliegos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {bajasFiltradas.slice(0, 50).map((b) => {
                  const isExtrema = b.baja_pct >= 40;
                  return (
                    <tr key={b.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="py-3 px-4 max-w-sm">
                        <div className="font-mono font-semibold text-slate-700 text-[11px] mb-0.5 flex items-center gap-1.5">
                          <span>{b.expediente}</span>
                          <span className="font-sans text-[10px] px-2 py-0.2 rounded bg-slate-100 text-slate-600">
                            {b.tipo}
                          </span>
                        </div>
                        <Link
                          href={`/licitaciones/${encodeURIComponent(getPlacspId(b.id) || b.id)}`}
                          className="font-medium text-[#1e293b] hover:text-[#dc2626] line-clamp-2 leading-relaxed"
                          title={b.objeto}
                        >
                          {b.objeto}
                        </Link>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          <span>{b.organo}</span>
                          {b.year && <span>· {b.year}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        <div>{formatCurrency(b.importe_sin_iva)}</div>
                        {b.valor_estimado && b.valor_estimado > 0 && b.valor_estimado !== b.importe_sin_iva && (
                          <div className="text-[10px] text-slate-400 font-sans" title="Valor Estimado del Contrato (Art. 101 LCSP, incluye prórrogas/modificaciones previstas)">
                            VEC: {formatCompactCurrency(b.valor_estimado)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">
                        {formatCurrency(b.importe_adjudicacion)}
                      </td>
                      <td className="py-3 px-3 font-mono">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          isExtrema
                            ? 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]'
                            : 'bg-[#fff7ed] text-[#c2410c] border border-[#ffedd5]'
                        }`}>
                          <TrendingDown className="h-3 w-3" />
                          -{b.baja_pct}%
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Ahorro: {formatCompactCurrency(b.ahorro_euros)}
                        </div>
                        {b.posiblePrecioUnitario ? (
                          <div className="text-[9px] text-amber-800 font-sans mt-0.5 leading-tight font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Tarifa/precio unitario
                          </div>
                        ) : isExtrema ? (
                          <div className="text-[9px] text-[#b45309] font-sans mt-0.5 leading-tight font-medium">
                            Revisar si aplicó art. 149 LCSP
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-3 font-mono">
                        {b.num_ofertas === 1 ? (
                          <span className="inline-flex items-center gap-1 text-[#b45309] font-bold text-[10px] bg-[#fffbeb] px-2 py-0.5 rounded border border-[#fde68a]">
                            <Users className="h-3 w-3" />
                            1 única
                          </span>
                        ) : b.num_ofertas ? (
                          <span className="text-slate-600 font-semibold text-[11px]">
                            {b.num_ofertas} ofertas
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[10px]">No reg.</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-700 max-w-[180px] truncate" title={b.adjudicatario}>
                        {b.adjudicatario}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/licitaciones/${encodeURIComponent(getPlacspId(b.id) || b.id)}`}
                            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-[#dc2626] transition-colors"
                            title="Ver ficha interna del expediente"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                          {b.url && (
                            <a
                              href={b.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-md hover:bg-[#fef2f2] text-slate-400 hover:text-[#dc2626] transition-colors inline-flex items-center"
                              title="Auditar pliegos e informes del expediente en PLACSP oficial"
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

      {/* TAB 2: RANKING DE EMPRESAS CON BAJAS ELEVADAS */}
      {activeTab === 'empresas' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[#fff7ed] border border-[#ffedd5] text-slate-700 text-xs sm:text-sm">
            <p className="font-semibold text-[#c2410c] mb-1">
              Contratistas con Patrón Recurrente de Bajas Elevadas
            </p>
            <p className="text-slate-600 text-xs">
              Muestra las empresas que presentan de forma habitual descuentos superiores al 25% o 40% respecto al Presupuesto Base de Licitación en concursos públicos en Alcázar de San Juan (señal estadística descriptiva; no constituye calificación de anormalidad, la cual compete en exclusiva al órgano de contratación conforme al art. 149 LCSP).
            </p>
          </div>

          <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl bg-white shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8fafb] border-b border-[#e2e8f0] text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Contratista / Empresa</th>
                  <th className="py-3 px-3">Bajas Elevadas (≥ 25%)</th>
                  <th className="py-3 px-3">Bajas Extremas (≥ 40%)</th>
                  <th className="py-3 px-3">% de sus Contratos</th>
                  <th className="py-3 px-3">Baja Media</th>
                  <th className="py-3 px-3">Volumen Total</th>
                  <th className="py-3 px-3 text-right">Perfil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {rankingEmpresas.slice(0, 30).map((emp, idx) => (
                  <tr key={idx} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-800 max-w-xs">
                      <div className="truncate" title={emp.adjudicatario}>
                        {emp.adjudicatario}
                      </div>
                      {emp.nif && (
                        <span className="font-mono text-[10px] text-slate-400 font-normal">
                          {formatNif(emp.nif)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-[#c2410c]">
                      {emp.bajasAgresivas} de {emp.totalContratos}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-[#991b1b]">
                      {emp.bajasExtremas}
                    </td>
                    <td className="py-3 px-3 font-mono">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-700">{emp.pctBajasAgresivas}%</span>
                        <div className="w-16 bg-[#e2e8f0] rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-[#dc2626] h-full rounded-full" 
                            style={{ width: `${Math.min(emp.pctBajasAgresivas, 100)}%` }} 
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-800">
                      -{emp.bajaMediaPct}%
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">
                      {formatCurrency(emp.volumenTotal)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        href={`/empresas/${encodeURIComponent(emp.empresaId || emp.nif || emp.adjudicatario || emp.awardee)}`}
                        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-[#dc2626] transition-colors inline-flex items-center"
                        title="Ver perfil de la empresa"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TRAMOS DE DESCUENTO */}
      {activeTab === 'tramos' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tramos.map((t, idx) => {
              return (
                <div 
                  key={idx} 
                  className={`mint-card p-5 border-l-4 ${
                    t.level === 'alerta'
                      ? 'border-l-[#dc2626] bg-[#fef2f2]/20'
                      : t.level === 'advertencia'
                      ? 'border-l-[#ea580c]'
                      : t.level === 'moderada'
                      ? 'border-l-[#f59e0b]'
                      : 'border-l-[#0d9373]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800">{t.tramo}</span>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white border border-[#e2e8f0]">
                      {t.pct}%
                    </span>
                  </div>

                  <div className="text-2xl font-extrabold font-mono text-slate-900 mt-2">
                    {t.count} <span className="text-xs font-normal text-slate-500">contratos</span>
                  </div>

                  <div className="text-[11px] text-slate-500 font-mono mt-1">
                    Rango: {t.rango}
                  </div>

                  <div className="w-full bg-[#f1f5f9] rounded-full h-2 mt-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        t.level === 'alerta'
                          ? 'bg-[#dc2626]'
                          : t.level === 'advertencia'
                          ? 'bg-[#ea580c]'
                          : 'bg-[#0d9373]'
                      }`}
                      style={{ width: `${Math.max(t.pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-xs text-slate-600 leading-relaxed font-mono">
            <strong>Diagnóstico analítico de bajas:</strong> {diagnostico}
          </div>
        </div>
      )}
    </section>
  );
}
