'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getPlacspId } from '@/lib/placsp';
import { ContratosVivosStats } from '@/lib/contratos-vivos';
import { formatCurrency, formatCompactCurrency, formatNumber, formatDate, formatNif } from '@/lib/format';
import { 
  CalendarClock, 
  Clock, 
  AlertCircle, 
  Building2, 
  Search, 
  Briefcase, 
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
  Calendar
} from 'lucide-react';

interface ContratosVivosSectionProps {
  data: ContratosVivosStats;
  ambito?: string | null;
}

export default function ContratosVivosSection({ data, ambito }: ContratosVivosSectionProps) {
  const [horizonte, setHorizonte] = useState<'6m' | '30d' | 'todos'>('6m');
  const [tipoFiltro, setTipoFiltro] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState<string>('');
  const [mostrarTodos, setMostrarTodos] = useState<boolean>(false);

  const { kpis, proximosVencimientos6Meses, todosVivos, distribucionPorTipo, distribucionPorOrganismo } = data;

  // Base list depending on horizon
  let listaBase = todosVivos;
  if (horizonte === '6m') {
    listaBase = proximosVencimientos6Meses;
  } else if (horizonte === '30d') {
    listaBase = todosVivos.filter((c) => (c.diasRestantes ?? 9999) <= 30);
  }

  // Filter by contract type
  if (tipoFiltro !== 'todos') {
    listaBase = listaBase.filter((c) => c.tipo.toLowerCase().includes(tipoFiltro.toLowerCase()));
  }

  // Filter by search query
  if (busqueda.trim()) {
    const q = busqueda.toLowerCase().trim();
    listaBase = listaBase.filter(
      (c) =>
        c.object_description.toLowerCase().includes(q) ||
        c.case_number.toLowerCase().includes(q) ||
        c.awardee.toLowerCase().includes(q) ||
        c.organo.toLowerCase().includes(q) ||
        (c.nifAdjudicatario && c.nifAdjudicatario.toLowerCase().includes(q))
    );
  }

  const itemsVisibles = mostrarTodos ? listaBase : listaBase.slice(0, 10);

  const getBadgeDias = (dias: number | null) => {
    if (dias === null) return null;
    if (dias <= 15) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#fef2f2] text-[#dc2626] border border-[#fecaca] animate-pulse">
          Vence en {dias} {dias === 1 ? 'día' : 'días'}
        </span>
      );
    }
    if (dias <= 30) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#fff7ed] text-[#ea580c] border border-[#fed7aa]">
          Vence en {dias} días
        </span>
      );
    }
    if (dias <= 90) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#fffbeb] text-[#d97706] border border-[#fde68a]">
          En {dias} días (~{Math.round(dias / 30)} meses)
        </span>
      );
    }
    if (dias <= 180) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
          En {dias} días (~{Math.round(dias / 30)} meses)
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0]">
        En {dias} días ({Math.round(dias / 365 * 10) / 10} años)
      </span>
    );
  };

  return (
    <div id="contratos-vivos" className="mint-card p-6 sm:p-8 space-y-8">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e2e8f0] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
              <CalendarClock className="h-5 w-5" />
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-[#1e293b] tracking-tight">
              Contratos Vivos y Próximos Vencimientos (Servicios y Suministros)
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#64748b] mt-1">
            Radar operativo de contratos públicos en ejecución: qué servicios están vigentes hoy, qué empresas los gestionan y calendario de licitaciones con fecha de fin o vencimiento estimado a 6 meses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
          {ambito && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
              {ambito === 'directa' ? 'Directa Municipal' : ambito === 'mancomunidad' ? 'Mancomunidad' : ambito}
            </span>
          )}
          <Link
            href="/metodologia#contratos-vivos"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] text-slate-700 hover:text-[#0d9373] border border-[#e2e8f0] text-xs font-semibold transition-all"
          >
            <HelpCircle className="h-3.5 w-3.5 text-[#0d9373]" />
            <span>Metodología de Vigencia</span>
          </Link>
        </div>
      </div>

      {/* 4 KPIs de Contratos Vivos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Contratos Vivos Ahora */}
        <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-4.5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#166534] flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#16a34a]" />
                Contratos Vivos Ahora
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#15803d]">
                En vigor
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#14532d] tracking-tight">
              {formatNumber(kpis.totalVivos)}
            </div>
            <div className="text-xs text-[#15803d] font-medium mt-0.5">
              expedientes activos hoy
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#bbf7d0]/60 flex items-center justify-between text-xs text-[#166534]">
            <span>Volumen vivo:</span>
            <span className="font-bold text-[#14532d]">{formatCompactCurrency(kpis.volumenVivoTotal)}</span>
          </div>
        </div>

        {/* Vencen a 6 Meses */}
        <div className="bg-[#fffbeb] border border-[#fde68a] rounded-xl p-4.5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#92400e] flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-[#d97706]" />
                Vencen a 6 Meses
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#b45309]">
                ≤ 180 días
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#78350f] tracking-tight">
              {formatNumber(kpis.vencenEn6Meses)}
            </div>
            <div className="text-xs text-[#b45309] font-medium mt-0.5">
              licitaciones a renovar
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#fde68a]/60 flex items-center justify-between text-xs text-[#92400e]">
            <span>Volumen próximo:</span>
            <span className="font-bold text-[#78350f]">{formatCompactCurrency(kpis.volumenVence6Meses)}</span>
          </div>
        </div>

        {/* Vencimiento Inminente (<30 días) */}
        <div className="bg-[#fef2f2] border border-[#fecaca] rounded-xl p-4.5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#991b1b] flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-[#dc2626]" />
                Inminentes (&lt; 30 días)
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#fee2e2] text-[#b91c1c]">
                Urgente
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#7f1d1d] tracking-tight">
              {formatNumber(kpis.vencenEn30Dias)}
            </div>
            <div className="text-xs text-[#b91c1c] font-medium mt-0.5">
              vencimiento estimado este mes
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#fecaca]/60 flex items-center justify-between text-xs text-[#991b1b]">
            <span>Volumen inminente:</span>
            <span className="font-bold text-[#7f1d1d]">{formatCompactCurrency(kpis.volumenVence30Dias)}</span>
          </div>
        </div>

        {/* Plurianuales en Vigor */}
        <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-4.5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#1e40af] flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-[#2563eb]" />
                Plurianuales en Vigor
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#dbeafe] text-[#1d4ed8]">
                &ge; 1 año
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#1e3a8a] tracking-tight">
              {formatNumber(kpis.plurianualesVivos)}
            </div>
            <div className="text-xs text-[#1d4ed8] font-medium mt-0.5">
              servicios de larga duración
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#bfdbfe]/60 flex items-center justify-between text-xs text-[#1e40af]">
            <span>Volumen plurianual:</span>
            <span className="font-bold text-[#1e3a8a]">{formatCompactCurrency(kpis.volumenPlurianual)}</span>
          </div>
        </div>
      </div>

      {/* CAVEAT DE FRESCURA DE DATOS (PLACSP) */}
      <div className="p-4 rounded-xl bg-[#fffbeb] border border-[#fde68a] flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-[#b45309] shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed text-[#78350f]">
          <strong>Aviso de sincronización y prórrogas administrativas:</strong> Las fechas de finalización mostradas corresponden a la duración contractual inicial y resoluciones formalizadas publicadas en la Plataforma de Contratación del Sector Público (PLACSP). En la administración local, las prórrogas acordadas en Junta de Gobierno Local o por Decreto de Alcaldía pueden demorarse semanas o meses en registrarse en el perfil del contratante del Estado, o mantenerse temporalmente por razones de continuidad del servicio público esencial (Art. 29 LCSP).
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
          {/* Selector de Horizonte */}
          <div className="flex p-1 bg-[#f1f5f9] rounded-xl self-start md:self-auto shrink-0">
            <button
              onClick={() => { setHorizonte('6m'); setMostrarTodos(false); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                horizonte === '6m'
                  ? 'bg-white text-[#0f172a] shadow-xs'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              Próximos 6 Meses ({kpis.vencenEn6Meses})
            </button>
            <button
              onClick={() => { setHorizonte('30d'); setMostrarTodos(false); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                horizonte === '30d'
                  ? 'bg-white text-[#0f172a] shadow-xs'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              Inminentes &lt; 30 Días ({kpis.vencenEn30Dias})
            </button>
            <button
              onClick={() => { setHorizonte('todos'); setMostrarTodos(false); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                horizonte === 'todos'
                  ? 'bg-white text-[#0f172a] shadow-xs'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              Todos los Vivos ({kpis.totalVivos})
            </button>
          </div>

          {/* Filtros de Tipo y Buscador */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por objeto, empresa, expediente..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#cbd5e1] focus:outline-none focus:ring-1 focus:ring-[#0d9373] bg-white w-56 sm:w-64"
              />
            </div>

            <select
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-[#cbd5e1] bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#0d9373]"
            >
              <option value="todos">Todos los tipos</option>
              <option value="servicio">Servicios</option>
              <option value="suministro">Suministros</option>
              <option value="obra">Obras</option>
              <option value="concesión">Concesiones</option>
            </select>

            {(busqueda || tipoFiltro !== 'todos') && (
              <button
                onClick={() => { setBusqueda(''); setTipoFiltro('todos'); }}
                className="text-xs text-[#64748b] hover:text-[#0f172a] underline px-1"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Tabla Operativa */}
        {listaBase.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-[#cbd5e1] rounded-xl text-xs text-[#64748b]">
            No se han encontrado contratos vivos con los filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] text-[#475569] font-bold border-b border-[#e2e8f0]">
                  <th className="py-3 px-4">Servicio / Expediente</th>
                  <th className="py-3 px-3">Adjudicatario</th>
                  <th className="py-3 px-3">Duración</th>
                  <th className="py-3 px-3">Vencimiento Estimado</th>
                  <th className="py-3 px-3">Régimen Prórroga</th>
                  <th className="py-3 px-4 text-right">Importe Adjudicado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9] bg-white">
                {itemsVisibles.map((c) => (
                  <tr key={c.id} className="hover:bg-[#f8fafc] transition-colors group">
                    {/* Servicio / Objeto */}
                    <td className="py-3 px-4 max-w-xs sm:max-w-md">
                      <Link
                        href={`/licitaciones/${encodeURIComponent(getPlacspId(c.id) || c.id)}`}
                        className="font-semibold text-[#1e293b] group-hover:text-[#0d9373] transition-colors line-clamp-2 block leading-snug"
                      >
                        {c.object_description}
                      </Link>
                      <div className="flex items-center gap-2 text-[10px] text-[#64748b] mt-1 font-mono">
                        <span>Exp: <strong>{c.case_number}</strong></span>
                        <span>•</span>
                        <span className="truncate max-w-[140px] sm:max-w-[200px]">{c.organo}</span>
                        <span>•</span>
                        <span className="text-[#0d9373] font-semibold">{c.tipo}</span>
                      </div>
                    </td>

                    {/* Adjudicatario */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-semibold text-[#0f172a] max-w-[180px] truncate" title={c.awardee}>
                        {c.awardee}
                      </div>
                      {c.nifAdjudicatario && (
                        <span className="text-[10px] font-mono text-[#94a3b8] block">
                          CIF: {formatNif(c.nifAdjudicatario)}
                        </span>
                      )}
                    </td>

                    {/* Duración */}
                    <td className="py-3 px-3 whitespace-nowrap text-slate-600 font-mono">
                      <span className="font-medium text-[#1e293b]">{c.duracionTexto}</span>
                      <span className="block text-[10px] text-slate-400">
                        Desde: {c.fechaInicio ? formatDate(c.fechaInicio) : '—'}
                      </span>
                    </td>

                    {/* Vencimiento Estimado */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-mono font-bold text-[#0f172a]">
                        {c.fechaFinEstimada ? formatDate(c.fechaFinEstimada) : '—'}
                      </div>
                      <div className="mt-0.5">
                        {getBadgeDias(c.diasRestantes)}
                      </div>
                    </td>

                    {/* Régimen Prórroga */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {c.esProrrogable ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]">
                          Prorrogable (Art. 29)
                        </span>
                      ) : c.procedimiento.toLowerCase().includes('menor') ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#f1f5f9] text-[#64748b]">
                          Sin prórroga (Menor)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#f8fafc] text-[#64748b] border border-[#e2e8f0]">
                          Plazo fijo
                        </span>
                      )}
                    </td>

                    {/* Importe */}
                    <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold text-[#0f172a]">
                      {c.amount === null ? 'Importe no comparable' : formatCurrency(c.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Botón de expandir / contraer */}
        {listaBase.length > 10 && (
          <div className="text-center pt-2">
            <button
              onClick={() => setMostrarTodos(!mostrarTodos)}
              className="px-4 py-2 text-xs font-bold text-[#0d9373] bg-[#ecfdf5] hover:bg-[#d1fae5] border border-[#a7f3d0] rounded-lg transition-all shadow-2xs"
            >
              {mostrarTodos
                ? 'Mostrar solo los primeros 10 contratos'
                : `Ver todos los ${listaBase.length} contratos vigentes de este grupo`}
            </button>
          </div>
        )}
      </div>

      {/* Desglose por Organismo y Tipo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#e2e8f0]">
        {/* Distribución por Organismo */}
        <div className="space-y-3">
          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-[#0d9373]" />
            Contratos Vivos por Organismo
          </h4>
          <div className="space-y-2">
            {distribucionPorOrganismo.map((org) => (
              <div
                key={org.organo}
                className="p-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-between text-xs"
              >
                <div className="min-w-0 pr-2">
                  <span className="font-bold text-[#1e293b] block truncate">{org.organo}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formatCompactCurrency(org.volumen)} en ejecución
                  </span>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-white border border-[#cbd5e1] font-mono font-bold text-[#0f172a]">
                    {org.vivos} vivos
                  </span>
                  {org.vencen6Meses > 0 && (
                    <span className="px-2 py-0.5 rounded bg-[#fffbeb] border border-[#fde68a] font-mono font-bold text-[#b45309]">
                      {org.vencen6Meses} vencen &le; 6m
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Distribución por Tipo de Contrato */}
        <div className="space-y-3">
          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Briefcase className="h-4 w-4 text-[#2563eb]" />
            Contratos Vivos por Tipología
          </h4>
          <div className="space-y-2">
            {distribucionPorTipo.map((tipo) => (
              <div
                key={tipo.tipo}
                className="p-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-between text-xs"
              >
                <div className="min-w-0 pr-2">
                  <span className="font-bold text-[#1e293b] block truncate">{tipo.tipo}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formatCompactCurrency(tipo.volumen)} en ejecución
                  </span>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-white border border-[#cbd5e1] font-mono font-bold text-[#0f172a]">
                    {tipo.vivos} vivos
                  </span>
                  {tipo.vencen6Meses > 0 && (
                    <span className="px-2 py-0.5 rounded bg-[#fffbeb] border border-[#fde68a] font-mono font-bold text-[#b45309]">
                      {tipo.vencen6Meses} vencen &le; 6m
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 border-t border-[#e2e8f0] pt-3 leading-relaxed">
        <strong>Nota metodológica:</strong> La fecha de finalización se calcula a partir de la fecha de formalización y la duración inicial publicada en los pliegos de PLACSP. Prórrogas legalmente acordadas o modificaciones de plazo pueden haberse acordado o publicarse con posterioridad.
      </p>
    </div>
  );
}
