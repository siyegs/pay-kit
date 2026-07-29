import { Helmet } from "react-helmet-async";

interface HeadProps {
  title?: string;
  description?: string;
  path?: string;
}

const SITE_NAME = "pay-kit";
const BASE_URL = "https://pay-kit.dev";
const DEFAULT_DESC =
  "One typed SDK for African payment rails — Paystack & Flutterwave. Charge, verify, refund, transfer, and normalize webhooks from your own backend.";

export function Head({ title, description, path = "/" }: HeadProps) {
  const fullTitle = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — One SDK for African Payment Rails`;
  const url = `${BASE_URL}${path}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description ?? DEFAULT_DESC} />
      <link rel="canonical" href={url} />

      <meta property="og:type" content="website" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description ?? DEFAULT_DESC} />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content={SITE_NAME} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description ?? DEFAULT_DESC} />

      <meta name="theme-color" content="#07090b" />
    </Helmet>
  );
}
