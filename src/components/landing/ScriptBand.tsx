import { StartButton } from './actions';

export function ScriptBand() {
  return (
    <section className="block">
      <div className="script-band rv">
        <div className="sb-copy">
          <h2><span className="nw">카메라 켜기 전에,</span><br /><span className="nw">대본부터.</span></h2>
          <p>리허설을 시작하면 녹화 직전에 대본을 받아요. 붙여넣거나 파일로 올리면 목표 시간에 맞는지, 흐름이 끊기는 곳은 없는지, 한 호흡에 읽기 버거운 문장은 어디인지 먼저 짚어 드려요. 숨 쉴 자리와 강조할 단어를 표시하고 예시 억양으로 읽어 들려줘요. 대본이 없으면 이 단계는 건너뛰어요.</p>
          <StartButton className="btn-white">
            리허설 시작하기
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </StartButton>
        </div>
        <ul className="sb-points">
          <li><b>시간</b><span>목적에 맞는 속도로 읽었을 때의 예상 시간</span></li>
          <li><b>흐름</b><span>목적별 필수 요소가 순서대로 있는지</span></li>
          <li><b>문장</b><span>긴 문장, 망설이는 표현, 같은 말끝 반복</span></li>
          <li><b>억양</b><span>쉼 · 강조 · 말끝 방향과 예시 낭독</span></li>
        </ul>
      </div>
    </section>
  );
}
