const features = [
  {
    title: "Provider switching without rewrites",
    desc: 'Change "paystack" to "flutterwave" and keep the same calls, result shapes, and TypeScript contracts.',
    accent: "bg-brand",
  },
  {
    title: "Subunit amounts by default",
    desc: "Amounts stay in kobo, cents, and equivalent subunits so rounding bugs do not enter the payment path.",
    accent: "bg-amber",
  },
  {
    title: "Webhooks normalized at the edge",
    desc: "Paystack HMAC-SHA512 and Flutterwave verif-hash become one typed event model for your app.",
    accent: "bg-blue",
  },
  {
    title: "One failure language",
    desc: "PayKitError gives every provider failure a machine-readable code, so handlers stay explicit.",
    accent: "bg-oxide",
  },
  {
    title: "A library, not a toll booth",
    desc: "Calls go from your backend to the provider with your keys. No hosted proxy, no extra account layer.",
    accent: "bg-brand",
  },
  {
    title: "Local flows without real keys",
    desc: "The mock provider exercises charge, verify, webhook, and payout paths in CI and local development.",
    accent: "bg-amber",
  },
];

export function Features() {
  return (
    <section id="features" className="section-rule py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
          <div>
            <p className="eyebrow">Why teams install it</p>
            <h2 className="text-balance mt-4 max-w-xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
              Payment code that behaves like infrastructure.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-8 text-muted">
              pay-kit keeps provider differences at the boundary, so your app can
              model payment behavior once and keep shipping.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2">
            {features.map((feature) => (
              <article key={feature.title} className="bg-card/95 p-6 transition hover:bg-[#121a20]">
                <span className={`block h-1 w-8 rounded-full ${feature.accent}`} />
                <h3 className="mt-5 text-lg font-semibold leading-6 text-foreground">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted">{feature.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
