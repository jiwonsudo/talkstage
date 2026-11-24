# Talkstage — 작업 메모 (Claude Code 용)

녹화 한 번으로 말 빠르기·쉼·톤·시선·자세·제스처·군더더기 말·내용 구조·시간을 분석해 코칭해 주는 **리허설 코칭 웹앱**.
사용자: 대학생, 취업 준비생, 직장인, 그리고 B2B(학교·회사 단체 요금제).

## 제품 방향(가장 중요)

- **주 목적은 "이번 한 번의 발표를 이기게" 하는 것**, 발표 실력 향상은 부 목적. 프로젝트마다 보통 발표는 한 번이고, 그 발표가 프로젝트의 발목을 잡지 않고 세일즈·장점을 최대로 보여 주게 돕는다. 그래서 **같은 발표를 3~4번 연습**하며 회차마다 나아지는 구조(제목 = 한 발표, `/me/rehearsals/[title]` 회차 비교).
- **좋은 발표 방법은 목적마다 180도 다르다.** "정면만 보면 좋음" 같은 일괄 기준 금지.
  - 면접: 앉아서, 손은 작게·간단히, 면접관 여러 명에게 시선을 나눔.
  - IR 피칭·시제품 시연·제품 소개: 화면·폰·제품을 **직접 가리키고 들어 보이며** 강조하는 게 중요. 그 순간 화면을 보는 건 감점이 아님.
  - 그 밖의 상황도 목적별 기준(`scenarios.ts`)으로 따로 판단.
- 실제로 팔 수 있는 수준의 정확도·디테일이 목표. 애매한 기준·제품 판단은 사용자에게 물어보고, 누가 봐도 나은 방향은 알아서 고도화.

## 작업 규칙

- **답변은 한국어로.** UI 문구도 한국어, 부드러운 존댓말(~해요).
- 제품 용어는 **"리허설"**. "프레젠테이션"이라고 쓰지 않는다. ("발표"는 상황을 말할 때만.)
- 디자인: 밝은 배경, 원색(파랑·노랑·분홍·빨강·초록·주황·보라) 스퀴클 카드, 깔끔한 내비. **AI 느낌 나는 장식 금지**(보라 그라디언트 남발, 반짝이 이모지, 회색 타일 그리드, 색 테두리 카드, 반투명 유리 알약, 전부 100점 같은 인위적 숫자). 원색은 카드마다 포인트로만, 큰 면을 원색으로 칠하지 않기(눈 아픔). 항목 색은 `lib/colors.ts` 고정.
- 이 프로젝트는 **Next.js + TypeScript** 로 간다. 새 기능을 plain JS·전역 스크립트로 박지 말 것(이 때문에 한 번 전부 다시 짰음).
- 패키지 매니저는 **pnpm** (`packageManager` 고정). npm/yarn lockfile 만들지 말 것.
- 바꾼 뒤에는 `pnpm exec tsc --noEmit`, `pnpm lint`, 필요하면 `pnpm build` 까지 통과시킬 것.
- 비밀 값(`.env.local`, secret key)은 커밋·출력 금지. `SUPABASE_SECRET_KEY` 에 `NEXT_PUBLIC_` 붙이지 말 것.

## 스택

- Next.js 16 (App Router, Turbopack, 미들웨어 대신 `src/proxy.ts`), React 19, strict TypeScript
- 스타일: Tailwind 없음. `src/app/globals.css` 하나(예전 버전 CSS를 옮긴 것 + 아래쪽에 추가 규칙). 색은 `--blue` 같은 CSS 변수.
- Supabase: `@supabase/ssr` + `supabase-js`. publishable / secret 새 키 이름 사용(예전 anon / service_role 이름도 받음).
- MediaPipe Tasks Vision(`@mediapipe/tasks-vision`, wasm 은 jsdelivr CDN)으로 브라우저에서 자세·얼굴 분석. 음성은 Web Audio + Web Speech API.

## 배포

- Vercel(GitHub 연동): https://talkstage-three.vercel.app — main 에 push 하면 운영 배포, PR 브랜치는 미리보기.
- Vercel 환경 변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `NEXT_PUBLIC_TOSS_BILLING_CLIENT_KEY`, `TOSS_BILLING_SECRET_KEY`, `CRON_SECRET`, `KAKAO_ADMIN_KEY`(탈퇴 때 카카오 연결 끊기, 서버 전용) 만. `TEST_USER_*` 는 넣지 말 것.
- Supabase Auth URL Configuration 에 배포 주소와 `/auth/callback` 등록됨.

## 실행

```bash
pnpm install
pnpm dev        # http://localhost:5180 (Supabase 리다이렉트와 맞추려고 5180 고정)
```

## 확인용 계정

- 로그인이 필요한 화면·DB 확인은 `talkstage-qa@example.com` 하나로 한다. 비밀번호는 `.env.local` 의 `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`(출력 금지). 임시 계정을 새로 만들고 지우지 말 것. 이 계정의 기록·크레딧은 확인 중에 써도 됨.

## 구조

- `src/app`
  - `/` 랜딩 — `page.tsx` 가 `components/landing/*` 섹션을 조립
  - `/rehearsal/new` 리허설 — `RehearsalEntry`(ssr:false) → `RehearsalFlow`: 마법사 → (대본 점검) → 녹화 → 리포트. `?purpose=&posture=&step=` 지원
  - `/me/rehearsals` 내 리허설 대시보드(사이드바 없음, 로그인하면 여기로). 기록은 제목(`topic`, 마법사 마지막 단계에서 입력, 비우면 "{상황} 리허설")별로 묶고 `/me/rehearsals/[title]` 에서 회차별 점수 비교·"이 발표 다시 연습"(`?title=`). `/me/(settings)/account|plan|support|settings` 설정(왼쪽 사이드바, 구분선 아래 톱니바퀴 "설정" = 화면 테마 시스템/라이트/다크, localStorage `ts-theme`). 랜딩에는 최근 기록 없음
  - `/dev/showtest` 보여 주기 감지 합성 테스트(개발 전용): 가리키기·복귀·가로지름·얼굴 가림·잦음·오탐(손 모음·흔들기) 시나리오. `showing.ts` 를 바꾸면 결과가 그대로인지 볼 것
  - `/dev/og` OG 이미지 원본(개발 전용)
  - `/dev/promo` 30초 광고 원본(개발 전용, 1920×1080, 밝은 배경). "정답은 상황마다 다르다" → 1회→4회 나아짐(nv-a→nv-b 실제 분석 값) → 행동 유도. 음악은 `node scripts/promo-beat.mjs out.wav`(직접 만든 딥 하우스 120BPM, 한 마디 2초) — 컷은 마디 첫 박, 등장은 박자 단위라 템포를 바꾸면 화면 타이밍도 같이. `?render=1` + `window.__seek(t)` 로 프레임마다 캡처 → ffmpeg 로 음악과 합쳐 mp4
  - `/dev/eval` 정확도 검증(개발 서버 전용, 배포는 404): 영상 + 같은 이름 정답 .json → 앱과 같은 코드로 분석해 정답과 비교. 합격선은 `lib/eval/compare.ts`, 실행은 `lib/eval/run.ts`(첫 3초는 조용히 렌즈 보기)
  - `/auth/callback` OAuth 코드 교환, `/api/account` 계정 삭제(secret key, 서버 전용)
- `src/components`
  - `landing/` 서버 컴포넌트 섹션 + 작은 클라이언트 아일랜드(`HeroDial`, `Timeline`, `NvFrame`, `Plans`, `Reveal`, `actions.tsx`)
  - `auth/` `AuthProvider`(useAuth, requireAuth, 로그인 모달 상태), `AuthDialog`
  - `rehearsal/` `Wizard`, `ScriptCheck`, `Studio`(카메라·녹화), `Report`
  - `ui/` `BrandMark`(로고), `Picto`, `Toast`, `PatternArt`, `Confirm`(useConfirm, window.confirm 대신), `SegPill`(.seg 토글 알약)
- `src/lib`
  - `coach/` 분석 엔진: `audio`, `vision`, `analysis`(점수·문제 구간·하이라이트), `showing`(화면·제품 가리키기/들어 보이기 감지·채점), `coach`(코칭 문구·근거), `script`(대본 분석·읽기), `timeline`, `media`
  - `rehearsal/draft.ts` 마법사 설정(localStorage `rc-setup-v2`) → `toSetup()`
  - `delivery.ts` 목적별 전달 방식: 마법사 "보여 주는 것" 단계(`AidId`: 면접 panel/video, 그 밖 slidesL/R·product·device·none), 청중 종류(room = 카메라가 청중 가운데·옆을 봐도 시선 OK·시선 분배 코칭 / camera = 렌즈 하나), 가리키기 적정 횟수·신호어·목적별 문구
  - `colors.ts` 항목·상황별 고정 원색
  - `scenarios.ts` 발표 상황(interview, ir, report, lecture, conference, capstone, speech)·목표·기준값
  - `plans.ts` 요금제, `data/` Supabase 읽기·쓰기, `supabase/` 클라이언트 생성
- `supabase/migrations/` 0001 스키마+RLS, 0002 권한(GRANT) — 원격 적용 완료. 0003 크레딧 사용 내역(`credit_ledger`, `credits_left()`, `record_rehearsal()`) — 원격 적용 완료. 0004 요금제 크레딧 조정(`plan_credits()` 120/360) — 원격 적용 완료. 0005 회차 구매(`orders`, `create_order()`, 서버 전용 `order_for_confirm()`·`complete_order()`, 산 크레딧 `bonus_left()`, 20초 미만 저장 거절) — 원격 적용 완료. 0006 월 요금제 정기결제(`billing_cards`·`subscriptions`·`subscription_payments`, `profiles.plan` 은 서버만 수정) — 원격 적용 완료.
- `legacy/` 이전 plain JS 버전. 참고용, 빌드·lint 대상 아님.

## 제품 규칙(이미 구현됨, 바꿀 때 지킬 것)

- 리허설 설정(마법사)은 로그인 없이 고를 수 있고, 첫 단계에 "녹화할 때 로그인" 안내를 띄움. 마지막 단계 버튼("로그인하고 녹화 준비/대본 분석하기")에서 로그인 모달 → 로그인 후 그대로 이어감(소셜 로그인은 `?step=5&resume=1` 로 돌아옴). `/me` 만 proxy 가 막음.
- 마법사: 지난 설정·기본값은 체크로 안 보여 줌(이번에 직접 고른 단계만 체크). 단계마다 history 를 쌓아서 내비 뒤로 화살표·폰 뒤로 가기가 이전 단계로 감. 그만두기 버튼은 없음(내비의 홈 버튼 사용). 로그인 후 내비: "새 리허설 +" CTA + 메뉴(내 리허설 / 계정 관리 / 요금제 관리 / 지원 받기 / 로그아웃).
- 요금제: Opening 36크레딧(무료), Spotlight 120(월 4,900원, 연 3,900원), Headliner 360(월 9,900원, 연 7,900원), 대학·팀·기업 단체 요금제는 문의. 리허설 1회 = 12크레딧.
- 결제(토스페이먼츠 결제위젯, 지금은 테스트 키 `test_gck`/`test_gsk`): 회차 구매만(3회 36크레딧 1,500원, 6회 72크레딧 2,500원 — `plans.ts` `PACKS` 와 SQL `pack_info()` 둘 다). 금액은 DB 가 정하고, `/api/payments/confirm` 이 DB 금액과 대조 → 토스 승인(멱등 키 `confirm-{orderId}`) → `complete_order()`(service_role 만). 산 크레딧은 매달 초기화 안 되고, 이번 달 크레딧을 먼저 씀. 환경 변수 `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`(NEXT_PUBLIC_ 금지) — Vercel 에도 넣어 둠. 사업자등록 전이라 실결제(live 키) 불가.
- 월 요금제 정기결제(토스 자동결제·빌링): 결제위젯 키가 아니라 **API 개별 연동 키**(`NEXT_PUBLIC_TOSS_BILLING_CLIENT_KEY`=test_ck, `TOSS_BILLING_SECRET_KEY`=test_sk). `/me/subscribe?plan=` 에서 카드 등록(`requestBillingAuth`) → `/me/subscribe/success` → `/api/billing/start` 가 빌링키 발급·저장 후 결제(금액은 SQL `sub_new_payment`, 업그레이드는 남은 날만큼 차감). 토스는 자동으로 매달 결제하지 않아서 Vercel Cron(`vercel.json`, 매일 UTC 0시)이 `/api/billing/cron`(Bearer `CRON_SECRET`)을 불러 결제일 지난 구독을 결제. 실패하면 하루 한 번 3번까지 재시도 후 Opening. 해지는 예약(기간 끝까지 사용), 낮은 유료 요금제는 다음 결제일부터. 빌링키는 서버 전용 표에만, 계정 삭제 때 토스에서도 지움. 가격을 바꾸면 `plans.ts` `PLAN_PRICE` 와 SQL `plan_price()` 둘 다. 연 결제는 아직 없음.
- 크레딧은 서버가 센다: `credit_ledger` 사용 내역 합계(한국 시간 매월 1일 초기화). 기록을 지워도 차감은 유지. 저장은 `record_rehearsal()` RPC 로만(앱의 rehearsals 직접 insert 권한 없음), "종료하고 분석" 뒤 저장이 성공해야 리포트를 보여 줌. 크레딧을 못 불러오거나 모자라면 녹화 화면 진입 차단. 요금제 크레딧을 바꾸면 `plans.ts` 와 SQL `plan_credits()` 둘 다.
- 리허설 성립 조건(`analysis.ts` 의 `MIN_REHEARSAL_SEC` 등): 20초 미만이거나 실제 목소리가 max(8초, 녹화의 20%) 미만이면 `invalid` → 점수·리포트·저장·크레딧 차감 없이 녹화 화면으로 돌아감.
- 내비 뒤로(←)는 **항상 바로 전 화면**(`router.back()`). 앱 안 이동 기록이 없을 때만(주소로 바로 들어옴·결제창에서 돌아옴) 결제 화면은 `/me/plan`, 나머지는 홈. 홈은 옆의 집 버튼으로 따로(로그인했으면 홈 = `/me/rehearsals` 대시보드). 뒤로를 홈으로 보내지 말 것.
- 화면 전환: 누르는 즉시 색 조각이 덮고 다음 화면이 준비되면 걷힘(`ui/ScreenTransition`). 화면을 옮기는 `router.push` 는 `next/navigation` 말고 **`@/lib/nav` 의 `useRouter`** 를 쓸 것(그래야 덮개가 먼저 켜짐). 링크 클릭은 자동.
- 녹화 중: Wake Lock 으로 화면 꺼짐 방지. 다른 앱으로 나가면 그 자리에서 녹화를 끊고, 돌아오면 "여기까지 분석(20초 이상) / 다시 녹화"를 물어봄. 폰(pointer: coarse)은 녹화 비트레이트 1Mbps(데스크톱 2.5Mbps). 분석은 녹화 중 카메라 프레임으로 실시간이라 종료 후 1~2초.
- 목적·목표 직접 입력은 유료 플랜만, 정확도 경고 문구 표시. 잠긴 칸을 누르면 `/me/plan?pick=Spotlight&from=wizard` 로 가고, 업그레이드하면 설정 화면으로 돌아옴. 요금제 관리는 한 단계 위 요금제를 "추천"으로 강조.
- 마법사 중간 단계로 바로 들어와도(`?step=N`) 앞 단계 기록을 채워서 뒤로 가기가 이전 단계로 감. 첫 단계(목적 고르기)에서 내비 뒤로는 홈.
- 목표는 목적별로 다르고 최대 3개. 권장 시간은 목적+목표에 따라 달라짐.
- 대본 단계: "대본이 없나요?"가 입력칸 위, 예시는 placeholder 로만, 지원 형식 `.txt · .md · .docx` 표시.
- 히어로 다이얼: 카드 부채꼴, 베젤과 동기화, 잡으면 멈춤, 넓은 화면에선 오른쪽.
- 로고: 네 조각으로 갈라진 말풍선(`ui/BrandMark.tsx`). 모든 모서리 반지름 3 으로 둥글게, 광택은 아주 약하게(너무 글로시하면 안 됨). 마우스를 올리면 조각이 벌어짐.

## 목적별 비언어 분석(바꿀 때 지킬 것)

- 보여 주기(`showing`): 가리키는 중·끝난 뒤 1.2초는 시선 채점에서 뺌. 녹화 중 실시간 시선 알림도 같은 기준(`showPose`)으로 가리키는 중·직후 2초는 띄우지 않음. 대신 가리킨 뒤 3초 안에 청중 복귀, 숫자·목적별 신호어 문장에서 가리켰는지, 몸 가로질러 가리키기·제품이 얼굴 가림·너무 짧게(<1.5초), 분당 횟수(목적별 범위)를 봄. 30초 미만 녹화에서 0회면 채점 안 함. 보여 줄 것 없는 발표는 리포트에서 카드 숨김.
- 청중이 여럿(room)이면 고개를 옆으로(0.11~0.32) 돌린 것도 청중을 본 것. 15초 이상 측정되면 가운데만(옆 10% 미만)·한쪽만(균형 0.25 미만) 코칭·감점.
- "이 발표 다시 연습"은 `?again=1&title=` → 설정 단계 건너뛰고 대본·녹화 단계로, 같은 제목이면 이 기기의 대본 유지. 뒤로 가면 발표 기록 화면으로 바로 나감(앞 단계 기록 채우지 않음).
- 기록 삭제(회차·발표 통째) 확인 문구는 `DELETE_BODY`: 통계에서 빠짐 + 되돌릴 수 없음 + 크레딧 안 돌아옴.

## 로그인

- 최근 로그인(`lib/auth/lastLogin.ts`, localStorage `ts-last-login`, 비밀번호는 저장 안 함): 이메일이면 로그인 창에 "최근 로그인한 계정" 카드 + 비밀번호만(다른 계정·이 기기에서 기록 지우기), 카카오·Google 이면 그 버튼에 "최근 사용" 말풍선. 소셜은 떠나기 전에 `ts-login-pending` 에 방법을 적고 돌아와서 확정.
- 소셜로만 가입한 계정(`user.hasPassword === false`)은 비밀번호가 없어서 계정 관리에서 비밀번호 바꾸기 대신 "로그인 방법" 안내, 계정 삭제는 버튼 → 확인 창에서 "계정을 삭제하겠습니다" 입력(비밀번호 있는 계정은 비밀번호도, `useAsk` 의 fields/check). 삭제하면 `/api/account` 가 카카오 연결 끊기(`KAKAO_ADMIN_KEY` 있을 때) → 사용자 삭제, 앱은 최근 로그인 기록도 지움. 카카오 프로필 사진은 Supabase 가 항상 요청하는 범위라 동의항목에서 끄면 KOE205 → "선택 동의"로 두고 앱에서는 안 씀.
- Supabase Site URL 은 운영 주소, Redirect URLs 는 `https://talkstage-three.vercel.app/**`·`http://localhost:5180/**` 처럼 `**` 로(콜백에 `?next=` 가 붙어서 정확히 일치하는 주소만 넣으면 Site URL 로 튕김). 랜딩에 `?code=`·`#error=` 가 남아 돌아오면 `AuthProvider` 가 콜백으로 넘기거나 이유를 보여 줌.
- 소셜 로그인 취소·실패는 `/?login=1&error=cancelled|social&next=` 로 돌아와 이유를 보여 주고 원래 화면을 기억.

## UI 디테일 규칙

- `window.alert/confirm/prompt` 금지. 확인은 `useConfirm()`, 입력이 필요한 확인은 `useAsk()`(ui/Confirm, fields·match·check) 모달로.
- `.seg` 토글에는 `<SegPill />` 을 넣어 고른 칸으로 미끄러지게. 상태가 바뀌는 곳은 뚝 바뀌지 않게 전환 모션을 넣을 것.
- `<dialog>` 는 열 때 창 자체에 포커스(`tabIndex={-1}` + `focus()`) — 첫 버튼에 파란 포커스 링이 뜨지 않게.
- 테마 변경은 `setThemeAnimated`(누른 자리에서 원으로 번짐, View Transitions).

## 브랜드 파일·OG

- `public/brand/*.svg`: 마크(`talkstage-mark`, 평면 `-flat`, 앱 아이콘 `-app-icon`), 로고타입(마크+글자, 흰 글자 `-white`, 평면 `-flat`), 워드마크. 글자는 Pretendard ExtraBold 윤곽선(자간 -0.04em, GPOS 커닝 반영), 도형·그라디언트는 `BrandMark.tsx` 와 같은 값. `png/transparent`(배경 없음)·`png/background`(흰/잉크 배경, 앱 아이콘, OG).
- 앱 아이콘: `src/app/icon.svg`·`apple-icon.png`·`favicon.ico`(마크). 로고 모양을 바꾸면 위 파일들도 다시 뽑을 것.
- OG·트위터 이미지: `src/app/opengraph-image.png`·`twitter-image.png`(1200×630). 원본은 개발 전용 `/dev/og`(랜딩 카드·Picto 그대로) — 고치면 `.og` 요소를 캡처해 두 파일 교체. **카드에 URL·설명 문구 넣지 말 것**(주소는 바뀔 수 있음). `metadataBase` 는 `layout.tsx`.

## 랜딩 실제 분석 예시

- `landing/NvDemo`: `public/media/nv-a|nv-b.mp4`(AI로 만든 영상, 워터마크 없게 가운데 576×720 으로 자름)을 누르면 프레임별 인식(`nv-*.track.json`)을 겹쳐 그리고 리포트 요약(`landing/demoData.ts`)을 보여 줌. 수치·문구는 앱과 같은 분석 코드로 원본 영상을 실제로 돌린 결과 — 손으로 고치지 말고, 분석 코드를 바꾸면 다시 뽑을 것(좌표는 x' = (x·1280−352)/576). "AI 영상이지만 실제 분석" 문구는 지우지 말 것.
- 음량·음높이는 AudioWorklet(오디오 스레드, `audio.ts` 의 `WORKLET_SRC`)에서 25ms 마다 잼. 메인 스레드 setInterval 로 재면 MediaPipe 때문에 구간이 빠져 같은 녹화도 억양·쉼이 흔들렸음(워클릿 없으면 예전 방식으로 대체).
- 원고를 두 손으로 들고 있으면(두 손목이 가까이·가슴 높이) 손짓으로 세지 않고, 절반 이상이면 제스처 감점 + "원고를 두 손으로 든 채 말함". 제품·기기 시연은 제외.
- 얼굴이 작게 찍히면(서서 발표) `vision.detect` 가 자세로 찾은 머리 둘레를 확대해서 얼굴 인식에 넣음.

## 이미 겪은 함정

- **개발 모드(StrictMode)는 effect 를 두 번 돈다.** DOM 에 "처리함" 표시를 남기고 cleanup 에서 감시를 끄면 두 번째 실행이 건너뛰어 버림 → 랜딩 글자가 전부 투명해졌던 버그. effect 안 상태는 지역 변수(WeakSet 등)로, 비동기 결과는 세대 번호로 버릴 것(`Studio` 의 `r.current.gen` 참고).
- **React 가 관리하는 `className` 을 `classList` 로 바꾸지 말 것.** 하이드레이션 불일치 + 리렌더 때 지워짐. 등장 모션은 `data-in`/`data-rv` 속성 사용.
- 예전 CSS가 `#id` 선택자를 쓰는 곳이 있었음. 포팅할 때 id 를 빼먹으면 스타일이 안 붙음(타임라인 캔버스가 무한히 넓어졌던 원인). class 로 바꿔 둠.
- 새 Supabase 프로젝트는 테이블 GRANT 가 자동이 아님 → 0002_grants.sql. secret key(service_role)도 테이블 권한 없음(지금은 auth admin API 만 써서 문제없음).
- **`.rv` 등장 모션은 `<html data-js>` 일 때만 글자를 숨긴다.** JS 가 안 돌면(폰에서 LAN 주소로 dev 서버 접속 시 `allowedDevOrigins` 차단 등) 랜딩 글자가 전부 투명했음. layout 의 인라인 스크립트가 4초 안에 Reveal 이 안 뜨면 `data-js` 를 뗀다. 숨김 CSS 를 새로 만들 때도 `[data-js]` 아래에 둘 것.
- Picto 그림은 그려진 영역 중심이 120×120 가운데와 어긋난 게 있어서 `NUDGE` 로 viewBox 를 옮김. 그림을 고치면 다시 잴 것. 아이콘 칸(`.opt-ico` 등)은 `position: relative` 필요.
- 대시보드에서 URL 을 `/rest/v1/` 까지 복사해 오는 경우가 있어 `config.ts` 에서 잘라냄.

## 남은 일

- [ ] 로그인한 사용자로 기록 저장·크레딧 차감·삭제·문의 저장 실제 확인 (이메일 가입, Confirm email 켜져 있음)
- [ ] 실제 카메라로 녹화 → 리포트 전체 흐름 확인(StrictMode 카메라 정리 수정 포함)
- [ ] 카카오·Google OAuth: 각 콘솔에서 앱 만들고 Supabase Providers 에 키 등록
- [ ] 단체 문의 폼은 localStorage(`rc-leads-v1`)에만 저장됨 → 서버 저장 필요
