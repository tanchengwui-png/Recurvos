# 08 Task Template

Use this workflow for future Codex tasks in this repository.

## Standard Process

1. Read `README_AI.md` and then read `docs/01` through `docs/07` in order.
2. Summarize business logic and architecture understanding.
3. List assumptions explicitly.
4. Identify impacted files before editing.
5. Explain the implementation plan.
6. Make minimal safe changes.
7. Verify with the smallest meaningful checks.
8. Report exact files changed.
9. Mention risks, follow-up work, and anything needing confirmation.

## Required Pre-Implementation Summary

Before changing code, provide:

- the user-visible behavior being changed
- the backend/frontend modules involved
- the relevant business rules
- the exact files likely to be touched
- any uncertainty marked as `Needs confirmation`

## Change Guidelines

- Prefer updating existing code paths over introducing new parallel flows
- Reuse existing services/helpers if they already own the behavior
- Preserve feature gating, audit behavior, and tenant boundaries
- Keep controller changes minimal unless the API shape truly changes
- Do not refactor broadly unless required by the task

## Final Report Template

Use a concise close-out that includes:

- what changed
- which files changed
- how it was verified
- assumptions made
- risks or follow-up items

## If The Task Touches Billing Logic

Also confirm:

- invoice status behavior
- payment status behavior
- reminder side effects
- package feature gating
- whether the change affects tenant billing, platform package billing, or both
