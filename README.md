# WBS 진행관리

PLC / 전장 / 기구 / SCADA / 디지털트윈 5개 파트의 작업 일정, 진행률, 일별 보고서,
그리고 관리자모드(WBS 디테일 + 간트차트)를 팀원들이 함께 읽고 쓰는 정적 웹앱.
빌드 도구 없음 — 브라우저가 그대로 실행하는 HTML/CSS/JS이고, 데이터는
Supabase(Postgres + Storage + Auth)에 저장한다.

## 구조

```
index.html             화면 마크업만 담당 (접속 게이트 오버레이 포함)
css/styles.css          전체 스타일
js/config.js            Supabase URL/anon key, 공유 로그인 계정 이메일, 관리자모드 코드
js/supabaseClient.js    config.js 값으로 Supabase 클라이언트 생성
js/authGate.js          사이트 전체 접속 게이트 (Supabase Auth 로그인)
js/data.js              Supabase 호출을 모아둔 데이터 접근 레이어 (CRUD + 첨부 업로드 + WBS)
js/util.js              파트/상태/진행률 상수, 날짜·기간 계산, D-day, 공용 렌더러, 토스트
js/schedule.js          "일정등록" 탭: 등록/수정/삭제 폼 + 4가지 보기 모드
js/monitor.js           "모니터링" 탭: 통계 타일 + 도넛/바 차트 + 관리자모드 진입점
js/wbsAdmin.js          관리자모드 - WBS 디테일 (엑셀형 편집 그리드)
js/ganttAdmin.js        관리자모드 - 간트차트 (드래그로 일정 조정)
js/report.js            "일별보고서" 탭: 월 탐색 + 글 작성/수정/삭제 + 첨부파일
js/app.js               접속 게이트 → 탭 전환 → 각 화면 초기화 순서로 부트스트랩
supabase/schema.sql     테이블 + RLS 정책 + 첨부파일 버킷 생성 스크립트 (SQL Editor에 붙여넣기)
docs/conversation-log.md  지금까지의 기획/결정 히스토리
```

화면 쪽 코드는 Supabase를 직접 호출하지 않고 항상 `data.js`를 거친다 — DB 스키마나
백엔드가 바뀌면 `data.js`만 고치면 된다. `wbsAdmin.js`/`ganttAdmin.js`도 `tasks`
필드(작업명/담당자/시작일/종료일/상태/진행률)를 건드릴 땐 `data.js`의 `updateTask()`만
쓴다 — WBS 전용 필드(대분류/부지원/선행작업/완료조건/리스크이슈/지원요청)는
`wbs_items` 테이블에 따로 저장하고, `task_id`로 tasks 행을 1:1로 참조한다. 즉
"작업명/담당자/시작일/종료일/진행률/상태"는 두 곳에 복사돼 있는 게 아니라 **애초에
tasks에만 존재하는 값을 WBS 화면에서 그대로 읽어오는 것** — 동기화가 아니라 원천이
하나라서 동기화 버그가 날 수가 없는 구조다.

## 접속 체계 (2026-08-12부터)

이 사이트는 **퍼블릭 링크라서 URL만 알면 누구나 접속할 수 있는데, DB가 훼손되면 안
된다**는 요구 때문에, 접속 코드 입력창 하나로 "일반 사용자/관리자"를 바로 구분한다.
Netlify에 배포해도 동일하게 동작한다 (호스팅 위치와 무관한 클라이언트 로직).

- **일반 코드 `0811`** 입력 → 로그인만 되고 관리자모드는 잠긴 채로 시작.
- **관리자 코드 `0812`** 입력 → 로그인과 동시에 관리자모드(WBS 디테일/간트차트)까지 자동으로 열림.
  (일반으로 들어온 뒤에도 모니터링 탭의 "관리자모드" 버튼에 같은 코드를 입력하면 나중에 전환 가능.)

두 코드 다 실제 **Supabase Auth 로그인**으로 처리된다 — 화면만 가리는 게 아니라서,
로그인 안 한 상태로 API를 직접 두드려도(anon key를 알아내도) RLS가 막는다. 관리자
코드 쪽은 그 위에 클라이언트에서 한 번 더 확인하는 소프트 게이트가 얹혀 있을 뿐 —
"팀원이 실수로 WBS/간트차트를 건드리지 않게"가 목적이고 진짜 방어는 로그인에서 끝났다.

### Supabase 쪽에서 한 번만 할 일: 공유 로그인 계정 2개 만들기

**일반 계정**
1. Supabase 대시보드 → **Authentication → Users → Add user**
2. Email: `js/config.js`의 `SHARED_AUTH_EMAIL` 값과 **똑같이** (기본값 `team@wps-scheduler.local`)
3. Password: `0811`
4. **Auto Confirm User** 체크박스를 켜고 저장 (꺼두면 이메일 인증 대기 때문에 로그인이 안 됨)

**관리자 계정** — 위와 똑같이 한 번 더:
1. Email: `js/config.js`의 `ADMIN_AUTH_EMAIL` 값과 똑같이 (기본값 `admin@wps-scheduler.local`)
2. Password: `0812`
3. **Auto Confirm User** 체크 필수

코드를 바꾸고 싶으면 각 계정 비밀번호를 대시보드에서 바꾸면 그게 곧 새 코드가 된다.
모니터링 탭의 수동 "관리자모드" 버튼이 쓰는 코드는 `js/config.js`의 `ADMIN_CODE`
값이니, 관리자 계정 비밀번호를 바꾸면 이 값도 같이 맞춰줄 것.

### schema.sql 재실행 필요

기존에 이미 schema.sql을 한 번 돌려놨어도, **다시 SQL Editor에 붙여넣고 Run 해야
한다** — `tasks.progress` 컬럼, `wbs_categories`/`wbs_items` 테이블, 그리고
로그인을 요구하도록 바뀐 RLS 정책이 이번에 추가됐다. 재실행해도 안전하게
idempotent하게 작성되어 있다.

## 로컬에서 열어보기

`index.html`을 더블클릭해서 `file://`로 열면 모듈 스크립트(import)가 브라우저 보안
정책 때문에 동작하지 않는다. 로컬에서 확인하려면 폴더 안에서 간단한 서버를 띄워야
한다 (예: VS Code의 "Live Server" 확장, 또는 `npx serve`). 아니면 바로 Netlify에
배포해서 실제 URL로 확인해도 된다.

## 데이터 스키마

- `tasks`: title, part(plc/elec/mech/scada/dtwin), owner, status(ready/doing/done), start_date, end_date, description, **progress(0/25/50/75/100)**
- `posts`: post_date, title, author, time, content, attachment_url, attachment_name, drive_link, edited
- `wbs_categories`: name, sort_order — 관리자모드에서 자유롭게 추가/이름변경/삭제/순서변경
- `wbs_items`: task_id(**tasks와 1:1, unique**), category_id, wbs_code, support_members(부/지원),
  predecessor_ids(다른 wbs_items.id 배열), completion_criteria, risk_issue, support_request, sort_order.
  작업명/담당자/시작일/종료일/상태/진행률은 이 테이블에 없음 — 항상 연결된 tasks 행에서 읽는다.
  WBS 항목을 삭제하면 연결된 task도 함께 삭제된다 (그 반대도 마찬가지, `on delete cascade`).
