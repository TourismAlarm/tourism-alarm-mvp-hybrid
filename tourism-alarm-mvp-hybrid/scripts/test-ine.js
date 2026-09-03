#!/usr/bin/env node
// 🧪 Pruebas de los lectores del INE, contra respuestas reales guardadas.
//
// Los ficheros de data/official/probe*/ son respuestas de verdad de la API,
// no invenciones: si el INE cambia el formato, estas pruebas fallan y se ve.

import { readFileSync, existsSync } from 'node:fs';

import {
  normalizeName, ineCodeOf, brandOfZone, occupancyByBrand,
  occupancyByMunicipality, buildMunicipalityIndex, blendByCapacity,
  readPopulationCsv, monthsCovered
} from './lib/ine.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}\n     ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message || 'valores distintos'}: ${a} ≠ ${e}`);
}

const json = path => JSON.parse(readFileSync(path, 'utf-8'));
const has = path => existsSync(path);

// ─────────────────────────────────────────────────────── nombres y códigos ─

console.log('\n🧪 Nombres y códigos');

test('el artículo pospuesto del INE y el antepuesto del IDESCAT coinciden', () => {
  equal(normalizeName("Hospitalet de Llobregat, L'"), normalizeName("l'Hospitalet de Llobregat"));
  equal(normalizeName('Vall de Boí, La'), normalizeName('la Vall de Boí'));
  equal(normalizeName('Ejido, El'), normalizeName('El Ejido'));
});

test('el artículo distingue: Granada no es la Granada', () => {
  // El INE tiene "Granada" (Andalucía) como punto turístico y Catalunya
  // tiene "la Granada" (Alt Penedès). Quitar el artículo las confundía y le
  // colgaba al pueblo la ocupación hotelera de la ciudad.
  assert(normalizeName('Granada') !== normalizeName('la Granada'), 'Granada ≠ la Granada');
  assert(normalizeName('Palmas de Gran Canaria, Las') !== normalizeName('Palmas de Gran Canaria'),
    'el artículo se conserva, no se descarta');
});

test('ignora acentos y puntuación', () => {
  equal(normalizeName('Castelló d’Empúries'), normalizeName("Castello d'Empuries"));
  equal(normalizeName('Vielha e Mijaran'), 'vielha e mijaran');
});

test('no confunde municipios distintos', () => {
  assert(normalizeName('Torroella de Montgrí') !== normalizeName('Torroella de Fluvià'),
    'Torroella de Montgrí y de Fluvià no pueden colapsar');
  assert(normalizeName('Sant Pere Pescador') !== normalizeName('Sant Pere de Ribes'), 'dos Sant Pere distintos');
});

test('el código IDESCAT de 6 dígitos da el del INE de 5', () => {
  equal(ineCodeOf('439057'), '43905');   // Salou
  equal(ineCodeOf('80193'), '08019');    // Barcelona, sin cero inicial
  equal(ineCodeOf('170950'), '17095');   // Lloret de Mar
});

test('las zonas del INE se corresponden con las marcas del IDESCAT', () => {
  equal(brandOfZone('Cataluña: Costa Barcelona 2026'), 'Costa Barcelona');
  equal(brandOfZone("Cataluña: Vall d'Aran"), "Val d'Aran");
  equal(brandOfZone('Cataluña: Cataluña Central'), 'Paisatges Barcelona');
  equal(brandOfZone('Cataluña: Paisatges Barcelona'), 'Paisatges Barcelona');
  equal(brandOfZone('Pirineus'), 'Pirineus');
  equal(brandOfZone('Andalucía: Costa Del Sol (Málaga)'), null);
});

test('descarta las definiciones caducadas de Costa Barcelona', () => {
  // Existen como zona, pero ya no se actualizan: no deben mapear a la marca
  // viva o taparían la buena.
  equal(brandOfZone('Cataluña: Costa  Barcelona 2015'), null);
  equal(brandOfZone('Cataluña: Costa Barcelona-Maresme'), null);
  equal(brandOfZone('Cataluña: Costa Del Garraf'), null);
});

// ───────────────────────────────────────────────── ocupación por zonas ─────

const ZONES = 'data/official/probe2/ine-zonas-2013.json';

if (has(ZONES)) {
  console.log('\n🧪 Ocupación por zona turística (INE 2013, hoteles)');
  const brands = occupancyByBrand(json(ZONES));

  test('reconoce las marcas de Catalunya con dato', () => {
    for (const brand of ['Barcelona', 'Costa Brava', 'Costa Daurada', 'Costa Barcelona',
      "Terres de l'Ebre", 'Terres de Lleida', "Val d'Aran", 'Pirineus']) {
      assert(brands.has(brand), `falta ${brand}`);
    }
  });

  test('las cifras son tanto por uno y verosímiles', () => {
    for (const [brand, { curve }] of brands) {
      for (const [month, value] of Object.entries(curve)) {
        assert(value > 0 && value <= 1, `${brand} mes ${month}: ${value} fuera de 0..1`);
      }
    }
  });

  test('Barcelona en julio ronda el 76% que publica el INE', () => {
    const july = brands.get('Barcelona').curve[7];
    assert(Math.abs(july - 0.7611) < 0.0001, `esperado 0.7611, obtenido ${july}`);
  });

  test('Costa Barcelona toma la definición de 2026, no las caducadas', () => {
    equal(brands.get('Costa Barcelona').zone, 'Cataluña: Costa Barcelona 2026');
    assert(Math.abs(brands.get('Costa Barcelona').curve[7] - 0.7889) < 0.0001, 'julio de Costa Barcelona');
  });

  test('no cuela ninguna zona de fuera de Catalunya', () => {
    for (const { zone } of brands.values()) {
      assert(/catalu|pirineus/i.test(zone), `zona ajena: ${zone}`);
    }
  });
}

// ────────────────────────────────────── ocupación por punto turístico ──────

const POINTS = 'data/official/probe/ine-datos-75198.json';
const CAMPINGS = 'data/official/probe/ine-datos-75196.json';
const CURRENT = 'public/data/current.json';

if (has(POINTS) && has(CURRENT)) {
  console.log('\n🧪 Ocupación por punto turístico (INE 75198, hoteles)');
  const municipalities = json(CURRENT).municipalities;
  const index = buildMunicipalityIndex(municipalities);
  const byId = new Map(municipalities.map(m => [String(m.id), m]));
  const found = occupancyByMunicipality(json(POINTS), index);

  test('resuelve los puntos turísticos catalanes a su municipio', () => {
    const names = [...found.keys()].map(id => byId.get(id)?.name).sort();
    for (const expected of ['Salou', 'Barcelona', 'Lloret de Mar', 'Sitges', 'Cambrils',
      'Castelldefels', 'Girona', 'Tarragona', 'Lleida', 'Vielha e Mijaran',
      'Naut Aran', "l'Hospitalet de Llobregat", 'la Vall de Boí']) {
      assert(names.includes(expected), `no resuelto: ${expected} (encontrados: ${names.join(', ')})`);
    }
  });

  test('resuelve exactamente los 13 puntos catalanes, ni uno más', () => {
    equal(found.size, 13, 'municipios resueltos');
  });

  test('Salou en julio coincide con el 82,6% del INE', () => {
    const salou = [...found.entries()].find(([id]) => byId.get(id)?.name === 'Salou')[1];
    assert(Math.abs(salou.curve[7] - 0.826) < 0.0001, `obtenido ${salou.curve[7]}`);
  });

  test('ningún punto de fuera de Catalunya se cuela como municipio', () => {
    for (const id of found.keys()) assert(byId.has(id), `id desconocido: ${id}`);
  });
}

if (has(CAMPINGS) && has(CURRENT)) {
  console.log('\n🧪 Ocupación por punto turístico (INE 75196, campings)');
  const municipalities = json(CURRENT).municipalities;
  const index = buildMunicipalityIndex(municipalities);
  const byId = new Map(municipalities.map(m => [String(m.id), m]));
  const found = occupancyByMunicipality(json(CAMPINGS), index);

  test('usa "grado de ocupación por parcelas", que es la unidad del camping', () => {
    assert(found.size >= 10, `solo ${found.size} municipios`);
    const names = [...found.keys()].map(id => byId.get(id)?.name);
    for (const expected of ['Blanes', 'Sant Pere Pescador', 'Torroella de Montgrí', 'Malgrat de Mar']) {
      assert(names.includes(expected), `falta ${expected} (${names.join(', ')})`);
    }
  });

  test('distingue Torroella de Montgrí de Torroella de Fluvià', () => {
    const names = [...found.keys()].map(id => byId.get(id)?.name);
    assert(names.includes('Torroella de Montgrí'), 'falta Montgrí');
    assert(!names.includes('Torroella de Fluvià'), 'Fluvià no es punto turístico del INE');
  });
}

// ──────────────────────────────────────────────────────────── mezcla ───────

console.log('\n🧪 Mezcla por capacidad');

test('un municipio de campings sigue la ocupación de los campings', () => {
  const curves = { hotel: { 7: 0.9 }, camping: { 7: 0.5 }, rural: {} };
  const blended = blendByCapacity(curves, { hotel: 0, camping: 1000, rural: 0 });
  equal(blended[7], 0.5);
});

test('con mezcla de plazas, pondera por plazas', () => {
  const curves = { hotel: { 7: 1 }, camping: { 7: 0 }, rural: {} };
  const blended = blendByCapacity(curves, { hotel: 750, camping: 250, rural: 0 });
  equal(blended[7], 0.75);
});

test('sin capacidad conocida cae a la curva hotelera', () => {
  const curves = { hotel: { 7: 0.42 }, camping: {}, rural: {} };
  equal(blendByCapacity(curves, { hotel: 0, camping: 0, rural: 0 })[7], 0.42);
});

test('el respaldo elige la curva que tiene datos, no la primera vacía', () => {
  // El INE solo publica turismo rural en Paisatges Barcelona. Con `||` a
  // secas se devolvía el objeto vacío de hoteles —que es truthy— y 36
  // municipios acababan en el proxy de pernoctaciones sin hacer falta.
  const curves = { hotel: {}, camping: {}, rural: { 7: 0.39 } };
  equal(blendByCapacity(curves, { hotel: 0, camping: 0, rural: 0 })[7], 0.39);
  equal(blendByCapacity(curves, { hotel: 28, camping: 0, rural: 0 })[7], 0.39,
    'un municipio con plazas de un tipo sin curva usa la que sí existe');
});

test('sin ninguna curva devuelve vacío, no basura', () => {
  equal(blendByCapacity({ hotel: {}, camping: {}, rural: {} }, { hotel: 10 }), {});
});

test('un mes sin dato en una curva no arrastra a las demás', () => {
  const curves = { hotel: { 7: 0.8 }, camping: { 8: 0.6 }, rural: {} };
  const blended = blendByCapacity(curves, { hotel: 100, camping: 100, rural: 0 });
  equal(blended[7], 0.8, 'julio solo tiene hotel');
  equal(blended[8], 0.6, 'agosto solo tiene camping');
});

// ─────────────────────────────────────────────────────────── población ─────

const POPULATION = 'data/official/probe/idescat-pmh-pub-csv.csv';

if (has(POPULATION)) {
  console.log('\n🧪 Padró municipal (IDESCAT)');
  const population = readPopulationCsv(readFileSync(POPULATION, 'utf-8'));

  test('lee los 947 municipios', () => {
    assert(population.size === 947, `leídos ${population.size}`);
  });

  test('las cifras conocidas cuadran', () => {
    equal(population.get('80193'), 1731649, 'Barcelona');
    equal(population.get('439057'), 31491, 'Salou');
    equal(population.get('170950'), 43000, 'Lloret de Mar');
  });

  test('el total se parece a la población de Catalunya', () => {
    const total = [...population.values()].reduce((a, b) => a + b, 0);
    assert(total > 7_800_000 && total < 8_600_000, `total ${total}`);
  });

  test('descarta las filas de totales y cabeceras', () => {
    for (const value of population.values()) assert(Number.isFinite(value) && value >= 0, 'valor inválido');
  });
}

// ────────────────────────────────────────────────────────────── final ──────

console.log(`\n${failed ? '❌' : '✅'} ${passed} correctas, ${failed} fallidas\n`);
process.exit(failed ? 1 : 0);
