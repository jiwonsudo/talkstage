'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from '@/lib/nav';
import { listRehearsals, deleteRehearsal } from '@/lib/data/rehearsals';
import { useCredits } from '@/lib/data/useCredits';
import type { Rehearsal } from '@/lib/data/types';
import { CATS, PURPOSE_BY_ID } from '@/lib/scenarios';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { RehearsalCell } from '@/components/me/RehearsalCell';

const RECENT = 10; // 평균·항목별 점수는 최근 10회로 봐요

const fmtTotal = (sec: number) => {
  const m = Math.round(sec / 60);
  return m < 60 ? { n: m, u: '분' } : { n: Math.floor(m / 60), u: `시간${m % 60 ? ` ${m % 60}분` : ''}` };
};
const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });

/** 내 리허설 대시보드: 크레딧 · 이번 달 횟수 · 평균 점수 · 연습 시간, 점수 흐름, 항목별 평균, 상황별 횟수, 전체 기록. */
export default function MyRehearsals() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const credits = useCredits(user);
  const [rows, setRows] = useState<Rehearsal[] | null>(null);

  useEffect(() => {
    listRehearsals().then(setRows).catch(() => { setRows([]); toast('기록을 불러오지 못했어요.'); });
  }, [toast]);

  async function remove(h: Rehearsal) {
    const name = h.topic || PURPOSE_BY_ID[h.purpose_id]?.label || '발표';
    if (!confirm(`‘${name}’ 기록을 지울까요? 되돌릴 수 없고, 이미 쓴 크레딧도 돌아오지 않아요.`)) return;
    try { await deleteRehearsal(h.id); setRows((r) => r?.filter((x) => x.id !== h.id) ?? null); toast('기록을 지웠어요.'); }
    catch { toast('기록을 지우지 못했어요.'); }
  }

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
    return { all, scored, avg, last, prev, cats, byPurpose, seconds };
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
        {/* 1줄: 숫자 네 개 */}
        <section className="db-card db-kpi">
          <small>남은 크레딧{plan ? ` · ${plan}` : ''}</small>
          {credits?.status === 'ok' ? (
            <>
              <b>{credits.left}<em> / {credits.total}</em></b>
              <span className="hp-bar" aria-hidden="true"><i style={{ width: `${credits.total ? (credits.left / credits.total) * 100 : 0}%` }} /></span>
              <p>{credits.left >= credits.cost ? `리허설 ${Math.floor(credits.left / credits.cost)}회 더 할 수 있어요.` : '이번 달 크레딧을 다 썼어요.'} <Link href="/me/plan">요금제</Link></p>
            </>
          ) : credits?.status === 'error' ? (
            <p>크레딧을 불러오지 못했어요. <button type="button" className="link-btn" onClick={credits.retry}>다시 시도</button></p>
          ) : wait}
        </section>

        <section className="db-card db-kpi">
          <small>이번 달 리허설</small>
          {credits?.status === 'ok' ? (
            <>
              <b>{Math.round(credits.used / credits.cost)}<em>회</em></b>
              <p>매달 1일에 크레딧이 다시 채워져요.</p>
            </>
          ) : wait}
        </section>

        <section className="db-card db-kpi">
          <small>평균 점수 · 최근 {Math.min(stats.scored.length || RECENT, RECENT)}회</small>
          {rows === null ? wait : stats.avg === null ? <p>아직 점수가 없어요.</p> : (
            <>
              <b>{stats.avg}<em>점</em></b>
              <p>
                마지막 {stats.last}점
                {stats.prev !== null && stats.last !== null && stats.last !== stats.prev && (
                  <span className="db-delta"> · 지난번보다 <i className={stats.last > stats.prev ? 'is-up' : 'is-down'}>{stats.last > stats.prev ? '▲' : '▼'}</i> {Math.abs(stats.last - stats.prev)}</span>
                )}
              </p>
            </>
          )}
        </section>

        <section className="db-card db-kpi">
          <small>총 연습 시간</small>
          {rows === null ? wait : (
            <>
              <b>{fmtTotal(stats.seconds).n}<em>{fmtTotal(stats.seconds).u}</em></b>
              <p>지금까지 리허설 {stats.all.length}회</p>
            </>
          )}
        </section>

        {/* 2줄: 점수 흐름 · 항목별 평균 */}
        <section className="db-card db-wide">
          <h2>점수 흐름</h2>
          {rows === null ? wait : stats.scored.length < 2
            ? <p className="db-empty">리허설을 두 번 이상 하면 점수가 어떻게 달라지는지 여기에 그려져요.</p>
            : <Trend rows={stats.scored} />}
        </section>

        <section className="db-card">
          <h2>항목별 평균</h2>
          {rows === null ? wait : !stats.cats.length ? <p className="db-empty">리허설을 하면 말 빠르기·시선·자세 같은 항목 점수가 쌓여요.</p> : (
            <ul className="db-bars">
              {stats.cats.map((c, i) => (
                <li key={c.id} className={i === stats.cats.length - 1 ? 'is-weak' : undefined}>
                  <span>{c.label}{i === stats.cats.length - 1 && stats.cats.length > 1 && <em>가장 약해요</em>}</span>
                  <span className="db-bar" aria-hidden="true"><i style={{ width: `${c.avg}%` }} /></span>
                  <b>{c.avg}</b>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 3줄: 상황별 · 기록 */}
        <section className="db-card db-top">
          <h2>상황별 리허설</h2>
          {rows === null ? wait : !stats.byPurpose.length ? <p className="db-empty">면접·IR·보고처럼 어떤 상황을 많이 연습했는지 보여 드려요.</p> : (
            <ul className="db-bars">
              {stats.byPurpose.map(([id, n]) => (
                <li key={id}>
                  <span>{PURPOSE_BY_ID[id]?.label ?? '기타'}</span>
                  <span className="db-bar" aria-hidden="true"><i style={{ width: `${(n / stats.byPurpose[0][1]) * 100}%` }} /></span>
                  <b>{n}회</b>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="db-card db-wide">
          <h2>기록</h2>
          {rows === null ? wait : rows.length ? (
            <ul className="group hub-list db-list">
              {rows.map((h) => (
                <RehearsalCell key={h.id} h={h}>
                  <span className="hub-act">
                    <button type="button" className="btn-plain btn-sm" onClick={() => router.push(`/rehearsal/new?purpose=${h.purpose_id}&posture=${h.posture}&step=2`)}>다시 연습</button>
                    <button type="button" className="hub-del" aria-label="기록 삭제" onClick={() => remove(h)}>삭제</button>
                  </span>
                </RehearsalCell>
              ))}
            </ul>
          ) : (
            <div className="db-empty db-empty-lg">
              <b>아직 리허설 기록이 없어요.</b>
              <span>첫 리허설을 시작하면 여기에 쌓여요.</span>
              <button type="button" className="btn-plain btn-sm" onClick={() => router.push('/rehearsal/new')}>첫 리허설 시작하기</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** 최근 점수 흐름(0–100, 한 줄). 마우스·손가락을 올리면 가장 가까운 회차의 날짜·점수를 보여 줘요. */
function Trend({ rows }: { rows: Rehearsal[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const H = 240, L = 28, R = 12, T = 12, B = 26;
  const x = (i: number) => L + (i * (w - L - R)) / Math.max(rows.length - 1, 1);
  const y = (v: number) => T + ((100 - v) * (H - T - B)) / 100;
  const pts = rows.map((h, i) => ({ x: x(i), y: y(h.overall ?? 0), h }));
  const pick = (cx: number) => {
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p.x - cx) < Math.abs(pts[best].x - cx)) best = i; });
    setHover(best);
  };
  const hv = hover === null ? null : pts[hover];

  return (
    <div ref={box} className="db-trend">
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={`최근 ${rows.length}회 점수: ${rows.map((h) => h.overall).join(', ')}`}
          onPointerMove={(e) => pick(e.clientX - e.currentTarget.getBoundingClientRect().left)} onPointerLeave={() => setHover(null)}>
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} className="db-grid-line" />
              <text x={L - 8} y={y(v)} dy="0.32em" textAnchor="end">{v}</text>
            </g>
          ))}
          <text x={pts[0].x} y={H - 6} textAnchor="start">{day(rows[0].created_at)}</text>
          <text x={pts.at(-1)!.x} y={H - 6} textAnchor="end">{day(rows.at(-1)!.created_at)}</text>
          {hv && <line x1={hv.x} x2={hv.x} y1={T} y2={H - B} className="db-cross" />}
          <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />
          {pts.map((p, i) => <circle key={p.h.id} cx={p.x} cy={p.y} r={i === hover || i === pts.length - 1 ? 5 : 3.5} />)}
          {/* 마지막 회차만 값 표시 */}
          <text x={pts.at(-1)!.x} y={pts.at(-1)!.y - 12} textAnchor="end" className="db-last">{rows.at(-1)!.overall}점</text>
        </svg>
      )}
      {hv && (
        <div className="db-tip" style={{ left: hv.x, top: hv.y }}>
          <b>{hv.h.overall}점</b>
          <span>{day(hv.h.created_at)} · {PURPOSE_BY_ID[hv.h.purpose_id]?.label ?? ''}</span>
        </div>
      )}
    </div>
  );
}
