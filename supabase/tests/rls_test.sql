-- RLS + sync-guard assertions. Run by scripts/test-rls.sh after the migration.
\set ON_ERROR_STOP on
insert into auth.users values ('11111111-1111-4111-8111-111111111111', 'a@test'), ('22222222-2222-4222-8222-222222222222', 'b@test');

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
end $$;

create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- User A writes data
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
set role authenticated;
insert into public.accounts (id, user_id, name, starting_balance) values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Lucid 50K', 50000);
insert into public.trades (id, user_id, account_id, symbol, direction, contracts, entry_price, exit_price, updated_at)
  values ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'NQ', 'long', 1, 21000, 21010, '2026-11-20T10:00:00Z');
insert into public.attachments (id, user_id, trade_id, storage_path) values ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000001/x.jpg');
insert into public.day_reviews (id, user_id, status) values ('2026-11-20', '11111111-1111-4111-8111-111111111111', 'complete');
insert into public.user_settings (user_id) values ('11111111-1111-4111-8111-111111111111');
insert into storage.objects (bucket_id, name) values ('screenshots', '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000001/x.jpg');
select pg_temp.check((select count(*) from public.trades) = 1, 'owner sees own trade');

-- Last-write-wins: an older edit must not overwrite a newer one
update public.trades set notes = 'stale', updated_at = '2026-11-19T10:00:00Z' where id = 'bbbbbbbb-0000-4000-8000-000000000001';
select pg_temp.check((select notes from public.trades) is null, 'stale update ignored by sync guard');
update public.trades set notes = 'fresh', updated_at = '2026-11-21T10:00:00Z' where id = 'bbbbbbbb-0000-4000-8000-000000000001';
select pg_temp.check((select notes from public.trades) = 'fresh', 'newer update applied');
reset role;

-- User B: isolation
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
set role authenticated;
select pg_temp.check((select count(*) from public.trades) = 0, 'other user cannot read trades');
select pg_temp.check((select count(*) from public.accounts) = 0, 'other user cannot read accounts');
select pg_temp.check((select count(*) from public.attachments) = 0, 'other user cannot read attachments');
select pg_temp.check((select count(*) from public.day_reviews) = 0, 'other user cannot read day reviews');
select pg_temp.check((select count(*) from public.user_settings) = 0, 'other user cannot read settings');
select pg_temp.check((select count(*) from storage.objects) = 0, 'other user cannot list screenshots');
update public.trades set notes = 'hacked', updated_at = now() + interval '1 day';
delete from public.trades;
reset role;
select pg_temp.check((select notes from public.trades) = 'fresh', 'other user cannot update or delete trades');

set role authenticated;
do $$ begin
  insert into public.trades (id, user_id, symbol, direction) values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'ES', 'long');
  raise exception 'FAILED: spoofed insert accepted';
exception when insufficient_privilege then raise notice 'ok - cannot insert rows for another user';
end $$;
do $$ begin
  insert into public.trades (id, user_id, account_id, symbol, direction) values (gen_random_uuid(), '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-000000000001', 'ES', 'long');
  raise exception 'FAILED: foreign account accepted';
exception when insufficient_privilege then raise notice 'ok - cannot attach a trade to another user''s account';
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('screenshots', '11111111-1111-4111-8111-111111111111/evil.jpg');
  raise exception 'FAILED: wrote into another user folder';
exception when insufficient_privilege then raise notice 'ok - cannot upload into another user''s folder';
end $$;
do $$ begin
  perform * from public.reminder_log;
  raise exception 'FAILED: reminder_log readable';
exception when insufficient_privilege then raise notice 'ok - reminder_log is server-only';
end $$;
reset role;

-- anon has no access at all
set role anon;
do $$ begin
  perform * from public.trades;
  raise exception 'FAILED: anon can read trades';
exception when insufficient_privilege then raise notice 'ok - anon cannot read trades';
end $$;
reset role;
\! echo 'ALL RLS TESTS PASSED'
