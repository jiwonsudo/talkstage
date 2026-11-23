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
        <p className="display-sub rv" style={{ '--d': '.25s' }}>면접관에게도, 투자자에게도, 교수님과 고객에게도.<br />청중에게 마지막으로 닿는 건 결국 당신의 발표예요.</p>
        <p className="lede rv" style={{ '--d': '.35s' }}>졸업 발표장에서, 면접장에서, 회의실에서. 그 차례가 왔을 때 흔들리지 않도록 Talkstage가 대본부터 점검하고, 녹화 한 번으로 자세·시선·말 속도·호흡·억양을 짚어 드려요.</p>
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
