import { NvFrame } from './NvFrame';

export function Nonverbal() {
  return (
    <section className="block nv" id="nonverbal">
      <h2 className="catch rv">
        <span>말보다 먼저</span>
        <span><em className="grad">보이는 것들.</em></span>
      </h2>
      <p className="catch-sub rv" style={{ '--d': '.1s' }}>같은 대본도 서 있는 자세, 시선이 머무는 곳, 손의 움직임, 목소리의 높낮이에 따라 전혀 다르게 들려요. <b>청중은 첫 문장을 듣기 전에 이미 이것부터 읽어요.</b></p>
      <blockquote className="nv-quote rv">
        <svg className="nv-qmark" viewBox="0 0 56 48" aria-hidden="true">
          <path d="M0 48V24A24 24 0 0 1 24 0V48Z" style={{ fill: 'var(--blue)' }} />
          <path d="M32 48V24A24 24 0 0 1 56 0V48Z" style={{ fill: 'var(--pink)' }} />
        </svg>
        <svg className="nv-qart" viewBox="0 0 200 200" aria-hidden="true">
          <path d="M0 100A100 100 0 0 1 100 0V100Z" style={{ fill: 'var(--blue)' }} />
          <circle cx="150" cy="50" r="50" style={{ fill: 'var(--red)' }} />
          <rect x="100" y="100" width="100" height="100" rx="18" style={{ fill: 'var(--ink)' }} />
          <path d="M0 200A100 100 0 0 1 100 100V200Z" style={{ fill: 'var(--pink)' }} />
          <circle cx="150" cy="150" r="22" style={{ fill: '#fff' }} />
          <rect x="128" y="146" width="44" height="8" rx="4" transform="rotate(-45 150 150)" style={{ fill: 'var(--ink)' }} />
        </svg>
        <p>소리를 끈 <em>30초</em>짜리 강의 영상만 보고도,<br />사람들은 학기 말 강의 평가를 꽤 정확하게 맞혔어요.</p>
        <cite>Ambady &amp; Rosenthal, 1993 · ‘thin slices’ 연구</cite>
      </blockquote>
      <p className="nv-try rv">직접 확인해 보세요. 두 영상 모두 소리를 껐어요.</p>
      <div className="nv-pair">
        <figure className="nv-vid nv-a rv">
          <NvFrame src="/media/nv-a.mp4">
            <div className="nv-empty"><span>예시 영상 자리</span><small>media/nv-a.mp4</small></div>
            <span className="nv-mute" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 9h4l5-4v14l-5-4H4z" />
                <path d="M17 9l4 6M21 9l-4 6" />
              </svg>
              소리 꺼짐
            </span>
            <ul className="nv-meter">
              <li style={{ '--c': 'var(--blue)' }}><b>시선</b>렌즈 22%</li>
              <li style={{ '--c': 'var(--green)' }}><b>자세</b>기울기 8°</li>
              <li style={{ '--c': 'var(--orange)' }}><b>손</b>움직임 없음</li>
            </ul>
          </NvFrame>
          <figcaption><b>대본만 읽은 발표</b><span>같은 내용, 같은 사람</span></figcaption>
        </figure>
        <figure className="nv-vid nv-b rv">
          <NvFrame src="/media/nv-b.mp4">
            <div className="nv-empty"><span>예시 영상 자리</span><small>media/nv-b.mp4</small></div>
            <span className="nv-mute" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 9h4l5-4v14l-5-4H4z" />
                <path d="M17 9l4 6M21 9l-4 6" />
              </svg>
              소리 꺼짐
            </span>
            <ul className="nv-meter">
              <li style={{ '--c': 'var(--blue)' }}><b>시선</b>렌즈 71%</li>
              <li style={{ '--c': 'var(--green)' }}><b>자세</b>수평</li>
              <li style={{ '--c': 'var(--orange)' }}><b>손</b>강조 3회</li>
            </ul>
          </NvFrame>
          <figcaption><b>전달한 발표</b><span>Talkstage 코칭 세 번 뒤</span></figcaption>
        </figure>
      </div>
      <ul className="nv-list">
        <li className="rv" style={{ '--c': 'var(--blue)' }}><b>시선</b><span>렌즈를 보는 비율, 시선이 떨어진 순간</span></li>
        <li className="rv" style={{ '--c': 'var(--green)' }}><b>자세</b><span>어깨 기울기, 몸의 흔들림</span></li>
        <li className="rv" style={{ '--c': 'var(--orange)' }}><b>손</b><span>강조할 때 손이 함께 움직이는지</span></li>
        <li className="rv" style={{ '--c': 'var(--pink)' }}><b>목소리</b><span>억양의 폭, 핵심어 앞의 쉼</span></li>
      </ul>
    </section>
  );
}
