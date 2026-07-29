export function CTA() {
  return (
    <section className="section-rule py-24 sm:py-32" aria-labelledby="cta-heading">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="premium-shell rounded-lg p-6 sm:p-10 lg:p-12">
          <div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="eyebrow">Ship the first route</p>
              <h2 id="cta-heading" className="text-balance mt-4 max-w-3xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
                Add payments without handing your checkout path to another middleman.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-muted">
                Install the SDK, wire your provider keys, and keep payment logic in the
                same codebase as the rest of your product.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <a
                href="https://www.npmjs.com/package/@siyegs/pay-kit"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-md bg-foreground px-5 text-sm font-bold text-surface transition hover:bg-brand"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.838h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
                </svg>
                Install package
              </a>
              <a
                href="https://github.com/siyegs/pay-kit"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/[0.12] bg-white/[0.04] px-5 text-sm font-semibold text-foreground transition hover:border-brand/45 hover:bg-brand/10"
              >
                Star on GitHub
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3.2l2.7 5.4 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.4-4.2 6-.9z" />
                </svg>
              </a>
              <p className="text-sm leading-6 text-muted lg:text-right">
                If pay-kit saves you a provider rewrite, star the repo so the next
                builder can find it faster.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
