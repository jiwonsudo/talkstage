'use client';
import { useState } from 'react';
import { useRouter } from '@/lib/nav';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { changePassword, deleteAccount, updateName } from '@/lib/data/profile';

const val = (f: HTMLFormElement, n: string) => String(new FormData(f).get(n) ?? '');
const SOCIAL_NAME = { kakao: '카카오', google: 'Google' } as const;
/** 비밀번호가 없는(소셜로만 가입한) 계정은 이 문구를 그대로 입력해야 삭제돼요. */
const DELETE_PHRASE = '계정 삭제';

export default function Account() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [pwErr, setPwErr] = useState('');
  const [delErr, setDelErr] = useState('');
  if (!user) return null;

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
      <form className="hub-card hub-danger" onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const social = user.hasPassword === false;
        if (social && val(form, 'phrase').trim() !== DELETE_PHRASE) { setDelErr(`확인 칸에 "${DELETE_PHRASE}"를 그대로 입력해 주세요.`); return; }
        if (!(await confirm({ title: '정말 계정을 삭제할까요?', body: user.social ? `리허설 기록도 함께 지워지고 되돌릴 수 없어요. ${SOCIAL_NAME[user.social]} 연결도 끊어요.` : '리허설 기록도 함께 지워지고 되돌릴 수 없어요.', ok: '계정 삭제', danger: true }))) return;
        try { await deleteAccount(user.email, social ? null : val(form, 'password')); toast('계정을 삭제했어요.'); router.push('/'); }
        catch (x) { setDelErr((x as Error).message); }
      }}>
        <h2>계정 삭제</h2>
        <p>계정과 리허설 기록이 모두 지워지고 되돌릴 수 없어요.</p>
        {user.hasPassword === false
          ? <label className="field"><span>확인을 위해 <b>{DELETE_PHRASE}</b>를 입력해 주세요</span><input name="phrase" type="text" autoComplete="off" placeholder={DELETE_PHRASE} required /></label>
          : <label className="field"><span>비밀번호 확인</span><input name="password" type="password" autoComplete="current-password" required /></label>}
        <p className="wiz-err" hidden={!delErr}>{delErr}</p>
        <button className="btn-plain btn-sm">계정 삭제</button>
      </form>
    </>
  );
}
