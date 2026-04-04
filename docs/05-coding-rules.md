# 05 Coding Rules

## Core Expectations

- Follow the existing architecture
- Prefer minimal safe changes
- Do not rename or restructure modules unnecessarily
- Keep controllers thin
- Put business logic in the correct service/layer
- Avoid duplicating logic already present in another service
- Preserve production-safe behavior for billing, payments, and auth
- Keep package/feature gating intact
- Respect tenant isolation and platform-owner separation

## Before Implementing

Before implementing, summarize understanding and impacted files.

That summary should include:

- business flow you believe is being changed
- relevant status rules
- assumptions
- exact files likely to change

## File Placement Rules

- Domain shape changes belong in `src/Recurvos.Domain`
- DTOs/contracts/validators belong in `src/Recurvos.Application`
- Runtime business behavior belongs in `src/Recurvos.Infrastructure/Services`
- HTTP mapping belongs in `src/Recurvos.Api/Controllers`
- Scheduled behavior belongs in `src/Recurvos.Infrastructure/Jobs`
- UI screens live under `src/Recurvos.Web/src/pages`

## Safety Rules

- Do not bypass billing readiness checks unless explicitly required
- Do not remove audit writes from sensitive flows without good reason
- Do not change numbering, tax, or payment state logic casually
- Do not mix tenant invoice logic with platform package invoice logic
- Do not assume a feature is available without checking entitlements
- Do not broaden payment/provider support in one place without checking all dependent flows

## Consistency Rules

- Prefer consistency with current service patterns over introducing new abstractions
- Reuse existing helpers where possible
- Keep error messages user-safe and explicit
- Follow current enum/status naming instead of inventing alternate labels
- Keep storage path handling consistent with `StoragePathResolver` and existing save/read helpers

## Documentation / Reporting Rules

- Document assumptions in the response
- Report exact files changed
- Mark temporary workarounds clearly
- Call out `Needs confirmation` when business intent is unclear
- If behavior is inferred from tests or service implementation, say so

## Testing / Verification Rules

- Verify at the smallest meaningful scope first
- Prefer existing integration tests and build commands already used by the repo
- If you cannot run a verification step, state that explicitly

## Anti-Patterns To Avoid

- Large refactors for small fixes
- Moving logic into UI when backend already owns it
- Duplicating status resolution logic without strong reason
- Hardcoding package behavior in UI only
- Ignoring recent migrations or integration tests when touching billing areas
