// 리포트 화면: 요약, 우선순위, AI 하이라이트, 타임라인, 항목별 코칭, 내용 구조, 자기 인식 비교, 다음 연습
import { CATS, CAT_LABEL, LIKERT, fmtTime } from './scenarios.js';
import { coachFor, selfCompare, EVIDENCE, NOT_USED } from './coach.js';
import { pickOutcomes, outcomeWeight } from './analysis.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS_TEXT = { good: '좋음', warn: '보완', bad: '집중', na: '측정 불가' };
const EV_TYPE = { research: '연구', book: '서적', practitioner: '실무 가이드' };

function evidenceBlock(ids, open = false) {
  const list = (ids || []).map((id) => EVIDENCE[id]).filter(Boolean);
  if (!list.length) return '';
  return `<details class="ev"${open ? ' open' : ''}><summary>근거 ${list.length}건</summary><ul>${list.map((e) => `
    <li><span class="ev-type ev-${e.type}">${EV_TYPE[e.type]}</span><div><b>${esc(e.cite)}</b><span class="ev-title">${esc(e.title)}</span><p>${esc(e.claim)}</p></div></li>`).join('')}</ul></details>`;
}

export function fixDuration(video) {
  return new Promise((resolve) => {
    const go = () => {
      if (video.duration === Infinity || isNaN(video.duration)) {
        const h = () => { video.removeEventListener('timeupdate', h); video.currentTime = 0; resolve(); };
        video.addEventListener('timeupdate', h);
        video.currentTime = 1e101;
        setTimeout(resolve, 2500);
      } else resolve();
    };
    if (video.readyState >= 1) go();
    else video.addEventListener('loadedmetadata', go, { once: true });
  });
}
const seekTo = (v, t) => new Promise((r) => {
  const to = setTimeout(r, 1500);
  v.addEventListener('seeked', () => { clearTimeout(to); r(); }, { once: true });
  v.currentTime = Math.max(0.05, t);
});

async function makeThumbs(url, times) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  await fixDuration(v);
  const c = document.createElement('canvas');
  const out = [];
  for (const t of times) {
    await seekTo(v, t);
    c.width = 320;
    c.height = Math.round((320 * (v.videoHeight || 9)) / (v.videoWidth || 16));
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    out.push(c.toDataURL('image/jpeg', 0.72));
  }
  v.removeAttribute('src'); v.load();
  return out;
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
const pickMime = () => ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';

const BAR_DOMAIN = { pace: [150, 450], pause: [0, 0.5], tone: [0, 8], gaze: [0, 1], gesture: [0, 0.7], filler: [0, 10] };
function rangeBar(c, purpose, posture) {
  const T = purpose.targets;
  const band = { pace: T.spm, pause: T.pause, tone: T.pitch, gaze: [T.gaze, 1], gesture: T.gesture[posture], filler: [0, T.filler] }[c.id];
  const dom = BAR_DOMAIN[c.id];
  if (!band || !dom || c.raw == null) {
    return c.score == null ? '' : `<div class="bar"><span class="bar-fill" style="width:${c.score}%"></span></div>`;
  }
  const pct = (v) => Math.max(0, Math.min(100, ((v - dom[0]) / (dom[1] - dom[0])) * 100));
  return `<div class="bar range"><span class="bar-band" style="left:${pct(band[0])}%;width:${pct(band[1]) - pct(band[0])}%"></span><span class="bar-dot st-${c.status}" style="left:${pct(c.raw)}%"></span></div>`;
}

export function renderReport(root, ctx) {
  const { result: R, videoURL, setup, purpose, profile, prev, history, onRetry, onEdit, onFocus } = ctx;
  const posture = setup.posture;
  const outs = pickOutcomes(purpose, setup);
  const outcome = { label: outs.map((o) => o.label).join(' · ') };
  const anxious = (profile?.anxiety || 0) >= 4;
  const cats = R.cats;
  const weightOf = (id) => (purpose.weights[id] || 1) * outcomeWeight(outs, id);
  const coached = Object.fromEntries(Object.values(cats).map((c) => [c.id, coachFor(c, purpose, setup)]));
  const nPri = anxious ? 2 : 3;
  const priorities = Object.values(cats).filter((c) => c.score != null && c.score < 80)
    .sort((a, b) => (100 - b.score) * weightOf(b.id) - (100 - a.score) * weightOf(a.id)).slice(0, nPri);
  const self = selfCompare(profile, cats);
  const delta = prev && R.overall != null && prev.overall != null ? R.overall - prev.overall : null;
  const issuesOf = (cat) => R.issues.filter((i) => i.cat === cat);
  const usedEvidence = [...new Set(Object.values(coached).flatMap((c) => c.evidence))];
  const strengths = R.highlights.strengths;
  const weaknesses = R.highlights.weaknesses;
  const chipTime = (i) => `<button class="tchip" data-seek="${i.t0}" type="button">${fmtTime(i.t0)}</button>`;

  // 고칠 순간은 전체 점수와 관계없이 그 구간의 문제에 맞는 교정 문장을 씁니다.
  const problemCoach = (h) => {
    const c = cats[h.cat];
    if (!c) return null;
    const t = h.title;
    const dir = h.cat === 'pace' ? (t.includes('느려') ? 'low' : 'high')
      : h.cat === 'pause' ? (t.includes('끊김') ? 'high' : c.dir)
      : h.cat === 'filler' ? 'high'
      : h.cat === 'gaze' || h.cat === 'gesture' ? 'low'
      : h.cat === 'tone' ? (t.includes('단조') ? 'low' : c.dir) : c.dir;
    const extra = { ...c.extra };
    if (h.cat === 'pause' && t.includes('이어')) extra.longRuns = Math.max(1, extra.longRuns || 0);
    if (h.cat === 'pause' && t.includes('끊김')) extra.longRuns = 0;
    if (h.cat === 'tone' && t.includes('말끝')) { extra.fadeHigh = true; extra.fadeRatio = extra.fadeRatio ?? 0.3; }
    if (h.cat === 'gaze' && t.includes('아래')) extra.downRatio = 1;
    if (h.cat === 'posture') extra.mainIssue = `${t.replace(/ 자세$/, '')} 자세가 보인`;
    return coachFor({ ...c, dir, score: Math.min(c.score ?? 70, 70), extra }, purpose, setup);
  };
  const hlCard = (h, idx) => {
    const isW = h.kind === 'weakness';
    const co = isW ? problemCoach(h) : coached[h.cat];
    return `<article class="hl ${isW ? 'hl-w' : 'hl-s'}" data-hl="${h.kind}:${idx}">
      <button class="hl-thumb" type="button" data-play="${h.kind}:${idx}" aria-label="${esc(h.title)} 구간 재생">
        <span class="thumb-img"></span><span class="hl-time">${fmtTime(h.t0)} – ${fmtTime(h.t1)}</span><span class="hl-play">▶</span>
      </button>
      <div class="hl-body">
        <span class="hl-tag">${isW ? '고칠 순간' : '잘한 순간'} · ${esc(CAT_LABEL[h.cat] || '')}</span>
        <h4>${esc(h.title)}</h4>
        <p>${esc(isW ? h.reasons[0] : h.reasons.join(' · '))}</p>
        ${isW && co ? `<p class="hl-fix"><b>이렇게 고쳐 보세요</b> ${esc(co.advice)}</p>${evidenceBlock(co.evidence)}` : ''}
        <div class="hl-actions"><button type="button" class="btn-ghost sm" data-play="${h.kind}:${idx}">재생</button><button type="button" class="btn-ghost sm" data-save="${h.kind}:${idx}">클립 저장</button></div>
      </div>
    </article>`;
  };

  const priorityHTML = priorities.length ? priorities.map((c, k) => {
    const co = coached[c.id];
    const inst = issuesOf(c.id).slice(0, 5);
    return `<article class="pri">
      <div class="pri-rank cover cover-${(k % 5) + 1}">${k + 1}</div>
      <div class="pri-body">
        <span class="pri-cat">${esc(c.label)} · ${c.score}점</span>
        <h3>${esc(co.headline)}</h3>
        <p>${esc(co.advice)}</p>
        ${co.drill ? `<p class="drill"><b>연습법</b> ${esc(co.drill)}</p>` : ''}
        ${inst.length ? `<div class="tchips"><span>해당 구간</span>${inst.map(chipTime).join('')}</div>` : ''}
        ${evidenceBlock(co.evidence)}
      </div></article>`;
  }).join('') : `<p class="empty-note">모든 항목이 80점 이상이에요. 다음 연습에서는 목표 시간을 줄이거나 더 어려운 상황을 골라 보세요.</p>`;

  const catCards = CATS.map(({ id }) => {
    const c = cats[id];
    if (!c) return '';
    const co = coached[id];
    const pd = prev?.scores?.[id];
    const d = c.score != null && pd != null ? c.score - pd : null;
    return `<article class="cat st-${c.status}">
      <header><h3>${esc(c.label)}</h3><span class="pill st-${c.status}">${STATUS_TEXT[c.status]}</span></header>
      <div class="cat-score"><span class="num">${c.score ?? '–'}</span>${d != null && d !== 0 ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : ''}</div>
      <dl><div><dt>측정</dt><dd>${esc(c.value ?? '–')}${id === 'time' && c.value != null ? '초' : ''}</dd></div><div><dt>목표</dt><dd>${esc(c.target || '–')}</dd></div></dl>
      ${rangeBar(c, purpose, posture)}
      ${c.score != null ? `<p class="cat-head">${esc(co.headline)}</p><p class="cat-adv">${esc(co.advice)}</p>${evidenceBlock(co.evidence)}` : `<p class="cat-adv muted">이번 녹화에서는 측정하지 못했어요.</p>`}
    </article>`;
  }).join('');

  const checks = cats.content?.extra?.checks || [];
  const fillerSet = new Set(['어', '어어', '음', '음음', '으음', '흠', '저', '저기', '이제', '약간', '막', '뭐', '뭔가', '뭐랄까', '그냥']);
  const transcriptHTML = R.finals.length ? R.finals.map((f) => {
    const words = f.text.split(/\s+/).map((w) => (fillerSet.has(w.replace(/[.,!?~…]/g, '')) ? `<mark>${esc(w)}</mark>` : esc(w))).join(' ');
    return `<p><button class="tchip" type="button" data-seek="${f.t0}">${fmtTime(f.t0)}</button> ${words}</p>`;
  }).join('') : '<p class="muted">받아쓰기를 사용하지 않았거나 인식된 말이 없어요.</p>';

  const selfHTML = self.length ? self.map((s) => `<tr>
      <th scope="row">${esc(s.label)}</th>
      <td>${s.self >= 5 ? '<b>가장 걱정한 부분</b>' : '—'}</td>
      <td><span class="pill st-${s.score >= 80 ? 'good' : s.score >= 55 ? 'warn' : 'bad'}">${esc(CAT_LABEL[s.cat])} ${s.score}점</span></td>
      <td><span class="kind kind-${s.kind}">${{ match: '예상대로', better: '생각보다 잘함', blind: '몰랐던 약점', ok: '강점 확인' }[s.kind]}</span><p>${esc(s.msg)}</p></td></tr>`).join('')
    : '';

  const histRows = (history || []).slice(-6).reverse().map((h) => `<li><span>${new Date(h.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><b>${h.overall ?? '–'}점</b>${h.focus ? `<em>집중: ${esc(CAT_LABEL[h.focus])}</em>` : ''}</li>`).join('');
  const suggestedFocus = priorities[0]?.id || self.find((s) => s.kind === 'blind' || s.kind === 'match')?.cat || null;

  const strengthsSection = `<div class="hl-group"><h3>잘한 순간</h3>${strengths.length ? `<div class="hl-row">${strengths.map((h, i) => hlCard(h, i)).join('')}</div>` : '<p class="muted">여러 항목이 동시에 좋았던 8초 이상의 구간을 찾지 못했어요. 다음 연습에서 한 항목씩 개선해 보세요.</p>'}</div>`;
  const weakSection = `<div class="hl-group"><h3>고칠 순간</h3>${weaknesses.length ? `<div class="hl-row">${weaknesses.map((h, i) => hlCard(h, i)).join('')}</div>` : '<p class="muted">눈에 띄는 문제 구간이 없었어요.</p>'}</div>`;

  root.innerHTML = `
  <section class="r-hero cover-2" data-picto="${purpose.id}">
    <div class="r-score"><span class="r-score-lbl">종합 점수</span><span class="r-score-num">${R.overall ?? '–'}</span><span class="r-score-bar"><i style="width:${R.overall ?? 0}%"></i></span></div>
    <div class="r-meta">
      <div class="chips"><span class="chip">${esc(setup.purposeName || purpose.label)}</span><span class="chip">${posture === 'seated' ? '앉아서' : '서서'}</span><span class="chip">${fmtTime(R.dur)} / 목표 ${fmtTime(setup.targetSec)}</span>${setup.focus ? `<span class="chip chip-accent">집중: ${esc(CAT_LABEL[setup.focus])}</span>` : ''}</div>
      <h1>${esc(setup.topic || '제목 없는 발표')}</h1>
      <p class="r-sub">원하는 결과: <b>${esc(setup.outcomeText || outcome.label)}</b>${setup.keyMessage ? ` · 핵심 메시지: “${esc(setup.keyMessage)}”` : ''}</p>
      ${delta != null ? `<p class="r-delta ${delta >= 0 ? 'up' : 'down'}">같은 상황의 지난 연습보다 ${delta >= 0 ? '+' : ''}${delta}점${setup.focus && prev?.scores?.[setup.focus] != null && cats[setup.focus]?.score != null ? ` · 집중 항목 ${CAT_LABEL[setup.focus]} ${cats[setup.focus].score - prev.scores[setup.focus] >= 0 ? '+' : ''}${cats[setup.focus].score - prev.scores[setup.focus]}점` : ''}</p>` : ''}
      ${anxious ? '<p class="r-kind">긴장을 많이 한다고 답하셨죠. 잘한 순간부터 보고, 고칠 점은 두 가지만 골랐어요.</p>' : ''}
    </div>
  </section>

  ${anxious ? '' : `<section class="r-sec"><h2>가장 먼저 고칠 ${nPri}가지</h2><p class="sec-lead">${esc(setup.purposeName ? `${setup.purposeName}(${purpose.label})` : purpose.label)} 기준과 원하는 결과(${esc(outcome.label)})에 맞춰 점수 손실이 큰 순서로 골랐어요.</p><div class="pri-list">${priorityHTML}</div></section>`}

  <section class="r-sec" id="sec-highlights">
    <div class="sec-head"><div><h2>AI 하이라이트</h2><p class="sec-lead">녹화에서 잘한 순간과 고칠 순간을 자동으로 잘라냈어요.</p></div>
      <button type="button" class="btn" id="btnReel" ${strengths.length + weaknesses.length ? '' : 'disabled'}>하이라이트 이어서 보기</button></div>
    ${anxious ? strengthsSection + weakSection : weakSection + strengthsSection}
  </section>

  ${anxious ? `<section class="r-sec"><h2>가장 먼저 고칠 ${nPri}가지</h2><div class="pri-list">${priorityHTML}</div></section>` : ''}

  <section class="r-sec" id="sec-review">
    <h2>전체 영상과 타임라인</h2>
    <p class="sec-lead">청중에게 보이는 방향(좌우 반전 없음)으로 재생됩니다. 타임라인이나 시각을 누르면 그 장면으로 이동해요.</p>
    <div class="review">
      <div class="player-col">
        <div class="player"><video id="rv" controls playsinline src="${videoURL}"></video><div class="clip-banner" id="clipBanner" hidden></div></div>
        <div class="tl-wrap"><canvas id="tl" height="210" aria-label="발화, 속도, 시선, 자세, 제스처 타임라인"></canvas></div>
        <div class="tl-legend"><span><i class="lg lg-voice"></i>말한 구간</span><span><i class="lg lg-band"></i>목표 속도</span><span><i class="lg lg-good"></i>좋음</span><span><i class="lg lg-bad"></i>문제</span><span><i class="lg lg-filler"></i>군더더기 말</span></div>
      </div>
      <div class="issues-col">
        <h3>문제 구간 ${R.issues.length}개</h3>
        <ol class="issues">${R.issues.length ? R.issues.map((i) => `<li class="sev${i.sev}"><button type="button" data-seek="${i.t0}"><span class="it">${fmtTime(i.t0)}</span><span class="ic">${esc(CAT_LABEL[i.cat])}</span><b>${esc(i.title)}</b><span class="id">${esc(i.detail)}</span></button></li>`).join('') : '<li class="muted">눈에 띄는 문제 구간이 없었어요.</li>'}</ol>
      </div>
    </div>
  </section>

  <section class="r-sec">
    <h2>항목별 코칭</h2>
    <p class="sec-lead">목표 범위는 ${esc(purpose.label)} · ${posture === 'seated' ? '앉아서' : '서서'} 기준이에요.${prev ? ' 숫자 옆의 증감은 지난 연습과 비교한 값이에요.' : ''}</p>
    <div class="cat-grid">${catCards}</div>
  </section>

  <section class="r-sec two-col">
    <div>
      <h2>내용 구조</h2>
      <p class="sec-lead">받아쓰기 내용을 바탕으로 핵심 메시지와 구조를 점검했어요.</p>
      <ul class="checks">${checks.map((k) => `<li class="ck-${k.pass === true ? 'pass' : k.pass === false ? 'fail' : 'na'}"><span class="ck-ico" aria-hidden="true">${k.pass === true ? '✓' : k.pass === false ? '!' : '–'}</span><div><b>${esc(k.label)}</b><p>${esc(k.detail)}</p>${k.pass === false ? `<p class="ck-fix">${esc(k.fix)}</p>${evidenceBlock(k.evidence)}` : ''}</div></li>`).join('')}</ul>
    </div>
    <div>
      <h2>받아쓰기</h2>
      <p class="sec-lead">노란색은 군더더기 말이에요.</p>
      <div class="transcript">${transcriptHTML}</div>
    </div>
  </section>

  ${selfHTML ? `<section class="r-sec"><h2>걱정과 실제 비교</h2><p class="sec-lead">녹화 전에 고른 가장 큰 고민과 측정 결과를 비교했어요.</p>
    <div class="table-wrap"><table class="self"><thead><tr><th>습관</th><th>내 고민</th><th>측정 결과</th><th>해석</th></tr></thead><tbody>${selfHTML}</tbody></table></div></section>` : ''}

  <section class="r-sec next">
    <h2>다음 연습</h2>
    <p class="sec-lead">한 번에 하나만 고치는 게 가장 빨라요. 집중할 항목을 고르면 녹화 중 실시간 알림이 그 항목에만 뜨고, 리포트에서 변화를 따로 보여줘요.</p>
    <div class="focus-pick" role="radiogroup" aria-label="집중 항목">
      <label class="fp"><input type="radio" name="focus" value="" ${!suggestedFocus ? 'checked' : ''}><span>전체</span></label>
      ${CATS.filter((c) => !['content', 'time'].includes(c.id) && cats[c.id]?.score != null).map((c) => `<label class="fp"><input type="radio" name="focus" value="${c.id}" ${c.id === suggestedFocus ? 'checked' : ''}><span>${esc(c.label)}${c.id === suggestedFocus ? ' · 추천' : ''}</span></label>`).join('')}
    </div>
    <div class="next-actions">
      <button type="button" class="btn" id="btnRetry">같은 설정으로 다시 녹화</button>
      <button type="button" class="btn-ghost" id="btnEdit">발표 설정 바꾸기</button>
      <button type="button" class="btn-ghost" id="btnSaveFull">전체 녹화 파일 저장</button>
      <button type="button" class="btn-ghost" id="btnHome">홈으로</button>
    </div>
    ${histRows ? `<div class="hist"><h3>같은 상황 연습 기록</h3><ul>${histRows}</ul></div>` : ''}
  </section>

  <section class="r-sec refs">
    <h2>측정 방법과 근거</h2>
    <div class="refs-grid">
      <div>
        <h3>이번 녹화의 한계</h3>
        <ul class="limits">${R.limits.length ? R.limits.map((l) => `<li>${esc(l)}</li>`).join('') : '<li>특별한 측정 문제는 없었어요.</li>'}
          <li>목표 범위는 연구와 실무 가이드를 참고해 정한 프로토타입 기준값이에요. 한국어 발표 데이터로 보정하는 중입니다.</li></ul>
        <h3>일부러 쓰지 않은 근거</h3>
        <ul class="limits">${NOT_USED.map((n) => `<li><b>${esc(n.name)}</b> ${esc(n.why)}</li>`).join('')}</ul>
      </div>
      <div>
        <h3>이번 리포트에 쓴 근거</h3>
        <ul class="ref-list">${[...new Set([...usedEvidence, ...weaknesses.flatMap((h) => problemCoach(h)?.evidence || []), ...checks.filter((k) => k.pass === false).flatMap((k) => k.evidence)])].map((id) => EVIDENCE[id]).filter(Boolean).map((e) => `<li><span class="ev-type ev-${e.type}">${EV_TYPE[e.type]}</span><div><b>${esc(e.cite)}</b><span class="ev-title">${esc(e.title)}</span></div></li>`).join('')}</ul>
      </div>
    </div>
  </section>`;

  // ---------- 상호작용 ----------
  const video = root.querySelector('#rv');
  const canvas = root.querySelector('#tl');
  const banner = root.querySelector('#clipBanner');
  let clip = null; // {t1, label, onEnd}
  const hlByKey = (key) => { const [k, i] = key.split(':'); return (k === 'strength' ? strengths : weaknesses)[Number(i)]; };

  const seek = (t, play = true) => {
    clip = null; banner.hidden = true;
    video.currentTime = Math.max(0, t);
    if (play) video.play().catch(() => {});
    root.querySelector('#sec-review').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const playClip = (h, onEnd) => {
    clip = { t1: h.t1, onEnd };
    banner.hidden = false;
    banner.textContent = `${h.kind === 'strength' ? '잘한 순간' : '고칠 순간'} · ${h.title} (${fmtTime(h.t0)}–${fmtTime(h.t1)})`;
    banner.className = `clip-banner ${h.kind === 'strength' ? 'is-s' : 'is-w'}`;
    video.currentTime = h.t0;
    video.play().catch(() => {});
  };
  video.addEventListener('timeupdate', () => {
    if (clip && video.currentTime >= clip.t1) {
      const done = clip.onEnd;
      clip = null;
      video.pause();
      if (done) done(); else banner.hidden = true;
    }
  });

  root.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-seek]');
    if (s) { seek(Number(s.dataset.seek)); return; }
    const p = e.target.closest('[data-play]');
    if (p) { const h = hlByKey(p.dataset.play); root.querySelector('#sec-review').scrollIntoView({ behavior: 'smooth' }); playClip(h); return; }
    const sv = e.target.closest('[data-save]');
    if (sv) { saveClip(hlByKey(sv.dataset.save), sv); }
  });

  root.querySelector('#btnReel')?.addEventListener('click', () => {
    const reel = anxious ? [...strengths, ...weaknesses] : [...weaknesses, ...strengths];
    let k = 0;
    root.querySelector('#sec-review').scrollIntoView({ behavior: 'smooth' });
    const next = () => {
      if (k >= reel.length) { banner.hidden = true; return; }
      const h = reel[k++];
      playClip(h, () => setTimeout(next, 700));
    };
    next();
  });

  async function saveClip(h, btn) {
    const cap = video.captureStream || video.mozCaptureStream;
    if (!cap || !window.MediaRecorder) { btn.textContent = '이 브라우저는 지원 안 함'; return; }
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '구간 재생하며 저장 중…';
    clip = null;
    video.pause();
    await seekTo(video, h.t0);
    const stream = cap.call(video);
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start(250);
    banner.hidden = false; banner.className = 'clip-banner is-rec'; banner.textContent = `클립 저장 중 · ${h.title}`;
    await video.play().catch(() => {});
    await new Promise((r) => {
      const chk = () => { if (video.currentTime >= h.t1 || video.ended) { video.removeEventListener('timeupdate', chk); r(); } };
      video.addEventListener('timeupdate', chk);
    });
    video.pause();
    rec.stop();
    await stopped;
    banner.hidden = true;
    const ext = (mime || 'video/webm').includes('mp4') ? 'mp4' : 'webm';
    download(new Blob(chunks, { type: mime || 'video/webm' }), `${h.kind === 'strength' ? '잘한순간' : '고칠순간'}_${h.title.replace(/\s+/g, '')}_${fmtTime(h.t0).replace(':', 'm')}s.${ext}`);
    btn.disabled = false;
    btn.textContent = label;
  }

  root.querySelector('#btnRetry').addEventListener('click', () => onRetry(root.querySelector('input[name="focus"]:checked')?.value || null));
  root.querySelector('#btnEdit').addEventListener('click', () => onEdit(root.querySelector('input[name="focus"]:checked')?.value || null));
  root.querySelector('#btnHome').addEventListener('click', () => ctx.onHome?.());
  root.querySelector('#btnSaveFull').addEventListener('click', () => {
    fetch(videoURL).then((r) => r.blob()).then((b) => download(b, `발표연습_${purpose.label}_${new Date().toISOString().slice(0, 10)}.${b.type.includes('mp4') ? 'mp4' : 'webm'}`));
  });

  // ---------- 타임라인 ----------
  const css = getComputedStyle(document.documentElement);
  const col = (n) => css.getPropertyValue(n).trim();
  function drawTimeline() {
    const W = canvas.clientWidth;
    const H = 210;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const L = 64, Rp = 8;
    const x = (t) => L + (t / R.dur) * (W - L - Rp);
    const lanes = [['발화', 22], ['속도', 44], ['시선', 22], ['자세', 22], ['제스처', 22], ['알림', 22]];
    let y = 10;
    const Y = {};
    g.font = `12px ${col('--font-body') || 'sans-serif'}`;
    g.textBaseline = 'middle';
    for (const [name, h] of lanes) {
      Y[name] = [y, h];
      g.fillStyle = col('--muted');
      g.fillText(name, 4, y + h / 2);
      g.fillStyle = col('--track');
      g.fillRect(L, y, W - L - Rp, h);
      y += h + 8;
    }
    const S = R.series;
    // 발화
    g.fillStyle = col('--voice');
    for (const r of S.speech) g.fillRect(x(r.t0), Y['발화'][0] + 4, Math.max(1, x(r.t1) - x(r.t0)), Y['발화'][1] - 8);
    // 속도
    const [sy, sh] = Y['속도'];
    const [lo, hi] = purpose.targets.spm;
    const vmin = 150, vmax = 450;
    const vy = (v) => sy + sh - ((Math.max(vmin, Math.min(vmax, v)) - vmin) / (vmax - vmin)) * sh;
    g.fillStyle = col('--band');
    g.fillRect(L, vy(hi), W - L - Rp, vy(lo) - vy(hi));
    g.strokeStyle = col('--accent');
    g.lineWidth = 1.8;
    g.beginPath();
    let pen = false;
    S.rateSec.forEach((v, s) => {
      if (v == null) { pen = false; return; }
      const px = x(s + 0.5), py = vy(v);
      if (!pen) { g.moveTo(px, py); pen = true; } else g.lineTo(px, py);
    });
    g.stroke();
    // 비율 레인
    const ratioLane = (name, arr, goodHigh) => {
      const [ly, lh] = Y[name];
      arr.forEach((v, s) => {
        if (v == null) return;
        const good = goodHigh ? v >= 0.5 : v < 0.5;
        g.fillStyle = good ? col('--good-soft') : col('--bad');
        g.fillRect(x(s), ly + 4, Math.max(1, x(s + 1) - x(s)) + 0.5, lh - 8);
      });
    };
    ratioLane('시선', S.gazeSec, true);
    ratioLane('자세', S.badSec, false);
    {
      const [ly, lh] = Y['제스처'];
      S.gestSec.forEach((v, s) => {
        if (v == null || v === 0) return;
        g.fillStyle = col('--accent');
        g.globalAlpha = Math.min(1, 0.25 + v * 2);
        g.fillRect(x(s), ly + 4, Math.max(1, x(s + 1) - x(s)) + 0.5, lh - 8);
        g.globalAlpha = 1;
      });
    }
    // 알림: 문제 구간과 군더더기 말
    {
      const [ly, lh] = Y['알림'];
      for (const i of R.issues) {
        g.fillStyle = i.sev >= 3 ? col('--bad') : i.sev === 2 ? col('--warn') : col('--warn-soft');
        g.fillRect(x(i.t0), ly + 3, Math.max(2, x(i.t1) - x(i.t0)), lh / 2 - 3);
      }
      g.fillStyle = col('--filler');
      for (const f of S.fillerTimes) { g.beginPath(); g.arc(x(f.t), ly + lh * 0.75, 3, 0, Math.PI * 2); g.fill(); }
    }
    // 하이라이트 구간 표시
    for (const h of [...strengths, ...weaknesses]) {
      g.strokeStyle = h.kind === 'strength' ? col('--good') : col('--bad');
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x(h.t0), 4); g.lineTo(x(h.t1), 4); g.stroke();
    }
    // 시간 눈금
    g.fillStyle = col('--muted');
    g.font = `11px ${col('--font-mono') || 'monospace'}`;
    const step = R.dur > 240 ? 60 : R.dur > 90 ? 30 : 10;
    for (let t = 0; t <= R.dur; t += step) g.fillText(fmtTime(t), Math.min(x(t), W - 32), H - 6);
    // 재생 위치
    const ph = x(Math.min(video.currentTime || 0, R.dur));
    g.strokeStyle = col('--ink');
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(ph, 6); g.lineTo(ph, H - 16); g.stroke();
  }
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const t = ((e.clientX - r.left - 64) / (r.width - 72)) * R.dur;
    if (t >= 0 && t <= R.dur) { clip = null; banner.hidden = true; video.currentTime = t; }
  });
  let raf = 0;
  const loop = () => { drawTimeline(); if (!video.paused) raf = requestAnimationFrame(loop); };
  video.addEventListener('play', () => { cancelAnimationFrame(raf); loop(); });
  video.addEventListener('seeked', drawTimeline);
  video.addEventListener('pause', drawTimeline);
  const ro = new ResizeObserver(() => drawTimeline());
  ro.observe(canvas);
  fixDuration(video).then(drawTimeline);

  // ---------- 썸네일 ----------
  const all = [...strengths.map((h, i) => ['strength', i, h]), ...weaknesses.map((h, i) => ['weakness', i, h])];
  if (all.length) {
    makeThumbs(videoURL, all.map(([, , h]) => (h.t0 + h.t1) / 2)).then((urls) => {
      all.forEach(([k, i], n) => {
        const el = root.querySelector(`[data-hl="${k}:${i}"] .thumb-img`);
        if (el && urls[n]) el.style.backgroundImage = `url(${urls[n]})`;
      });
    }).catch((e) => console.warn('썸네일 생성 실패', e));
  }
  return () => { ro.disconnect(); cancelAnimationFrame(raf); };
}
