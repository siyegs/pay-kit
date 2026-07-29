import { motion } from "framer-motion";

interface CodeSnippet {
  title: string;
  code: string;
}

const snippets: CodeSnippet[] = [
  {
    title: "Initialize a charge",
    code: `const { authorizationUrl, reference } = await pay.initialize({
  amount: 500000,       // NGN 5,000.00 (kobo)
  email: "customer@example.com",
  currency: "NGN",
  callbackUrl: "https://your-app.com/pay/callback",
  metadata: { orderId: "order_123" },
});
// -> redirect customer to authorizationUrl`,
  },
  {
    title: "Verify after redirect",
    code: `const result = await pay.verify(reference);
if (result.status === "success") {
  fulfilOrder(result.reference, result.amount);
  // result.authorization — reusable token for
  // saved-card repeat charges
}`,
  },
  {
    title: "Provider fallback",
    code: `const pay = createFallbackClient({
  providers: [
    { provider: "paystack", secretKey: PS_KEY },
    { provider: "flutterwave", secretKey: FLW_KEY },
  ],
});
// Paystack down? Auto-falls through to Flutterwave.
const { reference, provider } = await pay.initialize({
  amount: 500000, email: "a@b.com",
});`,
  },
  {
    title: "Signature-verified webhooks",
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
    title: "Transfers / payouts",
    code: `const payout = await pay.transfer({
  amount: 500000,
  reason: "Creator payout - July",
  recipient: {
    accountNumber: "0001234567",
    bankCode: "058",
    name: "Ada Lovelace",
  },
});
// { reference, status: "pending", transferId }`,
  },
  {
    title: "NestJS module",
    code: `@Module({
  imports: [
    PayKitModule.forRoot({
      provider: "paystack",
      secretKey: process.env.PAYSTACK_SECRET_KEY!,
      isGlobal: true,
    }),
  ],
})
export class AppModule {}

// Inject anywhere:
@InjectPayClient() private readonly pay: PayClient`,
  },
];

export function CodeExample() {
  return (
    <section id="code" className="py-24 sm:py-32" aria-labelledby="codeexample-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-2xl text-center mb-16"
        >
          <h2 id="codeexample-heading" className="text-3xl sm:text-4xl font-bold tracking-tight">
            Simple, <span className="text-brand">predictable</span> API
          </h2>
          <p className="mt-4 text-muted text-lg">
            One pattern across every operation. Learn it once, use it everywhere.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" role="list">
          {snippets.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-border bg-card overflow-hidden group hover:border-brand/30 transition-colors"
              role="listitem"
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface/50">
                <span className="text-xs text-muted font-medium">{s.title}</span>
                <span className="text-[10px] text-muted/40 font-mono">@siyegs/pay-kit</span>
              </div>
              <div className="p-4 overflow-x-auto">
                <pre className="text-[13px] leading-relaxed">
                  <code className="font-mono text-foreground">{s.code}</code>
                </pre>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
