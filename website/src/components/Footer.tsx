export function Footer() {
  return (
    <footer className="section-rule bg-surface/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <a href="/" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-brand/30 bg-brand text-surface">
            <svg width="14" height="14" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M13 11h6v10h-6z" fill="#09090b" />
              <path d="M19 14l3 3-3 3" fill="none" stroke="#09090b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-foreground">pay-kit</span>
        </a>

        <p className="text-sm leading-6 text-muted sm:text-right">
          MIT &copy; {new Date().getFullYear()} Iyegere Success Karboloo{" "}
          <span className="text-white/20">/</span>{" "}
          <a href="https://github.com/siyegs/pay-kit" target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground transition hover:text-brand">
            Star repo
          </a>{" "}
          <span className="text-white/20">/</span>{" "}
          <a href="https://www.npmjs.com/package/@siyegs/pay-kit" target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground transition hover:text-brand">
            npm
          </a>
        </p>
      </div>
    </footer>
  );
}
