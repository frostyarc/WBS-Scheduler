# WPS 진행관리

PLC / 전장 / 기구 / SCADA / 디지털트윈 5개 파트의 작업 일정, 진행률, 일별 보고서를
팀원들이 함께 읽고 쓰는 정적 웹앱. 빌드 도구 없음 — 브라우저가 그대로 실행하는
HTML/CSS/JS이고, 데이터는 Supabase(Postgres + Storage)에 저장한다.

## 구조

```
index.html            화면 마크업만 담당
css/styles.css         전체 스타일
js/config.js           Supabase 프로젝트 URL / anon key (배포 전 반드시 채울 것)
js/supabaseClient.js   config.js 값으로 Supabase 클라이언트 생성
js/data.js             Supabase 호출을 모아둔 데이터 접근 레이어 (CRUD + 첨부 업로드)
js/util.js             파트/상태 상수, 날짜 계산, D-day, escapeHtml, 토스트 등 공용 유틸
js/schedule.js         "일정등록" 탭: 등록/수정/삭제 폼 + 4가지 보기 모드(날짜·파트·멤버·상태)
js/monitor.js          "모니터링" 탭: 통계 타일 + 전체 진행률 도넛 + 파트별 바 차트
js/report.js           "일별보고서" 탭: 날짜 스트립 + 글 작성/수정/삭제 + 첨부파일
js/app.js              탭 전환, 초기 로딩, config 미설정 시 안내 배너
supabase/schema.sql    테이블 + RLS 정책 + 첨부파일 버킷 생성 스크립트 (SQL Editor에 붙여넣기)
```

화면(schedule/monitor/report.js)은 Supabase를 직접 호출하지 않고 항상 `data.js`를
거친다 — DB 스키마나 백엔드가 바뀌면 `data.js`만 고치면 된다.

## 권한 모델

로그인 없음. "이름" 필드는 작성자 표시용일 뿐이고, 누구나 모든 일정·게시글을
수정/삭제할 수 있다 (팀 내부 신뢰 기반 결정, 2026-08-11). 나중에 팀장 전용 기능이나
로그인이 필요해지면 `schema.sql`의 정책을 `auth.uid()` 기반으로 좁히고 Supabase Auth를
붙이는 식으로 확장하면 된다.

## 로컬에서 열어보기

`index.html`을 더블클릭해서 `file://`로 열면 모듈 스크립트(import)가 브라우저 보안
정책 때문에 동작하지 않는다. 로컬에서 확인하려면 폴더 안에서 간단한 서버를 띄워야
한다 (예: VS Code의 "Live Server" 확장, 또는 `npx serve`). 아니면 바로 Netlify에
배포해서 실제 URL로 확인해도 된다.

## 데이터 스키마

- `tasks`: title, part(plc/elec/mech/scada/dtwin), owner, status(ready/doing/done), start_date, end_date, description
- `posts`: post_date, title, author, time, content, attachment_url, attachment_name, drive_link, edited
