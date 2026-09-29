# Domain Docs

## Before exploring, read these

- `CONTEXT.md` at the repo root
- `docs/adr/` for decisions affecting the area being changed

If either is absent, proceed silently.

## Use the glossary's vocabulary

Use terms defined in `CONTEXT.md` in issue titles, proposals, hypotheses, and test names. Do not replace glossary terms with synonyms it explicitly avoids.

If a required concept is missing, note the gap for domain modeling rather than silently inventing terminology.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, state the contradiction explicitly instead of silently overriding it.

## Layout

This is a single-context repository:

- `CONTEXT.md` contains the domain glossary
- `docs/adr/` contains repository-wide architectural decisions
- `src/` contains the application
