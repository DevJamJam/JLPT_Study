begin;

create table public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  max_members integer not null default 15 check (max_members = 15),
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  nickname_key text not null unique,
  emoji text not null check (emoji in (
    '🐰', '🐱', '🐶', '🐻', '🐼', '🐨', '🦊', '🐯', '🦁', '🐵',
    '🐸', '🐙', '🐳', '🐬', '🐧', '🐢', '🐟', '🐥', '🌸', '⭐'
  )),
  created_at timestamptz not null default now()
);

create table public.user_credentials (
  user_id uuid primary key references public.users on delete cascade,
  pin_hash text not null,
  salt text not null,
  hash_params jsonb not null,
  credential_version integer not null default 1 check (credential_version > 0),
  must_change_pin boolean not null default false
);

create table public.group_members (
  group_id uuid not null references public.study_groups,
  user_id uuid not null unique references public.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.signup_requests (
  request_id uuid primary key,
  user_id uuid not null references public.users on delete cascade,
  request_fingerprint text not null,
  created_at timestamptz not null default now()
);

create table public.sessions (
  token_hash text primary key,
  user_id uuid not null references public.users on delete cascade,
  expires_at timestamptz not null,
  mode text not null default 'normal' check (mode in ('normal', 'change_pin')),
  credential_version integer not null default 1 check (credential_version > 0),
  created_at timestamptz not null default now()
);

create table public.auth_attempts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('login', 'join', 'change_pin', 'admin_login')),
  nickname_hmac text not null,
  source_hmac text not null,
  reserved_at timestamptz not null default now(),
  outcome text not null default 'pending'
    check (outcome in ('pending', 'success', 'failure', 'system_error'))
);

create table public.auth_limits (
  key text primary key,
  window_started_at timestamptz not null,
  failures integer not null default 0 check (failures >= 0),
  blocked_until timestamptz
);

create table public.source_limits (
  key text primary key,
  window_started_at timestamptz not null,
  reserved_count integer not null default 0 check (reserved_count >= 0)
);

create table public.admin_accounts (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton = true),
  login_id text not null unique,
  password_hash text not null,
  salt text not null,
  hash_params jsonb not null,
  credential_version integer not null default 1 check (credential_version > 0),
  created_at timestamptz not null default now()
);

create table public.admin_sessions (
  token_hash text primary key,
  admin_id uuid not null references public.admin_accounts on delete cascade,
  credential_version integer not null default 1 check (credential_version > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.study_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 20),
  name_key text not null unique,
  seed_key text unique,
  sort_order integer not null unique check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create table public.study_records (
  id uuid primary key,
  group_id uuid not null,
  user_id uuid not null,
  study_date date not null check (study_date >= date '2000-01-01'),
  minutes integer not null check (minutes between 1 and 1440),
  category_id uuid not null references public.study_categories on delete restrict,
  start_time time,
  quantity integer check (quantity between 1 and 99999),
  quantity_unit text check (quantity_unit in ('item', 'page', 'question')),
  memo text check (char_length(memo) <= 500),
  version integer not null default 1 check (version > 0),
  create_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (group_id, user_id) references public.group_members on delete cascade,
  check ((quantity is null) = (quantity_unit is null))
);
alter table public.study_records add check (
  start_time is null or (start_time < time '24:00' and extract(second from start_time) = 0)
);

create table public.record_requests (
  id uuid primary key,
  user_id uuid not null references public.users on delete cascade,
  fingerprint text not null,
  record_id uuid references public.study_records on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.admin_reset_requests (
  request_id uuid primary key,
  actor_admin_id uuid not null references public.admin_accounts on delete cascade,
  target_user_id uuid not null references public.users on delete cascade,
  fingerprint text not null,
  completed_at timestamptz not null default now()
);

create index on public.study_records (group_id, study_date, user_id);
create index on public.study_records (
  user_id, study_date desc, start_time asc nulls last, created_at asc, id asc
);
create index on public.sessions (expires_at);
create index on public.admin_sessions (expires_at);
create index on public.auth_attempts (nickname_hmac, reserved_at);
create index on public.auth_attempts (source_hmac, reserved_at);
create index on public.record_requests (user_id);

-- Supabase의 기존 역할을 사용한다. 이 마이그레이션에서 역할을 만들지 않는다.
-- 브라우저의 테이블 직접 접근을 막고 서버 역할에만 권한을 준다.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'study_groups', 'users', 'user_credentials', 'group_members', 'signup_requests',
    'sessions', 'auth_attempts', 'auth_limits', 'source_limits', 'admin_accounts',
    'admin_sessions', 'study_categories', 'study_records', 'record_requests',
    'admin_reset_requests'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end;
$$;

commit;
