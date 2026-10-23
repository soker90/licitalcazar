'use client';

import { useEffect, useState } from 'react';
import { List } from 'lucide-react';

const SECTIONS = [
  { id: 'menores-recurrentes', label: 'Menores Recurrentes' },
  { id: 'fraccionamiento', label: 'Fraccionamiento' },
  { id: 'concentracion', label: 'Concentración de Mercado' },
  { id: 'flujo', label: 'Flujo y Desiertas' },
  { id: 'contratos-vivos', label: 'Contratos Vivos' },
  { id: 'lotes', label: 'Lotes y PYMEs' },
  { id: 'baja-temeraria', label: 'Bajas Acusadas (Art. 149)' },
  { id: 'modificados', label: 'Modificados y Sobrecostes' },
  { id: 'duracion-efectiva', label: 'Duración Registrada' },
  { id: 'empresas-locales', label: 'Empresas Locales' },
];

export default function AnalisisTableOfContents() {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        );
        setActiveId(topMost.target.id);
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 }
    );

    const elements = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null
    );
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Escritorio: índice flotante fijo a la derecha (patrón "On this page" tipo Mintlify) */}
      <nav
        aria-label="Índice de secciones de análisis"
        className="hidden 2xl:block fixed right-6 top-28 w-52 max-h-[calc(100vh-8rem)] overflow-y-auto z-30"
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono mb-2 px-2">
          En esta página
        </p>
        <ul className="space-y-0.5 border-l border-[#e2e8f0]">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={`block pl-3 pr-2 py-1.5 text-xs border-l-2 -ml-px transition-colors ${
                  activeId === s.id
                    ? 'border-[#00d4a4] text-[#0d9373] font-semibold bg-[#ecfdf5]/50'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-[#cbd5e1]'
                }`}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Móvil / tablet: menú de salto colapsable */}
      <div className="2xl:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] border border-[#e2e8f0] hover:border-[#d1fae5] text-xs font-semibold text-slate-700 transition-all"
        >
          <span className="flex items-center gap-2">
            <List className="h-3.5 w-3.5 text-[#0d9373]" />
            Índice de secciones ({SECTIONS.length})
          </span>
          <span className="text-slate-400 text-sm leading-none">{mobileOpen ? '−' : '+'}</span>
        </button>
        {mobileOpen && (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-3 rounded-lg border border-[#e2e8f0] bg-white">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setMobileOpen(false)}
                className="text-[11px] text-slate-600 hover:text-[#0d9373] px-2 py-1 rounded hover:bg-[#f8fafb] transition-colors"
              >
                {s.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
