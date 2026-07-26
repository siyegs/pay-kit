# Changelog

All notable changes to `@siyegs/pay-kit` are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`@siyegs/pay-kit/next` webhook adapter.** `webhookRoute(client, { onEvent })`
  returns a Web-standard `(request) => Response` handler you can export as `POST`
  from a Next.js App Router route (or use in Remix, Hono, Cloudflare Workers,
  Deno, Bun). It reads the raw body (the signature footgun), verifies, dispatches
  the normalized event, and replies 401/400/500/200. `constructWebhookFromRequest`
  is the lower-level helper for custom handling.
- **Per-request timeouts.** Every provider call is now bounded by a timeout
  (default 30s, configurable via `timeout` on `createPayClient` /
  `createFallbackClient`, `0` disables) so a hung connection can't block the
  caller forever. A timed-out request throws `PayKitError` with code `"timeout"`,
  which a fallback client treats as an outage and retries on the next provider.

## [0.9.1] - 2026-07-25

### Fixed
- **Flutterwave webhooks: parse the flat legacy payload.** Flutterwave delivers
  two webhook shapes - the newer `{ event, data: {...} }` and a flat legacy
  payload (`txRef`/`amount`/`status` at the top level). The parser only handled
  the nested shape, so real deliveries verified their signature but normalized to
  an empty event. It now reads from `data` when present and falls back to the
  flat root (accepting both `tx_ref` and `txRef`). Caught by verifying an actual
  live delivery captured from the dashboard.

## [0.9.0] - 2026-07-25

### Added
- **`createSubaccount(params)`** creates a connected subaccount for marketplace
  splits and returns its provider id (Paystack `subaccount_code` / Flutterwave
  `subaccount_id`) to pass as `SplitConfig.subaccount`. `percentageCharge`
  (0-100) maps to Paystack's `percentage_charge` and Flutterwave's `percentage`
  split; Flutterwave requires `email`.
- `bun run scripts/verify-charge.ts` - a two-phase harness that verifies the
  paid-charge methods (`refund`, `chargeAuthorization`), webhook signatures, and
  subaccount creation against the real sandboxes after you complete one test
  payment.

### Fixed
- **Flutterwave `chargeAuthorization` now requires `callbackUrl`.** Flutterwave's
  tokenized-charge endpoint rejects a re-charge without a `redirect_url`; the SDK
  previously omitted it, so every Flutterwave saved-card charge failed with a
  cryptic "Please enter a valid redirect url". `ChargeAuthorizationParams` gains
  an optional `callbackUrl` (required for Flutterwave, ignored by Paystack).
  Caught by live-sandbox verification.

## [0.8.2] - 2026-07-24

### Added
- Project docs: `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, and issue/PR
  templates.
- Runnable [`examples/`](./examples) (checkout, fallback, Express webhook).
- **Automated npm publishing** via GitHub Releases (npm Trusted Publishing / OIDC
  with provenance) - see `.github/workflows/publish.yml`.
- Weekly live-sandbox integration workflow (`.github/workflows/integration.yml`).

_No runtime code changes - documentation and release tooling only._

## [0.8.1] - 2026-07-24

### Fixed
- **Flutterwave `initialize` now requires `callbackUrl`.** Flutterwave's hosted
  checkout mandates a `redirect_url`; pay-kit previously only sent it when
  `callbackUrl` was provided, so a call without it failed with a cryptic
  "required parameters missing". pay-kit now throws a clear `config_error` up
  front, and `callbackUrl` is documented as required for Flutterwave (optional
  for Paystack). Caught by the new live-sandbox harness.

### Added
- `bun run integration` - a live-sandbox test harness that runs the SDK against
  the real Paystack / Flutterwave test sandboxes (keys from a gitignored `.env`),
  distinguishing real path/field mismatches from transient network errors.

## [0.8.0] - 2026-07-23

### Added
- **Marketplace splits.** `initialize({ split })` routes part of a charge to a
  connected subaccount, mapped to Paystack's `subaccount`/`transaction_charge`/
  `bearer` and Flutterwave's `subaccounts` array.

## [0.7.0] - 2026-07-23

### Added
- **Saved-card / tokenized recurring charge.** `chargeAuthorization(params)`
  charges a returning customer with no redirect (Paystack `charge_authorization`,
  Flutterwave tokenized charge). `verify()` now exposes a reusable `authorization`
  token (Paystack `authorization_code` / Flutterwave card `token`).

## [0.6.0] - 2026-07-23

### Added
- **Balances & reconciliation.** `getBalances()` returns wallet balance(s) per
  currency in subunits; `listTransactions(options?)` returns paginated,
  normalized transaction history.

## [0.5.0] - 2026-07-13

### Added
- **`verifyTransfer(transferId)`** - check a payout's asynchronous final state,
  keyed uniformly off the `transferId` returned by `transfer()`.

## [0.4.0] - 2026-07-13

### Added
- **Keyless mock provider.** `createPayClient({ provider: "mock" })` runs a full
  payment flow in memory with no API keys and no network - stateful per client.
  `secretKey` is now optional in `PayClientConfig` (ignored for the mock).

## [0.3.0] - 2026-07-13

### Added
- **Account resolution & bank list.** `resolveAccount({ accountNumber, bankCode })`
  confirms an account holder's name before payout; `listBanks({ country })`
  returns the provider's supported banks.

## [0.2.0] - 2026-07-13

### Added
- **Transfers / payouts.** `transfer(params)` sends a payout to a bank account
  (Paystack creates a recipient then sends; Flutterwave sends inline). On a
  fallback client, `transfer` is single-provider by design (no auto-retry, to
  avoid double payouts).

## [0.1.0] - 2026-07-12

### Added
- Initial release: one typed SDK over **Paystack** and **Flutterwave** with
  `initialize`, `verify`, `refund` (full & partial), signature-verified webhooks,
  and automatic provider fallback (`createFallbackClient`). Subunit-canonical
  amounts, `PayKitError` with machine-readable codes, ESM + CJS, Bun toolchain.

[Unreleased]: https://github.com/siyegs/pay-kit/compare/v0.9.1...HEAD
[0.9.1]: https://github.com/siyegs/pay-kit/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/siyegs/pay-kit/compare/v0.8.2...v0.9.0
[0.8.2]: https://github.com/siyegs/pay-kit/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/siyegs/pay-kit/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/siyegs/pay-kit/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/siyegs/pay-kit/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/siyegs/pay-kit/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/siyegs/pay-kit/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/siyegs/pay-kit/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/siyegs/pay-kit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/siyegs/pay-kit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/siyegs/pay-kit/releases/tag/v0.1.0
