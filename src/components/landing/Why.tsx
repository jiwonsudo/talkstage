import { Timeline } from './Timeline';

export function Why() {
  return (
    <section className="block why" id="why">
      <h2 className="catch rv">
        <span>다양한 주제의 프레젠테이션을</span>
        <span><em className="grad">더 효과적으로</em> 청중에게</span>
        <span>전달해보세요.</span>
      </h2>
      <p className="catch-sub rv" style={{ '--d': '.1s' }}>면접은 결론부터, 투자 미팅은 문제부터, 축사는 이야기부터. <b>주제가 달라지면 발표를 끌고 가는 순서도 달라져야 해요.</b> Talkstage는 고른 주제에 맞는 흐름으로 대본과 녹화를 봐 드려요.</p>
      <Timeline className="tline rv" aria-label="발표 상황별 말하는 순서">
        <div className="tl-ruler" aria-hidden="true"><span>시작</span><span>끝</span></div>
        <div className="tl-row" style={{ '--c': 'var(--red)' }}>
          <div className="tl-name">
            <b>면접<small>1분</small></b>
            <span>첫 대답에서 인상이 정해져요.</span>
          </div>
          <div className="tl-track">
            <i className="tl-clip is-key" style={{ '--w': '20' }}><span>결론</span></i>
            <i className="tl-clip" style={{ '--w': '30' }}><span>근거</span></i>
            <i className="tl-clip" style={{ '--w': '30' }}><span>사례</span></i>
            <i className="tl-clip" style={{ '--w': '20' }}><span>기여</span></i>
          </div>
        </div>
        <div className="tl-row" style={{ '--c': 'var(--blue)' }}>
          <div className="tl-name">
            <b>업무 보고<small>5분</small></b>
            <span>결론이 늦으면 결정도 늦어요.</span>
          </div>
          <div className="tl-track">
            <i className="tl-clip is-key" style={{ '--w': '15' }}><span>결론</span></i>
            <i className="tl-clip" style={{ '--w': '30' }}><span>현황</span></i>
            <i className="tl-clip" style={{ '--w': '30' }}><span>이슈</span></i>
            <i className="tl-clip is-key" style={{ '--w': '25' }}><span>요청</span></i>
          </div>
        </div>
        <div className="tl-row" style={{ '--c': 'var(--orange)' }}>
          <div className="tl-name">
            <b>투자 미팅<small>10분</small></b>
            <span>숫자보다 확신이 먼저 들려요.</span>
          </div>
          <div className="tl-track">
            <i className="tl-clip" style={{ '--w': '15' }}><span>문제</span></i>
            <i className="tl-clip" style={{ '--w': '20' }}><span>해결</span></i>
            <i className="tl-clip" style={{ '--w': '15' }}><span>시장</span></i>
            <i className="tl-clip" style={{ '--w': '20' }}><span>지표</span></i>
            <i className="tl-clip" style={{ '--w': '10' }}><span>팀</span></i>
            <i className="tl-clip is-key" style={{ '--w': '20' }}><span>요청</span></i>
          </div>
        </div>
        <div className="tl-row" style={{ '--c': 'var(--green)' }}>
          <div className="tl-name">
            <b>졸업 발표<small>10분</small></b>
            <span>결과까지 가는 길이 보여야 해요.</span>
          </div>
          <div className="tl-track">
            <i className="tl-clip" style={{ '--w': '18' }}><span>문제</span></i>
            <i className="tl-clip" style={{ '--w': '30' }}><span>방법 · 구현</span></i>
            <i className="tl-clip is-key" style={{ '--w': '37' }}><span>결과 · 데모</span></i>
            <i className="tl-clip" style={{ '--w': '15' }}><span>배운 점</span></i>
          </div>
        </div>
        <div className="tl-row" style={{ '--c': 'var(--pink)' }}>
          <div className="tl-name">
            <b>축사<small>3분</small></b>
            <span>남는 건 결국 한 문장이에요.</span>
          </div>
          <div className="tl-track">
            <i className="tl-clip" style={{ '--w': '15' }}><span>인사</span></i>
            <i className="tl-clip" style={{ '--w': '45' }}><span>일화</span></i>
            <i className="tl-clip" style={{ '--w': '25' }}><span>덕담</span></i>
            <i className="tl-clip is-key" style={{ '--w': '15' }}><span>건배</span></i>
          </div>
        </div>
        <div className="tl-head" aria-hidden="true"><i /></div>
      </Timeline>
      <p className="why-close rv">그 몇 분, 이제 연습하고 들어가세요.</p>
    </section>
  );
}
