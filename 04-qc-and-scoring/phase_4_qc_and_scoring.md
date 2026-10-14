# Phase 4: Quality Control, Scoring & Formatting Blueprint

## 1. Phase Overview & Strategic Objective

### Purpose
Phase 4 acts as the **Senior Editorial Director and Algorithmic QA Gatekeeper**. Before any drafted post from Phase 3 is shown to the human user for final sign-off, it undergoes rigorous algorithmic scoring, anti-slop filtering, mobile formatting calibration, and growth add-on generation.

### Core Objectives
- **Zero AI Slop**: Automatically scrubs robotic phrases (*delve, leverage, testament, game-changer, in today's digital era*).
- **Algorithmic Quality Gate**: Evaluates posts on a 50-point rubric; auto-refines any draft scoring below 40/50.
- **Algorithm Optimization**: Implements the "Link in Pinned Comment" protocol to protect post reach on LinkedIn and X.
- **Mobile-First Scannability**: Enforces 1-line paragraph breaks and scannable visual pacing.

---

## 2. Prerequisite Checks: Negative Constraints & Character Budgets

Before scoring, the QA engine runs an automated pre-flight scan:

```
                               ┌─────────────────────────────────────────┐
                               │       Phase 4 QA Scanner Engine         │
                               └────────────────────┬────────────────────┘
                                                    │
                ┌───────────────────────────────────┴───────────────────────────────────┐
                ▼                                                                       ▼
┌───────────────────────────────────────────────┐       ┌───────────────────────────────────────────────┐
│     Check 1: Banned Word & Tone Scanner       │       │    Check 2: Platform Character Hard Limits    │
├───────────────────────────────────────────────┤       ├───────────────────────────────────────────────┤
│ • Cross-references .agents/brand/voice.md     │       │ • Free X Tweet: <= 280 characters             │
│ • Flags any forbidden words or jargon         │       │ • Instagram: Hook visible in first 125 chars  │
│ • Detects robotic passive-voice phrasing      │       │ • LinkedIn: Optimal 150-300 word density      │
└───────────────────────────────────────────────┘       └───────────────────────────────────────────────┘
```

---

## 3. Curated Skills Suite for Phase 4

```
                                  ┌───────────────────────────────┐
                                  │  Phase 4 Master Skills Suite  │
                                  └──────────────┬────────────────┘
                                                 │
            ┌────────────────────────────────────┼────────────────────────────────────┐
            ▼                                    ▼                                    ▼
┌───────────────────────┐            ┌───────────────────────┐            ┌───────────────────────┐
│ Skill 1: Algorithmic  │            │ Skill 2: Anti-Slop    │            │ Skill 3: Growth &     │
│ Post Scorer           │            │ Copy Editor           │            │ Link Add-on Engine    │
├───────────────────────┤            ├───────────────────────┤            ├───────────────────────┤
│ • post-scorer (3.1k)  │            │ • copy-editing        │            │ • pinned-comment      │
│ • optimization-advisor│            │   (marketingskills)   │            │   (3.1k likes)        │
│   (social-media)      │            │ • post-formatter      │            │ • quote-post (3.1k)   │
│                       │            │   (3.1k likes)        │            │                       │
└───────────────────────┘            └───────────────────────┘            └───────────────────────┘
```

### 🛠️ Curated Skill 1: `algorithmic-post-scorer`
- **Primary Sources**: `post-scorer` (*3.1k likes*), `optimization-advisor-sms` (*social-media-skills*).
- **5-Criterion 50-Point Scoring Rubric**:
  | Criterion | Weight | What It Evaluates | Passing Standard |
  | :--- | :--- | :--- | :--- |
  | **1. Hook Strength** | 1–10 pts | Tension, curiosity gap, digits, unexpected contrast | Score $\ge 8$ required |
  | **2. Voice Match** | 1–10 pts | Sentence length variance, rhythm, matches `voice.md` | Score $\ge 8$ required |
  | **3. Value Density** | 1–10 pts | Concrete takeaways, actionable steps, zero filler | Score $\ge 8$ required |
  | **4. Scannability** | 1–10 pts | Mobile formatting, 1-line breaks, no text walls | Score $\ge 8$ required |
  | **5. Publish Readiness**| 1–10 pts | Authentic human tone, zero detectable AI clichés | Score $\ge 8$ required |
  - **Auto-Correction Loop**: If Total Score $< 40/50$, the agent passes the draft back to `anti-slop-copy-editor` to fix weaknesses before human review.

### 🛠️ Curated Skill 2: `anti-slop-copy-editor`
- **Primary Sources**: `copy-editing` (*marketingskills*), `post-formatter` (*3.1k likes*).
- **Core Capabilities**:
  - Applies high-retention frameworks (PAS, BAB, SLAY).
  - Cuts adverbs, converts passive voice to active voice, and enforces Grade 6–8 readability.
  - Strips em dashes (if prohibited by voice) and repetitive phrasing.

### 🛠️ Curated Skill 3: `growth-addon-engine`
- **Primary Sources**: `pinned-comment` (*3.1k likes*), `quote-post` (*3.1k likes*).
- **Core Capabilities**:
  - **The "Link in Pinned Comment" Protocol**: Generates the high-engagement first comment containing lead magnets or external URLs to prevent LinkedIn/X outbound link reach penalties.
  - **Discussion Sparker**: Appends a thoughtful, conversational question to trigger comments within the first 60 minutes of publishing.

---

## 4. Human-In-The-Loop (HITL) Gate 3: Final Sign-off Interface

Once the draft passes the $\ge 40/50$ threshold, it is presented to the user with its verification scorecard:

```markdown
──────────────────────────────────────────────────────────────────
📊 QUALITY SCORECARD: 47 / 50  [✅ PASSED QUALITY GATE]
• Hook Strength:         9 / 10  (Contrarian tension + digit)
• Voice Match:          10 / 10  (Matches authentic staccato rhythm)
• Value Density:         9 / 10  (Actionable 3-step takeaway)
• Mobile Scannability:  10 / 10  (1-line breaks, zero text walls)
• Publish Readiness:     9 / 10  (0 AI buzzwords detected)
──────────────────────────────────────────────────────────────────
📝 FINAL POST DRAFT:
[Post Copy perfectly formatted for target platform]

💬 PINNED FIRST COMMENT (Algorithm Reach Protection):
"P.S. We documented the full free framework here: [URL]
What's your biggest challenge with [Topic]?"
──────────────────────────────────────────────────────────────────
👉 Actions: [ 🚀 APPROVE & SCHEDULE ] | [ ✏️ QUICK TWEAK ] | [ 🔄 RE-ROLL ]
```

---

## 5. Status & Sign-off
- **Phase 1 Status**: ✅ **COMPLETED & LOCKED IN**
- **Phase 2 Status**: ✅ **COMPLETED & LOCKED IN**
- **Phase 3 Status**: ✅ **COMPLETED & LOCKED IN**
- **Phase 4 Status**: ✅ **COMPLETED & LOCKED IN**
- **Next Phase**: **Phase 5: Repurposing & Multi-Channel Distribution**
