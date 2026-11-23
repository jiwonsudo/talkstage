import { Picto } from '@/components/ui/Picto';

export function Who() {
  return (
    <section className="block" id="who">
      <h2 className="h2 rv"><span className="nw">발표가 평가가 되는 모든 사람에게.</span></h2>
      <div className="who">
        <article className="who-c rv">
          <span className="who-ico art-6">
            <Picto name="capstone" />
          </span>
          <h3>대학생 · 취업 준비생</h3>
          <p>교수님과 면접관 앞에 서기 전에.</p>
          <ul>
            <li>졸업 프로젝트 · 과제 발표</li>
            <li>PT 면접 · 1분 자기소개</li>
            <li>공모전 · 데모데이 피칭</li>
          </ul>
        </article>
        <article className="who-c rv" style={{ '--d': '.06s' }}>
          <span className="who-ico art-2">
            <Picto name="report" />
          </span>
          <h3>직장인</h3>
          <p>회의실의 5분이 곧 평가가 되는 사람에게.</p>
          <ul>
            <li>주간 보고 · 의사결정 회의</li>
            <li>투자 · 영업 피칭</li>
            <li>컨퍼런스 · 사내 세미나</li>
          </ul>
        </article>
        <article className="who-c rv" style={{ '--d': '.12s' }}>
          <span className="who-ico art-8">
            <Picto name="conference" />
          </span>
          <h3>팀 · 기업 · 교육기관</h3>
          <p>구성원 모두의 발표 기준을 맞추고 싶은 조직에게.</p>
          <ul>
            <li>신입 온보딩 · 리더십 교육</li>
            <li>영업 · IR 팀 리허설</li>
            <li>학과 · 취업지원센터</li>
          </ul>
          <a href="#teams" className="btn-text">팀으로 도입하기</a>
        </article>
      </div>
    </section>
  );
}
