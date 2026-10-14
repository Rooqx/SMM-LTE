# SMM Master Skills System: Master Context & Memory

## 🎯 System Identity & Scope
This project contains the complete, production-grade **Social Media Manager (SMM) Agent System** designed to manage end-to-end social media for B2B and B2C businesses across **LinkedIn, X (Twitter), Instagram, Facebook, and Short-Form Video (TikTok/Reels)**.

- **Master System Directory**: `/home/farooq-ashiru/Desktop/Cloned repos(self host/smm-master-skills/`
- **System Status**: Skill library curated; hosted runtime implementation lives in `backend/` and requires deployment configuration, migrations, and credentials before production use.
- **Architecture**: 7 Main Folders (6 Lifecycle Phase Folders + 1 Live `.agents/` Memory Directory)

---

## 🏛️ Directory Architecture: The 7 Main Folders

```
smm-master-skills/
│
├── 🧠 ORCHESTRATOR.md             <-- The Master System Prompt & State Machine Router
├── 🔌 BRIDGE_CONFIG.md           <-- Universal Compatibility Layer (tool fallbacks & path sync)
├── 🧭 INDEX.md                   <-- Complete Directory Index & Quick-Start Guide
├── 🎯 context.md                 <-- This Master Context & System Memory File
│
├── 📁 01-onboarding/             <-- Phase 1 (Voice extraction, customer research, bio optimization)
│   ├── phase_1_discovery_and_onboarding.md
│   └── (voice-builder, customer-research, competitor-profiling, profile-optimizer, etc.)
│
├── 📁 02-strategy-and-calendar/  <-- Phase 2 (32+ topic matrix, 7-day rolling sprint, cadence)
│   ├── phase_2_strategy_matrix_and_calendar.md
│   └── (content-matrix, content-calendar-sms, platform-strategy-sms, marketing-psychology...)
│
├── 📁 03-creative-production/    <-- Phase 3 (Hooks, multi-platform copy, carousels, video scripts)
│   ├── phase_3_creative_production.md
│   └── (hook-generator, post-writer, gemini-carousel, reels-scripting, thread-writer...)
│
├── 📁 04-qc-and-scoring/         <-- Phase 4 (50-pt algorithmic scorer, anti-slop copy editing)
│   ├── phase_4_qc_and_scoring.md
│   └── (post-scorer, copy-editing, post-formatter, pinned-comment, quote-post...)
│
├── 📁 05-repurposing/            <-- Phase 5 (1 long-form asset -> 5-8 staggered derivatives)
│   ├── phase_5_repurposing_and_distribution.md
│   └── (content-repurposer-sms, newsletter-voice, youtube-thumbnail, co-marketing...)
│
├── 📁 06-analytics-and-feedback/ <-- Phase 6 (Top 10% signal extraction & closed memory loop)
│   ├── phase_6_analytics_and_feedback.md
│   └── (content-pattern-analyzer-sms, performance-analyzer-sms, analytics-dashboard...)
│
└── 📁 .agents/                   <-- Live Runtime Memory & State
    ├── state.json               <-- Real-time phase & gate status tracker
    ├── brand/                   <-- Stored voice.md, audience.md, positioning.md
    ├── strategy/                <-- Stored content-matrix.md, campaign-backlog.md
    ├── calendar/                <-- Active current-sprint.md
    ├── drafts/                  <-- Drafted posts & scorecards
    └── repurposed/              <-- Staggered derivative packages
```

---

## 🚦 Phase Blueprints & Execution Status

| Phase | Phase Name & Mission | Location | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Discovery, Brand Voice & Onboarding**<br>Extract authentic voice, ICP pain points, and optimize profile bios. | `01-onboarding/` | ✅ **Completed & Locked** |
| **Phase 2** | **Strategy, Content Matrix & Calendar**<br>32+ monthly topic matrix and 7-day agile sprint calendar with campaign backlog. | `02-strategy-and-calendar/` | ✅ **Completed & Locked** |
| **Phase 3** | **Creative & Multi-Platform Production**<br>2-line viral hooks, platform copy (X 280 vs Premium), carousels, and 30-60s video scripts. | `03-creative-production/` | ✅ **Completed & Locked** |
| **Phase 4** | **Quality Control, Scoring & Formatting**<br>50-point quality scoring rubric (40/50 pass gate) and pinned first comment reach protection. | `04-qc-and-scoring/` | ✅ **Completed & Locked** |
| **Phase 5** | **Repurposing & Distribution**<br>Transform 1 pillar asset into 5-8 native derivatives with 48-72h staggered scheduling. | `05-repurposing/` | ✅ **Completed & Locked** |
| **Phase 6** | **Performance Analytics & Feedback**<br>Extract top 10% outlier signals and automatically calibrate memory files in `.agents/`. | `06-analytics-and-feedback/` | ✅ **Completed & Locked** |

---

## 🔑 Key Architectural Decisions Locked In

1. **Deterministic State Machine**:
   - The agent reads `.agents/state.json` at every turn to instantly know its active phase and gate status without hallucinating.
2. **The 2-Tier Topic vs Drafting Model**:
   - Avoids "90-post fatigue" by generating monthly topic hooks in Phase 2 and drafting full copy only for approved weekly topics in Phase 3.
3. **Hub-and-Spoke Multi-Platform Engine**:
   - 1 daily Hero Topic branches into 3 platform-native derivatives (LinkedIn PDF Carousel / X Thread / IG Reel) with zero copy-paste laziness.
4. **Universal Compatibility (`BRIDGE_CONFIG.md`)**:
   - Canonical context lives under `.agents/brand/` for file-mode use and in `workspace_context` for hosted use. Legacy root filenames are resolved as aliases rather than duplicated automatically.
   - Tool calls (`AskUserQuestion`, `Apify`, `BlackTwist`) automatically fall back to standard interactive chat forms and web readers.
5. **Anti-Slop & Quality Gate**:
   - Forbidden AI buzzwords (*delve, leverage, game-changer, revolutionary, in today fast-paced world*) are aggressively scrubbed.
   - Outbound links are strictly placed in Pinned First Comments on LinkedIn and X.

---

## 🤖 Instructions for Any AI Agent Operating in this Workspace
1. **Root System Prompt**: Always reference `/home/farooq-ashiru/Desktop/Cloned repos(self host/smm-master-skills/ORCHESTRATOR.md`.
2. **Current State Check**: Read `/home/farooq-ashiru/Desktop/Cloned repos(self host/smm-master-skills/.agents/state.json`.
3. **Skill Activation**: When in Phase $N$, activate only the skills located inside the `0N-[phase-name]/` subfolder to keep prompt context clean.
