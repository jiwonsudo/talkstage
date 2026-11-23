// 대본 점검 화면
import { PURPOSES, PURPOSE_BY_ID, fmtTime } from './scenarios.js';
import { syllables } from './audio.js';
import { analyzeScript, contour, readScriptFile, Reader } from './script.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const K = 'rc-script-v1';
const load = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(K, JSON.stringify(v)); } catch {} };

const EXAMPLE = {
  ir: `안녕하세요. 발표 코칭 서비스 큐의 대표 김지원입니다.

발표를 앞둔 사람의 72%가 연습할 상대가 없다고 답했습니다. 코치를 구하면 한 시간에 10만 원이 넘고, 혼자 연습하면 무엇이 문제인지 알 수가 없습니다.

저희는 녹화 한 번으로 자세, 시선, 말 속도, 억양을 분석하고 고칠 장면만 잘라서 보여주는 서비스를 만들었습니다. 대본만 올려도 흐름과 시간을 점검해 주기 때문에 카메라 앞에 서기 전부터 준비를 시작할 수 있습니다.

국내 취업 준비생과 직장인을 합친 발표 코칭 시장은 약 4천억 원 규모입니다. 베타 3개월 만에 사용자 1만 명이 연습했고 재방문율은 46%입니다.

저희 팀은 음성 인식과 교육 분야에서 각각 7년 넘게 일한 세 명이 함께하고 있습니다.

이번 시드 라운드에서 10억 원 투자를 요청드립니다. 누구나 코치 없이 발표 실력을 올릴 수 있는 세상, 함께 만들어 주십시오. 감사합니다.`,
  interview: `안녕하십니까. 숫자로 증명하는 마케터 지원자 김지원입니다.

저는 지난 인턴 기간 동안 광고 캠페인 데이터를 분석해서 전환율을 2배로 올린 경험이 있습니다. 당시 예산은 그대로였지만 타깃을 세 그룹으로 나누고 그룹마다 메시지를 바꿨습니다.

이 경험을 바탕으로 귀사의 퍼포먼스 마케팅 팀에서 같은 예산으로 더 큰 성과를 만드는 데 기여하고 싶습니다. 감사합니다.`,
};
const exampleFor = (id) => EXAMPLE[id] || EXAMPLE.ir;

export function mountScript({ timeOptions, onRecord, toast }) {
  const st = load();
  const reader = new Reader();
  let result = null;
  let speed = 1;
  let playing = false;

  const pSel = $('#scPurpose'), tSel = $('#scTime'), keyIn = $('#scKey'), ta = $('#scText');
  pSel.innerHTML = PURPOSES.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
  const fillTimes = (keep) => {
    const p = PURPOSE_BY_ID[pSel.value];
    const opts = timeOptions(p.id);
    tSel.innerHTML = opts.map(([s, l]) => `<option value="${s}">${s % 60 ? fmtTime(s) : `${s / 60}분`} · ${esc(l)}${s === p.targetSec ? ' (추천)' : ''}</option>`).join('');
    tSel.value = String(keep && opts.some(([s]) => s === keep) ? keep : p.targetSec);
  };

  const persist = () => save({ text: ta.value, purposeId: pSel.value, targetSec: Number(tSel.value), key: keyIn.value });
  const onText = () => {
    const n = syllables(ta.value);
    $('#scCount').textContent = n ? `${n.toLocaleString()}음절` : '';
    $('#scRun').disabled = n < 20;
    persist();
  };
  ta.addEventListener('input', onText);
  keyIn.addEventListener('input', persist);
  pSel.addEventListener('change', () => { fillTimes(); persist(); if (result) run(); });
  tSel.addEventListener('change', () => { persist(); if (result) run(); });
  $('#scExample').addEventListener('click', () => {
    if (!['ir', 'interview'].includes(pSel.value)) { pSel.value = 'ir'; fillTimes(); }
    ta.value = exampleFor(pSel.value);
    keyIn.value = pSel.value === 'ir' ? '누구나 코치 없이 발표 실력을 올릴 수 있다' : '숫자로 증명하는 마케터';
    onText();
  });

  // 파일 올리기 · 끌어다 놓기
  const err = (m) => { $('#scErr').textContent = m || ''; };
  const takeFile = async (f) => {
    if (!f) return;
    err('');
    try {
      const t = await readScriptFile(f);
      if (!t.trim()) throw new Error('파일에서 글자를 찾지 못했어요.');
      ta.value = t.trim();
      onText();
      toast?.(`${f.name}을(를) 불러왔어요`);
    } catch (e) { err(e.message || '파일을 읽지 못했어요.'); }
  };
  $('#scFile').addEventListener('change', (e) => { takeFile(e.target.files[0]); e.target.value = ''; });
  const drop = $('#scDrop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); drop.classList.add('drag'); } }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { if (ev === 'dragleave' && drop.contains(e.relatedTarget)) return; drop.classList.remove('drag'); }));
  drop.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); takeFile(e.dataTransfer.files[0]); } });

  $('#scRun').addEventListener('click', () => { run(); setTimeout(() => $('#scOut').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); });

  function run() {
    reader.stop();
    const purpose = PURPOSE_BY_ID[pSel.value];
    const targetSec = Number(tSel.value);
    result = analyzeScript(ta.value, { purpose, targetSec, keyMessage: keyIn.value.trim() });
    render(purpose);
  }

  function render(purpose) {
    const r = result, s = r.stats;
    if (!s.n) { $('#scOut').innerHTML = ''; return; }
    const ratio = s.estSec / s.targetSec;
    const tCls = ratio > 1.25 || ratio < 0.6 ? 'bad' : ratio > 1.1 || ratio < 0.75 ? 'warn' : 'ok';
    const colorOf = Object.fromEntries(r.elements.map((e, k) => [e.id, k]));
    const flow = r.sents.map((x) => `<i style="flex:${x.syl}" ${x.flow ? `data-c="${colorOf[x.flow]}"` : ''} data-go="${x.i}" title="${x.i + 1}번 문장"></i>`).join('');
    const steps = r.elements.map((e) => e.at >= 0
      ? `<li><i data-c="${colorOf[e.id]}"></i>${esc(e.label)} <small>${e.at + 1}번</small></li>`
      : `<li class="miss"><i></i>${esc(e.label)} <small>없음</small></li>`).join('');
    const issues = r.issues.map((it) => `
      <li class="issue ${it.sev}"><i></i><b>${esc(it.title)}</b><p>${esc(it.detail)}</p>
      ${it.refs.length ? `<div class="refs">${[...new Set(it.refs)].map((i) => `<button type="button" class="sref" data-go="${i}">${i + 1}번 문장</button>`).join('')}</div>` : ''}</li>`).join('');
    const reading = r.sents.map((x, si) => {
      const pts = contour(x).map(([px, py]) => [px * 100, 3 + (1 - py) * 14]);
      let d = `M${pts[0][0]} ${pts[0][1]}`;
      for (let k = 1; k < pts.length; k++) { const [x0, y0] = pts[k - 1], [x1, y1] = pts[k]; const mx = (x0 + x1) / 2; d += ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`; }
      const body = x.chunks.map((c, ci) => `<span class="ck" data-ck="${si}-${ci}">${c.map((t) => (t.em ? `<em>${esc(t.w)}</em>` : esc(t.w))).join(' ')}</span>`)
        .join(' <span class="br">/</span> ');
      const tag = x.role ? `<span class="tag" data-tc="${colorOf[x.role]}">${esc(r.elements.find((e) => e.id === x.role).label)}</span>` : '';
      const dir = x.type === 'q' ? '<span class="dir up" title="말끝을 올려요">↗</span>' : x.type === 'ex' ? '<span class="dir" title="힘 있게">!</span>' : '<span class="dir" title="말끝을 내려요">↘</span>';
      return `<div class="rd${x.syl > 60 ? ' long' : ''}${si && x.para !== r.sents[si - 1].para ? ' para' : ''}" id="rd-${si}" data-play="${si}">
        <span class="rd-n">${si + 1}</span><div><svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>
        <p>${tag}${body} ${dir}</p></div></div>`;
    }).join('');
    const canSpeak = Reader.supported();

    $('#scOut').innerHTML = `
      <div class="sc-stats">
        <div class="stat ${tCls}"><span>예상 시간</span><b>${fmtTime(s.estSec)}</b><small>목표 ${fmtTime(s.targetSec)} · 분당 ${Math.round(s.spm)}음절 기준</small></div>
        <div class="stat"><span>문장</span><b>${s.n}</b><small>문단 ${s.paras}개</small></div>
        <div class="stat ${s.avg > 55 ? 'warn' : ''}"><span>평균 문장 길이</span><b>${s.avg}</b><small>음절 · 40~55가 편해요</small></div>
        <div class="stat ${s.long ? 'warn' : 'ok'}"><span>긴 문장</span><b>${s.long}</b><small>60음절 넘는 문장</small></div>
      </div>

      <section class="sc-sec"><h2 class="sc-h">흐름 <small>${esc(purpose.label)}에 맞는 순서</small></h2>
        <div class="flow-bar">${flow}</div><ul class="flow-steps">${steps}</ul></section>

      <section class="sc-sec"><h2 class="sc-h">고칠 점 <small>${r.issues.length ? `${r.issues.length}개 · 중요한 순서` : ''}</small></h2>
        ${r.issues.length ? `<ul class="issues">${issues}</ul>` : '<p class="subtitle">크게 고칠 곳이 없어요. 바로 녹화해 보세요.</p>'}
        ${r.good.length ? `<ul class="goods">${r.good.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}</section>

      <section class="sc-sec"><h2 class="sc-h">읽기 가이드 <small>문장을 누르면 거기서부터 읽어요</small></h2>
        <div class="legend"><span><span class="br">/</span> 짧게 쉬기</span><span><em>굵은 글자</em> 힘주기</span><span>↘ 말끝 내리기</span><span>↗ 말끝 올리기</span><span>파란 선 억양 높낮이</span></div>
        <div class="reading" id="scReading">${reading}</div>
        <div class="player">
          <button type="button" class="pl-btn" id="plBtn" aria-label="예시 억양으로 듣기" ${canSpeak ? '' : 'disabled'}><svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg></button>
          <span class="pl-t"><b id="plTitle">예시 억양으로 듣기</b><span id="plSub">${canSpeak ? '숨 쉴 자리에서 쉬고, 굵은 글자에서 힘을 줘서 읽어요' : '이 브라우저는 음성 읽기를 지원하지 않아요'}</span></span>
          <span class="pl-speed" role="group" aria-label="읽기 속도">${[0.9, 1, 1.15].map((v) => `<button type="button" data-speed="${v}" aria-pressed="${v === speed}">${v}×</button>`).join('')}</span>
        </div></section>

      <div class="sc-cta">
        <button type="button" class="btn-fill btn-block" id="scRecord">이 대본으로 녹화 리허설<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg></button>
        <p>대본과 핵심 메시지를 녹화 설정에 넘겨요. 녹화 후 리포트에서 대본대로 말했는지도 함께 봐요.</p>
      </div>`;

    $('#scOut').querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const el = $(`#rd-${b.dataset.go}`);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }));
    $('#scOut').querySelectorAll('[data-play]').forEach((el) => el.addEventListener('click', () => play(Number(el.dataset.play))));
    $('#scOut').querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
      speed = Number(b.dataset.speed);
      reader.rate = speed;
      $('#scOut').querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    $('#plBtn').addEventListener('click', () => (playing ? stop() : play(0)));
    $('#scRecord').addEventListener('click', () => {
      stop();
      onRecord({ purposeId: pSel.value, targetSec: Number(tSel.value), keyMessage: keyIn.value.trim(), text: ta.value.trim() });
    });
  }

  const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>';
  const ICON_STOP = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  function setPlaying(on) {
    playing = on;
    const b = $('#plBtn');
    if (!b) return;
    b.innerHTML = on ? ICON_STOP : ICON_PLAY;
    b.setAttribute('aria-label', on ? '멈추기' : '예시 억양으로 듣기');
    $('#plTitle').textContent = on ? '읽는 중' : '예시 억양으로 듣기';
  }
  reader.onChunk = (pos) => {
    document.querySelectorAll('.ck.on').forEach((x) => x.classList.remove('on'));
    if (!pos) return;
    const el = document.querySelector(`[data-ck="${pos.si}-${pos.ci}"]`);
    el?.classList.add('on');
    const line = $(`#rd-${pos.si}`);
    if (line && pos.ci === 0) {
      const r = line.getBoundingClientRect();
      if (r.top < 80 || r.bottom > innerHeight - 110) line.scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('#plSub').textContent = `${pos.si + 1} / ${result.sents.length}번 문장`;
    }
  };
  reader.onEnd = () => { setPlaying(false); $('#plSub').textContent = '끝까지 읽었어요. 이제 따라 읽어 보세요.'; };
  function play(from) {
    if (!Reader.supported()) return;
    if (!reader.pickVoice() && speechSynthesis.getVoices().length) $('#plSub').textContent = '한국어 음성이 없어 기본 음성으로 읽어요';
    setPlaying(true);
    const base = { interview: 1, ir: 1.05, report: 1.02, lecture: 0.95, conference: 1, speech: 0.92 }[pSel.value] || 1;
    reader.rate = speed;
    reader.play(result.sents, { base, from });
  }
  function stop() { reader.stop(); setPlaying(false); }
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => reader.pickVoice();

  return {
    open(prefill) {
      const s = { ...load(), ...(prefill || {}) };
      pSel.value = s.purposeId && PURPOSE_BY_ID[s.purposeId] ? s.purposeId : 'ir';
      fillTimes(s.targetSec);
      keyIn.value = s.key || '';
      ta.value = s.text || '';
      onText();
      err('');
      if (prefill?.text && syllables(prefill.text) >= 20) run();
      else if (!result) $('#scOut').innerHTML = '';
    },
    leave() { stop(); },
  };
}
