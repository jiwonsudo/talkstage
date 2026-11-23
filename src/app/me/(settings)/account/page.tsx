'use client';
import { useState } from 'react';
import { useRouter } from '@/lib/nav';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { changePassword, deleteAccount, updateName } from '@/lib/data/profile';

const val = (f: HTMLFormElement, n: string) => String(new FormData(f).get(n) ?? '');

export default function Account() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [pwErr, setPwErr] = useState('');
  const [delErr, setDelErr] = useState('');
  if (!user) return null;

  return (
    <>
      <h1 className="title1">계정 관리</h1>
      <p className="subtitle">{user.email}로 로그인했어요.</p>
      <form className="hub-card" onSubmit={async (e) => {
        e.preventDefault();
        try { await updateName(user.id, val(e.currentTarget, 'name')); await refresh(); toast('이름을 바꿨어요.'); }
        catch (x) { toast((x as Error).message); }
      }}>
        <h2>프로필</h2>
        <label className="field"><span>이름</span><input name="name" type="text" maxLength={20} defaultValue={user.name} required /></label>
        <label className="field"><span>이메일</span><input type="email" value={user.email} disabled /></label>
        <button className="btn-fill btn-sm">저장</button>
      </form>
      <form className="hub-card" onSubmit={async (e) => {
        e.preventDefault();
        const f = e.currentTarget;
        try { await changePassword(user.email, val(f, 'current'), val(f, 'next')); f.reset(); setPwErr(''); toast('비밀번호를 바꿨어요.'); }
        catch (x) { setPwErr((x as Error).message); }
      }}>
        <h2>비밀번호 바꾸기</h2>
        <label className="field"><span>지금 비밀번호</span><input name="current" type="password" autoComplete="current-password" required /></label>
        <label className="field"><span>새 비밀번호 <small>(8자 이상)</small></span><input name="next" type="password" autoComplete="new-password" minLength={8} required /></label>
        <p className="wiz-err" hidden={!pwErr}>{pwErr}</p>
        <button className="btn-fill btn-sm">비밀번호 바꾸기</button>
      </form>
      <form className="hub-card hub-danger" onSubmit={async (e) => {
        e.preventDefault();
        if (!confirm('정말 계정을 삭제할까요? 리허설 기록도 함께 지워지고 되돌릴 수 없어요.')) return;
        try { await deleteAccount(user.email, val(e.currentTarget, 'password')); toast('계정을 삭제했어요.'); router.push('/'); }
        catch (x) { setDelErr((x as Error).message); }
      }}>
        <h2>계정 삭제</h2>
        <p>계정과 리허설 기록이 모두 지워지고 되돌릴 수 없어요.</p>
        <label className="field"><span>비밀번호 확인</span><input name="password" type="password" autoComplete="current-password" required /></label>
        <p className="wiz-err" hidden={!delErr}>{delErr}</p>
        <button className="btn-plain btn-sm">계정 삭제</button>
      </form>
    </>
  );
}
