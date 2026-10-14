# Phase 2: Strategy, Content Matrix & Calendar Planning Blueprint

## 1. Phase Overview & Strategic Objective

### Purpose
Phase 2 transforms the Brand DNA (from Phase 1) into an **organized, high-converting publishing schedule** without overwhelming the user. 

### Critical Architecture Decision: The 2-Tier Planning Model
To prevent "90-post fatigue" (where generating 30 full posts across 3 platforms creates 90 drafts that are overwhelming to review):
- **Phase 2 generates TOPICS, ANGLES & HOOKS ONLY** (No full post copy is written yet).
- **Tier 1 (Monthly Topic Pool)**: Generates a 32+ angle **Dynamic Content Matrix** for the month.
- **Tier 2 (Weekly Agile Sprints)**: Pulls 5–7 top angles into a **7-Day Rolling Calendar** for user approval before drafting.

---

## 2. Strategic Rationale & Decision Log

### Why We Decided on Weekly Topics vs. 30-Day Full Content Generation
1. **Elimination of Cognitive Overload**:
   - Reviewing 90 full-length copy drafts (captions, threads, carousel slides across 3 platforms) causes client fatigue, resulting in unread drafts or arbitrary rejections.
   - Reviewing **5 to 7 short topic hooks per week takes under 2 minutes**, achieving high approval rates and clear alignment.
2. **Algorithm Agility & Trend Adaptability**:
   - Social media moves at a breakneck pace. Pre-generating 30 full days makes content rigid and vulnerable to breaking news, industry shifts, or sudden trend opportunities.
   - Weekly rolling sprints allow the brand to inject topical hot takes and real-time commentary effortlessly.
3. **Compounding Quality & Error Prevention**:
   - Weekly feedback allows the agent to calibrate tone and hook styles in rapid iterations.
   - If a specific angle fails in Week 1, the agent pivots in Week 2, rather than baking the same flaw across a full month of pre-written posts.

### The "Hub-and-Spoke" Multi-Platform Architecture
Rather than forcing the business to come up with completely disjointed ideas for each platform, the system operates on a **Hub-and-Spoke model**:
- **The Hub (Daily Hero Topic)**: One high-conviction topic angle approved in the weekly sprint (e.g., *"Why 90% of SMM advice fails"*).
- **The Spokes (Native Channel Derivatives)**:
  - **LinkedIn Spoke**: Deep-dive professional breakdown / 7-slide PDF Carousel with industry data.
  - **X (Twitter) Spoke**: High-retention punchy thread + bold debate hook designed for replies.
  - **Instagram / Facebook Spoke**: 45-second Reel script or visual carousel + saveable cheat-sheet caption.

### The Campaign Backlog ("Do Later" Queue) Rationale
- High-level promotional campaigns (e.g. *Black Friday Teardowns, Webinar Launches, Product Drops*) are separated from routine weekly publishing.
- Storing them in `.agents/strategy/campaign-backlog.md` ensures seasonal and high-converting campaign concepts are captured and ready for activation without cluttering weekly sprint reviews.


---

## 3. The 2-Tier Content Planning Engine

```
                               ┌─────────────────────────────────────────┐
                               │   Brand DNA & Audience Intelligence     │
                               │        (.agents/brand/*.md)             │
                               └────────────────────┬────────────────────┘
                                                    │
                                                    ▼
 ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │  TIER 1: Monthly 32+ Topic Matrix (.agents/strategy/content-matrix.md)                              │
 │  • 4-5 Brand Pillars  ✕  8 Proven Engagement Formats (Actionable, Contrarian, X vs Y, Breakdown...)   │
 └──────────────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                                    │
                                                    ▼ (Pulls 5-7 selected angles per week)
 ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │  TIER 2: 7-Day Rolling Sprint Calendar (.agents/calendar/current-sprint.md)                         │
 │  • Daily posting schedule with Platform Targets, Format Tags, Topic Hook & Strategic Goal           │
 └──────────────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                                    │
                                                    ▼
                                 🛡️ HITL Gate 2: Approve Weekly Topics
                                 (Only approved topics move to Phase 3)
```

---

## 4. Simultaneous Multi-Platform Mapping (One Idea $\rightarrow$ Native Formats)

When a business posts across multiple platforms simultaneously (LinkedIn, X, Instagram, Facebook), **it must never lazy copy-paste the exact same text**. Phase 2 assigns platform-native format tags to each master topic:

| Master Topic Angle | LinkedIn Native Format | X (Twitter) Native Format | Instagram / Facebook Native Format |
| :--- | :--- | :--- | :--- |
| **Actionable How-To** | 6–8 slide PDF Carousel or structured text guide | 4–6 tweet actionable thread with punchy hook | Multi-slide carousel + saveable cheat-sheet caption |
| **Contrarian Hot Take** | Long-form opinion post with real-world case context | Standalone bold statement tweet designed for replies | 30-sec talking-head Reel script + caption debate |
| **X vs Y Comparison** | Visual comparison chart + breakdown analysis | Tweet pairing strengths/weaknesses + poll | Carousel with side-by-side visual slides |
| **Case Study / Social Proof** | Story-driven client transformation breakdown | Proof-hook tweet with screenshot & metric callouts | Before/After Reel script + DM trigger CTA |

---

## 5. Active Campaigns & The "Campaign Backlog" (Do-Later Queue)

To keep the calendar organized while capturing high-value future ideas:

1. **Active Campaign Slots (20–30% of Sprint)**:
   - If the business has an active launch, webinar, or discount offer, the calendar reserves 2–3 slots for anticipation, objection handling, and direct conversion.
2. **Campaign Backlog Queue (`.agents/strategy/campaign-backlog.md`)**:
   - The agent continuously suggests future promotional campaigns (e.g. *Black Friday Teardown, New Feature Launch, Industry Challenge Week*).
   - If not scheduled immediately, they are saved into a dedicated "Do-Later" backlog so great campaign ideas are never lost.

---

## 6. Curated Skills Suite for Phase 2

```
                                  ┌───────────────────────────────┐
                                  │  Phase 2 Master Skills Suite  │
                                  └──────────────┬────────────────┘
                                                 │
            ┌────────────────────────────────────┴────────────────────────────────────┐
            ▼                                                                         ▼
┌───────────────────────────────────────┐               ┌───────────────────────────────────────┐
│  Skill 1: Dynamic Content Matrix      │               │  Skill 2: Smart Calendar Engine       │
├───────────────────────────────────────┤               ├───────────────────────────────────────┤
│ • content-matrix (3.1k likes)         │               │ • content-calendar-sms (social-media) │
│ • content-strategy-sms (social-media) │               │ • platform-strategy-sms (social-media)│
│ • marketing-psychology (marketing)    │               │ • marketing-loops (marketingskills)   │
└───────────────────────────────────────┘               └───────────────────────────────────────┘
```

### 🛠️ Curated Skill 1: `dynamic-content-matrix`
- **Primary Sources**: `content-matrix` (*3.1k likes*), `content-strategy-sms` (*social-media-skills*), `marketing-psychology` (*marketingskills*).
- **Core Function**: Generates a 32+ angle table (Pillars $\times$ Formats: Actionable, Motivational, Analytical, Contrarian, Observation, X vs Y, Present vs Future, Listicle). Applies psychological buying triggers (Social Proof, Loss Aversion, Status Signaling).

### 🛠️ Curated Skill 2: `smart-calendar-engine`
- **Primary Sources**: `content-calendar-sms` (*social-media-skills*), `platform-strategy-sms` (*social-media-skills*), `marketing-loops` (*marketingskills*).
- **Core Function**: Builds the 7-day rolling editorial calendar. Assigns dates, best posting times per platform, format tags, and strategic goals (Educate, Entertain, Inspire, Convert).

---

## 7. Modular Storage Architecture for Phase 2

```
.agents/
├── strategy/
│   ├── content-matrix.md      <-- 32+ monthly topic angles mapped by pillar & format
│   ├── campaign-backlog.md    <-- "Do Later" list for future launches and promotional ideas
│   └── platform-cadence.md    <-- Posting frequency, peak hours, and platform format rules
└── calendar/
    └── current-sprint.md      <-- Active 7-day sprint calendar with status tags
```

---

## 8. Sample Calendar Artifact Spec: `current-sprint.md`

```markdown
# 7-Day Sprint Content Calendar (Week of [YYYY-MM-DD])
Status: [PENDING APPROVAL / APPROVED]

| Day | Platform(s) | Topic Headline / Angle | Format Tag | Quadrant Goal | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Mon** | LinkedIn, X | "Why 90% of [Niche] advice is backward" | [Carousel / Thread] | Contrarian / Reach | [DRAFT] |
| **Tue** | Instagram, FB | "3 daily routines top [ICP] use to save 5 hrs" | [Reel Script / Carousel] | Educate / Authority | [DRAFT] |
| **Wed** | LinkedIn, X | "Tool A vs Tool B: The definitive teardown" | [PDF Slide / Breakdown] | Analytical | [DRAFT] |
| **Thu** | IG, TikTok | "Behind the scenes of how we built [Product]" | [Short Video / Story] | Inspire / Connection| [DRAFT] |
| **Fri** | All Channels | "How [Client] achieved [Result] in 30 days" | [Case Study Post] | Convert / Sales | [DRAFT] |
```

---

## 9. Human-In-The-Loop (HITL) Gate 2: Sign-off

Before advancing to **Phase 3 (Creative & Multi-Platform Production)**, the user reviews the weekly topics:

```
🛡️ HITL Approval Checkpoint 2:
1. Do you approve the 5–7 topic angles and platform assignments for this week?
2. Would you like to swap, replace, or edit any specific topic row?
3. (Optional) Any active campaign to inject from the campaign-backlog.md?
```

---

## 10. Status & Sign-off
- **Phase 1 Status**: ✅ **COMPLETED & LOCKED IN**
- **Phase 2 Status**: ✅ **COMPLETED & LOCKED IN**
- **Next Phase**: **Phase 3: Creative & Multi-Platform Production (Drafting Hooks, Posts, Carousels, Video Scripts)**

