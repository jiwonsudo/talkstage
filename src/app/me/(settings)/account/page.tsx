'use client';
import { useState } from 'react';
import { useRouter } from '@/lib/nav';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { useAsk } from '@/components/ui/Confirm';
import { changePassword, deleteAccount, updateName } from '@/lib/data/profile';

const val = (f: HTMLFormElement, n: string) => String(new FormData(f).get(n) ?? '');
const SOCIAL_NAME = { kakao: '카카오', google: 'Google' } as const;
/** 계정 삭제 확인 창에서 이 문구를 그대로 입력해야 삭제 버튼이 켜져요. */
const DELETE_PHRASE = '계정을 삭제하겠습니다';

export default function Account() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [pwErr, setPwErr] = useState('');
  const ask = useAsk();
  if (!user) return null;

  // 계정 삭제: 버튼 → 확인 창에서 문구를 그대로 입력(비밀번호가 있는 계정은 비밀번호도) → 삭제가 끝나야 창이 닫혀요
  const removeAccount = async () => {
    const pw = user.hasPassword !== false;
    const done = await ask({
      title: '정말 계정을 삭제할까요?',
      body: `리허설 기록과 남은 크레딧이 모두 지워지고 되돌릴 수 없어요.${user.social ? ` ${SOCIAL_NAME[user.social]} 연결도 끊어요.` : ''}`,
      ok: '계정 삭제', danger: true,
      fields: [
        { name: 'phrase', label: <>확인을 위해 <b>{DELETE_PHRASE}</b>를 입력해 주세요</>, placeholder: DELETE_PHRASE, match: DELETE_PHRASE },
        ...(pw ? [{ name: 'password', label: '비밀번호', type: 'password' as const, autoComplete: 'current-password' }] : []),
      ],
      check: async (v) => { await deleteAccount(user.email, pw ? v.password : null); return null; },
    });
    if (!done) return;
    toast('계정을 삭제했어요.');
    router.push('/');
  };

  return (
    <>
      <h1 className="title1">계정 관리</h1>
      <p className="subtitle">{user.social ? `${SOCIAL_NAME[user.social]} 계정(${user.email})으로 로그인했어요.` : `${user.email}로 로그인했어요.`}</p>
      <form className="hub-card" onSubmit={async (e) => {
        e.preventDefault();
        try { await updateName(user.id, val(e.currentTarget, 'name')); await refresh(); toast('이름을 바꿨어요.'); }
        catch (x) { toast((x as Error).message); }
      }}>
        <h2>프로필</h2>
        <label className="field"><span>이름</span><input name="name" type="text" maxLength={20} defaultValue={user.name} required /></label>
        <label className="field field-locked"><span>이메일 <small>로그인에 쓰는 주소라 바꿀 수 없어요</small></span><input type="email" value={user.email} readOnly disabled /></label>
        <button className="btn-fill btn-sm">저장</button>
      </form>
      {user.hasPassword !== false ? (
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
      ) : (
        <section className="hub-card">
          <h2>로그인 방법</h2>
          <p className="hub-note">{SOCIAL_NAME[user.social ?? 'kakao']} 계정으로 로그인해요. 비밀번호는 {SOCIAL_NAME[user.social ?? 'kakao']}에서 관리해요.</p>
        </section>
      )}
      <section className="hub-card hub-danger">
        <h2>계정 삭제</h2>
        <p>계정과 리허설 기록이 모두 지워지고 되돌릴 수 없어요.</p>
        <button type="button" className="btn-plain btn-sm" onClick={removeAccount}>계정 삭제</button>
      </section>
    </>
  );
}
