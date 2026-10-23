import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import CommandPalette from '@/components/CommandPalette';

import { SITE_URL } from '@/lib/config';

const siteTitle = 'LicitAlcázar · Inteligencia de Contratación Pública en Alcázar de San Juan';
const siteDescription = 'Portal cívico independiente de datos abiertos sobre licitaciones, adjudicaciones, contratos menores y gasto público en Alcázar de San Juan (Ciudad Real), basado en los registros de la Plataforma de Contratación del Sector Público (PLACSP).';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: siteTitle,
  description: siteDescription,
  keywords: ['Alcázar de San Juan', 'licitaciones', 'contratación pública', 'adjudicaciones', 'Aguas de Alcázar', 'Ayuntamiento de Alcázar de San Juan', 'Hospital Mancha Centro'],
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/',
    types: {
      'application/rss+xml': [{ url: '/feed.xml', title: 'LicitAlcázar · Licitaciones y Alertas de Contratación' }],
    },
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: SITE_URL,
    siteName: 'LicitAlcázar',
    locale: 'es_ES',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: siteTitle,
    description: siteDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="scroll-smooth">
      <body className="antialiased bg-white text-slate-800 min-h-screen flex flex-col selection:bg-emerald-100 selection:text-emerald-950 relative">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <CommandPalette />
      </body>
    </html>
  );
}
