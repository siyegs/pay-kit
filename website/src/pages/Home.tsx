import { Header } from "../components/Header";
import { Hero } from "../components/Hero";
import { Marquee } from "../components/Marquee";
import { Features } from "../components/Features";
import { CodeTabs } from "../components/CodeTabs";
import { Stats } from "../components/Stats";
import { Comparison } from "../components/Comparison";
import { CTA } from "../components/CTA";
import { Footer } from "../components/Footer";
import { BackToTop } from "../components/BackToTop";
import { Reveal } from "../components/Reveal";
import { Head } from "../components/Head";
import { PageTransition } from "../components/PageTransition";

export function Home() {
  return (
    <PageTransition>
      <div className="min-h-screen bg-surface">
        <Head />
        <Header />
        <main>
          <Reveal><Hero /></Reveal>
          <Reveal delay={0.1}><Marquee /></Reveal>
          <Reveal delay={0.15}><Features /></Reveal>
          <Reveal delay={0.2}><CodeTabs /></Reveal>
          <Reveal delay={0.1}><Stats /></Reveal>
          <Reveal delay={0.15}><Comparison /></Reveal>
          <Reveal delay={0.2}><CTA /></Reveal>
        </main>
        <Footer />
        <BackToTop />
      </div>
    </PageTransition>
  );
}
