'use client';
import { useAuth } from '@/components/auth/AuthProvider';
import { Reveal } from '@/components/landing/Reveal';

// /me 공통: 로그인 확인만 해요. 화면 모양은 대시보드(rehearsals)와 설정((settings)/layout)이 각자 정해요.
export default function MeLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  return (
    <section className="screen">
      {user ? children : (
        <div className="page hub">
          <p className="subtitle">{ready ? '로그인한 뒤에 볼 수 있어요.' : '불러오는 중…'}</p>
        </div>
      )}
      <Reveal />
    </section>
  );
}
