import type { MetadataRoute } from 'next';
import { getDb, getContractingAuthorities, getEmpresasList } from '@/lib/db';
import { getContractSlug } from '@/lib/placsp';
import { SITE_URL } from '@/lib/config';
import { isPersonaFisicaNif, isOpaquePersonaFisicaId } from '@/lib/format';
import { getOpaqueEmpresaId } from '@/lib/corporate';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getDb();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/licitaciones`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/auditoria`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/seguimiento`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/datos`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/organismos`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/empresas`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/analisis`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/metodologia`, changeFrequency: 'monthly', priority: 0.5 },
  ];

  const contractingAuthorities = getContractingAuthorities() as { id: string; placsp_id: string | null }[];
  const contractingAuthorityRoutes: MetadataRoute.Sitemap = contractingAuthorities.map((o) => ({
    url: `${SITE_URL}/organismos/${encodeURIComponent(o.placsp_id || o.id)}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const empresaIds = new Set<string>();
  for (let page = 1; page <= 50; page++) {
    const { data } = getEmpresasList({ page, limit: 100 }) as { data: { id: string }[] };
    if (!data || data.length === 0) break;
    for (const e of data) {
      if (e.id) {
        const safeId = (isOpaquePersonaFisicaId(e.id) || isPersonaFisicaNif(e.id)) ? getOpaqueEmpresaId(e.id) : e.id;
        empresaIds.add(safeId);
      }
    }
    if (data.length < 100) break;
  }
  const empresaRoutes: MetadataRoute.Sitemap = Array.from(empresaIds).map((id) => ({
    url: `${SITE_URL}/empresas/${encodeURIComponent(id)}`,
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  const licitaciones = db.prepare(`
    SELECT id, coalesce(publication_date, award_date) as fecha
    FROM contracts
  `).all() as { id: string; fecha: string | null }[];

  const licitacionRoutes: MetadataRoute.Sitemap = licitaciones.map((l) => ({
    url: `${SITE_URL}/licitaciones/${getContractSlug(l.id)}`,
    lastModified: l.fecha ? new Date(l.fecha) : undefined,
    changeFrequency: 'monthly',
    priority: 0.4,
  }));

  return [...staticRoutes, ...contractingAuthorityRoutes, ...empresaRoutes, ...licitacionRoutes];
}
