// OG 이미지 원본(개발 서버 전용). 랜딩과 같은 로고·카드·그림으로 1200×630 을 그리고, 이 화면을 캡처해 app/opengraph-image.png 로 써요.
// 바꾼 뒤: 개발 서버에서 .og 요소를 1200×630 으로 캡처 → src/app/opengraph-image.png · twitter-image.png 둘 다 교체.
import { notFound } from 'next/navigation';
import { BrandMark } from '@/components/ui/BrandMark';
import { Picto } from '@/components/ui/Picto';

const CARDS: { ico: string; t: string; sub: string; art: number; x: number; y: number; r: number }[] = [
  { ico: 'ir', t: 'IR 피칭', sub: '10분 · 확신', art: 2, x: 700, y: 52, r: -6 },
  { ico: 'interview', t: '면접', sub: '1분 · 첫인상', art: 3, x: 942, y: 22, r: 5 },
  { ico: 'capstone', t: '졸업 발표', sub: '10분 · 문제에서 결과까지', art: 5, x: 688, y: 330, r: 4 },
  { ico: 'report', t: '업무 보고', sub: '5분 · 결론 먼저', art: 1, x: 934, y: 300, r: -5 },
];

export default function OgPreview() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className="og">
      <div className="og-brand"><BrandMark /><span>Talkstage</span></div>
      <h1>중요한 발표<br />한 번을 위한<br /><em>리허설 코치</em></h1>
      {CARDS.map((c) => (
        <div key={c.t} className={`og-card art-${c.art}`} style={{ left: c.x, top: c.y, rotate: `${c.r}deg` }}>
          <b>{c.t}</b><span>{c.sub}</span><Picto name={c.ico} />
        </div>
      ))}
    </div>
  );
}
