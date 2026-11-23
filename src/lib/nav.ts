'use client';
import { useMemo } from 'react';
import { useRouter as useNextRouter } from 'next/navigation';

/** 화면 이동을 시작한다고 알리는 이벤트. ScreenTransition 이 받아서 바로 색 조각으로 화면을 덮어요(다음 화면 로딩이 안 보이게). */
export const NAV_START = 'ts:navstart';
export const announceNav = (href: string) => window.dispatchEvent(new CustomEvent<string>(NAV_START, { detail: href }));

/**
 * next/navigation 의 useRouter 와 같지만, push 하기 전에 전환 모션부터 켜요.
 * 화면을 옮기는 router.push 는 이걸 쓰세요(링크 <a>/<Link> 클릭은 ScreenTransition 이 알아서 잡아요).
 */
export function useRouter() {
  const r = useNextRouter();
  return useMemo(() => ({
    ...r,
    push: (href: string, opts?: Parameters<typeof r.push>[1]) => { announceNav(href); r.push(href, opts); },
  }), [r]);
}
