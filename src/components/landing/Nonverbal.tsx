import { NvDemo } from './NvDemo';

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
      <NvDemo />
    </section>
  );
}
