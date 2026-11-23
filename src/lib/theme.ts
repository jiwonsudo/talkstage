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

/** 첫 화면을 그리기 전에 저장된 테마를 적용하는 인라인 스크립트(깜빡임 방지). layout 의 <head> 에서 써요. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}})()`;
