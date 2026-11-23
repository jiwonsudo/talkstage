'use client';
import dynamic from 'next/dynamic';

/** 카메라·localStorage 를 쓰는 리허설 화면은 브라우저에서만 그려요. */
export const RehearsalEntry = dynamic(() => import('./RehearsalFlow').then((m) => m.RehearsalFlow), {
  ssr: false,
  loading: () => <section className="screen"><div className="page"><p className="subtitle">불러오는 중…</p></div></section>,
});
