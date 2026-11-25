'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { sendSupport, type SupportCategory } from '@/lib/data/profile';
import { CREDIT_PER_REHEARSAL } from '@/lib/plans';
import { AI_COACH_TIERS } from '@/lib/coach/scriptCoach';

// 지원 받기: 주제별로 모은 자주 묻는 질문 → 그래도 안 풀리면 직접 문의(분류 + 내용 + 개인정보 수집·이용 동의).
// 문의는 Supabase support_requests 표에 저장돼요(대시보드 Table Editor 에서 확인).

const AI = AI_COACH_TIERS.map((t) => t.credits).join('·');
const FAQ: { title: string; items: [string, string][] }[] = [
  { title: '녹화·분석', items: [
    ['녹화한 영상은 어디에 저장되나요?', '영상과 음성은 이 브라우저 안에서만 분석하고 서버로 보내지 않아요. 서버에는 점수·코칭 요약 같은 기록만 저장돼요. 리포트를 닫으면 영상은 사라지니, 남기고 싶은 구간은 리포트에서 하이라이트 클립으로 저장해 주세요.'],
    ['카메라나 마이크가 안 잡혀요.', '주소창 왼쪽의 자물쇠(또는 카메라) 아이콘에서 카메라·마이크를 "허용"으로 바꾼 뒤 새로고침해 주세요. 줌·팀즈·다른 브라우저 탭이 카메라를 쓰고 있으면 먼저 꺼 주세요. 폰에서는 설정 앱 → 브라우저 → 카메라·마이크 권한도 확인해 주세요.'],
    ['녹화했는데 점수가 안 나오고 다시 녹화하래요.', '20초보다 짧거나, 실제로 말한 시간이 8초(또는 녹화 길이의 20%)보다 적으면 리허설로 치지 않아요. 이때는 크레딧도 빠지지 않아요. 마이크가 음소거돼 있지 않은지 확인해 주세요.'],
    ['녹화 중에 다른 앱으로 나갔어요.', '나간 순간 녹화가 멈춰요. 돌아오면 "여기까지 분석(20초 이상일 때)"과 "다시 녹화" 중에 고를 수 있어요.'],
    ['화면에 다른 사람이 같이 찍혀요.', '처음엔 가장 크게 찍힌 사람을 발표자로 봐요. 다른 사람을 따라가면 녹화 화면에서 본인을 한 번 눌러 주세요.'],
    ['화면을 보거나 제품을 들었는데 시선 감점이 되나요?', '아니요. IR·시연·제품 소개처럼 보여 줄 것이 있는 발표에서는 가리키거나 들어 보이는 동안과 그 직후는 시선 채점에서 빼요. 대신 가리킨 뒤 청중에게 다시 돌아오는지를 봐요. 면접처럼 목적이 다르면 기준도 달라요.'],
  ] },
  { title: '크레딧·요금제', items: [
    ['크레딧은 어떻게 빠지나요?', `리허설 한 번에 ${CREDIT_PER_REHEARSAL}크레딧(녹화 길이와 관계없음), AI 대본 코칭은 대본 길이에 따라 ${AI}크레딧이에요. AI 코칭은 받기 전에 몇 크레딧인지 먼저 보여 드리고, 실패하면 빠지지 않아요. 기록을 지워도 쓴 크레딧은 돌아오지 않아요.`],
    ['크레딧은 언제 다시 채워지나요?', '매달 1일(한국 시간)에 요금제만큼 다시 채워져요. 남은 이번 달 크레딧은 다음 달로 넘어가지 않아요. 따로 산 크레딧은 기한 없이 남고, 이번 달 크레딧을 다 쓴 뒤에 쓰여요.'],
    ['요금제를 올리면 바로 적용되나요?', '네, 결제하는 즉시 올라가요. 이미 쓰던 유료 요금제에서 올리면 남은 기간만큼 뺀 금액만 결제해요.'],
    ['요금제를 내리거나 해지하고 싶어요.', '요금제 관리에서 "다운그레이드"를 눌러 주세요. 이미 결제한 기간이 끝날 때까지는 지금 요금제를 그대로 쓰고, 다음 결제일부터 바뀌어요. 그전에는 언제든 예약을 취소할 수 있어요.'],
    ['크레딧만 따로 살 수 있나요?', '네, 요금제 관리 아래 "크레딧 추가 구매"에서 살 수 있어요. 다만 크레딧 1개 값이 구독보다 비싸서, 매달 쓴다면 요금제를 올리는 편이 이득이에요.'],
  ] },
  { title: '결제·환불', items: [
    ['결제 내역은 어디서 보나요?', '메뉴의 "결제·크레딧 내역"에서 요금제 결제·크레딧 구매와 크레딧을 쓴 기록을 함께 볼 수 있어요.'],
    ['정기 결제가 실패했어요.', '하루에 한 번씩 최대 3번 다시 시도하고, 그래도 안 되면 Opening(무료)으로 바뀌어요. 요금제 관리 → "카드 바꾸기"에서 카드를 바꿔 주세요.'],
    ['환불받고 싶어요.', '아래 직접 문의에서 "결제·환불"을 골라 결제 일시와 사유를 적어 주세요. 결제 내역과 크레딧 사용 여부를 확인해 안내해 드려요.'],
  ] },
  { title: '계정·개인정보', items: [
    ['카카오·Google로 가입했는데 비밀번호가 없어요.', '소셜 로그인 계정은 비밀번호 없이 그 서비스로 로그인해요. 계정 관리에서 로그인 방법을 확인할 수 있어요.'],
    ['계정을 지우고 싶어요.', '계정 관리 맨 아래에서 삭제할 수 있어요. 리허설 기록·설정이 모두 지워지고 되돌릴 수 없어요. 카카오로 가입했다면 카카오 연결도 함께 끊어요.'],
    ['어떤 정보가 저장되나요?', '이메일, 이름, 요금제·결제 기록, 리허설 점수·코칭 요약, 문의 내용이에요. 녹화 영상과 음성은 저장하지 않아요. 대본은 이 기기에만 남고, AI 대본 코칭을 받을 때만 분석을 위해 서버로 보내요.'],
  ] },
];

const CATS: { id: SupportCategory; label: string }[] = [
  { id: 'record', label: '녹화·카메라' },
  { id: 'report', label: '분석·리포트' },
  { id: 'credit', label: '크레딧·요금제' },
  { id: 'payment', label: '결제·환불' },
  { id: 'account', label: '계정·로그인' },
  { id: 'etc', label: '그 밖의 문의' },
];
const MIN = 10;

export default function Support() {
  const { user } = useAuth();
  const toast = useToast();
  const [cat, setCat] = useState<SupportCategory | ''>('');
  const [msg, setMsg] = useState('');
  const [agree, setAgree] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const catRef = useRef<HTMLSelectElement>(null), msgRef = useRef<HTMLTextAreaElement>(null), agreeRef = useRef<HTMLInputElement>(null);
  if (!user) return null;

  const n = msg.trim().length;
  const err = {
    cat: cat ? '' : '문의 분류를 골라 주세요.',
    msg: n >= MIN ? '' : n ? `${MIN}자 이상 적어 주세요(지금 ${n}자).` : '내용을 적어 주세요.',
    agree: agree ? '' : '개인정보 수집·이용에 동의해야 문의를 보낼 수 있어요.',
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const first = err.cat ? catRef : err.msg ? msgRef : err.agree ? agreeRef : null;
    if (first) {
      setTried(true);
      first.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      first.current?.focus({ preventScroll: true });
      return;
    }
    setBusy(true);
    try {
      await sendSupport({ message: msg, category: cat as SupportCategory, consentAt: new Date().toISOString() });
      setCat(''); setMsg(''); setAgree(false); setTried(false);
      toast(`문의를 남겼어요. ${user.email}로 답장을 드릴게요.`);
    } catch { toast('문의를 보내지 못했어요. 잠시 뒤에 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <h1 className="title1">지원 받기</h1>
      <p className="subtitle">자주 묻는 질문을 먼저 확인해 보세요. 그래도 해결되지 않으면 아래에서 직접 문의해 주세요.</p>

      <section className="faq-groups" aria-label="자주 묻는 질문">
        {FAQ.map((g) => (
          <div key={g.title} className="faq-group">
            <h2 className="hub-sub">{g.title}</h2>
            <div className="hub-faq">
              {g.items.map(([q, a]) => <details key={q} className="custom-box"><summary>{q}</summary><p>{a}</p></details>)}
            </div>
          </div>
        ))}
      </section>

      <form className="hub-card support-form" onSubmit={send} noValidate>
        <h2>직접 문의하기</h2>
        <p className="hub-hint">{user.email}로 답장을 드려요. 결제 문의는 <Link href="/me/billing" className="link-btn">결제·크레딧 내역</Link>의 결제 일시를 같이 적어 주시면 빨라요.</p>
        <label className={`field${tried && err.cat ? ' is-bad' : ''}`}>
          <span>문의 분류 <em className="req">필수</em></span>
          <select ref={catRef} value={cat} onChange={(e) => setCat(e.target.value as SupportCategory)} aria-invalid={(tried && !!err.cat) || undefined}>
            <option value="" disabled>골라 주세요</option>
            {CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {tried && err.cat && <em className="field-err" role="alert">{err.cat}</em>}
        </label>
        <label className={`field${tried && err.msg ? ' is-bad' : ''}`}>
          <span>내용 <em className="req">필수</em></span>
          <textarea ref={msgRef} rows={6} maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} aria-invalid={(tried && !!err.msg) || undefined}
            placeholder="어떤 화면에서 무엇을 했을 때 어떻게 됐는지 적어 주시면 빨리 도와드릴 수 있어요." />
          <small className="count-line">{n} / 2,000자 · {MIN}자 이상</small>
          {tried && err.msg && <em className="field-err" role="alert">{err.msg}</em>}
        </label>
        <div className={`consent${tried && err.agree ? ' is-bad' : ''}`}>
          <table className="consent-tbl">
            <caption>개인정보 수집·이용 안내</caption>
            <tbody>
              <tr><th scope="row">수집 항목</th><td>이메일 주소, 문의 분류·내용, 계정 식별자</td></tr>
              <tr><th scope="row">이용 목적</th><td>문의 확인과 답변, 처리 기록 관리</td></tr>
              <tr><th scope="row">보유 기간</th><td>답변 완료 후 3년(전자상거래법의 소비자 불만·분쟁 처리 기록 보존 기간). 계정을 삭제하면 바로 지워요.</td></tr>
            </tbody>
          </table>
          <p>동의하지 않을 수 있어요. 다만 동의하지 않으면 문의를 접수할 수 없어요.</p>
          <label className="consent-check">
            <input ref={agreeRef} type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} aria-invalid={(tried && !!err.agree) || undefined} />
            <span>위 개인정보 수집·이용에 동의해요 <em className="req">필수</em></span>
          </label>
          {tried && err.agree && <em className="field-err" role="alert">{err.agree}</em>}
        </div>
        <button className="btn-fill" disabled={busy}>{busy ? '보내는 중…' : '문의 보내기'}</button>
      </form>
    </>
  );
}
