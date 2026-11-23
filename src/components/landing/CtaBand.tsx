import { Picto } from '@/components/ui/Picto';
import { StartButton } from './actions';

export function CtaBand() {
  return (
    <section className="cta-band art-2 rv">
      <h2><span className="nw">당신의 이야기를</span><br /><span className="nw">세상에 들려줄 차례예요.</span></h2>
      <StartButton className="btn-white">
        지금 리허설하기
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </StartButton>
      <Picto name="conference" />
    </section>
  );
}
