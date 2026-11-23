import { ScenarioGrid } from './ScenarioGrid';

export function Pick() {
  return (
    <section className="block pick" id="pick">
      <h2 className="h2 rv"><span className="nw">어떤 발표를 준비하나요?</span></h2>
      <p className="lead2 rv">고르면 바로 자세와 목표 설정으로 넘어가요.</p>
      <ScenarioGrid />
    </section>
  );
}
