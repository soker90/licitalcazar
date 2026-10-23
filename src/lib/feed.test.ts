import { describe, it, expect } from 'vitest';
import { escapeXml, toRfc822Date, getFeedItems, generateRssFeed } from './feed';
import { createGeneratedTestDb } from './test-db';
import { setDbForTests } from './db';

describe('RSS Feed - Utils', () => {
  it('escapa caracteres XML correctamente', () => {
    expect(escapeXml('A & B < C > D "E" \'F\'')).toBe(
      'A &amp; B &lt; C &gt; D &quot;E&quot; &apos;F&apos;'
    );
    expect(escapeXml(null)).toBe('');
  });

  it('formatea fechas a estándar RFC 822', () => {
    const formatted = toRfc822Date('2026-09-07T12:00:00Z');
    expect(formatted).toContain('2026');
    expect(formatted).toContain('GMT');
  });
});

describe('RSS Feed - Generación', () => {
  it('aplica el ámbito al feed y reconoce estados abiertos canónicos', () => {
    const db = createGeneratedTestDb(20261023, 2);
    db.prepare(`UPDATE contracts SET status = 'Published', publication_date = '2025-01-01',
      scope = 'Directa Municipal', object_description = 'Convocatoria directa'
      WHERE id = 'generated-20261023-1'`).run();
    db.prepare(`UPDATE contracts SET status = 'Publicada', publication_date = '2025-01-01',
      scope = 'Indirecta (Mancomunidad)', object_description = 'Convocatoria indirecta'
      WHERE id = 'generated-20261023-2'`).run();
    setDbForTests(db);

    try {
      const items = getFeedItems('directa');
      expect(items).toHaveLength(1);
      expect(items[0]?.link).toContain('generated-20261023-1');
    } finally {
      setDbForTests(null);
      db.close();
    }
  });

  it('obtiene elementos de sindicación válidos de la base de datos', () => {
    const items = getFeedItems();
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);

    const first = items[0];
    expect(first).toHaveProperty('title');
    expect(first).toHaveProperty('link');
    expect(first).toHaveProperty('guid');
    expect(first).toHaveProperty('pubDate');
    expect(first).toHaveProperty('description');
  });

  it('genera un documento XML RSS 2.0 bien formado con URL de producción y slugs limpios', () => {
    const xml = generateRssFeed();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">');
    expect(xml).toContain('<channel>');
    expect(xml).toContain('<title>LicitAlcázar · Licitaciones y Alertas');
    expect(xml).toContain('https://licitalcazar.vercel.app');
    expect(xml).not.toContain('localhost:3000');
    expect(xml).not.toContain('licitalcazar.es');
    expect(xml).not.toContain('/licitaciones/https%3A');
    expect(xml).toContain('<item>');
    expect(xml).toContain('</channel>');
    expect(xml).toContain('</rss>');
  });

  it('soporta filtrado por ámbito', () => {
    const xmlDirecta = generateRssFeed({ ambito: 'directa' });
    expect(xmlDirecta).toContain('directa');
  });
});
