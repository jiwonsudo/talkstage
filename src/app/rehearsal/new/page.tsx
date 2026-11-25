import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RehearsalEntry } from '@/components/rehearsal/RehearsalEntry';

export const metadata: Metadata = { title: '새 리허설' };

export default function NewRehearsalPage() {
  return <Suspense><RehearsalEntry /></Suspense>;
}
