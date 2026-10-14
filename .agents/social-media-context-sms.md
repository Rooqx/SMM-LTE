# Social Media Context

last_updated: 2026-09-03

---

## Identity

- **Type**: Creator / Builder (Personal Account)
- **Name**: Developer / AI & Full-Stack Engineer
- **Handle(s)**: X / Twitter & LinkedIn
- **Role**: AI Engineer & Full-Stack Developer
- **Industry/niche**: Full-Stack Web Development (React, Next.js, Go, Databases) & Applied AI Engineering
- **Positioning**: Pragmatic engineer who cuts through AI and tech hype to build reliable, production-ready apps and break down architecture clearly.

---

## Target Audience

- **Primary audience**: Technical recruiters, hiring managers, engineering CTOs, fellow developers, and founders looking for contract/freelance builders.
- **Pain points**: Too many engineers only know surface-level syntax or toy AI demos; lack of understanding of real performance issues, memory leaks, and backend scaling.
- **Goals**: Discover proven technical talent who understand architecture, ship fast, prevent expensive bugs, and solve real business problems.
- **Sophistication level**: Intermediate to Expert.
- **Where they hang out**: LinkedIn (recruiting & leadership discussions) and X / Twitter (dev community, open-source repos, AI releases).

---

## Voice & Tone

- **Voice adjectives**: Pragmatic, technical, analytical, direct, builder-focused.
- **Formality**: Semi-formal to casual dev peer-to-peer.
- **Humor**: Dry / occasional.
- **Phrases to use**: "silently wasting performance", "scratching the surface", "the subtle trap", "less boilerplate, cleaner code", "ship fast, let users guide you", "in the wild".
- **Phrases to avoid**: "delve", "leverage", "game-changer", "revolutionize", "testament", "beacon", "in today's fast-paced world", empty hype.

---

## Content Pillars

1. **Applied AI & Agentic Systems** — Pragmatic LLM integrations, agents, and moving beyond toy prototypes.
2. **Frontend & Full-Stack Performance (React/Next.js)** — Memory leaks, hook pitfalls (`useMemo`, `useRef`, `useEffect`), and clean code architecture.
3. **Backend, Cloud & Databases (Go/Node/SQL)** — API route design, security (rate limiting/brute force protection), and scalable deployment.
4. **Startup Velocity & Building in Public** — Lean MVP stacks ($20/mo startups), open-source tooling, and shipping fast.

---

## Platform Configuration

| Platform | Goal | Current Frequency | Target Frequency | BlackTwist |
|---|---|---|---|---|
| X (Twitter) | Build builder authority, engage dev community, share stack breakdowns | Active | 3 posts/day (21/wk) | No |
| LinkedIn | Attract recruiters, founders & clients; share deep-dive code patterns | Active | 2 posts/day (14/wk) | No |

---

## Content Formats

- **Preferred formats**:
  - X: Staccato lists (stack breakdown), "X > Y" comparisons, punchy technical debate questions.
  - LinkedIn: Problem $\rightarrow$ Mechanism breakdown $\rightarrow$ JavaScript/Go code snippet with comments $\rightarrow$ Rule of thumb $\rightarrow$ Peer discussion prompt.
- **Per-platform preferences**: Clean 1-line breaks, code blocks with comments, reach-protecting links placed in pinned comments.
- **Formats to avoid**: High-level abstract thought leadership with no code or architectural substance; corporate jargon.

---

## Example Posts

### Example 1 — X (Twitter)
If you want to start a startup  
Claude=coding ($20/mo)  
Supabase=BE (Free)  
Vercel=deploy (Free)  
Namecheap=domain ($12/yr)  
Stripe=pay (2.9%/txn)  
GitHub=VC (Free)  
Resend=email (Free)  
Clerk=auth (Free)  
Cloudflare=DNS (Free)  
PostHog=analytics (Free)  

Total: ~$20/m

### Example 2 — X (Twitter)
7 yrs coding taught me: don’t overbuild your startup’s MVP. Simple stack (Node.js + React), ship fast, let users guide you. One startup hit 10K users in 6 wks with a barebones app. What’s your MVP stack?

### Example 3 — LinkedIn
Your React app might be silently wasting performance on every render.

Ever notice a slight jank, or that a component re-renders more than it should, even when props haven't really changed? Sometimes, it's not the props, but the references you're passing down.

If you're creating complex objects, arrays, or doing heavy computations directly inside your functional components, those values are re-created on every render. Even if the data inside them is the same, their new memory reference triggers re-renders in memoized children or re-executes expensive logic.

This is where `useMemo` shines.

```javascript
const MemoizedChild = React.memo(({ config }) => {
  // This component will only re-render if its 'config' prop reference changes.
  return <ExpensiveChart data={config.chartData} options={config.chartOptions} />;
});

function ParentComponent({ rawData, theme }) {
  // Create a configuration object that's only re-created if rawData or theme changes.
  const chartConfig = useMemo(() => {
    const processedData = processRawData(rawData); // An expensive operation
    const chartOptions = getChartOptions(theme);   // Another expensive operation
    return { chartData: processedData, chartOptions };
  }, [rawData, theme]); // Only re-run this memo if rawData or theme references change.

  return <MemoizedChild config={chartConfig} />;
}
```

By memoizing `chartConfig` with `useMemo`, we ensure it's only re-calculated when `rawData` or `theme` actually changes. This prevents `MemoizedChild` from re-rendering unless `chartConfig` itself has a new reference, directly saving CPU cycles.

It's a small change, but in complex applications with many components or heavy data transformations, `useMemo` can be a significant performance win. Don't overuse it though; it comes with its own overhead!

When do you typically reach for `useMemo` in your React projects? Share your common use cases!

---

## Anti-Patterns

- **Topics to avoid**: Partisan politics, celebrity drama, personal diary entries without technical value.
- **Tones to avoid**: Preachy, corporate jargon, cheerleading hype, theoretical fluff.
- **Content types to avoid**: Low-effort "agree?" one-liners, unverified code snippets that wouldn't compile or run in production.
