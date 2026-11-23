'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { Reveal } from '@/components/landing/Reveal';

const TABS = [
  { href: '/me/rehearsals', label: '리허설' },
  { href: '/me/account', label: '계정' },
  { href: '/me/plan', label: '요금제' },
  { href: '/me/support', label: '지원' },
];

export default function MeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, ready } = useAuth();
  return (
    <section className="screen">
      <div className="page hub">
        <nav className="hub-tabs" aria-label="내 Talkstage">
          {TABS.map((t) => <Link key={t.href} href={t.href} role="tab" aria-selected={pathname === t.href}>{t.label}</Link>)}
        </nav>
        <div>{!ready ? <p className="subtitle">불러오는 중…</p> : user ? children : <p className="subtitle">로그인한 뒤에 볼 수 있어요.</p>}</div>
      </div>
      <Reveal />
    </section>
  );
}
