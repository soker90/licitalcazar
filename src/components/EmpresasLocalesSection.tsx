'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  MapPin, 
  Building2, 
  Search, 
  ChevronRight, 
  Layers, 
  TrendingUp, 
  PieChart, 
  Globe2, 
  Briefcase, 
  ShieldCheck,
  Info
} from 'lucide-react';
import { formatCurrency, formatCompactCurrency } from '@/lib/format';
import type { EmpresasLocalesStats } from '@/lib/db';

interface EmpresasLocalesSectionProps {
  data: EmpresasLocalesStats;
}

export function EmpresasLocalesSection({ data }: EmpresasLocalesSectionProps) {
  const [activeTab, setActiveTab] = useState<'ambitos' | 'evolucion' | 'sectores' | 'ranking' | 'metodologia'>('ambitos');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroRanking, setFiltroRanking] = useState<'locales' | 'externas' | 'todas'>('todas');

  const { 
    resumen, 
    desgloseAmbitos, 
    evolucionAnual, 
    porTipoContrato, 
    topEmpresasLocales, 
    topEmpresasExternas 
  } = data;

  const filteredLocales = useMemo(() => {
    if (!searchQuery.trim()) return topEmpresasLocales;
    const q = searchQuery.toLowerCase();
    return topEmpresasLocales.filter(
      (e) => e.awardee.toLowerCase().includes(q) || (e.nif && e.nif.toLowerCase().includes(q)) || e.sede.toLowerCase().includes(q)
    );
  }, [topEmpresasLocales, searchQuery]);

  const filteredExternas = useMemo(() => {
    if (!searchQuery.trim()) return topEmpresasExternas;
    const q = searchQuery.toLowerCase();
    return topEmpresasExternas.filter(
      (e) => e.awardee.toLowerCase().includes(q) || (e.nif && e.nif.toLowerCase().includes(q)) || e.sede.toLowerCase().includes(q)
    );
  }, [topEmpresasExternas, searchQuery]);

  return (
    <section id="empresas-locales" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e2e8f0] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[#ecfdf5] border border-[#d1fae5] text-[#0d9373]">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#1e293b] flex items-center gap-2">
                <span>Empresas Locales vs. Externas: Impacto Territorial</span>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-[#ecfdf5] border border-[#d1fae5] text-[#0d9373]">
                  Registro Mercantil / BORME
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribución territorial del volumen contractual adjudicado según el domicilio registral de las entidades contratistas.
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/metodologia#empresas-locales"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0d9373] hover:text-[#0b7c61] bg-[#ecfdf5] hover:bg-[#d1fae5] border border-[#d1fae5] px-3 py-1.5 rounded-lg transition-colors self-start sm:self-auto"
        >
          <span>Metodología Territorial</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Volumen Local */}
        <div className="mint-card p-5 border-l-4 border-l-[#0d9373]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              Adjudicado a Empresas Locales
            </span>
            <div className="p-1.5 rounded-md bg-[#ecfdf5] text-[#0d9373]">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#0d9373] font-mono">
              {resumen.pctGastoLocal}%
            </span>
            <span className="text-xs text-slate-500 font-mono">
              ({formatCompactCurrency(resumen.volumenLocal)})
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Volumen adjudicado a empresas con domicilio registral en Alcázar
          </p>
        </div>

        {/* Contratos Locales */}
        <div className="mint-card p-5 border-l-4 border-l-[#10b981]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              Contratos a Empresas Locales
            </span>
            <div className="p-1.5 rounded-md bg-[#ecfdf5] text-[#10b981]">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#1e293b] font-mono">
              {resumen.pctContratosLocales}%
            </span>
            <span className="text-xs font-semibold text-[#10b981]">
              ({resumen.contratosLocales} contratos)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Casi 1 de cada 4 adjudicaciones recae en Alcázar
          </p>
        </div>

        {/* Retención Provincial (Ciudad Real) */}
        <div className="mint-card p-5 border-l-4 border-l-[#3b82f6]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              Total Ciudad Real (Provincia)
            </span>
            <div className="p-1.5 rounded-md bg-[#eff6ff] text-[#3b82f6]">
              <MapPin className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#2563eb] font-mono">
              {resumen.pctGastoProvincialTotal}%
            </span>
            <span className="text-xs text-slate-500 font-mono">
              ({formatCompactCurrency(resumen.volumenProvincialTotal)})
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Gasto acumulado en Alcázar y comarca/provincia
          </p>
        </div>

        {/* Fuga Nacional / Grandes Corporaciones */}
        <div className="mint-card p-5 border-l-4 border-l-[#e11d48]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              Grandes Corporaciones Externas
            </span>
            <div className="p-1.5 rounded-md bg-[#fff1f2] text-[#e11d48]">
              <Globe2 className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#e11d48] font-mono">
              {resumen.pctGastoNacionalTotal}%
            </span>
            <span className="text-xs text-slate-500 font-mono">
              ({formatCompactCurrency(resumen.volumenNacionalTotal)})
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Macroservicios (limpieza viaria, energía, grandes obras)
          </p>
        </div>
      </div>

      {/* Banner Diagnóstico */}
      <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] flex items-start gap-3 text-xs text-slate-700 leading-relaxed">
        <Info className="h-4 w-4 text-[#0d9373] mt-0.5 flex-shrink-0" />
        <div>
          <strong className="text-slate-900 block mb-0.5">Diagnóstico de Contratación Territorial:</strong>
          {resumen.diagnostico}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#e2e8f0]">
        <nav className="flex space-x-6 text-sm">
          <button
            onClick={() => setActiveTab('ambitos')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'ambitos'
                ? 'text-[#0d9373] border-b-2 border-[#0d9373]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <PieChart className="h-4 w-4" />
            <span>Reparto Territorial</span>
          </button>

          <button
            onClick={() => setActiveTab('evolucion')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'evolucion'
                ? 'text-[#0d9373] border-b-2 border-[#0d9373]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            <span>Evolución Anual</span>
          </button>

          <button
            onClick={() => setActiveTab('sectores')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'sectores'
                ? 'text-[#0d9373] border-b-2 border-[#0d9373]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Por Tipo de Contrato</span>
          </button>

          <button
            onClick={() => setActiveTab('ranking')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'ranking'
                ? 'text-[#0d9373] border-b-2 border-[#0d9373]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Top Empresas Locales vs. Externas</span>
          </button>

          <button
            onClick={() => setActiveTab('metodologia')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'metodologia'
                ? 'text-[#0d9373] border-b-2 border-[#0d9373]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Metodología BORME</span>
          </button>
        </nav>
      </div>

      {/* Tab 1: Reparto Territorial */}
      {activeTab === 'ambitos' && (
        <div className="space-y-6">
          {/* Barra apilada interactiva */}
          <div className="mint-card p-5 border border-[#e2e8f0] space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-slate-700 uppercase tracking-wider">
                Distribución Porcentual del Volumen Adjudicado ({formatCompactCurrency(resumen.totalVolumen)})
              </span>
            </div>

            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex">
              {desgloseAmbitos.map((a) => (
                <div
                  key={a.ambito}
                  className="h-full transition-all"
                  style={{ width: `${a.pctVolumen}%`, backgroundColor: a.color }}
                  title={`${a.nombre}: ${a.pctVolumen}% (${formatCurrency(a.volumen)})`}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
              {desgloseAmbitos.map((a) => (
                <div key={a.ambito} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                  <span className="text-slate-600 font-medium">{a.nombre}:</span>
                  <span className="font-bold font-mono text-slate-800">{a.pctVolumen}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tarjetas de Ámbitos */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {desgloseAmbitos.map((a) => (
              <div key={a.ambito} className="mint-card p-4 border border-[#e2e8f0] space-y-2 bg-white">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                  <h4 className="font-bold text-slate-800 text-xs truncate" title={a.nombre}>
                    {a.nombre}
                  </h4>
                </div>

                <div className="pt-1">
                  <div className="text-lg font-black text-[#1e293b] font-mono">
                    {formatCompactCurrency(a.volumen)}
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 font-mono">
                    {a.pctVolumen}% del gasto total
                  </span>
                </div>

                <div className="border-t border-[#f1f5f9] pt-2 text-[11px] text-slate-500 space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span>Contratos:</span>
                    <strong className="text-slate-700">{a.contratos} ({a.pctContratos}%)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Proveedores:</span>
                    <strong className="text-slate-700">{a.empresasDistintas}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Evolución Anual */}
      {activeTab === 'evolucion' && (
        <div className="mint-card overflow-hidden border border-[#e2e8f0]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8fafb] border-b border-[#e2e8f0] text-slate-600 font-mono uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Ejercicio</th>
                  <th className="py-3 px-4 text-right">Volumen Total</th>
                  <th className="py-3 px-4 text-right">Alcázar (Local)</th>
                  <th className="py-3 px-4 text-right">% Local</th>
                  <th className="py-3 px-4 text-right">Ciudad Real</th>
                  <th className="py-3 px-4 text-right">Castilla-La Mancha</th>
                  <th className="py-3 px-4 text-right">Nacional / Externas</th>
                  <th className="py-3 px-4 text-center">% Contratos Locales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {evolucionAnual.map((item) => (
                  <tr key={item.year} className="hover:bg-[#f8fafb] transition-colors font-mono">
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {item.year}
                    </td>

                    <td className="py-3 px-4 text-right font-bold text-slate-700">
                      {formatCurrency(item.totalVolumen)}
                    </td>

                    <td className="py-3 px-4 text-right font-bold text-[#0d9373]">
                      {formatCurrency(item.volumenLocal)}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#ecfdf5] text-[#0d9373]">
                        {item.pctLocal}%
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right text-slate-600">
                      {formatCurrency(item.volumenProvincial)}
                    </td>

                    <td className="py-3 px-4 text-right text-slate-600">
                      {formatCurrency(item.volumenRegional)}
                    </td>

                    <td className="py-3 px-4 text-right text-[#e11d48] font-semibold">
                      {formatCurrency(item.volumenNacional)}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700">
                        {item.totalContratos > 0 ? Math.round((item.contratosLocales / item.totalContratos) * 100) : 0}% ({item.contratosLocales}/{item.totalContratos})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Por Tipo de Contrato */}
      {activeTab === 'sectores' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {porTipoContrato.map((t) => (
              <div key={t.tipo} className="mint-card p-5 border border-[#e2e8f0] space-y-3">
                <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-2">
                  <h4 className="font-bold text-[#1e293b] text-sm flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4 text-[#0d9373]" />
                    <span>{t.tipo}</span>
                  </h4>
                  <span className="font-mono text-xs font-bold text-slate-700">
                    {formatCompactCurrency(t.totalVolumen)}
                  </span>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-[#0d9373] font-bold">Local (Alcázar): {formatCompactCurrency(t.volumenLocal)}</span>
                      <strong className="text-[#0d9373]">{t.pctLocal}%</strong>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-[#0d9373] h-full rounded-full" style={{ width: `${t.pctLocal}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-[#3b82f6] font-bold">Provincial (Ciudad Real): {formatCompactCurrency(t.volumenProvincial)}</span>
                      <strong className="text-[#3b82f6]">{t.pctProvincial}%</strong>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-[#3b82f6] h-full rounded-full" style={{ width: `${t.pctProvincial}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-[#e11d48] font-bold">Nacional / Externas: {formatCompactCurrency(t.volumenNacional)}</span>
                      <strong className="text-[#e11d48]">{t.pctNacional}%</strong>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-[#e11d48] h-full rounded-full" style={{ width: `${t.pctNacional}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Top Empresas Locales vs. Externas */}
      {activeTab === 'ranking' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#f8fafb] p-3.5 rounded-xl border border-[#e2e8f0]">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por empresa o NIF..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#e2e8f0] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#0d9373]/20 focus:border-[#0d9373]"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filtroRanking}
                onChange={(e) => setFiltroRanking(e.target.value as any)}
                className="text-xs bg-white border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 focus:outline-hidden"
              >
                <option value="todas">Todas las adjudicatarias</option>
                <option value="locales">Solo empresas locales de Alcázar</option>
                <option value="externas">Solo empresas nacionales / externas</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Locales */}
            {(filtroRanking === 'todas' || filtroRanking === 'locales') && (
              <div className="mint-card p-5 border border-[#e2e8f0] space-y-4">
                <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-[#0d9373]" />
                    <h3 className="font-bold text-[#1e293b] text-sm">
                      Top Empresas Locales (Alcázar de San Juan)
                    </h3>
                  </div>
                  <span className="text-xs text-[#0d9373] font-mono font-bold">
                    {filteredLocales.length} firmas
                  </span>
                </div>

                <div className="divide-y divide-[#e2e8f0]">
                  {filteredLocales.slice(0, 12).map((e, idx) => (
                    <div key={e.awardee} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-400 w-4">
                            #{idx + 1}
                          </span>
                          <span className="font-bold text-slate-800">
                            {e.awardee}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                          <span>{e.contratos} contrato(s)</span>
                          <span>{e.tipoPrincipal}</span>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <span className="font-bold text-[#0d9373] block">
                          {formatCurrency(e.volumen)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {e.sede}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Externas */}
            {(filtroRanking === 'todas' || filtroRanking === 'externas') && (
              <div className="mint-card p-5 border border-[#e2e8f0] space-y-4">
                <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
                  <div className="flex items-center gap-2">
                    <Globe2 className="h-4 w-4 text-[#e11d48]" />
                    <h3 className="font-bold text-[#1e293b] text-sm">
                      Top Corporaciones Nacionales / Externas
                    </h3>
                  </div>
                  <span className="text-xs text-[#e11d48] font-mono font-bold">
                    {filteredExternas.length} firmas
                  </span>
                </div>

                <div className="divide-y divide-[#e2e8f0]">
                  {filteredExternas.slice(0, 12).map((e, idx) => (
                    <div key={e.awardee} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-400 w-4">
                            #{idx + 1}
                          </span>
                          <span className="font-bold text-slate-800">
                            {e.awardee}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                          <span>{e.contratos} contrato(s)</span>
                          <span>{e.tipoPrincipal}</span>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <span className="font-bold text-[#e11d48] block">
                          {formatCurrency(e.volumen)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {e.sede}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Metodología BORME */}
      {activeTab === 'metodologia' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="mint-card p-6 border-l-4 border-l-[#0d9373] space-y-3 bg-[#f8fafb]">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5] inline-block font-mono">
              Criterio de Asignación Territorial (BORME / CIF)
            </span>
            <h3 className="text-base font-bold text-[#1e293b]">
              Determinación de la Sede Social
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              En España, el Código de Identificación Fiscal (CIF) de las sociedades mercantiles codifica en sus dos primeros dígitos numéricos la <strong>provincia de matriculación en el Registro Mercantil</strong>.
            </p>
            <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
              <li><strong>Código 13 (Ciudad Real)</strong>: Adjudicatarias registradas en la provincia de Ciudad Real. Se cruza con el domicilio de Alcázar de San Juan (CP 13600) para aislar las empresas estrictamente locales.</li>
              <li><strong>Códigos 02, 16, 19 y 45</strong>: Provincias de Albacete, Cuenca, Guadalajara y Toledo (Castilla-La Mancha).</li>
              <li><strong>Código 28, 08, 46 y resto</strong>: Madrid, Barcelona, Valencia y corporaciones multinacionales con sede central.</li>
            </ul>
          </div>

          <div className="mint-card p-6 border-l-4 border-l-[#3b82f6] space-y-3 bg-[#f8fafb]">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe] inline-block font-mono">
              Tratamiento de Autónomos y Comercios
            </span>
            <h3 className="text-base font-bold text-[#1e293b]">
              Personas Físicas y Proveedores Menores
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Los autónomos y pequeños comerciantes que facturan mediante contratos menores o compras de suministro directo se identifican mediante DNI/NIE con residencia fiscal y actividad efectiva en el municipio de Alcázar de San Juan.
            </p>
            <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
              <li>Contratos de mantenimiento, cerrajería, pintura, fontanería, suministros escolares y artes gráficas locales.</li>
              <li>Asignación al cómputo de empresas y profesionales con domicilio registral o fiscal en Alcázar de San Juan.</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
