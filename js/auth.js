// 기기 안 계정 (프로토타입용). 서버 로그인을 붙일 때 이 모듈의 함수만 바꾸면 됩니다.
// 비밀번호는 PBKDF2-SHA256(15만 회)로 해시해서 저장하고, 원문은 저장하지 않습니다.
const K_USERS = 'rc-users-v1';
const K_SESSION = 'rc-session-v1';
const K_GUEST_HISTORY = 'rc-history-v1';

const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const norm = (email) => String(email || '').trim().toLowerCase();

async function hash(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, key, 256);
  return b64(bits);
}

const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(currentUser()));

export function currentUser() {
  const s = read(K_SESSION, null);
  if (!s?.email) return null;
  const u = read(K_USERS, {})[s.email];
  return u ? { email: s.email, name: u.name } : null;
}
export const onAuthChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const historyKey = () => { const u = currentUser(); return u ? `${K_GUEST_HISTORY}:${u.email}` : K_GUEST_HISTORY; };

// 로그인 전에 쌓은 기록은 처음 로그인한 계정으로 옮깁니다.
function adoptGuestHistory(email) {
  const guest = read(K_GUEST_HISTORY, []);
  if (!guest.length) return 0;
  const key = `${K_GUEST_HISTORY}:${email}`;
  const mine = read(key, []);
  write(key, [...mine, ...guest].sort((a, b) => a.at - b.at).slice(-40));
  localStorage.removeItem(K_GUEST_HISTORY);
  return guest.length;
}

export async function signUp({ name, email, password }) {
  email = norm(email);
  name = String(name || '').trim();
  if (!name) throw new Error('이름을 입력해 주세요.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('이메일 형식을 확인해 주세요.');
  if (String(password).length < 8) throw new Error('비밀번호는 8자 이상으로 정해 주세요.');
  const users = read(K_USERS, {});
  if (users[email]) throw new Error('이미 가입된 이메일이에요. 로그인해 주세요.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  users[email] = { name, salt: b64(salt), hash: await hash(password, salt), createdAt: Date.now() };
  write(K_USERS, users);
  write(K_SESSION, { email });
  const moved = adoptGuestHistory(email);
  emit();
  return { user: currentUser(), moved };
}

export async function signIn({ email, password }) {
  email = norm(email);
  const u = read(K_USERS, {})[email];
  // 계정이 없을 때와 비밀번호가 틀릴 때 같은 문구를 씁니다.
  if (!u || (await hash(password, unb64(u.salt))) !== u.hash) throw new Error('이메일 또는 비밀번호가 맞지 않아요.');
  write(K_SESSION, { email });
  const moved = adoptGuestHistory(email);
  emit();
  return { user: currentUser(), moved };
}

export function signOut() {
  localStorage.removeItem(K_SESSION);
  emit();
}

// ---------- 계정 관리 ----------
export function updateName(name) {
  const s = read(K_SESSION, null);
  name = String(name || '').trim();
  if (!s?.email) throw new Error('로그인이 필요해요.');
  if (!name) throw new Error('이름을 입력해 주세요.');
  const users = read(K_USERS, {});
  users[s.email].name = name;
  write(K_USERS, users);
  emit();
}

export async function changePassword({ current, next }) {
  const s = read(K_SESSION, null);
  const users = read(K_USERS, {});
  const u = s?.email && users[s.email];
  if (!u) throw new Error('로그인이 필요해요.');
  if ((await hash(current, unb64(u.salt))) !== u.hash) throw new Error('지금 비밀번호가 맞지 않아요.');
  if (String(next).length < 8) throw new Error('새 비밀번호는 8자 이상으로 정해 주세요.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  u.salt = b64(salt); u.hash = await hash(next, salt);
  write(K_USERS, users);
}

// 계정과 그 계정의 연습 기록을 이 기기에서 지웁니다.
export async function deleteAccount(password) {
  const s = read(K_SESSION, null);
  const users = read(K_USERS, {});
  const u = s?.email && users[s.email];
  if (!u) throw new Error('로그인이 필요해요.');
  if ((await hash(password, unb64(u.salt))) !== u.hash) throw new Error('비밀번호가 맞지 않아요.');
  delete users[s.email];
  write(K_USERS, users);
  localStorage.removeItem(`${K_GUEST_HISTORY}:${s.email}`);
  localStorage.removeItem(K_SESSION);
  emit();
}
