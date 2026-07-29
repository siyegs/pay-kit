import { motion } from "framer-motion";

const providers = [
  {
    name: "Paystack",
    color: "text-[#0ba95b]",
    border: "border-[#0ba95b]/20",
    bg: "bg-[#0ba95b]/5",
  },
  {
    name: "Flutterwave",
    color: "text-[#1dbf73]",
    border: "border-[#1dbf73]/20",
    bg: "bg-[#1dbf73]/5",
  },
  {
    name: "Mock",
    color: "text-muted",
    border: "border-border",
    bg: "bg-card/50",
  },
  {
    name: "Paystack",
    color: "text-[#0ba95b]",
    border: "border-[#0ba95b]/20",
    bg: "bg-[#0ba95b]/5",
  },
  {
    name: "Flutterwave",
    color: "text-[#1dbf73]",
    border: "border-[#1dbf73]/20",
    bg: "bg-[#1dbf73]/5",
  },
];

export function ProviderLogos() {
  return (
    <section className="py-16 border-y border-border/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm text-muted mb-8 font-medium tracking-wide uppercase">
          Supported providers
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {providers.slice(0, 3).map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`inline-flex items-center gap-2.5 rounded-xl border ${p.border} ${p.bg} px-5 py-3`}
            >
              <div className={`h-2.5 w-2.5 rounded-full ${i === 2 ? "bg-muted" : "bg-current"} ${p.color.replace("text-", "")}`} />
              <span className={`text-sm font-semibold ${p.color}`}>{p.name}</span>
            </motion.div>
          ))}
        </div>
        <p className="text-center text-xs text-muted/60 mt-6">
          Paystack &amp; Flutterwave &mdash; swap providers by changing one line. No code changes.
        </p>
      </div>
    </section>
  );
}
