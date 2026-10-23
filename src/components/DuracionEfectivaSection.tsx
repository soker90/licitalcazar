'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { getPlacspId } from '@/lib/placsp';
import { 
  Clock, 
  AlertTriangle, 
  ShieldAlert, 
  Building2, 
  Search, 
  ChevronRight, 
  ArrowUpRight, 
  Layers, 
  Scale, 
  TrendingUp, 
  CalendarClock, 
  Hourglass,
  Info
} from 'lucide-react';
import { formatCurrency, formatCompactCurrency, formatNif } from '@/lib/format';
import type { DuracionEfectivaStats } from '@/lib/db';

interface DuracionEfectivaSectionProps {
  data: DuracionEfectivaStats;
}

export function DuracionEfectivaSection({ data }: DuracionEfectivaSectionProps) {
  const [activeTab, setActiveTab] = useState<'top' | 'obras' | 'tramos' | 'organismos' | 'normativa'>('top');
  const [searchQuery, setSearchQuery] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'obras' | 'servicios' | 'criticos' | 'discrepancias'>('todos');
  const [gravedadFiltro, setGravedadFiltro] = useState<'todas' | 'extrema' | 'muy_alta' | 'notable' | 'moderada'>('todas');
  const [orden, setOrden] = useState<'ratio' | 'dias' | 'importe'>('ratio');

  const VISIBLE_LIMIT = 100;

  const { 
    resumen, 
    tramosDesviacion, 
    porTipoContrato, 
    porOrganismo, 
    rankingObrasDemora, 
    contratosConDilacion
  } = data;

  const contratosFiltrados = useMemo(() => {
    return contratosConDilacion
      .filter((item) => {
        if (gravedadFiltro === 'extrema' && !(item.ratioDuracion > 5)) return false;
        if (gravedadFiltro === 'muy_alta' && !(item.ratioDuracion > 3 && item.ratioDuracion <= 5)) return false;
        if (gravedadFiltro === 'notable' && !(item.ratioDuracion >= 1.5 && item.ratioDuracion <= 3)) return false;
        if (gravedadFiltro === 'moderada' && !(item.ratioDuracion > 1.05 && item.ratioDuracion < 1.5)) return false;

        if (tipoFiltro === 'obras' && !item.tipo.toLowerCase().includes('obra')) return false;
        if (tipoFiltro === 'servicios' && !item.tipo.toLowerCase().includes('servicio')) return false;
        if (tipoFiltro === 'criticos' && !item.alertaArt29) return false;
        if (tipoFiltro === 'discrepancias' && !item.esDiscrepanciaRegistral) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesExp = item.case_number?.toLowerCase().includes(q);
          const matchesObj = item.object_description?.toLowerCase().includes(q);
          const matchesAdj = item.awardee?.toLowerCase().includes(q);
          const matchesOrg = item.organo?.toLowerCase().includes(q);
          if (!matchesExp && !matchesObj && !matchesAdj && !matchesOrg) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (orden === 'dias') {
          return b.desviacionDias - a.desviacionDias;
        }
        if (orden === 'importe') {
          return (b.amount ?? -Infinity) - (a.amount ?? -Infinity);
        }
        return b.ratioDuracion - a.ratioDuracion;
      });
  }, [contratosConDilacion, gravedadFiltro, tipoFiltro, searchQuery, orden]);

  return (
    <section id="duracion-efectiva" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e2e8f0] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[#eff6ff] border border-[#bfdbfe] text-[#2563eb]">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#1e293b] flex items-center gap-2">
                <span>Duración registrada vs. prevista: Prórrogas y desvíos registrales</span>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-[#eff6ff] border border-[#bfdbfe] text-[#1d4ed8]">
                  Art. 29 y 195 LCSP
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparativa entre la duración prevista en pliegos y la fecha de última publicación registrada en PLACSP (control del límite de 5 años y detección de desfases registrales).
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/metodologia#duracion-efectiva"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1d4ed8] hover:text-[#1e40af] bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#bfdbfe] px-3 py-1.5 rounded-lg transition-colors self-start sm:self-auto"
        >
          <span>Metodología Art. 29/195</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Contratos con Desviación */}
        <div className="mint-card p-5 border-l-4 border-l-[#3b82f6]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              Contratos con Dilación
            </span>
            <div className="p-1.5 rounded-md bg-[#eff6ff] text-[#2563eb]">
              <Hourglass className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#1e293b] font-mono">
              {resumen.conDesviacion}
            </span>
            <span className="text-xs font-semibold text-[#2563eb]">
              ({resumen.pctConDesviacion}% del total)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            De {resumen.totalEvaluados} contratos evaluados con plazo oficial
          </p>
        </div>

        {/* Ratio Medio Global */}
        <div className="mint-card p-5 border-l-4 border-l-[#f59e0b]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              Ratio Medio Duración
            </span>
            <div className="p-1.5 rounded-md bg-[#fffbeb] text-[#d97706]">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#d97706] font-mono">
              {resumen.ratioMedioGlobal}x
            </span>
            <span className="text-xs text-slate-500">sobre plazo pliego</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Vida real media multiplica el plazo contractual previsto
          </p>
        </div>

        {/* Desviación Registrada Media */}
        <div className="mint-card p-5 border-l-4 border-l-[#e11d48]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              Desviación Registrada Media
            </span>
            <div className="p-1.5 rounded-md bg-[#fff1f2] text-[#e11d48]">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#e11d48] font-mono">
              +{resumen.desviacionMediaDias}
            </span>
            <span className="text-xs text-slate-500">días adicionales</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Volumen con dilación: {formatCompactCurrency(resumen.volumenConDesviacion)}
          </p>
        </div>

        {/* Casos Críticos Art. 29 */}
        <div className="mint-card p-5 border-l-4 border-l-[#dc2626]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              Críticos Art. 29 LCSP
            </span>
            <div className="p-1.5 rounded-md bg-[#fef2f2] text-[#dc2626]">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#dc2626] font-mono">
              {resumen.casosCriticosArt29}
            </span>
            <span className="text-xs text-[#dc2626] font-semibold">casos de riesgo</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Superan tope de 5 años o sufren dilación severa &gt;2,5x
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#e2e8f0]">
        <nav className="flex space-x-6 text-sm">
          <button
            onClick={() => setActiveTab('top')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'top'
                ? 'text-[#2563eb] border-b-2 border-[#2563eb]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <CalendarClock className="h-4 w-4" />
            <span>Ranking de Contratos por Dilación</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-[#eff6ff] text-[#1d4ed8] font-mono font-bold">
              {resumen.conDesviacion}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('obras')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'obras'
                ? 'text-[#2563eb] border-b-2 border-[#2563eb]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Retrasos en Obras Públicas</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-mono font-bold">
              {rankingObrasDemora.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('tramos')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'tramos'
                ? 'text-[#2563eb] border-b-2 border-[#2563eb]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            <span>Distribución por Tramos</span>
          </button>

          <button
            onClick={() => setActiveTab('organismos')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'organismos'
                ? 'text-[#2563eb] border-b-2 border-[#2563eb]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Por Ente y Tipo de Objeto</span>
          </button>

          <button
            onClick={() => setActiveTab('normativa')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'normativa'
                ? 'text-[#2563eb] border-b-2 border-[#2563eb]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Scale className="h-4 w-4" />
            <span>Régimen Legal (Art. 29 y 195)</span>
          </button>
        </nav>
      </div>

      {/* Tab 1: Ranking General de Contratos */}
      {activeTab === 'top' && (
        <div className="space-y-4">
          {/* Controles de filtro */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#f8fafb] p-3.5 rounded-xl border border-[#e2e8f0]">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por expediente, objeto, empresa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#e2e8f0] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value as any)}
                className="text-xs bg-white border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-[#2563eb]"
              >
                <option value="todos">Todos los contratos con dilación</option>
                <option value="criticos">Críticos: Art. 29 LCSP (&gt;2,5x o &gt;5 años)</option>
                <option value="obras">Solo Obras Públicas</option>
                <option value="servicios">Solo Servicios y Suministros</option>
                <option value="discrepancias">⚠️ Posible anomalía registral o desfase en PLACSP</option>
              </select>

              <select
                value={orden}
                onChange={(e) => setOrden(e.target.value as any)}
                className="text-xs bg-white border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-[#2563eb]"
              >
                <option value="ratio">Ordenar por Ratio (veces plazo)</option>
                <option value="dias">Ordenar por Días de retraso</option>
                <option value="importe">Ordenar por Importe (€)</option>
              </select>
            </div>
          </div>

          {/* Filtro rápido por gravedad */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: 'todas', label: 'Todas', count: resumen.conDesviacion, color: 'slate' },
              { key: 'extrema', label: 'Extrema >5x (Revisión registral)', count: resumen.mas5xCount, color: 'red' },
              { key: 'muy_alta', label: 'Muy alta 3–5x', count: resumen.de3xa5xCount, color: 'orange' },
              { key: 'notable', label: 'Notable 1.5–3x', count: resumen.de1_5xa3xCount, color: 'amber' },
              { key: 'moderada', label: 'Moderada 1.05–1.5x', count: resumen.hasta1_5xCount, color: 'blue' },
            ].map((chip) => {
              const active = gravedadFiltro === chip.key;
              const colorClasses: Record<string, { active: string; inactive: string }> = {
                slate: { active: 'bg-slate-800 text-white border-slate-800', inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50' },
                red: { active: 'bg-red-600 text-white border-red-600', inactive: 'bg-white text-red-700 border-red-200 hover:bg-red-50' },
                orange: { active: 'bg-orange-600 text-white border-orange-600', inactive: 'bg-white text-orange-700 border-orange-200 hover:bg-orange-50' },
                amber: { active: 'bg-amber-500 text-white border-amber-500', inactive: 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50' },
                blue: { active: 'bg-blue-600 text-white border-blue-600', inactive: 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50' },
              };
              const cls = colorClasses[chip.color];
              return (
                <button
                  key={chip.key}
                  onClick={() => setGravedadFiltro(chip.key as any)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors ${active ? cls.active : cls.inactive}`}
                >
                  <span>{chip.label}</span>
                  <span className={`px-1.5 py-0 rounded-full text-[10px] font-mono font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tabla de contratos */}
          <div className="mint-card overflow-hidden border border-[#e2e8f0]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f8fafb] border-b border-[#e2e8f0] text-slate-600 font-mono uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Expediente / Objeto y Fechas</th>
                    <th className="py-3 px-4">Organismo</th>
                    <th className="py-3 px-4">Adjudicatario</th>
                    <th className="py-3 px-4 text-right">Importe</th>
                    <th className="py-3 px-4 text-center">Plazo Pliego</th>
                    <th className="py-3 px-4 text-center">Lapso Registrado (PLACSP)</th>
                    <th className="py-3 px-4 text-right">Desviación Registrada</th>
                    <th className="py-3 px-4 text-center">Control Legal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {contratosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-slate-400">
                        No se encontraron contratos con los criterios seleccionados.
                      </td>
                    </tr>
                  ) : (
                    contratosFiltrados.slice(0, VISIBLE_LIMIT).map((item) => (
                      <tr key={item.id} className="hover:bg-[#f8fafb] transition-colors">
                        <td className="py-3 px-4 max-w-xs">
                          <div className="space-y-1">
                            <Link
                              href={`/licitaciones/${encodeURIComponent(getPlacspId(item.id) || item.id)}`}
                              className="font-mono font-bold text-[#2563eb] hover:underline inline-flex items-center gap-1"
                            >
                              <span>{item.case_number}</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </Link>
                            <p className="text-[11px] text-slate-600 line-clamp-2" title={item.object_description}>
                              {item.object_description}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5 text-[10px] text-slate-400 font-mono">
                              <span>{item.tipo} · {item.procedimiento}</span>
                              {item.year && (
                                <span className="font-bold text-slate-500">
                                  · {item.year}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 bg-slate-50 p-1.5 rounded border border-slate-150">
                              <span>Adjudicación: {item.fechaInicio}</span>
                              <span className="mx-1">·</span>
                              <span>Fin pliego: {item.fechaFinPrevista}</span>
                              <span className="mx-1">·</span>
                              <span>Última pub. PLACSP: {item.fechaUltimaActividad}</span>
                            </div>
                            {(item.esDiscrepanciaRegistral || item.ratioDuracion >= 3) && (
                              <div className="mt-1.5 p-2.5 rounded-lg bg-[#fffbeb] border border-[#fde68a] text-[10px] text-[#92400e] leading-snug space-y-1.5">
                                <div className="font-bold flex items-center justify-between gap-1 text-[#b45309]">
                                  <div className="flex items-center gap-1">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#d97706]" />
                                    <span>
                                      {item.ratioDuracion >= 3
                                        ? `Duración registrada muy superior a la duración prevista (${item.ratioDuracion}x)`
                                        : 'Posible anomalía registral o desfase de publicación en PLACSP'}
                                    </span>
                                  </div>
                                  {item.ratioDuracion >= 5 && (
                                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#fee2e2] text-[#991b1b] border border-[#fecaca]">
                                      Requiere comprobación documental
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-700">
                                  {item.notaMetodologica || 'La duración mostrada refleja el tiempo transcurrido hasta la última actualización registrada en PLACSP, no una prolongación material probada del contrato.'}
                                </p>
                                <div className="font-medium text-slate-800 text-[9px] pt-1 border-t border-[#fde68a]/60">
                                  <strong>Qué debe comprobar el investigador:</strong> Expediente en PLACSP, prórrogas aprobadas, modificaciones contractuales, resoluciones de suspensión o ampliación de plazo, acta de recepción o liquidación, fecha real de finalización material y partes de ejecución.
                                </div>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                          {item.organo}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-semibold text-slate-800 block">
                            {item.awardee}
                          </span>
                          {item.nifAdjudicatario && (
                            <span className="text-[10px] font-mono text-slate-400">
                              {formatNif(item.nifAdjudicatario)}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                          {item.amount === null ? 'Importe no comparable' : formatCurrency(item.amount)}
                        </td>

                        <td className="py-3 px-4 text-center font-mono text-slate-600 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                            {item.duracionPrevistaTexto}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-center font-mono whitespace-nowrap">
                          <span className="font-bold text-[#1e293b]">
                            {item.duracionEfectivaTexto}
                          </span>
                          <span className="block text-[9px] text-slate-400 font-mono">
                            (en PLACSP)
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="font-mono">
                            {item.esDiscrepanciaRegistral ? (
                              <>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#fef3c7] text-[#92400e] border border-[#fde68a] inline-block">
                                  Desfase {item.ratioDuracion}x
                                </span>
                                <span className="block text-[10px] text-slate-500 mt-0.5">
                                  +{item.desviacionDias} días reg.
                                </span>
                              </>
                            ) : (
                              <>
                                <span className={`font-bold ${
                                  item.ratioDuracion > 5
                                    ? 'text-[#dc2626]'
                                    : item.ratioDuracion > 3
                                    ? 'text-[#ea580c]'
                                    : item.ratioDuracion >= 1.5
                                    ? 'text-[#d97706]'
                                    : 'text-[#2563eb]'
                                }`}>
                                  {item.ratioDuracion}x
                                </span>
                                <span className="block text-[10px] text-slate-400">
                                  +{item.desviacionDias} días
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {item.esDiscrepanciaRegistral ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#fffbeb] text-[#b45309] border border-[#fde68a] inline-flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Art. 29.8 (Menor)
                            </span>
                          ) : item.alertaArt29 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#fef2f2] text-[#dc2626] border border-[#fecaca] inline-flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Art. 29 (Crítico)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#f1f5f9] text-slate-600">
                              {item.tipo.toLowerCase().includes('obra') ? 'Demora obra' : 'Prórroga'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {contratosFiltrados.length > VISIBLE_LIMIT && (
              <div className="px-4 py-3 bg-[#f8fafb] border-t border-[#e2e8f0] text-[11px] text-slate-600 flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-slate-400" />
                <span>
                  Mostrando los primeros <strong className="font-mono text-slate-800">{VISIBLE_LIMIT}</strong> de{' '}
                  <strong className="font-mono text-slate-800">{contratosFiltrados.length}</strong> contratos. Usa los filtros de gravedad o la búsqueda para reducir resultados.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Retrasos en Obras Públicas */}
      {activeTab === 'obras' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[#eff6ff]/60 border border-[#bfdbfe] text-xs text-[#1e40af] leading-relaxed flex items-start gap-3">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#2563eb]" />
            <div>
              <strong>Control de Plazos en Obras Públicas (Art. 195 LCSP):</strong> Los contratos de obras tienen una duración de ejecución definida en el proyecto técnico. Desviaciones significativas de plazo en obras urbanas de acerados, pavimentación o accesibilidad generan incidencias a los vecinos. La ley obliga a documentar ampliaciones de plazo con causas no imputables al contratista o aplicar penalidades económicas.
            </div>
          </div>

          <div className="mint-card overflow-hidden border border-[#e2e8f0]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f8fafb] border-b border-[#e2e8f0] text-slate-600 font-mono uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Obra / Expediente</th>
                    <th className="py-3 px-4">Adjudicatario</th>
                    <th className="py-3 px-4 text-right">Importe</th>
                    <th className="py-3 px-4 text-center">Plazo Pliego</th>
                    <th className="py-3 px-4 text-center">Lapso Registrado (PLACSP)</th>
                    <th className="py-3 px-4 text-right">Desviación Registrada</th>
                    <th className="py-3 px-4 text-center">Ratio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {rankingObrasDemora.map((obra) => (
                    <tr key={obra.id} className="hover:bg-[#f8fafb] transition-colors">
                      <td className="py-3 px-4 max-w-sm">
                        <Link
                          href={`/licitaciones/${encodeURIComponent(getPlacspId(obra.id) || obra.id)}`}
                          className="font-mono font-bold text-[#2563eb] hover:underline inline-flex items-center gap-1"
                        >
                          <span>{obra.case_number}</span>
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                        <p className="text-[11px] text-slate-600 line-clamp-2">
                          {obra.object_description}
                        </p>
                        {obra.ratioDuracion >= 3 && (
                          <span className="text-[10px] text-[#b45309] block font-sans mt-0.5 font-medium">
                            Duración registrada muy superior a la prevista ({obra.ratioDuracion}x){obra.ratioDuracion >= 5 ? ' · Requiere comprobación documental' : ''}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                        {obra.awardee}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                        {obra.amount === null ? 'Importe no comparable' : formatCurrency(obra.amount)}
                      </td>

                      <td className="py-3 px-4 text-center font-mono whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {obra.duracionPrevistaTexto}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-800 whitespace-nowrap">
                        {obra.duracionEfectivaTexto}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-[#dc2626] font-bold whitespace-nowrap">
                        +{obra.desviacionDias} días
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-bold whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-[#eff6ff] text-[#1d4ed8]">
                          {obra.ratioDuracion}x
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Distribución por Tramos de Dilación */}
      {activeTab === 'tramos' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tramosDesviacion.map((tramo) => {
            let borderClass = 'border-l-[#10b981]';
            let badgeClass = 'bg-[#ecfdf5] text-[#047857]';

            if (tramo.level === 'moderada') {
              borderClass = 'border-l-[#3b82f6]';
              badgeClass = 'bg-[#eff6ff] text-[#1d4ed8]';
            } else if (tramo.level === 'advertencia') {
              borderClass = 'border-l-[#f59e0b]';
              badgeClass = 'bg-[#fffbeb] text-[#b45309]';
            } else if (tramo.level === 'alerta') {
              borderClass = 'border-l-[#dc2626]';
              badgeClass = 'bg-[#fef2f2] text-[#b91c1c]';
            }

            return (
              <div key={tramo.rango} className={`mint-card p-5 border-l-4 ${borderClass} space-y-3`}>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full font-mono ${badgeClass}`}>
                    {tramo.rango}
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-600">
                    {tramo.pct}%
                  </span>
                </div>

                <div>
                  <div className="text-2xl font-black text-[#1e293b] font-mono">
                    {tramo.count}
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    Volumen: {formatCompactCurrency(tramo.volumen)}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {tramo.description}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 4: Por Ente Contratante y Tipo */}
      {activeTab === 'organismos' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Por Tipo de Contrato */}
          <div className="mint-card p-5 border border-[#e2e8f0] space-y-4">
            <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#2563eb]" />
                <h3 className="font-bold text-[#1e293b] text-sm">
                  Dilación Temporal por Tipo de Contrato
                </h3>
              </div>
            </div>

            <div className="space-y-4">
              {porTipoContrato.map((t) => (
                <div key={t.tipo} className="p-3.5 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-2 text-xs">
                  <div className="flex items-center justify-between font-semibold text-slate-800">
                    <span>{t.tipo}</span>
                    <span className="font-mono text-[#2563eb] font-bold">
                      {t.ratioMedio}x ratio medio
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#2563eb] h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, t.pctDesviacion)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span>{t.conDesviacion} de {t.total} con dilación ({t.pctDesviacion}%)</span>
                    <span>Volumen: {formatCompactCurrency(t.volumen)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Por Organismo */}
          <div className="mint-card p-5 border border-[#e2e8f0] space-y-4">
            <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#2563eb]" />
                <h3 className="font-bold text-[#1e293b] text-sm">
                  Dilación Temporal por Organismo Contratante
                </h3>
              </div>
            </div>

            <div className="space-y-4">
              {porOrganismo.map((org) => (
                <div key={org.organo} className="p-3.5 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-2 text-xs">
                  <div className="flex items-center justify-between font-semibold text-slate-800">
                    <span>{org.organo}</span>
                    <span className="font-mono text-[#1d4ed8] font-bold">
                      {org.ratioMedio}x ratio medio
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#3b82f6] h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, org.pctDesviacion)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span>{org.conDesviacion} de {org.total} con dilación ({org.pctDesviacion}%)</span>
                    <span>Volumen: {formatCompactCurrency(org.volumen)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Régimen Legal (Art. 29 y 195 LCSP) */}
      {activeTab === 'normativa' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="mint-card p-6 border-l-4 border-l-[#2563eb] space-y-3 bg-[#f8fafb]">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe] inline-block font-mono">
              Artículo 29 LCSP
            </span>
            <h3 className="text-base font-bold text-[#1e293b]">
              Plazo de Duración de los Contratos y Prórrogas
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              La LCSP fija límites rigurosos a la duración temporal de los contratos públicos para garantizar la periódica concurrencia del mercado y evitar la perpetuación indefinida de proveedores.
            </p>
            <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
              <li><strong>Tope de 5 años (Art. 29.4)</strong>: Los contratos de servicios y suministros de tracto sucesivo no podrán superar 5 años de duración total, incluyendo todas sus prórrogas.</li>
              <li><strong>Carácter expreso (Art. 29.2)</strong>: La prórroga debe ser expresa. Las prórrogas tácitas o de facto son legalmente nulas de pleno derecho.</li>
              <li><strong>Preaviso obligatorio</strong>: Exige al menos 2 meses de preaviso formal al contratista antes del vencimiento.</li>
            </ul>
          </div>

          <div className="mint-card p-6 border-l-4 border-l-[#e11d48] space-y-3 bg-[#f8fafb]">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#fff1f2] text-[#be123c] border border-[#fecdd3] inline-block font-mono">
              Artículo 195 LCSP
            </span>
            <h3 className="text-base font-bold text-[#1e293b]">
              Demora en la Ejecución y Penalidades
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              El contratista está obligado a cumplir el contrato dentro del plazo total fijado, así como de los plazos parciales acordados en pliegos.
            </p>
            <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
              <li><strong>Mora del contratista</strong>: Si el contratista incumple el plazo por causas que le sean imputables, la administración puede optar por resolver el contrato o imponer penalidades diarias (0,60 € por cada 1.000 € de precio).</li>
              <li><strong>Causas no imputables</strong>: Si el retraso se debe a fuerza mayor o motivos achacables a la administración, procede la ampliación del plazo por un periodo al menos igual al tiempo perdido.</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
