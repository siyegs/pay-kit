import type { RouteStatus } from "../types";

const routes: RouteStatus[] = [
  { label: "Charge", provider: "Paystack", status: "verified", amount: "NGN 5,000" },
  { label: "Refund", provider: "Flutterwave", status: "queued", amount: "GHS 320" },
  { label: "Webhook", provider: "Paystack", status: "signed", amount: "charge.success" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-24 sm:pt-36" aria-labelledby="hero-heading">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-5xl pb-8 text-center sm:pb-16">
          <div className="mb-5 sm:mb-7 inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.045] px-3 py-1 sm:px-3.5 sm:py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_14px_rgba(139,255,202,0.8)]" aria-hidden="true" />
            <span className="text-[11px] sm:text-xs font-semibold text-muted">v0.10.1 / MIT / direct provider keys</span>
          </div>

          <h1 id="hero-heading" className="text-balance font-display text-[clamp(2.15rem,6.5vw,7.45rem)] font-semibold leading-[1.05] sm:leading-[0.9] text-foreground">
            The payment SDK for builders who keep the money path short.
          </h1>

          <p className="mx-auto mt-5 sm:mt-7 max-w-2xl text-sm leading-7 text-muted sm:text-lg sm:leading-8">
            One typed API for Paystack and Flutterwave. Charge, verify, refund, pay out,
            split, and normalize webhooks from your own backend.
          </p>

          <div className="mt-7 sm:mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="https://www.npmjs.com/package/@siyegs/pay-kit"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full sm:w-auto min-h-12 items-center justify-center gap-2 rounded-md bg-foreground px-5 text-sm font-bold text-surface transition hover:bg-brand"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.838h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
              </svg>
              <span className="truncate">npm install @siyegs/pay-kit</span>
            </a>
            <a
              href="https://github.com/siyegs/pay-kit"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full sm:w-auto min-h-12 items-center justify-center gap-2 rounded-md border border-white/[0.12] bg-white/[0.04] px-5 text-sm font-semibold text-foreground transition hover:border-brand/45 hover:bg-brand/10"
            >
              Read the source
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 17l9.2-9.2M17 17V7H7" />
              </svg>
            </a>
          </div>
        </div>

        <div className="premium-shell mx-auto mb-0 sm:mb-[-46px] max-w-6xl rounded-lg" role="region" aria-label="Live provider status and code example">
          <div className="relative grid gap-px bg-white/[0.06] md:grid-cols-[0.95fr_1.3fr]">
            <div className="bg-card/95 p-4 sm:p-6 lg:p-7">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 sm:pb-4">
                <div>
                  <p className="eyebrow">Provider route</p>
                  <p className="mt-1 text-base sm:text-lg font-semibold text-foreground">Live settlement path</p>
                </div>
                <span className="rounded-full border border-brand/25 bg-brand/10 px-2.5 py-0.5 sm:px-3 sm:py-1 text-xs font-bold text-brand">
                  online
                </span>
              </div>

              <div className="mt-4 sm:mt-6 space-y-3">
                {routes.map((route) => (
                  <div key={`${route.label}-${route.provider}`} className="rounded-md border border-white/[0.08] bg-surface/55 p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold text-muted">{route.label}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{route.provider}</p>
                      </div>
                      <p className="font-mono text-xs text-brand">{route.status}</p>
                    </div>
                    <div className="mt-3 sm:mt-4 flex items-center gap-3">
                      <span className="h-px flex-1 bg-brand/35" aria-hidden="true" />
                      <span className="rounded-full border border-white/[0.08] px-2.5 py-1 font-mono text-[11px] text-muted">
                        {route.amount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 sm:mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.08]">
                {[
                  ["2", "providers"],
                  ["0", "runtime deps"],
                  ["1", "typed API"],
                ].map(([value, label]) => (
                  <div key={label} className="bg-surface/70 p-2.5 sm:p-3 text-left">
                    <p className="text-lg sm:text-2xl font-semibold text-foreground">{value}</p>
                    <p className="mt-1 text-[10px] sm:text-[11px] font-semibold text-muted">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#080b0e] p-4 sm:p-6 lg:p-7">
              <div className="mb-3 sm:mb-4 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-oxide/80" />
                  <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-amber/80" />
                  <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-brand/80" />
                </div>
                <span className="font-mono text-[11px] sm:text-xs text-muted">payments/index.ts</span>
              </div>

              <div className="-mx-4 sm:-mx-0 overflow-x-auto">
                <pre className="min-w-[480px] sm:min-w-[560px] text-left text-[12px] leading-6 sm:text-[13px] sm:leading-7">
                  <code className="font-mono text-foreground/82">
                    <span className="code-token-keyword">import</span> {"{"} createFallbackClient {"}"} <span className="code-token-keyword">from</span> <span className="code-token-string">"@siyegs/pay-kit"</span>;{"\n\n"}
                    <span className="code-token-keyword">const</span> pay = createFallbackClient({"{"}{"\n"}
                    {"  "}providers: [{"\n"}
                    {"    "}{"{"} provider: <span className="code-token-string">"paystack"</span>, secretKey: PS_KEY {"}"},{"\n"}
                    {"    "}{"{"} provider: <span className="code-token-string">"flutterwave"</span>, secretKey: FLW_KEY {"}"},{"\n"}
                    {"  "}],{"\n"}
                    {"}"});{"\n\n"}
                    <span className="code-token-keyword">const</span> charge = <span className="code-token-keyword">await</span> pay.<span className="code-token-fn">initialize</span>({"{"}{"\n"}
                    {"  "}amount: <span className="code-token-number">500000</span>,{"\n"}
                    {"  "}email: <span className="code-token-string">"customer@example.com"</span>,{"\n"}
                    {"  "}currency: <span className="code-token-string">"NGN"</span>,{"\n"}
                    {"}"});{"\n\n"}
                    <span className="code-token-comment">// Webhooks arrive signed, normalized, and typed.</span>{"\n"}
                    <span className="code-token-keyword">const</span> event = pay.webhooks.<span className="code-token-fn">construct</span>(body, signature);
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
