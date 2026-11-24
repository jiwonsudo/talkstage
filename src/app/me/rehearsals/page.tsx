'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from '@/lib/nav';
import { listRehearsals } from '@/lib/data/rehearsals';
import { useCredits } from '@/lib/data/useCredits';
import type { Rehearsal } from '@/lib/data/types';
import { CATS, PURPOSE_BY_ID } from '@/lib/scenarios';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { Trend } from '@/components/me/ScoreTrend';
import { PracticeRow } from '@/components/me/PracticeRow';
import { groupPractices } from '@/lib/data/groups';
import { PatternArt } from '@/components/ui/PatternArt';
import { CAT_COLOR, PURPOSE_COLOR } from '@/lib/colors';

const RECENT = 10; // 평균·항목별 점수는 최근 10회로 봐요

const fmtTotal = (sec: number) => {
  const m = Math.round(sec / 60);
  return m < 60 ? { n: m, u: '분' } : { n: Math.floor(m / 60), u: `시간${m % 60 ? ` ${m % 60}분` : ''}` };
};

/** 내 리허설 대시보드: 평균 점수·흐름, 크레딧·횟수·시간, 항목별 평균, 상황별 횟수, 발표(같은 제목)별 기록. */
export default function MyRehearsals() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const credits = useCredits(user);
  const [rows, setRows] = useState<Rehearsal[] | null>(null);

  useEffect(() => {
    listRehearsals().then(setRows).catch(() => { setRows([]); toast('기록을 불러오지 못했어요.'); });
  }, [toast]);

  const stats = useMemo(() => {
    const all = rows ?? [];
    const scored = all.filter((h) => h.overall !== null).slice(0, RECENT).reverse(); // 오래된 → 최근
    const avg = scored.length ? Math.round(scored.reduce((s, h) => s + (h.overall ?? 0), 0) / scored.length) : null;
    const last = scored.at(-1)?.overall ?? null, prev = scored.at(-2)?.overall ?? null;
    const cats = CATS.map((c) => {
      const v = scored.map((h) => h.scores?.[c.id]).filter((x): x is number => typeof x === 'number');
      return { ...c, avg: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null };
    }).filter((c) => c.avg !== null).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
    const byPurpose = Object.entries(all.reduce<Record<string, number>>((m, h) => ((m[h.purpose_id] = (m[h.purpose_id] ?? 0) + 1), m), {}))
      .sort((a, b) => b[1] - a[1]);
    const seconds = all.reduce((s, h) => s + (h.duration_sec ?? 0), 0);
    return { all, scored, avg, last, prev, cats, byPurpose, seconds, practices: groupPractices(all) };
  }, [rows]);

  const wait = <b className="db-wait">…</b>;
  const plan = credits?.status === 'ok' ? credits.plan : null;

  return (
    <div className="page db">
      <header className="db-head">
        <div>
          <h1 className="title1">{user?.name ? `${user.name}님의 리허설` : '내 리허설'}</h1>
          <p className="subtitle">점수 흐름과 약한 항목을 한눈에 보고, 다음 리허설에서 무엇을 연습할지 정해 보세요.</p>
        </div>
        <button type="button" className="btn-fill" onClick={() => router.push('/rehearsal/new')}>새 리허설 +</button>
      </header>

      <div className="db-grid">
        {/* 강조 자리: 파란 카드에 평균 점수와 점수 흐름 */}
        <section className="db-card db-hero">
          <div className="db-hero-top">
            <div className="db-kpi">
              <small>평균 점수 · 최근 {Math.min(stats.scored.length || RECENT, RECENT)}회</small>
              {rows === null ? wait : stats.avg === null ? <p>첫 리허설을 마치면 점수가 여기에 쌓여요.</p> : (
                <>
                  <b className="db-big">{stats.avg}<em>점</em></b>
                  <p>
                    마지막 {stats.last}점
                    {stats.prev !== null && stats.last !== null && stats.last !== stats.prev && (
                      <span className="db-delta"> · 지난번보다 <i className={stats.last > stats.prev ? 'is-up' : 'is-down'}>{stats.last > stats.prev ? '▲' : '▼'} {Math.abs(stats.last - stats.prev)}</i></span>
                    )}
                  </p>
                </>
              )}
            </div>
            <div className="db-hero-art" aria-hidden="true"><PatternArt cols={4} rows={2} size={40} seed={23} /></div>
          </div>
          {rows === null || stats.avg === null ? null : stats.scored.length < 2
            ? <p className="db-hero-empty">리허설을 두 번 이상 하면 점수가 어떻게 달라지는지 여기에 그려져요.</p>
            : <Trend rows={stats.scored} />}
        </section>

        {/* 숫자 세 개는 한 장에 차곡차곡 */}
        <section className="db-card db-stats">
          <div className="db-kpi">
            <small>남은 크레딧{plan ? ` · ${plan}` : ''}</small>
            {credits?.status === 'ok' ? (
              <>
                <b>{credits.left}<em>{credits.bonus ? ' 크레딧' : ` / ${credits.total}`}</em></b>
                <span className="hp-bar db-credit" aria-hidden="true"><i style={{ width: `${credits.total ? Math.min(100, (credits.left / credits.total) * 100) : 0}%` }} /></span>
                <p>{credits.left >= credits.cost ? `리허설 ${Math.floor(credits.left / credits.cost)}회 더 할 수 있어요.` : '크레딧을 다 썼어요.'}{credits.bonus ? ` 산 크레딧 ${credits.bonus} 포함.` : ''} <Link href="/me/plan">{credits.left >= credits.cost ? '요금제' : '회차 추가'}</Link></p>
              </>
            ) : credits?.status === 'error' ? (
              <p>크레딧을 불러오지 못했어요. <button type="button" className="link-btn" onClick={credits.retry}>다시 시도</button></p>
            ) : wait}
          </div>
          <div className="db-kpi db-kpi-row">
            <small>이번 달 리허설</small>
            {credits?.status === 'ok' ? <b>{Math.round(credits.used / credits.cost)}<em>회</em></b> : wait}
          </div>
          <div className="db-kpi db-kpi-row">
            <small>총 연습 시간</small>
            {rows === null ? wait : <b>{fmtTotal(stats.seconds).n}<em>{fmtTotal(stats.seconds).u}</em></b>}
          </div>
          <div className="db-kpi db-kpi-row">
            <small>지금까지</small>
            {rows === null ? wait : <b>{stats.all.length}<em>회</em></b>}
          </div>
        </section>

        <section className="db-card db-half">
          <h2>항목별 평균</h2>
          {rows === null ? wait : !stats.cats.length ? <p className="db-empty">리허설을 하면 말 빠르기·시선·자세 같은 항목 점수가 쌓여요.</p> : (
            <ul className="db-cats">
              {stats.cats.map((c, i) => {
                const weak = i === stats.cats.length - 1 && stats.cats.length > 1;
                return (
                  <li key={c.id} className={weak ? 'is-weak' : undefined} style={{ '--c': CAT_COLOR[c.id] }}>
                    <span><i className="db-dot" />{c.label}{weak && <em>가장 약해요</em>}</span>
                    <span className="db-bar" aria-hidden="true"><i style={{ width: `${c.avg}%` }} /></span>
                    <b>{c.avg}</b>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="db-card db-half">
          <h2>상황별 리허설</h2>
          {rows === null ? wait : !stats.byPurpose.length ? <p className="db-empty">면접·IR·보고처럼 어떤 상황을 많이 연습했는지 보여 드려요.</p> : (
            <>
              <div className="db-stack" aria-hidden="true">
                {stats.byPurpose.map(([id, n]) => <i key={id} style={{ flexGrow: n, '--c': PURPOSE_COLOR[id] ?? 'var(--ink-3)' }} />)}
              </div>
              <ul className="db-legend">
                {stats.byPurpose.map(([id, n]) => (
                  <li key={id} style={{ '--c': PURPOSE_COLOR[id] ?? 'var(--ink-3)' }}>
                    <i className="db-dot" /><span>{PURPOSE_BY_ID[id]?.label ?? '기타'}</span>
                    <b>{n}회</b><small>{Math.round((n / stats.all.length) * 100)}%</small>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="db-card db-records">
          <h2>발표별 기록</h2>
          {rows === null ? wait : stats.practices.length ? (
            <ul className="pr-list">
              {stats.practices.map((g) => <PracticeRow key={g.title} g={g} />)}
            </ul>
          ) : (
            <div className="db-empty db-empty-lg">
              <b>아직 리허설 기록이 없어요.</b>
              <span>첫 리허설을 시작하면 여기에 쌓여요. 같은 제목으로 다시 연습하면 회차별로 모여요.</span>
              <button type="button" className="btn-plain btn-sm" onClick={() => router.push('/rehearsal/new')}>첫 리허설 시작하기</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
