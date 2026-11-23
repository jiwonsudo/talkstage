'use client';
import { useRef, useState } from 'react';
import { loadVision, type VisionModels } from '@/lib/coach/vision';
import { METRICS, METRIC_IDS, compareClip, spearman, summarize, type Cell, type EvalLabel, type MetricId } from '@/lib/eval/compare';
import { runClip } from '@/lib/eval/run';

type Row = {
  name: string;
  label: EvalLabel;
  status: 'wait' | 'run' | 'done' | 'error';
  progress?: number;
  error?: string;
  overall?: number | null;
  durationSec?: number;
  rateSource?: string | null;
  invalid?: string | null;
  cells?: Record<MetricId, Cell>;
};

const EXAMPLE: EvalLabel = {
  purpose: 'interview', posture: 'seated', targetSec: 90, pair: 'A',
  transcript: '안녕하세요. 음 저는 지원자 홍길동입니다. 어 제가 이 회사에 지원한 이유는…',
  truth: { spm: 310, gazeOn: 0.8, goodPosture: 0.9, gesture: 0.1, longSilences: 1, fillers: 6, humanScore: 72 },
};

const base = (n: string) => n.replace(/\.[^.]+$/, '');

/** 개발용 정확도 검증 화면. 영상 + 같은 이름의 정답 .json 을 함께 골라 차례로 분석해요. */
export function EvalRunner() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const files = useRef<Map<string, File>>(new Map());
  const models = useRef<VisionModels | null>(null);

  async function pick(list: FileList | null) {
    if (!list) return;
    const vids = [...list].filter((f) => f.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(f.name));
    const labels = new Map<string, EvalLabel>();
    for (const f of [...list].filter((f) => f.name.endsWith('.json'))) {
      try { labels.set(base(f.name), JSON.parse(await f.text()) as EvalLabel); } catch { /* 깨진 json 은 라벨 없음으로 */ }
    }
    files.current = new Map(vids.map((f) => [f.name, f]));
    setRows(vids.sort((a, b) => a.name.localeCompare(b.name)).map((f) => ({ name: f.name, label: labels.get(base(f.name)) ?? {}, status: 'wait' })));
  }

  async function runAll() {
    setBusy(true);
    const patch = (name: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.name === name ? { ...r, ...p } : r)));
    try {
      models.current ??= await loadVision();
      for (const r of rows) {
        const f = files.current.get(r.name);
        if (!f) continue;
        patch(r.name, { status: 'run', progress: 0, error: undefined });
        try {
          const res = await runClip(f, r.label, models.current, (s, total) => patch(r.name, { progress: total ? s / total : 0 }));
          patch(r.name, {
            status: 'done', overall: res.analysis.overall, durationSec: res.durationSec,
            rateSource: res.analysis.rateSource, invalid: res.analysis.invalid, cells: compareClip(res.analysis, r.label),
          });
        } catch (e) { patch(r.name, { status: 'error', error: (e as Error).message }); }
      }
    } finally { setBusy(false); }
  }

  const done = rows.filter((r) => r.status === 'done' && r.cells);
  const summary = summarize(done.map((r) => r.cells!));
  const scored = done.filter((r) => r.overall != null && r.label.truth?.humanScore != null);
  const rho = spearman(scored.map((r) => r.overall!), scored.map((r) => r.label.truth!.humanScore!));
  const pairs = Object.entries(done.reduce<Record<string, Row[]>>((m, r) => (r.label.pair ? ((m[r.label.pair] ||= []).push(r), m) : m), {}))
    .filter(([, rs]) => rs.length >= 2)
    .map(([k, rs]) => {
      const s = rs.map((r) => r.overall).filter((v): v is number => v != null);
      return { k, n: rs.length, spread: s.length >= 2 ? Math.max(...s) - Math.min(...s) : null };
    });

  function download() {
    const blob = new Blob([JSON.stringify({ at: new Date().toISOString(), rows: done, summary, spearman: rho, pairs }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `talkstage-eval-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const mark = (c?: Cell) => (!c || c.truth == null ? '' : c.pass ? ' is-pass' : ' is-fail');
  const show = (id: MetricId, c?: Cell) => {
    if (!c) return '–';
    const m = c.measured == null ? '측정 못 함' : METRICS[id].fmt(c.measured);
    return c.truth == null ? m : `${m} / ${METRICS[id].fmt(c.truth)}`;
  };

  return (
    <div className="page qa">
      <h1 className="title1">정확도 검증</h1>
      <p className="subtitle">개발 서버에서만 열려요. 영상과 같은 이름의 정답 .json 을 함께 고르면, 앱의 녹화 화면과 같은 코드로 분석해서 정답과 비교해요.</p>

      <details className="qa-how">
        <summary>영상 찍는 법 · 정답 적는 법</summary>
        <ol>
          <li><b>처음 3초는 조용히 렌즈 보기.</b> 앱의 카운트다운처럼 이 3초로 기준 자세·주변 소음을 재요.</li>
          <li>1배속으로 재생하면서 분석해요. 10분짜리는 10분 걸리고 소리가 나요. <b>그동안 이 탭을 앞에 두세요</b>(뒤로 가면 결과가 틀려져요).</li>
          <li>정답은 사람이 영상을 보고 적어요. 모르는 값은 빼면 그 항목은 비교하지 않아요. <code>transcript</code> 를 넣으면 받아쓰기 대신 써서, 음성 인식 오차를 뺀 나머지만 검증해요.</li>
          <li>같은 사람이 같은 발표를 다시 찍은 영상은 <code>pair</code> 를 같게 두면 점수가 얼마나 흔들리는지 봐요.</li>
        </ol>
        <pre>{JSON.stringify(EXAMPLE, null, 2)}</pre>
      </details>

      <div className="qa-bar">
        <label className="btn-plain btn-sm">영상·정답 고르기<input type="file" multiple accept="video/*,.json" hidden onChange={(e) => pick(e.target.files)} /></label>
        <button type="button" className="btn-fill btn-sm" disabled={!rows.length || busy} onClick={runAll}>{busy ? '분석 중…' : `${rows.length}개 분석`}</button>
        <button type="button" className="btn-plain btn-sm" disabled={!done.length} onClick={download}>결과 JSON 저장</button>
      </div>

      {rows.length > 0 && (
        <div className="qa-scroll">
          <table className="qa-table">
            <thead>
              <tr>
                <th>영상</th><th>길이</th><th>총점 / 사람</th>
                {METRIC_IDS.map((id) => <th key={id}>{METRICS[id].label}<small>{METRICS[id].rule}</small></th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>
                    <b>{r.name}</b>
                    <small>
                      {r.status === 'wait' ? (Object.keys(r.label).length ? '정답 있음' : '정답 없음') : r.status === 'run' ? `분석 중 ${Math.round((r.progress ?? 0) * 100)}%` : r.status === 'error' ? r.error : r.invalid ? `점수 안 냄: ${r.invalid}` : `속도 출처: ${r.rateSource ?? '없음'} · 목소리 있음`}
                    </small>
                  </td>
                  <td>{r.durationSec ? `${Math.round(r.durationSec)}초` : '–'}</td>
                  <td>{r.status === 'done' ? `${r.overall ?? '–'} / ${r.label.truth?.humanScore ?? '–'}` : '–'}</td>
                  {METRIC_IDS.map((id) => <td key={id} className={mark(r.cells?.[id])}>{show(id, r.cells?.[id])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {done.length > 0 && (
        <section className="qa-sum">
          <h2>요약</h2>
          <ul>
            {summary.map((s) => (
              <li key={s.id}>
                <span>{METRICS[s.id].label}</span>
                <b>{s.rate == null ? '정답 없음' : `${Math.round(s.rate * 100)}% 합격`}</b>
                <small>{s.n ? `${s.passed}/${s.n}${s.missed ? ` · 측정 못 함 ${s.missed}` : ''}` : ''}</small>
              </li>
            ))}
            <li><span>사람 점수와 순서 일치</span><b>{rho == null ? '3개 이상 필요' : rho.toFixed(2)}</b><small>1에 가까울수록 좋아요(0.7 이상 목표)</small></li>
            {pairs.map((p) => (
              <li key={p.k}><span>같은 발표 다시 찍기 “{p.k}”</span><b>{p.spread == null ? '–' : `점수 차 ${p.spread}점`}</b><small>{p.n}개 · 5점 이하 목표</small></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
