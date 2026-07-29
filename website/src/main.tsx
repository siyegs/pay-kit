import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter, createRootRoute, createRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { Home } from "./pages/Home";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const NotFound = lazy(() => import("./pages/NotFound").then((m) => ({ default: m.NotFound })));

const rootRoute = createRootRoute({
  component: Home,
  notFoundComponent: () => (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-surface text-muted">Loading...</div>}>
      <NotFound />
    </Suspense>
  ),
});
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => null });
const routeTree = rootRoute.addChildren([indexRoute]);
const router = createRouter({ routeTree });
const queryClient = new QueryClient();

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HelmetProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ErrorBoundary>
    </HelmetProvider>
  </StrictMode>
);
