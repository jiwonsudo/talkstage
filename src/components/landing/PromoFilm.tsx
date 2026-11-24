'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BrandMark } from '@/components/ui/BrandMark';

// 폰 세로 화면이면 세로(9:16) 영상, 아니면 가로(16:9). 원본은 /dev/promo(?v=1 이 세로).
const PORTRAIT = '(orientation: portrait) and (max-width: 900px)';
const subscribe = (cb: () => void) => { const m = matchMedia(PORTRAIT); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };
const isPortrait = () => matchMedia(PORTRAIT).matches;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * 히어로 아래 30초 광고(원본은 /dev/promo). 소리는 꺼진 채 반복 재생하고 "소리 켜기"로 켜요.
 * 스크롤로 내려오면 카드가 커져 화면을 다 채우고(바깥은 흐려짐), 더 내려가면 다시 작아져요.
 * 화면에 고정(sticky)된 무대 안에서 카드 크기만 --w·--h·--r 로 바꿔요. 동작 줄이기 설정이면 카드 그대로.
 * 영상 바탕이 밝은 회색이라 화면이 영상 비율과 조금 달라도 카드 바탕과 이어져 꽉 찬 화면처럼 보여요. 폰 세로 화면은 세로 영상을 써요.
 */
export function PromoFilm() {
  const secRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const vidRef = useRef<HTMLVideoElement>(null);
  const kickRef = useRef<HTMLParagraphElement>(null);
  const startedRef = useRef(false); // 이번 페이지에서 한 번 확대돼 재생을 시작했는지
  const [muted, setMuted] = useState(true);
  const portrait = useSyncExternalStore(subscribe, isPortrait, () => false);

  useEffect(() => {
    const sec = secRef.current!, stage = stageRef.current!, v = vidRef.current!;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 처음엔 포스터로 멈춰 있다가, 카드가 화면을 거의 채우는 순간 처음(0초)부터 재생해요. 그 뒤로는 반복 재생.
    // 화면 근처에 오면 미리 불러오고, 시작한 뒤에는 화면을 벗어나면 멈췄다 돌아오면 이어서 재생해요.
    // 동작 줄이기 설정이면 확대가 없으니 화면에 보이면 바로 재생해요.
    const started = startedRef;
    if (reduce) started.current = true;
    let inView = false;
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (inView) { v.preload = 'auto'; if (started.current) v.play().catch(() => {}); }
      else { v.pause(); if (!v.muted) { v.muted = true; setMuted(true); } } // 화면에서 사라지면 켜 둔 소리도 꺼요
    }, { rootMargin: '120px 0px' });
    io.observe(stage);

    // 화면을 채울 때마다(소리가 꺼져 있으면) 4.5초 동안 아래 가운데에 큰 "소리 켜고 보기"를 띄워요(data-hint).
    let wasFull = false, hintUntil = 0, hintTimer = 0;
    let raf = 0;
    const update = () => {
      raf = 0;
      const vw = document.documentElement.clientWidth, vh = stage.clientHeight;
      const ratio = portrait ? 9 / 16 : 16 / 9; // 너비 / 높이
      let w0 = Math.min(1080, vw - 32), h0 = w0 / ratio;
      if (h0 > vh * 0.68) { h0 = vh * 0.68; w0 = h0 * ratio; }
      let p = 0;
      if (!reduce) {
        const sc = -sec.getBoundingClientRect().top, H = sec.offsetHeight;
        const g0 = -0.35 * vh, g1 = 0.45 * vh; // 커지는 구간
        const x0 = H - vh - 0.45 * vh, x1 = H - vh + 0.35 * vh; // 작아지는 구간
        p = smooth(sc < x0 ? clamp((sc - g0) / (g1 - g0)) : 1 - clamp((sc - x0) / (x1 - x0)));
      }
      if (!started.current && p >= 0.75 && inView) { started.current = true; v.currentTime = 0; v.play().catch(() => {}); }
      const full = p >= 0.75;
      if (full && !wasFull && v.muted) { hintUntil = performance.now() + 4500; clearTimeout(hintTimer); hintTimer = window.setTimeout(kick, 4600); }
      wasFull = full;
      if (full && v.muted && performance.now() < hintUntil) stage.dataset.hint = ''; else delete stage.dataset.hint;
      const s = stage.style;
      s.setProperty('--w', `${w0 + (vw - w0) * p}px`);
      s.setProperty('--h', `${h0 + (vh - h0) * p}px`);
      s.setProperty('--r', `${28 * (1 - p)}px`);
      s.setProperty('--p', p.toFixed(4));
      if (p > 0.01) stage.dataset.full = ''; else delete stage.dataset.full;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', kick);
    return () => { io.disconnect(); cancelAnimationFrame(raf); clearTimeout(hintTimer); removeEventListener('scroll', kick); removeEventListener('resize', kick); };
  }, [portrait]);

  // 로고 플레이: 문구가 화면에 들어오면 조각이 흩어진 데서 날아와 맞물리고(data-in), 그 뒤로 가끔 말하듯 벌어졌다 모여요.
  // 카드가 커지는 동안(--p)에는 조각이 바깥으로 벌어지며 흐려져요(CSS).
  useEffect(() => {
    const k = kickRef.current!;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { k.dataset.in = ''; io.disconnect(); } }, { threshold: 0.6 });
    io.observe(k);
    return () => io.disconnect();
  }, []);

  // 소리는 켠 시점부터 영상 끝까지만. 반복 재생이 처음으로 돌아가면(시간이 거꾸로 가면) 다시 꺼요.
  useEffect(() => {
    const v = vidRef.current!;
    let last = 0;
    const onTime = () => {
      if (!v.muted && v.currentTime + 0.5 < last) { v.muted = true; setMuted(true); }
      last = v.currentTime;
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [portrait]);

  const toggleSound = () => {
    const v = vidRef.current!;
    v.muted = !v.muted;
    if (!v.muted && v.paused) v.play().catch(() => {});
    setMuted(v.muted);
    delete stageRef.current!.dataset.hint;
  };

  return (
    <section ref={secRef} className="pf" aria-label="30초 소개 영상">
      <div ref={stageRef} className="pf-stage">
        <i className="pf-veil" aria-hidden="true" />
        <p ref={kickRef} className="pf-kicker">
          <span className="pf-k-t">30초로 보는</span>
          <span className="pf-logo"><BrandMark /><b>{'Talkstage'.split('').map((c, i) => <span key={i} style={{ '--i': i } as React.CSSProperties}>{c}</span>)}</b></span>
        </p>
        <div className="pf-frame">
          <video key={portrait ? 'v' : 'h'} ref={vidRef} muted={muted} loop playsInline preload="none" poster={portrait ? '/media/promo-v.jpg' : '/media/promo.jpg'} aria-label="Talkstage 소개 영상">
            {portrait ? <source src="/media/promo-v.mp4" type="video/mp4" /> : <>
              <source src="/media/promo-720.mp4" type="video/mp4" media="(max-width: 900px)" />
              <source src="/media/promo-1080.mp4" type="video/mp4" />
            </>}
          </video>
          <button type="button" className="pf-hint" onClick={toggleSound} tabIndex={-1} aria-hidden="true">
            <span className="pf-eq"><i /><i /><i /><i /></span>
            <span><b>소리 켜고 보기</b><small>음악과 함께 보면 더 좋아요</small></span>
          </button>
          <button type="button" className="pf-sound" onClick={toggleSound} aria-pressed={!muted}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
              {muted ? <path d="M16 9.5l5 5m0-5l-5 5" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}
            </svg>
            {muted ? '소리 켜기' : '소리 끄기'}
          </button>
        </div>
        <p className="pf-note">AI로 만든 예시 영상이에요. 점수는 Talkstage 분석기로 실제로 뽑은 결과예요.</p>
      </div>
    </section>
  );
}
