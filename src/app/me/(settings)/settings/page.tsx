'use client';
import { ThemePicker } from '@/components/me/ThemePicker';

/** 앱 설정(이 기기 기준). 지금은 화면 테마만 있어요. */
export default function Settings() {
  return (
    <>
      <h1 className="title1">설정</h1>
      <p className="subtitle">이 기기에서 Talkstage 를 어떻게 보여 줄지 정해요.</p>
      <ThemePicker />
    </>
  );
}
