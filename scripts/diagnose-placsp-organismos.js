#!/usr/bin/env node
/**
 * Diagnóstico de perfiles de contratación PLACSP.
 *
 * No modifica la BD. Recorre los ZIP disponibles y muestra las combinaciones
 * de nombre + ID_PLATAFORMA + NIF + DIR3 que aparecen realmente en la fuente.
 *
 * Uso:
 *   node scripts/diagnose-placsp-organismos.js
 *   node scripts/diagnose-placsp-organismos.js --year=2026
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAW_DIR = path.resolve(__dirname, '../data_raw');
const CONFIG_PATH = path.resolve(__dirname, '../data/contracting-authorities.json');
let TARGETS;

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadTargetConfig() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  // Discovery targets are intentionally broader than the currently verified
  // config. This diagnostic must be able to discover candidate PLACSP profiles
  // that are not yet represented in organismos.json.
  const discoveryNifs = [
    'P1300500D', // Ayuntamiento
    'A13157029', // Aguas de Alcázar
    'P6300505B', // Patronato Municipal de Cultura
    'P6300504E', // Instituto Municipal de Deportes
    'P1300031J', // COMSERMANCHA
    'Q4500146H', // GAI Alcázar (excluded candidate, kept only to verify exclusion)
  ];

  const discoveryNames = [
    'Ayuntamiento de Alcázar de San Juan',
    'Aguas de Alcázar',
    'Patronato Municipal de Cultura',
    'Instituto Municipal de Deportes',
    'Concejalía Delegada Área Régimen Interior del Ayuntamiento de Alcázar de San Juan',
    'Concejalía Delegada de Contratación del Ayuntamiento de Alcázar de San Juan',
    'Presidencia del Instituto Municipal de Deportes de Alcázar de San Juan',
    'Presidencia del Patronato Municipal de Cultura',
    'Dirección Gerencia de Aguas de Alcázar, Empresa Municipal S.A.U.',
    'Junta General de Aguas de Alcázar, Empresa Municipal S.A.U.',
    'Consejo de Administración de Aguas de Alcázar, Empresa Municipal S.A.U.',
    'Pleno del Ayuntamiento de Alcázar de San Juan',
    'Junta de Gobierno del Ayuntamiento de Alcázar de San Juan',
    'Presidencia de la Mancomunidad de Servicios COMSERMANCHA',
    'Pleno de la Mancomunidad de Servicios COMSERMANCHA',
    'Patronato de Integración Social y Medioambiental de COMSERMANCHA',
    'Presidencia de COMSERMANCHA',
    'Pleno de la Mancomunidad de Servicios COMSERMANCHA',
    'Gerencia de Atención Integrada de Alcázar de San Juan',
  ];

  return {
    nifs: new Set([
      ...(config.contracting_authorities || []).map(o => o.nif).filter(Boolean),
      ...discoveryNifs,
    ]),
    placspIds: new Set((config.contracting_authorities || []).map(o => o.placsp_id).filter(Boolean)),
    dir3s: new Set((config.contracting_authorities || []).map(o => o.dir3).filter(Boolean)),
    names: new Set([
      ...(config.contracting_authorities || []).flatMap(o => [o.name, ...(o.historical_names || [])]),
      ...discoveryNames,
    ].map(normalize).filter(Boolean)),
  };
}

function getYears() {
  const arg = process.argv.find(a => a.startsWith('--year='));
  if (!arg || arg.slice(7).toLowerCase() === 'all') {
    return ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018'];
  }
  return arg.slice(7).split(',').map(s => s.trim()).filter(Boolean);
}

function decode(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractProfilesFromEntry(xml, source, year) {
  const partyMatch = xml.match(/<cac-place-ext:LocatedContractingParty>([\s\S]*?)<\/cac-place-ext:LocatedContractingParty>/);
  if (!partyMatch) return null;
  const party = partyMatch[1];

  const ids = {};
  for (const match of party.matchAll(/<cbc:ID(?:\s+[^>]*)?\s+schemeName="([^"]+)"[^>]*>([^<]+)<\/cbc:ID>/g)) {
    ids[match[1]] = decode(match[2]).trim();
  }

  const name = party.match(/<cac:PartyName>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/);
  const normalizedName = normalize(name ? decode(name[1]).trim() : '');
  const isTarget = TARGETS.nifs.has(ids.NIF) || TARGETS.placspIds.has(ids.ID_PLATAFORMA) || TARGETS.dir3s.has(ids.DIR3) || TARGETS.names.has(normalizedName);
  if (!isTarget) return null;
  return {
    source,
    nombre: name ? decode(name[1]).trim() : '',
    nif: ids.NIF || '',
    placspId: ids.ID_PLATAFORMA || '',
    dir3: ids.DIR3 || '',
    ids,
    year,
  };
}

function scanZip(zipPath, source, year, profiles) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(zipPath)) return resolve();

    const proc = spawn('unzip', ['-p', zipPath]);
    let buffer = '';

    proc.stdout.on('data', chunk => {
      buffer += chunk.toString('utf8');
      let start;
      while ((start = buffer.search(/<entry(?:\s[^>]*)?>/)) !== -1) {
        const end = buffer.indexOf('</entry>', start);
        if (end === -1) {
          buffer = buffer.slice(start);
          break;
        }
        const entry = buffer.slice(start, end + 8);
        buffer = buffer.slice(end + 8);
        const profile = extractProfilesFromEntry(entry, source, year);
        if (profile) {
          const key = JSON.stringify([
            profile.nombre,
            profile.nif,
            profile.placspId,
            profile.dir3,
            profile.ids,
          ]);
          const current = profiles.get(key);
          if (current) {
            current.count += 1;
            current.years = [...new Set([...current.years, year])].sort();
            current.sources = [...new Set([...current.sources, source])].sort();
          } else {
            profiles.set(key, {
              ...profile,
              count: 1,
              years: [year],
              sources: [source],
            });
          }
        }
      }
    });

    proc.stderr.on('data', () => {});
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) reject(new Error(`unzip terminó con código ${code}: ${zipPath}`));
      else resolve();
    });
  });
}

async function main() {
  TARGETS = loadTargetConfig();
  const profiles = new Map();

  for (const year of getYears()) {
    await scanZip(
      path.join(RAW_DIR, `contratosMenores${year}.zip`),
      `contratosMenores${year}.zip`,
      year,
      profiles,
    );
    await scanZip(
      path.join(RAW_DIR, `licitaciones${year}.zip`),
      `licitaciones${year}.zip`,
      year,
      profiles,
    );
  }

  const rows = [...profiles.values()].sort((a, b) =>
    a.nif.localeCompare(b.nif) ||
    a.placspId.localeCompare(b.placspId) ||
    a.nombre.localeCompare(b.nombre)
  );

  console.log(JSON.stringify({
    years: getYears(),
    profiles: rows,
    uniquePlacspIds: [...new Set(rows.map(r => r.placspId).filter(Boolean))],
    missingPlacspId: rows.filter(r => !r.placspId),
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
