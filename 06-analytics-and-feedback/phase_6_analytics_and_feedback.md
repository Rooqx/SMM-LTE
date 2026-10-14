# Phase 6: Performance Analytics, Pattern Recognition & Feedback Loops Blueprint

## 1. Phase Overview & Strategic Objective

### Purpose
Phase 6 forms the **Intelligence & Continuous Self-Improvement Engine** of the Social Media Manager Agent. Instead of treating metrics as passive vanity numbers, Phase 6 translates data into actionable pattern signals that automatically calibrate the brand's voice, formats, and weekly calendars.

### Core Objectives
- **Signal vs. Noise Analysis**: Identifies top 10% vs bottom 10% performers to discover what actually works.
- **Winning Pattern Extraction**: Analyzes hook styles, formats, post lengths, and posting times that maximize engagement and conversion.
- **The Closed Feedback Loop**: Feeds performance data directly back into `.agents/brand/voice.md` and `.agents/strategy/platform-cadence.md` so future Phase 2 weekly sprints become progressively higher-converting.

---

## 2. Multi-Platform Data Ingestion Architecture

```
                               ┌─────────────────────────────────────────┐
                               │       Phase 6 Data Ingestion Layer      │
                               └────────────────────┬────────────────────┘
                                                    │
                ┌───────────────────────────────────┼───────────────────────────────────┐
                ▼                                   ▼                                   ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐   ┌───────────────────────────────┐
│ 1. Meta Graph API (Free OAuth)│   │ 2. LinkedIn API (Free OAuth)  │   │ 3. Universal Fallback         │
├───────────────────────────────┤   ├───────────────────────────────┤   ├───────────────────────────────┤
│ Pulls impressions, saves,     │   │ Pulls reactions, comments,    │   │ CSV analytics export,         │
│ shares, reach, Reel views,    │   │ reposts, follower growth,     │   │ dashboard screenshot, or      │
│ profile clicks for IG & FB.   │   │ link clicks for personal/page.│   │ manual metric input table.    │
└───────────────────────────────┘   └───────────────────────────────┘   └───────────────────────────────┘
```

---

## 3. Curated Skills Suite for Phase 6

```
                                  ┌───────────────────────────────┐
                                  │  Phase 6 Master Skills Suite  │
                                  └──────────────┬────────────────┘
                                                 │
            ┌────────────────────────────────────┼────────────────────────────────────┐
            ▼                                    ▼                                    ▼
┌───────────────────────┐            ┌───────────────────────┐            ┌───────────────────────┐
│ Skill 1: Pattern      │            │ Skill 2: Multi-Channel│            │ Skill 3: Growth &     │
│ & Signal Extractor    │            │ Analytics Dashboard   │            │ A/B Test Optimizer    │
├───────────────────────┤            ├───────────────────────┤            ├───────────────────────┤
│ • content-pattern-    │            │ • analytics-dashboard │            │ • ab-testing          │
│   analyzer-sms        │            │   (3.1k likes)        │            │   (marketingskills)   │
│ • performance-analyzer│            │ • analytics           │            │ • audience-growth-    │
│   (social-media)      │            │   (marketingskills)   │            │   tracker-sms         │
└───────────────────────┘            └───────────────────────┘            └───────────────────────┘
```

### 🛠️ Curated Skill 1: `pattern-signal-extractor`
- **Primary Sources**: `content-pattern-analyzer-sms` (*social-media-skills*), `performance-analyzer-sms` (*social-media-skills*).
- **Core Function**: Calculates the **Engagement Quality Score**:
  $$\text{Score} = \text{Likes} + (3 \times \text{Comments}) + (5 \times \text{Reposts}) + (7 \times \text{Saves}) + (10 \times \text{Link Clicks})$$
  - Extracts the top 10% highest-scoring posts and isolates:
    - **Hook Types**: Which hook formulas produced 80% of comments?
    - **Format Winners**: Which formats drove profile visits (e.g. Carousels vs Short Video)?
    - **Sentence Rhythm**: Did shorter sentences correlate with higher completion rates?

### 🛠️ Curated Skill 2: `analytics-dashboard`
- **Primary Sources**: `analytics-dashboard` (*3.1k likes*), `analytics` (*marketingskills*).
- **Core Function**: Synthesizes cross-platform analytics into an executive-level weekly and monthly report. Tracks net audience growth, total reach, CTR, and conversion actions.

### 🛠️ Curated Skill 3: `growth-ab-optimizer`
- **Primary Sources**: `ab-testing` (*marketingskills*), `audience-growth-tracker-sms` (*social-media-skills*).
- **Core Function**: Formulates structured split tests:
  - Tests 2 hook angles for the same topic.
  - Tests 2 different CTA styles (*"Comment KEYWORD"* vs *"Link in bio"*).
  - Tests slide length (*6 slides vs 9 slides*).

---

## 4. The Closed Feedback Loop Mechanism

Performance data updates the agent's memory files automatically:

```
                    ┌───────────────────────────────────────────────┐
                    │      Phase 6 Performance Pattern Audit        │
                    └───────────────────────┬───────────────────────┘
                                            │
                                            ▼ (Direct Memory Calibration)
                ┌───────────────────────────┴───────────────────────────┐
                ▼                                                       ▼
┌───────────────────────────────┐                       ┌───────────────────────────────┐
│   .agents/brand/voice.md      │                       │ .agents/strategy/platform-   │
│                               │                       │ cadence.md                    │
├───────────────────────────────┤                       ├───────────────────────────────┤
│ • Elevates top-performing hook│                       │ • Calibrates peak posting time│
│   styles to primary templates │                       │ • Adjusts format distribution │
│ • Moves underperforming tones │                       │   (e.g., +15% Carousels,      │
│   to the "Absence / Ban" list │                       │   -15% Text Breakdowns)       │
└───────────────────────────────┘                       └───────────────────────────────┘
                │                                                       │
                └───────────────────────────┬───────────────────────────┘
                                            │
                                            ▼
                  Directly Informs Phase 2 Sprint Planning!
```

---

## 5. Sample Output Artifact Spec: `weekly-performance-intelligence.md`

```markdown
# Weekly Social Performance & Pattern Intelligence (Week of [YYYY-MM-DD])

## 1. Executive Summary & KPIs
| Metric | This Week | Last Week | Trend |
| :--- | :--- | :--- | :--- |
| **Total Impressions** | 48,250 | 34,100 | 🟢 +41.5% |
| **Engagement Rate** | 6.8% | 4.9% | 🟢 +1.9% |
| **Profile Link Clicks** | 312 | 198 | 🟢 +57.5% |
| **Net New Followers** | +245 | +140 | 🟢 +75.0% |

## 2. Top Performers vs. Bottom Performers
- 🏆 **Top 10% Winner**: *"Why 90% of [Niche] advice fails"* (LinkedIn Carousel: 16.4k views, 88 saves, 34 comments)
- ⚠️ **Underperformer**: *"Monday quick reminder"* (X Tweet: 310 views, 0.4% engagement)

## 3. Key Extracted Pattern Signals
- **Hook Signal**: Contrarian opening hooks generated **3.4x more saves** than standard how-to openers.
- **Format Signal**: Multi-slide PDF carousels generated **68% of all profile visits**.
- **Timing Signal**: Tuesday and Thursday 8:00 AM – 9:15 AM EST drove 2.1x more first-hour velocity.

## 4. Automatic Strategy Updates for Next Sprint:
1. Increase Carousel share to 45% in `current-sprint.md`.
2. Retire generic reminder posts.
3. Queue 2 new contrarian teardown topics into `content-matrix.md`.
```

---

## 6. Status & Sign-off
- **Blueprint Status**: ✅ All six lifecycle phases are specified.
- **Runtime Status**: Execution history is authoritative in the backend database; this blueprint does not imply that every phase has run for every workspace.
