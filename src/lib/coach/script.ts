// 대본 점검: 녹화 전에 텍스트만으로 시간, 흐름, 문장, 읽기 가이드(쉼·강조·억양)를 만듭니다.
import { syllables } from './audio';
import type { Purpose } from '@/lib/scenarios';

export type Token = { w: string; em: boolean };
export type SentType = 'q' | 'ex' | 'st';
export type RawSent = { i: number; para: number; text: string };
export type Sent = RawSent & { syl: number; type: SentType; chunks: Token[][]; role: string | null; flow: string | null };
export type Sev = 'high' | 'mid' | 'low';
/** basis = 이 판단의 근거(대본에서 센 숫자·찾은 말). 화면에 항상 같이 보여 줘요. */
export type ScriptIssue = { sev: Sev; title: string; detail: string; refs: number[]; basis: string };
export type FlowElement = { id: string; label: string; order: number; at: number };
export type ScriptStats = { totalSyl: number; estSec: number; targetSec: number; n: number; avg?: number; long?: number; paras?: number; spm?: number };
export type ScriptAnalysis = { sents: Sent[]; issues: ScriptIssue[]; good: string[]; elements: FlowElement[]; stats: ScriptStats };
type ElementDef = [id: string, label: string, re: RegExp];

// 목적별로 들어가야 할 흐름 요소 (순서 = 권장 순서)
const ELEMENTS: Record<string, ElementDef[]> = {
  interview: [
    ['claim', '한 줄 소개·결론', /저는|제가|지원|한마디로|결론/],
    ['exp', '경험', /경험|프로젝트|당시|맡아|맡았|진행했|인턴|활동/],
    ['proof', '숫자로 된 성과', /\d+\s*(%|퍼센트|배|명|건|억|만|원|위)|두 배|세 배/],
    ['fit', '직무·회사와의 연결', /직무|회사|입사|기여|팀에|함께|귀사/],
  ],
  ir: [
    ['problem', '문제', /문제|불편|어려움|고통|비효율|비싸|못합니다|없습니다/],
    ['solution', '해결책', /해결|솔루션|저희 서비스|저희 제품|저희는|만들었/],
    ['market', '시장', /시장|규모|TAM|SAM|조 원|억 원 규모/],
    ['traction', '성과·지표', /매출|사용자|고객 수|MAU|DAU|성장률|계약|리텐션|재방문|만에/],
    ['team', '팀', /팀|창업|공동|경력|출신|멤버/],
    ['ask', '요청', /투자|라운드|유치|요청|부탁|함께해|검토/],
  ],
  report: [
    ['conclusion', '결론', /결론|요약하면|핵심은|말씀드리면|한마디로/],
    ['status', '현황·수치', /\d|현황|진행|달성|대비/],
    ['issue', '원인·이슈', /원인|이슈|문제|리스크|지연|때문/],
    ['next', '다음 단계·요청', /계획|다음|요청|승인|결정|부탁|제안/],
  ],
  lecture: [
    ['goal', '오늘의 목표', /오늘|배울|목표|알아보|살펴보/],
    ['concept', '개념 설명', /이란|라는 것은|정의|개념|원리|뜻/],
    ['example', '예시', /예를 들어|예시|사례|가령|실제로/],
    ['summary', '요약', /정리하면|요약|기억|핵심|다시 말해/],
  ],
  conference: [
    ['background', '배경', /배경|기존|선행|연구에서는|문제|알려져/],
    ['method', '방법', /방법|실험|데이터|분석|참가자|수집|측정/],
    ['result', '결과', /결과|나타났|확인|유의|증가|감소|\d+\s*%/],
    ['implication', '시사점', /시사|의미|한계|향후|후속|기여/],
  ],
  capstone: [
    ['problem', '문제·동기', /문제|불편|동기|필요|어려움|왜/],
    ['approach', '방법·구현', /방법|구현|설계|개발|만들었|사용했|적용|실험/],
    ['result', '결과·데모', /결과|성능|정확도|개선|데모|시연|\d+\s*%/],
    ['lesson', '배운 점·향후', /배운|한계|향후|앞으로|개선할|느낀/],
  ],
  speech: [
    ['greet', '인사·감사', /안녕|감사|축하|반갑/],
    ['story', '일화', /처음|그때|기억|년 전|시절|날|함께했/],
    ['wish', '덕담', /바랍니다|되길|되기를|행복|응원|기원/],
    ['toast', '건배·마무리', /건배|잔을|위하여|박수/],
  ],
};
const CONCLUSION_FIRST = new Set(['interview', 'report', 'ir']);
const NEEDS_NUMBERS = new Set(['ir', 'report', 'conference', 'capstone']);
const HEDGES = /것 같(습니다|아요|다)|아마도?|좀|약간|어느 정도|인 듯|일지도|나름/g;
const FILLERS = /(^|\s)(음|어|그|뭐|이제|막|약간)(?=\s)/g;
const CONNECTIVE = /(고|며|면서|는데|은데|지만|니다만|어서|아서|해서|라서|으며|으면|면|니까|므로|때문에|위해|통해|에서|으로|에게|하고|보다|처럼),?$/;
const CONJ = /^(그리고|그래서|하지만|그런데|또한|따라서|즉|그러나|게다가|반면)/;
const INTENSE = /가장|반드시|꼭|처음|유일|핵심|절대|모든|직접|최초|두 배|세 배|단 하나/;
const STOP = new Set(['저는', '제가', '저희', '저희는', '그리고', '그래서', '하지만', '이', '그', '저', '것', '수', '있습니다', '합니다', '했습니다', '입니다', '있는', '하는', '위해', '통해', '대한', '여러분', '오늘']);

const stem = (w: string) => w.replace(/[.,!?“”"'‘’()]/g, '').replace(/(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만|까지|부터|에게|입니다|이다)$/, '');

export function splitScript(text: string): RawSent[] {
  const clean = String(text || '').replace(/\r/g, '').trim();
  if (!clean) return [];
  let paras = clean.split(/\n\s*\n/);
  if (paras.length === 1 && clean.split('\n').length > 2) paras = clean.split('\n');
  const out: RawSent[] = [];
  paras.forEach((p, pi) => {
    p.replace(/\s*\n\s*/g, ' ')
      .split(/(?<=[.!?。…])\s+|(?<=(?:니다|어요|아요|에요|예요|죠|까요|세요))\s+(?=[가-힣A-Z0-9“"])/)
      .map((s) => s.trim()).filter(Boolean)
      .forEach((s) => out.push({ i: out.length, para: pi, text: s }));
  });
  return out;
}

// 한 문장을 숨 쉴 자리로 나누고, 강조할 어절을 고릅니다.
function guide(sent: RawSent, keyWords: Set<string>): { type: SentType; chunks: Token[][] } {
  const words = sent.text.split(/\s+/);
  const chunks: string[][] = [];
  let cur: string[] = [], acc = 0;
  words.forEach((w, k) => {
    const nextConj = CONJ.test(words[k + 1] || '');
    cur.push(w);
    acc += syllables(w);
    const last = k === words.length - 1;
    const soft = /,$/.test(w) || ((CONNECTIVE.test(w) || nextConj) && acc >= 9);
    const rest = syllables(words.slice(k + 1).join(''));
    if (!last && rest >= 6 && ((soft && acc >= 4) || acc >= 22)) { chunks.push(cur); cur = []; acc = 0; }
  });
  if (cur.length) chunks.push(cur);
  // 강조: 숫자 > 핵심 메시지 단어 > 강조어 > 대조 뒤 첫 어절, 문장당 최대 2개
  const cands: [number, number][] = [];
  words.forEach((w, k) => {
    const s = stem(w);
    let score = 0;
    if (/\d/.test(w) || /두 배|세 배/.test(w)) score = 4;
    else if (s.length >= 2 && keyWords.has(s)) score = 3;
    else if (INTENSE.test(w)) score = 2;
    else if (k > 0 && /^(하지만|그러나|반면)/.test(words[k - 1])) score = 1;
    if (score) cands.push([k, score]);
  });
  const emph = new Set(cands.sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k));
  const t = sent.text.trim();
  const type: SentType = /\?$|까요[.?]?$|나요[.?]?$|습니까[.?]?$|을까[.?]?$/.test(t) ? 'q' : /!$/.test(t) ? 'ex' : 'st';
  let idx = 0;
  return {
    type,
    chunks: chunks.map((c) => c.map((w) => ({ w, em: emph.has(idx++) }))),
  };
}

const overlap = (a: string, keyWords: Set<string>) => {
  if (!keyWords.size) return 0;
  const ws = new Set(a.split(/\s+/).map(stem).filter((w) => w.length >= 2));
  let n = 0;
  keyWords.forEach((k) => { if (ws.has(k)) n++; });
  return n / keyWords.size;
};

/** 흐름 요소 정규식에서 사람이 읽을 예시 말 몇 개 */
const hint = (re: RegExp) => re.source.split('|').filter((w) => /^[가-힣 ]+$/.test(w)).slice(0, 3).join('·') || '관련 표현';

export function analyzeScript(text: string, { purpose, targetSec, keyMessage = '' }: { purpose: Purpose; targetSec: number; keyMessage?: string }): ScriptAnalysis {
  const keyWords = new Set(String(keyMessage).split(/\s+/).map(stem).filter((w) => w.length >= 2 && !STOP.has(w)));
  const sents: Sent[] = splitScript(text).map((r) => ({ ...r, syl: syllables(r.text), ...guide(r, keyWords), role: null, flow: null }));
  const spm = (purpose.targets.spm[0] + purpose.targets.spm[1]) / 2;
  const totalSyl = sents.reduce((s, x) => s + x.syl, 0);
  const paras = sents.length ? sents[sents.length - 1].para + 1 : 0;
  const estSec = (totalSyl / spm) * 60 + sents.length * 0.45 + paras * 0.8;

  // 흐름 요소 찾기
  const defs = ELEMENTS[purpose.id] || ELEMENTS.report;
  const elements: FlowElement[] = defs.map(([id, label, re], order) => {
    const hit = sents.find((s) => re.test(s.text));
    return { id, label, order, at: hit ? hit.i : -1 };
  });
  sents.forEach((s) => { s.role = null; });
  elements.forEach((e) => { if (e.at >= 0 && !sents[e.at].role) sents[e.at].role = e.id; });
  // 역할이 없는 문장은 앞 문장의 역할을 이어받아 흐름 막대를 만듭니다.
  let lastRole: string | null = null;
  sents.forEach((s) => { if (s.role) lastRole = s.role; else s.flow = lastRole; s.flow = s.role || lastRole; });

  const issues: ScriptIssue[] = [];
  const good: string[] = [];
  const add = (sev: Sev, title: string, detail: string, refs: number[] = [], basis = '') => issues.push({ sev, title, detail, refs, basis });
  const n = sents.length;
  if (!n) return { sents, issues, good, elements, stats: { totalSyl: 0, estSec: 0, targetSec, n: 0 } };

  // 1. 시간
  const ratio = estSec / targetSec;
  if (ratio > 1.1) {
    const cut = Math.round(totalSyl - ((targetSec - n * 0.45 - paras * 0.8) * spm) / 60);
    add(ratio > 1.25 ? 'high' : 'mid', `목표보다 약 ${Math.round(estSec - targetSec)}초 길어요`,
      `${purpose.label}에 맞는 속도(분당 ${Math.round(spm)}음절)로 읽으면 그래요. 약 ${cut}음절, 문장으로는 ${Math.max(1, Math.round(cut / (totalSyl / n)))}개 정도 덜어내세요. 빨리 읽어서 맞추면 리허설에서 속도 경고가 떠요.`, [],
      `대본 ${totalSyl}음절 ÷ ${purpose.label} 적정 속도 분당 ${Math.round(spm)}음절 + 문장·문단 사이 쉼 = 약 ${Math.round(estSec)}초, 목표 ${targetSec}초`);
  } else if (ratio < 0.75) {
    add('mid', `목표보다 약 ${Math.round(targetSec - estSec)}초 짧아요`, '근거나 예시를 한두 개 더하거나, 핵심 문장 뒤에 쉬는 시간을 넉넉히 두세요.', [],
    `대본 ${totalSyl}음절 ÷ ${purpose.label} 적정 속도 분당 ${Math.round(spm)}음절 + 쉼 = 약 ${Math.round(estSec)}초, 목표 ${targetSec}초`);
  } else good.push('목표 시간 안에 들어와요.');

  // 2. 흐름 요소 · 순서
  const missing = elements.filter((e) => e.at < 0);
  if (missing.length) add(missing.length >= 2 ? 'high' : 'mid', `${missing.map((e) => e.label).join(', ')}이(가) 안 보여요`,
    `${purpose.label}에서는 보통 ${defs.map((d) => d[1]).join(' → ')} 순서로 흘러가요. 빠진 부분을 한 문장씩이라도 넣어 보세요.`, [],
    `대본 ${n}문장에서 ${missing.map((e) => `‘${e.label}’에 쓰이는 말(${hint(defs.find((d) => d[0] === e.id)![2])})`).join(', ')}을 찾지 못했어요`);
  const found = elements.filter((e) => e.at >= 0);
  for (let k = 1; k < found.length; k++) {
    const a = found[k - 1], b = found[k];
    if (b.at < a.at && a.at - b.at > 1) {
      add('low', `‘${b.label}’이(가) ‘${a.label}’보다 먼저 나와요`, '듣는 사람은 순서대로 따라와요. 의도한 게 아니라면 순서를 바꿔 보세요.', [b.at, a.at], `‘${b.label}’은 ${b.at + 1}번 문장, ‘${a.label}’은 ${a.at + 1}번 문장에서 처음 나와요`);
      break;
    }
  }
  if (!missing.length) good.push(`${purpose.label}에 필요한 흐름이 다 들어 있어요.`);

  // 3. 결론 먼저
  if (CONCLUSION_FIRST.has(purpose.id)) {
    const head = sents.slice(0, 2).map((s) => s.text).join(' ');
    const first = elements[0];
    const ok = (keyWords.size && overlap(head, keyWords) >= 0.5) || (first.at >= 0 && first.at <= 1) || /결론|핵심은|한마디로/.test(head);
    if (!ok) add('high', '결론이 늦게 나와요', `첫 두 문장 안에 하고 싶은 말을 먼저 하세요. 예: “${keyMessage || '결론부터 말씀드리면 ~입니다'}.” 그다음에 이유와 근거를 붙이면 돼요.`, [0],
      `첫 두 문장에 ‘결론·핵심은·한마디로’ 같은 말${keyWords.size ? '이나 핵심 메시지 단어' : ''}이 없고, ‘${first.label}’도 ${first.at >= 0 ? `${first.at + 1}번 문장에서야` : '보이지 않아요'} 나와요`);
    else good.push('결론을 앞에 두었어요.');
  }

  // 4. 핵심 메시지 반복
  if (keyWords.size) {
    const hits = sents.filter((s) => overlap(s.text, keyWords) >= 0.5).map((s) => s.i);
    const inHead = hits.some((i) => i < Math.max(2, n * 0.2));
    const inTail = hits.some((i) => i >= n - Math.max(2, Math.ceil(n * 0.2)));
    if (!hits.length) add('high', '핵심 메시지가 대본에 없어요', `“${keyMessage}”를 처음과 끝에 그대로 말하세요. 청중은 반복된 문장을 기억해요.`, [], `핵심 메시지 단어(${[...keyWords].slice(0, 4).join(', ')}) 절반 이상이 들어간 문장이 0개예요`);
    else if (!inTail) add('mid', '마지막에 핵심 메시지를 한 번 더', '끝인사 직전에 핵심 문장을 다시 말하면 기억에 남아요.', [n - 1], `핵심 메시지가 ${hits.map((i) => `${i + 1}번`).join(', ')} 문장에만 있고 마지막 ${Math.max(2, Math.ceil(n * 0.2))}문장에는 없어요`);
    else if (inHead && inTail) good.push('핵심 메시지를 처음과 끝에 반복해요.');
  }

  // 5. 마무리
  const lastT = sents[n - 1].text;
  if (/^(이상입니다|감사합니다|들어주셔서 감사합니다)[.!]?$/.test(lastT.replace(/\s/g, ' ').trim()) && n > 2 && !overlap(sents[n - 2].text, keyWords)) {
    add('low', '끝인사 앞에 마무리 한 문장', '“감사합니다” 바로 앞에 요약이나 요청 한 문장을 두면 끝이 흐지부지되지 않아요.', [n - 2], `마지막 문장이 “${lastT}”이고 바로 앞 문장에 핵심 메시지가 없어요`);
  }

  // 6. 긴 문장
  const long = sents.filter((s) => s.syl > 60);
  long.slice(0, 3).forEach((s) => {
    const split = s.text.split(/\s+/).findIndex((w, k, arr) => k > 3 && k < arr.length - 3 && CONNECTIVE.test(w));
    const hint = split > 0 ? ` “${s.text.split(/\s+/).slice(0, split + 1).join(' ')}”에서 끊고 새 문장으로 시작하세요.` : ' 쉼표 자리에서 문장을 나눠 보세요.';
    add(s.syl > 85 ? 'mid' : 'low', `${s.i + 1}번 문장이 한 호흡에 길어요 (${s.syl}음절)`, `말로 하면 40~60음절이 편해요.${hint}`, [s.i], `${s.i + 1}번 문장 ${s.syl}음절(60음절 넘으면 한 호흡에 읽기 어려워요)`);
  });
  if (long.length > 3) add('low', `긴 문장이 ${long.length - 3}개 더 있어요`, '읽기 가이드에서 표시된 문장을 확인하세요.', long.slice(3).map((s) => s.i), `60음절 넘는 문장 ${long.length}개`);

  // 7. 말끝이 계속 같음
  let run = 1, best = 1, bestEnd = 0;
  for (let k = 1; k < n; k++) {
    const e = (s: Sent) => s.text.replace(/[.!?\s]+$/, '').slice(-3);
    run = e(sents[k]) === e(sents[k - 1]) ? run + 1 : 1;
    if (run > best) { best = run; bestEnd = k; }
  }
  if (best >= 4) add('low', `같은 말끝이 ${best}번 이어져요`, '“~습니다”만 이어지면 억양이 단조로워져요. 중간에 질문이나 짧은 문장을 섞어 리듬을 바꿔 보세요.', [bestEnd - best + 1, bestEnd], `${bestEnd - best + 2}~${bestEnd + 1}번 문장이 같은 말끝(“${sents[bestEnd].text.replace(/[.!?\s]+$/, '').slice(-3)}”)으로 끝나요`);

  // 8. 질문
  const qs = sents.filter((s) => s.type === 'q');
  if (!qs.length && ['lecture', 'conference', 'speech', 'ir', 'capstone'].includes(purpose.id) && n >= 6) add('low', '청중에게 던지는 질문이 없어요', '“혹시 이런 경험 있으신가요?” 같은 질문 하나가 집중을 다시 모아요.', [], `${n}문장 중 물음표(?)로 끝나는 문장이 0개예요`);
  else if (qs.length) good.push('청중에게 질문을 던져요.');

  // 9. 망설이는 표현, 적힌 군더더기
  const hedge = [...text.matchAll(HEDGES)].map((m) => m[0]);
  if (hedge.length >= 2) add(hedge.length >= 4 ? 'mid' : 'low', `망설이는 표현 ${hedge.length}개`, `“${[...new Set(hedge)].slice(0, 3).join('”, “')}”는 확신을 깎아요. 사실이면 단정해서 말하세요.`, sents.filter((s) => HEDGES.test(s.text) && !(HEDGES.lastIndex = 0)).map((s) => s.i).slice(0, 6), `대본에서 찾은 표현: ${hedge.slice(0, 5).map((h) => `“${h}”`).join(', ')}`);
  HEDGES.lastIndex = 0;
  const fill = [...text.matchAll(FILLERS)].length;
  if (fill) add('low', `대본에 군더더기 말 ${fill}개`, '“음, 어, 이제, 막”은 대본에서부터 빼 두세요. 적혀 있으면 그대로 읽게 돼요.', [], `대본에 적힌 군더더기 말 ${fill}개`);

  // 10. 숫자
  const nums = sents.filter((s) => /\d/.test(s.text));
  if (NEEDS_NUMBERS.has(purpose.id) && !nums.length) add('mid', '숫자 근거가 없어요', `${purpose.label}에서는 성과나 규모를 숫자 하나로 보여주는 게 가장 설득력 있어요.`, [], `${n}문장 중 숫자가 들어간 문장이 0개예요`);
  else if (nums.length) good.push(`숫자 근거가 ${nums.length}곳에 있어요.`);
  const bigNums = sents.filter((s) => /\d{1,3}(,\d{3}){2,}|\d{6,}/.test(s.text));
  if (bigNums.length) add('low', '귀로 듣기 어려운 숫자', '“1,234,567명”보다 “약 120만 명”이 잘 들려요. 말로 할 숫자는 반올림하세요.', bigNums.map((s) => s.i), `여섯 자리 넘는 숫자가 ${bigNums.map((s) => `${s.i + 1}번`).join(', ')} 문장에 있어요`);

  // 11. 반복 단어
  const freq = new Map<string, number>();
  sents.forEach((s) => s.text.split(/\s+/).map(stem).forEach((w) => { if (w.length >= 2 && !STOP.has(w) && !/\d/.test(w) && !keyWords.has(w)) freq.set(w, (freq.get(w) || 0) + 1); }));
  const rep = [...freq].filter(([, c]) => c >= Math.max(4, n / 3)).sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (rep.length) add('low', `${rep.map(([w, c]) => `‘${w}’ ${c}번`).join(', ')}`, '같은 단어가 자주 나와요. 일부는 대명사나 다른 표현으로 바꿔 보세요.', [], `${n}문장에서 센 횟수`);

  // 12. 영어 용어
  const words = text.split(/\s+/).filter(Boolean);
  const eng = words.filter((w) => /[A-Za-z]{3,}/.test(w));
  if (words.length > 30 && eng.length / words.length > 0.12) add('low', '영어 용어가 많아요', `${eng.slice(0, 4).join(', ')} 등. 처음 나올 때 한 번 풀어 말하면 듣는 사람이 덜 지쳐요.`, [], `단어 ${words.length}개 중 영어 ${eng.length}개(${Math.round((eng.length / words.length) * 100)}%)`);

  // 13. 오프닝
  if (['ir', 'conference', 'lecture', 'capstone'].includes(purpose.id) && /^안녕하(세요|십니까)/.test(sents[0].text) && n > 3 && sents[1] && /^저는|^제 이름/.test(sents[1].text)) {
    add('low', '첫 문장을 인사 대신 질문이나 숫자로', '자기소개는 두 번째로 미뤄도 돼요. 첫 10초에 문제나 놀라운 숫자를 꺼내면 끝까지 들어요.', [0], '첫 문장이 인사, 두 번째 문장이 자기소개로 시작해요');
  }

  const order: Record<Sev, number> = { high: 0, mid: 1, low: 2 };
  issues.sort((a, b) => order[a.sev] - order[b.sev]);
  return {
    sents, issues, good, elements,
    stats: { totalSyl, estSec, targetSec, n, avg: Math.round(totalSyl / n), long: long.length, paras, spm },
  };
}

// 문장의 억양 곡선 (0 = 낮게, 1 = 높게). 강조 어절에서 오르고 말끝에서 내리거나 올립니다.
export function contour(sent: Sent): [number, number][] {
  const pts: [number, number][] = [];
  const flat = sent.chunks.flat();
  const total = flat.length || 1;
  let k = 0;
  pts.push([0, 0.55]);
  sent.chunks.forEach((c, ci) => {
    c.forEach((t) => {
      const x = (k + 0.5) / total;
      if (t.em) pts.push([x, 0.9]);
      k++;
    });
    if (ci < sent.chunks.length - 1) pts.push([k / total, 0.42]);
  });
  pts.push([0.96, sent.type === 'q' ? 0.88 : sent.type === 'ex' ? 0.7 : 0.18]);
  pts.sort((a, b) => a[0] - b[0]);
  return pts;
}

// .txt · .md · .docx 읽기 (docx는 zip 안의 word/document.xml만 풉니다)
export async function readScriptFile(file: File): Promise<string> {
  if (/\.docx$/i.test(file.name)) return readDocx(await file.arrayBuffer());
  if (/\.(pdf|hwp|pptx?)$/i.test(file.name)) throw new Error('PDF·한글·PPT는 아직 못 읽어요. 내용을 복사해서 붙여넣어 주세요.');
  const t = await file.text();
  return t.replace(/^#+\s*/gm, '').replace(/\*\*|__/g, '');
}
async function readDocx(buf: ArrayBuffer): Promise<string> {
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let e = buf.byteLength - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('docx 파일을 열 수 없어요.');
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  for (let i = 0; i < count; i++) {
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nl));
    if (name === 'word/document.xml') {
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      let data = bytes.subarray(start, start + csize);
      if (method === 8) data = new Uint8Array<ArrayBuffer>(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      const xml = new TextDecoder().decode(data);
      const txt = xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
      return txt.replace(/\n{3,}/g, '\n\n').trim();
    }
    p += 46 + nl + xl + cl;
  }
  throw new Error('docx 안에서 본문을 찾지 못했어요.');
}

// 예시 억양으로 읽기: 숨 쉴 자리마다 끊어서 높낮이와 속도를 바꿔 읽습니다.
export class Reader {
  token = 0;
  voice: SpeechSynthesisVoice | null = null;
  onChunk: ((at: { si: number; ci: number } | null) => void) | null = null;
  onEnd: (() => void) | null = null;
  rate = 1;
  static supported() { return 'speechSynthesis' in window; }
  pickVoice() {
    const vs = speechSynthesis.getVoices().filter((v) => /^ko/i.test(v.lang));
    this.voice = vs.find((v) => /Yuna|Google|Neural|Premium|Enhanced/i.test(v.name)) || vs[0] || null;
    return this.voice;
  }
  stop() { this.token++; speechSynthesis.cancel(); this.onChunk?.(null); }
  async play(sents: Sent[], { base = 1, from = 0 } = {}) {
    this.stop();
    const my = ++this.token;
    if (!this.voice) this.pickVoice();
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let si = from; si < sents.length; si++) {
      const s = sents[si];
      for (let ci = 0; ci < s.chunks.length; ci++) {
        if (my !== this.token) return;
        const c = s.chunks[ci];
        const last = ci === s.chunks.length - 1;
        const em = c.some((t) => t.em);
        const u = new SpeechSynthesisUtterance(c.map((t) => t.w).join(' '));
        u.lang = 'ko-KR';
        if (this.voice) u.voice = this.voice;
        u.rate = Math.max(0.5, base * this.rate * (em ? 0.9 : 1));
        u.pitch = last ? (s.type === 'q' ? 1.25 : s.type === 'ex' ? 1.12 : 0.92) : em ? 1.15 : 1.02;
        this.onChunk?.({ si, ci });
        await new Promise<void>((res) => { u.onend = () => res(); u.onerror = () => res(); speechSynthesis.speak(u); });
        if (my !== this.token) return;
        const nextPara = sents[si + 1] && sents[si + 1].para !== s.para;
        await wait(last ? (nextPara ? 850 : 420) : em ? 260 : 170);
      }
    }
    if (my === this.token) { this.onChunk?.(null); this.onEnd?.(); }
  }
}
