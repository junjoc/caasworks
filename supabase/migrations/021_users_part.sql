-- 2026-10-21 사용자 파트 (경영진·마케팅·세일즈·경영지원·하드웨어). 대시보드가 로그인 시 이 파트 화면으로 열린다.
-- 사용자 관리 화면에서 관리자가 지정. 비어 있으면 역할(admin/member/accountant)로 추측.
alter table public.users add column if not exists part text;
