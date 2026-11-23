'use client';
import { useState } from 'react';
import { getTheme, setTheme, type Theme } from '@/lib/theme';

const OPTIONS: { id: Theme; label: string }[] = [
  { id: 'system', label: '시스템 설정' },
  { id: 'light', label: '라이트' },
  { id: 'dark', label: '다크' },
];

/** 설정 > 계정 관리의 화면 테마 고르기. 로그인 뒤에만 그려져서(서버 렌더 없음) localStorage 를 바로 읽어요. */
export function ThemePicker() {
  const [cur, setCur] = useState<Theme>(getTheme);
  return (
    <section className="hub-card">
      <h2>화면 테마</h2>
      <div className="seg seg-3" role="radiogroup" aria-label="화면 테마">
        {OPTIONS.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={cur === o.id} onClick={() => { setTheme(o.id); setCur(o.id); }}>{o.label}</button>
        ))}
      </div>
      <p className="hub-hint">시스템 설정을 고르면 기기의 라이트·다크 모드를 그대로 따라가요. 이 기기에만 저장돼요.</p>
    </section>
  );
}
