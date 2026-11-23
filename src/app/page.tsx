import { Hero } from '@/components/landing/Hero';
import { Nonverbal } from '@/components/landing/Nonverbal';
import { Why } from '@/components/landing/Why';
import { Who } from '@/components/landing/Who';
import { Pick } from '@/components/landing/Pick';
import { Marquee } from '@/components/landing/Marquee';
import { How } from '@/components/landing/How';
import { ScriptBand } from '@/components/landing/ScriptBand';
import { Features } from '@/components/landing/Features';
import { Teams } from '@/components/landing/Teams';
import { Evidence } from '@/components/landing/Evidence';
import { CtaBand } from '@/components/landing/CtaBand';
import { Footer } from '@/components/landing/Footer';
import { RecentRehearsals } from '@/components/landing/RecentRehearsals';
import { Reveal } from '@/components/landing/Reveal';

export default function Home() {
  return (
    <section className="screen" data-screen="home">
      <div className="landing">
        <Hero />
        <RecentRehearsals slot="top" />
        <Nonverbal />
        <Why />
        <Who />
        <Pick />
        <Marquee />
        <How />
        <ScriptBand />
        <Features />
        <Teams />
        <Evidence />
        <RecentRehearsals slot="bottom" />
        <CtaBand />
        <Footer />
      </div>
      <Reveal />
    </section>
  );
}
