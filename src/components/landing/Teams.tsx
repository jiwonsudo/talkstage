import { ContactButton, StartButton, PlanButton } from './actions';
import { PlansFold, PlansProvider, PlanSwitch, PlanTable } from './Plans';

export function Teams() {
  return (
    <PlansProvider>
    <section className="block" id="teams">
      <div className="teams">
        <div className="teams-copy">
          <h2 className="h2 rv"><span className="nw">팀, 또는 기관이나</span><br /><span className="nw">학교의 발표 기준을</span><br /><span className="nw">한 곳에서 확인하세요.</span></h2>
          <p className="lead2 rv">코치 한 명이 모두를 봐 줄 수는 없어요. 기준은 팀이 정하고, 매일의 연습은 Talkstage가 봐 드려요.</p>
          <ul className="t-feats">
            <li className="rv"><b>팀 기준 설정</b><span>목적, 목표 시간, 꼭 들어가야 할 흐름을 팀 기준으로 고정해요.</span></li>
            <li className="rv"><b>리허설 과제</b><span>신입 PT, 분기 보고, 고객 피칭을 과제로 보내고 제출을 확인해요.</span></li>
            <li className="rv"><b>팀 대시보드</b><span>연습 횟수, 점수 추이, 팀에서 자주 나오는 약점을 한눈에 봐요.</span></li>
            <li className="rv"><b>영상은 구성원 기기에</b><span>분석은 구성원 브라우저에서 끝나고, 관리자는 점수와 요약만 봐요.</span></li>
          </ul>
          <ContactButton className="btn-fill">
            도입 문의하기
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </ContactButton>
        </div>
        <div className="dash rv" aria-hidden="true">
          <div className="dash-top"><b>영업팀</b><span>이번 달</span></div>
          <div className="dash-kpi">
            <div><span>리허설</span><b>128</b><small>회</small></div>
            <div><span>평균 점수</span><b>76</b><small className="up">+6</small></div>
            <div><span>목표 시간 준수</span><b>82</b><small>%</small></div>
          </div>
          <div className="dash-chart">
            <p className="dash-h">평균 점수 · 주별</p>
            <div className="dc-plot">
            <svg viewBox="0 0 300 80" preserveAspectRatio="none">
              <path className="dc-grid" d="M0 20H300M0 45H300M0 70H300" />
              <path className="dc-line" d="M0 62 L37.5 58 L75 60 L112.5 51 L150 53 L187.5 44 L225 40 L262.5 36 L300 28" />
            </svg>
            <span className="dc-dot" style={{ '--x': '100%', '--y': '35%' }}><b>76</b></span>
            </div>
            <div className="dc-ticks"><span>1주</span><span>2주</span><span>3주</span><span>4주</span></div>
          </div>
          <p className="dash-h">팀에서 자주 나오는 약점</p>
          <ul className="dash-bars">
            <li><span>결론이 늦음</span><i style={{ '--v': '.68' }} /><b>68%</b></li>
            <li><span>말끝 흐림</span><i style={{ '--v': '.44' }} /><b>44%</b></li>
            <li><span>시선 이탈</span><i style={{ '--v': '.31' }} /><b>31%</b></li>
          </ul>
          <ul className="dash-people">
            <li><span className="av" style={{ '--h': '20' }}>민</span><span>김민준</span><small>연습 14회</small><b>84</b></li>
            <li><span className="av" style={{ '--h': '200' }}>서</span><span>이서연</span><small>연습 11회</small><b>79</b></li>
            <li><span className="av" style={{ '--h': '300' }}>도</span><span>박도윤</span><small>연습 6회</small><b className="lo">61</b></li>
          </ul>
        </div>
      </div>
      <PlansFold>
      <PlanSwitch />
      <PlanTable className="cmp cmp-3 rv" role="table" aria-label="개인 요금제 비교" which="solo">
        <div className="cmp-head" role="row">
          <div className="cmp-lab" role="columnheader"><b>개인 요금제</b><small>쓴 만큼 크레딧이 줄어요. 리허설 한 번(녹화 10분 + 대본 점검)에 12크레딧이에요.</small></div>
          <div className="cmp-plan" role="columnheader">
            <h3>Opening<span>처음 서 보는 무대</span></h3>
            <p>무료</p>
            <small>월 36크레딧 · 리허설 약 3회</small>
            <StartButton className="btn-plain btn-sm">무료로 시작</StartButton>
          </div>
          <div className="cmp-plan is-hi" role="columnheader">
            <h3>Spotlight<span>매주 연습하는 사람</span></h3>
            <p>월 4,900원</p>
            <small>연간 결제 시 월 3,900원 · 월 120크레딧</small>
            <PlanButton className="btn-fill btn-sm" plan="Spotlight">Spotlight 시작</PlanButton>
          </div>
          <div className="cmp-plan" role="columnheader">
            <h3>Headliner<span>큰 발표를 앞둔 사람</span></h3>
            <p>월 9,900원</p>
            <small>연간 결제 시 월 7,900원 · 월 360크레딧</small>
            <PlanButton className="btn-plain btn-sm" plan="Headliner">Headliner 시작</PlanButton>
          </div>
        </div>
        <div className="cmp-group" role="row"><span role="rowheader">크레딧</span></div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">월 크레딧</div>
          <div className="cmp-cell" role="cell">36</div>
          <div className="cmp-cell" role="cell">120</div>
          <div className="cmp-cell" role="cell">360</div>
        </div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">예상 리허설 횟수</div>
          <div className="cmp-cell" role="cell">월 약 3회</div>
          <div className="cmp-cell" role="cell">월 약 10회</div>
          <div className="cmp-cell" role="cell">월 약 30회</div>
        </div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">남은 크레딧 이월</div>
          <div className="cmp-cell" role="cell"><span className="no" aria-label="없음">—</span></div>
          <div className="cmp-cell" role="cell">다음 달까지</div>
          <div className="cmp-cell" role="cell">다음 달까지</div>
        </div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">크레딧 추가 구매</div>
          <div className="cmp-cell" role="cell"><span className="no" aria-label="없음">—</span></div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
        </div>
        <div className="cmp-group" role="row"><span role="rowheader">리허설</span></div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">하이라이트 리포트</div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
        </div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">리포트 보관</div>
          <div className="cmp-cell" role="cell">최근 3개</div>
          <div className="cmp-cell" role="cell">전체</div>
          <div className="cmp-cell" role="cell">전체</div>
        </div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">지난 연습과 비교</div>
          <div className="cmp-cell" role="cell"><span className="no" aria-label="없음">—</span></div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
        </div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">하이라이트 클립 저장</div>
          <div className="cmp-cell" role="cell"><span className="no" aria-label="없음">—</span></div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
        </div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">발표 유형 · 목표 직접 입력</div>
          <div className="cmp-cell" role="cell"><span className="no" aria-label="없음">—</span></div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
        </div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">리포트 PDF 내보내기</div>
          <div className="cmp-cell" role="cell"><span className="no" aria-label="없음">—</span></div>
          <div className="cmp-cell" role="cell"><span className="no" aria-label="없음">—</span></div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
        </div>
      </PlanTable>
      <PlanTable className="cmp cmp-2 rv" role="table" aria-label="단체 요금제 비교" which="team">
        <div className="cmp-head" role="row">
          <div className="cmp-lab" role="columnheader"><b>단체 요금제</b><small>인원과 기간에 맞춰 견적을 드려요. 크레딧은 구성원이 함께 써요.</small></div>
          <div className="cmp-plan is-hi" role="columnheader">
            <h3>대학 · 교육기관<span>학과 · 수업 · 취업지원센터</span></h3>
            <p>1인당 월 2,900원부터</p>
            <small>학기 단위 · 30명부터</small>
            <ContactButton className="btn-fill btn-sm" kind="edu">도입 문의</ContactButton>
          </div>
          <div className="cmp-plan" role="columnheader">
            <h3>팀 · 기업<span>영업 · 기획 · 신입 교육</span></h3>
            <p>1인당 월 7,900원부터</p>
            <small>연 단위 · 10명부터</small>
            <ContactButton className="btn-plain btn-sm" kind="biz">도입 문의</ContactButton>
          </div>
        </div>
        <div className="cmp-group" role="row"><span role="rowheader">크레딧</span></div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">1인당 월 크레딧</div>
          <div className="cmp-cell" role="cell">120</div>
          <div className="cmp-cell" role="cell">360</div>
        </div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">크레딧 공유</div>
          <div className="cmp-cell" role="cell">수업 · 반 단위</div>
          <div className="cmp-cell" role="cell">팀 단위</div>
        </div>
        <div className="cmp-group" role="row"><span role="rowheader">리허설</span></div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">개인 Spotlight 기능 전체</div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
        </div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">리포트 PDF 내보내기</div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
        </div>
        <div className="cmp-group" role="row"><span role="rowheader">운영</span></div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">발표 기준 템플릿</div>
          <div className="cmp-cell" role="cell">졸업 · 과제 발표</div>
          <div className="cmp-cell" role="cell">팀 맞춤</div>
        </div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">리허설 과제 보내기</div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
        </div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">연습 현황</div>
          <div className="cmp-cell" role="cell">학생별</div>
          <div className="cmp-cell" role="cell">팀 대시보드</div>
        </div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">사내 계정 연동 (SSO)</div>
          <div className="cmp-cell" role="cell"><span className="no" aria-label="없음">—</span></div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
        </div>
        <div className="cmp-row" role="row">
          <div className="cmp-lab" role="rowheader">도입 · 교육 지원</div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <div className="cmp-cell" role="cell">
            <svg className="ck" viewBox="0 0 24 24" aria-label="포함">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
        </div>
      </PlanTable>
      </PlansFold>
    </section>
    </PlansProvider>
  );
}
