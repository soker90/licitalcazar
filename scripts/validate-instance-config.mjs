#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const instanceRoot = path.resolve(process.env.ADJUDICA_INSTANCE_ROOT || path.join(process.cwd(), '..'));
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(instanceRoot, relativePath), 'utf8'));

const site = readJson('site.config.json');
const authoritiesConfig = readJson('data/contracting-authorities.json');
const historical = readJson('data/historical-sources.json');

assert.equal(site.siteName, 'LicitAlcázar', 'siteName must identify the LicitAlcázar instance');
assert.equal(site.localityName, 'Alcázar de San Juan', 'localityName must match the configured municipality');
assert.equal(site.siteUrl, 'https://licitalcazar.vercel.app', 'the canonical URL must remain the current production domain');
assert.equal(site.scopePresentation?.primary?.label, 'Solo Ayuntamiento');
assert.equal(site.scopePresentation?.associated?.label, 'Comsermancha (21 municipios)');
assert.equal(site.scopePresentation?.associated?.enabled, true);
assert.equal(site.scopePresentation?.all?.label, 'Total');
assert.ok(site.homePresentation?.primary && site.homePresentation?.associated && site.homePresentation?.all,
  'homepage copy must be configured for all three scopes');

const authorities = authoritiesConfig.contracting_authorities ?? [];
assert.equal(authorities.length, 10, 'the LicitAlcázar authority catalogue must contain 10 authorities');
assert.equal(authorities.filter((authority) => authority.scope === 'Directa Municipal').length, 8);
assert.equal(authorities.filter((authority) => authority.scope === 'Indirecta (Mancomunidad)').length, 2);
assert.ok(authorities.some((authority) => /COMSERMANCHA/i.test(authority.name)),
  'the associated authority catalogue must include COMSERMANCHA');

const sections = site.methodology?.sections ?? [];
assert.equal(sections.length, 20, 'the legacy methodology must retain all 20 sections');
const methodologyText = JSON.stringify(site.methodology);
for (const phrase of [
  'Versión 2.1 · Actualizado 2026',
  'art. 5.1.c RGPD',
  'art. 6.1.f RGPD',
  'antiguo art. 118.3',
  'convención analítica propia del portal',
  'STS núm. 1119/2025',
]) {
  assert.ok(methodologyText.includes(phrase), `methodology is missing: ${phrase}`);
}

assert.ok(Array.isArray(historical.periods) && historical.periods.length > 0,
  'historical coverage periods must be present');
assert.ok(Array.isArray(site.localSupplierNifs) && site.localSupplierNifs.length > 0,
  'the local supplier NIF catalogue must be configured');

console.log('Instance configuration validated: LicitAlcázar, 10 authorities, 3 scopes and 20 methodology sections.');
