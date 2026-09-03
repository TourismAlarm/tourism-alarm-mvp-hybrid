#!/usr/bin/env node
// 🧪 Pruebas del publicador: qué llega al snapshot y qué se queda fuera.

import { mergeIntoSnapshot, slimSignal, horizonDays } from './publish-snapshot.js';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  ok ? passed++ : failed++;
};

const snapshot = {
  metadata: { version: '4.0' },
  municipalities: [
    { id: '439057', name: 'Salou' },
    { id: '80193', name: 'Barcelona' }
  ],
  signals: { as_of: null, days: {} }
};

const HOY = '2026-08-24';
const MANANA = '2026-08-25';

const signal = (over = {}) => ({
  id: 'uuid-1',
  source_id: 'ajuntament-salou',
  municipality_id: '439057',
  scope: 'municipality',
  metric: 'occupancy',
  valid_for: HOY,
  value: 0.42,
  method: 'measured',
  source_url: 'https://example.org/x',
  observed_at: '2026-08-24T09:00:00Z',
  dedup_key: 'k1',
  status: 'approved',
  reviewed_by: 'user-uuid',
  review_note: 'nota interna',
  baseline_value: 0.8,
  ...over
});

console.log('\n🧪 Publicación básica');
const basic = mergeIntoSnapshot(snapshot, [signal()], { days: [HOY, MANANA] });
check('la señal llega al día correcto', basic.snapshot.signals.days[HOY]?.length === 1);
check('cuenta las publicadas', basic.published === 1, `published = ${basic.published}`);
check('pone marca de tiempo', Boolean(basic.snapshot.signals.as_of));
check('no toca los municipios', basic.snapshot.municipalities.length === 2);

console.log('\n🧪 Lo interno no sale al mapa público');
const slim = slimSignal(signal());
check('no publica el revisor', slim.reviewed_by === undefined);
check('no publica la nota interna', slim.review_note === undefined);
check('no publica el id interno', slim.id === undefined);
check('no publica el estado', slim.status === undefined);
check('sí publica el enlace a la fuente', slim.source_url === 'https://example.org/x');
check('sí publica el valor', slim.value === 0.42);

console.log('\n🧪 Filtros');
const outside = mergeIntoSnapshot(snapshot, [signal({ valid_for: '2026-09-30' })], { days: [HOY, MANANA] });
check('descarta lo que cae fuera del horizonte', outside.published === 0);
check('y explica por qué', outside.skipped[0]?.reason === 'fuera del horizonte');

const unknown = mergeIntoSnapshot(snapshot, [signal({ municipality_id: '999999' })], { days: [HOY, MANANA] });
check('descarta municipios que no existen', unknown.published === 0);

console.log('\n🧪 Códigos con cero inicial');
const padded = mergeIntoSnapshot(snapshot, [signal({ municipality_id: '080193' })], { days: [HOY, MANANA] });
check('cruza 080193 con 80193', padded.published === 1, `published = ${padded.published}`);
check('y lo publica normalizado',
  padded.snapshot.signals.days[HOY][0].municipality_id === '80193');

console.log('\n🧪 Sin señales aprobadas');
const empty = mergeIntoSnapshot(snapshot, [], { days: [HOY, MANANA] });
check('as_of queda a null (solo modelo)', empty.snapshot.signals.as_of === null);
check('no publica nada', empty.published === 0);

console.log('\n🧪 Horizonte');
const days = horizonDays(2, new Date('2026-08-24T12:00:00'));
check('dos días consecutivos', days.length === 2 && days[0] === '2026-08-24' && days[1] === '2026-08-25',
  days.join(','));

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
