# Changelog

All notable changes to `@siyegs/pay-kit` are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **CI and fresh checkouts failed `bun test`.** `scripts/smoke-dist.test.ts`
  imports the built `dist/`, but plain `bun test` runs before any build -
  on CI and in fresh clones the suite errored with "Cannot find module
  '../dist/index.js'". The default `test` script now excludes the dist
  smoke test (it belongs to `test:dist`, which builds first), CI runs the
  build before the tests and exercises the full publish gate
  (`test:dist`, `test:node`, `test:types`), and the publish workflow
  verifies via `prepublishOnly` instead of a partial check.
- **Fastify webhook signatures failed on every valid webhook.** The plugin
  registered only a wildcard `*/*` content-type parser, but Fastify's
  built-in `application/json` parser wins over a wildcard - so webhook
  bodies arrived JSON-parsed and the signature check always failed (401).
  The plugin now registers `application/json` and `text/plain` explicitly
  with `parseAs: "string"`, with the wildcard kept as a fallback. Caught by
  the new real-Fastify-server tests, not by the mock `FastifyLike` interface.
- **Paystack plan responses dropped `duration`.** `mapPlan` never read the
  field even though `Plan` supports it (and Flutterwave maps it); the mock
  provider did return it, so offline tests saw a shape real Paystack
  responses never produced.

### Added
- **Real-framework adapter tests.** The webhook adapters are now exercised
  against actual Express 5, Fastify 5, Hono, and NestJS 11 applications
  booted in-process - valid, tampered, malformed, and throwing webhook
  paths, plus proof that other routes keep normal JSON parsing. The mock
  `Like` interfaces previously hid a real Fastify bug (see Fixed).
- **Node consumer smoke tests (`bun run test:node`).** The built package is
  imported by real `node` (not bun) in both CJS (`node-smoke.cjs`) and ESM
  (`node-smoke.mjs`), covering the main entry and all five subpaths.
- **Published type resolution checks (`bun run test:types`).** `attw --pack .`
  validates the `exports` map and types across node10, node16 CJS, node16
  ESM, and bundler resolution. New per-condition `types` entries and a
  `typesVersions` block make every subpath resolve for both `import` and
  `require` consumers ("No problems found").
- **Edge-response-shape tests.** Non-JSON 4xx/5xx bodies, 429s, empty-body
  401s, provider app-level failures on HTTP 200 (`status: false` /
  `status: "error"`), `data: null`, empty arrays, missing fields, and
  malformed JSON on 200 - plus fallback failover on retryable errors and
  no failover on non-retryable ones.
- **Mock-provider parity tests.** Every field the mock returns for an
  operation must appear under the same key with the same value type in the
  real providers' results (the mock may omit optional fields, never add or
  retype them). Asymmetries are locked in reverse: Flutterwave's
  `accessCode`-free initialize and Paystack's minimal
  `cancelSubscription`/`enableSubscription` shapes must be covered by the
  mock's.
- **Live fallback drill (`bun run fallback-drill`).** With real test keys,
  runs one provider against a dead base URL while the other is live, both
  directions, and both-dead - proving failover picks the healthy provider
  and both-dead surfaces a retryable `network_error`. All three scenarios
  verified live.
- **Dist-consumption smoke test (`bun run test:dist`).** Imports the built
  package (not source) and exercises every public entry point - the main
  entry plus `/express`, `/hono`, `/fastify`, `/next`, `/nestjs` - in both
  ESM and CJS, including a mock init/verify lifecycle, webhook verification
  through every adapter, and a fallback client against dead endpoints. A
  broken `exports` map or ESM/CJS interop issue now fails the test instead
  of shipping; `prepublishOnly` runs it automatically.
- **Live plan lifecycle checks in the integration harness.** `bun run
  integration` now creates, fetches, updates, and cancels a test-mode plan
  per provider (Paystack's expected `unsupported` on `cancelPlan` counts as
  a pass). Verified live against both sandboxes: Flutterwave's full
  create -> fetch -> update -> cancel cycle (including subunit/major-unit
  conversion), and Paystack's create/fetch/update + `unsupported` cancel.
- **Plans & subscriptions (recurring billing).** `createPlan`, `listPlans`,
  `fetchPlan`, `updatePlan`, `cancelPlan`, `createSubscription`,
  `listSubscriptions`, `fetchSubscription`, `cancelSubscription`, and
  `enableSubscription` work across Paystack, Flutterwave, and the mock
  provider with a canonical shape: amounts in subunits, `interval` as
  `monthly`/`weekly`/`yearly`/`biannually`/etc., one `Plan`/`Subscription`
  type. Provider differences are handled internally: Paystack maps `yearly`
  to `annually`, requires a plan `amount`, and starts subscriptions directly
  (returning the `emailToken` that cancel/enable need - both throw
  `config_error` without it) - its `cancelPlan` throws code `"unsupported"`
  because no cancel endpoint exists. Flutterwave maps `biannually` to
  `bi-annually`, converts amounts to major units, allows amount-less dynamic
  plans, keys plans by a numeric id (`initialize({ plan })` rejects
  non-numeric ids with `config_error`), and starts subscriptions through a
  plan-carrying charge (`createSubscription` throws `"unsupported"`). The
  integration harness gained read-only `listPlans`/`listSubscriptions` soft
  checks.
- **Express / Hono / Fastify webhook adapters.** `@siyegs/pay-kit/express`
  (`webhookMiddleware`), `@siyegs/pay-kit/hono` (`webhookHandler`), and
  `@siyegs/pay-kit/fastify` (`webhookPlugin`) all read the raw request bytes
  themselves (the signature footgun), verify, dispatch the normalized event,
  and reply 401/400/500/200 - with zero dependencies on the frameworks at
  runtime (structural typing only, like the existing `/next` and `/nestjs`
  subpaths). The Fastify plugin registers its catch-all raw-body parser in an
  encapsulated plugin scope so other routes keep default parsing. Each adapter
  also exports a `constructWebhookFromRequest`-style helper.

## [0.10.1] - 2026-07-26

### Fixed
- **Flutterwave payout webhooks now normalize correctly.** A `transfer.*`
  delivery carries `reference` (not `tx_ref`) and an upper-cased status
  (`SUCCESSFUL`/`FAILED`), so it previously fell through the charge mapping and
  came out as an empty `unknown` event. The adapter now branches on the event
  name, maps payouts to `transfer.success`/`transfer.failed`, and reads status
  case-insensitively. Reported by @arowolodaniel (#1).

## [0.10.0] - 2026-07-26

### Added
- **Typed webhook events.** `WebhookEvent` is now a discriminated union
  (`ChargeSuccessEvent`, `ChargeFailedEvent`, `TransferSuccessEvent`,
  `TransferFailedEvent`, and an open `OtherWebhookEvent` for Paystack's
  pass-through event names), with exported type guards `isChargeSuccess`,
  `isChargeFailed`, `isTransferSuccess`, `isTransferFailed` for precise
  narrowing. Non-breaking: every variant keeps the previous
  `reference`/`status`/`amount`/`currency`/`raw` fields.
- **`@siyegs/pay-kit/nestjs` module.** `PayKitModule.forRoot(config)` /
  `forRootAsync({ inject, useFactory })` registers a configured `PayClient` in
  the NestJS DI container; inject it with `@InjectPayClient()`. `@nestjs/common`
  is an optional peer dependency (only pulled in if you use this import), and the
  module is decorator-free so pay-kit needs no `experimentalDecorators` build.
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

[Unreleased]: https://github.com/siyegs/pay-kit/compare/v0.10.1...HEAD
[0.10.1]: https://github.com/siyegs/pay-kit/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/siyegs/pay-kit/compare/v0.9.1...v0.10.0
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
