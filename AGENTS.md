# AGENTS.md — mind-tide

## Dev commands

```bash
npm run dev          # Vite dev @ localhost:5173 (frontend only)
npm run tauri dev    # full desktop app (Vite + Rust)
npm run build        # tsc --noEmit + vite build
npm run lint         # oxlint (rust-based, not ESLint)
cargo check          # Rust typecheck (run from src-tauri/)
```

No test runner. TypeScript check is `tsc --noEmit` (part of `npm run build`).

## Architecture

```
React 19 + Vite 8 + TailwindCSS 4  ──IPC──▶  Tauri 2.0 (Rust)  ──SQLite──▶  mind_tide.db
  │                                                │
  ├─ TanStack Query v5 (no Redux)                  ├─ commands/dreams.rs   (CRUD + AI analysis)
  ├─ React Router v7 (BrowserRouter)               ├─ commands/stats.rs    (6 aggregation queries)
  ├─ Recharts + Framer Motion                      ├─ commands/settings.rs (AI config + model download)
  ├─ shadcn/ui (base-nova, lucide icons)           ├─ ai/mod.rs            (4-layer JSON fallback parser)
  └─ global dark theme (#0f172a)                   ├─ ai/local_model.rs   (llama-cpp-2 CPU-only)
                                                   └─ ai/prompts.rs       (3 structured prompts)
```

**DB**: `{app_data_dir}/mind_tide.db` (WAL, FK on), single `Mutex<Connection>`.
**Local models**: `{app_data_dir}/models/*.gguf` (Qwen2.5 1.5B/3B/7B).

## Routing (5 pages)

| Path        | Page         | Key data                                        |
| ----------- | ------------ | ----------------------------------------------- |
| `/`         | Dashboard    | Stats cards, today summary, mood trend          |
| `/editor`   | EditorPage   | Save dream + "一键 AI 解析"                     |
| `/calendar` | CalendarPage | Timeline + mini calendar + mood pie             |
| `/insights` | InsightsPage | Monthly insight card + charts + dual word cloud |
| `/settings` | SettingsPage | Provider switch, model download, import/export  |

## AI integration (3 providers)

- `builtin` → `local_model::run_local_analysis()` / `run_text_simple()` — llama-cpp-2 greedy sampling, n_ctx=4096/8192
- `ollama` → `http://localhost:11434/v1/chat/completions`
- `openai` → arbitrary `/v1/chat/completions` endpoint (also works for DeepSeek)

**Global model singleton**: `OnceLock<Mutex<Option<LocalModel>>>` — serial inference only.

### JSON parsing is 4-layer fallback (never errors)

1. Direct `serde_json::from_str`
2. Markdown code block extraction (` ```json ... ``` `)
3. Balanced-brace extraction (depth counter)
4. Regex field extraction + defaults

Same fallback architecture used in `extract_insight_json()` for monthly insight.

### DeepSeek quirk

DeepSeek models put reasoning in `reasoning_content`, not `content`. The `extract_text_from_response()` function falls back to `reasoning_content` when `content` is empty. Monthly insight uses `max_tokens: 4096` via `call_ai_text_with_system_and_tokens()` — 1024 is too small for reasoning+output.

## DB schema (5 tables)

```
dreams     (id PK, title, content, user_mood, ai_mood, mood_score, emotions JSON, tags JSON, lucidity 0-5, dream_date, created_at, updated_at) — INDEX on dream_date, ai_mood
analyses   (id PK, dream_id FK CASCADE, model_name, summary, symbols JSON, insight) — one row per dream, DELETE+INSERT on re-analyze
settings   (key PK, value) — stores "ai_config" and "ai_configs_all" (per-provider config map)
ai_summaries (id PK, summary_type, ref_date, content JSON, created_at, updated_at) — UNIQUE(type, date) — content is MonthlyInsight serialized
```

## Non-obvious conventions

- **All dates are `YYYY-MM-DD` strings** — SQLite strftime, frontend `toISOString().slice(0,10)`, Rust `chrono::Local`
- **Tags merge strategy**: AI-generated tags are appended to existing user tags with dedup (never overwrite)
- **Provider configs persist separately**: `ai_configs_all` key stores `HashMap<provider, AiConfig>` so switching providers doesn't lose credentials
- **TS strict rules**: `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noUnusedLocals`/`noUnusedParameters` — use `import type` for type-only imports
- **No tailwind.config**: TailwindCSS 4 uses `@import "tailwindcss"` + `@theme` in `src/index.css`
- **oxlint config**: `.oxlintrc.json` — not eslint
- **scheme/ in .gitignore**: design docs won't be committed
- **HuggingFace downloads may need proxy**: `export https_proxy=http://127.0.0.1:7897`
