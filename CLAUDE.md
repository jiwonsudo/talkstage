# Talkstage — 작업 메모 (Claude Code 용)

녹화 한 번으로 말 빠르기·쉼·톤·시선·자세·제스처·군더더기 말·내용 구조·시간을 분석해 코칭해 주는 **리허설 코칭 웹앱**.
사용자: 대학생, 취업 준비생, 직장인, 그리고 B2B(학교·회사 단체 요금제).

## 작업 규칙

- **답변은 한국어로.** UI 문구도 한국어, 부드러운 존댓말(~해요).
- 제품 용어는 **"리허설"**. "프레젠테이션"이라고 쓰지 않는다. ("발표"는 상황을 말할 때만.)
- 디자인: 밝은 배경, 원색(파랑·노랑·분홍·빨강·초록·주황·보라) 스퀴클 카드, 깔끔한 내비. **AI 느낌 나는 장식 금지**(보라 그라디언트 남발, 반짝이 이모지 등).
- 이 프로젝트는 **Next.js + TypeScript** 로 간다. 새 기능을 plain JS·전역 스크립트로 박지 말 것(이 때문에 한 번 전부 다시 짰음).
- 패키지 매니저는 **pnpm** (`packageManager` 고정). npm/yarn lockfile 만들지 말 것.
- 바꾼 뒤에는 `pnpm exec tsc --noEmit`, `pnpm lint`, 필요하면 `pnpm build` 까지 통과시킬 것.
- 비밀 값(`.env.local`, secret key)은 커밋·출력 금지. `SUPABASE_SECRET_KEY` 에 `NEXT_PUBLIC_` 붙이지 말 것.

## 스택

- Next.js 16 (App Router, Turbopack, 미들웨어 대신 `src/proxy.ts`), React 19, strict TypeScript
- 스타일: Tailwind 없음. `src/app/globals.css` 하나(예전 버전 CSS를 옮긴 것 + 아래쪽에 추가 규칙). 색은 `--blue` 같은 CSS 변수.
- Supabase: `@supabase/ssr` + `supabase-js`. publishable / secret 새 키 이름 사용(예전 anon / service_role 이름도 받음).
- MediaPipe Tasks Vision(`@mediapipe/tasks-vision`, wasm 은 jsdelivr CDN)으로 브라우저에서 자세·얼굴 분석. 음성은 Web Audio + Web Speech API.

## 실행

```bash
pnpm install
pnpm dev        # http://localhost:5180 (Supabase 리다이렉트와 맞추려고 5180 고정)
```

## 구조

- `src/app`
  - `/` 랜딩 — `page.tsx` 가 `components/landing/*` 섹션을 조립
  - `/rehearsal/new` 리허설 — `RehearsalEntry`(ssr:false) → `RehearsalFlow`: 마법사 → (대본 점검) → 녹화 → 리포트. `?purpose=&posture=&step=` 지원
  - `/me/rehearsals|account|plan|support` 내 정보 허브
  - `/auth/callback` OAuth 코드 교환, `/api/account` 계정 삭제(secret key, 서버 전용)
- `src/components`
  - `landing/` 서버 컴포넌트 섹션 + 작은 클라이언트 아일랜드(`HeroDial`, `Timeline`, `NvFrame`, `Plans`, `Reveal`, `actions.tsx`)
  - `auth/` `AuthProvider`(useAuth, requireAuth, 로그인 모달 상태), `AuthDialog`
  - `rehearsal/` `Wizard`, `ScriptCheck`, `Studio`(카메라·녹화), `Report`
  - `ui/` `BrandMark`(로고), `Picto`, `Toast`, `PatternArt`
- `src/lib`
  - `coach/` 분석 엔진: `audio`, `vision`, `analysis`(점수·문제 구간·하이라이트), `coach`(코칭 문구·근거), `script`(대본 분석·읽기), `timeline`, `media`
  - `rehearsal/draft.ts` 마법사 설정(localStorage `rc-setup-v2`) → `toSetup()`
  - `scenarios.ts` 발표 상황(interview, ir, report, lecture, conference, capstone, speech)·목표·기준값
  - `plans.ts` 요금제, `data/` Supabase 읽기·쓰기, `supabase/` 클라이언트 생성
- `supabase/migrations/` 0001 스키마+RLS, 0002 권한(GRANT). **둘 다 원격 프로젝트에 적용 완료.**
- `legacy/` 이전 plain JS 버전. 참고용, 빌드·lint 대상 아님.

## 제품 규칙(이미 구현됨, 바꿀 때 지킬 것)

- 리허설 시작은 로그인 필수 → 로그인 모달. 로그인 후 내비: "새 리허설 +" CTA + 메뉴(내 리허설 / 계정 관리 / 요금제 관리 / 지원 받기 / 로그아웃).
- 요금제: Opening 36크레딧(무료), Spotlight 240(월 9,900원), Headliner 600(월 19,900원), 대학·팀·기업 단체 요금제는 문의. 리허설 1회 = 12크레딧. 크레딧 = 이번 달 리허설 수로 계산.
- 목적·목표 직접 입력은 유료 플랜만, 정확도 경고 문구 표시.
- 목표는 목적별로 다르고 최대 3개. 권장 시간은 목적+목표에 따라 달라짐.
- 대본 단계: "대본이 없나요?"가 입력칸 위, 예시는 placeholder 로만, 지원 형식 `.txt · .md · .docx` 표시.
- 히어로 다이얼: 카드 부채꼴, 베젤과 동기화, 잡으면 멈춤, 넓은 화면에선 오른쪽.
- 로고: 네 조각으로 갈라진 말풍선 + 풍선 같은 광택(`ui/BrandMark.tsx`). 마우스를 올리면 조각이 벌어짐.

## 이미 겪은 함정

- **개발 모드(StrictMode)는 effect 를 두 번 돈다.** DOM 에 "처리함" 표시를 남기고 cleanup 에서 감시를 끄면 두 번째 실행이 건너뛰어 버림 → 랜딩 글자가 전부 투명해졌던 버그. effect 안 상태는 지역 변수(WeakSet 등)로, 비동기 결과는 세대 번호로 버릴 것(`Studio` 의 `r.current.gen` 참고).
- **React 가 관리하는 `className` 을 `classList` 로 바꾸지 말 것.** 하이드레이션 불일치 + 리렌더 때 지워짐. 등장 모션은 `data-in`/`data-rv` 속성 사용.
- 예전 CSS가 `#id` 선택자를 쓰는 곳이 있었음. 포팅할 때 id 를 빼먹으면 스타일이 안 붙음(타임라인 캔버스가 무한히 넓어졌던 원인). class 로 바꿔 둠.
- 새 Supabase 프로젝트는 테이블 GRANT 가 자동이 아님 → 0002_grants.sql. secret key(service_role)도 테이블 권한 없음(지금은 auth admin API 만 써서 문제없음).
- 대시보드에서 URL 을 `/rest/v1/` 까지 복사해 오는 경우가 있어 `config.ts` 에서 잘라냄.

## 남은 일

- [ ] 로그인한 사용자로 기록 저장·크레딧 차감·삭제·문의 저장 실제 확인 (이메일 가입, Confirm email 켜져 있음)
- [ ] 실제 카메라로 녹화 → 리포트 전체 흐름 확인(StrictMode 카메라 정리 수정 포함)
- [ ] 카카오·Google OAuth: 각 콘솔에서 앱 만들고 Supabase Providers 에 키 등록
- [ ] 랜딩 예시 영상 `public/media/nv-a.mp4`, `nv-b.mp4` 없음(지금은 "예시 영상 자리" 표시, 404)
- [ ] 결제 미연동: 지금은 RLS 상 본인이 `profiles.plan` 을 바꿀 수 있음. 결제 붙이면 plan 변경은 서버(웹훅)만 하도록 정책 좁히기
- [ ] 단체 문의 폼은 localStorage(`rc-leads-v1`)에만 저장됨 → 서버 저장 필요
