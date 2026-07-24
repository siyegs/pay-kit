# Changelog

All notable changes to `@siyegs/pay-kit` are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/siyegs/pay-kit/compare/v0.8.1...HEAD
[0.8.1]: https://github.com/siyegs/pay-kit/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/siyegs/pay-kit/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/siyegs/pay-kit/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/siyegs/pay-kit/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/siyegs/pay-kit/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/siyegs/pay-kit/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/siyegs/pay-kit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/siyegs/pay-kit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/siyegs/pay-kit/releases/tag/v0.1.0
