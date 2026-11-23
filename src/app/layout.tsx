import type { Metadata, Viewport } from 'next';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { Navbar } from '@/components/nav/Navbar';
import { ContactProvider } from '@/components/contact/ContactProvider';
import { Suspense } from 'react';

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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body><ToastProvider><Suspense><AuthProvider><ContactProvider><Navbar /><main>{children}</main></ContactProvider></AuthProvider></Suspense></ToastProvider></body>
    </html>
  );
}
