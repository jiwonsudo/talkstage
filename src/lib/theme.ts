/** 화면 테마: 시스템 설정을 따르거나, 라이트·다크로 고정해요. 이 기기에만 저장돼요. */
export type Theme = 'system' | 'light' | 'dark';
export const THEME_KEY = 'ts-theme';

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch { return 'system'; }
}

/** <html data-theme> 를 바꿔요. 'system' 이면 속성을 지워서 globals.css 의 prefers-color-scheme 를 따라요. */
export function setTheme(t: Theme) {
  try { if (t === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch { /* 저장 못 해도 이번 화면엔 적용 */ }
  const d = document.documentElement;
  if (t === 'system') delete d.dataset.theme; else d.dataset.theme = t;
}

const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};

/**
 * 테마를 바꾸면서, 라이트↔다크가 실제로 바뀌면 누른 자리(x, y)에서 새 테마가 원으로 번져요.
 * View Transitions 를 못 쓰거나 움직임 줄이기 설정이면 그냥 바꿔요.
 */
export function setThemeAnimated(t: Theme, x: number, y: number) {
  const before = isDark();
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduce) { setTheme(t); return; }
  // 실제 색이 안 바뀌면(시스템이 이미 같은 테마) 번지기 없이
  const d = document.documentElement, prev = d.dataset.theme;
  setTheme(t);
  const after = isDark();
  if (prev === undefined) delete d.dataset.theme; else d.dataset.theme = prev;
  if (before === after) { setTheme(t); return; }
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const vt = doc.startViewTransition(() => setTheme(t));
  vt.ready.then(() => {
    d.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.22,.8,.24,1)', pseudoElement: '::view-transition-new(root)' });
  }).catch(() => {});
}

/** 첫 화면을 그리기 전에 저장된 테마를 적용하는 인라인 스크립트(깜빡임 방지). layout 의 <head> 에서 써요. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}})()`;
