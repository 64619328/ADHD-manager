create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null unique,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

alter table app_users
  add column if not exists auth_user_id uuid unique;

alter table tasks
  add column if not exists user_id uuid references app_users(id) on delete cascade;

alter table todo_items
  add column if not exists user_id uuid references app_users(id) on delete cascade;

alter table progress_records
  add column if not exists user_id uuid references app_users(id) on delete cascade;

create index if not exists idx_tasks_user_id on tasks(user_id);
create index if not exists idx_todo_items_user_id on todo_items(user_id);
create index if not exists idx_progress_records_user_id on progress_records(user_id);

update todo_items
set user_id = tasks.user_id
from tasks
where todo_items.task_id = tasks.id
  and todo_items.user_id is null
  and tasks.user_id is not null;

update progress_records
set user_id = tasks.user_id
from tasks
where progress_records.task_id = tasks.id
  and progress_records.user_id is null
  and tasks.user_id is not null;

-- 如果要把历史遗留任务归属到某个邮箱，先把下面的邮箱换成你的登录邮箱，再执行：
--
-- insert into app_users (email, auth_user_id)
-- values ('you@example.com', null)
-- on conflict (email) do nothing;
--
-- update tasks
-- set user_id = (select id from app_users where email = 'you@example.com')
-- where user_id is null;
--
-- update todo_items
-- set user_id = tasks.user_id
-- from tasks
-- where todo_items.task_id = tasks.id
--   and todo_items.user_id is null;
--
-- update progress_records
-- set user_id = tasks.user_id
-- from tasks
-- where progress_records.task_id = tasks.id
--   and progress_records.user_id is null;
