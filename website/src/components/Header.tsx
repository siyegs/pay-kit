import { useState, type MouseEvent } from "react";
import { MobileNav } from "./MobileNav";

function handleNavClick(e: MouseEvent<HTMLAnchorElement>, href: string) {
  if (!href.startsWith("#")) return;
  e.preventDefault();
  const id = href.slice(1);
  const el = document.getElementById(id);
  if (el) {
    const offset = 88;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  }
}

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-surface/72 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-brand/30 bg-brand text-surface shadow-[0_0_24px_rgba(139,255,202,0.16)]">
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M13 11h6v10h-6z" fill="#09090b" />
                <path d="M19 14l3 3-3 3" fill="none" stroke="#09090b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-base font-semibold text-foreground">pay-kit</span>
          </a>

          <nav className="hidden md:flex items-center gap-7" role="navigation" aria-label="Main navigation">
            {["Features", "Code", "Compare"].map((label) => {
              const href = `#${label.toLowerCase()}`;
              return (
                <a
                  key={label}
                  href={href}
                  onClick={(e) => handleNavClick(e, href)}
                  className="text-sm text-muted transition-colors hover:text-foreground"
                >
                  {label}
                </a>
              );
            })}
            <a
              href="https://github.com/siyegs/pay-kit"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-foreground transition-all hover:border-brand/40 hover:bg-brand/10"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="m12 1.8 3.1 6.3 7 .9-5.1 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9L1.9 9l7-.9z" />
              </svg>
              Star repo
            </a>
          </nav>

          <button
            onClick={() => setMobileOpen(true)}
            className="flex md:hidden h-10 w-10 items-center justify-center rounded-md border border-white/[0.1] text-foreground transition hover:border-brand/40"
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </header>
  );
}
