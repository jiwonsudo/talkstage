import { POSTURES, PURPOSES, PURPOSE_BY_ID, CAT_LABEL, fmtTime, parseTime } from './scenarios.js';
import { AudioMeter, Transcriber, syllables } from './audio.js';
import { loadVision, detect, extractFeatures, drawOverlay } from './vision.js';
import { analyze, buildCalibration, classifyFrame } from './analysis.js';
import { renderReport } from './report.js';
import { picto } from './picto.js';
import { mountScript } from './scriptview.js';
import { readScriptFile } from './script.js';
import { currentUser, onAuthChange, historyKey, signIn, signUp, signOut } from './auth.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const K_SETUP = 'rc-setup-v2';
// 요금제 (프로토타입: 요금표의 버튼으로 바꿔 볼 수 있어요)
const K_PLAN = 'ts-plan';
const planName = () => store.get(K_PLAN, 'Opening');
const isPaid = () => planName() !== 'Opening';
const CUSTOM_WARN = '직접 입력한 내용에는 검증된 기준표가 따로 없어요. 그래서 고른 유형과 항목의 기준으로 코칭하고, 적은 내용은 리포트 문구와 내용 점검에만 반영해요. 적는 방식에 따라 코칭이 덜 정확할 수 있어요.';

// 가장 큰 고민 하나로 자기 인식 비교에 쓸 성향을 만듭니다.
const WORRIES = [
  { id: 'selfFast', label: '긴장하면 말이 빨라져요' },
  { id: 'selfMono', label: '목소리가 단조로워요' },
  { id: 'selfFiller', label: '“어, 음, 이제”를 자주 써요' },
  { id: 'selfGaze', label: '시선 처리가 어려워요' },
  { id: 'selfGesture', label: '손을 어떻게 할지 모르겠어요' },
  { id: 'selfStructure', label: '결론부터 말하기가 어려워요' },
  { id: 'anxiety', label: '너무 긴장돼요', sub: '잘한 점부터 보여드리고, 고칠 점은 두 가지만 골라 드려요' },
];
const profileFrom = (worry) => {
  if (!worry) return null;
  const p = Object.fromEntries(WORRIES.map((w) => [w.id, 3]));
  p[worry] = 5;
  return p;
};

// 프롬프트에서 주제, 핵심 메시지, 원하는 결과, 대본을 뽑습니다.
export function parsePrompt(text) {
  const t = String(text || '').trim();
  if (!t) return { topic: '', keyMessage: '', outcomeText: '', script: '' };
  const sents = t.split(/(?<=[.!?。])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const quoted = t.match(/[“"‘']([^”"’']{6,120})[”"’']/);
  let key = quoted ? quoted[1] : sents.find((s) => /핵심|기억|메시지|강조|꼭 전하|하고 싶은 말/.test(s)) || '';
  key = key.replace(/^(핵심\s*메시지는|핵심은|메시지는|기억했으면\s*하는\s*건|강조하고\s*싶은\s*건|꼭\s*전하고\s*싶은\s*건)\s*/, '').trim();
  const outcome = sents.find((s) => /원하|목표|얻고|받고|잡고|따내|합격|승인|설득|끌어내/.test(s) && !(quoted && s.includes(quoted[1]))) || '';
  let topic = sents.find((s) => !s.includes(key || '\u0000') && s !== outcome) || sents[0];
  topic = topic.replace(/[.!?。]$/, '');
  if (topic.length > 48) topic = `${topic.slice(0, 46)}…`;
  const script = syllables(t) > 250 ? t : '';
  return { topic, keyMessage: key.replace(/[.!?。]$/, ''), outcomeText: outcome.replace(/[.!?。]$/, ''), script };
}

const saved = store.get(K_SETUP, {});
const draft = {
  purposeId: saved.purposeId || 'interview',
  posture: saved.posture || 'seated',
  customPurpose: saved.customPurpose || null,
  customGoal: saved.customGoal || null,
  outcomeIdxs: Array.isArray(saved.outcomeIdxs) ? saved.outcomeIdxs : [saved.outcomeIdx ?? 0],
  targetSec: saved.targetSec || null,
  worry: saved.worry || null,
  prompt: saved.prompt || '',
  hasScript: saved.hasScript || null,
  script: saved.script || '',
  key: saved.key || '',
};
const state = {
  focus: null,
  stream: null, audio: null, models: null, modelFailed: false,
  phase: 'idle', lastDet: 0, frames: [], calibFrames: [],
  recStart: 0, recorder: null, chunks: [], transcriber: null, videoURL: null,
  live: { cooldown: {}, lastQuiet: 0 },
  cleanupReport: null,
};
const purpose = () => PURPOSE_BY_ID[draft.purposeId];
// 고른 목표(최대 3개)와 그 목표가 권하는 발표 길이
const pickedOutcomes = () => draft.outcomeIdxs.map((i) => purpose().outcomes[i]).filter(Boolean);
const outcomeLabel = () => [...pickedOutcomes(), ...(draft.customGoal ? [draft.customGoal] : [])].map((o) => o.label).join(' · ');
function recommendTime() {
  const p = purpose();
  const opts = (TIME_OPTIONS[p.id] || []).map(([s]) => s);
  const votes = new Map();
  pickedOutcomes().forEach((o, k) => { if (o.sec && opts.includes(o.sec)) votes.set(o.sec, (votes.get(o.sec) || 0) + 3 - k); });
  if (!votes.size) return { sec: p.targetSec, why: `${p.label}에서 가장 흔한 길이예요` };
  const sec = [...votes].sort((a, b) => b[1] - a[1])[0][0];
  const by = pickedOutcomes().find((o) => o.sec === sec);
  return { sec, why: `‘${by.label}’에 맞춘 길이예요` };
}
const targetSec = () => draft.targetSec || recommendTime().sec;
const saveDraft = () => store.set(K_SETUP, { ...draft });

// ---------------- 화면과 내비게이션 바 ----------------
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let wipeN = 0;
function playTransition(from, to) {
  const el = $(`#s-${to}`);
  el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
  if (reduceMotion || !from || from === to) return;
  const w = $('#wipe');
  w.dataset.v = String(wipeN++ % 3);
  w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
}
function show(name) {
  const from = document.body.dataset.screen;
  if (from === 'script' && name !== 'script') scriptView?.leave();
  for (const s of ['home', 'script', 'wizard', 'studio', 'report']) $(`#s-${s}`).hidden = s !== name;
  playTransition(document.body.dataset.ready ? from : null, name);
  document.body.dataset.ready = '1';
  document.body.dataset.screen = name;
  window.scrollTo(0, 0);
  const nav = { home: [null, ''], script: ['이전', '대본 분석'], wizard: ['홈', '새 프레젠테이션'], studio: ['설정', '녹화'], report: ['홈', '리포트'] }[name];
  $('#navBack').hidden = !nav[0];
  $('#navBackLabel').textContent = nav[0] || '';
  $('#navTitle').textContent = nav[1];
  if (name === 'home') { renderHome(); setTimeout(countUp, 500); }
  if (name === 'studio') enterStudio();
}
$('#navBack').addEventListener('click', () => {
  if (['rec', 'calib', 'analyzing'].includes(state.phase)) return;
  const s = document.body.dataset.screen;
  if (s === 'wizard') go(-1);
  else if (s === 'studio' || s === 'script') startWizard(wiz.steps.length ? wiz.steps.length - 1 : 0);
  else show('home');
});

// ---------------- 홈 ----------------
function renderHome() {
  const user = currentUser();
  const hist = store.get(historyKey(), []).slice(-5).reverse();
  $('#recentTitle').textContent = user ? `${user.name}님의 최근 연습` : '최근 연습';
  const rows = hist.map((h) => `
    <li class="cell"><span class="cover cover-${h.overall >= 80 ? 3 : h.overall >= 55 ? 2 : 4}">${h.overall ?? '–'}</span>
      <span class="cell-t"><b>${esc(h.topic || PURPOSE_BY_ID[h.purposeId]?.label || '발표')}</b>
      <small>${esc(PURPOSE_BY_ID[h.purposeId]?.label || '')} · ${h.posture === 'standing' ? '서서' : '앉아서'} · ${new Date(h.at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}</small></span></li>`).join('');
  const prompt = user ? '' : `<li class="cell cell-login"><span class="cell-t"><b>로그인하고 기록을 모아 보세요</b><small>연습할 때마다 점수가 쌓이고, 같은 상황의 지난 연습과 비교해 드려요.${hist.length ? ' 지금까지의 기록도 계정으로 옮겨져요.' : ''}</small></span><button type="button" class="btn" data-login>로그인</button></li>`;
  $('#recent').innerHTML = prompt + (rows || (user ? '<li class="cell cell-empty">아직 연습 기록이 없어요. 첫 연습을 시작해 보세요.</li>' : ''));
  $('#recent').querySelector('[data-login]')?.addEventListener('click', () => openAuth('in'));
  // 다시 찾아온 사용자는 히어로 바로 아래에서 지난 연습을 봅니다.
  const rb = $('#recentBlock');
  if (user && hist.length) document.querySelector('.hero').after(rb);
  else document.querySelector('.cta-band').before(rb);
}
// 새 리허설은 지난 대본·메모를 비우고 시작해요. 예시는 placeholder로만 보여 줘요.
const clearText = () => { draft.script = ''; draft.key = ''; draft.prompt = ''; draft.hasScript = 'yes'; };
const startFresh = () => { state.focus = null; clearText(); startWizard(0); };
$('#brandHome').addEventListener('click', (e) => {
  e.preventDefault();
  if (['rec', 'calib', 'analyzing'].includes(state.phase)) return;
  if (document.body.dataset.screen === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
  else show('home');
});
$('#btnNew').addEventListener('click', startFresh);
$('#btnNew2').addEventListener('click', startFresh);

// ---------------- 대본 점검 ----------------
let scriptView = null;
let fromWizard = false; // 녹화 마법사에서 대본 분석으로 왔으면, 분석 뒤 바로 녹화 화면으로 갑니다.
function openScript(prefill) {
  show('script');
  scriptView.open(prefill);
}

// 도입 문의 (프로토타입: 이 브라우저에만 저장)
const ctDlg = $('#contactDlg'), ctForm = $('#contactForm');
let ctKind = 'biz';
function setCtKind(k) {
  ctKind = k;
  ctDlg.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.kind === k)));
  $('#ctOrgLabel').textContent = k === 'edu' ? '학교 · 기관명' : '회사명';
  $('#ctMailLabel').textContent = k === 'edu' ? '기관 이메일' : '업무 이메일';
}
function openContact(k = 'biz') {
  ctForm.reset(); $('#ctErr').textContent = '';
  $('#ctBody').hidden = false; $('#ctDone').hidden = true;
  setCtKind(k);
  ctDlg.showModal();
  setTimeout(() => ctForm.elements.namedItem('org').focus(), 60);
}
ctDlg.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => setCtKind(b.dataset.kind)));
$('#ctClose').addEventListener('click', () => ctDlg.close());
$('#ctOk').addEventListener('click', () => ctDlg.close());
ctDlg.addEventListener('click', (e) => { if (e.target === ctDlg) ctDlg.close(); });
ctForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = (n) => String(ctForm.elements.namedItem(n).value || '').trim();
  const err = !v('org') ? '소속을 입력해 주세요.' : !v('person') ? '이름을 입력해 주세요.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('mail')) ? '이메일 형식을 확인해 주세요.' : '';
  if (err) { $('#ctErr').textContent = err; return; }
  const leads = store.get('rc-leads-v1', []);
  leads.push({ kind: ctKind, org: v('org'), person: v('person'), size: v('size'), mail: v('mail'), note: v('note'), at: Date.now() });
  store.set('rc-leads-v1', leads);
  $('#ctBody').hidden = true; $('#ctDone').hidden = false;
});
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-contact]');
  if (c) { openContact(c.dataset.contact || 'biz'); return; }
  if (e.target.closest('[data-start]')) startFresh();
  const sw = e.target.closest('[data-cmp]');
  if (sw) {
    const team = sw.dataset.cmp === 'team';
    document.querySelectorAll('[data-cmp]').forEach((b) => b.setAttribute('aria-selected', String(b === sw)));
    $('#cmpSolo').hidden = team; $('#cmpTeam').hidden = !team;
    $('#cmpSolo').classList.add('in'); $('#cmpTeam').classList.add('in');
  }
  const plan = e.target.closest('[data-plan]');
  if (plan) { store.set(K_PLAN, plan.dataset.plan); toast(`프로토타입이라 결제 없이 ${plan.dataset.plan}을 켰어요. 직접 입력 기능을 써 볼 수 있어요.`); }
});

// 푸터 바로 가기
document.querySelector('.foot').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fx], [data-fp]');
  if (!b) return;
  if (b.dataset.fp) {
    state.focus = null;
    clearText();
    if (b.dataset.fp !== draft.purposeId) { draft.purposeId = b.dataset.fp; draft.outcomeIdxs = [0]; draft.customGoal = null; draft.targetSec = null; }
    saveDraft();
    startWizard(1);
    return;
  }
  const fx = b.dataset.fx;
  if (fx === 'new') startFresh();
  else if (fx === 'login') currentUser() ? toast('이미 로그인되어 있어요') : openAuth('in');
  else if (fx === 'recent') $('#recentBlock').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// 발표 상황 고르기: 고정 그리드
const ART_OF = { interview: 1, ir: 3, report: 2, lecture: 4, conference: 7, capstone: 6, speech: 5 };
$('#scenGrid').innerHTML = PURPOSES.map((p) => `
  <button type="button" class="pcard art-${ART_OF[p.id] || 2}" data-purpose="${p.id}" data-picto="${p.id}">
    <span class="pc-time">${p.targetSec % 60 ? fmtTime(p.targetSec) : `${p.targetSec / 60}분`}</span>
    <b>${esc(p.label)}</b><small>${esc(p.summary)}</small>
    <span class="pc-go" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7"/></svg></span>
  </button>`).join('');
$('#scenGrid').querySelectorAll('[data-purpose]').forEach((b) => b.addEventListener('click', () => {
  state.focus = null;
  clearText();
  if (b.dataset.purpose !== draft.purposeId) { draft.purposeId = b.dataset.purpose; draft.outcomeIdxs = [0]; draft.customGoal = null; draft.targetSec = null; }
  saveDraft();
  startWizard(1);
}));

// ---------------- 로그인 ----------------
// 소셜 로그인은 OAuth 앱 등록과 서버 연결이 필요해 출시 때 엽니다.
document.querySelectorAll('[data-soc]').forEach((b) => b.addEventListener('click', () => {
  const n = $('#socNote');
  n.hidden = false;
  n.textContent = `${b.dataset.soc} 로그인은 정식 출시 때 열려요. 지금은 이메일로 가입하면 기록이 그대로 이어져요.`;
}));
let authMode = 'in';
function setAuthMode(m) {
  authMode = m;
  const up = m === 'up';
  $('#authTitle').textContent = up ? '회원가입' : '로그인';
  $('#authSubmit').textContent = up ? '가입하고 시작하기' : '로그인';
  $('#fName').hidden = !up;
  $('#authForm').elements.namedItem('password').autocomplete = up ? 'new-password' : 'current-password';
  $('#authDlg').querySelectorAll('.seg [data-mode]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.mode === m)));
  $('#authErr').textContent = '';
}
function openAuth(m = 'in') {
  setAuthMode(m);
  $('#authForm').reset();
  $('#authDlg').showModal();
  setTimeout(() => $('#authForm').elements.namedItem(m === 'up' ? 'name' : 'email').focus(), 60);
}
function closeAuth() {
  const d = $('#authDlg');
  if (!d.open) return;
  d.classList.add('closing');
  setTimeout(() => { d.classList.remove('closing'); d.close(); }, 220);
}
$('#btnLogin').addEventListener('click', () => openAuth('in'));
$('#authClose').addEventListener('click', closeAuth);
$('#authDlg').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeAuth(); });
$('#authDlg').addEventListener('cancel', (e) => { e.preventDefault(); closeAuth(); });
$('#authDlg').querySelectorAll('.seg [data-mode]').forEach((t) => t.addEventListener('click', () => setAuthMode(t.dataset.mode)));
$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget, btn = $('#authSubmit');
  btn.disabled = true;
  $('#authErr').textContent = '';
  try {
    const el = (n) => f.elements.namedItem(n).value;
    const data = { name: el('name'), email: el('email'), password: el('password') };
    const { moved } = authMode === 'up' ? await signUp(data) : await signIn(data);
    closeAuth();
    toast(moved ? `기존 연습 ${moved}개를 계정으로 옮겼어요.` : `${currentUser().name}님, 반가워요.`);
  } catch (err) {
    $('#authErr').textContent = err.message || '다시 시도해 주세요.';
    f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
  } finally { btn.disabled = false; }
});
function renderAccount(user) {
  $('#btnLogin').hidden = !!user;
  $('#account').hidden = !user;
  if (user) {
    $('#avatar').textContent = user.name.trim().slice(0, 1).toUpperCase();
    $('#accName').textContent = user.name;
    $('#menuName').textContent = user.name;
    $('#menuEmail').textContent = user.email;
  }
  closeMenu();
  if (document.body.dataset.screen === 'home') renderHome();
}
function closeMenu() { $('#accMenu').hidden = true; $('#btnAccount').setAttribute('aria-expanded', 'false'); }
$('#btnAccount').addEventListener('click', (e) => {
  e.stopPropagation();
  const open = $('#accMenu').hidden;
  $('#accMenu').hidden = !open;
  $('#btnAccount').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', (e) => { if (!e.target.closest?.('#account')) closeMenu(); });
$('#mLogout').addEventListener('click', () => { signOut(); toast('로그아웃했어요.'); });
$('#mHistory').addEventListener('click', () => {
  closeMenu();
  if (['rec', 'calib', 'analyzing'].includes(state.phase)) return;
  if (document.body.dataset.screen !== 'home') show('home');
  setTimeout(() => $('#recentTitle').scrollIntoView({ behavior: 'smooth', block: 'start' }), 450);
});
onAuthChange(renderAccount);
renderAccount(currentUser());

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 2400);
  setTimeout(() => t.remove(), 2800);
}

// ---------------- 랜딩 모션 ----------------
const revealIO = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => {
  for (const e of ents) if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }) : null;
const REVEAL_SEL = '.rv, .r-hero, .r-sec, .hl, .cat, .pri';
function hydratePicto(root) {
  root.querySelectorAll('[data-picto]:not([data-pd])').forEach((el) => { el.dataset.pd = '1'; el.insertAdjacentHTML('beforeend', picto(el.dataset.picto)); });
}
function scanReveal(root) {
  hydratePicto(root);
  root.querySelectorAll(REVEAL_SEL).forEach((el) => {
    if (el.dataset.rvd) return;
    el.dataset.rvd = '1';
    el.classList.add('rv');
    if (reduceMotion || !revealIO) el.classList.add('in'); else revealIO.observe(el);
  });
}
scanReveal(document);
new MutationObserver(() => scanReveal(document.querySelector('main'))).observe(document.querySelector('main'), { childList: true, subtree: true });

const heroArt = $('#heroArt');
if (heroArt && !reduceMotion) {
  document.querySelector('.hero').addEventListener('pointermove', (e) => {
    const r = heroArt.getBoundingClientRect();
    heroArt.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    heroArt.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  });
}
function countUp() {
  const n = document.querySelector('.sm-num');
  if (!n) return;
  const to = Number(n.dataset.count), t0 = performance.now(), dur = reduceMotion ? 1 : 1600;
  const step = (now) => { const k = Math.min(1, (now - t0) / dur); n.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------------- 질문 5개 + 프롬프트 ----------------
const STEPS = ['purpose', 'posture', 'outcome', 'time', 'worry', 'prompt'];
const wiz = { steps: STEPS, i: 0, def: null, lock: null };
function startWizard(i = 0) {
  wiz.i = i;
  show('wizard');
  renderStep(1);
}
function go(delta) {
  saveDraft();
  const n = wiz.i + delta;
  if (n < 0) { show('home'); return; }
  if (n >= wiz.steps.length) { show('studio'); return; }
  wiz.i = n;
  renderStep(delta);
}
// 목적별 실제 발표 길이 (추천 = 각 목적의 targetSec)
const TIME_OPTIONS = {
  interview: [[60, '1분 자기소개'], [90, '1분 30초 자기소개'], [120, '경험·지원 동기 답변'], [300, 'PT 면접 (짧게)'], [600, 'PT 면접']],
  ir: [[60, '엘리베이터 피치'], [180, '데모데이 피치'], [300, '피칭 대회·오디션'], [600, '투자사 첫 미팅'], [1200, '풀 피치 (10/20/30 규칙의 20분)']],
  report: [[60, '복도에서 1분 보고'], [180, '짧은 구두 보고'], [300, '주간·현황 보고'], [600, '의사결정 회의'], [1200, '분기 리뷰']],
  lecture: [[300, '한 개념 리허설'], [600, '마이크로 강의'], [900, '워크숍 한 세션'], [1200, '세션 강의'], [1800, '정규 강의 한 파트']],
  conference: [[180, '3분 연구 발표'], [300, '라이트닝 토크'], [600, '구두 발표'], [900, '정규 세션 발표'], [1200, '초청 강연']],
  capstone: [[180, '아이디어 피치'], [300, '중간 발표'], [600, '졸업 프로젝트 발표'], [900, '최종 발표 · 데모 포함'], [1200, '학위 논문 발표']],
  speech: [[60, '짧은 건배사'], [120, '짧은 축사'], [180, '축사·인사말'], [300, '긴 기념사']],
};
const timeOpts = () => TIME_OPTIONS[purpose().id] || TIME_OPTIONS.report;
const fmtMin = (s) => (s % 60 ? fmtTime(s) : `${s / 60}분`);
function stepDef(id) {
  const p = purpose();
  switch (id) {
    case 'purpose':
      return { title: '어떤 발표인가요?', sub: '목적에 따라 좋은 속도, 쉼, 억양, 시선의 기준이 달라져요.',
        options: PURPOSES.map((x) => ({ label: x.label, sub: x.summary, icon: x.id, art: ART_OF[x.id] })), value: PURPOSES.findIndex((x) => x.id === draft.purposeId),
        extra: customPurposeHTML, mount: mountCustomPurpose,
        pick: (i) => { draft.customPurpose = null; if (PURPOSES[i].id !== draft.purposeId) { draft.purposeId = PURPOSES[i].id; draft.outcomeIdxs = [0]; draft.customGoal = null; draft.targetSec = null; } } };
    case 'posture':
      return { title: '앉아서 하나요, 서서 하나요?', sub: '서서 하면 전신 움직임까지 분석해요.',
        options: Object.values(POSTURES).map((x, i) => ({ label: x.label, sub: x.desc, icon: x.id, art: i ? 4 : 2 })), value: draft.posture === 'standing' ? 1 : 0,
        pick: (i) => { draft.posture = i === 1 ? 'standing' : 'seated'; } };
    case 'outcome':
      return { title: '무엇을 얻고 싶나요?', sub: `${draft.customPurpose?.name || p.label}에서 이루고 싶은 것을 최대 3개까지 골라 주세요. 먼저 고른 것을 더 중요하게 봐요.`,
        extra: customGoalHTML, mount: mountCustomGoal,
        multi: 3, options: p.outcomes.map((o) => ({ label: o.label })), value: draft.outcomeIdxs,
        pick: (arr) => { draft.outcomeIdxs = arr; draft.targetSec = null; } };
    case 'time':
      return { title: '목표 시간은요?', sub: '실제 발표 자리에 맞춰 골라 주세요.',
        options: (() => { const rec = recommendTime(); return timeOpts().map(([s, l]) => ({ label: fmtMin(s), sub: s === rec.sec ? `${l} · ${rec.why}` : l, badge: s === rec.sec ? '추천' : '' })); })(), value: timeOpts().findIndex(([s]) => s === targetSec()),
        pick: (i) => { draft.targetSec = timeOpts()[i][0]; } };
    case 'worry':
      return { title: '가장 걱정되는 건 뭔가요?', sub: '녹화 결과와 비교해서, 걱정이 맞는지와 모르고 있던 약점을 알려드려요.',
        options: [...WORRIES.map((w) => ({ label: w.label, sub: w.sub })), { label: '잘 모르겠어요' }],
        value: draft.worry ? WORRIES.findIndex((w) => w.id === draft.worry) : null,
        pick: (i) => { draft.worry = WORRIES[i]?.id || null; } };
    case 'prompt':
      return (draft.hasScript || 'yes') === 'yes' ? { ...PROMPT_COPY.yes, kind: 'prompt' } : { ...PROMPT_COPY.no, kind: 'prompt' };
  }
}
const SCRIPT_EXAMPLES = {
  interview: '안녕하세요, 마케팅 직무에 지원한 김하늘입니다.\n지난 캠페인에서 데이터를 다시 읽는 것만으로 전환율을 두 배로 올렸습니다.\n숫자로 증명하는 마케터가 되겠습니다.',
  ir: '안녕하세요. 저희는 발표 연습을 돕는 서비스를 만들었습니다.\n사용자는 지난 석 달 동안 두 배로 늘었습니다.\n이제 다음 단계로 투자를 요청드립니다.',
  report: '결론부터 말씀드리겠습니다. 3분기 광고비를 20% 줄이고도 전환은 유지했습니다.\n근거는 세 가지입니다.\n4분기 예산은 같은 방식으로 승인 부탁드립니다.',
  lecture: '오늘은 피싱 메일을 구별하는 방법 세 가지를 알아보겠습니다.\n먼저 보낸 사람 주소부터 보겠습니다.\n의심되면 클릭하기 전에 꼭 물어보세요.',
  conference: '긴장하면 말이 얼마나 빨라질까요?\n저희는 대학생 120명의 발표를 분석했습니다.\n그 결과 평균 15% 빨라졌습니다.',
  capstone: '저희 팀은 시각장애인을 위한 음성 길안내 앱을 만들었습니다.\n문제는 기존 앱이 화면을 봐야만 쓸 수 있다는 점이었습니다.\n세 번의 탭으로 목적지까지 안내합니다.',
  speech: '안녕하세요, 신랑의 대학 동기 김하늘입니다.\n신입생 때 처음 만난 날을 아직도 기억합니다.\n두 사람이 서로의 가장 든든한 편이 되길 바랍니다.',
};
const PROMPT_COPY = {
  yes: { title: '발표 대본을 넣어 주세요', sub: '녹화 전에 시간, 흐름, 긴 문장부터 점검해요.' },
  no: { title: '어떤 발표인지만 알려 주세요', sub: '대본 점검은 건너뛰어요. 말한 내용은 녹화한 뒤 받아쓰기로 확인해요.' },
};
const EXAMPLES = {
  interview: '마케팅 직무 1차 면접 자기소개예요. 데이터로 캠페인 성과를 2배 올린 경험을 강조하고 싶어요. 핵심 메시지는 “숫자로 증명하는 마케터”입니다.',
  ir: 'AI 발표 코칭 서비스 시드 투자 피칭이에요. 핵심 메시지는 “누구나 코치 없이 발표 실력을 올릴 수 있다”입니다. 후속 미팅을 잡는 게 목표예요.',
  report: '3분기 마케팅 성과 보고예요. 핵심은 “광고비를 20% 줄이고도 전환은 유지했다”입니다. 4분기 예산 승인을 받고 싶어요.',
  lecture: '신입사원 대상 보안 교육이에요. 핵심 메시지는 “의심되면 클릭 전에 물어보기”입니다. 실습으로 이어지게 하고 싶어요.',
  conference: '한국어 발화 속도 연구 결과 발표예요. 핵심 메시지는 “긴장하면 말이 평균 15% 빨라진다”입니다. 질문과 토론을 이끌고 싶어요.',
  capstone: '졸업 프로젝트 최종 발표예요. 시각장애인을 위한 음성 길안내 앱을 만들었고, 핵심 메시지는 “3번의 탭으로 목적지까지”입니다. 좋은 평가를 받고 포트폴리오에도 쓰고 싶어요.',
  speech: '대학 동기 결혼식 축사예요. 신입생 때 처음 만난 이야기로 시작하고 싶어요. 핵심은 “서로의 가장 든든한 편”이라는 말이에요.',
};

function renderStep(dir = 1) {
  const id = wiz.steps[wiz.i];
  const d = stepDef(id);
  wiz.def = d;
  wiz.lock = null;
  const n = wiz.steps.length;
  $('#wizCount').textContent = `${wiz.i + 1}/${n}`;
  $('#wizFill').style.width = `${((wiz.i + 1) / n) * 100}%`;
  $('#navBackLabel').textContent = wiz.i === 0 ? '홈' : '이전';
  let body;
  if (d.kind === 'prompt') {
    const p = purpose();
    const has = draft.hasScript || 'yes';
    body = `
      <div class="wiz-pane" id="wYes" ${has === 'yes' ? '' : 'hidden'}>
        <button type="button" class="alt-path" data-has="no"><b>대본이 없나요?</b><span>한두 줄 설명만 적고 바로 녹화해요</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg></button>
        <div class="textview wiz-drop" id="wDrop"><textarea id="wScriptText" rows="9" placeholder="${esc(`발표 대본을 붙여넣거나, 파일(.txt · .md · .docx)을 여기에 끌어다 놓으세요.\n\n예시)\n${SCRIPT_EXAMPLES[p.id] || SCRIPT_EXAMPLES.report}`)}">${esc(draft.script)}</textarea></div>
        <div class="chips-row"><label class="chip-btn wiz-file">파일 올리기<input type="file" id="wFile" accept=".txt,.md,.docx,text/plain" hidden></label><span class="file-types">.txt · .md · .docx</span><span class="count" id="wScCount"></span></div>
        <p class="wiz-err" id="wErr" hidden></p>
        <label class="field"><span>핵심 메시지 <small>(선택)</small></span><input id="wKey" type="text" maxlength="80" value="${esc(draft.key)}" placeholder="청중이 기억했으면 하는 한 문장"></label>
        <button type="button" class="btn-fill btn-block" id="wAnalyze">대본 분석하기</button>
      </div>
      <div class="wiz-pane" id="wNo" ${has === 'no' ? '' : 'hidden'}>
        <button type="button" class="back-path" data-has="yes"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 5l-7 7 7 7"/></svg>대본이 있어요</button>
        <div class="textview"><textarea id="wPrompt" rows="4" placeholder="어떤 발표인지 한두 줄만 적어 주세요 (선택). 예: ${esc(EXAMPLES[p.id])}">${esc(has === 'no' ? draft.prompt : '')}</textarea></div>
        <div class="chips-row"><button type="button" class="chip-btn" id="wExample">예시로 채우기</button><span class="count" id="wCount"></span></div>
        <p class="group-h">자동으로 찾은 내용</p>
        <ul class="group" id="wParsed"></ul>
        <button type="button" class="btn-fill btn-block" id="wDone">녹화 준비</button>
      </div>`;
  } else {
    const selIdx = (i) => (d.multi ? d.value.indexOf(i) : (i === d.value ? 0 : -1));
    body = `<ul class="opts${d.options.some((o) => o.icon) ? ' opts-ico' : ''}${d.multi ? ' opts-multi' : ''}">${d.options.map((o, i) => `
      <li><button type="button" class="opt cell-btn${selIdx(i) >= 0 ? ' is-sel' : ''}" data-opt="${i}"${d.multi ? ` aria-pressed="${selIdx(i) >= 0}"` : ''}>
        ${o.icon ? `<span class="opt-ico art-${o.art || 2}" data-picto="${o.icon}"></span>` : `<span class="opt-num">${i + 1}</span>`}
        <span class="opt-t"><b>${esc(o.label)}${o.badge ? `<em class="badge">${o.badge}</em>` : ''}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>
        <span class="check" aria-hidden="true"></span>
      </button></li>`).join('')}</ul>`
      + (d.extra ? d.extra() : '')
      + (d.multi ? `<div class="multi-foot"><span id="multiCount"></span><button type="button" class="btn-fill" id="multiNext">다음</button></div>` : '');
  }
  $('#wizBody').innerHTML = `<div class="step ${dir < 0 ? 'from-left' : 'from-right'}">
    <h1 class="title1">${esc(d.title)}</h1><p class="subtitle">${esc(d.sub)}</p>${body}</div>`;

  $('#wizBody').querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => pickOption(Number(b.dataset.opt))));
  d.mount?.();
  if (d.multi) { syncMulti(); $('#multiNext').addEventListener('click', () => { if (d.value.length || draft.customGoal) go(1); }); }
  if (d.kind === 'prompt') {
    const ta = $('#wPrompt'), st = $('#wScriptText'), keyIn = $('#wKey'), err = $('#wErr');
    const setHas = (v) => {
      draft.hasScript = v;
      const c = PROMPT_COPY[v]; $('#wizBody .title1').textContent = c.title; $('#wizBody .subtitle').textContent = c.sub;
      $('#wYes').hidden = v !== 'yes'; $('#wNo').hidden = v !== 'no';
      // 대본 없이 가면 한두 줄 설명만 분석에 씁니다.
      if (v === 'no') { draft.prompt = ta.value; renderParsed(); }
      saveDraft();
      setTimeout(() => (v === 'yes' ? st : ta).focus(), 40);
    };
    $('#wizBody').querySelectorAll('[data-has]').forEach((x) => x.addEventListener('click', () => setHas(x.dataset.has)));
    const updSc = () => {
      draft.script = st.value; draft.key = keyIn.value;
      const n = syllables(st.value);
      $('#wScCount').textContent = n ? `${n}음절` : '';
      $('#wAnalyze').disabled = n < 20;
      err.hidden = true;
    };
    st.addEventListener('input', updSc); keyIn.addEventListener('input', updSc);
    const loadFile = async (f) => {
      if (!f) return;
      try { st.value = await readScriptFile(f); updSc(); saveDraft(); }
      catch (e) { err.textContent = e.message || '파일을 읽지 못했어요.'; err.hidden = false; }
    };
    $('#wFile').addEventListener('change', (e) => loadFile(e.target.files[0]));
    const drop = $('#wDrop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); loadFile(e.dataTransfer.files[0]); });
    $('#wAnalyze').addEventListener('click', () => {
      draft.hasScript = 'yes';
      saveDraft();
      fromWizard = true;
      openScript({ purposeId: draft.purposeId, targetSec: targetSec(), key: draft.key.trim() || undefined, text: draft.script.trim() });
    });
    const upd = () => { draft.prompt = ta.value; renderParsed(); };
    ta.addEventListener('input', upd);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(1); } });
    $('#wExample').addEventListener('click', () => { ta.value = EXAMPLES[purpose().id]; upd(); ta.focus(); });
    $('#wDone').addEventListener('click', () => { draft.hasScript = 'no'; draft.prompt = ta.value; go(1); });
    updSc();
    renderParsed();
    setTimeout(() => ((draft.hasScript || 'yes') === 'yes' ? st : ta).focus(), 80);
  }
}
function renderParsed() {
  const r = parsePrompt(draft.prompt);
  const n = syllables(draft.prompt);
  $('#wCount').textContent = n ? `${n}음절` : '';
  const rows = [
    ['주제', r.topic],
    ['핵심 메시지', r.keyMessage ? `“${r.keyMessage}”` : ''],
    ['원하는 결과', r.outcomeText || outcomeLabel()],
  ];
  if (r.script) {
    const p = purpose();
    const sec = (n / ((p.targets.spm[0] + p.targets.spm[1]) / 2)) * 60 * 1.12;
    rows.push(['대본 예상 시간', `${fmtTime(sec)} (목표 ${fmtTime(targetSec())})`]);
  }
  $('#wParsed').innerHTML = rows.map(([k, v]) => `<li class="cell cell-kv"><span>${k}</span><b class="${v ? '' : 'empty'}">${esc(v || '아직 없음')}</b></li>`).join('')
    + (r.keyMessage ? '' : '<li class="cell cell-note">핵심 메시지는 따옴표로 감싸거나 “핵심은 ~”처럼 쓰면 찾아요. 녹화 후 이 문장이 처음과 끝에 나왔는지 확인해요.</li>');
}
// ---------- 직접 입력 (유료 요금제) ----------
const lockHTML = (id, t) => `<button type="button" class="custom-lock" id="${id}"><span><b>${t}</b><small>Spotlight 이상 요금제에서 쓸 수 있어요</small></span><i aria-hidden="true">Spotlight</i></button>`;
const lockToast = () => toast('직접 입력은 Spotlight 요금제부터 쓸 수 있어요. 홈 아래 요금제에서 확인해 보세요.');
function customPurposeHTML() {
  if (!isPaid()) return lockHTML('cuLock', '원하는 발표가 없나요? 직접 입력하기');
  const cp = draft.customPurpose, base = cp?.base || draft.purposeId;
  return `<details class="custom-box" ${cp ? 'open' : ''}><summary>원하는 발표가 없나요? 직접 입력하기</summary>
    <label class="field"><span>발표 이름</span><input id="cuName" type="text" maxlength="30" value="${esc(cp?.name || '')}" placeholder="예: 사내 해커톤 결선 발표"></label>
    <p class="group-h">가장 비슷한 유형 <small>이 유형의 속도·쉼·시선 기준으로 코칭해요</small></p>
    <div class="custom-chips" id="cuBase">${PURPOSES.map((x) => `<button type="button" class="${x.id === base ? 'is-on' : ''}" data-base="${x.id}">${esc(x.label)}</button>`).join('')}</div>
    <p class="custom-warn">${CUSTOM_WARN}</p>
    <button type="button" class="btn-fill btn-block" id="cuGo">이 설정으로 다음</button></details>`;
}
function mountCustomPurpose() {
  $('#cuLock')?.addEventListener('click', lockToast);
  const box = $('#cuBase'); if (!box) return;
  let base = box.querySelector('.is-on')?.dataset.base || draft.purposeId;
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-base]'); if (!b) return; base = b.dataset.base; box.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b)); });
  $('#cuGo').addEventListener('click', () => {
    const name = $('#cuName').value.trim();
    if (!name) { toast('발표 이름을 적어 주세요'); $('#cuName').focus(); return; }
    if (base !== draft.purposeId) { draft.purposeId = base; draft.outcomeIdxs = [0]; draft.customGoal = null; draft.targetSec = null; }
    draft.customPurpose = { name, base };
    go(1);
  });
}
function customGoalHTML() {
  if (!isPaid()) return lockHTML('cgLock', '원하는 목표를 직접 추가하기');
  const cg = draft.customGoal;
  return `<details class="custom-box" ${cg ? 'open' : ''}><summary>${cg ? `직접 추가한 목표: ${esc(cg.label)}` : '원하는 목표를 직접 추가하기'}</summary>
    <label class="field"><span>목표 <small>(고른 목표와 합쳐 최대 3개)</small></span><input id="cgText" type="text" maxlength="40" value="${esc(cg?.label || '')}" placeholder="예: 기술 질문에 막힘없이 답하기"></label>
    <p class="group-h">가장 가까운 코칭 항목 <small>이 항목을 더 무겁게 봐요</small></p>
    <div class="custom-chips" id="cgFocus">${Object.entries(CAT_LABEL).map(([id, l]) => `<button type="button" class="${id === (cg?.focus || 'content') ? 'is-on' : ''}" data-focus="${id}">${esc(l)}</button>`).join('')}</div>
    <p class="custom-warn">${CUSTOM_WARN}</p>
    <div class="custom-act"><button type="button" class="btn-fill" id="cgAdd">${cg ? '바꾸기' : '목표에 추가'}</button>${cg ? '<button type="button" class="btn-ghost" id="cgDel">빼기</button>' : ''}</div></details>`;
}
function mountCustomGoal() {
  $('#cgLock')?.addEventListener('click', lockToast);
  const box = $('#cgFocus'); if (!box) return;
  let focus = box.querySelector('.is-on')?.dataset.focus || 'content';
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-focus]'); if (!b) return; focus = b.dataset.focus; box.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b)); });
  $('#cgAdd').addEventListener('click', () => {
    const label = $('#cgText').value.trim();
    if (!label) { toast('목표를 적어 주세요'); $('#cgText').focus(); return; }
    if (!draft.customGoal && draft.outcomeIdxs.length >= 3) { toast('목표는 최대 3개예요. 위에서 하나를 빼고 추가해 주세요.'); return; }
    draft.customGoal = { label, focus, cta: false, custom: true };
    saveDraft(); renderStep(0); toast('목표에 추가했어요');
  });
  $('#cgDel')?.addEventListener('click', () => { draft.customGoal = null; saveDraft(); renderStep(0); });
}
function syncMulti() {
  const d = wiz.def, extra = draft.customGoal ? 1 : 0, full = d.value.length + extra >= d.multi;
  $('#wizBody').querySelectorAll('[data-opt]').forEach((b) => {
    const k = d.value.indexOf(Number(b.dataset.opt));
    b.classList.toggle('is-sel', k >= 0); b.setAttribute('aria-pressed', String(k >= 0));
    b.classList.toggle('is-off', full && k < 0);
    const num = b.querySelector('.opt-num'); if (num) num.textContent = k >= 0 ? k + 1 : '';
  });
  const n = d.value.length + extra;
  $('#multiCount').textContent = n ? `${n}/${d.multi} 선택` : `최대 ${d.multi}개`;
  $('#multiNext').disabled = !n;
}
function pickOption(i) {
  const d = wiz.def;
  if (d.multi) {
    const k = d.value.indexOf(i);
    if (k >= 0) d.value.splice(k, 1);
    else if (d.value.length + (draft.customGoal ? 1 : 0) < d.multi) d.value.push(i);
    else { toast(`최대 ${d.multi}개까지 고를 수 있어요`); return; }
    d.pick([...d.value]); d.value = draft.outcomeIdxs; syncMulti(); saveDraft();
    return;
  }
  if (wiz.lock === d) return;
  wiz.lock = d;
  $('#wizBody').querySelectorAll('.cell-btn').forEach((b, k) => b.classList.toggle('is-sel', k === i));
  d.pick(i);
  setTimeout(() => go(1), 220);
}
document.addEventListener('keydown', (e) => {
  if (document.body.dataset.screen !== 'wizard' || e.target.matches?.('input, textarea')) return;
  if (/^[1-9]$/.test(e.key) && wiz.def?.options) {
    const i = Number(e.key) - 1;
    if (i < wiz.def.options.length) pickOption(i);
  }
  if (e.key === 'Enter' && wiz.def?.multi && wiz.def.value.length) go(1);
  if (e.key === 'Escape') go(-1);
});

// ---------------- 녹화 준비 ----------------
function currentSetup() {
  const r = parsePrompt(draft.prompt);
  return {
    posture: draft.posture, purposeId: draft.purposeId, purposeName: draft.customPurpose?.name || '', customGoal: draft.customGoal, outcomeIdx: draft.outcomeIdxs[0] ?? 0, outcomeIdxs: [...draft.outcomeIdxs],
    outcomeText: r.outcomeText, topic: r.topic, keyMessage: r.keyMessage, script: r.script,
    targetSec: targetSec(), focus: state.focus, prompt: draft.prompt,
  };
}
function enterStudio() {
  const p = purpose();
  state.setup = currentSetup();
  const s = state.setup;
  $('#readyTitle').textContent = `${draft.customPurpose?.name || p.label} · ${draft.posture === 'standing' ? '서서' : '앉아서'}`;
  const rows = [
    ['주제', s.topic || '—'],
    ['핵심 메시지', s.keyMessage ? `“${s.keyMessage}”` : '—'],
    ['원하는 결과', s.outcomeText || outcomeLabel()],
    ['목표 시간', fmtTime(targetSec())],
  ];
  $('#readyList').innerHTML = rows.map(([k, v]) => `<li class="cell cell-kv"><span>${k}</span><b>${esc(v)}</b></li>`).join('');
  $('#readyTips').innerHTML = `<p class="group-h">준비 팁</p><ul class="tip-list"><li>${POSTURES[draft.posture].framing}</li>${p.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  $('#optStt').checked = saved.stt ?? $('#optStt').checked;
  renderFocusNote();
  if (!state.stream) startCamera();
  updateStartBtn();
}
['#optStt', '#optCues'].forEach((s) => $(s).addEventListener('change', () => { saved.stt = $('#optStt').checked; store.set(K_SETUP, { ...draft, stt: $('#optStt').checked, cues: $('#optCues').checked }); }));
$('#optCues').checked = saved.cues ?? true;
function renderFocusNote() {
  const el = $('#focusNote');
  el.hidden = !state.focus;
  if (state.focus) el.innerHTML = `집중 항목 <b>${CAT_LABEL[state.focus]}</b> · 실시간 알림은 이 항목에만 떠요. <button type="button" class="btn-link" id="clearFocus">해제</button>`;
}
document.addEventListener('click', (e) => { if (e.target.id === 'clearFocus') { state.focus = null; state.setup = currentSetup(); renderFocusNote(); } });
$('#btnEditSetup').addEventListener('click', () => startWizard(0));

const cam = $('#cam'), ov = $('#ov');
$('#btnCam').addEventListener('click', startCamera);
async function startCamera() {
  $('#camErr').textContent = '';
  if (!navigator.mediaDevices?.getUserMedia) {
    $('#camErr').textContent = '이 브라우저에서는 카메라를 쓸 수 없어요. Chrome에서 http://localhost 주소로 열어 주세요.';
    $('#btnCam').hidden = false;
    return;
  }
  const slow = setTimeout(() => {
    if (!state.stream) { $('#camErr').textContent = '권한 요청 창이 보이지 않으면 아래 버튼을 눌러 주세요.'; $('#btnCam').hidden = false; }
  }, 4000);
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    });
  } catch (e) {
    clearTimeout(slow);
    $('#camErr').textContent = e.name === 'NotAllowedError'
      ? '카메라·마이크 권한이 거부됐어요. 주소창 왼쪽 아이콘에서 권한을 허용한 뒤 다시 눌러 주세요.'
      : `카메라를 켜지 못했어요 (${e.name}). 다른 앱이 카메라를 쓰고 있는지 확인하세요.`;
    $('#btnCam').hidden = false;
    return;
  }
  clearTimeout(slow);
  $('#camErr').textContent = '';
  cam.srcObject = state.stream;
  await cam.play().catch(() => {});
  state.audio = new AudioMeter(state.stream);
  await state.audio.resume();
  $('#camEmpty').hidden = true;
  $('#framing').hidden = false;
  setStatus('#sbCam', 'ok', '카메라 켜짐');
  updateStartBtn();
}
function setStatus(sel, kind, text) {
  const el = $(sel);
  el.querySelector('.dot').className = `dot dot-${kind}`;
  el.lastChild.textContent = text;
}
function updateStartBtn() {
  const ready = !!state.stream && (state.models || state.modelFailed);
  $('#btnStart').disabled = !ready;
  $('#recLabel').textContent = !state.stream ? '카메라를 켜는 중' : !(state.models || state.modelFailed) ? '분석 모델 불러오는 중' : '준비됐어요. 시작하면 3초 동안 기준 자세를 재요.';
}
loadVision().then((m) => {
  state.models = m;
  setStatus('#sbModel', 'ok', '분석 준비됨');
  updateStartBtn();
}).catch((e) => {
  console.error(e);
  state.modelFailed = true;
  setStatus('#sbModel', 'bad', '음성만 분석');
  updateStartBtn();
});

// ---------------- 실시간 루프 ----------------
const css = getComputedStyle(document.documentElement);
const overlayColors = () => ({ line: css.getPropertyValue('--ov-line').trim(), joint: css.getPropertyValue('--ov-joint').trim(), face: css.getPropertyValue('--ov-face').trim() });
function loop() {
  requestAnimationFrame(loop);
  if (state.audio) {
    const pct = Math.max(0, Math.min(100, ((state.audio.level + 70) / 55) * 100));
    $('#micMeter').style.width = `${pct}%`;
    $('#hudVol').style.width = `${pct}%`;
  }
  if (!state.models || !cam.videoWidth || state.phase === 'analyzing' || document.body.dataset.screen !== 'studio') return;
  const now = performance.now();
  if (now - state.lastDet < 95) return;
  state.lastDet = now;
  let res;
  try { res = detect(state.models, cam); } catch { return; }
  if (ov.width !== cam.videoWidth) { ov.width = cam.videoWidth; ov.height = cam.videoHeight; }
  drawOverlay(ov.getContext('2d'), res, ov.width, ov.height, overlayColors());
  const t = state.phase === 'rec' ? (now - state.recStart) / 1000 : 0;
  const f = extractFeatures(t, res.pose, res.face, cam.videoWidth / cam.videoHeight);
  if (state.phase === 'calib') state.calibFrames.push(f);
  else if (state.phase === 'rec') state.frames.push(f);
  else updateFraming(f);
}
requestAnimationFrame(loop);

function updateFraming(f) {
  const el = $('#framing');
  let msg = '좋아요. 이 위치에서 시작하세요.', ok = true;
  if (draft.posture === 'seated') {
    if (!f.pose) { msg = '어깨가 보이도록 조금 뒤로 앉아 주세요.'; ok = false; }
    else if (!f.face) { msg = '얼굴이 잘 보이도록 조명을 얼굴 앞쪽에 두세요.'; ok = false; }
    else if (f.swFrame < 0.2) { msg = '카메라에 조금 더 가까이 앉아 주세요.'; ok = false; }
    else if (f.swFrame > 0.68) { msg = '조금 뒤로 앉아 어깨가 다 보이게 해 주세요.'; ok = false; }
    else if (f.noseY > 0.55) { msg = '카메라를 눈높이까지 올려 주세요.'; ok = false; }
    else if (f.noseX < 0.3 || f.noseX > 0.7) { msg = '화면 가운데로 이동해 주세요.'; ok = false; }
  } else {
    if (!f.pose) { msg = '상체가 보이도록 카메라 앞에 서 주세요.'; ok = false; }
    else if (!f.fullBody) { msg = '머리부터 발끝까지 보이도록 뒤로 물러나 주세요.'; ok = false; }
    else if (!f.face) { msg = '얼굴이 잘 보이도록 조명을 앞쪽에 두세요.'; ok = false; }
  }
  el.textContent = msg;
  el.className = `framing ${ok ? 'is-ok' : 'is-warn'}`;
}

// ---------------- 녹화 ----------------
const pickMime = () => ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
$('#btnStart').addEventListener('click', beginCountdown);
async function beginCountdown() {
  if (!state.stream) return;
  state.setup = currentSetup();
  await state.audio.resume();
  document.body.dataset.phase = 'rec';
  state.phase = 'calib';
  state.calibFrames = [];
  state.audio.begin(performance.now());
  $('#framing').hidden = true;
  $('#countdown').hidden = false;
  $('#recActions').hidden = false;
  $('#btnStop').hidden = true;
  for (let n = 3; n >= 1; n--) {
    $('#cdNum').textContent = n;
    await new Promise((r) => setTimeout(r, 1000));
    if (state.phase !== 'calib') return;
  }
  $('#countdown').hidden = true;
  state.calib = buildCalibration(state.audio.end(), state.calibFrames);
  state.audio.pitchGate = state.calib.noiseDb + 8;
  startRecording();
}
function startRecording() {
  state.phase = 'rec';
  state.frames = [];
  state.chunks = [];
  state.recStart = performance.now();
  state.audio.begin(state.recStart);
  state.live = { cooldown: {}, lastQuiet: 0 };
  state.transcriber = null;
  if ($('#optStt').checked) {
    const tr = new Transcriber('ko-KR');
    if (tr.supported && tr.start(state.recStart)) state.transcriber = tr;
  }
  state.mime = pickMime();
  state.recorder = new MediaRecorder(state.stream, state.mime ? { mimeType: state.mime, videoBitsPerSecond: 2_500_000 } : undefined);
  state.recorder.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
  state.recorder.start(1000);
  $('#hud').hidden = false;
  $('#btnStop').hidden = false;
  $('#hudTarget').textContent = fmtTime(state.setup.targetSec);
  document.querySelectorAll('.hc').forEach((el) => el.classList.toggle('is-focus', !!state.focus && el.dataset.cat === state.focus));
  state.hudTimer = setInterval(updateHud, 250);
}
function showCue(cat, text) {
  if (!$('#optCues').checked) return;
  if (state.focus && cat !== state.focus) return;
  const now = performance.now();
  if (now - (state.live.cooldown[cat] || 0) < 8000) return;
  state.live.cooldown[cat] = now;
  const el = $('#cue');
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  clearTimeout(state.cueTimer);
  state.cueTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
function updateHud() {
  const t = (performance.now() - state.recStart) / 1000;
  const tgt = state.setup.targetSec;
  $('#hudTime').textContent = fmtTime(t);
  $('#hudProg').style.width = `${Math.min(100, (t / tgt) * 100)}%`;
  $('#hudProg').classList.toggle('over', t > tgt * 1.1);
  if (t > tgt * 1.1 && t < tgt * 1.1 + 0.3) showCue('time', '목표 시간을 넘겼어요. 마무리해 주세요.');
  const p = purpose();
  const recent = state.frames.filter((f) => f.t > t - 3);
  if (recent.length >= 10) {
    const cls = recent.map((f) => classifyFrame(f, state.calib, draft.posture));
    const gz = cls.filter((c) => c.gaze != null);
    const gOn = gz.length ? gz.filter((c) => c.gaze).length / gz.length : null;
    setChip('#hcGaze', gOn == null ? null : gOn >= 0.5);
    if (gOn != null && gOn < 0.2 && t > 4) showCue('gaze', cls.filter((c) => c.lookDown).length > gz.length / 2 ? '원고에서 눈을 들어 카메라를 봐 주세요' : '카메라 렌즈를 봐 주세요');
    const ps = cls.filter((c) => c.bad != null);
    const bad = ps.length ? ps.filter((c) => c.bad).length / ps.length : null;
    setChip('#hcPosture', bad == null ? null : bad < 0.5);
    if (bad != null && bad > 0.7 && t > 4) {
      const reasons = {};
      ps.forEach((c) => c.reasons.forEach((r) => { reasons[r] = (reasons[r] || 0) + 1; }));
      const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0]?.[0];
      const fix = { slouch: '허리를 펴고 턱을 살짝 당겨 주세요', shoulderTilt: '어깨 높이를 맞춰 주세요', headTilt: '고개를 바로 세워 주세요', crossed: '팔짱을 풀고 손을 펴 주세요', offCenter: '화면 가운데로 돌아와 주세요' }[top];
      if (fix) showCue('posture', fix);
    }
  }
  if (state.transcriber) {
    const n = state.transcriber.liveSyllables(10);
    const rate = t > 8 ? Math.round(n * 6) : null;
    $('#hudRate').textContent = rate ? `${rate}` : '–';
    const [lo, hi] = p.targets.spm;
    setChip('#hcPace', rate == null || n < 10 ? null : rate >= lo - 30 && rate <= hi + 30);
    if (rate && rate > hi + 45 && n > 20) showCue('pace', '조금만 천천히 말해 보세요');
    const tx = (state.transcriber.finals.slice(-1)[0]?.text || '') + ' ' + state.transcriber.interim;
    $('#hudTx').textContent = tx.trim().slice(-60);
  }
  const thr = state.calib.noiseDb + 10;
  if (state.audio.level < thr) state.live.quietSince ??= t; else state.live.quietSince = null;
  if (state.live.quietSince != null && t - state.live.quietSince > 0.4) state.live.lastQuiet = t;
  if (t - state.live.lastQuiet > 18) showCue('pause', '숨 한 번 쉬고 이어가세요');
}
function setChip(sel, good) {
  const el = $(sel);
  el.classList.toggle('is-good', good === true);
  el.classList.toggle('is-bad', good === false);
}
function resetStudio() {
  state.phase = 'idle';
  delete document.body.dataset.phase;
  $('#hud').hidden = true; $('#recActions').hidden = true; $('#countdown').hidden = true; $('#analyzing').hidden = true;
  $('#framing').hidden = !state.stream;
}
$('#btnCancel').addEventListener('click', async () => {
  if (state.phase === 'calib') state.audio.end();
  if (state.phase === 'rec') {
    clearInterval(state.hudTimer);
    state.recorder?.stop();
    state.audio.end();
    await state.transcriber?.stop();
  }
  resetStudio();
});
$('#btnStop').addEventListener('click', stopAndAnalyze);
async function stopAndAnalyze() {
  if (state.phase !== 'rec') return;
  clearInterval(state.hudTimer);
  const durationSec = (performance.now() - state.recStart) / 1000;
  state.phase = 'analyzing';
  $('#hud').hidden = true;
  $('#recActions').hidden = true;
  $('#analyzing').hidden = false;
  const stopped = new Promise((r) => { state.recorder.onstop = r; });
  state.recorder.stop();
  const audioFrames = state.audio.end();
  const transcript = state.transcriber ? await state.transcriber.stop() : null;
  await stopped;
  const blob = new Blob(state.chunks, { type: state.mime || 'video/webm' });
  if (state.videoURL) URL.revokeObjectURL(state.videoURL);
  state.videoURL = URL.createObjectURL(blob);
  const p = purpose();
  let result;
  try {
    result = analyze({ audio: audioFrames, vision: state.frames, transcript, calib: state.calib, purpose: p, setup: state.setup, durationSec });
  } catch (e) {
    console.error(e);
    resetStudio();
    $('#focusNote').hidden = false;
    $('#focusNote').textContent = '분석 중 오류가 났어요. 다시 녹화해 주세요.';
    return;
  }
  const history = store.get(historyKey(), []);
  const same = history.filter((h) => h.purposeId === p.id && h.posture === state.setup.posture);
  const prev = same[same.length - 1] || null;
  const entry = { at: Date.now(), purposeId: p.id, posture: state.setup.posture, topic: state.setup.topic, overall: result.overall, scores: Object.fromEntries(Object.values(result.cats).map((c) => [c.id, c.score])), focus: state.setup.focus, dur: Math.round(durationSec) };
  history.push(entry);
  store.set(historyKey(), history.slice(-40));
  resetStudio();
  state.cleanupReport?.();
  state.cleanupReport = renderReport($('#report'), {
    result, videoURL: state.videoURL, setup: state.setup, purpose: p, profile: profileFrom(draft.worry), prev,
    history: [...same, entry],
    onRetry: (focus) => { state.focus = focus; show('studio'); beginCountdown(); },
    onEdit: (focus) => { state.focus = focus; startWizard(0); },
    onHome: () => show('home'),
  });
  show('report');
}

show('home');

// 대본 점검 화면은 마지막에 붙입니다 (TIME_OPTIONS, toast를 씁니다).
scriptView = mountScript({
  timeOptions: (id) => TIME_OPTIONS[id] || TIME_OPTIONS.report,
  toast,
  onRecord({ purposeId, targetSec: t, keyMessage, text }) {
    state.focus = null;
    if (purposeId !== draft.purposeId) draft.outcomeIdxs = [0]; draft.customGoal = null;
    draft.purposeId = purposeId;
    draft.targetSec = t;
    draft.prompt = `${keyMessage ? `핵심 메시지는 “${keyMessage}”입니다.\n\n` : ''}${text}`;
    draft.hasScript = 'yes'; draft.script = text; draft.key = keyMessage || '';
    saveDraft();
    if (fromWizard) { fromWizard = false; show('studio'); } else startWizard(1);
  },
});

// 히어로 다이얼: 크로노그래프 베젤이 초마다 째깍이고, 큐카드 링은 잡아서 돌릴 수 있어요.
{
  const wheel = $('#wheel');
  const arc = $('#heroArt');
  if (wheel && arc) {
    const items = [
      ['interview', '면접', '1분 · 첫인상'], ['capstone', '졸업 발표', '10분 · 문제에서 결과까지'], ['ir', 'IR 피칭', '10분 · 확신'], ['report', '업무 보고', '5분 · 결론 먼저'],
      ['voice', '억양', '단조로움 찾기'], ['eyes', '시선', '렌즈 응시'], ['body', '자세', '기울기 · 흔들림'], ['words', '군더더기 말 없애기', '어, 음, 이제'],
      ['conference', '학회 발표', '논리의 흐름'], ['speech', '축사', '3분 · 한 문장'], ['story', '흐름', '목적별 순서'], ['lecture', '강의', '예시와 요약'],
      ['highlights', '하이라이트', '잘한 장면'], ['record', '녹화', '3초 기준 측정'], ['standing', '무대', '전신 분석'], ['seated', '화상 면접', '상반신 분석'],
    ];
    const runs = [7, 2, 4, 3, 6, 1, 5, 8];
    const N = 32, STEP = 360 / N;
    let cardsHtml = '';
    for (let k = 0; k < N; k++) {
      const [ico, t, sub] = items[k % items.length];
      cardsHtml += `<div class="wc art-${runs[Math.floor(k / 4) % runs.length]}" style="--a:${k * STEP}deg" data-picto="${ico}"><b>${t}</b><span>${sub}</span></div>`;
    }
    let bezel = '';
    for (let k = 0; k < 240; k++) {
      const cls = k % 20 === 0 ? 'major' : k % 4 === 0 ? 'mid' : '';
      bezel += `<i class="bt ${cls}" style="--a:${k * 1.5}deg">${k % 20 === 0 ? `<em>${String((k / 4) % 60).padStart(2, '0')}</em>` : ''}</i>`;
    }
    wheel.innerHTML = `<div class="bezel">${bezel}</div><div class="bezel-ring"></div><div class="wring">${cardsHtml}</div>`;
    arc.insertAdjacentHTML('beforeend', '<span class="index" aria-hidden="true"></span>');
    const ring = wheel.querySelector('.wring');
    const bezelEl = wheel.querySelector('.bezel');
    const cards = [...ring.children];
    // 카드 링과 베젤은 같은 속도(90초에 한 바퀴)로 함께 흘러가요. 잡으면 둘 다 멈춰요.
    const FLOW = 360 / 90; // 초당 각도
    let bez = 0, lastFrame = performance.now(), holdUntil = 0;

    let ang = 0, vel = 0, dragging = false, lastX = 0, lastT = 0, snapTo = null, idle = 0;
    const R = () => parseFloat(getComputedStyle(arc).getPropertyValue('--R')) || 1000;
    // 넓은 화면에서는 다이얼이 오른쪽에 세로로 서요. 그때는 위아래로 끌어서 돌려요.
    const side = matchMedia('(min-width: 1200px)');
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
    arc.addEventListener('pointerdown', (e) => {
      dragging = true; snapTo = null; vel = 0; lastX = side.matches ? -e.clientY : e.clientX; lastT = performance.now();
      arc.setPointerCapture(e.pointerId); arc.classList.add('grab');
    });
    arc.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const now = performance.now();
      const x = side.matches ? -e.clientY : e.clientX;
      const d = ((x - lastX) / R()) * (180 / Math.PI);
      ang += d;
      vel = d / Math.max(1, now - lastT) * 16;
      lastX = x; lastT = now;
      render();
    });
    const release = () => {
      if (!dragging) return;
      dragging = false; arc.classList.remove('grab'); idle = 0; holdUntil = performance.now() + 1200;
      // 관성으로 멈출 지점을 미리 계산하고, 가장 가까운 카드가 인덱스에 오도록 맞춥니다.
      const coast = vel / (1 - 0.94);
      snapTo = Math.round((ang + coast) / STEP) * STEP;
    };
    arc.addEventListener('pointerup', release);
    arc.addEventListener('pointercancel', release);
    const tick = (now) => {
      const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
      if (!dragging) {
        if (snapTo !== null) {
          ang += (snapTo - ang) * 0.09;
          if (Math.abs(snapTo - ang) < 0.01) { ang = snapTo; snapTo = null; }
        } else if (!reduceMotion && now > holdUntil) {
          ang -= FLOW * dt; bez -= FLOW * dt; // 시계 베젤과 같은 속도로 흘러가요
        }
        render();
      }
      requestAnimationFrame(tick);
    };
    render();
    requestAnimationFrame((t) => { lastFrame = t; tick(t); });
  }
}

// why 타임라인: 빨간 재생 헤드가 왼쪽에서 오른쪽으로 지나가며 지금 말하는 칸을 띄웁니다.
{
  const tl = document.getElementById('tline');
  const head = tl?.querySelector('.tl-head');
  if (tl && head && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // 칸 사이 간격까지 반영하려고 실제 위치(px)로 계산합니다.
    const rows = [...tl.querySelectorAll('.tl-track')].map((tr) => ({ tr, clips: [...tr.children].map((c) => ({ c, x: 0, w: 1 })) }));
    let trackW = 1;
    const measure = () => {
      trackW = rows[0].tr.clientWidth || 1;
      for (const r of rows) for (const k of r.clips) { k.x = k.c.offsetLeft; k.w = k.c.offsetWidth || 1; }
    };
    measure();
    new ResizeObserver(measure).observe(tl);
    let t0 = 0, vis = false;
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(tl);
    const DUR = 9000, HOLD = 1400, FADE = 700;
    const loop = (now) => {
      if (vis && tl.classList.contains('in')) {
        if (!t0) t0 = now + 900;
        const el = Math.max(0, now - t0) % (DUR + HOLD + FADE);
        const p = Math.min(1, el / DUR);
        tl.classList.toggle('fading', el > DUR + HOLD);
        head.style.setProperty('--p', p.toFixed(4));
        head.style.opacity = el > DUR ? '0' : '1';
        const x = p * trackW;
        for (const r of rows) for (const k of r.clips) {
          const f = Math.max(0, Math.min(1, (x - k.x) / k.w));
          k.c.style.setProperty('--f', f.toFixed(3));
          k.c.classList.toggle('lit', f > 0.45);
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// 로그인 창 머리 그림: 로고 조각(사분원·반원·원·각진 칸)을 팔레트 색으로 엮은 기하 패턴.
{
  const host = document.querySelector('.auth-art');
  if (host) {
    const C = ['--blue', '--yellow', '--pink', '--red', '--green', '--orange', '--purple', '--ink'];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const S = 48, cols = 10, rows = 2;
    let out = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * S, y = r * S;
      const bg = C[Math.floor(rnd() * C.length)];
      let fg = C[Math.floor(rnd() * C.length)];
      if (fg === bg) fg = '--surface';
      const f = (v) => `style="fill:var(${v})"`;
      out += `<rect x="${x}" y="${y}" width="${S}" height="${S}" ${f(bg)}/>`;
      const k = Math.floor(rnd() * 5), rot = Math.floor(rnd() * 4) * 90;
      const g = (inner) => `<g transform="rotate(${rot} ${x + S / 2} ${y + S / 2})">${inner}</g>`;
      if (k === 0) out += g(`<path d="M${x} ${y + S}A${S} ${S} 0 0 1 ${x + S} ${y}V${y + S}Z" ${f(fg)}/>`);
      else if (k === 1) out += g(`<path d="M${x} ${y + S}A${S / 2} ${S / 2} 0 0 1 ${x + S} ${y + S}Z" ${f(fg)}/>`);
      else if (k === 2) out += `<circle cx="${x + S / 2}" cy="${y + S / 2}" r="${S / 2 - 6}" ${f(fg)}/>`;
      else if (k === 3) out += g(`<path d="M${x} ${y}H${x + S / 2}V${y + S / 2}H${x}Z" ${f(fg)}/><path d="M${x + S / 2} ${y + S / 2}A${S / 2} ${S / 2} 0 0 1 ${x + S} ${y + S}H${x + S / 2}Z" ${f(fg)}/>`);
      else out += g(`<path d="M${x} ${y}H${x + S}L${x} ${y + S}Z" ${f(fg)}/>`);
    }
    host.innerHTML = `<svg viewBox="0 0 ${cols * S} ${rows * S}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${out}</svg>`;
  }
}

// 비언어 섹션: 두 영상을 소리 없이 나란히 재생합니다. 파일이 없으면 '예시 영상 자리'를 보여 줍니다.
{
  const vids = [...document.querySelectorAll('.nv-vid video')];
  if (vids.length) {
    vids.forEach((v) => {
      v.addEventListener('loadeddata', () => v.closest('.nv-frame').classList.add('has-video'));
      v.addEventListener('error', () => v.closest('.nv-frame').classList.remove('has-video'));
      v.src = v.dataset.src;
    });
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) e.target.play().catch(() => {}); else e.target.pause();
    }), { threshold: .35 });
    vids.forEach((v) => io.observe(v));
  }
}
