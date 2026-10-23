import { getDb, parseScope } from './db';
import { getContractSlug } from './placsp';
import { formatCurrency } from './format';
import { SITE_URL } from './config';
import { inCourseContractStatusSql } from './contract-status-sql';

export function escapeXml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function toRfc822Date(dateStr?: string | null): string {
  if (!dateStr) return new Date().toUTCString();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

export interface FeedItem {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  description: string;
  category: string;
}

export function getFeedItems(scope?: string | null, siteUrl = 'https://licitalcazar.es'): FeedItem[] {
  const db = getDb();
  const filterScope = parseScope(scope);

  const licitacionesWhere: string[] = [`(${inCourseContractStatusSql('')} OR publication_date >= '2026-01-01')`];
  const licitacionesParams: any[] = [];

  if (filterScope) {
    licitacionesWhere.push('scope = ?');
    licitacionesParams.push(filterScope);
  }

  const licitacionesRows = db.prepare(`
    SELECT 
      id,
      case_number AS expediente,
      object_description AS objeto,
      contract_type AS tipo_contrato,
      procedure AS procedimiento,
      status AS estado,
      contracting_authority_name as organo,
      scope,
      amount_excl_vat AS amount_excl_vat,
      publication_date AS publication_date,
      deadline_date AS deadline_date,
      source_url AS url_placsp
    FROM contracts
    WHERE ${licitacionesWhere.join(' AND ')}
    ORDER BY publication_date DESC
    LIMIT 30
  `).all(...licitacionesParams) as any[];

  const items: FeedItem[] = [];

  for (const lic of licitacionesRows) {
    const slug = getContractSlug(lic.id);
    const internalUrl = `${siteUrl}/licitaciones/${slug}`;
    const importeTxt = lic.amount_excl_vat ? formatCurrency(lic.amount_excl_vat) : 'Importe no desglosado';
    const estadoTxt = lic.estado === 'Publicada' ? 'Plazo de Ofertas Abierto' : lic.estado;

    const title = `[${estadoTxt}] ${importeTxt} · ${lic.objeto}`;
    const desc = `
      <p><strong>Expediente:</strong> ${escapeXml(lic.expediente)}</p>
      <p><strong>Órgano:</strong> ${escapeXml(lic.organo)} (${escapeXml(lic.scope)})</p>
      <p><strong>Tipo:</strong> ${escapeXml(lic.tipo_contrato)} · <strong>Procedimiento:</strong> ${escapeXml(lic.procedimiento)}</p>
      <p><strong>Presupuesto Base:</strong> ${escapeXml(importeTxt)} (sin IVA)</p>
      ${lic.deadline_date ? `<p><strong>Fecha límite de presentación:</strong> ${escapeXml(lic.deadline_date)}</p>` : ''}
      <p><a href="${escapeXml(internalUrl)}">Ver ficha y cronometría en LicitAlcázar</a> | <a href="${escapeXml(lic.url_placsp)}">Pliegos en PLACSP</a></p>
    `.trim();

    items.push({
      title,
      link: internalUrl,
      guid: `licitacion-${slug}`,
      pubDate: toRfc822Date(lic.publication_date),
      description: desc,
      category: 'Licitación',
    });
  }

  // Alertas destacadas de severidad ALTA
  const alertasWhere: string[] = ["a.severity = 'ALTA'"];
  const alertasParams: any[] = [];

  if (filterScope) {
    alertasWhere.push(`EXISTS (
      SELECT 1 FROM alert_contracts ac2
      JOIN contracts l2 ON ac2.contract_id = l2.id
      WHERE ac2.alert_id = a.id AND l2.scope = ?
    )`);
    alertasParams.push(filterScope);
  }

  const alertasRows = db.prepare(`
    SELECT 
      a.id,
      a.type AS tipo,
      a.severity AS severidad,
      round(a.confidence, 1) as confianza_pct,
      a.title AS titulo,
      a.description AS descripcion,
      a.created_at AS fecha_creacion,
      group_concat(ac.contract_id, '; ') as contratos_asociados
    FROM alerts a
    LEFT JOIN alert_contracts ac ON a.id = ac.alert_id
    WHERE ${alertasWhere.join(' AND ')}
    GROUP BY a.id
    ORDER BY a.confidence DESC, a.created_at DESC
    LIMIT 15
  `).all(...alertasParams) as any[];

  for (const alt of alertasRows) {
    const internalUrl = `${siteUrl}/auditoria`;
    const title = `[Señal Analítica de Riesgo · Severidad ${alt.severidad}] ${alt.titulo}`;
    const desc = `
      <p><strong>Señal Analítica de Contratación (LCSP)</strong></p>
      <p><strong>Tipología:</strong> ${escapeXml(alt.tipo)}</p>
      <p><strong>Fiabilidad del dato:</strong> Contrastado en PLACSP</p>
      <p>${escapeXml(alt.descripcion)}</p>
      <p><a href="${escapeXml(internalUrl)}">Ver desglose de factores en el Centro de Análisis</a></p>
    `.trim();

    items.push({
      title,
      link: internalUrl,
      guid: `alerta-${alt.id}`,
      pubDate: toRfc822Date(alt.fecha_creacion),
      description: desc,
      category: 'Análisis Cívico',
    });
  }

  // Ordenar todos los items por fecha descendente
  return items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
}

export function generateRssFeed(options: { scope?: string | null; ambito?: string | null; siteUrl?: string } = {}): string {
  const siteUrl = options.siteUrl || SITE_URL;
  const scope = options.scope ?? options.ambito;
  const items = getFeedItems(scope, siteUrl);

  const feedTitle = scope
    ? `LicitAlcázar · Licitaciones y Alertas (${scope})`
    : 'LicitAlcázar · Licitaciones y Alertas de Contratación Pública';

  const feedDescription =
    'Sindicación cívica en tiempo real de licitaciones públicas, convocatorias abiertas y señales de auditoría en Alcázar de San Juan (Ciudad Real).';

  const feedLink = `${siteUrl}/feed.xml${scope ? `?scope=${scope}` : ''}`;
  const nowRfc822 = new Date().toUTCString();

  const itemsXml = items
    .map((item) => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <pubDate>${item.pubDate}</pubDate>
      <category>${escapeXml(item.category)}</category>
      <description><![CDATA[${item.description}]]></description>
    </item>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(feedTitle)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(feedDescription)}</description>
    <language>es-ES</language>
    <lastBuildDate>${nowRfc822}</lastBuildDate>
    <atom:link href="${escapeXml(feedLink)}" rel="self" type="application/rss+xml"/>
    ${itemsXml}
  </channel>
</rss>`.trim();
}
