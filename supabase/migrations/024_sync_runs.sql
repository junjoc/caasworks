-- 매출 시트 자동 동기화 실행 기록 (2026-10-22) — 결과 요약 + 바뀐 칸의 이전 값(되돌리기용)
create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                 -- revenue_sheet
  trigger text not null,              -- cron | button
  applied boolean not null default false,
  ok boolean not null default true,
  held boolean not null default false, -- 평소보다 큰 변경 → 반영 안 하고 멈춤
  ms integer,
  summary jsonb,
  backup jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sync_runs_kind_created on sync_runs (kind, created_at desc);
alter table sync_runs enable row level security;
