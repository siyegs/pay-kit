import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    q: "Does pay-kit store my provider keys?",
    a: "No. Keys stay in your environment variables. pay-kit is a library that runs in your process — there is no hosted service, no proxy, and no third party between your backend and the provider.",
  },
  {
    q: "Can I use both Paystack and Flutterwave at the same time?",
    a: "Yes. createFallbackClient accepts both providers. If the primary route fails (network error, 5xx), pay-kit automatically falls through to the next provider without changing your application code.",
  },
  {
    q: "Does pay-kit work with NestJS or Next.js?",
    a: "Yes. pay-kit ships dedicated /nestjs and /next entrypoints. The NestJS module provides InjectPayClient() decorators, and the Next.js adapter handles webhook route parsing with type-safe event models.",
  },
  {
    q: "What currencies and countries are supported?",
    a: "Paystack supports NGN, GHS, ZAR, and USD for cross-border. Flutterwave adds KES, UGX, TZS, RWF, XAF, XOF, and more. Since pay-kit normalizes to subunit amounts, adding a new currency does not require changes to your business logic.",
  },
  {
    q: "Can I mock payments during development?",
    a: "Yes. Pass provider: 'mock' and pay-kit simulates charge, verify, webhook, refund, and transfer flows without real keys. The mock provider is deterministic and works in CI environments.",
  },
  {
    q: "What happens if a provider changes their API?",
    a: "Because pay-kit sits between your code and the provider, an adapter update is the only change needed. Your application code stays the same. The project is MIT licensed, so you can also maintain your own adapter fork.",
  },
];

function FAQItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  const id = q.replace(/\s+/g, "-").toLowerCase().slice(0, 40);

  return (
    <div className="border-b border-white/[0.06] last:border-b-0">
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`faq-answer-${id}`}
        id={`faq-question-${id}`}
        className="flex w-full items-center justify-between gap-4 py-5 text-left text-sm font-semibold text-foreground transition hover:text-brand"
      >
        {q}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-muted"
          aria-hidden="true"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p
              id={`faq-answer-${id}`}
              role="region"
              aria-labelledby={`faq-question-${id}`}
              className="pb-5 text-sm leading-7 text-muted"
            >
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FAQ() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="section-rule py-24 sm:py-32" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="eyebrow text-center">FAQ</p>
          <h2 id="faq-heading" className="text-balance mt-4 text-center text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            Questions teams ask before they install.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-center text-base leading-8 text-muted">
            pay-kit is a library, not a platform. Here is what that means in practice.
          </p>

          <div className="mt-12 rounded-lg border border-white/[0.08] bg-card/60 px-6">
            {faqs.map((faq) => (
              <FAQItem
                key={faq.q}
                q={faq.q}
                a={faq.a}
                open={openId === faq.q}
                onToggle={() => setOpenId(openId === faq.q ? null : faq.q)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
