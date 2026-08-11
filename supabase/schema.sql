-- WPS 진행관리: Supabase SQL Editor에 이 파일 전체를 붙여넣고 "Run"을 누르면
-- 필요한 테이블, 접근 권한, 첨부파일 저장소가 한 번에 만들어집니다.
-- 여러 번 실행해도 안전하게 재실행되도록(idempotent) 작성했습니다.

create extension if not exists pgcrypto;

-- 1) 일정(작업) 테이블 ---------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  part text not null check (part in ('plc','elec','mech','scada','dtwin')),
  owner text not null,
  status text not null default 'ready' check (status in ('ready','doing','done')),
  start_date date not null,
  end_date date not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

drop policy if exists "tasks_select_all" on public.tasks;
drop policy if exists "tasks_insert_all" on public.tasks;
drop policy if exists "tasks_update_all" on public.tasks;
drop policy if exists "tasks_delete_all" on public.tasks;

-- 팀 내부용으로 로그인 없이 누구나 읽고 쓸 수 있게 열어둔 정책입니다.
-- (나중에 로그인을 붙이면 이 정책들을 auth.uid() 기반으로 좁힐 수 있습니다.)
create policy "tasks_select_all" on public.tasks for select using (true);
create policy "tasks_insert_all" on public.tasks for insert with check (true);
create policy "tasks_update_all" on public.tasks for update using (true) with check (true);
create policy "tasks_delete_all" on public.tasks for delete using (true);

-- 2) 일별 보고서(게시글) 테이블 -------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  post_date date not null,
  title text not null,
  author text not null,
  time text not null,
  content text not null,
  attachment_url text,
  attachment_name text,
  drive_link text,
  edited boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

drop policy if exists "posts_select_all" on public.posts;
drop policy if exists "posts_insert_all" on public.posts;
drop policy if exists "posts_update_all" on public.posts;
drop policy if exists "posts_delete_all" on public.posts;

create policy "posts_select_all" on public.posts for select using (true);
create policy "posts_insert_all" on public.posts for insert with check (true);
create policy "posts_update_all" on public.posts for update using (true) with check (true);
create policy "posts_delete_all" on public.posts for delete using (true);

-- 3) 첨부파일 저장 버킷 ---------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

drop policy if exists "attachments_read_all" on storage.objects;
drop policy if exists "attachments_insert_all" on storage.objects;
drop policy if exists "attachments_update_all" on storage.objects;
drop policy if exists "attachments_delete_all" on storage.objects;

create policy "attachments_read_all" on storage.objects for select using (bucket_id = 'attachments');
create policy "attachments_insert_all" on storage.objects for insert with check (bucket_id = 'attachments');
create policy "attachments_update_all" on storage.objects for update using (bucket_id = 'attachments');
create policy "attachments_delete_all" on storage.objects for delete using (bucket_id = 'attachments');
