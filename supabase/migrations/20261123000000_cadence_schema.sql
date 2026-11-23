set client_min_messages = warning;

-- ═══════════════════════════════════════════════════════════════════════
-- CADENCE — database schema, row-level security and storage policies
-- Every user-owned row carries user_id; RLS restricts all access to the owner.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ───────── Sync helpers ─────────
-- server_updated_at: assigned by the server on every write → pull cursor for devices.
-- updated_at: client edit time → last-write-wins. Stale writes are ignored.
create or replace function public.cadence_sync_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return null; -- an older edit arrived late: keep the newer row
    end if;
    new.created_at := old.created_at;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

-- ───────── Accounts (Lucid Trading or any prop firm) ─────────
create table if not exists public.accounts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  firm text not null default 'Lucid Trading' check (char_length(firm) <= 120),
  plan text check (char_length(plan) <= 120),
  phase text not null default 'evaluation' check (phase in ('evaluation', 'funded', 'live', 'other')),
  size numeric(14, 2),
  starting_balance numeric(14, 2) not null default 0,
  balance_adjustment numeric(14, 2) not null default 0,
  status text not null default 'active' check (status in ('active', 'passed', 'payout', 'breached', 'inactive')),
  daily_loss_limit numeric(14, 2) check (daily_loss_limit is null or daily_loss_limit >= 0),
  max_drawdown numeric(14, 2) check (max_drawdown is null or max_drawdown >= 0),
  drawdown_type text not null default 'trailing_eod' check (drawdown_type in ('static', 'trailing_eod', 'trailing_intraday')),
  drawdown_lock numeric(14, 2),
  profit_target numeric(14, 2) check (profit_target is null or profit_target >= 0),
  payout_target numeric(14, 2) check (payout_target is null or payout_target >= 0),
  min_trading_days integer check (min_trading_days is null or min_trading_days >= 0),
  consistency_pct numeric(5, 2) check (consistency_pct is null or (consistency_pct > 0 and consistency_pct <= 100)),
  personal_daily_risk numeric(14, 2) check (personal_daily_risk is null or personal_daily_risk >= 0),
  personal_trade_risk numeric(14, 2) check (personal_trade_risk is null or personal_trade_risk >= 0),
  rules_source text not null default 'user' check (rules_source in ('user', 'verified')),
  rules_verified_at date,
  rules_reference text check (char_length(rules_reference) <= 500),
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- ───────── Trades ─────────
create table if not exists public.trades (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  symbol text not null check (char_length(symbol) between 1 and 16),
  contract text check (char_length(contract) <= 24),
  direction text not null check (direction in ('long', 'short')),
  contracts numeric(10, 2) not null default 1 check (contracts > 0 and contracts <= 10000),
  entry_price numeric(18, 8),
  exit_price numeric(18, 8),
  stop_loss numeric(18, 8),
  take_profit numeric(18, 8),
  entry_time timestamptz,
  exit_time timestamptz,
  commission numeric(12, 2) check (commission is null or commission >= 0),
  gross_pnl numeric(14, 2),
  net_pnl numeric(14, 2),
  risk_amount numeric(14, 2) check (risk_amount is null or risk_amount >= 0),
  session text,
  trading_day date,
  timeframe text check (char_length(timeframe) <= 12),
  setup text check (char_length(setup) <= 120),
  bias text check (bias in ('bullish', 'bearish', 'neutral')),
  market_structure text check (char_length(market_structure) <= 500),
  concepts text[] not null default '{}',
  tags text[] not null default '{}',
  notes text check (char_length(notes) <= 10000),
  journal jsonb,
  journal_completed_at timestamptz,
  ai_review jsonb,
  extraction jsonb,
  source text not null default 'manual' check (source in ('manual', 'ai', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint trades_exit_after_entry check (exit_time is null or entry_time is null or exit_time >= entry_time)
);

-- ───────── Screenshot attachments (files live in Storage bucket "screenshots") ─────────
create table if not exists public.attachments (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  storage_path text check (storage_path is null or storage_path like (user_id::text || '/%')),
  mime text not null default 'image/jpeg' check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  size integer not null default 0 check (size >= 0 and size <= 26214400),
  width integer,
  height integer,
  caption text check (char_length(caption) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- ───────── Day reviews ("no trades today" / "day complete") — id = local date ─────────
create table if not exists public.day_reviews (
  id text not null check (id ~ '^\d{4}-\d{2}-\d{2}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('no_trades', 'complete')),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- ───────── AI coach reports ─────────
create table if not exists public.ai_reports (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'coach' check (kind in ('coach')),
  period_from date,
  period_to date,
  trade_count integer not null default 0,
  model text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- ───────── Per-user settings ─────────
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  id text not null default 'settings' check (id = 'settings'),
  instruments jsonb not null default '[]',
  setups text[] not null default '{}',
  reminder jsonb not null default '{"enabled": true, "time": "20:30", "timezone": "UTC"}',
  default_account_id uuid,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- ───────── Web Push subscriptions (server-side only) ─────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failures integer not null default 0
);

-- ───────── Reminder bookkeeping (service role only — no client policies) ─────────
create table if not exists public.reminder_log (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_sent_day text not null,
  last_sent_at timestamptz not null default now()
);

-- ───────── Indexes ─────────
create index if not exists accounts_user_sync on public.accounts (user_id, server_updated_at);
create index if not exists trades_user_sync on public.trades (user_id, server_updated_at);
create index if not exists trades_user_day on public.trades (user_id, trading_day) where deleted_at is null;
create index if not exists trades_user_entry on public.trades (user_id, entry_time) where deleted_at is null;
create index if not exists trades_account on public.trades (account_id);
create index if not exists attachments_user_sync on public.attachments (user_id, server_updated_at);
create index if not exists attachments_trade on public.attachments (trade_id);
create index if not exists day_reviews_user_sync on public.day_reviews (user_id, server_updated_at);
create index if not exists ai_reports_user_sync on public.ai_reports (user_id, server_updated_at);
create index if not exists user_settings_sync on public.user_settings (user_id, server_updated_at);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

-- ───────── Triggers ─────────
do $$
declare t text;
begin
  foreach t in array array['accounts', 'trades', 'attachments', 'day_reviews', 'ai_reports', 'user_settings'] loop
    execute format('drop trigger if exists %I_sync_guard on public.%I', t, t);
    execute format('create trigger %I_sync_guard before insert or update on public.%I for each row execute function public.cadence_sync_guard()', t, t);
  end loop;
end $$;

-- A trade may only reference an account (and an attachment a trade) owned by the same user.
create or replace function public.cadence_check_trade_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.account_id and a.user_id = new.user_id
  ) then
    raise exception 'account does not belong to user' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.cadence_check_attachment_trade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.trades t where t.id = new.trade_id and t.user_id = new.user_id) then
    raise exception 'trade does not belong to user' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop function if exists public.cadence_check_ownership() cascade;
drop trigger if exists trades_ownership on public.trades;
create trigger trades_ownership before insert or update of account_id, user_id on public.trades
  for each row execute function public.cadence_check_trade_account();
drop trigger if exists attachments_ownership on public.attachments;
create trigger attachments_ownership before insert or update of trade_id, user_id on public.attachments
  for each row execute function public.cadence_check_attachment_trade();

-- ───────── Row-level security ─────────
alter table public.accounts enable row level security;
alter table public.trades enable row level security;
alter table public.attachments enable row level security;
alter table public.day_reviews enable row level security;
alter table public.ai_reports enable row level security;
alter table public.user_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_log enable row level security; -- intentionally no policies

do $$
declare t text;
begin
  foreach t in array array['accounts', 'trades', 'attachments', 'day_reviews', 'ai_reports', 'user_settings', 'push_subscriptions'] loop
    execute format('drop policy if exists "%s: owner select" on public.%I', t, t);
    execute format('drop policy if exists "%s: owner insert" on public.%I', t, t);
    execute format('drop policy if exists "%s: owner update" on public.%I', t, t);
    execute format('drop policy if exists "%s: owner delete" on public.%I', t, t);
    execute format('create policy "%s: owner select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s: owner insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s: owner update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s: owner delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t, t);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
revoke all on public.reminder_log from authenticated;

-- ───────── Storage: private screenshots bucket, one folder per user ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 26214400, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "screenshots: owner read" on storage.objects;
drop policy if exists "screenshots: owner insert" on storage.objects;
drop policy if exists "screenshots: owner update" on storage.objects;
drop policy if exists "screenshots: owner delete" on storage.objects;
create policy "screenshots: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "screenshots: owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "screenshots: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "screenshots: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
