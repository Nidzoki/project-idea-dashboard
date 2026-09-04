# Copilot instructions

## Project intent

Idea Atlas is a noncommercial, static React gift for developers. Preserve the
existing UI visual system and do not add company, sales, account, paywall, or
runtime scraping language. AI4Free and YouChat are developer-run enrichment dependencies only; never call
them from the browser or the normal collection pipeline.

## Build, test, and lint

Use Node.js 20+ and npm 10+:

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
npm run pipeline:fixture
```

`npm run pipeline` is the only normal command that contacts an external API.
The fixture command is deterministic and offline. Do not add another package
manager, runner, browser scraper, backend, account flow, or secret.

## Source and provenance rules

- `scripts/sourceCatalog.ts` is the source policy registry. Keep all selected
  sources represented there, including endpoint, status, licence, attribution,
  rate-limit, and restriction notes.
- `scripts/sourceAdapters.ts` is the source-neutral adapter boundary. Only
  official/public APIs or feeds may be used. A public webpage is not permission
  to scrape it.
- Keep collection in Node scripts, never in React/Vite runtime code.
- Every generated idea preserves a canonical URL, source identity, licence,
  attribution, usage note, and collection timestamp.
- Enforce the seven-day collection window, six-week retention cleanup,
  stable-ID/title deduplication, validation, and
  human review before `approved: true`.
- Never commit API keys, OAuth tokens, cookies, or generated secrets. The
  optional GitHub token must come from `GITHUB_TOKEN`, and the optional NASA
  key must come from `NASA_API_KEY`; both are only read by Node adapters and
  must never enter generated output. Reddit and Kaggle remain disabled pending
  review.
- Item-specific terms override catalog defaults. GitHub records require an
  item-level licence before normalization; OpenAlex remains bibliographic
  metadata only. OpenStreetMap, Kaggle, Reddit, and other repository/dataset
  sources require special care. Active source adapters are capped at 20 records
  and must preserve the seven-day collection and 42-day retention windows.

## Deterministic pipeline

`scripts/deterministicClassification.ts` owns quality score, category,
difficulty, technology tags, and recommendation. Keep it deterministic and
testable; do not add LLM calls. `scripts/run-pipeline.ts` must validate output,
write `pipeline-ideas.json` and `attribution-manifest.json`, and report skipped
or manual-review sources clearly. The separate optional
`scripts/enrich_with_youchat.py` stage may be explicitly invoked by a
developer. It passes the complete collected record to YouChat, requires a
strict keep/discard decision object, preserves provenance, marks malformed
responses as discarded, and atomically writes its output. Its deterministic
fallback must remain available, record-specific, and free of generic `Turn`
titles or repeated steps.
The separate optional `scripts/enrich_with_gemini.py` stage uses the official
`google-genai` package only when explicitly invoked. It reads
`GEMINI_API_KEY`/`GEMINI_MODEL` from the environment or `.env.local`, never
logs the key, retries 429 responses with bounded backoff, and must preserve
the same strict schema and provenance rules. Neither enrichment provider may
run during build, browser runtime, or the normal collection pipeline.

Automatic push is guarded: it requires `--push`, `ALLOW_AUTO_PUSH=true`, an
exact `PUSH_BRANCH`, a clean starting tree, passing tests, and a secret scan.
Do not invoke guarded push during normal development. Do not commit unless the
user explicitly asks for a commit or runs the guarded command themselves.

## UI and data conventions

- `src/types.ts` is the source of truth for normalized and UI idea types.
- Keep `src/data/ideas.ts` limited to validated generated records; discard
  decisions remain in the audit JSON but must be filtered from public ideas.
  `approved` is metadata for future editorial publication modes.
- Keep filtering/sorting pure in `src/lib/ideaUtils.ts`.
- Keep interactions accessible and reuse existing CSS tokens/components.
- Do not fabricate screenshots or attribution. Document limitations instead.
