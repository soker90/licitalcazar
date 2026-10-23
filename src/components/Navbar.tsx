'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { 
  Building2, 
  FileText, 
  Briefcase, 
  BarChart3, 
  Search, 
  Landmark,
  Menu,
  X,
  BookOpen,
  ShieldAlert,
  CalendarClock
} from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const openCommandPalette = () => {
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  };

  // Enlaces de navegación principal (escritorio: el logo ya conduce al Dashboard)
  const navLinks = [
    { href: '/licitaciones', label: 'Licitaciones', icon: FileText },
    { href: '/auditoria', label: 'Riesgos y Señales', icon: ShieldAlert, hasBadge: true },
    { href: '/seguimiento', label: 'En Curso', icon: CalendarClock },
    { href: '/organismos', label: 'Organismos', icon: Building2 },
    { href: '/empresas', label: 'Empresas', icon: Briefcase },
    { href: '/analisis', label: 'Análisis', icon: BarChart3 },
    { href: '/metodologia', label: 'Metodología', icon: BookOpen },
  ];

  // En móvil incluimos explícitamente el acceso a Inicio
  const mobileNavLinks = [
    { href: '/', label: 'Inicio', icon: Landmark },
    { href: '/licitaciones', label: 'Licitaciones', icon: FileText },
    { href: '/auditoria', label: 'Riesgos y Señales', icon: ShieldAlert, hasBadge: true },
    { href: '/seguimiento', label: 'En Curso', icon: CalendarClock },
    { href: '/organismos', label: 'Organismos', icon: Building2 },
    { href: '/empresas', label: 'Empresas', icon: Briefcase },
    { href: '/analisis', label: 'Análisis', icon: BarChart3 },
    { href: '/metodologia', label: 'Metodología', icon: BookOpen },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md text-slate-800 transition-all">
      <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand & Desktop Navigation */}
        <div className="flex items-center gap-4 xl:gap-8">
          {/* Brand limpio y compacto */}
          <Link 
            href="/" 
            className="flex items-center gap-2.5 group shrink-0 transition-opacity hover:opacity-90"
            title="Ir al inicio de LicitAlcázar"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#00d4a4] to-[#0d9373] text-slate-950 font-black text-sm shadow-xs group-hover:scale-105 transition-transform">
              A
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold tracking-tight text-base sm:text-lg text-slate-900 font-sans">
                Licit<span className="text-[#0d9373]">Alcázar</span>
              </span>
              <span className="hidden sm:inline-block text-[10px] font-mono font-medium text-slate-400">
                v2
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-50 text-[#0d9373] font-semibold border border-emerald-200/60'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-[#0d9373]' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                  {item.hasBadge && (
                    <span 
                      className="h-1.5 w-1.5 rounded-full bg-amber-500 ring-2 ring-amber-200 shrink-0" 
                      title="Señales analíticas activas" 
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden sm:flex items-center justify-between w-40 md:w-44 lg:w-48 xl:w-56 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 px-3 py-1.5 text-xs text-slate-500 transition-all text-left group"
            title="Buscar licitaciones, empresas o CIF (Atajo: ⌘K)"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#0d9373] transition-colors shrink-0" />
              <span className="truncate text-slate-400 group-hover:text-slate-600">Buscar...</span>
            </span>
            <kbd className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-mono font-medium text-slate-400 shadow-xs shrink-0 ml-1">
              ⌘K
            </kbd>
          </button>

          {/* Mobile search button */}
          <button
            type="button"
            onClick={openCommandPalette}
            className="sm:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
            title="Buscar"
            aria-label="Abrir buscador"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
            aria-label="Abrir menú de navegación"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-3 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              openCommandPalette();
            }}
            className="w-full flex items-center justify-between rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3.5 py-3 text-xs text-slate-600 text-left transition-colors min-h-[44px]"
          >
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4 text-[#0d9373]" />
              <span className="font-medium text-slate-700">Buscar licitaciones, CIF, empresas...</span>
            </span>
            <span className="text-[10px] font-semibold text-[#0d9373] bg-[#ecfdf5] border border-[#d1fae5] px-2 py-0.5 rounded-full">
              Buscar
            </span>
          </button>

          <div className="grid grid-cols-2 gap-2 pt-1">
            {mobileNavLinks.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors min-h-[44px] ${
                    isActive 
                      ? 'bg-emerald-50 text-[#0d9373] font-semibold border border-emerald-200 shadow-2xs' 
                      : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#0d9373]' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
