'use client';
import { useRouter } from '@/lib/nav';
import { useAuth } from '@/components/auth/AuthProvider';
import { useContact } from '@/components/contact/ContactProvider';
import { useToast } from '@/components/ui/Toast';

type BtnProps = { className?: string; children: React.ReactNode };

/** 새 리허설(선택한 상황이 있으면 그 상황으로)을 열어요. 로그인은 설정을 다 고른 뒤 녹화 직전에 받아요. */
export function useStartRehearsal() {
  const router = useRouter();
  return (purpose?: string) => router.push(purpose ? `/rehearsal/new?purpose=${encodeURIComponent(purpose)}&step=1` : '/rehearsal/new');
}

export function StartButton({ className, children }: BtnProps) {
  const start = useStartRehearsal();
  return <button type="button" className={className} onClick={() => start()}>{children}</button>;
}

export function PurposeButton({ purpose, className, children }: BtnProps & { purpose: string }) {
  const start = useStartRehearsal();
  return <button type="button" className={className} onClick={() => start(purpose)}>{children}</button>;
}

export function ContactButton({ kind = 'biz', className, children }: BtnProps & { kind?: 'biz' | 'edu' | string }) {
  const open = useContact();
  return <button type="button" className={className} onClick={() => open(kind === 'edu' ? 'edu' : 'biz')}>{children}</button>;
}

export function PlanButton({ plan, className, children }: BtnProps & { plan: string }) {
  const { requireAuth } = useAuth();
  const router = useRouter();
  const onClick = () => requireAuth(() => {
    // 결제 연동 전 프로토타입: 요금제 관리 화면에서 바꿔요.
    router.push(`/me/plan?pick=${encodeURIComponent(plan)}`);
  }, '요금제를 바꾸려면 로그인해 주세요.');
  return <button type="button" className={className} onClick={onClick}>{children}</button>;
}

export function FooterAction({ fx, className, children }: BtnProps & { fx: string }) {
  const { user, openAuth } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const start = useStartRehearsal();
  const onClick = () => {
    if (fx === 'new') start();
    else if (fx === 'login') { if (user) toast('이미 로그인되어 있어요'); else openAuth({ mode: 'in', next: '/me/rehearsals' }); }
    else if (fx === 'mine') { if (user) router.push('/me/rehearsals'); else openAuth({ mode: 'in', next: '/me/rehearsals' }); }
  };
  return <button type="button" className={className} onClick={onClick}>{children}</button>;
}
