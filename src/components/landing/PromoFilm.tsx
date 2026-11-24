'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

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
  const [muted, setMuted] = useState(true);
  const portrait = useSyncExternalStore(subscribe, isPortrait, () => false);

  useEffect(() => {
    const sec = secRef.current!, stage = stageRef.current!, v = vidRef.current!;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 화면 근처에 오면 불러오고 재생, 벗어나면 멈춤
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    }, { rootMargin: '120px 0px' });
    io.observe(stage);

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
    return () => { io.disconnect(); cancelAnimationFrame(raf); removeEventListener('scroll', kick); removeEventListener('resize', kick); };
  }, [portrait]);

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
  };

  return (
    <section ref={secRef} className="pf" aria-label="30초 소개 영상">
      <div ref={stageRef} className="pf-stage">
        <i className="pf-veil" aria-hidden="true" />
        <p className="pf-kicker">30초로 보는 Talkstage</p>
        <div className="pf-frame">
          <video key={portrait ? 'v' : 'h'} ref={vidRef} muted={muted} loop playsInline preload="none" poster={portrait ? '/media/promo-v.jpg' : '/media/promo.jpg'} aria-label="Talkstage 소개 영상">
            {portrait ? <source src="/media/promo-v.mp4" type="video/mp4" /> : <>
              <source src="/media/promo-720.mp4" type="video/mp4" media="(max-width: 900px)" />
              <source src="/media/promo-1080.mp4" type="video/mp4" />
            </>}
          </video>
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
