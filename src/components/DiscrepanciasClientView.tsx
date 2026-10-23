'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  AlertTriangle, 
  Clock, 
  ExternalLink, 
  Search, 
  Sparkles, 
  Check, 
  ArrowRight,
  Filter
} from 'lucide-react';
import { DiscrepanciaItem, CategoriaDiscrepancia } from '@/lib/discrepancias';
import { formatCurrency } from '@/lib/format';

interface DiscrepanciasClientViewProps {
  initialItems: DiscrepanciaItem[];
  conteoPorCategoria: Record<CategoriaDiscrepancia, number>;
  conteoPorGravedad: {
    alta: number;
    media: number;
    baja: number;
    informativa: number;
  };
}

export default function DiscrepanciasClientView({
  initialItems,
  conteoPorCategoria,
  conteoPorGravedad,
}: DiscrepanciasClientViewProps) {
  const [selectedCategoria, setSelectedCategoria] = useState<string>('REGISTRAL');
  const [search, setSearch] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    return initialItems.filter(item => {
      if (selectedCategoria !== 'TODAS' && item.category !== selectedCategoria) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          item.case_number.toLowerCase().includes(q) ||
          item.object_description.toLowerCase().includes(q) ||
          (item.awardee && item.awardee.toLowerCase().includes(q)) ||
          item.title.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [initialItems, selectedCategoria, search]);

  const handleCopyPrompt = (id: string, prompt: string) => {
    navigator.clipboard.writeText(prompt);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setSelectedCategoria('REGISTRAL')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            selectedCategoria === 'REGISTRAL'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Discrepancias Registrales Directas ({conteoPorCategoria.REGISTRAL})</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/30 text-white font-mono">
            Prioritario
          </span>
        </button>

        <button
          onClick={() => setSelectedCategoria('TEMPORAL')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            selectedCategoria === 'TEMPORAL'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>Inconsistencias Feed Histórico ({conteoPorCategoria.TEMPORAL})</span>
        </button>

        <button
          onClick={() => setSelectedCategoria('TODAS')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            selectedCategoria === 'TODAS'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          <span>Todas ({initialItems.length})</span>
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por expediente, objeto o empresa..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            {conteoPorGravedad.alta > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-semibold">
                Alta: {conteoPorGravedad.alta}
              </span>
            )}
            {conteoPorGravedad.informativa > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                Informativa: {conteoPorGravedad.informativa}
              </span>
            )}
          </div>
          <span className="font-mono text-slate-400">|</span>
          <div className="font-mono">
            Mostrando <strong>{filteredItems.length}</strong> de {initialItems.length}
          </div>
        </div>
      </div>

      {/* Items Grid */}
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-200 space-y-2">
          <Check className="h-8 w-8 text-emerald-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">No se encontraron discrepancias con los filtros actuales</p>
          <p className="text-xs text-slate-500">Prueba a restablecer los términos de búsqueda o cambiar de categoría.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`p-5 rounded-2xl border transition-all ${
                item.gravedad === 'MEDIA'
                  ? 'bg-white border-amber-200 hover:border-amber-300 shadow-2xs hover:shadow-xs'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="space-y-4">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full ${
                      item.category === 'REGISTRAL'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-blue-100 text-blue-800 border border-blue-200'
                    }`}>
                      {item.category}
                    </span>

                    <span className="text-xs font-mono font-bold text-slate-900">
                      {item.case_number}
                    </span>

                    <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      {item.procedimiento}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-slate-900">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                </div>

                {/* Title & Description */}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-1">
                    {item.gravedad === 'MEDIA' ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-blue-600 shrink-0" />
                    )}
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {item.object_description}
                  </p>
                </div>

                {/* Details Box: Dates Comparison */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-400">Publicación</span>
                    <span className="font-mono font-medium text-slate-700">
                      {item.fechasComparadas.publicacion || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-400">Límite Ofertas</span>
                    <span className="font-mono font-medium text-slate-700">
                      {item.fechasComparadas.limite || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-400">Adjudicación</span>
                    <span className={`font-mono font-bold ${
                      item.tipo === 'ADJUDICACION_PREVIA_LIMITE' ? 'text-amber-700 underline decoration-amber-400' : 'text-slate-700'
                    }`}>
                      {item.fechasComparadas.adjudicacion || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-400">Formalización</span>
                    <span className={`font-mono font-bold ${
                      item.tipo === 'FORMALIZACION_PREVIA_ADJUDICACION' ? 'text-amber-700 underline decoration-amber-400' : 'text-slate-700'
                    }`}>
                      {item.fechasComparadas.formalizacion || '—'}
                    </span>
                  </div>
                </div>

                {/* Conflict description and recommended action */}
                <div className="text-xs space-y-1.5">
                  <div className="text-slate-700">
                    <strong className="text-slate-900">Diagnóstico: </strong>
                    {item.description}
                  </div>
                  <div className="text-slate-600 flex items-center gap-1.5 text-[11px]">
                    <strong className="text-slate-800">Acción de auditoría: </strong>
                    {item.accionRecomendada}
                  </div>
                </div>

                {/* AI Review Prompt & Actions Box */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyPrompt(item.id, item.promptIa)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        copiedId === item.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                      title="Copiar prompt redactado para pasar a la IA"
                    >
                      {copiedId === item.id ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>¡Prompt Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Copiar Prompt para IA</span>
                        </>
                      )}
                    </button>

                    <a
                      href={item.urlOficial}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      <span>PLACSP</span>
                      <ExternalLink className="h-3 w-3 text-slate-400" />
                    </a>
                  </div>

                  <Link
                    href={`/licitaciones/${item.slug}`}
                    className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-[#0d9373] hover:text-[#065f46] hover:underline"
                  >
                    <span>Ver expediente en LicitAlcázar</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
