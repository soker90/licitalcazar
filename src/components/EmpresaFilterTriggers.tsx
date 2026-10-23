'use client';

import React from 'react';
import { Filter, ArrowDownRight, Clock, ChevronRight } from 'lucide-react';

interface FilterDenominacionTriggerProps {
  clusterKey: string;
  count: number;
  className?: string;
}

export function FilterDenominacionTrigger({
  clusterKey,
  count,
  className = '',
}: FilterDenominacionTriggerProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.dispatchEvent(
      new CustomEvent('filter-empresa-contratos', {
        detail: { clusterKey },
      })
    );
  };

  return (
    <button
      onClick={handleClick}
      title={`Filtrar y ver los ${count} contratos adjudicados bajo esta denominación`}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border shadow-2xs ${
        className || 'bg-white hover:bg-[#ecfdf5] text-slate-700 hover:text-[#0d9373] border-[#e2e8f0] hover:border-[#a7f3d0]'
      }`}
    >
      <Filter className="h-3 w-3 text-[#0d9373]" />
      <span>Ver contratos ({count})</span>
      <ArrowDownRight className="h-3 w-3 opacity-60" />
    </button>
  );
}

interface FilterFilialTriggerProps {
  cif: string;
  count: number;
  className?: string;
}

export function FilterFilialTrigger({
  cif,
  count,
  className = '',
}: FilterFilialTriggerProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.dispatchEvent(
      new CustomEvent('filter-empresa-contratos', {
        detail: { cif },
      })
    );
  };

  return (
    <button
      onClick={handleClick}
      title={`Filtrar contratos de la filial con CIF ${cif}`}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border shadow-2xs ${
        className || 'bg-white hover:bg-[#eff6ff] text-slate-700 hover:text-[#2563eb] border-[#e2e8f0] hover:border-[#bfdbfe]'
      }`}
    >
      <Filter className="h-3 w-3 text-[#2563eb]" />
      <span>Filtrar filial ({count})</span>
      <ArrowDownRight className="h-3 w-3 opacity-60" />
    </button>
  );
}

interface FilterProrrogasTriggerProps {
  count: number;
  className?: string;
}

export function FilterProrrogasTrigger({
  count,
  className = '',
}: FilterProrrogasTriggerProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.dispatchEvent(
      new CustomEvent('filter-empresa-contratos', {
        detail: { prorroga: true },
      })
    );
  };

  return (
    <button
      onClick={handleClick}
      title={`Filtrar y ver los ${count} contratos con prórroga o ampliación de plazo`}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border shadow-2xs ${
        className || 'bg-white hover:bg-amber-100 text-amber-900 border-amber-300'
      }`}
    >
      <Clock className="h-3.5 w-3.5 text-amber-600" />
      <span>Ver contratos con prórroga ({count})</span>
      <ChevronRight className="h-3.5 w-3.5 opacity-75" />
    </button>
  );
}
