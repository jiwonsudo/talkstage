import type { Metadata, Viewport } from 'next';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/Confirm';
import { Navbar } from '@/components/nav/Navbar';
import { ContactProvider } from '@/components/contact/ContactProvider';
import { Suspense } from 'react';
import { THEME_SCRIPT } from '@/lib/theme';
import { ScreenTransition } from '@/components/ui/ScreenTransition';

const DESC = 'Talkstage는 중요한 발표 한 번을 앞두고, 녹화할 때마다 말과 몸짓을 코칭해 주는 리허설 코치예요. 면접·IR·졸업 발표마다 다른 기준으로 짚어 드려요.';
const OG_TITLE = 'Talkstage — 중요한 발표 한 번을 위한 리허설 코치';

// OG·트위터 이미지는 app/opengraph-image.png · twitter-image.png, 아이콘은 icon.svg · apple-icon.png · favicon.ico(파일 규칙)
export const metadata: Metadata = {
  metadataBase: new URL('https://talkstage-three.vercel.app'),
  // 탭·검색 결과는 대표 제목, 다른 화면은 '새 리허설 · Talkstage'. 홈 화면에 추가하면 이름은 'Talkstage' 만(appleWebApp·manifest).
  title: { default: OG_TITLE, template: '%s · Talkstage' },
  description: DESC,
  applicationName: 'Talkstage',
  appleWebApp: { title: 'Talkstage' },
  openGraph: { type: 'website', url: '/', siteName: 'Talkstage', locale: 'ko_KR', title: OG_TITLE, description: DESC },
  twitter: { card: 'summary_large_image', title: OG_TITLE, description: DESC },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

/**
 * 등장 모션(.rv)은 JS 가 돌 때만 글자를 숨겨요. Reveal 이 4초 안에 시작하지 않으면(JS 차단·실패)
 * data-js 를 떼서 글자가 그냥 보이게 해요. 이 스크립트가 <html> 속성을 바꿔서 suppressHydrationWarning 을 둬요.
 */
const JS_FLAG = "(function(d){d.dataset.js='';setTimeout(function(){if(!('rvOn' in d.dataset))delete d.dataset.js},4000)})(document.documentElement)";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: JS_FLAG + ';' + THEME_SCRIPT }} /></head>
      <body><ToastProvider><ConfirmProvider><Suspense><AuthProvider><ContactProvider><Navbar /><ScreenTransition /><main>{children}</main></ContactProvider></AuthProvider></Suspense></ConfirmProvider></ToastProvider></body>
    </html>
  );
}
