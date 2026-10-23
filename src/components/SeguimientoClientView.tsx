'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  LicitacionAbiertaItem, 
  SeguimientoKpis 
} from '@/lib/seguimiento';
import { ContratosVivosStats } from '@/lib/contratos-vivos';
import { 
  formatCurrency, 
  formatCompactCurrency, 
  formatDate,
  formatNif
} from '@/lib/format';
import { 
  CalendarClock, 
  Clock, 
  AlertTriangle, 
  ExternalLink, 
  Search, 
  FileText, 
  Info, 
  Building2,
  Calendar,
  Sparkles,
  ChevronRight,
  Download
} from 'lucide-react';
import { getPlacspId } from '@/lib/placsp';

interface SeguimientoClientViewProps {
  kpis: SeguimientoKpis;
  licitacionesAbiertas: LicitacionAbiertaItem[];
  contratosVivos: ContratosVivosStats;
  currentAmbito?: string;
}

export default function SeguimientoClientView({
  kpis,
  licitacionesAbiertas,
  contratosVivos,
  currentAmbito = 'directa',
}: SeguimientoClientViewProps) {
  const [tabActiva, setTabActiva] = useState<'licitaciones' | 'vencimientos'>('licitaciones');
  
  // Filtros pestaña 1: Licitaciones abiertas
  const [filtroFase, setFiltroFase] = useState<'todas' | 'plazo_abierto' | 'evaluacion_plicas'>('todas');
  const [busquedaLicitaciones, setBusquedaLicitaciones] = useState('');

  // Filtros pestaña 2: Contratos próximos a vencer
  const [horizonteVencimiento, setHorizonteVencimiento] = useState<'30' | '60' | '90' | '180' | 'todos'>('180');
  const [busquedaContratos, setBusquedaContratos] = useState('');

  // Filtrado de licitaciones
  const licitacionesFiltradas = licitacionesAbiertas.filter((lic) => {
    if (filtroFase !== 'todas' && lic.fase !== filtroFase) return false;
    if (busquedaLicitaciones.trim()) {
      const q = busquedaLicitaciones.toLowerCase().trim();
      const matchObj = lic.object_description.toLowerCase().includes(q);
      const matchExp = lic.case_number.toLowerCase().includes(q);
      const matchOrg = lic.organo.toLowerCase().includes(q);
      if (!matchObj && !matchExp && !matchOrg) return false;
    }
    return true;
  });

  // Filtrado de contratos vivos
  const { todosVivos } = contratosVivos;
  const contratosFiltrados = todosVivos.filter((c) => {
    const dias = c.diasRestantes ?? 9999;
    if (horizonteVencimiento === '30' && dias > 30) return false;
    if (horizonteVencimiento === '60' && dias > 60) return false;
    if (horizonteVencimiento === '90' && dias > 90) return false;
    if (horizonteVencimiento === '180' && dias > 180) return false;

    if (busquedaContratos.trim()) {
      const q = busquedaContratos.toLowerCase().trim();
      const matchObj = c.object_description.toLowerCase().includes(q);
      const matchExp = c.case_number.toLowerCase().includes(q);
      const matchAdj = c.awardee.toLowerCase().includes(q);
      const matchOrg = c.organo.toLowerCase().includes(q);
      if (!matchObj && !matchExp && !matchAdj && !matchOrg) return false;
    }
    return true;
  });

  const getUrgencyBadge = (lic: LicitacionAbiertaItem) => {
    if (lic.fase === 'evaluacion_plicas') {
      if (!lic.fechaLimite) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <Clock className="h-3 w-3 text-slate-500" />
            {lic.procedimiento === 'Encargo a medio propio' ? 'Encargo a medio propio · Sin licitación' : 'Sin plazo de presentación'}
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
          <Clock className="h-3 w-3 text-slate-500" />
          Plazo cerrado · En evaluación
        </span>
      );
    }

    if (lic.diasRestantes === null) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <Clock className="h-3 w-3 text-blue-500" />
          Plazo de presentación abierto
        </span>
      );
    }

    if (lic.urgencia === 'critica') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300 animate-pulse">
          <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
          Cierra en {lic.diasRestantes} {lic.diasRestantes === 1 ? 'día' : 'días'} ({lic.diasHabilesRestantes} hábiles)
        </span>
      );
    }

    if (lic.urgencia === 'alta') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
          <Clock className="h-3.5 w-3.5 text-amber-600" />
          Cierra en {lic.diasRestantes} días ({lic.diasHabilesRestantes} hábiles)
        </span>
      );
    }

    if (lic.urgencia === 'media') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-yellow-50 text-yellow-800 border border-yellow-200">
          <Clock className="h-3.5 w-3.5 text-yellow-600" />
          Quedan {lic.diasRestantes} días (~{Math.round(lic.diasRestantes / 7)} semanas)
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <Clock className="h-3.5 w-3.5 text-emerald-600" />
        Quedan {lic.diasRestantes} días
      </span>
    );
  };

  return (
    <div className="space-y-8">
      {/* Tarjetas KPI de Vigilancia */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Convocatorias abiertas */}
        <div className="mint-card p-5 border-l-4 border-l-[#0d9373] space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {kpis.totalPlazoAbierto === 1 ? 'Convocatoria en Plazo' : 'Convocatorias en Plazo'}
            </span>
            <Sparkles className="h-4 w-4 text-[#0d9373]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {kpis.totalPlazoAbierto}
            </span>
            <span className="text-xs text-slate-500">de {kpis.totalConvocatoriasActivas} activas</span>
          </div>
          <p className="text-xs text-slate-600">
            {kpis.totalPlazoAbierto === 1
              ? 'Oportunidad con presentación de ofertas en curso'
              : 'Oportunidades con presentación de ofertas en curso'}
          </p>
        </div>

        {/* KPI 2: Importe Licitado en Concurso */}
        <div className="mint-card p-5 border-l-4 border-l-blue-500 space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Presupuesto en Concurso</span>
            <FileText className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {formatCompactCurrency(kpis.importeTotalLicitado)}
          </div>
          <p className="text-xs text-slate-600">
            Base sin IVA de licitaciones actualmente abiertas
          </p>
        </div>

        {/* KPI 3: Vencimientos a 30 días */}
        <div className="mint-card p-5 border-l-4 border-l-amber-500 space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Vencen en ≤ 30 Días</span>
            <CalendarClock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {kpis.contratosVencen30Dias}
            </span>
            <span className="text-xs font-semibold text-amber-700">
              ({formatCompactCurrency(kpis.volumenVence30Dias)})
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Servicios en fase inminente de renovación o prórroga
          </p>
        </div>

        {/* KPI 4: Vencimientos a 6 meses */}
        <div className="mint-card p-5 border-l-4 border-l-purple-500 space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Vencen en ≤ 6 Meses</span>
            <Calendar className="h-4 w-4 text-purple-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {kpis.contratosVencen180Dias}
            </span>
            <span className="text-xs font-semibold text-purple-700">
              ({formatCompactCurrency(kpis.volumenVence180Dias)})
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Horizonte preventivo para preparar nuevos pliegos
          </p>
        </div>
      </div>

      {/* Pestañas Principales */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200">
          <div className="flex items-center gap-3 overflow-x-auto max-w-full scrollbar-none whitespace-nowrap">
            <button
              onClick={() => setTabActiva('licitaciones')}
              className={`flex items-center gap-2 pb-3.5 px-2 text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                tabActiva === 'licitaciones'
                  ? 'border-[#0d9373] text-[#0d9373]'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span>1. Licitaciones Abiertas en Plazo</span>
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 font-extrabold">
                {licitacionesAbiertas.length}
              </span>
            </button>

            <button
              onClick={() => setTabActiva('vencimientos')}
              className={`flex items-center gap-2 pb-3.5 px-2 text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                tabActiva === 'vencimientos'
                  ? 'border-[#0d9373] text-[#0d9373]'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <CalendarClock className="h-4 w-4" />
              <span>2. Contratos Próximos a Vencer</span>
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-extrabold">
                {kpis.contratosVencen180Dias}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-3 pb-3 sm:pb-0 text-xs text-slate-500">
            <span>
              {tabActiva === 'licitaciones'
                ? `Mostrando ${licitacionesFiltradas.length} convocatorias`
                : `Mostrando ${contratosFiltrados.length} contratos vigentes`}
            </span>
            <a
              href={`/api/export/licitaciones?format=csv&ambito=${currentAmbito}`}
              download
              className="inline-flex items-center gap-1 font-semibold text-[#0d9373] hover:underline"
              title="Descargar catálogo en CSV para Excel"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Exportar CSV</span>
            </a>
          </div>
        </div>

        {/* PESTAÑA 1: LICITACIONES ABIERTAS */}
        {tabActiva === 'licitaciones' && (
          <div className="space-y-6">
            {/* Barra de Filtros y Búsqueda */}
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por objeto, expediente u órgano..."
                  value={busquedaLicitaciones}
                  onChange={(e) => setBusquedaLicitaciones(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-xs border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#0d9373]/30 focus:border-[#0d9373]"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setFiltroFase('todas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filtroFase === 'todas'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Todas ({licitacionesAbiertas.length})
                </button>
                <button
                  onClick={() => setFiltroFase('plazo_abierto')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filtroFase === 'plazo_abierto'
                      ? 'bg-[#0d9373] text-white'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  Plazo Abierto ({kpis.totalPlazoAbierto})
                </button>
                <button
                  onClick={() => setFiltroFase('evaluacion_plicas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filtroFase === 'evaluacion_plicas'
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  En Evaluación ({kpis.totalEnEvaluacion})
                </button>
              </div>
            </div>

            {/* Listado de Licitaciones */}
            {licitacionesFiltradas.length === 0 ? (
              <div className="mint-card p-12 text-center space-y-3">
                <FileText className="h-10 w-10 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-800">
                  No se encontraron licitaciones con los filtros seleccionados
                </p>
                <p className="text-xs text-slate-500">
                  Prueba a ajustar la búsqueda o seleccionar otro ámbito institucional.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {licitacionesFiltradas.map((lic) => (
                  <div
                    key={lic.id}
                    className="mint-card p-5 sm:p-6 transition-all hover:border-slate-400 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {getUrgencyBadge(lic)}
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-700">
                          {lic.case_number}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
                          {lic.tipoContrato}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
                          {lic.procedimiento}
                        </span>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-xs text-slate-500 block">Presupuesto base licitación</span>
                        <span className="text-lg font-extrabold text-slate-900 font-mono">
                          {lic.importeSinIva ? formatCurrency(lic.importeSinIva) : 'No desglosado'}
                        </span>
                        {lic.importeConIva && (
                          <span className="text-[11px] text-slate-400 block">
                            ({formatCurrency(lic.importeConIva)} con IVA)
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                        <Link
                          href={`/licitaciones/${encodeURIComponent(getPlacspId(lic.id) || lic.id)}`}
                          className="hover:text-[#0d9373] transition-colors"
                        >
                          {lic.object_description}
                        </Link>
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        <span>{lic.organo}</span>
                        <span>·</span>
                        <span className="font-semibold text-slate-700">{lic.scope}</span>
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center gap-4">
                        <div>
                          <span className="text-slate-400">Publicado: </span>
                          <span className="font-medium text-slate-700">{formatDate(lic.fechaPublicacion)}</span>
                        </div>
                        {lic.fechaLimite && (
                          <div>
                            <span className="text-slate-400">Límite presentación: </span>
                            <span className="font-bold text-slate-900">{formatDate(lic.fechaLimite)}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 flex-wrap">
                        {lic.url && (
                          <a
                            href={lic.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 transition-colors"
                            title="Abrir pliegos oficiales en la Plataforma de Contratación del Sector Público (PLACSP)"
                          >
                            <span>PLACSP</span>
                            <ExternalLink className="h-3 w-3 text-slate-400" />
                          </a>
                        )}
                        <Link
                          href={`/licitaciones/${encodeURIComponent(getPlacspId(lic.id) || lic.id)}`}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#0d9373] text-white hover:bg-[#0b7a60] transition-colors shadow-xs"
                        >
                          <span>Ver expediente</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA 2: CONTRATOS PRÓXIMOS A VENCER */}
        {tabActiva === 'vencimientos' && (
          <div className="space-y-6">
            {/* Advertencia Metodológica Art. 29 LCSP */}
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
              <Info className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed space-y-1">
                <p className="font-bold">
                  Seguimiento y Control de Prórrogas (Art. 29 LCSP):
                </p>
                <p className="text-amber-800">
                  Esta herramienta calcula la fecha de finalización registrada o vencimiento estimado a partir de la duración oficial publicada en PLACSP para los contratos formalizados por el Ayuntamiento y Comsermancha. Permite anticipar cuándo deben licitarse de nuevo los servicios para asegurar la libre concurrencia. Advertencia: las prórrogas formalizadas o modificaciones contractuales pueden constar en el expediente o publicarse con posterioridad en la plataforma.
                </p>
              </div>
            </div>

            {/* Filtros de Horizonte y Búsqueda */}
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por contratista, objeto o expediente..."
                  value={busquedaContratos}
                  onChange={(e) => setBusquedaContratos(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-xs border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#0d9373]/30 focus:border-[#0d9373]"
                />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-500 font-semibold mr-1">Horizonte:</span>
                {[
                  { id: '30', label: '≤ 30 días' },
                  { id: '60', label: '≤ 60 días' },
                  { id: '90', label: '≤ 90 días' },
                  { id: '180', label: '≤ 6 meses' },
                  { id: 'todos', label: 'Todos los vigentes' },
                ].map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setHorizonteVencimiento(h.id as any)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      horizonteVencimiento === h.id
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Listado de Contratos Próximos a Expirar */}
            {contratosFiltrados.length === 0 ? (
              <div className="mint-card p-12 text-center space-y-3">
                <CalendarClock className="h-10 w-10 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-800">
                  No hay contratos que venzan en el horizonte seleccionado
                </p>
                <p className="text-xs text-slate-500">
                  Amplía el horizonte a 6 meses o selecciona &quot;Todos los vigentes&quot; para inspeccionar la cartera activa completa.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {contratosFiltrados.map((c) => (
                  <div
                    key={c.id}
                    className="mint-card p-5 sm:p-6 transition-all hover:border-slate-400 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {c.diasRestantes !== null && c.diasRestantes <= 30 ? (
                          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300 animate-pulse">
                            Vence en {c.diasRestantes} {c.diasRestantes === 1 ? 'día' : 'días'}
                          </span>
                        ) : c.diasRestantes !== null && c.diasRestantes <= 90 ? (
                          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            Vence en {c.diasRestantes} días (~{Math.round(c.diasRestantes / 30)} meses)
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            En {c.diasRestantes} días (~{Math.round((c.diasRestantes ?? 0) / 30)} meses)
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-700">
                          {c.case_number}
                        </span>

                        {c.esProrrogable ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Prorrogable (Art. 29 LCSP)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                            Ejecución única / No prorrogable
                          </span>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-slate-500 block">Importe adjudicado</span>
                        <span className="text-lg font-extrabold text-slate-900 font-mono">
                          {c.amount === null ? 'Importe no comparable' : formatCurrency(c.amount)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                        {c.object_description}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">
                          Contratista: {c.awardee} {c.nifAdjudicatario ? `(${formatNif(c.nifAdjudicatario)})` : ''}
                        </span>
                        <span>·</span>
                        <span>{c.organo}</span>
                        <span>·</span>
                        <span className="text-slate-500">Duración: {c.duracionTexto}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center gap-4">
                        <div>
                          <span className="text-slate-400">Inicio estimado: </span>
                          <span className="font-medium text-slate-700">{formatDate(c.fechaInicio)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Fin estimado: </span>
                          <span className="font-bold text-slate-900">{formatDate(c.fechaFinEstimada)}</span>
                        </div>
                      </div>

                      <Link
                        href={`/licitaciones/${encodeURIComponent(getPlacspId(c.id) || c.id)}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#0d9373] text-white hover:bg-[#0b7a60] transition-colors shadow-xs"
                      >
                        <span>Ver expediente</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
