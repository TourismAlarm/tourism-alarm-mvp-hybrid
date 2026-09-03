-- Tourism Alarm — cola de señales con procedencia y revisión humana.
-- Aplicada al proyecto "Tourism alarm" (dsscahrsdwnsznyknkzb) el 2026-08-24.
--
-- Se versiona aquí para que el esquema no viva solo en el panel de Supabase:
-- si hay que recrear el proyecto, esto es la fuente de verdad.
--
-- Regla de oro: ninguna cifra llega al mapa sin que se sepa de dónde salió.
-- Se impone en el esquema, no por convenio.
--
-- El mapa público NO lee esta base de datos: lee un snapshot estático que se
-- publica con lo aprobado. Por eso no hay ninguna política de acceso anónimo.

create table public.sources (
  id           text primary key,
  name         text not null,
  homepage     text,
  method       text not null check (method in ('measured', 'derived', 'estimated')),
  trust        text not null default 'review' check (trust in ('review', 'auto')),
  enabled      boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now()
);

create table public.signals (
  id              uuid primary key default gen_random_uuid(),
  source_id       text not null references public.sources(id) on delete cascade,
  scope           text not null default 'municipality'
                    check (scope in ('municipality', 'brand', 'catalunya')),
  municipality_id text,
  scope_key       text,
  metric          text not null
                    check (metric in ('occupancy', 'event', 'traffic', 'beach_occupancy')),
  valid_for       date not null,
  value           numeric check (value is null or (value >= 0 and value <= 1)),
  payload         jsonb,
  method          text not null check (method in ('measured', 'derived', 'estimated')),
  source_url      text,
  observed_at     timestamptz not null,
  fetched_at      timestamptz not null default now(),
  baseline_value  numeric,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by     uuid references auth.users(id) on delete set null,
  reviewed_at     timestamptz,
  review_note     text,
  dedup_key       text not null,
  created_at      timestamptz not null default now(),

  constraint signals_need_provenance
    check (method = 'derived' or source_url is not null),
  constraint signals_scope_coherent check (
    (scope = 'municipality' and municipality_id is not null) or
    (scope = 'brand'        and scope_key is not null) or
    (scope = 'catalunya')
  ),
  constraint signals_unique_per_source unique (source_id, dedup_key)
);

create index signals_review_queue_idx on public.signals (status, valid_for desc);
create index signals_publish_idx      on public.signals (valid_for, status) where status = 'approved';
create index signals_municipality_idx on public.signals (municipality_id, valid_for);

create table public.agent_runs (
  id              uuid primary key default gen_random_uuid(),
  source_id       text references public.sources(id) on delete cascade,
  trigger         text not null default 'scheduled' check (trigger in ('scheduled', 'manual')),
  status          text not null default 'running' check (status in ('running', 'ok', 'error')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  signals_created integer not null default 0,
  error           text,
  log             text
);

create index agent_runs_recent_idx on public.agent_runs (started_at desc);

alter table public.sources    enable row level security;
alter table public.signals    enable row level security;
alter table public.agent_runs enable row level security;

create policy "sources: solo autenticados" on public.sources
  for all to authenticated using (true) with check (true);
create policy "signals: solo autenticados" on public.signals
  for all to authenticated using (true) with check (true);
create policy "agent_runs: solo autenticados" on public.agent_runs
  for all to authenticated using (true) with check (true);
