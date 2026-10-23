import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

describe('Next.js function file tracing', () => {
  it('includes the SQLite database only in routes that need it', () => {
    const includes = nextConfig.outputFileTracingIncludes ?? {};
    const dbRoutes = [
      '/',
      '/auditoria',
      '/seguimiento',
      '/discrepancias',
      '/organismos',
      '/organismos/*',
      '/analisis',
      '/empresas/*',
      '/licitaciones/*',
      '/api/**',
      '/rss.xml',
      '/feed.xml',
      '/sitemap.xml',
    ];

    expect(includes).not.toHaveProperty('/*');
    expect(includes).not.toHaveProperty('/**');

    for (const route of dbRoutes) {
      expect(includes[route]).toEqual(['./data/licitaciones_alcazar.db']);
    }
  });
});
