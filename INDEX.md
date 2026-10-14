# SMM Master Skills: Directory Index & Quick Start

## Overview
This folder is the single, self-contained hub for your **Social Media Manager (SMM) Agent**. It is organized into **6 Lifecycle Phase folders** plus the live **`.agents/` memory directory**.

---

## 🧭 Root Orchestration Files
- **[`ORCHESTRATOR.md`](./ORCHESTRATOR.md)** — Master System Prompt & State Machine Router.
- **[`BRIDGE_CONFIG.md`](./BRIDGE_CONFIG.md)** — Universal tool fallbacks and path synchronization rules.
- **[`context.md`](./context.md)** — Session continuity and decision log.

---

## 📁 The 7 Main Folders Map

### 1. [`01-onboarding/`](./01-onboarding) (Phase 1: Discovery & Voice Cloning)
- **[`phase_1_discovery_and_onboarding.md`](./01-onboarding/phase_1_discovery_and_onboarding.md)** — Master Blueprint
- `voice-builder/` — Linguistic voice extraction & tone modeling
- `customer-research/` — Pain points, JTBD, and Voice of Customer mining
- `competitor-profiling/` — Competitor gap analysis & contrarian angles
- `niche-research/` — Sub-niche positioning & trend discovery
- `profile-optimizer/` — High-converting LinkedIn, X, and Instagram bios
- `social-media-context-sms/` — Brand rules & platform handles

### 2. [`02-strategy-and-calendar/`](./02-strategy-and-calendar) (Phase 2: Matrix & Sprints)
- **[`phase_2_strategy_matrix_and_calendar.md`](./02-strategy-and-calendar/phase_2_strategy_matrix_and_calendar.md)** — Master Blueprint
- `content-matrix/` — 32+ monthly topic ideation matrix (4 quadrants)
- `content-calendar-sms/` — 7-day rolling sprint scheduler
- `platform-strategy-sms/` — Platform algorithm rules & peak hours
- `content-strategy-sms/` — Funnel-based strategy (ToFu/MoFu/BoFu)
- `marketing-psychology/` — Loss aversion, status signaling & proof triggers
- `marketing-loops/` — Viral distribution loops
- `marketing-plan/` — Campaign positioning
- `offers/` — High-converting promo offers

### 3. [`03-creative-production/`](./03-creative-production) (Phase 3: Multi-Platform Creative)
- **[`phase_3_creative_production.md`](./03-creative-production/phase_3_creative_production.md)** — Master Blueprint
- `hook-generator/` — 2-line hook formula (3 variations per topic)
- `hook-writer-sms/` — Scroll-stopping openers
- `post-writer/` — Clean post drafting (1-line breaks, no AI buzzwords)
- `post-writer-sms/` — Platform-specific post drafting
- `thread-writer-sms/` — X (Twitter) multi-tweet threads (280-char cap)
- `caption-writer-sms/` — Instagram & Facebook captions
- `copywriting/` — Direct response copywriting principles
- `gemini-carousel/` — Slide-by-slide vertical carousel briefs (15 words max/slide)
- `gemini-infographic/` — Infographic layouts & visual prompts
- `carousel-writer-sms/` — LinkedIn PDF slide decks
- `graphic-designer/` — Visual layout direction & styling
- `reels-scripting/` — 30-60s 3-column vertical video scripts (Reels/TikTok)
- `video/` — Video retention beats & visual hooks
- `ad-creative/` — High-converting visual concepts

### 4. [`04-qc-and-scoring/`](./04-qc-and-scoring) (Phase 4: Quality Control & QA)
- **[`phase_4_qc_and_scoring.md`](./04-qc-and-scoring/phase_4_qc_and_scoring.md)** — Master Blueprint
- `post-scorer/` — 50-point quality scoring rubric (40/50 pass gate)
- `copy-editing/` — Anti-slop scrubbing, active voice & fluff removal
- `post-formatter/` — Framework formatting (PAS, BAB, SLAY)
- `pinned-comment/` — First comment link placement (reach protection)
- `quote-post/` — Retweet & quote-post commentary
- `optimization-advisor-sms/` — Pre-publish optimization checks

### 5. [`05-repurposing/`](./05-repurposing) (Phase 5: Repurposing & Staggering)
- **[`phase_5_repurposing_and_distribution.md`](./05-repurposing/phase_5_repurposing_and_distribution.md)** — Master Blueprint
- `content-repurposer-sms/` — 1 long-form asset -> 5-8 multi-platform derivatives
- `newsletter-voice/` — Newsletter-to-social conversion
- `youtube-thumbnail/` — Thumbnail design & titles
- `co-marketing/` — Cross-promotion & collaboration assets

### 6. [`06-analytics-and-feedback/`](./06-analytics-and-feedback) (Phase 6: Performance Loops)
- **[`phase_6_analytics_and_feedback.md`](./06-analytics-and-feedback/phase_6_analytics_and_feedback.md)** — Master Blueprint
- `content-pattern-analyzer-sms/` — Top 10% vs bottom 10% signal extraction
- `performance-analyzer-sms/` — Multi-metric post analytics
- `audience-growth-tracker-sms/` — Follower velocity & growth trends
- `analytics-dashboard/` — Executive KPI dashboard summary
- `analytics/` — Data-driven marketing metrics
- `ab-testing/` — Systematic split testing for hooks and CTAs

### 7. [`📁 .agents/`](./.agents) (The Live Memory & State Directory)
- `state.json` — Real-time phase & gate tracker
- `brand/` — Stored voice.md, audience.md, positioning.md
- `strategy/` — Stored content-matrix.md, campaign-backlog.md
- `calendar/` — Active current-sprint.md
- `drafts/` — Generated post drafts & scorecards
- `repurposed/` — Multi-channel derivative packages

---

## 🚀 How to Run Your Agent
1. Give your AI agent the [`ORCHESTRATOR.md`](./ORCHESTRATOR.md) file as its system prompt.
2. Say: *"Let us manage my social media."*
3. The agent will read `.agents/state.json`, open the relevant Phase folder, and guide you through each milestone!
