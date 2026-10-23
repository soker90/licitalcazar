'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getPlacspId } from '@/lib/placsp';
import { 
  Search, 
  Building2, 
  Briefcase, 
  FileText, 
  AlertTriangle, 
  ArrowRight, 
  X, 
  TrendingUp,
  Loader2
} from 'lucide-react';
import { formatCurrency, formatNumber, formatNif } from '@/lib/format';

interface QuickSearchResult {
  licitaciones: {
    id: string;
    expediente: string;
    objeto: string;
    importe: number | null;
    importe_label: string;
    organo: string;
  }[];
  empresas: {
    nombre: string;
    nif: string;
    contratos: number;
    volumen: number;
  }[];
  organismos: {
    authorityId: string;
    placsp_id?: string | null;
    name?: string;
    nombre: string;
    contratos: number;
    volumen: number;
  }[];
}

type PaletteItem = 
  | { type: 'licitacion'; id: string; title: string; subtitle: string; meta: string; href: string }
  | { type: 'empresa'; id: string; title: string; subtitle: string; meta: string; href: string }
  | { type: 'organismo'; id: string; title: string; subtitle: string; meta: string; href: string }
  | { type: 'action'; id: string; title: string; subtitle: string; meta: string; href: string };

const QUICK_ACTIONS: PaletteItem[] = [
  {
    type: 'action',
    id: 'act-redflags',
    title: 'Auditoría de Banderas Rojas y Competencia',
    subtitle: 'Radar de concentración, ofertas únicas y umbrales de contratos menores',
    meta: 'Análisis',
    href: '/analisis',
  },
  {
    type: 'action',
    id: 'act-en-curso',
    title: 'Licitaciones y Contratos en Curso',
    subtitle: 'Convocatorias con plazo abierto y contratos próximos a vencer',
    meta: 'En Curso',
    href: '/seguimiento',
  },
  {
    type: 'action',
    id: 'act-oferta-unica',
    title: 'Ver Contratos con Oferta Única',
    subtitle: 'Expedientes competitivos adjudicados con un único licitador (sin concurrencia)',
    meta: 'Filtro Alerta',
    href: '/licitaciones?alerta=oferta_unica',
  },
  {
    type: 'action',
    id: 'act-baja-cero',
    title: 'Ver Contratos al Máximo Presupuestado (0% Rebaja)',
    subtitle: 'Expedientes adjudicados al 100% del precio de licitación, sin descuento alguno',
    meta: 'Filtro Alerta',
    href: '/licitaciones?alerta=baja_cero',
  },
  {
    type: 'action',
    id: 'act-menores',
    title: 'Ver Contratos Menores en Límite Legal (>90%)',
    subtitle: 'Contratos menores próximos al umbral cuantitativo legal (15.000€ o 40.000€)',
    meta: 'Filtro Alerta',
    href: '/licitaciones?alerta=alerta_menor',
  },
  {
    type: 'action',
    id: 'act-empresas',
    title: 'Top Empresas Adjudicatarias de Alcázar',
    subtitle: 'Ranking de proveedores por volumen total y número de contratos',
    meta: 'Directorio',
    href: '/empresas',
  },
];

export default function CommandPalette() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuickSearchResult>({ licitaciones: [], empresas: [], organismos: [] });
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global open/close listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      // Esc
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    const handleCustomOpen = () => {
      setIsOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-command-palette', handleCustomOpen);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-command-palette', handleCustomOpen);
    };
  }, [isOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      setSelectedIndex(0);
    } else {
      setQuery('');
      setResults({ licitaciones: [], empresas: [], organismos: [] });
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults({ licitaciones: [], empresas: [], organismos: [] });
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-quick?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error('Quick search error:', err);
      } finally {
        setLoading(false);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [query]);

  // Build flattened items list for keyboard navigation
  const flatItems: PaletteItem[] = query.trim() ? [
    ...results.licitaciones.map((l) => ({
      type: 'licitacion' as const,
      id: l.id,
      title: l.objeto,
      subtitle: `${l.expediente ? `Exp: ${l.expediente} · ` : ''}${l.organo}`,
      meta: l.importe === null ? l.importe_label : `${l.importe_label}: ${formatCurrency(l.importe)}`,
      href: `/licitaciones/${encodeURIComponent(getPlacspId(l.id) || l.id)}`,
    })),
    ...results.empresas.map((e: any) => ({
      type: 'empresa' as const,
      id: e.id || e.nif || e.nombre,
      title: e.nombre,
      subtitle: `${e.grupo ? `[${e.grupo}] · ` : ''}${e.nif ? `NIF: ${formatNif(e.nif)} · ` : ''}${formatNumber(e.contratos)} contratos adjudicados`,
      meta: formatCurrency(e.volumen),
      href: `/empresas/${encodeURIComponent(e.id || e.nif || e.nombre)}`,
    })),
    ...results.organismos.map((o) => ({
      type: 'organismo' as const,
      id: o.placsp_id || o.authorityId,
      title: o.name || o.nombre,
      subtitle: `${formatNumber(o.contratos)} contratos gestionados`,
      meta: formatCurrency(o.volumen),
      href: `/organismos/${encodeURIComponent(o.placsp_id || o.authorityId)}`,
    })),
  ] : QUICK_ACTIONS;

  const handleSelect = useCallback((item: PaletteItem) => {
    setIsOpen(false);
    router.push(item.href);
  }, [router]);

  // Keyboard navigation inside modal
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (flatItems.length > 0 ? (prev + 1) % flatItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (flatItems.length > 0 ? (prev - 1 + flatItems.length) % flatItems.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatItems[selectedIndex]) {
        handleSelect(flatItems[selectedIndex]);
      } else if (query.trim()) {
        setIsOpen(false);
        router.push(`/licitaciones?q=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-14 sm:pt-20 px-4 sm:px-6">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs transition-opacity animate-in fade-in-0 duration-150"
        onClick={() => setIsOpen(false)}
      />

      {/* Palette Container */}
      <div 
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda rápida en LicitAlcázar"
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-[#e2e8f0] flex flex-col max-h-[80vh] sm:max-h-[75vh] animate-in fade-in-0 zoom-in-95 duration-150 z-10"
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-[#e2e8f0] gap-3 bg-[#ffffff]">
          {loading ? (
            <Loader2 className="h-5 w-5 text-[#0d9373] animate-spin shrink-0" />
          ) : (
            <Search className="h-5 w-5 text-slate-400 shrink-0" />
          )}

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Buscar por licitación, empresa, CIF, organismo o expediente..."
            className="flex-1 bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />

          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-[#f1f5f7] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <kbd className="hidden sm:inline-flex items-center rounded border border-[#e2e8f0] bg-[#f8fafb] px-2 py-0.5 text-[10px] font-mono text-slate-500 font-semibold shadow-xs">
            ESC
          </kbd>
        </div>

        {/* Results / Navigation Body */}
        <div ref={listRef} className="overflow-y-auto p-2.5 space-y-4 divide-y divide-[#e2e8f0]/60">
          {query.trim() === '' ? (
            // Default Suggestions / Shortcuts
            <div className="pt-1">
              <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-[#0d9373]" />
                <span>Accesos Directos y Auditoría</span>
              </div>
              <div className="space-y-1">
                {QUICK_ACTIONS.map((item, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      data-active={isSelected}
                      className={`w-full flex items-center justify-between text-left p-3 rounded-xl transition-all ${
                        isSelected
                          ? 'bg-[#ecfdf5] border border-[#d1fae5] shadow-xs'
                          : 'hover:bg-[#f8fafb] border border-transparent'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span className={`p-2 rounded-lg mt-0.5 shrink-0 ${
                          isSelected ? 'bg-white text-[#0d9373]' : 'bg-[#f1f5f7] text-slate-600'
                        }`}>
                          {item.id.includes('redflags') || item.id.includes('alerta') ? (
                            <AlertTriangle className="h-4 w-4 text-[#d97706]" />
                          ) : (
                            <ArrowRight className="h-4 w-4 text-[#0d9373]" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className={`text-xs sm:text-sm font-semibold truncate ${
                            isSelected ? 'text-[#0d9373]' : 'text-slate-900'
                          }`}>
                            {item.title}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {item.subtitle}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0 ml-3 ${
                        isSelected ? 'bg-white text-[#0d9373] border border-[#d1fae5]' : 'bg-[#f1f5f7] text-slate-500'
                      }`}>
                        {item.meta}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : flatItems.length === 0 && !loading ? (
            // No Results State
            <div className="py-10 text-center px-4">
              <p className="text-sm font-semibold text-slate-700">
                No se encontraron resultados para &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Prueba buscando por palabras clave del objeto, denominación social de la empresa o código de expediente.
              </p>
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push(`/licitaciones?q=${encodeURIComponent(query.trim())}`);
                }}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0a0a0a] text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                <span>Búsqueda avanzada en Explorador</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            // Filtered Results Categorized
            <div className="space-y-4 pt-1">
              {/* 1. Licitaciones */}
              {results.licitaciones.length > 0 && (
                <div>
                  <div className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-[#0d9373]" />
                    <span>Licitaciones y Contratos</span>
                  </div>
                  <div className="space-y-1">
                    {results.licitaciones.map((l) => {
                      const idx = flatItems.findIndex((item) => item.id === l.id);
                      const isSelected = selectedIndex === idx;
                      return (
                        <button
                          key={l.id}
                          onClick={() => handleSelect(flatItems[idx])}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          data-active={isSelected}
                          className={`w-full flex items-center justify-between text-left p-3 rounded-xl transition-all ${
                            isSelected
                              ? 'bg-[#ecfdf5] border border-[#d1fae5] shadow-xs'
                              : 'hover:bg-[#f8fafb] border border-transparent'
                          }`}
                        >
                          <div className="min-w-0 pr-3">
                            <p className={`text-xs sm:text-sm font-semibold truncate ${
                              isSelected ? 'text-[#0d9373]' : 'text-slate-900'
                            }`}>
                              {l.objeto}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {l.expediente ? <span className="font-mono text-slate-600 font-medium">[{l.expediente}] </span> : null}
                              {l.organo}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-bold text-slate-900 shrink-0 bg-[#f1f5f7] px-2 py-1 rounded-md">
                            {l.importe === null ? l.importe_label : formatCurrency(l.importe)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. Empresas */}
              {results.empresas.length > 0 && (
                <div className="pt-3">
                  <div className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 text-[#2563eb]" />
                    <span>Empresas Adjudicatarias</span>
                  </div>
                  <div className="space-y-1">
                    {results.empresas.map((e) => {
                      const key = e.nif || e.nombre;
                      const idx = flatItems.findIndex((item) => item.id === key);
                      const isSelected = selectedIndex === idx;
                      return (
                        <button
                          key={key}
                          onClick={() => handleSelect(flatItems[idx])}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          data-active={isSelected}
                          className={`w-full flex items-center justify-between text-left p-3 rounded-xl transition-all ${
                            isSelected
                              ? 'bg-[#ecfdf5] border border-[#d1fae5] shadow-xs'
                              : 'hover:bg-[#f8fafb] border border-transparent'
                          }`}
                        >
                          <div className="min-w-0 pr-3">
                            <p className={`text-xs sm:text-sm font-semibold truncate ${
                              isSelected ? 'text-[#0d9373]' : 'text-slate-900'
                            }`}>
                              {e.nombre}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {e.nif ? <span className="font-mono text-slate-600 font-medium">{formatNif(e.nif)} · </span> : null}
                              {formatNumber(e.contratos)} adjudicaciones registradas
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-mono text-xs font-bold text-slate-900 block">
                              {formatCurrency(e.volumen)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Organismos */}
              {results.organismos.length > 0 && (
                <div className="pt-3">
                  <div className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-[#0891b2]" />
                    <span>Órganos de Contratación</span>
                  </div>
                  <div className="space-y-1">
                    {results.organismos.map((o) => {
                      const orgId = o.placsp_id || o.authorityId;
                      const idx = flatItems.findIndex((item) => item.id === orgId);
                      const isSelected = selectedIndex === idx;
                      return (
                        <button
                          key={orgId}
                          onClick={() => handleSelect(flatItems[idx])}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          data-active={isSelected}
                          className={`w-full flex items-center justify-between text-left p-3 rounded-xl transition-all ${
                            isSelected
                              ? 'bg-[#ecfdf5] border border-[#d1fae5] shadow-xs'
                              : 'hover:bg-[#f8fafb] border border-transparent'
                          }`}
                        >
                          <div className="min-w-0 pr-3">
                            <p className={`text-xs sm:text-sm font-semibold truncate ${
                              isSelected ? 'text-[#0d9373]' : 'text-slate-900'
                            }`}>
                              {o.name || o.nombre}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {formatNumber(o.contratos)} contratos en total
                            </p>
                          </div>
                          <span className="font-mono text-xs font-bold text-slate-900 shrink-0">
                            {formatCurrency(o.volumen)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="px-4 py-2.5 bg-[#f8fafb] border-t border-[#e2e8f0] flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <div className="hidden sm:flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[#e2e8f0] bg-white px-1.5 py-0.5 text-[9px] font-mono shadow-xs">↑</kbd>
              <kbd className="rounded border border-[#e2e8f0] bg-white px-1.5 py-0.5 text-[9px] font-mono shadow-xs">↓</kbd>
              <span className="ml-0.5">Navegar</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[#e2e8f0] bg-white px-1.5 py-0.5 text-[9px] font-mono shadow-xs">↵</kbd>
              <span className="ml-0.5">Abrir</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[#e2e8f0] bg-white px-1.5 py-0.5 text-[9px] font-mono shadow-xs">ESC</kbd>
              <span className="ml-0.5">Cerrar</span>
            </span>
          </div>

          <div className="sm:hidden flex items-center gap-1.5 text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00d4a4]" />
            <span>Toca para abrir resultado</span>
          </div>

          <Link
            href={query.trim() ? `/licitaciones?q=${encodeURIComponent(query.trim())}` : '/licitaciones'}
            onClick={() => setIsOpen(false)}
            className="text-[#0d9373] hover:underline flex items-center gap-1 font-semibold"
          >
            <span>Ver todos en el Explorador</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
