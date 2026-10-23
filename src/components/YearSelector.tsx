'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar } from 'lucide-react';

const YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

export default function YearSelector({ currentYear }: { currentYear?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (year: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (year) {
      params.set('ano', year);
    } else {
      // 'todos' es un valor explícito: sin él, /analisis arranca en el ejercicio en curso.
      params.set('ano', 'todos');
    }
    router.push(`/analisis?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Calendar className="h-4 w-4 text-[#0d9373]" />
      <button
        onClick={() => handleChange('')}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
          currentYear === 'todos'
            ? 'bg-[#ecfdf5] text-[#0d9373] border-[#a7f3d0] shadow-xs font-bold'
            : 'bg-white text-slate-600 border-[#e2e8f0] hover:bg-[#f8fafb]'
        }`}
      >
        Todos los años
      </button>
      {YEARS.map(y => (
        <button
          key={y}
          onClick={() => handleChange(String(y))}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
            currentYear === String(y)
              ? 'bg-[#ecfdf5] text-[#0d9373] border-[#a7f3d0] shadow-xs font-bold'
              : 'bg-white text-slate-600 border-[#e2e8f0] hover:bg-[#f8fafb]'
          }`}
        >
          {y}
        </button>
      ))}
    </div>
  );
}
