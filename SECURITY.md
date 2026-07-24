# Security Policy

pay-kit handles money movement, so security reports are taken seriously.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.** Instead, use GitHub's
private [Report a vulnerability](https://github.com/siyegs/pay-kit/security/advisories/new)
flow, or email the maintainer. You will get an acknowledgement, and a fix or
mitigation will be prioritized.

Please include the affected version, a description, and a reproduction if possible.

## Secret keys

- pay-kit is **server-side only**. Never ship a provider secret key to the browser
  or a mobile bundle.
- Keep keys in environment variables / a secrets manager, never in source control.
- Rotate a key immediately if it is ever exposed (a commit, a log, a screenshot,
  a support chat).

## Webhooks

Always verify a webhook signature before trusting its body - `pay.webhooks.construct(rawBody, signature)`
does this and throws `PayKitError("invalid_signature")` on mismatch. Pass the
**raw** request body (not a re-serialized object), or signature verification will
fail.
