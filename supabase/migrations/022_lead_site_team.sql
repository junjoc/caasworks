-- 2026-10-21 새 리드 등록 v4: 리드 = 회사 + (현장 또는 본사 팀)
-- 현장 문의면 site_name·site_region, 본사 문의면 contact_team. 첫 통화에서 모르면 비워 둔다.
alter table pipeline_leads
  add column if not exists site_name text,
  add column if not exists site_region text,
  add column if not exists contact_team text;

comment on column pipeline_leads.site_name is '현장명 (예: 평택 데이터센터 신축)';
comment on column pipeline_leads.site_region is '현장 지역 (예: 경기 평택)';
comment on column pipeline_leads.contact_team is '본사 문의일 때 팀 (예: 안전팀). 현장 안에서는 팀을 나누지 않음';
