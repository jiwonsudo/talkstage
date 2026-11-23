import { Picto } from '@/components/ui/Picto';

export function Features() {
  return (
    <section className="block">
      <h2 className="h2 rv"><span className="nw">말과 몸, 그리고 내용까지.</span></h2>
      <div className="bento">
        <article className="bcard b-wide rv">
          <span className="bc-ico art-6">
            <Picto name="voice" />
          </span>
          <b>말 속도 · 호흡 · 억양</b>
          <p>한국어 음절 기준으로 분당 속도를 재고, 숨 없이 이어 말한 구간과 단조로운 구간을 찾아요.</p>
        </article>
        <article className="bcard rv">
          <span className="bc-ico art-7">
            <Picto name="eyes" />
          </span>
          <b>시선</b>
          <p>렌즈를 보는 비율과 시선이 떨어진 순간.</p>
        </article>
        <article className="bcard rv">
          <span className="bc-ico art-4">
            <Picto name="body" />
          </span>
          <b>자세 · 제스처</b>
          <p>구부정함, 기울기, 흔들림, 손 움직임.</p>
        </article>
        <article className="bcard rv">
          <span className="bc-ico art-8">
            <Picto name="words" />
          </span>
          <b>군더더기 말</b>
          <p>“어, 음, 이제, 약간” 같은 습관어.</p>
        </article>
        <article className="bcard rv">
          <span className="bc-ico art-5">
            <Picto name="story" />
          </span>
          <b>내용 구조</b>
          <p>결론 먼저, 숫자 근거, 핵심 메시지 반복, 마지막 요청까지 목적별로 확인해요.</p>
        </article>
      </div>
    </section>
  );
}
