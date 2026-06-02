-- Run this in Supabase SQL editor

create table profiles (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  name text,
  initials text,
  gemellaggio integer default 0,
  gemellaggio_potential integer default 0,
  profile_json jsonb,
  system_prompt text,
  word_count integer default 0,
  last_learned_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table chat_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  role text check (role in ('user', 'assistant')),
  content text,
  created_at timestamptz default now()
);

-- Index for fast chat retrieval
create index chat_history_profile_id_idx on chat_history(profile_id, created_at);
create index profiles_session_id_idx on profiles(session_id);
