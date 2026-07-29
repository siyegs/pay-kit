const items = [
  "Paystack",
  "Flutterwave",
  "Mock Provider",
  "NGN",
  "GHS",
  "KES",
  "ZAR",
  "UGX",
  "Paystack",
  "Flutterwave",
  "Mock Provider",
  "NGN",
  "GHS",
  "KES",
  "ZAR",
  "UGX",
];

export function Marquee() {
  return (
    <section className="section-rule pt-28 pb-14" aria-label="Supported payment rails">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <p className="eyebrow">Current rails</p>
          <p className="max-w-xl text-sm leading-6 text-muted">
            Provider support is explicit and boring by design: same surface, same units,
            same error shape.
          </p>
        </div>
      </div>
      <div className="gradient-mask overflow-hidden">
        <div className="flex gap-3 animate-marquee" style={{ width: "max-content" }} aria-hidden="true">
          {items.map((item, i) => (
            <div
              key={`${item}-${i}`}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.035] px-4"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-brand/70" aria-hidden="true" />
              <span className="text-sm font-semibold text-muted whitespace-nowrap">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
