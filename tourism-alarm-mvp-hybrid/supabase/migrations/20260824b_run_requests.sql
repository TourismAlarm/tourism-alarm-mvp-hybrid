-- Disparo manual desde la página privada.
--
-- La página vive en Vercel y los agentes en el PC de casa: no pueden hablarse
-- directamente. Esto es un buzón — la página deja la petición, el cron de
-- OpenClaw la recoge en su siguiente pasada y la marca como atendida.

create table public.run_requests (
  id           uuid primary key default gen_random_uuid(),
  source_id    text not null references public.sources(id) on delete cascade,
  requested_at timestamptz not null default now(),
  requested_by uuid references auth.users(id) on delete set null,
  status       text not null default 'pending'
                 check (status in ('pending', 'taken', 'done', 'failed')),
  taken_at     timestamptz,
  finished_at  timestamptz,
  run_id       uuid references public.agent_runs(id) on delete set null,
  note         text
);

create index run_requests_pending_idx on public.run_requests (status, requested_at)
  where status = 'pending';

alter table public.run_requests enable row level security;

create policy "run_requests: solo autenticados" on public.run_requests
  for all to authenticated using (true) with check (true);

-- Catálogo inicial de fuentes verificadas.
insert into public.sources (id, name, homepage, method, trust, enabled, notes) values
  ('open-meteo', 'Open-Meteo (previsión diaria)', 'https://open-meteo.com/',
   'measured', 'auto', true,
   'Previsión meteorológica. La consulta el navegador en vivo.'),
  ('idescat', 'IDESCAT — estadística oficial', 'https://www.idescat.cat/',
   'measured', 'auto', true,
   'Capacidad hotelera y pernoctaciones. Base del mapa, se actualiza con npm run data:build.')
on conflict (id) do nothing;
