'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { getPlacspId } from '@/lib/placsp';
import { 
  AlertTriangle, 
  ShieldAlert, 
  Building2, 
  Search, 
  ChevronRight, 
  ArrowUpRight, 
  Layers, 
  Scale, 
  FileText, 
  TrendingUp, 
  Clock,
  History,
  Info
} from 'lucide-react';
import { formatCurrency, formatCompactCurrency, formatDate, formatNif } from '@/lib/format';
import type { ModificadosStats } from '@/lib/db';

interface ModificadosSectionProps {
  data: ModificadosStats;
}

export function ModificadosSection({ data }: ModificadosSectionProps) {
  const [activeTab, setActiveTab] = useState<'cadenas' | 'obras' | 'contratistas' | 'prorrogas' | 'normativa'>('cadenas');
  const [searchQuery, setSearchQuery] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'mas20' | 'redaccion'>('todos');
  const [orden, setOrden] = useState<'euros' | 'pct'>('euros');

  const { resumen, cadenasProyectos, rankingObras, rankingContratistas, rankingOrganismos, rankingProrrogas = [] } = data;

  const prorrogasFiltradas = useMemo(() => {
    return rankingProrrogas.filter((item) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.case_number?.toLowerCase().includes(q) ||
        item.object_description?.toLowerCase().includes(q) ||
        item.awardee?.toLowerCase().includes(q) ||
        item.reason?.toLowerCase().includes(q)
      );
    });
  }, [rankingProrrogas, searchQuery]);

  const obrasFiltradas = useMemo(() => {
    return rankingObras
      .filter((item) => {
        if (tipoFiltro === 'mas20' && !item.supera20Pct) return false;
        if (tipoFiltro === 'redaccion' && item.tipoModificado !== 'proyecto_modificado') return false;

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
        if (orden === 'pct') {
          return b.desviacionPct - a.desviacionPct;
        }
        return b.desviacionEuros - a.desviacionEuros;
      });
  }, [rankingObras, tipoFiltro, searchQuery, orden]);

  return (
    <section id="modificados" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e2e8f0] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[#fff1f2] border border-[#fecdd3] text-[#e11d48]">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#1e293b] flex items-center gap-2">
                <span>Ranking de Modificados y Sobrecostes</span>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-[#fff1f2] border border-[#fecdd3] text-[#be123c]">
                  Art. 203–207 LCSP
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Auditoría de desvíos entre importe de licitación y adjudicación final, proyectos modificados y relicitaciones por sobrecoste.
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/metodologia#modificados-sobrecostes"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#be123c] hover:text-[#9f1239] bg-[#fff1f2] hover:bg-[#ffe4e6] border border-[#fecdd3] px-3 py-1.5 rounded-lg transition-colors self-start sm:self-auto"
        >
          <span>Metodología de modificaciones contractuales</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total casos */}
        <div className="mint-card p-5 border-l-4 border-l-[#e11d48]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              Expedientes Afectados
            </span>
            <div className="p-1.5 rounded-md bg-[#fff1f2] text-[#e11d48]">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#1e293b] font-mono">
              {resumen.totalCasos}
            </span>
            <span className="text-xs text-slate-500">expedientes</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {cadenasProyectos.length > 0
              ? `${cadenasProyectos.length} gran obra en cascada documentada`
              : 'Sin modificaciones formales en el filtro actual'}
          </p>
        </div>

        {/* Sobrecoste Acumulado */}
        <div className="mint-card p-5 border-l-4 border-l-[#dc2626]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              Sobrecoste Acumulado
            </span>
            <div className="p-1.5 rounded-md bg-[#fef2f2] text-[#dc2626]">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#dc2626] font-mono">
              {formatCompactCurrency(resumen.sobrecosteAcumulado)}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              ({formatCurrency(resumen.sobrecosteAcumulado)})
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Gasto en asistencias de modificado: {formatCurrency(resumen.gastoModificadosRedaccion)}
          </p>
        </div>

        {/* Desviación Máxima */}
        <div className="mint-card p-5 border-l-4 border-l-[#d97706]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              Desviación Máxima
            </span>
            <div className="p-1.5 rounded-md bg-[#fffbeb] text-[#d97706]">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#d97706] font-mono">
              +{resumen.desviacionMaximaPct}%
            </span>
            <span className="text-xs text-slate-500">sobre base</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {resumen.desviacionMaximaPct > 0
              ? 'Mayor sobrecoste en contratos del ejercicio'
              : 'Sin sobrecostes en el periodo actual'}
          </p>
        </div>

        {/* Límite Legal Excedido */}
        <div className="mint-card p-5 border-l-4 border-l-[#b91c1c]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              Límite Señal &gt;20%
            </span>
            <div className="p-1.5 rounded-md bg-[#fef2f2] text-[#b91c1c]">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#b91c1c] font-mono">
              {resumen.casosMas20Pct}
            </span>
            <span className="text-xs text-[#b91c1c] font-semibold">casos a revisar</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Señal cuantitativa: la modificación acumulada supera el 20% del precio inicial
          </p>
        </div>

        {/* Prórrogas y Ampliaciones de Plazo */}
        <div className="mint-card p-5 border-l-4 border-l-[#f59e0b]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              Ampliaciones de Plazo
            </span>
            <div className="p-1.5 rounded-md bg-[#fffbeb] text-[#d97706]">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#d97706] font-mono">
              {resumen.totalContratosConProrroga || 0}
            </span>
            <span className="text-xs text-slate-500">contratos (+{resumen.totalDiasProrroga || 0}d)</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Prórrogas aprobadas por decreto
          </p>
        </div>
      </div>

      {/* Banner de Diferenciación Metodológica y Caso Histórico */}
      <div className="p-4 rounded-xl bg-[#fff1f2]/60 border border-[#fecdd3] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-700">
        <div className="flex items-start gap-2.5">
          <Info className="h-4 w-4 text-[#e11d48] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-900 block mb-0.5">
              Diferenciación analítica: Modificados formales vs. Encarecimiento en cascada
            </span>
            <span className="leading-relaxed">
              Los registros oficiales de PLACSP rara vez publican modificaciones formales directas bajo el art. 205 LCSP ({resumen.totalCasos} detectados en el periodo). Paralelamente, LicitAlcázar documenta el fenómeno de <strong>relicitaciones en cascada tras renuncia</strong>, como el caso paradigmático de la <em>Estación de Autobuses</em> (+64,0% acumulado entre 2023 y 2025).
            </span>
          </div>
        </div>
        <button
          onClick={() => setActiveTab('cadenas')}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-white hover:bg-[#fff1f2] text-[#be123c] border border-[#fecdd3] font-semibold text-xs transition-colors self-start sm:self-auto cursor-pointer"
        >
          Ver Caso de Estudio
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#e2e8f0]">
        <nav className="flex space-x-6 text-sm">
          <button
            onClick={() => setActiveTab('cadenas')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'cadenas'
                ? 'text-[#e11d48] border-b-2 border-[#e11d48]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <History className="h-4 w-4" />
            <span>Modificaciones contractuales registradas</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-[#fff1f2] text-[#be123c] font-mono font-bold">
              {cadenasProyectos.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('obras')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'obras'
                ? 'text-[#e11d48] border-b-2 border-[#e11d48]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Ranking de Contratos por Desviación</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-mono font-bold">
              {rankingObras.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('contratistas')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'contratistas'
                ? 'text-[#e11d48] border-b-2 border-[#e11d48]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Contratistas y Organismos</span>
          </button>

          <button
            onClick={() => setActiveTab('prorrogas')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'prorrogas'
                ? 'text-[#e11d48] border-b-2 border-[#e11d48]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Ampliaciones de Plazo y Retrasos</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-mono font-bold">
              {rankingProrrogas.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('normativa')}
            className={`pb-3 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'normativa'
                ? 'text-[#e11d48] border-b-2 border-[#e11d48]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Scale className="h-4 w-4" />
            <span>Régimen Legal (Art. 204 y 205)</span>
          </button>
        </nav>
      </div>

      {/* Tab 1: Modificaciones contractuales registradas */}
      {activeTab === 'cadenas' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-[#fff1f2]/40 border border-[#fecdd3] text-xs text-[#9f1239] leading-relaxed flex items-start gap-3">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#e11d48]" />
            <div>
              <strong>Modificaciones contractuales registradas en PLACSP:</strong> En obras públicas complejas, cuando las variaciones requeridas superan los límites del art. 205 LCSP (incluido el umbral sustancial del 20%) o concurre la renuncia del contratista, la modificación no puede ser aprobada sobre el contrato en vigor. De resultar imprescindible alterar sustancialmente el proyecto para el interés público, procede la resolución contractual (art. 211.1.g LCSP) y una nueva licitación pública. A continuación se auditan las cadenas de proyectos reconstruidas en Alcázar de San Juan.
            </div>
          </div>

          <div className="space-y-6">
            {cadenasProyectos.map((proyecto) => (
              <div key={proyecto.idProyecto} className="mint-card p-6 border border-[#e2e8f0] space-y-5 bg-white shadow-xs">
                {/* Cabecera del proyecto */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#e2e8f0] pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fff1f2] text-[#be123c] border border-[#fecdd3]">
                        {proyecto.tipo}
                      </span>
                      {proyecto.supera20Pct && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fef2f2] text-[#b91c1c] border border-[#fecaca] flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Supera 20% del precio inicial (+{proyecto.incrementoPct}%)
                        </span>
                      )}
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-[#1e293b]">
                      {proyecto.title}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Órgano: <span className="font-semibold text-slate-700">{proyecto.organo}</span> · Adjudicatario definitivo: <span className="font-semibold text-slate-700">{proyecto.adjudicatarioPrincipal}</span>
                    </p>
                  </div>

                  {/* Comparativa económica del proyecto */}
                  <div className="flex items-center gap-4 bg-[#f8fafb] p-3 rounded-xl border border-[#e2e8f0] self-start font-mono">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">PBL Original</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-600">
                        {formatCurrency(proyecto.importeOriginal)}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Adjudicación Final</span>
                      <span className="text-xs sm:text-sm font-bold text-[#1e293b]">
                        {formatCurrency(proyecto.importeFinal)}
                      </span>
                    </div>
                    <div className="border-l border-slate-200 pl-3">
                      <span className="text-[10px] text-[#b91c1c] block uppercase font-bold">Sobrecoste</span>
                      <span className="text-xs sm:text-sm font-black text-[#dc2626]">
                        +{formatCurrency(proyecto.sobrecosteTotal)}
                        <span className="text-[10px] ml-1 font-semibold">
                          (+{proyecto.incrementoPct}%)
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Explicación contextual */}
                <p className="text-xs text-slate-600 leading-relaxed bg-[#f8fafb] p-3.5 rounded-lg border border-[#e2e8f0]">
                  {proyecto.motivoExplicativo}
                </p>

                {/* Timeline / Pasos de la cadena */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span>Cronología de Expedientes Vinculados ({proyecto.contratosCadena.length})</span>
                  </h4>

                  <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#e2e8f0]">
                    {proyecto.contratosCadena.map((c) => {
                      let dotColor = 'bg-slate-300';
                      let roleLabel = 'Contrato original';
                      let roleBadge = 'bg-slate-100 text-slate-700';

                      if (c.rol === 'modificacion_contractual') {
                        dotColor = 'bg-rose-500';
                        roleLabel = 'Modificación contractual publicada';
                        roleBadge = 'bg-rose-50 text-rose-800 border-rose-200';
                      }

                      return (
                        <div key={c.case_number} className="relative group">
                          <div className={`absolute -left-[27px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white ${dotColor}`} />
                          <div className="p-3 rounded-lg bg-[#f8fafb] hover:bg-white border border-[#e2e8f0] hover:border-slate-300 transition-all space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${roleBadge}`}>
                                  {roleLabel}
                                </span>
                                <span className="font-mono text-xs font-semibold text-[#1e293b]">
                                  {c.case_number}
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  ({c.year})
                                </span>
                              </div>
                              <span className="font-mono text-xs font-bold text-[#1e293b]">
                                {formatCurrency(c.amount)}
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 line-clamp-1">
                              {c.object_description}
                            </p>

                            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                              <span>Adjudicatario: <strong className="text-slate-700">{c.awardee}</strong></span>
                              {c.url && (
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#e11d48] hover:text-[#be123c] font-semibold inline-flex items-center gap-1"
                                >
                                  <span>Expediente PLACSP</span>
                                  <ArrowUpRight className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Ranking de Contratos por Desviación */}
      {activeTab === 'obras' && (
        <div className="space-y-4">
          {/* Controles de filtro */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#f8fafb] p-3.5 rounded-xl border border-[#e2e8f0]">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por obra, expediente, empresa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#e2e8f0] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#e11d48]/20 focus:border-[#e11d48]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value as any)}
                className="text-xs bg-white border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-[#e11d48]"
              >
                <option value="todos">Todas las modificaciones registradas</option>
                <option value="mas20">Superan 20% del precio inicial</option>
                <option value="redaccion">Redacción técnica de modificado</option>
              </select>

              <select
                value={orden}
                onChange={(e) => setOrden(e.target.value as any)}
                className="text-xs bg-white border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-[#e11d48]"
              >
                <option value="euros">Ordenar por sobrecoste (€)</option>
                <option value="pct">Ordenar por desviación (%)</option>
              </select>
            </div>
          </div>

          {/* Tabla de contratos */}
          <div className="mint-card overflow-hidden border border-[#e2e8f0]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f8fafb] border-b border-[#e2e8f0] text-slate-600 font-mono uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Expediente / Objeto</th>
                    <th className="py-3 px-4">Organismo</th>
                    <th className="py-3 px-4">Adjudicatario</th>
                    <th className="py-3 px-4 text-right">PBL / Inicial</th>
                    <th className="py-3 px-4 text-right">Adjudicado</th>
                    <th className="py-3 px-4 text-right">Desviación</th>
                    <th className="py-3 px-4 text-center">Art. LCSP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {obrasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        No se encontraron expedientes con los criterios seleccionados.
                      </td>
                    </tr>
                  ) : (
                    obrasFiltradas.map((item) => {
                      const isPatrimonial = false;

                      return (
                        <tr key={item.id} className="hover:bg-[#f8fafb] transition-colors">
                          <td className="py-3 px-4 max-w-xs">
                            <div className="space-y-0.5">
                              <Link
                                href={`/licitaciones/${encodeURIComponent(getPlacspId(item.id) || item.id)}`}
                                className="font-mono font-bold text-[#e11d48] hover:underline inline-flex items-center gap-1"
                              >
                                <span>{item.case_number}</span>
                                <ArrowUpRight className="h-3 w-3" />
                              </Link>
                              <p className="text-[11px] text-slate-600 line-clamp-2" title={item.object_description}>
                                {item.object_description}
                              </p>
                              <div className="flex items-center gap-2 pt-0.5">
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {item.tipo} · {item.procedimiento}
                                </span>
                                {item.year && (
                                  <span className="text-[10px] font-bold font-mono text-slate-500">
                                    {item.year}
                                  </span>
                                )}
                              </div>
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

                          <td className="py-3 px-4 text-right font-mono text-slate-600 whitespace-nowrap">
                            {item.importeInicial > 0 ? formatCurrency(item.importeInicial) : '—'}
                          </td>

                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                            {formatCurrency(item.importeFinal)}
                          </td>

                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="font-mono">
                              <span className={`font-bold ${
                                isPatrimonial
                                  ? 'text-emerald-700'
                                  : item.desviacionPct > 20
                                  ? 'text-[#b91c1c]'
                                  : 'text-rose-600'
                              }`}>
                                +{formatCurrency(item.desviacionEuros)}
                              </span>
                              <span className="block text-[10px] text-slate-400">
                                +{item.desviacionPct}%
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {item.supera20Pct ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-[#b91c1c] border border-rose-200 flex items-center gap-1 justify-center">
                                <AlertTriangle className="h-3 w-3" />
                                Señal cuantitativa (&gt;20%)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                Modificación registrada
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Ranking por Contratista y Organismo */}
      {activeTab === 'contratistas' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Contratistas */}
          <div className="mint-card p-5 border border-[#e2e8f0] space-y-4">
            <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#e11d48]" />
                <h3 className="font-bold text-[#1e293b] text-sm">
                  Top Contratistas con Modificaciones
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {rankingContratistas.length} empresas
              </span>
            </div>

            <div className="divide-y divide-[#e2e8f0]">
              {rankingContratistas.slice(0, 10).map((c, i) => (
                <div key={c.awardee} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400 w-4">
                        #{i + 1}
                      </span>
                      <span className="font-bold text-slate-800">
                        {c.awardee}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                      <span>{c.totalModificados} expediente(s)</span>
                      <span>Volumen final: {formatCompactCurrency(c.volumenFinal)}</span>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <span className="font-bold text-[#b91c1c] block">
                      +{formatCurrency(c.sobrecosteTotal)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      media +{c.desviacionMediaPct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Organismos */}
          <div className="mint-card p-5 border border-[#e2e8f0] space-y-4">
            <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-[#e11d48]" />
                <h3 className="font-bold text-[#1e293b] text-sm">
                  Distribución por Ente Contratante
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {rankingOrganismos.length} entes
              </span>
            </div>

            <div className="space-y-4">
              {rankingOrganismos.map((org) => {
                const totalSobrecosteGlobal = resumen.sobrecosteAcumulado || 1;
                const pctOrgano = Math.round((org.sobrecosteTotal / totalSobrecosteGlobal) * 100);

                return (
                  <div key={org.organo} className="p-3.5 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-2 text-xs">
                    <div className="flex items-center justify-between font-semibold text-slate-800">
                      <span>{org.organo}</span>
                      <span className="font-mono text-[#b91c1c] font-bold">
                        +{formatCurrency(org.sobrecosteTotal)}
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-[#e11d48] h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, pctOrgano)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                      <span>{org.totalCasos} expediente(s) con modificación</span>
                      <span>{org.casosMas20Pct} superan el 20% del precio inicial</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Ampliaciones de Plazo y Retrasos Registrados */}
      {activeTab === 'prorrogas' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                Se han registrado <strong>{rankingProrrogas.length} decretos de prórroga</strong> sobre un total de <strong>{resumen.totalContratosConProrroga} contratos públicos</strong>, acumulando <strong>+{resumen.totalDiasProrroga} días de ampliación de plazo</strong>.
              </span>
            </div>
            <Link
              href="/licitaciones?alerta=prorroga"
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 hover:underline shrink-0"
            >
              <span>Ver en el Explorador de Licitaciones</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8fafb] text-slate-500 font-semibold border-b border-[#e2e8f0]">
                <tr>
                  <th className="py-3 px-4">Expediente y Objeto</th>
                  <th className="py-3 px-3">Contratista</th>
                  <th className="py-3 px-3 text-center">Ampliación de Plazo</th>
                  <th className="py-3 px-3 text-right">Sobrecoste</th>
                  <th className="py-3 px-3">Fecha Aprobación</th>
                  <th className="py-3 px-4">Motivo Oficial</th>
                  <th className="py-3 px-3 text-center">Expediente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0] bg-white">
                {prorrogasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No se encontraron contratos con prórroga para los filtros seleccionados
                    </td>
                  </tr>
                ) : (
                  prorrogasFiltradas.map((p) => (
                    <tr key={p.id} className="hover:bg-[#f8fafb] transition-colors">
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-mono text-[11px] font-bold text-slate-700">
                          {p.case_number || 'Sin exp.'}
                        </div>
                        <Link
                          href={`/licitaciones/${encodeURIComponent(getPlacspId(p.licitacionId) || p.licitacionId)}`}
                          className="font-medium text-slate-900 hover:text-[#0d9373] line-clamp-2 mt-0.5"
                          title={p.object_description}
                        >
                          {p.object_description}
                        </Link>
                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                          {p.organo}
                        </span>
                      </td>
                      <td className="py-3 px-3 max-w-[180px]">
                        <span className="font-semibold text-slate-800 block truncate">
                          {p.awardee}
                        </span>
                        {p.nifAdjudicatario && (
                          <span className="text-[10px] font-mono text-slate-400">
                            {formatNif(p.nifAdjudicatario)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 inline-block">
                          +{p.diasProrroga > 0 ? `${p.diasProrroga} días` : `${p.mesesProrroga} meses`}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        {p.importeModificacion > 0 ? (
                          <span className="font-bold text-red-600">
                            +{formatCurrency(p.importeModificacion)}
                          </span>
                        ) : (
                          <span className="text-slate-400">0,00 €</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {p.fechaModificacion ? formatDate(p.fechaModificacion) : '—'}
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <p className="text-[11px] text-slate-600 line-clamp-2" title={p.reason}>
                          {p.reason || 'Sin motivo detallado en la publicación'}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Link
                          href={`/licitaciones/${encodeURIComponent(getPlacspId(p.licitacionId) || p.licitacionId)}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#0d9373] hover:bg-[#ecfdf5] transition-colors inline-block"
                          title="Ver ficha completa de la licitación"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Régimen Legal (Art. 204 y 205 LCSP) */}
      {activeTab === 'normativa' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="mint-card p-6 border-l-4 border-l-[#0d9373] space-y-3 bg-[#f8fafb]">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5] inline-block font-mono">
              Artículo 204 LCSP
            </span>
            <h3 className="text-base font-bold text-[#1e293b]">
              Modificaciones Previstas en los Pliegos
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Los contratos del sector público pueden modificarse si se especificó claramente en los pliegos iniciales (PCAP). La ley exige que la cláusula sea clara, precisa e inequívoca, fijando su alcance y límites.
            </p>
            <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
              <li>Límite cuantitativo: No puede superar el <strong>20% del precio inicial</strong> del contrato.</li>
              <li>No puede alterar la naturaleza global ni los elementos esenciales de la licitación.</li>
              <li>No cabe su uso para corregir deficiencias de diseño u omisiones del proyecto inicial.</li>
            </ul>
          </div>

          <div className="mint-card p-6 border-l-4 border-l-[#b91c1c] space-y-3 bg-[#f8fafb]">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#fef2f2] text-[#b91c1c] border border-[#fecaca] inline-block font-mono">
              Artículo 205 LCSP
            </span>
            <h3 className="text-base font-bold text-[#1e293b]">
              Modificaciones No Previstas (Causas Imprevistas)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Modificaciones excepcionales por circunstancias sobrevenidas que una administración diligente no pudo prever, o por prestaciones adicionales imprevistas.
            </p>
            <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
              <li>El <strong>20%</strong> es el límite de las modificaciones previstas en los pliegos del <strong>art. 204</strong>; no se puede trasladar automáticamente al art. 205.</li>
              <li>En el <strong>art. 205</strong>, algunos supuestos tienen un límite cuantitativo del <strong>50%</strong>; además, la ley utiliza umbrales del 15% para obras y 10% para otros contratos al valorar determinadas modificaciones sustanciales.</li>
              
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
