-- 유입 성과: 문의 제출(GA fin-contact) · 매체 보고 전환 칸 (2026-10-22)
-- 매체 보고 전환 = 광고 매체가 회사명 없이 보고한 전환. 문의(CRM 리드 수)에 더하지 않고 따로 둔다 (마케팅팀 검토 #5)
alter table ad_performance add column if not exists inquiry_submits integer not null default 0;
alter table ad_performance add column if not exists media_conversions integer not null default 0;

-- 기존: 회사명 없이 적힌 문의 수(2026-03 네이버 광고 6건) → 매체 보고 전환으로 옮김
update ad_performance
   set media_conversions = inquiries, inquiries = 0
 where inquiries > 0 and (inquiry_companies is null or inquiry_companies = '');
