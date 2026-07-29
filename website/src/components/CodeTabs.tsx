import { useState } from "react";
import type { CodeSnippet } from "../types";

const snippets: CodeSnippet[] = [
  {
    id: "initialize",
    label: "Charge",
    note: "Create a provider checkout session with the same call shape.",
    code: `const { authorizationUrl, reference } = await pay.initialize({
  amount: 500000,
  email: "customer@example.com",
  currency: "NGN",
  callbackUrl: "https://your-app.com/pay/callback",
  metadata: { orderId: "order_123" },
});`,
  },
  {
    id: "verify",
    label: "Verify",
    note: "Handle success and failure without provider-specific branching.",
    code: `const result = await pay.verify(reference);

if (result.status === "success") {
  fulfilOrder(result.reference, result.amount);
} else {
  handleFailedPayment(result.reference);
}`,
  },
  {
    id: "fallback",
    label: "Fallback",
    note: "Try the next configured provider when the first route fails.",
    code: `const pay = createFallbackClient({
  providers: [
    { provider: "paystack", secretKey: PS_KEY },
    { provider: "flutterwave", secretKey: FLW_KEY },
  ],
});

const { reference, provider } = await pay.initialize({
  amount: 500000,
  email: "customer@example.com",
});`,
  },
  {
    id: "webhooks",
    label: "Webhooks",
    note: "Verify signatures and consume one normalized event type.",
    code: `app.post("/webhooks/pay", express.raw({ type: "*/*" }), (req, res) => {
  const sig = req.header("x-paystack-signature")
           ?? req.header("verif-hash") ?? "";

  const event = pay.webhooks.construct(req.body, sig);

  if (event.type === "charge.success") {
    fulfilOrder(event.reference, event.amount);
  }

  res.sendStatus(200);
});`,
  },
  {
    id: "transfer",
    label: "Payout",
    note: "Move payouts through the same client surface.",
    code: `const payout = await pay.transfer({
  amount: 500000,
  reason: "Creator payout - July",
  recipient: {
    accountNumber: "0001234567",
    bankCode: "058",
    name: "Ada Lovelace",
  },
});`,
  },
  {
    id: "nestjs",
    label: "NestJS",
    note: "Register once, inject wherever payment work happens.",
    code: `@Module({
  imports: [PayKitModule.forRoot({
    provider: "paystack",
    secretKey: process.env.PAYSTACK_SECRET_KEY!,
    isGlobal: true,
  })],
})
export class AppModule {}

@InjectPayClient() private readonly pay: PayClient`,
  },
];

export function CodeTabs() {
  const [active, setActive] = useState(snippets[0].id);
  const activeSnippet = snippets.find((s) => s.id === active) ?? snippets[0];

  return (
    <section id="code" className="section-rule py-24 sm:py-32" aria-labelledby="code-heading">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-16">
          <div>
            <p className="eyebrow">API surface</p>
            <h2 id="code-heading" className="text-balance mt-4 max-w-xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
              Learn one payment shape. Keep it everywhere.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-8 text-muted">
              The SDK narrows provider differences into predictable TypeScript results,
              so product code stays readable after the second provider arrives.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08]" role="tablist" aria-label="Code example tabs">
              {snippets.map((snippet) => (
                <button
                  key={snippet.id}
                  onClick={() => setActive(snippet.id)}
                  role="tab"
                  aria-selected={active === snippet.id}
                  aria-controls={`code-panel-${snippet.id}`}
                  id={`code-tab-${snippet.id}`}
                  className={`min-h-14 bg-card/90 px-4 text-left text-sm font-semibold transition ${
                    active === snippet.id
                      ? "text-brand"
                      : "text-muted hover:bg-[#121a20] hover:text-foreground"
                  }`}
                >
                  {snippet.label}
                </button>
              ))}
            </div>
          </div>

          <div className="premium-shell rounded-lg" role="tabpanel" id={`code-panel-${activeSnippet.id}`} aria-labelledby={`code-tab-${activeSnippet.id}`}>
            <div className="relative border-b border-white/[0.08] bg-white/[0.035] px-5 py-4">
              <p className="font-mono text-xs text-muted">examples/{activeSnippet.id}.ts</p>
              <p className="mt-2 text-sm font-medium text-foreground">{activeSnippet.note}</p>
            </div>
            <div className="relative overflow-x-auto p-5 sm:p-6">
              <pre className="min-h-[270px] min-w-[560px] text-[13px] leading-7 sm:text-sm">
                <code className="font-mono text-foreground/82">{activeSnippet.code}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
