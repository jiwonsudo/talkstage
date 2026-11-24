import { StartButton } from './actions';
import { HeroDial } from './HeroDial';

export function Hero() {
  return (
    <div className="hero hero-arc">
      <div className="hero-copy">
        <h1 className="display display-k" style={{ marginTop: 0 }}>
          <span className="ln"><span>무엇을 만들었든,</span></span>
          <span className="ln"><span>결국 전해지는 건</span></span>
          <span className="ln"><span className="grad">이야기예요.</span></span>
        </h1>
        <p className="display-sub rv" style={{ '--d': '.25s' }}><b>Talkstage</b>는 중요한 발표 한 번을 앞두고, 녹화할 때마다 말과 몸짓을 코칭해 주는 리허설 코치예요.</p>
        <p className="lede rv" style={{ '--d': '.35s' }}>면접·IR·졸업 발표처럼 상황마다 다른 기준으로 대본을 점검하고, 같은 발표를 세네 번 연습하며 시선·자세·말 속도·억양이 어떻게 나아지는지 보여 드려요.</p>
        <div className="hero-cta rv" style={{ '--d': '.45s' }}>
          <StartButton className="btn-fill btn-xl">
            첫 리허설 시작하기
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </StartButton>
          <a href="#pick" className="btn-text">발표 상황 고르기</a>
        </div>
        <p className="lang-note rv" style={{ '--d': '.6s' }}><span lang="en">English rehearsal</span> 영어 발표 코칭은 추후 출시 예정이에요.</p>
      </div>
      <HeroDial />
    </div>
  );
}
