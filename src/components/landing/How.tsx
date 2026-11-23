import { Picto } from '@/components/ui/Picto';

export function How() {
  return (
    <section className="block" id="how">
      <h2 className="h2 rv"><span className="nw">세 단계면 충분해요.</span></h2>
      <div className="steps">
        <article className="step-card rv" style={{ '--d': '0s' }}>
          <span className="sc-num art-1">
            <Picto name="choose" />
          </span>
          <h3>상황 고르기</h3>
          <p>목적, 자세, 원하는 결과, 시간, 걱정되는 점. 다섯 번 탭하고 발표 내용을 자유롭게 적어요.</p>
        </article>
        <article className="step-card rv" style={{ '--d': '.1s' }}>
          <span className="sc-num art-3">
            <Picto name="record" />
          </span>
          <h3>녹화하기</h3>
          <p>3초 동안 기준 자세와 소음을 잰 뒤, 실시간 코칭 알림을 받으며 발표해요.</p>
        </article>
        <article className="step-card rv" style={{ '--d': '.2s' }}>
          <span className="sc-num art-2">
            <Picto name="highlights" />
          </span>
          <h3>하이라이트 리포트</h3>
          <p>잘한 순간과 고칠 순간을 자동으로 잘라 보여주고, 연구와 전문가 근거로 고칠 방법을 알려줘요.</p>
        </article>
      </div>
    </section>
  );
}
