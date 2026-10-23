'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { formatCompactCurrency, formatNumber, formatDate, formatCurrency, formatNif } from '@/lib/format';
import CsvExportButton from '@/components/CsvExportButton';
import { 
  Briefcase, 
  Search, 
  ArrowRight, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Building2, 
  ShieldCheck 
} from 'lucide-react';

export interface EmpresaItem {
  id?: string;
  nombre: string;
  nif: string;
  total_contratos: number;
  gasto_adjudicado?: number;
  ingresos_adjudicados?: number;
  volumen_total: number;
  organismos_distintos: number;
  ultimo_contrato: string;
  grupo_id?: string;
  grupo_nombre?: string;
  tipo_vinculo?: string;
  tieneCambioNombre?: boolean;
  nombresAnteriores?: string[];
  esDniEnmascarado?: boolean;
  esGrupo?: boolean;
  num_filiales?: number;
  num_nombres_distintos?: number;
}

export interface GrupoItem {
  id: string;
  nombre: string;
  descripcion: string;
  ambito: string;
  sede?: string;
  color?: string;
  total_contratos: number;
  volumen_total: number;
  ultimo_contrato: string;
  num_filiales: number;
  filiales: { id?: string; cif: string; nombre: string; contratos: number; volumen: number }[];
}

export interface EmpresasClientViewProps {
  initialData: EmpresaItem[];
  initialGruposData?: GrupoItem[];
  initialTotal: number;
  initialTotalPages: number;
  initialTotalGlobalEmpresas: number | null;
  initialYear: string;
  initialView?: 'empresas' | 'grupos';
  initialSort?: 'volumen' | 'contratos';
  initialQ?: string;
  initialPage?: number;
  availableYears: number[];
}

export default function EmpresasClientView({
  initialData,
  initialGruposData = [],
  initialTotal,
  initialTotalPages,
  initialTotalGlobalEmpresas,
  initialYear,
  initialView = 'empresas',
  initialSort = 'volumen',
  initialQ = '',
  initialPage = 1,
  availableYears,
}: EmpresasClientViewProps) {
  const [q, setQ] = useState(initialQ);
  const [view, setView] = useState<'empresas' | 'grupos'>(initialView);
  const [sort, setSort] = useState<'volumen' | 'contratos'>(initialSort);
  const [ano, setAno] = useState<string>(initialYear);
  const [anoTouched, setAnoTouched] = useState(false);
  const [totalGlobalEmpresas] = useState<number | null>(initialTotalGlobalEmpresas);
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<EmpresaItem[]>(initialData);
  const [gruposData, setGruposData] = useState<GrupoItem[]>(initialGruposData);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [loading, setLoading] = useState(false);

  const isInitialMount = useRef(true);

  const fetchEmpresas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (ano) params.set('ano', ano);
      params.set('view', view);
      params.set('sort', sort);
      params.set('page', String(page));
      params.set('limit', '18');

      const res = await fetch(`/api/empresas?${params.toString()}`);
      const json = await res.json();
      if (view === 'grupos') {
        setGruposData(json.data || []);
        setTotal(json.total || 0);
        setTotalPages(1);
      } else {
        setData(json.data || []);
        setTotal(json.total || 0);
        setTotalPages(json.totalPages || 1);
      }
    } catch (err) {
      console.error('Error fetching companies directory:', err);
    } finally {
      setLoading(false);
    }
  }, [q, view, sort, page, ano]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    fetchEmpresas();
  }, [fetchEmpresas]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6 bg-[#ffffff]">
      {/* Header */}
      <div className="border-b border-[#e2e8f0] pb-6">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
            <Briefcase className="h-4 w-4" />
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1e293b] tracking-tight">
            Directorio de Empresas y Grupos Adjudicatarios
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-[#64748b] mt-1">
          Trazabilidad e inteligencia corporativa de todos los contratistas de Alcázar de San Juan, con unificación de cambios de denominación, cruce de DNIs y holdings empresariales
        </p>
      </div>

      {/* Aviso de filtro de año por defecto (aplicado automáticamente al entrar sin filtros explícitos) */}
      {!anoTouched && view === 'empresas' && ano === String(new Date().getFullYear()) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 rounded-xl bg-[#eff6ff] border border-[#dbeafe] text-xs text-[#1e40af]">
          <span>
            Por defecto se muestra solo el ejercicio en curso (<strong>{ano}</strong>).
            {totalGlobalEmpresas ? (
              <> El directorio histórico completo tiene <strong>{formatNumber(totalGlobalEmpresas)}</strong> empresas.</>
            ) : null}
          </span>
          <button
            onClick={() => { setAno(''); setAnoTouched(true); setPage(1); }}
            className="font-semibold underline underline-offset-2 hover:text-[#1d4ed8] shrink-0 text-left sm:text-right cursor-pointer"
          >
            Ver histórico completo →
          </button>
        </div>
      )}

      {/* View Switcher: Empresas vs Grupos */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-[#e2e8f0] pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setView('empresas');
              setPage(1);
            }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all border cursor-pointer min-h-[44px] ${
              view === 'empresas'
                ? 'bg-[#ecfdf5] text-[#0d9373] border-[#a7f3d0] shadow-xs'
                : 'bg-[#f8fafb] text-slate-600 border-[#e2e8f0] hover:bg-white'
            }`}
          >
            <Briefcase className="h-4 w-4 shrink-0" />
            <span>Empresas Individuales</span>
            <span className="hidden sm:inline text-[11px] font-mono px-1.5 py-0.2 rounded bg-white border border-[#e2e8f0] text-slate-700">
              Consolidadas
            </span>
          </button>

          <button
            onClick={() => {
              setView('grupos');
              setPage(1);
            }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all border cursor-pointer min-h-[44px] ${
              view === 'grupos'
                ? 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe] shadow-xs'
                : 'bg-[#f8fafb] text-slate-600 border-[#e2e8f0] hover:bg-white'
            }`}
          >
            <Building2 className="h-4 w-4 shrink-0" />
            <span>Grupos Empresariales</span>
            <span className="hidden sm:inline text-[11px] font-mono px-1.5 py-0.2 rounded bg-white border border-[#e2e8f0] text-slate-700">
              Holdings
            </span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder={view === 'grupos' ? 'Buscar grupo empresarial...' : 'Buscar por nombre, anterior razón social o CIF...'}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl bg-white border border-[#e2e8f0] px-4 py-2.5 pl-9 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:border-[#00d4a4] focus:outline-none focus:ring-4 focus:ring-[#00d4a4]/10 transition-all shadow-xs min-h-[44px]"
          />
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          {q && (
            <button
              onClick={() => {
                setQ('');
                setPage(1);
              }}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Toolbar & Sort (when viewing individual companies) */}
      {view === 'empresas' && (
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
            <span>Mostrando <strong className="text-slate-900">{data.length}</strong> de <strong className="text-[#0d9373]">{formatNumber(total)}</strong> entidades consolidadas</span>
            {ano && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#ecfdf5] text-[#0d9373] font-bold border border-[#d1fae5] text-[11px]">
                Ejercicio {ano}
                <button onClick={() => { setAno(''); setPage(1); }} className="ml-0.5 text-[#0d9373] hover:text-[#0b7a5f] font-bold cursor-pointer">✕</button>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={ano}
              onChange={(e) => {
                setAno(e.target.value);
                setAnoTouched(true);
                setPage(1);
              }}
              className="rounded-lg bg-white border border-[#e2e8f0] px-3 py-1.5 text-xs font-semibold text-slate-700 focus:border-[#00d4a4] focus:outline-none focus:ring-2 focus:ring-[#00d4a4]/10 shadow-xs cursor-pointer min-h-[38px]"
            >
              <option value="">Todos los años</option>
              {availableYears.map(y => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>

            <div className="flex items-center rounded-lg bg-[#f1f5f7] p-1 border border-[#e2e8f0] text-xs">
              <button
                onClick={() => {
                  setSort('volumen');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-md transition-all font-semibold cursor-pointer min-h-[34px] ${
                  sort === 'volumen'
                    ? 'bg-white text-[#1e293b] shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Por Facturación (€)
              </button>
              <button
                onClick={() => {
                  setSort('contratos');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-md transition-all font-semibold cursor-pointer min-h-[34px] ${
                  sort === 'contratos'
                    ? 'bg-white text-[#1e293b] shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Por Nº Contratos
              </button>
            </div>

            <CsvExportButton
              filename={`empresas_alcazar_${new Date().toISOString().slice(0, 10)}.csv`}
              headers={['Nombre', 'CIF/NIF', 'Contratos', 'Gasto Adjudicado (€)', 'Ingresos / Cánones (€)', 'Volumen Total (€)', 'Organismos Distintos', 'Último Contrato']}
              rows={data.map((e) => [
                e.nombre,
                formatNif(e.nif),
                e.total_contratos,
                e.gasto_adjudicado ?? 0,
                e.ingresos_adjudicados ?? 0,
                e.volumen_total,
                e.organismos_distintos,
                e.ultimo_contrato,
              ])}
            />
          </div>
        </div>
      )}

      {/* Content Rendering */}
      {loading ? (
        <div className="mint-card p-16 text-center text-slate-400 space-y-3">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-[#00d4a4]" />
          <p className="text-xs font-semibold">Cargando directorio consolidado...</p>
        </div>
      ) : view === 'grupos' ? (
        /* VISTA DE GRUPOS EMPRESARIALES */
        <div className="space-y-4">
          <div className="text-xs text-slate-500">
            Se muestran los <strong className="text-slate-900">{gruposData.length}</strong> principales grupos y conglomerados corporativos con filiales activas en Alcázar de San Juan
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {gruposData.map((grupo) => (
              <div
                key={grupo.id}
                className="mint-card p-6 flex flex-col justify-between space-y-4 border-t-4 border-t-[#2563eb]"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
                      {grupo.ambito}
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      {grupo.num_filiales} filial(es) en Alcázar
                    </span>
                  </div>

                  <h3 className="font-bold text-[#1e293b] text-lg tracking-tight">
                    {grupo.nombre}
                  </h3>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {grupo.descripcion}
                  </p>

                  {/* Filiales pills */}
                  <div className="space-y-1.5 pt-2 border-t border-[#e2e8f0]">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Filiales con contratos adjudicados:
                    </span>
                    <div className="space-y-1">
                      {grupo.filiales.map((f, fIdx) => (
                        <Link
                          key={fIdx}
                          href={`/empresas/${encodeURIComponent(f.id || f.cif || f.nombre)}`}
                          className="flex items-center justify-between p-2 rounded-lg bg-[#f8fafb] hover:bg-white hover:border-[#cbd5e1] border border-transparent transition-all text-xs group"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-semibold text-slate-800 group-hover:text-[#2563eb] truncate block">
                              {f.nombre}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">
                              CIF: {f.cif || '—'} • {f.contratos} contratos
                            </span>
                          </div>
                          <span className="font-mono font-bold text-slate-900 text-xs shrink-0">
                            {formatCompactCurrency(f.volumen)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer del Grupo */}
                <div className="pt-3 border-t border-[#e2e8f0] flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-semibold">Total Consolidado Grupo</span>
                    <span className="font-bold font-mono text-[#0a0a0a] text-lg">
                      {formatCurrency(grupo.volumen_total)}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-slate-500 font-semibold">
                    {grupo.total_contratos} contratos
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : data.length === 0 ? (
        <div className="mint-card p-16 text-center text-slate-500 space-y-2">
          <p className="text-base font-bold text-slate-800">No se encontraron empresas</p>
          <p className="text-xs text-slate-400">Prueba con otro término de búsqueda o código CIF.</p>
        </div>
      ) : (
        /* VISTA DE EMPRESAS INDIVIDUALES CONSOLIDADAS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((empresa, idx) => (
            <Link
              key={idx}
              href={`/empresas/${encodeURIComponent(empresa.id || empresa.nif || empresa.nombre)}`}
              className="group mint-card p-5 hover:border-[#cbd5e1] transition-all flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-400 font-mono">
                  <span className="bg-[#f8fafb] px-2 py-0.5 rounded border border-[#e2e8f0] text-slate-600 font-medium">
                    {empresa.esGrupo ? 'Agrupación' : (empresa.nif || 'Sin CIF')}
                  </span>
                  <span>Último: {formatDate(empresa.ultimo_contrato)}</span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {empresa.esGrupo && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
                      <Building2 className="h-3 w-3" />
                      Agrupación · {empresa.num_filiales} entidades
                    </span>
                  )}

                  {!empresa.esGrupo && empresa.esDniEnmascarado && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
                      <ShieldCheck className="h-3 w-3" />
                      DNI Unificado
                    </span>
                  )}
                </div>

                <h3 className="font-bold text-[#1e293b] text-sm group-hover:text-[#0d9373] transition-colors line-clamp-2 leading-snug">
                  {empresa.nombre}
                </h3>

                <p className="text-xs text-slate-500">
                  <strong className="text-slate-800 font-mono">{formatNumber(empresa.total_contratos)}</strong>{' '}
                  {empresa.total_contratos === 1 ? 'contrato adjudicado' : 'contratos adjudicados'}
                  {empresa.organismos_distintos > 1 && (
                    <>
                      {' '}en <strong className="text-slate-800">{empresa.organismos_distintos}</strong> organismos
                    </>
                  )}
                </p>
              </div>

              <div className="pt-3 border-t border-[#e2e8f0] flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                    {empresa.gasto_adjudicado === 0 && (empresa.ingresos_adjudicados || 0) > 0
                      ? 'Cánones Abonados'
                      : 'Gasto Adjudicado'}
                  </span>
                  <span className="font-bold font-mono text-[#0a0a0a] text-base">
                    {formatCompactCurrency(
                      empresa.gasto_adjudicado === 0 && (empresa.ingresos_adjudicados || 0) > 0
                        ? (empresa.ingresos_adjudicados || 0)
                        : (empresa.gasto_adjudicado ?? empresa.volumen_total)
                    )}
                  </span>
                  {(empresa.ingresos_adjudicados || 0) > 0 && (empresa.gasto_adjudicado || 0) > 0 && (
                    <span className="text-[10px] text-[#0d9373] block font-mono">
                      +{formatCompactCurrency(empresa.ingresos_adjudicados || 0)} cánones
                    </span>
                  )}
                </div>
                <span className="text-[#0d9373] group-hover:translate-x-1 transition-transform flex items-center gap-1 font-semibold text-xs">
                  Ver ficha <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination (for empresas view) */}
      {view === 'empresas' && totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-[#e2e8f0] text-xs">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-white border border-[#e2e8f0] text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f8fafb] font-medium transition-all shadow-xs cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <span className="text-slate-500 font-mono">
            Página <strong className="text-slate-900">{page}</strong> de <strong className="text-slate-900">{totalPages}</strong>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-white border border-[#e2e8f0] text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f8fafb] font-medium transition-all shadow-xs cursor-pointer"
          >
            Siguiente <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
