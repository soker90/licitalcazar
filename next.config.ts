import type { NextConfig } from "next";

const DB_TRACE = ['./data/licitaciones_alcazar.db'];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/': DB_TRACE,
    '/auditoria': DB_TRACE,
    '/seguimiento': DB_TRACE,
    '/discrepancias': DB_TRACE,
    '/organismos': DB_TRACE,
    '/organismos/*': DB_TRACE,
    '/analisis': DB_TRACE,
    '/empresas/*': DB_TRACE,
    '/licitaciones/*': DB_TRACE,
    '/api/**': DB_TRACE,
    '/rss.xml': DB_TRACE,
    '/feed.xml': DB_TRACE,
    '/sitemap.xml': DB_TRACE,
  },
};

export default nextConfig;
