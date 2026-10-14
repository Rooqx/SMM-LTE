# SMM Agent Bridge & Compatibility Layer

## Purpose
This document bridges all skill dependencies, file path differences, and tool call discrepancies across the three source repositories (`social-media-skills3.1klikes`, `social-media-skills`, and `marketingskills`). It ensures that **any AI agent (Claude, Gemini, OpenAI, Antigravity, AutoGen, CrewAI, LangChain, or custom CLI)** executes the skills with 100% plug-and-play reliability.

---

## 1. Unified Context & Memory Path Resolution

Different source skills expect context files in different locations. The agent MUST resolve and sync context across these paths:

| Skill Family | Expected Context Path | Unified Canonical Source | Auto-Sync Action |
| :--- | :--- | :--- | :--- |
| **`3.1k likes` skills** | `./voice.md`<br>`./about-me.md` | `.agents/brand/voice.md`<br>`.agents/brand/audience.md` + `.agents/brand/positioning.md` | Resolve legacy filenames as aliases. Do not require duplicate root files. |
| **`social-media-skills`** | `.agents/social-media-context-sms.md` | `.agents/brand/audience.md`<br>`.agents/brand/voice.md` | Mirror brand pillars, voice, and audience into `.agents/social-media-context-sms.md`. |
| **`marketingskills`** | `.agents/product-marketing.md` | `.agents/brand/positioning.md` + `.agents/brand/audience.md` | Resolve the legacy product-marketing file as a composed view. Do not invent a missing file. |

### Universal Context Pre-Load Rule:
Whenever starting any task, the agent reads the canonical source first and uses a legacy file only as a fallback:
1. `.agents/brand/voice.md`, then `./voice.md` (for Tone, Rhythm, Banned Words)
2. `.agents/brand/audience.md` plus `.agents/brand/positioning.md`, then `./about-me.md` (for ICP, Pain Points, Objections, and Positioning)
3. `.agents/strategy/content-matrix.md` (for Approved Pillars and Topics)

In the hosted backend, the equivalent canonical database keys are `brand.voice`, `brand.audience`, `brand.positioning`, `social.context`, `strategy.content_matrix`, `strategy.platform_cadence`, and `calendar.current_sprint`. The prompt compiler supplies virtual legacy aliases to older skills; it does not create duplicate files.

---

## 2. Universal Tool & MCP Fallback Protocol

Certain skills contain platform-specific tool instructions (e.g. `AskUserQuestion`, `Apify`, `BlackTwist`). If these tools are unavailable in the host environment, apply these universal fallbacks:

```
┌───────────────────────────────┐               ┌────────────────────────────────────────────────────────┐
│ If this tool is mentioned:    │               │ Fallback Execution Method:                             │
├───────────────────────────────┼───────────────┼────────────────────────────────────────────────────────┤
│ • AskUserQuestion             │ ────────────> │ Output the questions as a clean numbered list directly │
│   (Claude Cowork widget)      │               │ in chat with selectable options (e.g. [A], [B], [C]).  │
├───────────────────────────────┼───────────────┼────────────────────────────────────────────────────────┤
│ • Apify Scraping Actor        │ ────────────> │ 1. Use web fetch / browser tool on public profile URL. │
│   (Instagram/LinkedIn scrape) │               │ 2. Or ask user: "Paste 3 past posts or a public link". │
├───────────────────────────────┼───────────────┼────────────────────────────────────────────────────────┤
│ • BlackTwist API              │ ────────────> │ 1. Read analytics from connected Meta/LinkedIn OAuth.  │
│   (Social analytics & publish)│               │ 2. Or request CSV export / paste metric table.        │
└───────────────────────────────┘               └────────────────────────────────────────────────────────┘
```

---

## 3. Dynamic Phase-Based Skill Loading (Context Optimization)

To prevent prompt bloat and LLM confusion, do NOT load all 44 skills into memory at once. Load only the specific skill required for the current lifecycle state:

```
[Phase 1: Onboarding]
   └── Load: voice-builder, audience-market-intelligence, profile-optimizer

[Phase 2: Strategy & Calendar]
   └── Load: content-matrix, content-calendar-sms, platform-strategy-sms

[Phase 3: Creative Drafting]
   └── Load: hook-generator, post-writer, carousel-writer-sms, reels-scripting

[Phase 4: Quality Control & Formatting]
   └── Load: post-scorer, copy-editing, post-formatter, pinned-comment

[Phase 5: Repurposing]
   └── Load: content-repurposer-sms, newsletter-voice

[Phase 6: Performance Intelligence]
   └── Load: content-pattern-analyzer-sms, analytics-dashboard
```

---

## 4. Universal Output Standard

Every generated post draft MUST include:
1. **Platform Tag** (`[LinkedIn]`, `[X Thread]`, `[Instagram Reel]`, `[Facebook]`)
2. **Hook Options** (3 distinct variations)
3. **Clean Post Copy** (1-line blank breaks, Grade 6-8 readability, zero AI buzzwords)
4. **Quality Scorecard** (Graded on the 50-point rubric from `post-scorer`)
5. **Pinned First Comment** (Containing external links and discussion prompt)
