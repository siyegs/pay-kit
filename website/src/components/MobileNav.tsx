import { useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

const links = [
  { label: "Features", href: "#features" },
  { label: "Code", href: "#code" },
  { label: "Compare", href: "#compare" },
];

export function MobileNav({ open, onClose }: MobileNavProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-40 md:hidden"
          onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
        >
          <div className="absolute inset-0 bg-surface/90 backdrop-blur-xl" />
          <nav className="relative flex h-full flex-col items-center justify-center gap-8" role="navigation" aria-label="Mobile navigation">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={onClose}
                className="text-2xl font-semibold text-foreground transition-colors hover:text-brand"
              >
                {link.label}
              </a>
            ))}
            <a
              href="https://github.com/siyegs/pay-kit"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-white/[0.12] bg-white/[0.04] px-6 py-3 text-base font-semibold text-foreground transition hover:border-brand/40 hover:bg-brand/10"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="m12 1.8 3.1 6.3 7 .9-5.1 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9L1.9 9l7-.9z" />
              </svg>
              Star repo
            </a>
          </nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
