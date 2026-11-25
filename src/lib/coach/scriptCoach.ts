// AI 대본 코칭(유료 요금제 전용) 결과 모양과 요청. 서버는 /api/script/coach.
export type ScriptFix = { title: string; why: string; quote: string; rewrite: string };
export type ScriptCoach = { verdict: string; strengths: string[]; fixes: ScriptFix[]; opening: string; closing: string; keyLine: string };

export type CoachReq = { script: string; purposeId: string; targetSec: number; topic: string; keyMessage: string; outcome: string };

export async function requestScriptCoach(body: CoachReq, signal?: AbortSignal): Promise<ScriptCoach> {
  const res = await fetch('/api/script/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const data = (await res.json().catch(() => ({}))) as { coach?: ScriptCoach; error?: string };
  if (!res.ok || !data.coach) throw new Error(data.error || 'AI 코칭을 받지 못했어요.');
  return data.coach;
}
