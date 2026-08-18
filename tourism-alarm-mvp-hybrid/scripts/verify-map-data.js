#!/usr/bin/env node
// ✅ Verificación de los datos que consume el mapa.
//
// Comprueba lo que realmente rompía la aplicación: que cada polígono del
// TopoJSON encuentre su municipio en el JSON de datos. Antes solo casaban
// 4 de 947 y el mapa se pintaba entero con el color por defecto.
//
// Uso: npm run test:data

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as topojson from 'topojson-client';
import { normalizeId } from './lib/comarques.js';

const GEOJSON_PATH = 'public/geojson/cat-municipis.json';
const DATA_PATHS = ['public/data/current.json', 'public/data/last-good.json'];

const problems = [];
const warnings = [];

function check(condition, message) {
  if (condition) return true;
  problems.push(message);
  return false;
}

async function verifyFile(path, geoIds) {
  console.log(`\n📄 ${path}`);

  let data;
  try {
    data = JSON.parse(await readFile(resolve(path), 'utf-8'));
  } catch (error) {
    problems.push(`${path}: no se puede leer (${error.message})`);
    console.log('   ❌ no se puede leer');
    return;
  }

  if (!check(Array.isArray(data.municipalities), `${path}: falta el array "municipalities"`)) return;

  const municipalities = data.municipalities;
  console.log(`   municipios: ${municipalities.length}`);

  // 1. Identificadores únicos y sin entradas inventadas.
  const ids = municipalities.map(m => normalizeId(m.id));
  const unique = new Set(ids);
  check(unique.size === ids.length, `${path}: hay ${ids.length - unique.size} identificadores duplicados`);

  const synthetic = municipalities.filter(m => /_var\d+$/.test(String(m.id)) || /^Municipio /.test(String(m.name)));
  check(synthetic.length === 0, `${path}: ${synthetic.length} municipios sintéticos (p. ej. "${synthetic[0]?.name}")`);

  // 2. Cobertura: todos los polígonos deben tener datos.
  const missing = [...geoIds].filter(id => !unique.has(id));
  const coverage = ((geoIds.size - missing.length) / geoIds.size) * 100;
  console.log(`   cobertura del mapa: ${geoIds.size - missing.length}/${geoIds.size} (${coverage.toFixed(1)}%)`);
  check(missing.length === 0, `${path}: ${missing.length} polígonos sin datos (${missing.slice(0, 5).join(', ')}…)`);

  const extra = [...unique].filter(id => !geoIds.has(id));
  if (extra.length) {
    warnings.push(`${path}: ${extra.length} municipios que no existen en el TopoJSON (${extra.slice(0, 5).join(', ')}…)`);
  }

  // 3. Intensidades: presentes, en rango y con los 12 meses.
  const badIntensity = municipalities.filter(m => {
    const monthly = m.monthly_intensity;
    if (!monthly) return true;
    for (let month = 1; month <= 12; month++) {
      const value = monthly[month] ?? monthly[String(month)];
      if (typeof value !== 'number' || value < 0 || value > 1) return true;
    }
    return false;
  });
  check(badIntensity.length === 0, `${path}: ${badIntensity.length} municipios con intensidad mensual ausente o fuera de [0,1]`);

  // 4. Cordura: los destinos con más plazas deben salir arriba en agosto.
  const august = [...municipalities]
    .sort((a, b) => (b.monthly_intensity?.[8] ?? 0) - (a.monthly_intensity?.[8] ?? 0))
    .slice(0, 10)
    .map(m => m.name);

  console.log(`   top agosto: ${august.slice(0, 5).join(', ')}`);
  const expected = ['Salou', 'Barcelona', 'Lloret de Mar'];
  const found = expected.filter(name => august.includes(name));
  check(
    found.length === expected.length,
    `${path}: el top de agosto no incluye ${expected.filter(n => !found.includes(n)).join(', ')}`
  );

  // 5. Variación estacional real: agosto debe superar a enero en la costa.
  const salou = municipalities.find(m => m.name === 'Salou');
  if (salou?.monthly_intensity) {
    const jan = salou.monthly_intensity[1] ?? salou.monthly_intensity['1'];
    const aug = salou.monthly_intensity[8] ?? salou.monthly_intensity['8'];
    console.log(`   Salou: enero ${(jan * 100).toFixed(0)}% → agosto ${(aug * 100).toFixed(0)}%`);
    check(aug > jan, `${path}: Salou no muestra estacionalidad (enero ${jan}, agosto ${aug})`);
  }
}

async function main() {
  console.log('✅ Verificando los datos del mapa');

  const topo = JSON.parse(await readFile(resolve(GEOJSON_PATH), 'utf-8'));
  const objectName = Object.keys(topo.objects)[0];
  const collection = topojson.feature(topo, topo.objects[objectName]);
  const geoIds = new Set(collection.features.map(f => normalizeId(f.id)));

  console.log(`\n🗺️  TopoJSON: ${geoIds.size} municipios`);

  for (const path of DATA_PATHS) {
    await verifyFile(path, geoIds);
  }

  if (warnings.length) {
    console.log('\n⚠️  Avisos:');
    warnings.forEach(w => console.log(`   ${w}`));
  }

  if (problems.length) {
    console.log('\n❌ Problemas encontrados:');
    problems.forEach(p => console.log(`   ${p}`));
    process.exit(1);
  }

  console.log('\n✅ Todo correcto: el mapa tiene datos para los 947 municipios.');
}

main().catch(error => {
  console.error('❌ Error verificando los datos:', error);
  process.exit(1);
});
