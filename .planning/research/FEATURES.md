# Feature Landscape: Digital Envelopes

**Domain:** Envelope budgeting web app (weekly cadence, mini-app inside dan-weinbeck.com)
**Researched:** 2026-02-10
**Overall confidence:** HIGH (cross-referenced YNAB, Goodbudget, EveryDollar, RealBudget, Actual Budget, and multiple review sources)

---

## Table Stakes

Features users expect from any envelope budgeting tool. Missing any of these and the product feels broken or incomplete.

| # | Feature | Why Expected | Complexity | Notes |
|---|---------|--------------|------------|-------|
| T1 | **Create/edit/delete envelopes** | Core concept of the entire app. Without envelopes, there is no product. | Low | Name, color/icon, weekly budget amount. Must support at least 10-20 envelopes. |
| T2 | **Set a budget amount per envelope** | Users must define how much goes in each envelope per period. Every competitor does this. | Low | Weekly amount for this product (not monthly). Needs clear "per week" labeling. |
| T3 | **Record transactions manually** | Core loop: spend money, record it, see balance drop. Goodbudget free, RealBudget, and EveryDollar free all rely on manual entry. | Low-Med | Quick entry is critical -- date, amount, envelope, optional note. Minimize taps/clicks. |
| T4 | **View remaining balance per envelope** | Users need instant clarity on "how much is left." This is the #1 thing users look at. | Low | Prominent display on each envelope card. Visual indicator (progress bar or similar). |
| T5 | **Transfer/reallocate between envelopes** | Handling overages is fundamental to envelope budgeting. YNAB calls this "rolling with the punches." All competitors support it. | Med | Source envelope, destination envelope, amount. Must update both balances atomically. |
| T6 | **Weekly reset/refill cycle** | The budget period resets and envelopes refill. Goodbudget supports weekly periods with configurable start day. This is the product's core cadence. | Med | Auto-refill on a configurable day of week. Must handle: what happens to leftover balance? (carry over vs. reset to budget amount) |
| T7 | **Transaction history per envelope** | Users need to see where money went within each envelope. Every competitor shows this. | Low-Med | Chronological list with date, amount, note. Filterable by current week vs. all time. |
| T8 | **Dashboard/overview screen** | A single view showing all envelopes and their status. Users scan this to decide where they stand. | Med | Card-based layout showing each envelope's name, budget, spent, remaining. Must match host site design. |
| T9 | **Overspending indication** | When an envelope goes negative, users must know immediately. Visual warning is expected. | Low | Red/warning state on envelope card. Negative balance display. Prompt to reallocate. |
| T10 | **Edit/delete transactions** | Mistakes happen. Users will fat-finger amounts. Not being able to fix entries is a dealbreaker. | Low | Edit any field. Delete with confirmation. Balance recalculates. |
| T11 | **User authentication** | Paid feature requires knowing who the user is. Financial data is sensitive. | Med | Likely handled by host site (dan-weinbeck.com) auth system. Must secure envelope data per user. |
| T12 | **Data persistence** | Budget data must survive page reloads and sessions. Losing data is unforgivable for a financial tool. | Med | Server-side storage. No localStorage-only approach -- users expect data on any device. |

---

## Differentiators

Features that set Digital Envelopes apart from competitors. Not strictly expected, but they create competitive advantage or align with the product's unique positioning.

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D1 | **Weekly cadence (not monthly)** | Most budgeting apps default to monthly. Weekly is better for paycheck-to-paycheck budgeters and people who want tighter feedback loops. Goodbudget supports weekly but it's not the default. This is *the* core differentiator. | Low | Baked into the product design, not a feature toggle. All UI language says "this week" not "this month." |
| D2 | **Simple card-based UI matching host site** | Competitors are full standalone apps with complex navigation. This is a focused mini-app that lives inside an existing site. Simplicity *is* the feature. | Med | Cards for envelopes. No sidebar navigation maze. No 50-screen onboarding. Feels native to dan-weinbeck.com. |
| D3 | **Weekly analytics/insights** | End-of-week summary: which envelopes were overspent, which had surplus, spending patterns over recent weeks. Competitors offer monthly reports; weekly is underserved. | Med-High | Bar charts or simple visualizations. Week-over-week trends. "You spent 20% less on dining this week." |
| D4 | **Quick-add transaction** | One-tap/minimal-friction transaction entry. RealBudget advertises "optimized entry requiring just a few clicks." Most apps make this too many steps. | Med | Pre-selected envelope (if entering from envelope detail), amount-first entry, auto-date to today. |
| D5 | **Envelope templates/presets** | Pre-built envelope sets for common budgets (groceries, dining, gas, entertainment, etc.) to reduce setup friction. | Low | Offer 2-3 templates during onboarding. User can customize after. Reduces blank-slate paralysis. |
| D6 | **Rollover policy per envelope** | Let users choose per-envelope: carry surplus forward or reset to budget amount each week. Goodbudget and RealBudget offer rollover; making it per-envelope is more granular. | Med | "Savings" envelopes carry over (e.g., vacation fund). "Spending" envelopes reset. User chooses per envelope. |
| D7 | **Credit-based access model** | Paid via credits (100/week) rather than monthly subscription. Novel pricing for budgeting tools. All competitors use monthly/annual subscriptions. | Med | Integration with host site's credit system. Must handle: what happens when credits run out? Grace period? Read-only mode? |

---

## Anti-Features

Features to deliberately NOT build in v1. These are common in competitors but would bloat the product, violate the "focused mini-app" positioning, or add disproportionate complexity.

| # | Anti-Feature | Why Avoid | What to Do Instead | Complexity Saved |
|---|--------------|-----------|-------------------|------------------|
| A1 | **Bank account syncing** | Requires Plaid integration ($$$), security liability, ongoing maintenance, and regulatory concerns. YNAB and Goodbudget Premium charge specifically for this. It contradicts the "simple manual tracking" philosophy. | Manual transaction entry. This is explicitly the product's approach, same as Goodbudget Free and EveryDollar Free. | High |
| A2 | **Debt tracking/payoff calculator** | Feature creep into full financial management. YNAB and EveryDollar have this, but it's a separate product concern. | Stay focused on envelope spending. If users want debt tracking, recommend a dedicated tool. | High |
| A3 | **Multi-user/household sharing** | Adds real-time sync complexity, conflict resolution, permissions, and invitation flows. Goodbudget and YNAB offer this as a premium feature. | Single-user only in v1. Revisit if demand materializes. | High |
| A4 | **Goal setting / savings goals** | Different mental model from weekly spending envelopes. Goals are long-term; this product is weekly cadence. Mixing them confuses the UI. | The rollover policy per envelope (D6) partially addresses this for users who want to accumulate. | Med |
| A5 | **Bill reminders/notifications** | Requires notification infrastructure (push, email, or in-app). Budgeting apps that do this well (YNAB, EveryDollar) have dedicated notification systems. | Users manage bills outside this tool. This is a spending tracker, not a bill manager. | Med |
| A6 | **Income tracking** | Most envelope apps track income to enable zero-based budgeting. But this product has fixed weekly budgets per envelope -- income tracking is unnecessary overhead. | User sets envelope budgets. Where the money comes from is not the app's concern. | Low-Med |
| A7 | **Mobile native app (iOS/Android)** | This is a web mini-app inside dan-weinbeck.com. Building native apps is a massive scope expansion. | Responsive web design that works well on mobile browsers. Progressive enhancement, not native apps. | Very High |
| A8 | **CSV/data export** | Nice-to-have but not MVP. Users are unlikely to need raw data export in v1. | Defer to v2 if requested. | Low |
| A9 | **Recurring transactions** | Adds scheduling complexity (what day? what if it falls on weekend? edit one vs. all?). Most envelope apps treat each transaction as manual. | Users enter transactions as they happen. Weekly cadence means recurring bills are less relevant (they're likely monthly). | Med |
| A10 | **Dark mode / theme customization** | Must match host site design. Theming is the host site's responsibility, not this mini-app's. | Inherit styles from dan-weinbeck.com. If the host site adds dark mode, the mini-app gets it for free. | Low |
| A11 | **AI-powered insights / chatbot** | EveryDollar 2026 relaunch added AI coaching. This is massive scope and doesn't align with "simple focused tool." | Simple rule-based weekly summaries (D3) provide 80% of the value at 5% of the cost. | Very High |
| A12 | **Category-level spending reports** | Cross-envelope analytics (e.g., "all food-related spending") requires a tagging/categorization layer on top of envelopes. Over-engineering for v1. | Each envelope IS a category. Weekly analytics (D3) per envelope is sufficient. | Med |

---

## Feature Dependencies

```
Authentication (T11) ──> Everything else
Data Persistence (T12) ──> Everything else

Create Envelopes (T1) ──> Set Budget (T2)
                      ──> Record Transaction (T3)
                      ──> View Balance (T4)
                      ──> Dashboard (T8)

Set Budget (T2) ──> Weekly Reset/Refill (T6)
                ──> Overspending Indication (T9)

Record Transaction (T3) ──> Transaction History (T7)
                        ──> View Balance (T4)
                        ──> Edit/Delete Transaction (T10)

View Balance (T4) ──> Overspending Indication (T9)
                  ──> Transfer Between Envelopes (T5)

Weekly Reset/Refill (T6) ──> Rollover Policy (D6) [enhances]

Transaction History (T7) ──> Weekly Analytics (D3) [enhances]

Dashboard (T8) ──> Quick-Add Transaction (D4) [enhances]

Credit System (D7) ──> Authentication (T11) [requires]
```

### Critical Path for MVP

```
Phase 1 (Foundation):  T11, T12 ──> T1, T2
Phase 2 (Core Loop):   T3, T4, T10 ──> T7, T8, T9
Phase 3 (Envelopes):   T5, T6
Phase 4 (Polish):      D1 (baked in), D2, D4, D5
Phase 5 (Analytics):   D3
Phase 6 (Monetization): D7
```

---

## MVP Recommendation

### Must Ship (v1.0)

All Table Stakes features (T1-T12). Without these, the product is not a functioning envelope budgeting tool. These represent the minimum bar set by Goodbudget Free and EveryDollar Free.

### Should Ship (v1.0 if possible, v1.1 at latest)

- **D1: Weekly cadence** -- This is baked into the product from day one, not optional. All language, all cycles, all defaults are weekly.
- **D2: Simple card-based UI** -- This is a design constraint, not a feature to add later. Build it right from the start.
- **D4: Quick-add transaction** -- Transaction entry friction is the #1 reason users abandon budgeting apps. Optimize this early.
- **D5: Envelope templates** -- Low complexity, high impact on onboarding. Reduces time-to-value.
- **D7: Credit-based access** -- Required for monetization. Must work before launch since this is a paid product.

### Defer to v1.1+

- **D3: Weekly analytics** -- Valuable differentiator but can launch without it. Need enough usage data first anyway.
- **D6: Rollover policy per envelope** -- Nice granularity but v1 can ship with a single global rollover policy (either all carry over or all reset).

---

## Competitive Positioning Summary

| Axis | Competitors | Digital Envelopes |
|------|------------|-------------------|
| Budget period | Monthly default (weekly available in Goodbudget) | Weekly-first, weekly-only |
| Complexity | Full financial management suite | Focused spending envelopes only |
| Bank sync | Premium feature in most | Never (manual only, by design) |
| Pricing | $10-18/month subscription | 100 credits/week (host site currency) |
| Platform | Standalone apps + web | Mini-app embedded in existing site |
| Onboarding | Multi-step setup wizard | Templates + 2-minute setup |
| Target user | General budgeters | Weekly budgeters who want simplicity |

The competitive advantage is **focus**: fewer features done better, with a weekly cadence that no competitor prioritizes. The product wins by being the simplest, fastest envelope budgeting tool for people who think in weeks, not months.

---

## Sources

- [NerdWallet: Best Budget Apps for 2026](https://www.nerdwallet.com/finance/learn/best-budget-apps)
- [YNAB Features](https://www.ynab.com/features)
- [Goodbudget: What You Get](https://goodbudget.com/what-you-get/)
- [Goodbudget: Envelope Budgeting](https://goodbudget.com/envelope-budgeting/)
- [Goodbudget: How It Works](https://goodbudget.com/how-it-works/)
- [Goodbudget: Re-Fill Envelopes Each Period](https://goodbudget.com/help/budgeting-with-goodbudget/refill-each-period/)
- [Goodbudget: Weekly and More Envelope Periods](https://goodbudget.com/help/customize-your-goodbudget/weekly-and-more/)
- [EveryDollar Features - Ramsey Solutions](https://www.ramseysolutions.com/money/everydollar/features)
- [EveryDollar 2026 Relaunch Announcement](https://www.globenewswire.com/news-release/2026/01/08/3215300/0/en/)
- [RealBudget](https://realbudget.app/)
- [Actual Budget](https://actualbudget.org/)
- [Eleken: Budget App Design Tips](https://www.eleken.co/blog-posts/budget-app-design)
- [Academy Bank: Why Budgeting Apps Are Gaining Popularity](https://www.academybank.com/article/why-budgeting-apps-are-gaining-popularity-in-personal-finance)
- [LendEDU: EveryDollar Review 2026](https://lendedu.com/blog/everydollar-review/)
- [Goodbudget vs YNAB Comparison](https://goodbudget.com/blog/2022/12/goodbudget-vs-ynab-which-budget-app-is-for-you/)
