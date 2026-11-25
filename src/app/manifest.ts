import type { MetadataRoute } from 'next';

/** 안드로이드 크롬 '홈 화면에 추가' 이름·아이콘. 이름은 실제 앱처럼 'Talkstage' 만, 화면은 브라우저 그대로 열어요. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Talkstage',
    short_name: 'Talkstage',
    description: '중요한 발표 한 번을 위한 리허설 코치',
    start_url: '/',
    display: 'browser',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/brand/png/background/talkstage-app-icon-512.png', type: 'image/png', sizes: '512x512' },
      { src: '/brand/png/background/talkstage-app-icon-1024.png', type: 'image/png', sizes: '1024x1024' },
    ],
  };
}
