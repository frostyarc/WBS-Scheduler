// Supabase 프로젝트 Settings > API 화면에서 값을 복사해 아래 두 줄만 채우면 됩니다.
// (service_role 키는 절대 여기 넣지 마세요 - anon / public 키만 사용합니다.)
export const SUPABASE_URL = "https://kktyiurnfctczvswkill.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrdHlpdXJuZmN0Y3p2c3draWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NTEwNzgsImV4cCI6MjEwMjAyNzA3OH0.j-ThRdwBTqJVcYV2gX2-bv2zPxCol9Do_nDc095L6-g";

export const ATTACHMENTS_BUCKET = "attachments";

// 사이트 전체 접근용 팀 공유 계정 (Supabase Authentication > Users에서 만든 계정의 이메일).
// 접속 코드 입력창에서 이 계정 비밀번호를 입력하면 "일반 사용자"로 들어간다.
export const SHARED_AUTH_EMAIL = "team@wps-scheduler.local";

// 관리자용 공유 계정 - 같은 접속 코드 입력창에서 이 계정 비밀번호를 입력하면
// 로그인과 동시에 관리자모드(WBS 디테일/간트차트)까지 자동으로 열린다.
export const ADMIN_AUTH_EMAIL = "admin@wps-scheduler.local";

// 모니터링 탭에서 수동으로 관리자모드를 켤 때 쓰는 코드 (위 ADMIN_AUTH_EMAIL 계정
// 비밀번호와 같은 값으로 맞춰두는 걸 권장). 서버 보안이 아니라 팀 내부용 소프트 게이트.
export const ADMIN_CODE = "0812";
