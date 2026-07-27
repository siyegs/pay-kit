# Contributing to pay-kit

Thanks for your interest in improving pay-kit. Bug reports, provider-accuracy
fixes, and new capabilities are all welcome.

## Development setup

pay-kit uses the [Bun](https://bun.sh) toolchain.

```bash
bun install          # install deps
bun test             # run the test suite (bun:test, mocked fetch)
bun run typecheck    # tsc --noEmit
bun run build        # tsup -> dist (ESM + CJS + .d.ts)
```

Please make sure `bun run typecheck`, `bun test`, and `bun run build` all pass
before opening a pull request. CI runs the same three on every push and PR.

## Verifying against real providers

Unit tests use a mocked `fetch`. To check a change against the **real** Paystack /
Flutterwave test sandboxes, copy `.env.example` to `.env`, add your TEST secret
keys, and run:

```bash
bun run integration
```

`.env` is gitignored - never commit keys. If a call does not match a provider's
live behavior, that is exactly the kind of fix we want.

## Guidelines

- **Amounts are always subunits** (kobo/cents) at the pay-kit boundary. Convert
  to a provider's units inside its adapter, never in shared code.
- **Keep the API unified.** A method should behave the same across providers; put
  provider-specific quirks inside the adapter and surface differences as clear
  `PayKitError`s or documented options.
- **Add tests** for new behavior - a unit test with a mocked response, and an
  integration step in `scripts/integration.ts` where it makes sense.
- **One concern per commit.** Conventional-commit messages (`feat:`, `fix:`,
  `docs:`, `test:`, `chore:`) are appreciated.
- Update the `README`, `CHANGELOG.md`, and types when you change the public API.

## Adding a payment provider

New providers are welcome, but a payments library carries a higher bar than a
normal dependency: merging an adapter means pay-kit is effectively vouching for
routing real money through that provider. So a provider PR is reviewed on trust,
not only on code quality:

- **The provider must be independently verifiable.** A public, stable API
  reference, a real registered company, and ideally live merchants using it. A
  brand-new domain whose only references are its own docs will be declined.
- **It must be verifiable the same way the others are** - runnable against a real
  test sandbox via `bun run integration`, so its behavior can be confirmed rather
  than taken on faith. Adapters written only against documentation cannot be
  marked "verified".
- **Disclose any affiliation.** If you work on or with the provider, say so in the
  PR. That is fine - it just changes how it is reviewed and labelled.
- Until an adapter clears that bar it may be declined, or accepted only behind a
  clear **community-contributed, not maintainer-verified** label so users know
  exactly what they are getting.
- Cover the same surface the other adapters do (or throw a clear `PayKitError`
  for what is not supported), and follow the guidelines above.

This is about protecting the people who trust pay-kit with their payment flow, not
about gatekeeping - genuinely useful providers are wanted.

## Reporting bugs

Open an issue with the provider, the method, a minimal reproduction, and what you
expected vs. what happened. Never paste live secret keys. See [SECURITY.md](./SECURITY.md)
for anything sensitive.
