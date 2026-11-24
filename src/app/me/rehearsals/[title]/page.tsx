'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/lib/nav';
import { listRehearsals, deleteRehearsal, deleteRehearsals } from '@/lib/data/rehearsals';
import { DELETE_BODY, titleOf } from '@/lib/data/groups';
import type { Rehearsal } from '@/lib/data/types';
import { CATS, PURPOSE_BY_ID } from '@/lib/scenarios';
import { CAT_COLOR } from '@/lib/colors';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { RehearsalCell } from '@/components/me/RehearsalCell';
import { Trend } from '@/components/me/ScoreTrend';
import { ScoreRing } from '@/components/me/ScoreRing';

const SHOW = 6; // 항목 표에는 최근 6회까지

/** 한 발표(같은 제목)의 연습 회차: 종합 점수 흐름, 회차별 항목 점수, 회차 목록. */
export default function Practice() {
  const { title: raw } = useParams<{ title: string }>();
  const title = decodeURIComponent(raw);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [all, setAll] = useState<Rehearsal[] | null>(null);

  useEffect(() => {
    listRehearsals().then(setAll).catch(() => { setAll([]); toast('기록을 불러오지 못했어요.'); });
  }, [toast]);

  const runs = useMemo(() => (all ?? []).filter((h) => titleOf(h) === title).reverse(), [all, title]); // 오래된 → 최근
  const scored = runs.filter((h) => h.overall !== null);
  const last = runs.at(-1);
  const first = scored[0]?.overall ?? null, latest = scored.at(-1)?.overall ?? null;
  const best = scored.length ? Math.max(...scored.map((h) => h.overall!)) : null;
  const shown = runs.slice(-SHOW);
  const offset = runs.length - shown.length;
  const cats = CATS.filter((c) => shown.some((h) => typeof h.scores?.[c.id] === 'number'));

  async function remove(h: Rehearsal, n: number) {
    if (!(await confirm({ title: `${n}회차 기록을 지울까요?`, body: DELETE_BODY, ok: '지우기', danger: true }))) return;
    try { await deleteRehearsal(h.id); setAll((r) => r?.filter((x) => x.id !== h.id) ?? null); toast('기록을 지웠어요.'); }
    catch { toast('기록을 지우지 못했어요.'); }
  }
  async function removeAll() {
    if (!(await confirm({ title: `‘${title}’ 발표 기록 ${runs.length}회를 모두 지울까요?`, body: DELETE_BODY, ok: '모두 지우기', danger: true }))) return;
    try { await deleteRehearsals(runs.map((r) => r.id)); toast('발표 기록을 지웠어요.'); router.push('/me/rehearsals'); }
    catch { toast('기록을 지우지 못했어요.'); }
  }
  const again = () => last && router.push(`/rehearsal/new?purpose=${last.purpose_id}&posture=${last.posture}&title=${encodeURIComponent(title)}&again=1`);

  if (all !== null && !runs.length) {
    return (
      <div className="page db">
        <div className="db-card db-empty db-empty-lg" style={{ marginTop: 28 }}>
          <b>이 발표의 기록이 없어요.</b>
          <span>지웠거나 제목이 바뀌었을 수 있어요.</span>
          <button type="button" className="btn-plain btn-sm" onClick={() => router.push('/me/rehearsals')}>내 리허설로</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page db">
      <header className="db-head">
        <div>
          <p className="pr-kicker">{last ? `${PURPOSE_BY_ID[last.purpose_id]?.label ?? '발표'} · ${last.posture === 'standing' ? '서서' : '앉아서'}` : ' '}</p>
          <h1 className="title1">{title}</h1>
          <p className="subtitle">{all === null ? '불러오는 중…' : `${runs.length}회 연습했어요. 회차마다 무엇이 달라졌는지 비교해 보세요.`}</p>
        </div>
        <button type="button" className="btn-fill" onClick={again} disabled={!last}>이 발표 다시 연습 +</button>
      </header>

      <div className="db-grid">
        <section className="db-card db-hero">
          <div className="db-hero-top">
            <div className="db-kpi">
              <small>최근 점수</small>
              {all === null ? <b className="db-wait">…</b> : latest === null ? <p>아직 점수가 없어요.</p> : (
                <>
                  <b className="db-big">{latest}<em>점</em></b>
                  <p>
                    {first !== null && scored.length > 1 && latest !== first
                      ? <span className="db-delta">첫 연습보다 <i className={latest > first ? 'is-up' : 'is-down'}>{latest > first ? '▲' : '▼'} {Math.abs(latest - first)}</i></span>
                      : scored.length > 1 ? '첫 연습과 같아요' : '한 번 더 연습하면 변화가 보여요'}
                    {best !== null && scored.length > 1 && ` · 최고 ${best}점`}
                  </p>
                </>
              )}
            </div>
            {latest !== null && <ScoreRing value={latest} />}
          </div>
          {scored.length > 1 && <Trend rows={scored} label={(h) => `${runs.indexOf(h) + 1}회`} />}
        </section>

        <section className="db-card db-stats">
          <div className="db-kpi db-kpi-row"><small>연습 횟수</small><b>{runs.length}<em>회</em></b></div>
          <div className="db-kpi db-kpi-row"><small>최고 점수</small><b>{best ?? '–'}<em>점</em></b></div>
          <div className="db-kpi db-kpi-row"><small>첫 연습</small><b className="pr-date">{runs[0] ? new Date(runs[0].created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '–'}</b></div>
          <div className="db-kpi db-kpi-row"><small>최근 연습</small><b className="pr-date">{last ? new Date(last.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '–'}</b></div>
        </section>

        <section className="db-card db-records pr-matrix-card">
          <h2>회차별 항목 점수{offset > 0 && <small> · 최근 {SHOW}회</small>}</h2>
          {!cats.length ? <p className="db-empty">회차마다 말 빠르기·시선·자세 같은 항목 점수가 여기에 나란히 쌓여요.</p> : (
            <div className="pr-scroll">
              <table className="pr-matrix">
                <thead>
                  <tr><th scope="col">항목</th>{shown.map((h, i) => <th key={h.id} scope="col">{offset + i + 1}회</th>)}{shown.length > 1 && <th scope="col">변화</th>}</tr>
                </thead>
                <tbody>
                  {cats.map((c) => {
                    const vs = shown.map((h) => h.scores?.[c.id]);
                    const nums = vs.filter((x): x is number => typeof x === 'number');
                    const d = nums.length > 1 ? nums.at(-1)! - nums[0] : null;
                    return (
                      <tr key={c.id} style={{ '--c': CAT_COLOR[c.id] }}>
                        <th scope="row"><i className="db-dot" />{c.label}</th>
                        {vs.map((v, i) => (
                          <td key={shown[i].id}>{typeof v === 'number' ? <span className="pr-cell" style={{ '--a': `${Math.round(8 + v * 0.32)}%` }}>{v}</span> : <span className="pr-cell is-none">–</span>}</td>
                        ))}
                        {shown.length > 1 && <td className="pr-d">{d === null || d === 0 ? '–' : <span className={d > 0 ? 'is-up' : 'is-down'}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}</span>}</td>}
                      </tr>
                    );
                  })}
                  <tr className="pr-total">
                    <th scope="row">종합</th>
                    {shown.map((h) => <td key={h.id}><b>{h.overall ?? '–'}</b></td>)}
                    {shown.length > 1 && <td className="pr-d" />}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="db-card db-records">
          <div className="pr-head"><h2>회차</h2><button type="button" className="hub-del" onClick={removeAll}>이 발표 기록 모두 삭제</button></div>
          <ul className="group hub-list db-list">
            {[...runs].reverse().map((h) => {
              const n = runs.indexOf(h) + 1;
              return (
                <RehearsalCell key={h.id} h={h} label={`${n}회차`}>
                  <span className="hub-act">
                    <button type="button" className="hub-del" aria-label={`${n}회차 기록 삭제`} onClick={() => remove(h, n)}>삭제</button>
                  </span>
                </RehearsalCell>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
