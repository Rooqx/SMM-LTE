# Phase 1: Discovery, Brand Voice & Onboarding Blueprint

## 1. Phase Overview & Strategic Objective

### Purpose
Phase 1 constructs the persistent **"Brain, Voice, and DNA"** of the business before any content generation occurs. It eliminates generic AI tone by capturing exact linguistic patterns, target audience psychology, competitor gaps, and profile conversion setups.

### Why This Phase is Critical
- **Eliminates AI Clichés**: Enforces negative constraints (absence signals, banned buzzwords).
- **Calibrates Tone**: Matches the founder or brand’s authentic sentence rhythm, vocabulary, and humor style.
- **Grounds Content in Buyer Psychology**: Mines real pain points, desires, and objections (Jobs-To-Be-Done) rather than generic industry topics.
- **Maximizes Conversion**: Optimizes bio, banner, and pinned real estate before driving organic traffic.

---

## 2. Step 0: Pre-Flight & Frictionless Intake Protocols

To ensure zero friction for clients ranging from busy founders to detailed marketing teams, Phase 1 includes three essential intake mechanisms:

```
                                 ┌───────────────────────────────────┐
                                 │   Step 0: Intake Initialization   │
                                 └─────────────────┬─────────────────┘
                                                   │
                ┌──────────────────────────────────┼──────────────────────────────────┐
                ▼                                  ▼                                  ▼
┌───────────────────────────────┐  ┌───────────────────────────────┐  ┌───────────────────────────────┐
│   1. Context Existence Check  │  │   2. Dual-Track Intake Flow   │  │  3. "I Don't Know" Fallback   │
├───────────────────────────────┤  ├───────────────────────────────┤  ├───────────────────────────────┤
│ Checks canonical brand files  │  │ • Track A: Fast Track (2 min) │  │ If client is unsure, agent    │
│ If yes -> offer quick update  │  │   (URL / 3-5 post samples)    │  │ immediately suggests 3 proven │
│ If no  -> trigger setup       │  │ • Track B: Deep Interview     │  │ tailored options to choose.   │
└───────────────────────────────┘  └───────────────────────────────┘  └───────────────────────────────┘
```

1. **Context Existence Check**:
   - Scans for `.agents/brand/voice.md`, `.agents/brand/audience.md`, and `.agents/brand/positioning.md`. If found, summarizes current context and asks: *"What would you like to update (voice, audience, pillars, or full refresh)?"*
2. **Dual-Track Intake ("Busy Founder Override")**:
   - **Track A (Fast Track / 2 Mins)**: User provides a website URL or pastes 3–5 previous posts $\rightarrow$ Agent extracts voice rhythm, audience, and value proposition automatically.
   - **Track B (Guided Deep Dive / 8–10 Mins)**: One-question-at-a-time interactive interview.
3. **The "I Don't Know" Protocol**:
   - If the client hesitates or does not know their pillars/tone, the agent **never repeats the question**. It analyzes their industry and offers 3 tailored options to click/confirm.

---

## 3. Skill Curation & Source Synthesis for Phase 1

Three unified master skills are synthesized from the source repositories:

### 🛠️ Curated Skill 1: `master-voice-builder`
- **Primary Sources**: `voice-builder` (*3.1k likes*), `social-media-context-sms` (*social-media-skills*), `client_onboarding_skill.md` (*custom*).
- **Core Capabilities**:
  - **Linguistic Voice Extraction**: Analyzes sentence length variance, paragraph pacing (staccato vs flowing), and first/second/third-person orientation.
  - **Absence Signals (Negative Constraints)**: Identifies punctuation, structures, and words the brand *never* uses (e.g., no rhetorical questions, no em dashes, no corporate buzzwords like *"delve"*, *"leverage"*, *"testament"*).
  - **Signature Patterns**: Captures recurring opening hooks, transition phrasing, and closing call-to-actions.

### 🛠️ Curated Skill 2: `audience-market-intelligence`
- **Primary Sources**: `customer-research` (*marketingskills*), `competitor-profiling` (*marketingskills*), `niche-research` (*3.1k likes*).
- **Core Capabilities**:
  - **Voice of Customer (VOC) Mining**: Extracts literal phrases, emotional pain points, and desires from reviews, transcripts, and social comments.
  - **Jobs-To-Be-Done (JTBD) & Objections**: Maps the trigger moment when a customer seeks a solution and the main hesitations stopping them from buying.
  - **Competitor Gap Analysis**: Identifies what competitors are talking about vs what they are ignoring, finding unique contrarian angles for the brand.

### 🛠️ Curated Skill 3: `profile-funnel-optimizer`
- **Primary Sources**: `profile-optimizer` (*3.1k likes*).
- **Core Capabilities**:
  - **Platform-Specific Bio Formulas**: Tailors bios for X (credibility + hook + CTA), LinkedIn (headline transformation + About section story), and Instagram (niche + proof + lead magnet link).
  - **Banner / Header Concepts**: Generates high-converting visual copy for profile banners.
  - **Link-in-Bio & Lead Magnet Placement**: Defines the primary conversion action for profile visitors.

---

## 4. Storage Architecture: Clean Modular Separation

Based on user feedback, context is cleanly partitioned into modular files inside `.agents/` rather than a single monolithic file. This ensures downstream skills only read the exact context they need:

```
.agents/
├── brand/
│   ├── voice.md              <-- Linguistic rules, pacing, absence signals, banned words
│   ├── audience.md           <-- ICP, JTBD, pain points, objections, watering holes
│   ├── positioning.md        <-- Hot takes, competitors, core value proposition
│   └── profile-funnels.md    <-- Bios, headers, link-in-bio CTAs for X, LinkedIn, IG, FB
```

---

## 5. Dynamic Intake & Metadata Pre-fill Protocol

1. **Pre-filled Account Metadata Check**:
   - If the user/client already completed an initial web form or app signup, the agent pulls that JSON payload first.
   - **Rule**: The agent **only asks for missing fields**. If industry, target audience, or handles are already supplied, the agent confirms them silently and skips the question.

2. **Platform-Specific Profile & Post Ingestion Architecture**:
   - **Instagram & Facebook**: Official **Meta Graph API** (Free OAuth read access for business/creator profiles to fetch past posts, engagement rates, and captions).
   - **LinkedIn**: Official **LinkedIn Community Management & Share API** (Free OAuth read access for personal profiles and company pages).
   - **X (Twitter)**: To avoid X's $100/mo API read barrier, use **Agent Browser / Public DOM extraction**, **oEmbed protocol**, and fallback sample text ingestion.
   - **Graceful Fallback**: If a profile is private or behind authentication walls, the agent prompts: *"Could you paste 2–3 of your best past posts or an article link?"*


---

## 6. Dynamic B2B vs B2C Branching Logic

The onboarding workflow dynamically adapts based on business model:

| Dimension | B2B Branch | B2C / Creator / E-commerce Branch |
| :--- | :--- | :--- |
| **Primary Platforms** | LinkedIn, X (Twitter), YouTube | Instagram, TikTok, Facebook, X |
| **Key Audience Driver** | ROI, workflow efficiency, career advancement, authority | Emotion, aesthetic identity, convenience, social proof, lifestyle |
| **Pillars Focus** | Frameworks, case studies, industry hot takes, teardowns | How-to reels, aesthetic carousels, customer UGC, behind-the-scenes, offers |
| **Conversion Action** | Newsletter signup, booking a discovery call, demo request | Product purchase, flash discount code, digital download, community join |

---

## 7. Human-In-The-Loop (HITL) Gate 1: Sign-off

Before moving to **Phase 2 (Strategy & Planning)**, the SMM agent presents the synthesized modular profiles to the user with a concise review card:

```
🛡️ HITL Approval Checkpoint 1:
1. Does the Voice Profile (voice.md) sound like your authentic brand style?
2. Are the Audience Pain Points & Hot Takes (audience.md, positioning.md) accurate?
3. Are the Banned Words / Tone Anti-patterns complete?
4. Are you ready to generate the Content Matrix & Calendar?
```

---

## 8. Status & Sign-off
- **Phase 1 Status**: ✅ **COMPLETED & LOCKED IN**
- **Next Phase**: **Phase 2: Strategy, Content Matrix & Calendar Curation**
