# Talkstage

녹화 한 번으로 말 빠르기·시선·자세·제스처를 분석해 주는 리허설 코칭 웹앱이에요.

- Next.js 16 (App Router) · React 19 · TypeScript
- Supabase Auth / Postgres (RLS)
- MediaPipe Tasks Vision (브라우저에서 자세·얼굴 분석)

## 실행

pnpm 을 써요(`packageManager` 에 버전이 고정돼 있어요).

```bash
pnpm install
cp .env.example .env.local   # 값 채우기
pnpm dev                     # http://localhost:5180
```

Supabase 로그인 후 돌아오는 주소를 5180 으로 맞춰 두었기 때문에 개발 서버는 항상 5180 포트로 떠요.

| 명령 | 하는 일 |
| --- | --- |
| `pnpm dev` | 개발 서버 |
| `pnpm build` / `pnpm start` | 프로덕션 빌드 / 실행 |
| `pnpm lint` | ESLint |
| `pnpm exec tsc --noEmit` | 타입 검사 |

## Supabase 설정

1. Project Settings → API Keys 에서 값을 복사해 `.env.local` 에 넣어요.
   - `NEXT_PUBLIC_SUPABASE_URL`: `https://<ref>.supabase.co` (뒤에 `/rest/v1/` 는 없어도 돼요)
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: `sb_publishable_...`
   - `SUPABASE_SECRET_KEY`: `sb_secret_...` (서버 전용, 계정 삭제에만 써요)
2. SQL Editor 에서 `supabase/migrations/` 의 파일을 번호 순서대로 실행해요.
3. Authentication → URL Configuration
   - Site URL: `http://localhost:5180`
   - Redirect URLs: `http://localhost:5180/auth/callback`
4. 카카오·Google 로그인은 Authentication → Sign In / Providers 에서 켜요.

## 폴더

- `src/app` 라우트 (`/`, `/rehearsal/new`, `/me/*`, `/auth/callback`, `/api/account`)
- `src/components` 랜딩·인증·리허설(마법사, 대본 점검, 녹화, 리포트) 컴포넌트
- `src/lib/coach` 음성·영상 분석과 코칭 엔진
- `legacy/` 이전 plain JS 버전(참고용)
