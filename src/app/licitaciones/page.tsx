'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency, formatNumber, formatDate, formatNif } from '@/lib/format';
import { getPlacspId } from '@/lib/placsp';
import { getEconomicFlow } from '@/lib/naturaleza-economica';
import { getContractAmountPresentation } from '@/lib/importe-presentacion';
import { getContractStatus } from '@/lib/contract-status';
import { EstadoBadge, TipoBadge, ProcedimientoBadge } from '@/components/Badge';
import { 
  Search, 
  Filter, 
  Download, 
  ArrowUpDown, 
  ExternalLink, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  SlidersHorizontal,
  X,
  FileText,
  AlertTriangle
} from 'lucide-react';

const ECONOMIC_FLOW_LABELS = {
  paga: 'Gasto municipal',
  recibe: 'Ingreso municipal',
  sin_flujo_directo: 'Sin flujo municipal directo determinado',
  no_determinado: 'Sentido económico no determinado',
} as const;

function isTerminalContract(lic: Pick<LicitacionItem, 'estado' | 'fecha_adjudicacion' | 'importe_adjudicacion'>): boolean {
  return getContractStatus({
    estado: lic.estado,
    fechaAdjudicacion: lic.fecha_adjudicacion,
    importeAdjudicacion: lic.importe_adjudicacion,
  }).flags.isTerminal;
}

interface LicitacionItem {
  id: string;
  expediente: string;
  objeto: string;
  contracting_authority_name: string;
  tipo_contrato: string;
  procedimiento: string;
  estado: string;
  importe_sin_iva: number | null;
  importe_adjudicacion: number | null;
  valor_estimado: number | null;
  award_amount_type?: 'total' | 'unitario' | 'desconocido' | null;
  adjudicatario: string | null;
  nif_adjudicatario: string | null;
  num_ofertas: number | null;
  financiacion_ue?: string | null;
  conjunto?: string | null;
  fecha_publicacion: string | null;
  fecha_adjudicacion: string | null;
  scope: string;
  naturaleza_economica?: string | null;
  flujo_economico?: 'paga' | 'recibe' | 'sin_flujo_directo' | 'no_determinado' | null;
  url: string | null;
  num_modificaciones?: number;
  mod_prorroga_dias?: number;
  mod_prorroga_meses?: number;
  mod_sobrecoste_importe?: number;
}

function LicitacionesContent() {
  const searchParams = useSearchParams();

  const currentYear = new Date().getFullYear();
  const anoParam = searchParams.get('year');

  // Search and filter states
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [organo, setOrgano] = useState(searchParams.get('organo') || '');
  const [year, setAno] = useState<string>(() => {
    if (anoParam !== null) {
      return anoParam === 'all' || anoParam === 'todos' ? '' : anoParam;
    }
    return String(currentYear);
  });
  const [tipo, setTipo] = useState(searchParams.get('tipo') || '');
  const [procedimiento, setProcedimiento] = useState(searchParams.get('procedimiento') || '');
  const [estado, setEstado] = useState(searchParams.get('estado') || '');
  const [scope, setAmbito] = useState(searchParams.get('scope') || '');
  const [flujoEconomico, setFlujoEconomico] = useState(searchParams.get('flujo') || '');
  const [alerta, setAlerta] = useState(searchParams.get('alerta') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'reciente');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);

  // Data states
  const [data, setData] = useState<LicitacionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterOptions, setFilterOptions] = useState<any>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Load filter values once
  useEffect(() => {
    fetch('/api/filters')
      .then((r) => r.json())
      .then((d) => {
        setFilterOptions(d);
        if (searchParams.get('year') === null) {
          const anos: number[] = d?.anos || [];
          if (!anos.includes(currentYear)) {
            setAno('');
          }
        }
      })
      .catch((e) => console.error(e));
  }, [currentYear, searchParams]);

  // Fetch results
  const fetchLicitaciones = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (organo) params.set('organo', organo);
      if (year) params.set('year', year);
      if (tipo) params.set('tipo', tipo);
      if (procedimiento) params.set('procedimiento', procedimiento);
      if (estado) params.set('estado', estado);
      if (scope) params.set('scope', scope);
      if (flujoEconomico) params.set('flujo', flujoEconomico);
      if (alerta) params.set('alerta', alerta);
      if (sort) params.set('sort', sort);
      params.set('page', String(page));
      params.set('limit', '15');

      const res = await fetch(`/api/licitaciones?${params.toString()}`);
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [q, organo, year, tipo, procedimiento, estado, scope, flujoEconomico, alerta, sort, page]);

  useEffect(() => {
    fetchLicitaciones();
  }, [fetchLicitaciones]);

  const handleFilterChange = (setter: (val: string) => void, val: string) => {
    setter(val);
    setPage(1);
  };

  const handleResetFilters = () => {
    setQ('');
    setOrgano('');
    setAno('');
    setTipo('');
    setProcedimiento('');
    setEstado('');
    setAmbito('');
    setFlujoEconomico('');
    setAlerta('');
    setSort('reciente');
    setPage(1);
  };

  // Active filters list
  const activeFilters = [
    q ? { label: `Búsqueda: "${q}"`, clear: () => setQ('') } : null,
    alerta ? {
      label: alerta === 'oferta_unica' ? '⚠️ Alerta: Oferta Única' :
             alerta === 'baja_cero' ? '🚨 Alerta: Al Máximo Presupuestado (0% Rebaja)' :
             alerta === 'alerta_menor' ? '🎯 Alerta: Menor >90% Límite' :
             alerta === 'fondos_ue' ? '🇪🇺 Fondos UE / PRTR' :
             alerta === 'prorroga' ? '⏱️ Alerta: Con Ampliación de Plazo / Prórroga' :
             alerta === 'modificaciones' ? '🔄 Con Modificaciones Posteriores' : 'Alerta Especial',
      clear: () => setAlerta('')
    } : null,
    organo ? {
      label: filterOptions?.organismos?.find((authority: any) => authority.authorityId === organo)?.organo || organo,
      clear: () => setOrgano(''),
    } : null,
    year ? { label: `Año ${year}`, clear: () => setAno('') } : null,
    tipo ? { label: tipo, clear: () => setTipo('') } : null,
    procedimiento ? { label: procedimiento, clear: () => setProcedimiento('') } : null,
    estado ? { label: estado, clear: () => setEstado('') } : null,
    scope ? { label: scope, clear: () => setAmbito('') } : null,
    flujoEconomico ? {
      label: flujoEconomico === 'paga' ? 'Gasto municipal' :
             flujoEconomico === 'recibe' ? 'Ingreso municipal' :
             flujoEconomico === 'sin_flujo_directo' ? 'Sin flujo municipal directo determinado' :
             'Sentido económico no determinado',
      clear: () => setFlujoEconomico('')
    } : null,
  ].filter(Boolean) as { label: string; clear: () => void }[];

  // Export CSV
  const handleExportCSV = () => {
    if (data.length === 0) return;
    const headers = ['Expediente', 'Objeto', 'Organismo', 'Sentido económico', 'Tipo', 'Procedimiento', 'Estado', 'Importe Adjudicacion', 'PBL sin IVA', 'Adjudicatario', 'NIF', 'Fecha'];
    const rows = data.map((d) => {
      const flujo = d.flujo_economico || getEconomicFlow(d.naturaleza_economica as any);
      const flujoLabel = ECONOMIC_FLOW_LABELS[flujo] || ECONOMIC_FLOW_LABELS.no_determinado;
      return [
        `"${(d.expediente || '').replace(/"/g, '""')}"`,
        `"${(d.objeto || '').replace(/"/g, '""')}"`,
        `"${(d.contracting_authority_name || '').replace(/"/g, '""')}"`,
        `"${flujoLabel.replace(/"/g, '""')}"`,
        `"${(d.tipo_contrato || '').replace(/"/g, '""')}"`,
        `"${(d.procedimiento || '').replace(/"/g, '""')}"`,
        `"${(d.estado || '').replace(/"/g, '""')}"`,
        d.award_amount_type === 'unitario' || d.award_amount_type === 'desconocido'
          ? ''
          : d.importe_adjudicacion ?? '',
        d.importe_sin_iva ?? '',
        `"${(d.adjudicatario || '').replace(/"/g, '""')}"`,
        `"${formatNif(d.nif_adjudicatario).replace(/"/g, '""')}"`,
        d.fecha_publicacion || d.fecha_adjudicacion || '',
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `licitaciones_alcazar_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6 bg-[#ffffff]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e2e8f0] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
              <FileText className="h-4 w-4" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1e293b] tracking-tight">
              Explorador de Licitaciones y Contratos
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[#64748b] mt-1">
            Buscador oficial en los {formatNumber(total)} contratos adjudicados directa o indirectamente por el Ayuntamiento de Alcázar de San Juan
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white hover:bg-[#f8fafb] border border-[#e2e8f0] hover:border-[#cbd5e1] text-xs font-semibold text-slate-700 transition-all shadow-xs"
          >
            <Download className="h-3.5 w-3.5 text-[#0d9373]" />
            <span>Descargar CSV</span>
          </button>
          <button
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            className="lg:hidden flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#f8fafb] text-xs font-semibold text-slate-700 border border-[#e2e8f0]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filtros</span>
          </button>
        </div>
      </div>

      {/* Aviso de filtro de año por defecto (aplicado automáticamente al entrar sin filtros explícitos) */}
      {anoParam === null && year === String(currentYear) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 rounded-xl bg-[#eff6ff] border border-[#dbeafe] text-xs text-[#1e40af]">
          <span>
            Por defecto se muestra solo el ejercicio en curso (<strong>{currentYear}</strong>).
            {filterOptions?.totalGlobal ? (
              <> El histórico completo desde 2018 tiene <strong>{formatNumber(filterOptions.totalGlobal)}</strong> contratos.</>
            ) : null}
          </span>
          <button
            onClick={() => handleFilterChange(setAno, '')}
            className="font-semibold underline underline-offset-2 hover:text-[#1d4ed8] shrink-0 text-left sm:text-right"
          >
            Ver histórico completo →
          </button>
        </div>
      )}

      {/* Main Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Buscar por objeto, expediente, adjudicatario o CIF..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl bg-white border border-[#e2e8f0] px-4 py-3 pl-10 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:border-[#00d4a4] focus:outline-none focus:ring-4 focus:ring-[#00d4a4]/10 transition-all shadow-xs"
          />
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
          {q && (
            <button
              onClick={() => {
                setQ('');
                setPage(1);
              }}
              className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Scope Pills */}
        <div className="flex items-center overflow-x-auto max-w-full scrollbar-none rounded-xl bg-[#f1f5f7] p-1 border border-[#e2e8f0] text-xs shrink-0">
          <button
            onClick={() => handleFilterChange(setAmbito, '')}
            className={`px-3 py-2 rounded-lg transition-all font-semibold whitespace-nowrap cursor-pointer ${
              scope === ''
                ? 'bg-white text-[#1e293b] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todos ({formatNumber(total)})
          </button>
          <button
            onClick={() => handleFilterChange(setAmbito, 'Directa Municipal')}
            className={`px-3 py-2 rounded-lg transition-all font-semibold whitespace-nowrap cursor-pointer ${
              scope === 'Directa Municipal'
                ? 'bg-white text-[#1e293b] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Control Directo (Ayto. y OOAA)
          </button>
          <button
            onClick={() => handleFilterChange(setAmbito, 'Indirecta (Mancomunidad)')}
            className={`px-3 py-2 rounded-lg transition-all font-semibold whitespace-nowrap cursor-pointer ${
              scope === 'Indirecta (Mancomunidad)'
                ? 'bg-white text-[#1e293b] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Control Indirecto (Comsermancha)
          </button>
        </div>
      </div>

      {/* Red Flags Quick Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto max-w-full scrollbar-none pb-1 sm:flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1.5 shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 text-[#d97706]" />
          <span>Filtro Alertas:</span>
        </span>
        <button
          onClick={() => handleFilterChange(setAlerta, '')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border whitespace-nowrap shrink-0 cursor-pointer ${
            alerta === ''
              ? 'bg-[#0a0a0a] text-white border-[#0a0a0a] shadow-xs'
              : 'bg-white text-slate-600 border-[#e2e8f0] hover:bg-[#f8fafb]'
          }`}
        >
          Todos
        </button>
        <button
          onClick={() => handleFilterChange(setAlerta, 'oferta_unica')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
            alerta === 'oferta_unica'
              ? 'bg-[#fffbeb] text-[#b45309] border-[#fde68a] ring-2 ring-[#fde68a]/60 shadow-xs font-bold'
              : 'bg-white text-slate-700 border-[#e2e8f0] hover:bg-[#fffbeb] hover:text-[#b45309]'
          }`}
        >
          <span>⚠️ Oferta Única</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/70 border border-[#fde68a]/50">
            {filterOptions?.alertasCounts?.ofertaUnica ?? '—'}
          </span>
        </button>
        <button
          onClick={() => handleFilterChange(setAlerta, 'baja_cero')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
            alerta === 'baja_cero'
              ? 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca] ring-2 ring-[#fecaca]/60 shadow-xs font-bold'
              : 'bg-white text-slate-700 border-[#e2e8f0] hover:bg-[#fef2f2] hover:text-[#dc2626]'
          }`}
        >
          <span>🚨 Al Máximo Presupuestado</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/70 border border-[#fecaca]/50">
            {filterOptions?.alertasCounts?.alMaximo ?? '—'}
          </span>
        </button>
        <button
          onClick={() => handleFilterChange(setAlerta, 'alerta_menor')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
            alerta === 'alerta_menor'
              ? 'bg-[#fffbeb] text-[#d97706] border-[#fde68a] ring-2 ring-[#fde68a]/60 shadow-xs font-bold'
              : 'bg-white text-slate-700 border-[#e2e8f0] hover:bg-[#fffbeb] hover:text-[#d97706]'
          }`}
        >
          <span>🎯 Menores &gt;90% Límite</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/70 border border-[#fde68a]/50">
            {filterOptions?.alertasCounts?.alertaMenor ?? '—'}
          </span>
        </button>
        <button
          onClick={() => handleFilterChange(setAlerta, 'fondos_ue')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
            alerta === 'fondos_ue'
              ? 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe] ring-2 ring-[#bfdbfe]/60 shadow-xs font-bold'
              : 'bg-white text-slate-700 border-[#e2e8f0] hover:bg-[#eff6ff] hover:text-[#2563eb]'
          }`}
        >
          <span>🇪🇺 Fondos UE / PRTR</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/70 border border-[#bfdbfe]/50">
            {filterOptions?.alertasCounts?.fondosUe ?? '—'}
          </span>
        </button>
        <button
          onClick={() => handleFilterChange(setAlerta, 'prorroga')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
            alerta === 'prorroga'
              ? 'bg-[#fffbeb] text-[#b45309] border-[#fde68a] ring-2 ring-[#fde68a]/60 shadow-xs font-bold'
              : 'bg-white text-slate-700 border-[#e2e8f0] hover:bg-[#fffbeb] hover:text-[#b45309]'
          }`}
          title="Filtrar contratos con prórrogas o ampliaciones de plazo formalmente aprobadas"
        >
          <span>⏱️ Con Prórroga / Retraso</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/70 border border-[#fde68a]/50">
            {filterOptions?.alertasCounts?.prorroga ?? '—'}
          </span>
        </button>
      </div>

      {/* Active Filter Chips */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-slate-400 text-[11px] font-medium">Filtros activos:</span>
          {activeFilters.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ecfdf5] border border-[#d1fae5] text-[#0d9373] text-xs font-semibold"
            >
              <span>{f.label}</span>
              <button onClick={() => { f.clear(); setPage(1); }} className="hover:text-[#047857]">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            onClick={handleResetFilters}
            className="text-[11px] text-slate-500 hover:text-[#0d9373] underline underline-offset-2 ml-1"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* Grid: Sidebar Filters + Results List */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Sidebar Filters */}
        <div
          className={`${
            mobileFiltersOpen ? 'block' : 'hidden lg:block'
          } mint-card p-5 space-y-4`}
        >
          <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#1e293b] flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-[#0d9373]" />
              <span>Filtros Facetados</span>
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetFilters}
                className="text-[11px] font-semibold text-[#0d9373] hover:underline cursor-pointer"
              >
                Restablecer
              </button>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="lg:hidden p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Cerrar panel de filtros"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Organismo */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Organismo Contratante
            </label>
            <select
              value={organo}
              onChange={(e) => handleFilterChange(setOrgano, e.target.value)}
              className="w-full rounded-lg bg-[#f8fafb] border border-[#e2e8f0] px-3 py-2 text-xs text-slate-800 focus:border-[#00d4a4] focus:outline-none"
            >
              <option value="">Todos los organismos</option>
              {filterOptions?.organismos?.map((org: any) => (
                <option key={org.authorityId} value={org.authorityId}>
                  {org.organo} ({org.count})
                </option>
              ))}
            </select>
          </div>

          {/* Año */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Año de Tramitación
            </label>
            <select
              value={year}
              onChange={(e) => handleFilterChange(setAno, e.target.value)}
              className="w-full rounded-lg bg-[#f8fafb] border border-[#e2e8f0] px-3 py-2 text-xs text-slate-800 focus:border-[#00d4a4] focus:outline-none"
            >
              <option value="">
                Todos los años{filterOptions?.anos?.length ? ` (${filterOptions.anos[filterOptions.anos.length - 1]}–${filterOptions.anos[0]})` : ''}
              </option>
              {filterOptions?.anos?.map((a: number) => (
                <option key={a} value={String(a)}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Flujo económico */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Sentido económico
            </label>
            <select
              value={flujoEconomico}
              onChange={(e) => handleFilterChange(setFlujoEconomico, e.target.value)}
              className="w-full rounded-lg bg-[#f8fafb] border border-[#e2e8f0] px-3 py-2 text-xs text-slate-800 focus:border-[#00d4a4] focus:outline-none"
              title="Clasificación derivada de la naturaleza económica del expediente. En concesiones no se presupone un flujo municipal directo."
            >
              <option value="">Todos los sentidos</option>
              {filterOptions?.flujosEconomicos?.map((f: any) => (
                <option key={f.flujo} value={f.flujo}>
                  {f.label} ({f.count})
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de Contrato */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Tipo de Contrato
            </label>
            <select
              value={tipo}
              onChange={(e) => handleFilterChange(setTipo, e.target.value)}
              className="w-full rounded-lg bg-[#f8fafb] border border-[#e2e8f0] px-3 py-2 text-xs text-slate-800 focus:border-[#00d4a4] focus:outline-none"
            >
              <option value="">Todos los tipos</option>
              {filterOptions?.tipos?.map((t: any) => (
                <option key={t.tipo} value={t.tipo}>
                  {t.tipo} ({t.count})
                </option>
              ))}
            </select>
          </div>

          {/* Procedimiento */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Procedimiento
            </label>
            <select
              value={procedimiento}
              onChange={(e) => handleFilterChange(setProcedimiento, e.target.value)}
              className="w-full rounded-lg bg-[#f8fafb] border border-[#e2e8f0] px-3 py-2 text-xs text-slate-800 focus:border-[#00d4a4] focus:outline-none"
            >
              <option value="">Todos los procedimientos</option>
              {filterOptions?.procedimientos?.map((p: any) => (
                <option key={p.procedimiento} value={p.procedimiento}>
                  {p.procedimiento} ({p.count})
                </option>
              ))}
            </select>
          </div>

          {/* Estado */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Estado del Expediente
            </label>
            <select
              value={estado}
              onChange={(e) => handleFilterChange(setEstado, e.target.value)}
              className="w-full rounded-lg bg-[#f8fafb] border border-[#e2e8f0] px-3 py-2 text-xs text-slate-800 focus:border-[#00d4a4] focus:outline-none"
            >
              <option value="">Todos los estados</option>
              {filterOptions?.estados?.map((st: any) => (
                <option key={st.estado} value={st.estado}>
                  {st.estado} ({st.count})
                </option>
              ))}
            </select>
          </div>

          {/* Ordenación */}
          <div className="space-y-1.5 pt-2 border-t border-[#e2e8f0]">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <ArrowUpDown className="h-3 w-3 text-slate-400" />
              <span>Ordenar Resultados</span>
            </label>
            <select
              value={sort}
              onChange={(e) => handleFilterChange(setSort, e.target.value)}
              className="w-full rounded-lg bg-[#f8fafb] border border-[#e2e8f0] px-3 py-2 text-xs text-slate-800 focus:border-[#00d4a4] focus:outline-none"
            >
              <option value="reciente">Más recientes primero</option>
              <option value="antiguo">Más antiguos primero</option>
              <option value="mayor_importe">Mayor importe (€)</option>
              <option value="menor_importe">Menor importe (€)</option>
              <option value="mas_ofertas">Mayor concurrencia de ofertas</option>
            </select>
          </div>

          {/* Botón Aplicar en móvil */}
          <div className="lg:hidden pt-3 border-t border-[#e2e8f0]">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="w-full py-2.5 rounded-xl bg-[#0d9373] hover:bg-[#0b7a60] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer text-center"
            >
              Ver resultados ({formatNumber(total)} contratos)
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-mono">
            <span>
              Mostrando <strong className="text-slate-900">{data.length}</strong> de{' '}
              <strong className="text-[#0d9373]">{formatNumber(total)}</strong> contratos
            </span>
            <span>Página {page} de {totalPages || 1}</span>
          </div>

          {loading ? (
            <div className="mint-card p-16 text-center text-slate-400 space-y-3">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-[#00d4a4]" />
              <p className="text-xs font-semibold">Consultando base de datos oficial...</p>
            </div>
          ) : data.length === 0 ? (
            <div className="mint-card p-16 text-center space-y-3">
              <p className="text-base font-bold text-slate-800">No se encontraron licitaciones</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No hay contratos que coincidan con la combinación de filtros seleccionada. Prueba a restablecer los filtros para ver más resultados.
              </p>
              <button
                onClick={handleResetFilters}
                className="px-4 py-2 rounded-lg bg-[#f1f5f7] hover:bg-[#e2e8f0] text-xs text-slate-800 font-bold transition-all"
              >
                Limpiar todos los filtros
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {data.map((lic) => (
                <div
                  key={lic.id}
                  className="mint-card p-5 hover:border-[#cbd5e1] transition-all flex flex-col justify-between gap-3 group"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-mono font-medium text-slate-500 bg-[#f8fafb] px-2 py-0.5 rounded border border-[#e2e8f0]">
                        {lic.expediente || 'Sin exp.'}
                      </span>
                      <EstadoBadge estado={lic.estado} />
                      <TipoBadge tipo={lic.tipo_contrato} />
                      {(() => {
                        const flujo = lic.flujo_economico || getEconomicFlow(lic.naturaleza_economica as any);
                        const label = ECONOMIC_FLOW_LABELS[flujo] || ECONOMIC_FLOW_LABELS.no_determinado;
                        return (
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200"
                            title={
                              flujo === 'paga'
                                ? 'Clasificación económica: gasto municipal.'
                                : flujo === 'recibe'
                                  ? 'Clasificación económica: ingreso municipal.'
                                  : flujo === 'sin_flujo_directo'
                                    ? 'Concesión: no se presupone un flujo municipal directo sin evidencia suficiente.'
                                    : 'No se ha podido determinar el sentido económico con la clasificación disponible.'
                            }
                          >
                            {label}
                          </span>
                        );
                      })()}
                      <ProcedimientoBadge procedimiento={lic.procedimiento} />
                      {lic.num_ofertas === 1 && Boolean(lic.adjudicatario && lic.adjudicatario.trim() && lic.adjudicatario !== 'Sin adjudicatario') && !isTerminalContract(lic) && lic.procedimiento !== 'Contrato menor' && lic.procedimiento !== 'Menor' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fffbeb] text-[#b45309] border border-[#fef3c7]">
                          ⚠️ Oferta Única
                        </span>
                      )}
                      {Boolean(lic.adjudicatario && lic.adjudicatario.trim() && lic.adjudicatario !== 'Sin adjudicatario') && !isTerminalContract(lic) && lic.award_amount_type !== 'unitario' && lic.award_amount_type !== 'desconocido' && lic.importe_sin_iva && lic.importe_adjudicacion && Math.abs(lic.importe_adjudicacion - lic.importe_sin_iva) <= 0.05 && lic.procedimiento !== 'Contrato menor' && lic.procedimiento !== 'Menor' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fef2f2] text-[#dc2626] border border-[#fee2e2]">
                          🚨 Al Máximo Presupuestado
                        </span>
                      )}
                      {(lic.conjunto === 'menores' || lic.conjunto === 'contratos_menores' || lic.procedimiento === 'Contrato menor' || lic.procedimiento === 'Menor') && lic.valor_estimado != null && ((lic.tipo_contrato?.toLowerCase().includes('obra') && lic.valor_estimado >= 36000 && lic.valor_estimado < 40000) || (!lic.tipo_contrato?.toLowerCase().includes('obra') && lic.valor_estimado >= 13500 && lic.valor_estimado < 15000)) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fffbeb] text-[#d97706] border border-[#fef3c7]">
                          ⚠️ Cerca del límite legal
                        </span>
                      )}
                      {(lic.conjunto === 'menores' || lic.conjunto === 'contratos_menores' || lic.procedimiento === 'Contrato menor' || lic.procedimiento === 'Menor') && lic.valor_estimado != null && ((lic.tipo_contrato?.toLowerCase().includes('obra') && lic.valor_estimado >= 40000) || (!lic.tipo_contrato?.toLowerCase().includes('obra') && lic.valor_estimado >= 15000)) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fef2f2] text-[#dc2626] border border-[#fee2e2]">
                          🎯 Límite legal
                        </span>
                      )}
                      {(lic.financiacion_ue === '1' || (lic.objeto || '').toUpperCase().includes('PRTR') || (lic.objeto || '').toUpperCase().includes('NEXTGENERATION') || (lic.objeto || '').toUpperCase().includes('FEDER')) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
                          🇪🇺 Fondos UE
                        </span>
                      )}
                      {lic.mod_prorroga_dias && lic.mod_prorroga_dias > 0 ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-1" title={`Ampliación de plazo: +${lic.mod_prorroga_dias} días naturales`}>
                          ⏱️ Prórroga (+{lic.mod_prorroga_dias}d)
                        </span>
                      ) : lic.mod_prorroga_meses && lic.mod_prorroga_meses > 0 ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-1" title={`Ampliación de plazo: +${lic.mod_prorroga_meses} meses`}>
                          ⏱️ Prórroga (+{lic.mod_prorroga_meses}m)
                        </span>
                      ) : null}
                      {lic.mod_sobrecoste_importe && lic.mod_sobrecoste_importe > 0 ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-200 flex items-center gap-1" title={`Sobrecoste presupuestario acumulado: +${formatCurrency(lic.mod_sobrecoste_importe)}`}>
                          📈 Sobrecoste (+{formatCurrency(lic.mod_sobrecoste_importe)})
                        </span>
                      ) : null}
                      <span className="text-[11px] font-mono text-slate-400 ml-auto hidden sm:inline">
                        {formatDate(lic.fecha_publicacion || lic.fecha_adjudicacion)}
                      </span>
                    </div>

                    <Link
                      href={`/licitaciones/${encodeURIComponent(getPlacspId(lic.id) || lic.id)}`}
                      className="text-sm sm:text-base font-bold text-[#1e293b] hover:text-[#0d9373] transition-colors block line-clamp-2 leading-snug"
                    >
                      {lic.objeto}
                    </Link>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-slate-500 pt-0.5">
                      <span className="text-slate-700 font-medium">
                        🏛️ {lic.contracting_authority_name}
                      </span>
                      {lic.adjudicatario && (
                        <span className="text-slate-700 truncate max-w-[280px]">
                          🤝 {lic.adjudicatario}
                        </span>
                      )}
                      {lic.num_ofertas !== null && lic.num_ofertas > 0 && (
                        <span className="text-slate-500 font-mono text-[11px] bg-[#f8fafb] border border-[#e2e8f0] px-1.5 py-0.5 rounded">
                          {lic.num_ofertas} {lic.num_ofertas === 1 ? 'oferta' : 'ofertas'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-[#e2e8f0] text-xs">
                    <div>
                      {(() => {
                        const amount = getContractAmountPresentation({
                          amount_excl_vat: lic.importe_sin_iva,
                          awarded_amount: lic.importe_adjudicacion,
                          award_amount_type: lic.award_amount_type,
                          status: lic.estado,
                          award_date: lic.fecha_adjudicacion,
                          awardee: lic.adjudicatario,
                        });
                        return (
                          <>
                            <span className="text-[10px] text-slate-400 uppercase font-semibold block">{amount.label}</span>
                            <span className="font-extrabold font-mono text-[#0a0a0a] text-base sm:text-lg group-hover:text-[#0d9373] transition-colors">
                              {amount.value === null ? 'No disponible' : formatCurrency(amount.value)}
                            </span>
                            {amount.label === 'Importe adjudicado no disponible' && amount.pbl !== null && (
                              <span className="text-[10px] text-slate-400 block mt-0.5">PBL: {formatCurrency(amount.pbl)}</span>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-3">
                      {lic.url && (
                        <a
                          href={lic.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Ver en Plataforma de Contratación del Sector Público oficial"
                          className="text-slate-500 hover:text-slate-800 text-xs flex items-center gap-1 font-medium transition-colors"
                        >
                          PLACSP <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <Link
                        href={`/licitaciones/${encodeURIComponent(getPlacspId(lic.id) || lic.id)}`}
                        className="px-3.5 py-1.5 rounded-lg bg-[#ecfdf5] hover:bg-[#d1fae5] text-[#0d9373] border border-[#d1fae5] font-semibold text-xs transition-all"
                      >
                        Ver Ficha
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-[#e2e8f0] text-xs">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-white border border-[#e2e8f0] text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f8fafb] font-medium transition-all shadow-xs"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>
              <span className="text-slate-500 font-mono">
                Página <strong className="text-slate-900">{page}</strong> de <strong className="text-slate-900">{totalPages}</strong>
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-white border border-[#e2e8f0] text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f8fafb] font-medium transition-all shadow-xs"
              >
                Siguiente <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LicitacionesPage() {
  return (
    <Suspense fallback={<div className="p-16 text-center text-slate-400 text-sm">Cargando explorador de contratos...</div>}>
      <LicitacionesContent />
    </Suspense>
  );
}
