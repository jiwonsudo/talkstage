'use client';
import { useEffect, useRef } from 'react';
import { Picto } from '@/components/ui/Picto';

// 큐카드 16장을 두 번 돌려 32장 링을 만들어요.
const ITEMS: [string, string, string][] = [
  ['interview', '면접', '1분 · 첫인상'], ['capstone', '졸업 발표', '10분 · 문제에서 결과까지'], ['ir', 'IR 피칭', '10분 · 확신'], ['report', '업무 보고', '5분 · 결론 먼저'],
  ['voice', '억양', '단조로움 찾기'], ['eyes', '시선', '렌즈 응시'], ['body', '자세', '기울기 · 흔들림'], ['words', '군더더기 말 없애기', '어, 음, 이제'],
  ['conference', '학회 발표', '논리의 흐름'], ['speech', '축사', '3분 · 한 문장'], ['story', '흐름', '목적별 순서'], ['lecture', '강의', '예시와 요약'],
  ['highlights', '하이라이트', '잘한 장면'], ['record', '녹화', '3초 기준 측정'], ['standing', '무대', '전신 분석'], ['seated', '화상 면접', '상반신 분석'],
];
const RUNS = [7, 2, 4, 3, 6, 1, 5, 8];
const N = 32;
const STEP = 360 / N;
/** 카드 링과 베젤은 같은 속도(90초에 한 바퀴)로 함께 흘러가요. */
const FLOW = 360 / 90;
const TICKS = Array.from({ length: 240 }, (_, k) => k);

/** 히어로 다이얼: 크로노그래프 베젤이 째깍이고, 큐카드 링은 잡아서 돌릴 수 있어요. 넓은 화면에서는 오른쪽에 세로로 서요. */
export function HeroDial() {
  const arcRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const bezelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const arc = arcRef.current!, ring = ringRef.current!, bezelEl = bezelRef.current!;
    const cards = [...ring.children] as HTMLElement[];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const side = matchMedia('(min-width: 1200px)');
    const R = () => parseFloat(getComputedStyle(arc).getPropertyValue('--R')) || 1000;

    let ang = 0, vel = 0, bez = 0, dragging = false, lastX = 0, lastT = 0;
    let snapTo: number | null = null, holdUntil = 0, lastFrame = performance.now(), raf = 0;
    // 마우스를 올리면 흐르던 속도로 살짝 더 나갔다가 튕기듯 되돌아와 멈춰요(스프링). 내리면 다시 흘러요.
    let hover = false, bounce: number | null = null, sv = 0, bezBounce: number | null = null, bsv = 0;
    const fine = matchMedia('(hover: hover) and (pointer: fine)');

    const render = () => {
      ring.style.rotate = `${ang}deg`;
      ring.style.setProperty('--ring', `${ang}deg`);
      const top = ((Math.round(-ang / STEP) % N) + N) % N;
      cards.forEach((c, k) => c.classList.toggle('up', k === top));
      bezelEl.style.rotate = `${bez}deg`;
      // 넓은 화면의 부채꼴: 화면 아래쪽 카드가 위쪽 카드를 덮어요.
      if (side.matches) cards.forEach((c, k) => { const p = ((((k * STEP + ang) % 360) + 540) % 360) - 180; c.style.zIndex = String(400 - Math.round(p)); });
      else if (cards[0].style.zIndex) cards.forEach((c) => { c.style.zIndex = ''; });
    };
    const down = (e: PointerEvent) => {
      dragging = true; snapTo = null; bounce = null; bezBounce = null; vel = 0; lastX = side.matches ? -e.clientY : e.clientX; lastT = performance.now();
      arc.setPointerCapture(e.pointerId); arc.classList.add('grab');
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const now = performance.now();
      const x = side.matches ? -e.clientY : e.clientX;
      const d = ((x - lastX) / R()) * (180 / Math.PI);
      ang += d;
      vel = (d / Math.max(1, now - lastT)) * 16;
      lastX = x; lastT = now;
      render();
    };
    const release = () => {
      if (!dragging) return;
      dragging = false; arc.classList.remove('grab'); holdUntil = performance.now() + 1200;
      // 관성으로 멈출 지점을 미리 계산하고, 가장 가까운 카드가 인덱스에 오도록 맞춰요.
      snapTo = Math.round((ang + vel / (1 - 0.94)) / STEP) * STEP;
    };
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
      if (!dragging) {
        if (bounce !== null) {
          // 덜 감쇠된 스프링: 목표를 살짝 지나쳤다가 돌아와 멈춰요
          const k = 120, c = 11;
          sv += ((bounce - ang) * k - sv * c) * dt; ang += sv * dt;
          if (bezBounce !== null) { bsv += ((bezBounce - bez) * k - bsv * c) * dt; bez += bsv * dt; }
          if (Math.abs(bounce - ang) < 0.005 && Math.abs(sv) < 0.02) { ang = bounce; bounce = null; if (bezBounce !== null) bez = bezBounce; bezBounce = null; }
        } else if (snapTo !== null) {
          ang += (snapTo - ang) * 0.09;
          if (Math.abs(snapTo - ang) < 0.01) { ang = snapTo; snapTo = null; }
        } else if (!reduce && now > holdUntil && !hover) {
          ang -= FLOW * dt; bez -= FLOW * dt;
        }
        render();
      }
      raf = requestAnimationFrame(tick);
    };
    // 히어로 위에서 포인터를 움직이면 살짝 기울어요.
    const hero = arc.closest('.hero') as HTMLElement | null;
    const tilt = (e: PointerEvent) => {
      const r = arc.getBoundingClientRect();
      arc.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      arc.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    };
    arc.addEventListener('pointerdown', down);
    arc.addEventListener('pointermove', move);
    arc.addEventListener('pointerup', release);
    arc.addEventListener('pointercancel', release);
    if (!reduce) hero?.addEventListener('pointermove', tilt);
    // 카드 위에 올라갔을 때만 멈춰요(카드 사이를 옮겨 다니면 계속 멈춘 채로), 카드에서 나가면 바로 다시 흘러요.
    const onCard = (t: EventTarget | null) => t instanceof Element && !!t.closest('.wc') && ring.contains(t);
    const enter = (e: PointerEvent) => {
      if (!fine.matches || reduce || dragging || hover || !onCard(e.target)) return;
      hover = true;
      if (snapTo !== null) return; // 놓은 뒤 자리 맞추는 중이면 그대로 두고 멈추기만
      // 흐르던 속도(초당 -FLOW도)를 이어받아 1.6도 앞에서 멈추게: 살짝 밀렸다가 튕겨 돌아와요
      sv = -FLOW * 6; bounce = ang - 1.6;
      bsv = -FLOW * 6; bezBounce = bez - 1.6;
    };
    const leave = (e: PointerEvent) => {
      if (!hover || onCard(e.relatedTarget)) return;
      hover = false; bounce = null; bezBounce = null; holdUntil = 0;
    };
    ring.addEventListener('pointerover', enter);
    ring.addEventListener('pointerout', leave);
    render();
    raf = requestAnimationFrame((t) => { lastFrame = t; tick(t); });
    return () => {
      cancelAnimationFrame(raf);
      arc.removeEventListener('pointerdown', down);
      arc.removeEventListener('pointermove', move);
      arc.removeEventListener('pointerup', release);
      arc.removeEventListener('pointercancel', release);
      hero?.removeEventListener('pointermove', tilt);
      ring.removeEventListener('pointerover', enter);
      ring.removeEventListener('pointerout', leave);
    };
  }, []);

  return (
    <div className="arc" id="heroArt" ref={arcRef} aria-hidden="true">
      <div className="wheel">
        <div className="bezel" ref={bezelRef}>
          {TICKS.map((k) => (
            <i key={k} className={`bt ${k % 20 === 0 ? 'major' : k % 4 === 0 ? 'mid' : ''}`} style={{ '--a': `${k * 1.5}deg` }}>
              {k % 20 === 0 && <em>{String((k / 4) % 60).padStart(2, '0')}</em>}
            </i>
          ))}
        </div>
        <div className="bezel-ring" />
        <div className="wring" ref={ringRef}>
          {Array.from({ length: N }, (_, k) => {
            const [ico, t, sub] = ITEMS[k % ITEMS.length];
            return (
              <div key={k} className={`wc art-${RUNS[Math.floor(k / 4) % RUNS.length]}`} style={{ '--a': `${k * STEP}deg` }}>
                <b>{t}</b><span>{sub}</span><Picto name={ico} />
              </div>
            );
          })}
        </div>
      </div>
      <span className="index" aria-hidden="true" />
    </div>
  );
}
