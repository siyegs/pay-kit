import { Link } from "@tanstack/react-router";
import { Head } from "../components/Head";
import { PageTransition } from "../components/PageTransition";

export function NotFound() {
  return (
    <PageTransition>
      <Head title="404 — Page not found" path="/404" />
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-6 text-center">
        <div className="flex items-center gap-4">
          <span className="font-mono text-8xl font-bold text-brand/20">4</span>
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-brand/20 bg-brand/5">
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M13 11h6v10h-6z" fill="#8bffca" opacity="0.6" />
              <path d="M19 14l3 3-3 3" fill="none" stroke="#8bffca" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
            </svg>
          </div>
          <span className="font-mono text-8xl font-bold text-brand/20">4</span>
        </div>
        <h1 className="text-balance text-3xl font-semibold text-foreground sm:text-4xl">
          Page not found
        </h1>
        <p className="max-w-md text-base leading-7 text-muted">
          The page you are looking for might have been removed, renamed, or is temporarily unavailable.
        </p>
        <Link
          to="/"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-foreground px-5 text-sm font-bold text-surface transition hover:bg-brand"
        >
          Go back home
        </Link>
      </div>
    </PageTransition>
  );
}
