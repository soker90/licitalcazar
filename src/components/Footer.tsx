import Link from 'next/link';
import { ExternalLink, Rss, AlertOctagon } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="w-full border-t border-[#e2e8f0] bg-[#f8fafb] text-slate-500 py-12 text-xs relative z-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00d4a4] text-slate-950 font-extrabold text-sm shadow-xs">
                A
              </div>
              <span className="font-bold text-[#1e293b] text-lg tracking-tight">
                Licit<span className="text-[#0d9373]">Alcázar</span>
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-wider bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5] px-2.5 py-0.5 rounded-full">
                Alcázar de San Juan
              </span>
            </div>
            <p className="text-[#64748b] leading-relaxed max-w-md text-xs">
              Portal cívico independiente para la monitorización, análisis y transparencia de la contratación pública en el municipio de Alcázar de San Juan (Ciudad Real). Datos abiertos procedentes directamente de la Plataforma de Contratación del Sector Público (PLACSP).
            </p>
          </div>

          <div>
            <h4 className="font-bold text-[#1e293b] mb-3 uppercase tracking-wider text-[11px] font-mono">
              Secciones
            </h4>
            <ul className="space-y-2.5">
              <li><Link href="/licitaciones" className="hover:text-[#0d9373] transition-colors">Explorador de Contratos</Link></li>
              <li><Link href="/auditoria" className="hover:text-[#0d9373] transition-colors">Análisis de Riesgos</Link></li>
              <li><Link href="/seguimiento" className="hover:text-[#0d9373] transition-colors">Contratos en Curso</Link></li>
              <li><Link href="/organismos" className="hover:text-[#0d9373] transition-colors">Organismos Públicos</Link></li>
              <li><Link href="/empresas" className="hover:text-[#0d9373] transition-colors">Empresas Adjudicatarias</Link></li>
              <li><Link href="/analisis" className="hover:text-[#0d9373] transition-colors">Métricas y Transparencia</Link></li>
              <li>
                <Link 
                  href="/discrepancias" 
                  className="text-amber-800 hover:text-amber-900 font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <AlertOctagon className="h-3 w-3 text-amber-600 shrink-0" />
                  <span>Discrepancias Detectadas</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    Buzón
                  </span>
                </Link>
              </li>
              <li><Link href="/datos" className="text-[#0d9373] hover:underline font-semibold flex items-center gap-1"><span>Datos Abiertos (CSV / JSON)</span></Link></li>
              <li>
                <a 
                  href="/feed.xml" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Rss className="h-3 w-3 text-amber-600" />
                  <span>Canal RSS (Sindicación)</span>
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-[#1e293b] mb-3 uppercase tracking-wider text-[11px] font-mono">
              Información Jurídica
            </h4>
            <ul className="space-y-2.5">
              <li><Link href="/aviso-legal" className="hover:text-[#0d9373] transition-colors">Aviso Legal y Exoneración</Link></li>
              <li><Link href="/privacidad" className="hover:text-[#0d9373] transition-colors">Política de Privacidad (RGPD)</Link></li>
              <li><Link href="/rectificacion" className="hover:text-[#0d9373] transition-colors font-medium text-emerald-800">Canal de Rectificación</Link></li>
              <li><Link href="/metodologia" className="hover:text-[#0d9373] transition-colors">Metodología y Verificabilidad</Link></li>
              <li>
                <a 
                  href="https://contrataciondelestado.es/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:text-[#0d9373] transition-colors inline-flex items-center gap-1 text-slate-400"
                >
                  <span>Fuente: PLACSP</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Disclaimer legal obligatorio */}
        <div className="p-4 rounded-xl bg-slate-100/80 border border-slate-200/80 text-[11px] text-slate-600 leading-relaxed space-y-1">
          <p className="font-semibold text-slate-800">
            Aviso de Neutralidad y Exoneración de Potestades Públicas:
          </p>
          <p>
            LicitAlcázar es una iniciativa cívica e independiente de análisis de datos públicos de contratación. Los resultados tienen carácter exclusivamente informativo y metodológico. No constituyen informe de fiscalización, auditoría pública, dictamen jurídico vinculante, resolución administrativa ni declaración de ilegalidad, nulidad, responsabilidad o infracción.
          </p>
        </div>

        <div className="border-t border-[#e2e8f0] pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400 font-mono">
          <p>© {new Date().getFullYear()} LicitAlcázar · Iniciativa Cívica de Datos Abiertos</p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/aviso-legal" className="hover:text-slate-600 transition-colors">Aviso Legal</Link>
            <span>•</span>
            <Link href="/privacidad" className="hover:text-slate-600 transition-colors">Privacidad</Link>
            <span>•</span>
            <Link href="/rectificacion" className="hover:text-slate-600 transition-colors">Rectificación</Link>
            <span>•</span>
            <Link href="/discrepancias" className="text-amber-700 hover:text-amber-800 font-medium transition-colors">Discrepancias</Link>
            <span>•</span>
            <Link href="/datos" className="text-[#0d9373] hover:underline font-semibold">
              Datos Abiertos (CSV/JSON)
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
