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

export const metadata: Metadata = {
  title: 'Talkstage · 발표 리허설',
  description: '무엇을 만들었든, 청중에게 결국 전해지는 건 이야기예요. Talkstage로 그 몇 분을 미리 연습하세요.',
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
