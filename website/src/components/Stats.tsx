import type { Stat } from "../types";

const stats: Stat[] = [
  { value: "2", label: "provider adapters", detail: "Paystack and Flutterwave behind one client" },
  { value: "0", label: "runtime dependencies", detail: "native fetch and node:crypto only" },
  { value: "100%", label: "typed surface", detail: "responses, webhooks, and errors" },
  { value: "3", label: "app adapters", detail: "core, NestJS, and Next.js entrypoints" },
];

export function Stats() {
  return (
    <section className="section-rule py-16" aria-labelledby="stats-heading">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 id="stats-heading" className="sr-only">pay-kit by the numbers</h2>
        <div className="grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-card/80 p-6">
              <p className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{stat.value}</p>
              <p className="mt-3 text-sm font-bold text-brand">{stat.label}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{stat.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
