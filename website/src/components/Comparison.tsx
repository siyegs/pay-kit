const rows = [
  { feature: "Where it runs", paykit: "Inside your backend", gateway: "Behind another hosted service" },
  { feature: "Money path", paykit: "App to provider, directly", gateway: "App to gateway to provider" },
  { feature: "Keys", paykit: "Your own provider keys", gateway: "Often their account model" },
  { feature: "Failure point", paykit: "Provider availability only", gateway: "Gateway availability plus provider availability" },
  { feature: "Data", paykit: "Stays in your stack", gateway: "Passes through a third party" },
  { feature: "Exit cost", paykit: "MIT code you can fork", gateway: "A migration project" },
];

export function Comparison() {
  return (
    <section id="compare" className="section-rule py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">The choice</p>
          <h2 className="text-balance mt-4 text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            Use a gateway when you want a platform. Use pay-kit when you want control.
          </h2>
          <p className="mt-5 text-base leading-8 text-muted">
            pay-kit does not become a business dependency in your transaction path.
            It gives your code a provider abstraction and gets out of the way.
          </p>
        </div>

        <div className="premium-shell mx-auto mt-12 max-w-5xl overflow-x-auto rounded-lg">
          <div className="min-w-[680px]">
            <div className="relative grid grid-cols-[0.8fr_1fr_1fr] border-b border-white/[0.08] bg-white/[0.035] text-sm">
              <div className="px-4 py-4 text-muted sm:px-6" />
              <div className="px-4 py-4 font-bold text-brand sm:px-6">pay-kit</div>
              <div className="px-4 py-4 font-bold text-muted sm:px-6">hosted gateway</div>
            </div>
            {rows.map((row) => (
              <div key={row.feature} className="relative grid grid-cols-[0.8fr_1fr_1fr] border-b border-white/[0.06] last:border-b-0">
                <div className="px-4 py-4 text-sm font-semibold text-muted sm:px-6">{row.feature}</div>
                <div className="px-4 py-4 text-sm leading-6 text-foreground sm:px-6">{row.paykit}</div>
                <div className="px-4 py-4 text-sm leading-6 text-muted sm:px-6">{row.gateway}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
