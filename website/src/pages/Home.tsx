import { Header } from "../components/Header";
import { Hero } from "../components/Hero";
import { Marquee } from "../components/Marquee";
import { Features } from "../components/Features";
import { CodeTabs } from "../components/CodeTabs";
import { Stats } from "../components/Stats";
import { Comparison } from "../components/Comparison";
import { CTA } from "../components/CTA";
import { Footer } from "../components/Footer";

export function Home() {
  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <main>
        <Hero />
        <Marquee />
        <Features />
        <CodeTabs />
        <Stats />
        <Comparison />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
