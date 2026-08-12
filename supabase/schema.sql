-- WBS 진행관리: Supabase SQL Editor에 이 파일 전체를 붙여넣고 "Run"을 누르면
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
  progress integer not null default 0 check (progress in (0,25,50,75,100)),
  created_at timestamptz not null default now()
);

-- 기존에 만들어둔 프로젝트에서 재실행할 때 progress 컬럼만 추가되도록.
alter table public.tasks add column if not exists progress integer not null default 0;
alter table public.tasks drop constraint if exists tasks_progress_check;
alter table public.tasks add constraint tasks_progress_check check (progress in (0,25,50,75,100));

alter table public.tasks enable row level security;

drop policy if exists "tasks_select_all" on public.tasks;
drop policy if exists "tasks_insert_all" on public.tasks;
drop policy if exists "tasks_update_all" on public.tasks;
drop policy if exists "tasks_delete_all" on public.tasks;

-- 팀 공유 계정으로 로그인한 사람만 접근 가능 (로그인 안 한 방문자는 전부 차단).
-- 팀 내부 서로간의 권한 구분은 없음 - 로그인한 사람은 다 동등하게 CRUD 가능.
create policy "tasks_select_auth" on public.tasks for select using (auth.role() = 'authenticated');
create policy "tasks_insert_auth" on public.tasks for insert with check (auth.role() = 'authenticated');
create policy "tasks_update_auth" on public.tasks for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "tasks_delete_auth" on public.tasks for delete using (auth.role() = 'authenticated');

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

create policy "posts_select_auth" on public.posts for select using (auth.role() = 'authenticated');
create policy "posts_insert_auth" on public.posts for insert with check (auth.role() = 'authenticated');
create policy "posts_update_auth" on public.posts for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "posts_delete_auth" on public.posts for delete using (auth.role() = 'authenticated');

-- 3) 첨부파일 저장 버킷 ---------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

drop policy if exists "attachments_read_all" on storage.objects;
drop policy if exists "attachments_insert_all" on storage.objects;
drop policy if exists "attachments_update_all" on storage.objects;
drop policy if exists "attachments_delete_all" on storage.objects;

create policy "attachments_read_auth" on storage.objects for select using (bucket_id = 'attachments' and auth.role() = 'authenticated');
create policy "attachments_insert_auth" on storage.objects for insert with check (bucket_id = 'attachments' and auth.role() = 'authenticated');
create policy "attachments_update_auth" on storage.objects for update using (bucket_id = 'attachments' and auth.role() = 'authenticated');
create policy "attachments_delete_auth" on storage.objects for delete using (bucket_id = 'attachments' and auth.role() = 'authenticated');

-- 4) WBS 대분류(관리자모드 카테고리) ---------------------------------------
create table if not exists public.wbs_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.wbs_categories enable row level security;

drop policy if exists "wbs_categories_select_auth" on public.wbs_categories;
drop policy if exists "wbs_categories_insert_auth" on public.wbs_categories;
drop policy if exists "wbs_categories_update_auth" on public.wbs_categories;
drop policy if exists "wbs_categories_delete_auth" on public.wbs_categories;

create policy "wbs_categories_select_auth" on public.wbs_categories for select using (auth.role() = 'authenticated');
create policy "wbs_categories_insert_auth" on public.wbs_categories for insert with check (auth.role() = 'authenticated');
create policy "wbs_categories_update_auth" on public.wbs_categories for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "wbs_categories_delete_auth" on public.wbs_categories for delete using (auth.role() = 'authenticated');

-- 5) WBS 항목 (관리자모드 전용 필드 + tasks 1:1 연결) -----------------------
-- 작업명/담당자/시작일/종료일/진행률/상태는 여기 저장하지 않고 항상 연결된
-- tasks 행에서 그대로 읽어온다 (단일 소스, 동기화 버그 자체가 발생할 수 없음).
create table if not exists public.wbs_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.tasks(id) on delete cascade,
  category_id uuid references public.wbs_categories(id) on delete set null,
  wbs_code text,
  support_members text,
  predecessor_ids uuid[] not null default '{}',
  completion_criteria text,
  risk_issue text,
  support_request text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.wbs_items enable row level security;

drop policy if exists "wbs_items_select_auth" on public.wbs_items;
drop policy if exists "wbs_items_insert_auth" on public.wbs_items;
drop policy if exists "wbs_items_update_auth" on public.wbs_items;
drop policy if exists "wbs_items_delete_auth" on public.wbs_items;

create policy "wbs_items_select_auth" on public.wbs_items for select using (auth.role() = 'authenticated');
create policy "wbs_items_insert_auth" on public.wbs_items for insert with check (auth.role() = 'authenticated');
create policy "wbs_items_update_auth" on public.wbs_items for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "wbs_items_delete_auth" on public.wbs_items for delete using (auth.role() = 'authenticated');
