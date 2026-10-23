import Link from 'next/link';
import { Landmark, FileText } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-[65vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <span className="text-5xl sm:text-6xl font-black font-mono text-[#0d9373] tracking-tight">
            404
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Página o expediente no encontrado
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            El recurso solicitado no existe en la base de datos de LicitAlcázar o el identificador del expediente ha sido modificado.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0d9373] text-white hover:bg-[#0b7a60] text-xs font-semibold transition-colors shadow-xs"
          >
            <Landmark className="h-4 w-4" />
            <span>Ir al Inicio</span>
          </Link>
          <Link
            href="/licitaciones"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
          >
            <FileText className="h-4 w-4 text-slate-400" />
            <span>Explorador de Contratos</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
