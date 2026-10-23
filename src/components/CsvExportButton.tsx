'use client';

import { Download } from 'lucide-react';
import { buildCsv, downloadCsv } from '@/lib/csv';

interface CsvExportButtonProps {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  label?: string;
  className?: string;
}

export default function CsvExportButton({ filename, headers, rows, label = 'Descargar CSV', className }: CsvExportButtonProps) {
  const handleClick = () => {
    if (rows.length === 0) return;
    downloadCsv(filename, buildCsv(headers, rows));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={rows.length === 0}
      className={
        className ||
        'flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white hover:bg-[#f8fafb] border border-[#e2e8f0] hover:border-[#cbd5e1] text-xs font-semibold text-slate-700 transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed'
      }
    >
      <Download className="h-3.5 w-3.5 text-[#0d9373]" />
      <span>{label}</span>
    </button>
  );
}
