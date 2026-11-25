import { notFound } from 'next/navigation';
import { EvalRunner } from '@/components/dev/EvalRunner';

export const metadata = { title: '정확도 검증', robots: { index: false } };

/** 개발 서버 전용. 배포 빌드에서는 404 예요. */
export default function EvalPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <section className="screen"><EvalRunner /></section>;
}
