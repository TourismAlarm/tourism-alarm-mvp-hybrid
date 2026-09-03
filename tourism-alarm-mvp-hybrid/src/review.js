// 🔍 Cola de revisión — página privada.
//
// Nada de lo que recoge un agente llega al mapa público sin pasar por aquí.
// El objetivo no es solo mirar: es aprobar o rechazar con la fuente delante.
//
// Sobre la seguridad: esta página se sirve como cualquier otra, pero no enseña
// nada sin sesión. La clave que lleva el bundle es la publicable, que por sí
// sola no da acceso a ningún dato — las políticas RLS de Supabase exigen
// usuario autenticado en todas las tablas.

import { createClient } from '@supabase/supabase-js';
import './style.css';
import './review.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const el = id => document.getElementById(id);
const integer = new Intl.NumberFormat('es-ES');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  document.body.innerHTML =
    '<p style="padding:2rem;font-family:sans-serif">' +
    'Faltan <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. ' +
    'Copia <code>.env.example</code> a <code>.env</code> y vuelve a compilar.</p>';
  throw new Error('configuración de Supabase ausente');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const state = {
  municipalities: new Map(),
  pending: [],
  sources: [],
  runs: []
};

// ────────────────────────────────────────────────────────────── utilidades ─

function timeAgo(iso) {
  if (!iso) return '—';
  const minutes = (Date.now() - new Date(iso).getTime()) / 60000;
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${Math.round(minutes)} min`;
  if (minutes < 1440) return `hace ${Math.round(minutes / 60)} h`;
  return `hace ${Math.round(minutes / 1440)} d`;
}

function municipalityName(id) {
  if (!id) return 'Catalunya';
  const key = String(id).replace(/^0+/, '');
  return state.municipalities.get(key) || `Municipio ${id}`;
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g,
    ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function showStatus(message, kind = 'info') {
  const box = el('review-status');
  if (!message) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.dataset.kind = kind;
  box.textContent = message;
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// ───────────────────────────────────────────────────────────────── datos ───

async function loadMunicipalities() {
  try {
    const response = await fetch('/data/current.json');
    if (!response.ok) return;
    const data = await response.json();
    for (const m of data.municipalities || []) {
      state.municipalities.set(String(m.id).replace(/^0+/, ''), m.name);
    }
  } catch {
    // Solo sirve para poner nombres bonitos; sin esto se ven los códigos.
  }
}

async function loadAll() {
  showStatus('Cargando…');

  const [pending, sources, runs] = await Promise.all([
    supabase.from('signals').select('*').eq('status', 'pending')
      .order('valid_for', { ascending: true }).order('observed_at', { ascending: false }),
    supabase.from('sources').select('*').order('id'),
    supabase.from('agent_runs').select('*').order('started_at', { ascending: false }).limit(15)
  ]);

  const failure = [pending, sources, runs].find(r => r.error);
  if (failure) {
    showStatus(`Error leyendo la base de datos: ${failure.error.message}`, 'error');
    return;
  }

  state.pending = pending.data ?? [];
  state.sources = sources.data ?? [];
  state.runs = runs.data ?? [];

  showStatus(null);
  render();
}

// ────────────────────────────────────────────────────────────── acciones ───

async function decide(ids, status) {
  if (!ids.length) return;

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('signals').update({
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: user?.id ?? null
  }).in('id', ids);

  if (error) {
    showStatus(`No se pudo guardar la decisión: ${error.message}`, 'error');
    return;
  }

  // Primero se recarga y DESPUÉS se avisa: al revés, el "Cargando…" de
  // loadAll() se comía el mensaje.
  await loadAll();
  showStatus(
    `${plural(ids.length, 'señal', 'señales')} ` +
    `${status === 'approved' ? 'aprobada' : 'rechazada'}${ids.length === 1 ? '' : 's'}. ` +
    'Para que lleguen al mapa: node scripts/publish-snapshot.js',
    'ok'
  );
}

async function requestRun(sourceId) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('run_requests')
    .insert({ source_id: sourceId, requested_by: user?.id ?? null });

  if (error) {
    showStatus(`No se pudo pedir la ejecución: ${error.message}`, 'error');
    return;
  }
  await loadAll();
  showStatus(`Ejecución pedida a "${sourceId}". El agente la recogerá en su próxima pasada.`, 'ok');
}

// ─────────────────────────────────────────────────────────────── pintado ───

function signalRow(signal) {
  const value = signal.value === null ? '—' : `${Math.round(signal.value * 100)}%`;
  const baseline = signal.baseline_value === null || signal.baseline_value === undefined
    ? null
    : Math.round(signal.baseline_value * 100);

  // Una desviación grande respecto al modelo no es un error, pero es
  // justo lo que conviene mirar con más atención.
  const deviation = baseline !== null && signal.value !== null
    ? Math.abs(signal.value * 100 - baseline)
    : 0;
  const flagged = deviation >= 30;

  const detail = signal.metric === 'event'
    ? escape(signal.payload?.name || 'Evento')
    : `${value}${baseline !== null ? ` <span class="muted">(modelo: ${baseline}%)</span>` : ''}`;

  return `
    <tr class="${flagged ? 'flagged' : ''}" data-id="${signal.id}">
      <td><input type="checkbox" class="pick" data-id="${signal.id}" checked /></td>
      <td>
        <strong>${escape(municipalityName(signal.municipality_id))}</strong>
        ${flagged ? '<span class="tag warn">se aleja del modelo</span>' : ''}
      </td>
      <td>${escape(signal.metric)}</td>
      <td>${detail}</td>
      <td><span class="tag ${signal.method}">${escape(signal.method)}</span></td>
      <td>${timeAgo(signal.observed_at)}</td>
      <td>
        ${signal.source_url
          ? `<a href="${escape(signal.source_url)}" target="_blank" rel="noopener">fuente ↗</a>`
          : '<span class="muted">derivada</span>'}
      </td>
    </tr>`;
}

function renderQueue() {
  const container = el('queue');

  if (!state.pending.length) {
    container.innerHTML =
      '<p class="empty">No hay nada pendiente. Todo lo que han traído los agentes está revisado.</p>';
    return;
  }

  // Agrupadas por fuente y día: es como se revisan de verdad.
  const groups = new Map();
  for (const signal of state.pending) {
    const key = `${signal.source_id}|${signal.valid_for}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(signal);
  }

  container.innerHTML = [...groups.entries()].map(([key, signals]) => {
    const [sourceId, day] = key.split('|');
    const values = signals.filter(s => s.value !== null).map(s => s.value);
    const withoutSource = signals.filter(s => !s.source_url && s.method !== 'derived').length;

    const summary = values.length
      ? `${plural(signals.length, 'señal', 'señales')} · ` +
        `valores ${Math.round(Math.min(...values) * 100)}–` +
        `${Math.round(Math.max(...values) * 100)}% · mediana ${Math.round(median(values) * 100)}%`
      : plural(signals.length, 'señal', 'señales');

    return `
      <article class="group" data-key="${escape(key)}">
        <header>
          <div>
            <h3>${escape(sourceId)}</h3>
            <p class="summary">${summary} · para el ${escape(day)}</p>
            ${withoutSource
              ? `<p class="summary alert">⚠️ ${plural(withoutSource, 'señal', 'señales')} sin enlace a la fuente</p>`
              : '<p class="summary ok">✓ todas con procedencia</p>'}
          </div>
          <div class="group-actions">
            <button type="button" class="approve" data-key="${escape(key)}">Aprobar seleccionadas</button>
            <button type="button" class="reject" data-key="${escape(key)}">Rechazar seleccionadas</button>
          </div>
        </header>
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" class="pick-all" data-key="${escape(key)}" checked /></th>
              <th>Municipio</th><th>Métrica</th><th>Valor</th>
              <th>Método</th><th>Observado</th><th>Fuente</th>
            </tr>
          </thead>
          <tbody>${signals.map(signalRow).join('')}</tbody>
        </table>
      </article>`;
  }).join('');
}

function renderSources() {
  el('sources').innerHTML = state.sources.map(source => `
    <div class="source ${source.enabled ? '' : 'disabled'}">
      <div>
        <strong>${escape(source.name)}</strong>
        <span class="tag ${source.method}">${escape(source.method)}</span>
        ${source.trust === 'review'
          ? '<span class="tag">pasa por revisión</span>'
          : '<span class="tag auto">publica sola</span>'}
        <p class="summary">${escape(source.notes || source.homepage || '')}</p>
      </div>
      <button type="button" class="run" data-source="${escape(source.id)}">Lanzar ahora</button>
    </div>
  `).join('') || '<p class="empty">No hay fuentes registradas.</p>';
}

function renderRuns() {
  el('runs').innerHTML = state.runs.map(run => {
    const duration = run.finished_at
      ? `${((new Date(run.finished_at) - new Date(run.started_at)) / 1000).toFixed(1)}s`
      : 'en curso';
    return `
      <div class="run ${run.status}">
        <span class="dot"></span>
        <strong>${escape(run.source_id || '—')}</strong>
        <span class="muted">${timeAgo(run.started_at)} · ${duration} · ${run.trigger}</span>
        <span>${integer.format(run.signals_created)} señales</span>
        ${run.error ? `<span class="err">${escape(run.error)}</span>` : ''}
      </div>`;
  }).join('') || '<p class="empty">Ningún agente ha corrido todavía.</p>';
}

function render() {
  const days = new Set(state.pending.map(s => s.valid_for));
  el('review-sub').textContent = state.pending.length
    ? `${plural(state.pending.length, 'señal pendiente', 'señales pendientes')} ` +
      `de ${plural(days.size, 'día', 'días')}`
    : 'Nada pendiente';

  renderQueue();
  renderSources();
  renderRuns();
}

// ──────────────────────────────────────────────────────────── interacción ──

function pickedIds(key) {
  const group = document.querySelector(`.group[data-key="${CSS.escape(key)}"]`);
  return [...group.querySelectorAll('.pick:checked')].map(input => input.dataset.id);
}

document.addEventListener('click', event => {
  const approve = event.target.closest('.approve');
  if (approve) return decide(pickedIds(approve.dataset.key), 'approved');

  const reject = event.target.closest('.reject');
  if (reject) return decide(pickedIds(reject.dataset.key), 'rejected');

  const run = event.target.closest('.run[data-source]');
  if (run) return requestRun(run.dataset.source);
});

document.addEventListener('change', event => {
  const all = event.target.closest('.pick-all');
  if (!all) return;
  const group = document.querySelector(`.group[data-key="${CSS.escape(all.dataset.key)}"]`);
  group.querySelectorAll('.pick').forEach(input => { input.checked = all.checked; });
});

el('btn-reload').addEventListener('click', loadAll);

el('btn-logout').addEventListener('click', async () => {
  await supabase.auth.signOut();
  showSession(null);
});

el('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = el('login-button');
  button.disabled = true;
  el('login-error').textContent = '';

  const { error } = await supabase.auth.signInWithPassword({
    email: el('email').value.trim(),
    password: el('password').value
  });

  button.disabled = false;
  if (error) el('login-error').textContent = error.message;
});

// ────────────────────────────────────────────────────────────── arranque ───

function showSession(session) {
  const logged = Boolean(session);
  el('login').hidden = logged;
  el('review').hidden = !logged;
  if (logged) loadAll();
}

await loadMunicipalities();

const { data: { session } } = await supabase.auth.getSession();
showSession(session);

supabase.auth.onAuthStateChange((_event, next) => showSession(next));
