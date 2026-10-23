'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { getPlacspId } from '@/lib/placsp';
import { formatCurrency, formatCompactCurrency, formatDate, formatNif } from '@/lib/format';
import { EstadoBadge, TipoBadge, ProcedimientoBadge } from '@/components/Badge';
import { esImporteAdjudicacionComparable, getContratoImporteComparable } from '@/lib/importe-comparable';
import { 
  FileText, 
  Filter, 
  Building2, 
  Search, 
  X, 
  ChevronRight, 
  ChevronLeft,
  Calendar,
  Clock,
  TrendingUp
} from 'lucide-react';

export interface ContratoItem {
  id: string;
  expediente?: string | null;
  objeto: string;
  estado?: string | null;
  tipo_contrato?: string | null;
  procedimiento?: string | null;
  year?: number | null;
  fecha_publicacion?: string | null;
  fecha_adjudicacion?: string | null;
  importe_adjudicacion?: number | null;
  importe_sin_iva?: number | null;
  award_amount_type?: 'total' | 'unitario' | 'desconocido' | null;
  contracting_authority_name?: string | null;
  adjudicatario?: string | null;
  nif_adjudicatario?: string | null;
  adjudicado_como?: string;
  cif_registrado?: string;
  es_denominacion_anterior?: boolean;
  es_dni_enmascarado?: boolean;
  cluster_nombre?: string;
  cluster_key?: string;
  cluster_estado?: 'activa_principal' | 'activa_division' | 'historica_anterior';
  filial_cif?: string;
  filial_nombre?: string;
  motivo_adjudicado?: string;
  num_modificaciones?: number;
  mod_prorroga_dias?: number;
  mod_prorroga_meses?: number;
  mod_sobrecoste_importe?: number;
}

export interface DenominacionFilterItem {
  nombre: string;
  clusterKey: string;
  cif: string;
  cifs?: string[];
  totalContratos: number;
  volumen: number;
  estado: 'activa_principal' | 'activa_division' | 'historica_anterior';
  estadoLabel: string;
  variantes: string[];
}

export interface FilialFilterItem {
  cif: string;
  nombre: string;
  contratos: number;
  volumen: number;
  esEstaEmpresa: boolean;
}

export const getContratoAno = (c: ContratoItem): number | null => {
  if (c.year) return Number(c.year);
  if (c.fecha_adjudicacion) {
    const y = parseInt(c.fecha_adjudicacion.slice(0, 4), 10);
    if (!isNaN(y) && y > 2000) return y;
  }
  if (c.fecha_publicacion) {
    const y = parseInt(c.fecha_publicacion.slice(0, 4), 10);
    if (!isNaN(y) && y > 2000) return y;
  }
  return null;
};

interface EmpresaContratosViewProps {
  contratos: ContratoItem[];
  denominaciones: DenominacionFilterItem[];
  filiales?: FilialFilterItem[];
  nombreEmpresa?: string;
  esGrupo?: boolean;
  initialAno?: number | string;
}

const PAGE_SIZE = 10;


export default function EmpresaContratosView({
  contratos,
  denominaciones,
  filiales = [],
  esGrupo = false,
  initialAno,
}: EmpresaContratosViewProps) {
  // 'todos' | clusterKey | filial:CIF
  const [filtroActivo, setFiltroActivo] = useState<string>('todos');
  const [filtroAno, setFiltroAno] = useState<number | 'todos'>(() => {
    if (initialAno && initialAno !== 'todos') {
      const parsed = Number(initialAno);
      if (!isNaN(parsed) && parsed > 2000) return parsed;
    }
    return 'todos';
  });
  const [filtroProrroga, setFiltroProrroga] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  // Total de contratos con prórroga o ampliación de plazo
  const totalConProrroga = useMemo(() => {
    return contratos.filter(
      (c) => (c.mod_prorroga_dias || 0) > 0 || (c.mod_prorroga_meses || 0) > 0
    ).length;
  }, [contratos]);

  // Años disponibles en el historial contractual de esta empresa
  const anosDisponibles = useMemo(() => {
    const map = new Map<number, { contratos: number; volumen: number }>();
    for (const c of contratos) {
      const y = getContratoAno(c);
      if (!y) continue;
      if (!map.has(y)) {
        map.set(y, { contratos: 0, volumen: 0 });
      }
      const item = map.get(y)!;
      item.contratos += 1;
      item.volumen += getContratoImporteComparable(c);
    }
    return Array.from(map.entries())
      .map(([year, data]) => ({ year, contratos: data.contratos, volumen: data.volumen }))
      .sort((a, b) => b.year - a.year);
  }, [contratos]);

  // Escuchar eventos globales de filtrado disparados desde las tablas superiores
  useEffect(() => {
    const handleCustomFilter = (e: Event) => {
      const customEvent = e as CustomEvent<{ clusterKey?: string; cif?: string; year?: number | 'todos'; prorroga?: boolean }>;
      if (customEvent.detail) {
        if (customEvent.detail.year !== undefined) {
          setFiltroAno(customEvent.detail.year);
          setPage(1);
        }
        if (customEvent.detail.prorroga !== undefined) {
          setFiltroProrroga(customEvent.detail.prorroga);
          setPage(1);
        }
        if (customEvent.detail.clusterKey) {
          setFiltroActivo(customEvent.detail.clusterKey);
          setPage(1);
        } else if (customEvent.detail.cif) {
          setFiltroActivo(`filial:${customEvent.detail.cif}`);
          setPage(1);
        }
        // Desplazar suavemente a la sección de contratos
        const el = document.getElementById('contratos-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }
    };

    window.addEventListener('filter-empresa-contratos', handleCustomFilter);
    return () => window.removeEventListener('filter-empresa-contratos', handleCustomFilter);
  }, []);

  // Filtrado reactivo de contratos
  const contratosFiltrados = useMemo(() => {
    return contratos.filter((c) => {
      // 1. Filtro por Denominación / Filial
      if (filtroActivo !== 'todos') {
        if (filtroActivo.startsWith('filial:')) {
          const targetCif = filtroActivo.replace('filial:', '');
          if ((c.filial_cif || c.cif_registrado || c.nif_adjudicatario) !== targetCif) {
            return false;
          }
        } else {
          // Filtrado por clusterKey
          const matchedCluster = denominaciones.find(d => d.clusterKey === filtroActivo);
          if (matchedCluster) {
            const matchesCluster = c.cluster_key === filtroActivo || 
              (c.cluster_nombre && c.cluster_nombre.toUpperCase() === matchedCluster.nombre.toUpperCase()) ||
              (matchedCluster.variantes && matchedCluster.variantes.some(v => v.toUpperCase() === (c.adjudicado_como || c.adjudicatario || '').toUpperCase()));
            if (!matchesCluster) return false;
          }
        }
      }

      // 2. Filtro por Año
      if (filtroAno !== 'todos') {
        const cAno = getContratoAno(c);
        if (cAno !== filtroAno) {
          return false;
        }
      }

      // 3. Filtro por Prórroga / Retraso
      if (filtroProrroga) {
        const tieneProrroga = (c.mod_prorroga_dias || 0) > 0 || (c.mod_prorroga_meses || 0) > 0;
        if (!tieneProrroga) return false;
      }

      // 4. Filtro por búsqueda de texto
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesObjeto = (c.objeto || '').toLowerCase().includes(q);
        const matchesExpediente = (c.expediente || '').toLowerCase().includes(q);
        const matchesAdjudicado = (c.adjudicado_como || '').toLowerCase().includes(q);
        const matchesOrgano = (c.contracting_authority_name || c.contracting_authority_name || '').toLowerCase().includes(q);
        if (!matchesObjeto && !matchesExpediente && !matchesAdjudicado && !matchesOrgano) {
          return false;
        }
      }

      return true;
    });
  }, [contratos, filtroActivo, filtroAno, filtroProrroga, searchQuery, denominaciones]);

  // Totales del subconjunto filtrado
  const volumenFiltrado = useMemo(() => {
    return contratosFiltrados.reduce((acc, c) => acc + getContratoImporteComparable(c), 0);
  }, [contratosFiltrados]);

  // Paginación
  const totalPages = Math.ceil(contratosFiltrados.length / PAGE_SIZE) || 1;
  const paginatedContratos = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return contratosFiltrados.slice(start, start + PAGE_SIZE);
  }, [contratosFiltrados, page]);

  // Denominación activa actualmente seleccionada
  const activeDenomObj = useMemo(() => {
    if (filtroActivo === 'todos') return null;
    if (filtroActivo.startsWith('filial:')) return null;
    return denominaciones.find(d => d.clusterKey === filtroActivo);
  }, [filtroActivo, denominaciones]);

  const activeFilialObj = useMemo(() => {
    if (!filtroActivo.startsWith('filial:')) return null;
    const targetCif = filtroActivo.replace('filial:', '');
    return filiales.find(f => f.cif === targetCif);
  }, [filtroActivo, filiales]);

  const tieneMultiplesDenominaciones = denominaciones.length > 1;
  const tieneMultiplesFiliales = filiales.length > 1;

  return (
    <div id="contratos-section" className="mint-card p-6 sm:p-7 space-y-5 scroll-mt-6">
      {/* Cabecera de la sección */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e2e8f0] pb-4">
        <div>
          <h3 className="font-bold text-[#1e293b] text-base sm:text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#0d9373]" />
            <span>Historial Completo de Licitaciones y Contratos</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {esGrupo || tieneMultiplesFiliales
              ? `Listado consolidado de todo el grupo corporativo (${contratos.length} contratos ganados)`
              : `Listado consolidado de adjudicaciones de la entidad (${contratos.length} contratos ganados)`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-600 bg-[#f8fafb] px-3 py-1 rounded-lg border border-[#e2e8f0]">
            Total: <strong className="text-slate-900">{contratos.length}</strong> contratos
          </span>
        </div>
      </div>

      {/* BARRA DE FILTROS POR AÑO / EJERCICIO */}
      {anosDisponibles.length > 1 && (
        <div className="space-y-2 p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-[#0d9373]" />
              <span>Filtrar por Año / Ejercicio:</span>
            </span>

            {filtroAno !== 'todos' && (
              <button
                onClick={() => {
                  setFiltroAno('todos');
                  setPage(1);
                }}
                className="text-xs text-[#0d9373] hover:text-[#0b7a5f] font-semibold inline-flex items-center gap-1 transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Ver todos los años ({contratos.length})
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => {
                setFiltroAno('todos');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 shadow-2xs ${
                filtroAno === 'todos'
                  ? 'bg-[#1e293b] text-white border-[#1e293b] ring-2 ring-slate-400/20'
                  : 'bg-white text-slate-700 border-[#e2e8f0] hover:bg-slate-50'
              }`}
            >
              <span>Todos los años</span>
              <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] ${
                filtroAno === 'todos' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {contratos.length}
              </span>
            </button>

            {anosDisponibles.map((item) => {
              const isActive = filtroAno === item.year;
              return (
                <button
                  key={item.year}
                  onClick={() => {
                    setFiltroAno(item.year);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 shadow-2xs ${
                    isActive
                      ? 'bg-[#ecfdf5] text-[#0d9373] border-[#0d9373] ring-2 ring-[#0d9373]/20 font-bold'
                      : 'bg-white text-slate-700 border-[#e2e8f0] hover:bg-slate-50'
                  }`}
                  title={`Filtrar contratos del año ${item.year}`}
                >
                  <span>{item.year}</span>
                  <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] ${
                    isActive ? 'bg-[#0d9373] text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {item.contratos}
                  </span>
                  <span className="hidden sm:inline font-mono text-[10px] text-slate-400">
                    ({formatCompactCurrency(item.volumen)})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* BARRA DE FILTROS POR DENOMINACIÓN Y FILIAL */}
      {(tieneMultiplesDenominaciones || tieneMultiplesFiliales) && (
        <div className="space-y-3 p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-[#0d9373]" />
              <span>Filtrar por Razón Social / Denominación:</span>
            </span>

            {filtroActivo !== 'todos' && (
              <button
                onClick={() => {
                  setFiltroActivo('todos');
                  setPage(1);
                }}
                className="text-xs text-[#0d9373] hover:text-[#0b7a5f] font-semibold inline-flex items-center gap-1 transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Restablecer a todas ({contratos.length})
              </button>
            )}
          </div>

          {/* Píldoras de filtrado por Denominación Comercial / Histórica */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => {
                setFiltroActivo('todos');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 shadow-2xs ${
                filtroActivo === 'todos'
                  ? 'bg-[#1e293b] text-white border-[#1e293b] ring-2 ring-slate-400/20'
                  : 'bg-white text-slate-700 border-[#e2e8f0] hover:bg-slate-50'
              }`}
            >
              <span>Todos los contratos</span>
              <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] ${
                filtroActivo === 'todos' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {contratos.length}
              </span>
            </button>

            {denominaciones.map((denom, idx) => {
              const isActive = filtroActivo === denom.clusterKey;
              return (
                <button
                  key={idx}
                  onClick={() => {
                    setFiltroActivo(denom.clusterKey);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 shadow-2xs ${
                    isActive
                      ? denom.estado === 'activa_principal'
                        ? 'bg-[#ecfdf5] text-[#0d9373] border-[#0d9373] ring-2 ring-[#0d9373]/20 font-bold'
                        : denom.estado === 'activa_division'
                        ? 'bg-[#eff6ff] text-[#2563eb] border-[#2563eb] ring-2 ring-[#2563eb]/20 font-bold'
                        : 'bg-[#fffbeb] text-[#b45309] border-[#b45309] ring-2 ring-[#b45309]/20 font-bold'
                      : 'bg-white text-slate-700 border-[#e2e8f0] hover:bg-slate-50'
                  }`}
                  title={`Filtrar por ${denom.nombre}`}
                >
                  <span className="text-[11px]">
                    {denom.estado === 'activa_principal' && '🟢'}
                    {denom.estado === 'activa_division' && '🔵'}
                    {denom.estado === 'historica_anterior' && '🟡'}
                  </span>
                  <span className="truncate max-w-[200px] sm:max-w-[260px]">{denom.nombre}</span>
                  <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] ${
                    isActive ? 'bg-white/80 font-bold' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {denom.totalContratos}
                  </span>
                  <span className="hidden md:inline font-mono text-[10px] text-slate-400">
                    ({formatCompactCurrency(denom.volumen)})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sub-filtro de Filiales del Grupo si existen múltiples CIFs */}
          {tieneMultiplesFiliales && (
            <div className="pt-2 border-t border-[#e2e8f0]/80 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 font-semibold text-[11px] flex items-center gap-1">
                <Building2 className="h-3 w-3 text-[#2563eb]" />
                Filiales del grupo:
              </span>
              {filiales.map((fil, fIdx) => {
                const isActive = filtroActivo === `filial:${fil.cif}`;
                return (
                  <button
                    key={fIdx}
                    onClick={() => {
                      setFiltroActivo(`filial:${fil.cif}`);
                      setPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all border ${
                      isActive
                        ? 'bg-[#eff6ff] text-[#2563eb] border-[#2563eb] font-bold shadow-2xs'
                        : 'bg-white text-slate-600 border-[#e2e8f0] hover:bg-slate-50'
                    }`}
                  >
                    <span>{formatNif(fil.cif)} ({fil.nombre.split(',')[0].trim()})</span>
                    <span className="ml-1 text-[10px] text-slate-400 font-semibold">• {fil.contratos}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Buscador de texto en tiempo real y filtro rápido de prórrogas */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto flex-1">
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              placeholder="Buscar por objeto, expediente u organismo..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl bg-white border border-[#e2e8f0] px-4 py-2 pl-9 text-xs text-slate-900 placeholder-slate-400 focus:border-[#00d4a4] focus:outline-none focus:ring-4 focus:ring-[#00d4a4]/10 transition-all shadow-2xs"
            />
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setPage(1);
                }}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {totalConProrroga > 0 && (
            <button
              onClick={() => {
                setFiltroProrroga(!filtroProrroga);
                setPage(1);
              }}
              className={`w-full sm:w-auto px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 shadow-2xs ${
                filtroProrroga
                  ? 'bg-amber-500 text-white border-amber-500 ring-2 ring-amber-400/30'
                  : 'bg-white text-slate-700 border-[#e2e8f0] hover:bg-amber-50/60 hover:border-amber-300'
              }`}
            >
              <Clock className={`h-3.5 w-3.5 ${filtroProrroga ? 'text-white' : 'text-amber-600'}`} />
              <span>Solo con prórroga</span>
              <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] ${
                filtroProrroga ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'
              }`}>
                {totalConProrroga}
              </span>
            </button>
          )}
        </div>

        {/* Indicador de subtotal filtrado */}
        <div className="text-xs text-slate-500 font-mono self-start sm:self-auto shrink-0">
          Mostrando <strong className="text-slate-900 font-bold">{contratosFiltrados.length}</strong> de <strong className="text-slate-900">{contratos.length}</strong> contratos · Subtotal:{' '}
          <strong className="text-[#0d9373] font-bold">{formatCurrency(volumenFiltrado)}</strong>
        </div>
      </div>

      {/* BANNER INFORMATIVO DE FILTROS ACTIVOS */}
      {(filtroActivo !== 'todos' || filtroAno !== 'todos' || filtroProrroga) && (
        <div className="p-3.5 rounded-xl bg-[#ecfdf5] border border-[#d1fae5] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-800 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[#0d9373]">
              Filtros activos:
            </span>

            {filtroAno !== 'todos' && (
              <span className="inline-flex items-center gap-1 font-bold px-2.5 py-0.5 rounded-full bg-white text-slate-800 border border-[#d1fae5] shadow-2xs">
                <Calendar className="h-3 w-3 text-[#0d9373]" />
                Año {filtroAno}
                <button
                  onClick={() => {
                    setFiltroAno('todos');
                    setPage(1);
                  }}
                  className="ml-1 text-slate-400 hover:text-slate-700 font-bold"
                  title="Quitar filtro de año"
                >
                  ✕
                </button>
              </span>
            )}

            {filtroProrroga && (
              <span className="inline-flex items-center gap-1 font-bold px-2.5 py-0.5 rounded-full bg-white text-amber-800 border border-amber-300 shadow-2xs">
                <Clock className="h-3 w-3 text-amber-600" />
                Solo con prórroga / ampliación
                <button
                  onClick={() => {
                    setFiltroProrroga(false);
                    setPage(1);
                  }}
                  className="ml-1 text-slate-400 hover:text-slate-700 font-bold"
                  title="Quitar filtro de prórroga"
                >
                  ✕
                </button>
              </span>
            )}

            {filtroActivo !== 'todos' && (
              <span className="inline-flex items-center gap-1 font-bold px-2.5 py-0.5 rounded-full bg-white text-slate-800 border border-[#d1fae5] shadow-2xs">
                {activeDenomObj?.nombre || activeFilialObj?.nombre || filtroActivo}
                <button
                  onClick={() => {
                    setFiltroActivo('todos');
                    setPage(1);
                  }}
                  className="ml-1 text-slate-400 hover:text-slate-700 font-bold"
                  title="Quitar filtro de denominación"
                >
                  ✕
                </button>
              </span>
            )}

            <span className="text-slate-500 font-mono text-[11px]">
              ({contratosFiltrados.length} contratos · {formatCurrency(volumenFiltrado)})
            </span>
          </div>

          <button
            onClick={() => {
              setFiltroActivo('todos');
              setFiltroAno('todos');
              setFiltroProrroga(false);
              setSearchQuery('');
              setPage(1);
            }}
            className="self-start sm:self-auto text-xs font-semibold text-[#0d9373] hover:underline flex items-center gap-1"
          >
            Quitar todos los filtros ✖
          </button>
        </div>
      )}

      {/* LISTA DE CONTRATOS */}
      {contratosFiltrados.length === 0 ? (
        <div className="p-12 text-center text-slate-500 space-y-2 border border-dashed border-[#cbd5e1] rounded-xl">
          <p className="text-sm font-bold text-slate-800">No se encontraron contratos con los filtros actuales</p>
          <p className="text-xs text-slate-400">
            Prueba a eliminar el filtro o buscar con otras palabras clave.
          </p>
          <button
            onClick={() => {
              setFiltroActivo('todos');
              setFiltroAno('todos');
              setFiltroProrroga(false);
              setSearchQuery('');
              setPage(1);
            }}
            className="mt-2 text-xs font-semibold text-[#0d9373] hover:underline"
          >
            Restablecer todos los filtros
          </button>
        </div>
      ) : (
        <div className="divide-y divide-[#e2e8f0]">
          {paginatedContratos.map((lic) => (
            <div
              key={lic.id}
              className="py-4 hover:bg-[#f8fafb] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-2 rounded-lg group"
            >
              <div className="min-w-0 space-y-2 flex-1 pr-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono font-medium text-slate-500 bg-[#f8fafb] px-2 py-0.5 rounded border border-[#e2e8f0]">
                    {lic.expediente || 'Sin exp.'}
                  </span>
                  {getContratoAno(lic) && (
                    <span className="text-[11px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {getContratoAno(lic)}
                    </span>
                  )}
                  <EstadoBadge estado={lic.estado || 'Resuelta'} />
                  <TipoBadge tipo={lic.tipo_contrato || 'Servicios'} />
                  <ProcedimientoBadge procedimiento={lic.procedimiento || 'Contrato menor'} />

                  {/* Insignia de denominación específica */}
                  {lic.cluster_estado === 'activa_division' && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe] flex items-center gap-1">
                      <span>🔵</span> {lic.cluster_nombre || lic.adjudicado_como}
                    </span>
                  )}

                  {lic.cluster_estado === 'historica_anterior' && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#fffbeb] text-[#b45309] border border-[#fef3c7] flex items-center gap-1">
                      <span>🟡</span> Anterior: {lic.adjudicado_como}
                    </span>
                  )}

                  {/* Insignia de filial del grupo si difiere de la principal */}
                  {lic.filial_nombre && esGrupo && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#f8fafb] text-slate-600 border border-[#e2e8f0]">
                      CIF: {lic.filial_cif}
                    </span>
                  )}

                  {/* Insignia de DNI enmascarado RGPD */}
                  {lic.es_dni_enmascarado && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#f5f3ff] text-[#6d28d9] border border-[#ddd6fe]">
                      DNI RGPD: {lic.cif_registrado}
                    </span>
                  )}

                  {/* Insignia de prórroga / ampliación de plazo */}
                  {((lic.mod_prorroga_dias || 0) > 0 || (lic.mod_prorroga_meses || 0) > 0) && (
                    <span 
                      className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1 shadow-2xs"
                      title="Contrato con ampliación de plazo o prórroga aprobada"
                    >
                      <Clock className="h-3 w-3 text-amber-600" />
                      <span>
                        Prórroga: +{lic.mod_prorroga_dias && lic.mod_prorroga_dias > 0 
                          ? `${lic.mod_prorroga_dias} días` 
                          : `${lic.mod_prorroga_meses} meses`}
                      </span>
                    </span>
                  )}

                  {/* Insignia de sobrecoste si hubo modificaciones con incremento */}
                  {(lic.mod_sobrecoste_importe || 0) > 0 && (
                    <span 
                      className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 shadow-2xs"
                      title={`Sobrecoste aprobado en modificaciones: +${formatCurrency(lic.mod_sobrecoste_importe || 0)}`}
                    >
                      <TrendingUp className="h-3 w-3 text-rose-600" />
                      <span>+{formatCurrency(lic.mod_sobrecoste_importe || 0)}</span>
                    </span>
                  )}
                </div>

                <Link
                  href={`/licitaciones/${encodeURIComponent(getPlacspId(lic.id) || lic.id)}`}
                  className="text-xs sm:text-sm font-bold text-[#1e293b] hover:text-[#0d9373] transition-colors block line-clamp-2 leading-snug"
                >
                  {lic.objeto}
                </Link>

                <div className="flex flex-wrap items-center gap-3 text-slate-500 text-xs font-mono">
                  <span>{lic.contracting_authority_name || lic.contracting_authority_name}</span>
                  <span>•</span>
                  <span>{formatDate(lic.fecha_publicacion || lic.fecha_adjudicacion)}</span>
                  {lic.adjudicado_como && lic.cluster_estado === 'activa_principal' && lic.adjudicado_como !== lic.cluster_nombre && (
                    <>
                      <span>•</span>
                      <span className="text-[11px] text-slate-400">Reg: {lic.adjudicado_como}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-[#e2e8f0]/60 shrink-0">
                <span className="text-sm sm:text-base font-extrabold font-mono text-[#0a0a0a]">
                  {esImporteAdjudicacionComparable(lic)
                    ? formatCurrency(lic.importe_adjudicacion!)
                    : 'Importe no disponible'}
                </span>
                <Link
                  href={`/licitaciones/${encodeURIComponent(getPlacspId(lic.id) || lic.id)}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0d9373] hover:text-[#0b7a5f] mt-1"
                >
                  Detalle <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-[#e2e8f0] text-xs">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#e2e8f0] text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f8fafb] font-medium transition-all shadow-2xs"
          >
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <span className="text-slate-500 font-mono">
            Página <strong className="text-slate-900">{page}</strong> de <strong className="text-slate-900">{totalPages}</strong>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#e2e8f0] text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f8fafb] font-medium transition-all shadow-2xs"
          >
            Siguiente <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
