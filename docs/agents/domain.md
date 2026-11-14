# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root, or
- **`GLOSSARY-MAP.md`** at the repo root if it exists: it points at one `GLOSSARY.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved, and only after the user confirms (see **Writing to the glossary and ADRs** below).

## File structure

Single-context repo (this repo):

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-three-balance-cards.md
│   ├── 0002-reserved-is-a-pre-payday-holdback.md
│   └── …
└── src/
```

Per-feature _how-it-works_ lives in `docs/features/*/OVERVIEW.md` (see the root `CLAUDE.md`'s Documentation map); the root `GLOSSARY.md` + `docs/adr/` are the canonical home for domain _why_ (they replaced the old per-feature `CONTEXT.md` files, #13).

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0004 (upcoming charges project at read time), but worth reopening because…_

## Writing to the glossary and ADRs

Never edit `GLOSSARY.md` or a `docs/adr/*` file directly, even when a skill says to update them inline as terms are resolved. Propose the exact change in the conversation (the new or changed glossary entry, or the full ADR text) and write it only after the user explicitly confirms. These are the only markdown files that need confirmation; all other markdown can be edited directly (root `CLAUDE.md`, *Engineering standards & working agreement*).

`GLOSSARY.md` changes need an actual discussion, not a finished entry for the user to approve. Ask what the term should mean in your own words, settle it together, then propose the entry.

## Citing ADRs in public places

`GLOSSARY.md` and `docs/agents/` are in git. The rest of `docs/` (including `docs/adr/` and `docs/features/`) is gitignored and exists only locally, so someone reading the public repo can't open an ADR.

ADR numbers are still the stable way to refer to a decision, and you can cite them anywhere: issues, PRs, commit messages, code comments. Wherever the reader may only have the public repo, state the decision itself next to the number so the sentence makes sense without the file:

> Detection is on-demand and suggest-only (ADR-0016).

Not: _See ADR-0016._
