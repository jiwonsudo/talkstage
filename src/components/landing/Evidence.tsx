export function Evidence() {
  return (
    <section className="block evidence" id="evidence">
      <h2 className="h2 rv"><span className="nw">감이 아니라, 근거로 코칭해요.</span></h2>
      <p className="lead2 rv">모든 피드백은 아래 연구와 원칙 중 하나에 기대고 있어요. 리포트에서도 지적마다 출처를 함께 보여드려요.</p>
      <div className="ev-head rv" aria-hidden="true"><span>출처</span><span>내용</span><span>Talkstage에서</span></div>
      <ul className="ev-grid">
        <li className="rv"><b>Ambady &amp; Rosenthal</b><span>짧은 순간의 비언어 행동만으로도 인상이 형성된다는 ‘thin slices’ 연구</span><em>첫인상 · 시선</em></li>
        <li className="rv" style={{ '--d': '.05s' }}><b>Goldin-Meadow</b><span>제스처가 말의 이해와 기억을 돕는다는 연구</span><em>제스처</em></li>
        <li className="rv" style={{ '--d': '.1s' }}><b>Niebuhr et al.</b><span>카리스마 있게 들리는 목소리의 음높이 변화와 속도 연구</span><em>억양 · 말 속도</em></li>
        <li className="rv" style={{ '--d': '.15s' }}><b>Nancy Duarte</b><span>『Resonate』의 현재와 이상을 오가는 발표 구조</span><em>흐름</em></li>
        <li className="rv" style={{ '--d': '.2s' }}><b>Chris Anderson · TED</b><span>발표 전체를 꿰는 하나의 핵심 메시지(throughline)</span><em>핵심 메시지</em></li>
        <li className="rv" style={{ '--d': '.25s' }}><b>Barbara Minto</b><span>『피라미드 원칙』의 결론 먼저, 근거는 그다음</span><em>결론 먼저</em></li>
        <li className="rv" style={{ '--d': '.3s' }}><b>Toastmasters</b><span>군더더기 말을 세는 ‘Ah-Counter’ 연습법</span><em>군더더기 말</em></li>
      </ul>
    </section>
  );
}
