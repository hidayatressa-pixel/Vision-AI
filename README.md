# Vision Station

Industrial vision inspection station for **Reflector Assy HL GJRA**.

The application is designed for a fixed camera station where each workpiece is located, aligned against a configured master, inspected at eight screw positions, and classified deterministically as **OK**, **NG**, or **ERROR**.

## Core workflow

1. **Master Setup** — Engineering uploads one approved master image, configures four alignment anchors, eight screw inspection ROIs, tolerances, and exactly six close-up reference images.
2. **Part Detection** — The camera monitors the configured detection zone and waits for the workpiece to settle.
3. **Alignment** — Fiducial anchors determine translation, rotation, scale, and residual error before inspection.
4. **Inspection** — Each of the eight required screw locations is checked for presence, confidence, and position tolerance. Unexpected screw-like objects are also screened.
5. **Rule Engine** — The configured master remains authoritative. Alignment failures are reported as system errors; part defects produce NG.
6. **Re-arm** — After a judgement, the station waits for removal or a meaningful replacement/repositioning change before allowing another inspection.
7. **History** — Inspection results are stored in the shared Supabase cloud database so every station/device can see the same history.

## Cloud history setup

History is now cloud-first. The browser no longer stores inspection history in IndexedDB or uses a local sync queue.

The application uses the Supabase REST Data API with the browser-safe **publishable key**. Supabase recommends exposing only the required tables/functions and protecting them with Row Level Security (RLS). urlSupabase JavaScript installation docshttps://supabase.com/docs/reference/javascript/installing

Create a Supabase project, then run this SQL in its SQL Editor:

```sql
create table if not exists public.inspection_history (
  id text primary key,
  timestamp timestamptz not null,
  product_id text not null,
  product_code text not null,
  product_name text not null,
  master_id text not null,
  master_revision_id text not null,
  master_revision_code text not null,
  judgement text not null check (judgement in ('OK', 'NG', 'ERROR')),
  expected_count integer not null,
  detected_count integer not null,
  defects jsonb not null default '[]'::jsonb,
  primary_reason text not null default '',
  metrics jsonb not null default '{}'::jsonb,
  alignment jsonb not null default '{}'::jsonb,
  roi_results jsonb not null default '[]'::jsonb,
  extra_objects jsonb not null default '[]'::jsonb,
  thumbnail_base64 text,
  device_id text not null,
  operator_id text,
  sequence_number bigint,
  plc_interlock_state text,
  plc_comm_latency_ms numeric,
  plc_timeline jsonb,
  created_at timestamptz not null default now()
);

create index if not exists inspection_history_timestamp_idx
  on public.inspection_history (timestamp desc);
create index if not exists inspection_history_product_idx
  on public.inspection_history (product_id);
create index if not exists inspection_history_judgement_idx
  on public.inspection_history (judgement);
create index if not exists inspection_history_device_idx
  on public.inspection_history (device_id);

alter table public.inspection_history enable row level security;

drop policy if exists "inspection_history_select" on public.inspection_history;
drop policy if exists "inspection_history_insert" on public.inspection_history;
drop policy if exists "inspection_history_update" on public.inspection_history;
drop policy if exists "inspection_history_delete" on public.inspection_history;

create policy "inspection_history_select"
  on public.inspection_history for select to anon, authenticated using (true);
create policy "inspection_history_insert"
  on public.inspection_history for insert to anon, authenticated with check (true);
create policy "inspection_history_update"
  on public.inspection_history for update to anon, authenticated using (true) with check (true);
create policy "inspection_history_delete"
  on public.inspection_history for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.inspection_history to anon, authenticated;
```

For the current station version, this deliberately permits the publishable client to read/write the history table because the application does not yet have Supabase Auth. **Use this only on the controlled station network.** Before exposing the app publicly, add authentication and tighten the RLS policies.

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Do **not** put a Supabase secret/service-role key in the browser or commit it to GitHub. The browser should use only the publishable key with RLS enabled. urlSupabase API keys guidancehttps://supabase.com/docs/guides/getting-started/api-keys

The URL and publishable key can be copied from the Supabase project's Connect/API settings. urlSupabase React quickstarthttps://supabase.com/docs/guides/getting-started/quickstarts/reactjs

## Engineering configuration

Settings are protected by a local engineering password. The engineering area provides:

- Master and revision management
- Master image and reference-image upload
- Four-point fiducial alignment
- Eight required screw ROIs
- Position, confidence, rotation, and stabilization tolerances
- Camera selection and background calibration
- PLC protocol and interlock configuration
- Runtime diagnostics

The operator view is intentionally focused on the live camera inspection and final judgement.

## Hardware and integration

The station supports browser camera input and an engineering simulator for deterministic dry-runs. PLC communication is isolated behind an adapter so a real industrial gateway can be integrated without changing the inspection rule layer.

The browser is not a safety controller. Machine safety, guarding, and safety interlocks must remain implemented in the appropriate industrial control and safety hardware.

## Local development

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
npm run preview
```

## Commissioning checklist

Before line use:

- Configure the Supabase project and `.env.local` values.
- Upload the approved master image.
- Upload all six approved close-up reference images.
- Verify all four alignment anchors against the fixture.
- Verify all eight screw ROIs and their tolerances.
- Calibrate the empty background under production lighting.
- Validate OK, missing-screw, position-error, extra-object, alignment-error, and replacement-part scenarios using representative images.
- Verify an inspection written from one device is visible from a second device.
- Validate camera mounting, lighting, PLC handshake, and machine safety with the responsible engineering team.

## Project structure

- `src/vision` — alignment, presence, ROI inspection, OpenCV-assisted detection, and rule evaluation
- `src/hooks` — camera and inspection pipeline orchestration
- `src/components` — operator, engineering, settings, history, and integration interfaces
- `src/services` — cloud history persistence, master/runtime configuration, audio, and PLC adapters
- `public/master-images` — reserved for approved master assets supplied during commissioning

This repository intentionally contains no bundled production reference imagery until the approved master asset is committed during commissioning.
