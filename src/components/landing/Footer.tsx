import { BrandMark } from '@/components/ui/BrandMark';
import { FooterAction, PurposeButton, ContactButton } from './actions';

export function Footer() {
  return (
    <footer className="foot">
      <div className="foot-top">
        <div className="foot-id">
          <span className="foot-brand">
            <BrandMark />
            <b>Talkstage</b>
          </span>
          <p>사람 앞에 설 차례를 위한 발표 리허설.</p>
        </div>
        <nav className="foot-cols" aria-label="바로 가기">
          <div>
            <h3>제품</h3>
            <FooterAction fx="new">녹화 리허설</FooterAction>
            <FooterAction fx="mine">내 리허설</FooterAction>
            <FooterAction fx="login">로그인</FooterAction>
          </div>
          <div>
            <h3>발표 상황</h3>
            <PurposeButton purpose="interview">면접</PurposeButton>
            <PurposeButton purpose="ir">IR 피칭</PurposeButton>
            <PurposeButton purpose="report">업무 보고</PurposeButton>
            <PurposeButton purpose="lecture">강의</PurposeButton>
            <PurposeButton purpose="conference">학회 발표</PurposeButton>
            <PurposeButton purpose="speech">축사</PurposeButton>
          </div>
          <div>
            <h3>알아보기</h3>
            <a href="#how">사용 방법</a>
            <a href="#teams">팀 · 기업용</a>
            <ContactButton kind="biz">도입 문의</ContactButton>
            <ContactButton kind="edu">교육기관 문의</ContactButton>
            <a href="#evidence">코칭 근거</a>
          </div>
        </nav>
      </div>
      <div className="foot-bot">
        <span>© 2026 Talkstage · 프로토타입</span>
        <span className="foot-lang"><b>한국어</b><span lang="en">English · 추후 출시</span></span>
      </div>
    </footer>
  );
}
