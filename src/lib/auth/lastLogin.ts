// 이 기기에서 마지막으로 로그인한 방법(이메일·카카오·Google)과 계정. 다음 로그인 창에서
// 이메일이면 비밀번호만 치게, 소셜이면 그 버튼에 "최근 사용" 말풍선을 띄워요. 비밀번호는 절대 저장하지 않아요.
export type LoginMethod = 'email' | 'kakao' | 'google';
export type LastLogin = { method: LoginMethod; email: string; name: string };

const KEY = 'ts-last-login';
const PENDING = 'ts-login-pending'; // 소셜 로그인은 다른 사이트를 다녀오니, 떠나기 전에 고른 방법을 적어 둬요

export function loadLast(): LastLogin | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as LastLogin | null;
    return v && (v.method === 'email' || v.method === 'kakao' || v.method === 'google') ? v : null;
  } catch { return null; }
}
export function forgetLast() {
  try { localStorage.removeItem(KEY); } catch { /* 못 지워도 괜찮아요 */ }
}
export function markSocialPending(m: LoginMethod) {
  try { localStorage.setItem(PENDING, m); } catch { /* 없으면 계정의 첫 가입 방법으로 대신해요 */ }
}
/** 로그인된 사용자를 불러올 때 불러요. 소셜에서 막 돌아왔으면 그 방법, 아니면 이메일 로그인 직후 적은 값을 유지. */
export function rememberLogin(u: { email: string; name: string; provider?: string }) {
  try {
    const pending = localStorage.getItem(PENDING) as LoginMethod | null;
    localStorage.removeItem(PENDING);
    const prev = loadLast();
    const method: LoginMethod = pending
      ?? (prev && prev.email === u.email ? prev.method : (u.provider === 'kakao' || u.provider === 'google' ? u.provider : 'email'));
    localStorage.setItem(KEY, JSON.stringify({ method, email: u.email, name: u.name } satisfies LastLogin));
  } catch { /* 저장 못 해도 로그인은 그대로 돼요 */ }
}
export function rememberEmailLogin(email: string) {
  try {
    localStorage.removeItem(PENDING);
    const prev = loadLast();
    localStorage.setItem(KEY, JSON.stringify({ method: 'email', email, name: prev?.email === email ? prev.name : '' } satisfies LastLogin));
  } catch { /* 저장 못 해도 로그인은 그대로 돼요 */ }
}
