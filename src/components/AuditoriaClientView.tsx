'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  ShieldAlert, 
  CheckCircle2, 
  Search, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp, 
  Scale, 
  TrendingDown, 
  UserCheck, 
  Layers, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Download,
  HelpCircle,
  FileText,
  Building2,
  Coins
} from 'lucide-react';
import { AlertaV2, AuditoriaKpis } from '@/lib/db';
import { formatCurrency, formatDate, formatNumber, formatDecimal, formatNif } from '@/lib/format';
import { getContractSlug } from '@/lib/placsp';

interface AuditoriaClientViewProps {
  initialAlertas: AlertaV2[];
  kpis: AuditoriaKpis;
  currentAmbito?: string;
  initialSeveridad?: string;
  initialTipo?: string;
  initialSearch?: string;
  initialAlertaId?: string;
}

// Extrae la fecha más representativa (la más reciente de sus contratos vinculados, o fecha de creación)
export const getAlertaFecha = (a: AlertaV2): string => {
  if (a.contratosDetalle && a.contratosDetalle.length > 0) {
    const dates = a.contratosDetalle
      .map((c) => c.document_date)
      .filter((d): d is string => Boolean(d))
      .sort()
      .reverse();
    if (dates.length > 0) return dates[0];
  }
  return a.fechaCreacion ? a.fechaCreacion.substring(0, 10) : '';
};

// Formatea la confianza de forma segura (la BD la guarda como escala 50-100, nunca fracción)
export const formatConfianza = (val: number): string => {
  if (!val) return '0%';
  const num = val > 1 ? val : val * 100;
  return `${Math.min(100, Math.max(0, Math.round(num)))}%`;
};

export default function AuditoriaClientView({
  initialAlertas,
  kpis,
  currentAmbito = 'directa',
  initialSeveridad = 'TODAS',
  initialTipo = 'TODOS',
  initialSearch = '',
  initialAlertaId,
}: AuditoriaClientViewProps) {
  const searchParams = useSearchParams();
  const targetAlertaId = searchParams?.get('alertaId') || initialAlertaId || '';

  const [selectedSeveridad, setSelectedSeveridad] = useState<string>(() => {
    return searchParams?.get('severidad')?.toUpperCase() || initialSeveridad || 'TODAS';
  });
  const [selectedTipo, setSelectedTipo] = useState<string>(() => {
    return searchParams?.get('tipo')?.toUpperCase() || initialTipo || 'TODOS';
  });
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    return searchParams?.get('q') || initialSearch || '';
  });
  const [expandedAlertas, setExpandedAlertas] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (targetAlertaId) s.add(targetAlertaId);
    return s;
  });
  const [sortBy, setSortBy] = useState<'severidad' | 'reciente' | 'confianza'>('severidad');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 15;

  // Sincronizar estado cuando cambie la URL o los searchParams
  useEffect(() => {
    if (searchParams) {
      const s = searchParams.get('severidad')?.toUpperCase() || initialSeveridad || 'TODAS';
      const t = searchParams.get('tipo')?.toUpperCase() || initialTipo || 'TODOS';
      const alertaId = searchParams.get('alertaId') || initialAlertaId;
      const q = searchParams.get('q') || initialSearch || '';
      setSelectedSeveridad(s);
      setSelectedTipo(t);
      setSearchQuery(q);
      if (alertaId) {
        setExpandedAlertas((prev) => new Set([...prev, alertaId]));
      }
    }
  }, [searchParams, initialSeveridad, initialTipo, initialSearch, initialAlertaId]);

  const updateUrlFilters = (severidad: string, tipo: string, q?: string) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (severidad && severidad !== 'TODAS') {
      params.set('severidad', severidad);
    } else {
      params.delete('severidad');
    }
    if (tipo && tipo !== 'TODOS') {
      params.set('tipo', tipo);
    } else {
      params.delete('tipo');
    }
    if (q !== undefined) {
      if (q.trim()) {
        params.set('q', q.trim());
      } else {
        params.delete('q');
      }
    }
    const qs = params.toString();
    const newPath = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', newPath);
  };

  // Al cambiar filtros de búsqueda o severidad, reiniciamos a la página 1
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSeveridad, selectedTipo, searchQuery, sortBy]);

  const toggleExpand = (id: string) => {
    setExpandedAlertas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedAlertas(new Set(paginatedAlertas.map((a) => a.id)));
  };

  const collapseAll = () => {
    setExpandedAlertas(new Set());
  };

  // Filtrado y ordenación reactiva en cliente
  const filteredAlertas = useMemo(() => {
    return initialAlertas
      .filter((alerta) => {
        // Si hay una alerta seleccionada directamente por alertaId, aseguramos que aparezca
        if (targetAlertaId && alerta.id === targetAlertaId) {
          return true;
        }
        // Filtro severidad
        if (selectedSeveridad !== 'TODAS' && alerta.severity !== selectedSeveridad) {
          return false;
        }
        // Filtro tipología
        if (selectedTipo !== 'TODOS' && alerta.tipo !== selectedTipo) {
          return false;
        }
        // Filtro de búsqueda de texto
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const inId = alerta.id.toLowerCase().includes(q);
          const inTitulo = alerta.title.toLowerCase().includes(q);
          const inDesc = alerta.description.toLowerCase().includes(q);
          const inEvidencia = alerta.evidence.toLowerCase().includes(q);
          const inContratos = (alerta.contratosDetalle || []).some(
            (c) =>
              c.expediente.toLowerCase().includes(q) ||
              c.objeto.toLowerCase().includes(q) ||
              c.adjudicatario.toLowerCase().includes(q) ||
              (c.nifAdjudicatario && c.nifAdjudicatario.toLowerCase().includes(q))
          );
          if (!inId && !inTitulo && !inDesc && !inEvidencia && !inContratos) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'severidad') {
          // 1º Criterio: Severidad (ALTA -> MEDIA -> INFORMATIVA)
          const order: Record<string, number> = { ALTA: 1, MEDIA: 2, INFORMATIVA: 3 };
          const diff = (order[a.severity] || 4) - (order[b.severity] || 4);
          if (diff !== 0) return diff;
          // 2º Criterio: Confianza descendente
          return (b.confidence || 0) - (a.confidence || 0);
        }
        if (sortBy === 'confianza') {
          const diff = (b.confidence || 0) - (a.confidence || 0);
          if (diff !== 0) return diff;
          const order: Record<string, number> = { ALTA: 1, MEDIA: 2, INFORMATIVA: 3 };
          return (order[a.severity] || 4) - (order[b.severity] || 4);
        }
        // 'reciente': Fecha más reciente de sus contratos vinculados
        const diff = (b.scoreEscala || 0) - (a.scoreEscala || 0);
        if (diff !== 0) return diff;
        return getAlertaFecha(b).localeCompare(getAlertaFecha(a));
      });
  }, [initialAlertas, selectedSeveridad, selectedTipo, searchQuery, sortBy, targetAlertaId]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filteredAlertas.length / PAGE_SIZE));
  const paginatedAlertas = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAlertas.slice(start, start + PAGE_SIZE);
  }, [filteredAlertas, currentPage]);

  // Auto-paginar y auto-scroll cuando se especifica alertaId
  useEffect(() => {
    if (targetAlertaId) {
      const idx = filteredAlertas.findIndex((a) => a.id === targetAlertaId);
      if (idx !== -1) {
        const pageOfAlert = Math.floor(idx / PAGE_SIZE) + 1;
        if (currentPage !== pageOfAlert) {
          setCurrentPage(pageOfAlert);
        }
      }

      const timer = setTimeout(() => {
        const el = document.getElementById(`alerta-${targetAlertaId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [targetAlertaId, filteredAlertas, currentPage]);

  const paginationPages = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [1];
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  }, [totalPages, currentPage]);

  return (
    <div className="space-y-8">
      {/* Disclaimer de Rigor Metodológico */}
      <div className="p-4 rounded-xl bg-[#fffbeb] border border-[#fde68a] flex items-start gap-3">
        <Scale className="h-5 w-5 text-[#b45309] shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700 leading-relaxed space-y-1">
          <p>
            <strong>Criterio de neutralidad e integridad:</strong> Las alertas de LicitAlcázar son <strong>señales estadísticas y cuantitativas precalculadas</strong> conforme a los umbrales de la Ley 9/2017 de Contratos del Sector Público (LCSP).
          </p>
          <p className="text-slate-600">
            Una alerta orienta la labor de investigación cívica, periodística y análisis de datos abiertos; <strong>no constituye imputación de irregularidad, dolo ni infracción administrativa</strong>. Toda señal dispone de enlace directo al expediente canónico de la Plataforma de Contratación del Estado (PLACSP).
          </p>
        </div>
      </div>

      {/* Resumen de Métricas / Tarjetas Superiores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Auditadas */}
        <button
          type="button"
          onClick={() => {
            setSelectedSeveridad('TODAS');
            updateUrlFilters('TODAS', selectedTipo, searchQuery);
          }}
          className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
            selectedSeveridad === 'TODAS'
              ? 'bg-[#f8fafb] border-[#0f172a] ring-2 ring-slate-900/10 shadow-xs'
              : 'bg-white border-[#e2e8f0] hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Señales Auditadas</span>
            <ShieldAlert className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-[#0a0a0a]">
              {formatNumber(kpis.totalAlertas)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              En {formatNumber(kpis.totalContratosConAlerta)} expedientes ({formatDecimal(kpis.volumenAuditado / 1e6, 1)} M€)
            </div>
          </div>
        </button>

        {/* Severidad Alta */}
        <button
          type="button"
          onClick={() => {
            const next = selectedSeveridad === 'ALTA' ? 'TODAS' : 'ALTA';
            setSelectedSeveridad(next);
            updateUrlFilters(next, selectedTipo, searchQuery);
          }}
          className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
            selectedSeveridad === 'ALTA'
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-400/20 shadow-xs'
              : 'bg-white border-[#e2e8f0] hover:border-rose-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-rose-700 font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              Severidad Alta
            </span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold border border-rose-200">
              Escala &gt;5
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-rose-900">
              {formatNumber(kpis.severidades.alta)}
            </div>
            <div className="text-[11px] text-rose-700 mt-0.5">
              Bajas acusadas (&gt;40%) y acumulación estrecha de menores
            </div>
          </div>
        </button>

        {/* Severidad Media */}
        <button
          type="button"
          onClick={() => {
            const next = selectedSeveridad === 'MEDIA' ? 'TODAS' : 'MEDIA';
            setSelectedSeveridad(next);
            updateUrlFilters(next, selectedTipo, searchQuery);
          }}
          className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
            selectedSeveridad === 'MEDIA'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/20 shadow-xs'
              : 'bg-white border-[#e2e8f0] hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-amber-800 font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Severidad Media
            </span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold border border-amber-200">
              Escala 3–5
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-amber-900">
              {formatNumber(kpis.severidades.media)}
            </div>
            <div className="text-[11px] text-amber-700 mt-0.5">
              Ofertas únicas, recurrencia estructural y proyectos concurrentes
            </div>
          </div>
        </button>

        {/* Severidad Informativa */}
        <button
          type="button"
          onClick={() => {
            const next = selectedSeveridad === 'INFORMATIVA' ? 'TODAS' : 'INFORMATIVA';
            setSelectedSeveridad(next);
            updateUrlFilters(next, selectedTipo, searchQuery);
          }}
          className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
            selectedSeveridad === 'INFORMATIVA'
              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-400/20 shadow-xs'
              : 'bg-white border-[#e2e8f0] hover:border-blue-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-blue-800 font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Informativa
            </span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold border border-blue-200">
              Escala 1–3
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-blue-900">
              {formatNumber(kpis.severidades.informativa)}
            </div>
            <div className="text-[11px] text-blue-700 mt-0.5">
              Avisos preventivos y concentraciones leves
            </div>
          </div>
        </button>
      </div>

      {/* Guía visual de la Escala de Riesgo Metodológica */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-slate-700">
        <div className="flex items-start sm:items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-slate-500 shrink-0 mt-0.5 sm:mt-0" />
          <span>
            <strong>Escala Metodológica de Prioridad Analítica (1–3 / 3–5 / &gt;5):</strong> Gradación ponderada según intensidad analítica de la señal para priorizar el análisis ciudadano.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold border border-blue-200">
            Escala 1–3 · Leve / Aviso
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold border border-amber-200">
            Escala 3–5 · Moderada / Recurrente
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold border border-rose-200">
            Escala &gt;5 · Crítica / Prioritaria
          </span>
        </div>
      </div>

      {/* Tabs por Tipología */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e2e8f0] pb-3">
        <button
          type="button"
          onClick={() => {
            setSelectedTipo('TODOS');
            updateUrlFilters(selectedSeveridad, 'TODOS', searchQuery);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            selectedTipo === 'TODOS'
              ? 'bg-[#1e293b] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-[#f1f5f7] border border-[#e2e8f0]'
          }`}
        >
          Todas las Tipologías ({formatNumber(kpis.totalAlertas)})
        </button>

        <button
          type="button"
          onClick={() => {
            const next = selectedTipo === 'CONTRATOS_RELACIONADOS' ? 'TODOS' : 'CONTRATOS_RELACIONADOS';
            setSelectedTipo(next);
            updateUrlFilters(selectedSeveridad, next, searchQuery);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            selectedTipo === 'CONTRATOS_RELACIONADOS'
              ? 'bg-[#7c3aed] text-white shadow-xs font-bold ring-2 ring-[#7c3aed]/20'
              : 'bg-white text-slate-700 hover:bg-purple-50 border border-[#e2e8f0]'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Menores Relacionados / Art. 118 ({kpis.tipos.menoresRelacionados})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const next = selectedTipo === 'BAJA_ACUSADA' ? 'TODOS' : 'BAJA_ACUSADA';
            setSelectedTipo(next);
            updateUrlFilters(selectedSeveridad, next, searchQuery);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            selectedTipo === 'BAJA_ACUSADA'
              ? 'bg-[#0d9373] text-white shadow-xs font-bold ring-2 ring-[#0d9373]/20'
              : 'bg-white text-slate-700 hover:bg-emerald-50 border border-[#e2e8f0]'
          }`}
        >
          <TrendingDown className="h-3.5 w-3.5" />
          <span>Bajas Acusadas / Art. 149 ({kpis.tipos.bajasAcusadas})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const next = selectedTipo === 'OFERTA_UNICA' ? 'TODOS' : 'OFERTA_UNICA';
            setSelectedTipo(next);
            updateUrlFilters(selectedSeveridad, next, searchQuery);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            selectedTipo === 'OFERTA_UNICA'
              ? 'bg-[#2563eb] text-white shadow-xs font-bold ring-2 ring-[#2563eb]/20'
              : 'bg-white text-slate-700 hover:bg-blue-50 border border-[#e2e8f0]'
          }`}
        >
          <UserCheck className="h-3.5 w-3.5" />
          <span>Licitador Único / Concurrencia ({kpis.tipos.ofertaUnica})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const next = selectedTipo === 'NEGOCIADO_SIN_PUBLICIDAD' ? 'TODOS' : 'NEGOCIADO_SIN_PUBLICIDAD';
            setSelectedTipo(next);
            updateUrlFilters(selectedSeveridad, next, searchQuery);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            selectedTipo === 'NEGOCIADO_SIN_PUBLICIDAD'
              ? 'bg-[#ea580c] text-white shadow-xs font-bold ring-2 ring-[#ea580c]/20'
              : 'bg-white text-slate-700 hover:bg-orange-50 border border-[#e2e8f0]'
          }`}
        >
          <Scale className="h-3.5 w-3.5" />
          <span>Negociado sin publicidad / Art. 168 ({kpis.tipos.negociadoSinPublicidad || 0})</span>
        </button>
      </div>

      {/* Barra de Filtros, Búsqueda y Orden */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#e2e8f0]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por empresa, objeto, expediente o evidencia..."
            value={searchQuery}
            onChange={(e) => {
              const val = e.target.value;
              setSearchQuery(val);
              updateUrlFilters(selectedSeveridad, selectedTipo, val);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-[#e2e8f0] focus:outline-hidden focus:border-[#0d9373] focus:ring-1 focus:ring-[#0d9373]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="flex-1 sm:flex-initial px-2.5 py-2 rounded-lg border border-[#e2e8f0] text-xs font-medium text-slate-700 bg-white cursor-pointer min-h-[36px]"
          >
            <option value="severidad">Ordenar: Severidad (Prioridad 1–10)</option>
            <option value="reciente">Ordenar: Más recientes primero</option>
            <option value="confianza">Ordenar: Mayor Intensidad Analítica</option>
          </select>

          <button
            type="button"
            onClick={expandedAlertas.size > 0 ? collapseAll : expandAll}
            className="px-2.5 py-1.5 rounded-lg border border-[#e2e8f0] text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            {expandedAlertas.size > 0 ? 'Plegar página' : 'Desplegar página'}
          </button>

          <a
            href={`/api/export/alertas?format=csv&ambito=${currentAmbito}${
              selectedSeveridad !== 'TODAS' ? `&severidad=${selectedSeveridad}` : ''
            }${selectedTipo !== 'TODOS' ? `&tipo=${selectedTipo}` : ''}`}
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs cursor-pointer"
            title="Descargar señales filtradas en formato CSV para Excel"
          >
            <Download className="h-3.5 w-3.5 text-[#0d9373]" />
            <span>Exportar CSV</span>
          </a>
        </div>
      </div>

      {/* Contador de resultados */}
      <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
        <div>
          Mostrando <strong>{filteredAlertas.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredAlertas.length)}</strong> de {filteredAlertas.length} señales
          {selectedSeveridad !== 'TODAS' && ` · Severidad: ${selectedSeveridad === 'ALTA' ? 'Alta' : selectedSeveridad === 'MEDIA' ? 'Media' : 'Informativa'}`}
          {selectedTipo !== 'TODOS' && ` · Tipo: ${
            selectedTipo === 'BAJA_ACUSADA' 
              ? 'Bajas Acusadas' 
              : selectedTipo === 'CONTRATOS_RELACIONADOS' 
              ? 'Contratos Menores Similares' 
              : selectedTipo === 'NEGOCIADO_SIN_PUBLICIDAD'
              ? 'Negociado sin publicidad'
              : 'Oferta Única'
          }`}
          {searchQuery && ` · Texto: "${searchQuery}"`}
        </div>
        {(selectedSeveridad !== 'TODAS' || selectedTipo !== 'TODOS' || searchQuery) && (
          <button
            type="button"
            onClick={() => {
              setSelectedSeveridad('TODAS');
              setSelectedTipo('TODOS');
              setSearchQuery('');
              updateUrlFilters('TODAS', 'TODOS', '');
            }}
            className="text-[#0d9373] hover:underline font-semibold cursor-pointer"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Listado de Tarjetas de Alerta */}
      {filteredAlertas.length === 0 ? (
        <div className="mint-card p-12 text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-[#10b981] mx-auto" />
          <h4 className="font-bold text-base text-[#1e293b]">
            No hay alertas que coincidan con estos criterios
          </h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Prueba a eliminar filtros de severidad o términos de búsqueda para ver el resto de señales auditadas.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedAlertas.map((alerta) => {
            const isExpanded = expandedAlertas.has(alerta.id);
            const isAlta = alerta.severity === 'ALTA';
            const isMedia = alerta.severity === 'MEDIA';
            const alertaFecha = getAlertaFecha(alerta);
            const isTargeted = alerta.id === targetAlertaId;

            // Contexto del contrato para visualización rápida
            const primerContrato = alerta.contratosDetalle?.[0];
            const adjudicatario = alerta.adjudicatario || primerContrato?.adjudicatario;
            const importe = alerta.importe || (primerContrato?.importe ? formatCurrency(Number(primerContrato.importe)) : null);
            const procedimiento = alerta.procedimiento || primerContrato?.procedimiento;
            const empresaId = primerContrato?.empresaId || primerContrato?.nifAdjudicatario || adjudicatario;

            return (
              <div
                key={alerta.id}
                id={`alerta-${alerta.id}`}
                className={`mint-card p-5 sm:p-6 transition-all border scroll-mt-28 ${
                  isTargeted
                    ? 'ring-2 ring-rose-500 shadow-md border-rose-300'
                    : isAlta
                    ? 'border-rose-200 hover:border-rose-300'
                    : isMedia
                    ? 'border-amber-200 hover:border-amber-300'
                    : 'border-[#e2e8f0] hover:border-slate-300'
                }`}
              >
                {/* Header de la tarjeta */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Badge Severidad */}
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${
                          isAlta
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : isMedia
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isAlta ? 'bg-rose-600 animate-pulse' : isMedia ? 'bg-amber-600' : 'bg-blue-600'
                          }`}
                        />
                        {alerta.severity}
                      </span>

                      {/* Badge Escala Numérica */}
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                        Escala: {alerta.scoreEscala ? alerta.scoreEscala.toFixed(1) : (isAlta ? '6.5' : isMedia ? '4.0' : '2.0')} / 10
                      </span>

                      {/* Badge Patrón de Continuidad */}
                      {alerta.patronContinuidad === 'recurrente_anual' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          🟢 Recurrente Periódico
                        </span>
                      )}
                      {alerta.patronContinuidad === 'patron_concentracion' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-orange-800 border border-orange-200">
                          🟠 Patrón en Revisión
                        </span>
                      )}
                      {alerta.patronContinuidad === 'recurrente_menores' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          🟡 Recurrente Menores
                        </span>
                      )}
                      {alerta.patronContinuidad === 'posible_fraccionamiento' && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                          🔴 Acumulación Relevante (Art. 118 LCSP)
                        </span>
                      )}

                      {/* Badge Tipología */}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f8fafb] text-slate-700 border border-[#e2e8f0]">
                        {alerta.tipo === 'CONTRATOS_RELACIONADOS' && (
                          <>
                            <Layers className="h-3 w-3 text-purple-600" />
                            <span>Menores Relacionados (Art. 118 LCSP)</span>
                          </>
                        )}
                        {alerta.tipo === 'BAJA_ACUSADA' && (
                          <>
                            <TrendingDown className="h-3 w-3 text-[#0d9373]" />
                            <span>Baja Acusada (Art. 149 LCSP)</span>
                          </>
                        )}
                        {alerta.tipo === 'OFERTA_UNICA' && (
                          <>
                            <UserCheck className="h-3 w-3 text-blue-600" />
                            <span>Licitador Único (Concurrencia)</span>
                          </>
                        )}
                        {alerta.tipo === 'NEGOCIADO_SIN_PUBLICIDAD' && (
                          <>
                            <Scale className="h-3 w-3 text-orange-600" />
                            <span>Negociado sin publicidad (Art. 168 LCSP)</span>
                          </>
                        )}
                      </span>

                      {/* Fecha de la alerta / contrato (cuando no se muestra en barra condensada de metadatos) */}
                      {alertaFecha && Boolean(alerta.relacionadosInfo) && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          <span>{formatDate(alertaFecha)}</span>
                        </span>
                      )}

                      {/* Fiabilidad del dato estructurado (PLACSP) */}
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 ml-auto sm:ml-0"
                        title="Distinción analítica: 1) Certeza del dato estructurado (comprobado en registro PLACSP); 2) Intensidad de la señal (score analítico cuantitativo); 3) Ausencia de certeza jurídica (el indicio no prejuzga culpabilidad ni infracción legal, que requiere contradicción y resolución administrativa o judicial)."
                      >
                        <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span>Datos contrastados en PLACSP</span>
                      </span>
                    </div>

                    <h4 className="font-bold text-base text-[#1e293b] pt-1">
                      {alerta.title}
                    </h4>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {alerta.description}
                    </p>
                  </div>

                  {/* Botón expandir */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(alerta.id)}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#e2e8f0] text-slate-700 hover:bg-slate-50 transition-colors self-start"
                  >
                    <span>{isExpanded ? 'Ocultar evidencia' : 'Ver evidencia y contratos'}</span>
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {/* Resumen siempre visible si es contratos relacionados con importe acumulado */}
                {alerta.relacionadosInfo && (
                  <div className="mt-3 p-3 rounded-xl bg-purple-50/60 border border-purple-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-purple-900 font-medium">
                      <Layers className="h-4 w-4 text-purple-700 shrink-0" />
                      <span>
                        Grupo de contratos menores vinculados: <strong>{formatCurrency(alerta.relacionadosInfo.importeAcumulado)}</strong>
                      </span>
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-purple-800 bg-purple-100 px-2 py-0.5 rounded">
                      Similitud: {Math.round(alerta.relacionadosInfo.scoreSimilitud * 100)}%
                    </span>
                  </div>
                )}

                {/* Metadatos clave condensados: Fecha, Procedimiento, Licitador Único / Adjudicatario e Importe */}
                {!alerta.relacionadosInfo && (adjudicatario || importe || procedimiento || alertaFecha) && (
                  <div
                    className={`mt-3 p-2.5 sm:p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2.5 text-xs ${
                      alerta.tipo === 'OFERTA_UNICA'
                        ? 'bg-blue-50/60 border-blue-200/80 text-blue-950'
                        : 'bg-slate-50 border-slate-200/80 text-slate-700'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      {alertaFecha && (
                        <div className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-500 font-medium">Fecha:</span>
                          <span className="font-mono font-semibold text-slate-800">{formatDate(alertaFecha)}</span>
                        </div>
                      )}

                      {procedimiento && (
                        <div className="inline-flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-500 font-medium">Procedimiento:</span>
                          <span className="font-medium text-slate-800">{procedimiento}</span>
                        </div>
                      )}

                      {adjudicatario && adjudicatario !== 'Sin adjudicatario' && (
                        <div className="inline-flex items-center gap-1.5 min-w-0">
                          <Building2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                          <span className="text-slate-500 font-medium">
                            {alerta.tipo === 'OFERTA_UNICA' ? 'Licitador único:' : 'Adjudicatario:'}
                          </span>
                          {empresaId ? (
                            <Link
                              href={`/empresas/${encodeURIComponent(empresaId)}`}
                              className="font-bold text-blue-700 hover:text-blue-900 hover:underline truncate max-w-[220px] sm:max-w-[320px]"
                              title={adjudicatario}
                            >
                              {adjudicatario}
                            </Link>
                          ) : (
                            <span className="font-bold text-slate-900 truncate max-w-[220px] sm:max-w-[320px]" title={adjudicatario}>
                              {adjudicatario}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {importe && (
                      <div className="inline-flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0">
                        <Coins className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span className="text-slate-500 font-medium">Importe:</span>
                        <span className="font-mono font-bold text-xs text-slate-900 bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-200">
                          {importe}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Panel Desplegable: Evidencia, Explicaciones Alternativas y Guía Documental */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-[#e2e8f0] space-y-4">
                    {/* 1. Evidencia Factual */}
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-[#e2e8f0] text-xs text-slate-700 space-y-1.5">
                      <div className="font-bold text-[#1e293b] flex items-center gap-1.5">
                        <Scale className="h-3.5 w-3.5 text-slate-500" />
                        <span>1. Evidencia Factual Auditada (Hechos Detectados)</span>
                      </div>
                      <p className="leading-relaxed font-mono text-[11px] text-slate-600 whitespace-pre-line">
                        {alerta.evidence}
                      </p>
                    </div>

                    {/* 2. Factores Ponderados */}
                    {alerta.factores && alerta.factores.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                            2. Criterios y Factores que Elevan la Señal
                          </span>
                          <Link
                            href="/metodologia#factores-auditoria"
                            className="text-[11px] font-medium text-[#0d9373] hover:underline inline-flex items-center gap-1"
                          >
                            <span>¿Qué significa cada factor? Ver guía</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {alerta.factores.map((f, i) => (
                            <div
                              key={i}
                              className="p-2.5 rounded-lg bg-white border border-[#e2e8f0] flex items-center justify-between"
                            >
                              <span className="text-slate-700 font-medium">{f.label}</span>
                              <span className="font-mono font-bold text-emerald-700 text-[11px] ml-2 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 shrink-0">
                                +{f.scoreContribution}% peso
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. Posibles Explicaciones Alternativas */}
                    {alerta.explicacionesAlternativas && alerta.explicacionesAlternativas.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs space-y-2">
                        <div className="font-bold text-blue-900 flex items-center gap-1.5">
                          <HelpCircle className="h-4 w-4 text-blue-700 shrink-0" />
                          <span>3. Posibles Explicaciones Alternativas (Hipótesis de Gestión Ordinaria)</span>
                        </div>
                        <ul className="space-y-1 list-disc list-inside text-blue-950/80 leading-relaxed text-[11px]">
                          {alerta.explicacionesAlternativas.map((exp, i) => (
                            <li key={i}>{exp}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 4. Documentos a Cotejar por un Investigador */}
                    {alerta.documentosInvestigacion && alerta.documentosInvestigacion.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs space-y-2">
                        <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-emerald-700 shrink-0" />
                          <span>4. Qué Comprobar: Documentos a Cotejar en el Expediente Oficial (PLACSP)</span>
                        </div>
                        <ul className="space-y-1 list-disc list-inside text-emerald-950/80 leading-relaxed text-[11px]">
                          {alerta.documentosInvestigacion.map((doc, i) => (
                            <li key={i}>{doc}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 5. Contratos Vinculados */}
                    {alerta.contratosDetalle && alerta.contratosDetalle.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                          5. Fuente Oficial: Expedientes y Contratos Implicados ({alerta.contratosDetalle.length})
                        </span>
                        <div className="space-y-2">
                          {alerta.contratosDetalle.map((c) => {
                            const slug = getContractSlug(c.id);
                            return (
                              <div
                                key={c.id}
                                className="p-3 rounded-xl bg-white border border-[#e2e8f0] hover:border-[#0d9373] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                              >
                                <div className="space-y-1 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-[#0d9373]">
                                      {c.expediente}
                                    </span>
                                    <span className="text-slate-400">•</span>
                                    <span className="text-slate-500 font-medium">{c.organo}</span>
                                    {c.document_date && (
                                      <>
                                        <span className="text-slate-400">•</span>
                                        <span className="text-slate-400 font-mono">{formatDate(c.document_date)}</span>
                                      </>
                                    )}
                                  </div>

                                  <div className="text-slate-800 font-semibold line-clamp-2">
                                    {c.objeto}
                                  </div>

                                  <div className="text-slate-500 text-[11px]">
                                    Adjudicatario:{' '}
                                    <Link
                                      href={`/empresas/${encodeURIComponent(c.empresaId || c.nifAdjudicatario || c.adjudicatario)}`}
                                      className="font-bold text-[#1e293b] hover:text-[#0d9373] hover:underline"
                                    >
                                      {c.adjudicatario}
                                    </Link>
                                    {c.nifAdjudicatario && ` (${formatNif(c.nifAdjudicatario)})`}
                                  </div>
                                </div>

                                <div className="flex items-center sm:flex-col sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 border-[#f1f5f7] pt-2 sm:pt-0">
                                  <span className="font-mono font-bold text-sm text-[#1e293b]">
                                    {formatCurrency(Number(c.importe))}
                                  </span>

                                  <Link
                                    href={`/licitaciones/${slug}`}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0d9373] hover:text-[#0b7a5f] transition-colors"
                                  >
                                    <span>Ver ficha</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </Link>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-200">
              <div className="text-xs text-slate-500 font-mono">
                Página <span className="font-bold text-slate-900">{currentPage}</span> de{' '}
                <span className="font-bold text-slate-900">{totalPages}</span> ({filteredAlertas.length} señales)
              </div>

              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => {
                    setCurrentPage((p) => Math.max(1, p - 1));
                    window.scrollTo({ top: 350, behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Anterior</span>
                </button>

                <div className="flex items-center gap-1 px-1">
                  {paginationPages.map((p, idx) =>
                    typeof p === 'number' ? (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setCurrentPage(p);
                          window.scrollTo({ top: 350, behavior: 'smooth' });
                        }}
                        className={`h-8 w-8 rounded-lg text-xs font-semibold font-mono transition-colors cursor-pointer ${
                          currentPage === p
                            ? 'bg-[#0f172a] text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {p}
                      </button>
                    ) : (
                      <span key={idx} className="px-1 text-slate-400 text-xs font-mono">
                        …
                      </span>
                    )
                  )}
                </div>

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => {
                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                    window.scrollTo({ top: 350, behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
