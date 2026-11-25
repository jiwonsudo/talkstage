// AI 대본 코칭: 결과 모양, 크레딧 정책, 요청. 서버는 /api/script/coach(하네스는 scriptHarness.ts).

/** 1단계(이해): 대본에서 먼저 파악한 발표의 정체 */
export type ScriptBrief = {
  /** 대본만 보고 판단한 상황 id(scenarios.ts) — 고른 상황과 다르면 알려 줘요 */
  detectedPurpose: string;
  purposeFit: 'match' | 'partial' | 'mismatch';
  purposeNote: string;
  topic: string;
  audience: string;
  /** 발표자가 청중에게 얻고 싶은 것(행동·결정) */
  ask: string;
  /** 대본에서 찾은 핵심 메시지(가장 가까운 문장을 다듬은 것) */
  keyMessage: string;
  /** 발표자가 적은 핵심 메시지와 대본이 맞는지 */
  keyFit: 'same' | 'partial' | 'missing' | 'none';
  keyNote: string;
  structure: { part: string; quote: string }[];
};
export type ScriptFix = { title: string; why: string; quote: string; rewrite: string };
/** 2단계(판단): 이 대본을 이 상황에서 어떻게 말할지 */
export type DeliveryCue = { quote: string; kind: 'pause' | 'slow' | 'stress' | 'point' | 'show' | 'eyes' | 'gesture'; tip: string };
export type ScriptCoach = {
  verdict: string;
  strengths: string[];
  fixes: ScriptFix[];
  opening: string;
  closing: string;
  keyLine: string;
  /** 이 대본·상황에 맞는 발표 방식 요약 2~3문장 */
  deliveryPlan: string;
  cues: DeliveryCue[];
};
export type CoachResult = { brief: ScriptBrief; coach: ScriptCoach; charged: { kind: 'trial' } | { kind: 'credits'; cost: number } };

export type CoachReq = {
  script: string; purposeId: string; targetSec: number; topic: string; keyMessage: string; outcome: string;
  aid: string; posture: string;
};

// ── 크레딧 정책(반드시 쓰기 전에 보여 줘요). SQL ai_coach_cost() 와 같아야 해요. ──
export const AI_COACH_MAX_CHARS = 15000;
export const AI_COACH_TIERS: { upTo: number; credits: number; label: string }[] = [
  { upTo: 2000, credits: 3, label: '2,000자까지(약 5분 발표)' },
  { upTo: 6000, credits: 6, label: '6,000자까지(약 15분)' },
  { upTo: AI_COACH_MAX_CHARS, credits: 9, label: '15,000자까지(약 35분)' },
];
/** 공백 포함 글자 수(앞뒤 공백 제외) 기준 크레딧 */
export const aiCoachChars = (script: string) => script.trim().length;
export const aiCoachCost = (chars: number) => (AI_COACH_TIERS.find((t) => chars <= t.upTo) ?? AI_COACH_TIERS[AI_COACH_TIERS.length - 1]).credits;

/** 지금 이 사용자가 AI 코칭을 쓸 수 있는지(서버가 정해요) */
export type CoachStatus =
  | { mode: 'promo'; paid: boolean; trial: 'none' | 'ready' | 'busy' | 'used' }
  | { mode: 'credits'; paid: boolean; left: number | null }
  | { mode: 'off'; reason: string };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || '요청을 처리하지 못했어요.');
  return data;
}
export const getCoachStatus = () => call<CoachStatus>('/api/script/coach', { cache: 'no-store' });
export const redeemPromo = (code: string) =>
  call<CoachStatus>('/api/script/promo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
export const requestScriptCoach = (body: CoachReq, signal?: AbortSignal) =>
  call<CoachResult>('/api/script/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
