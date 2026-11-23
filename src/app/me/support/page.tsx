'use client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { sendSupport } from '@/lib/data/profile';

const FAQ: [string, string][] = [
  ['녹화한 영상은 어디에 저장되나요?', '영상과 음성은 이 브라우저 안에서만 분석하고 서버로 보내지 않아요. 리포트를 닫으면 영상은 사라지고 점수 기록만 남아요.'],
  ['카메라나 마이크가 안 잡혀요.', '주소창의 카메라 아이콘에서 권한을 허용해 주세요. 다른 앱(줌, 팀즈)이 카메라를 쓰고 있으면 먼저 꺼 주세요.'],
  ['크레딧은 언제 다시 채워지나요?', '매달 1일에 요금제만큼 채워져요. Spotlight 이상은 남은 크레딧을 다음 달까지 쓸 수 있어요.'],
  ['요금제를 바꾸거나 해지하고 싶어요.', '요금제 탭에서 바로 바꿀 수 있어요. 해지하면 다음 결제일부터 Opening(무료)으로 바뀌어요.'],
];

export default function Support() {
  const { user } = useAuth();
  const toast = useToast();
  if (!user) return null;
  return (
    <>
      <h1 className="title1">지원 받기</h1>
      <p className="subtitle">자주 묻는 질문을 먼저 확인해 보세요.</p>
      <div className="hub-faq">
        {FAQ.map(([q, a]) => <details key={q} className="custom-box"><summary>{q}</summary><p>{a}</p></details>)}
      </div>
      <form className="hub-card" onSubmit={async (e) => {
        e.preventDefault();
        const f = e.currentTarget;
        try { await sendSupport(String(new FormData(f).get('msg') ?? '')); f.reset(); toast('문의를 남겼어요. 메일로 답장을 드릴게요.'); }
        catch { toast('문의를 보내지 못했어요. 잠시 뒤에 다시 시도해 주세요.'); }
      }}>
        <h2>문의 남기기</h2>
        <p className="hub-hint">{user.email}로 답장을 드려요.</p>
        <label className="field"><span>내용</span><textarea name="msg" rows={5} maxLength={1000} required placeholder="어떤 화면에서 무엇이 안 되는지 적어 주시면 빨리 도와드릴 수 있어요." /></label>
        <button className="btn-fill btn-sm">보내기</button>
      </form>
    </>
  );
}
