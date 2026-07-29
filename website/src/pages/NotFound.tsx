import { Link } from "@tanstack/react-router";
import { Head } from "../components/Head";

export function NotFound() {
  return (
    <>
      <Head title="404 — Page not found" path="/404" />
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-6 text-center">
        <span className="font-mono text-8xl font-bold text-brand/30">404</span>
        <h1 className="text-balance text-3xl font-semibold text-foreground sm:text-4xl">
          This route does not exist
        </h1>
        <p className="max-w-md text-base leading-7 text-muted">
          The page you are looking for might have been removed or is temporarily unavailable.
        </p>
        <Link
          to="/"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-foreground px-5 text-sm font-bold text-surface transition hover:bg-brand"
        >
          Go back home
        </Link>
      </div>
    </>
  );
}
