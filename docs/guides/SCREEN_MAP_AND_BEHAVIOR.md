# Mercury — Screen Map and Behavior

This is the plain-English map of every screen in Mercury, how they connect,
and how each one behaves — what a normal, empty, loading, and broken
version of it looks like. No code, no file paths, no syntax. Read this
alongside `SYSTEM_OVERVIEW.md` (the big picture) and
`LIFECYCLE_AND_JOURNEYS.md` (the step-by-step walk-throughs) for the full
plain-English picture.

---

## The full screen map

Every screen in Mercury falls into one of three groups: the four **main
tabs** (always reachable via the bottom bar), **pop-up screens** that slide
up over a tab and are dismissed back to it, and a small number of **hidden
utility screens** not reachable from anywhere in the normal interface.

```mermaid
graph TD
    Intro["Introduction<br/>(first launch only)"] --> Home

    subgraph MainTabs["Main tabs — always reachable via the bottom bar"]
        Home["Home"]
        Activity["Activity"]
        Budgets["Budgets"]
        Insights["Insights"]
    end

    Home -->|"See all"| Activity
    Home -->|gear icon| Settings
    Home -->|"Manage" / tap an account| AccountsList
    Home -->|"Add" account| AddAccount
    Home -->|tap a transaction| AddEditTransaction
    Home -->|floating '+' button| AddEditTransaction

    Activity -->|tap a transaction| AddEditTransaction
    Activity -->|floating '+' button| AddEditTransaction

    Budgets -->|"+" / empty-state button| AddEditBudget
    Budgets -->|tap a budget| AddEditBudget
    Budgets -->|floating '+' button| AddEditTransaction

    Insights -->|Recurring tab, empty state / "+"| RecurringHub
    Insights -->|Recurring tab, tap a rule| RecurringHub
    Insights -->|Shared tab, empty state / "+"| SplitCreate
    Insights -->|Shared tab, tap a split| SplitDetail
    Insights -->|floating '+' button| AddEditTransaction

    AccountsList["Accounts list"] -->|"Add account"| AddAccount
    AccountsList -->|tap an account| AddAccount
    AccountsList -->|"Transfer" tile| AddEditTransaction

    AddEditTransaction["Add / Edit Transaction"] -->|"manage" categories| ManageCategories
    AddEditTransaction -->|"Add subcategory"| ManageSubcategories
    AddEditTransaction -->|"Split Details" chip| SplitDetail

    AddAccount["Add / Edit Account"]
    AddEditBudget["Add / Edit Budget"] -->|"manage" categories| ManageCategories

    Settings["Settings"] --> ManageCategories
    Settings --> AccountsList
    Settings -->|"Recurring payments"| RecurringHub
    Settings -->|"Widget quick presets"| QuickPresets
    Settings -->|"Import bank statement"| BankImport
    Settings -->|"Fill test data"| FillTestData

    RecurringHub["Recurring Payments<br/>(list + form)"] -->|"manage" categories| ManageCategories

    SplitCreate["Split Expense<br/>(create)"] -->|"manage" categories| ManageCategories
    SplitCreate -->|on save| SplitDetail
    SplitDetail["Split Detail /<br/>Settle Up"]

    BankImport["Bank Statement Import"] --> ManageCategories

    ManageCategories["Manage Categories"]
    ManageSubcategories["Manage Subcategories"]
    QuickPresets["Widget Quick Presets"]
    FillTestData["Fill Test Data<br/>(developer/QA tool)"]

    style Diagnostics fill:#eee,stroke:#999,stroke-dasharray: 5 5
    Diagnostics["Diagnostics<br/>(hidden — no button<br/>anywhere leads here)"]
```

A note on the dashed "Diagnostics" box: it genuinely exists in the app and
does real work (checking that the database is healthy), but there is
currently no button, link, or menu item anywhere in Mercury's interface
that leads to it — it's only reachable by someone deliberately typing a
special address into the device, which an ordinary user would never do.
It's included here for completeness, not because you'll ever find it.

---

## How to read the pop-up screens

Every screen that isn't one of the four main tabs slides up from the
bottom over whatever you were looking at, with a close button (an ✕ or a
back arrow) in the top-left and, usually, a delete button in the top-right
when you're editing something that can be deleted. Closing one always
returns you to exactly where you were — nothing is ever lost by backing
out.

A handful of these pop-ups currently animate as a plain sideways slide
instead of the bottom-sheet-style pop-up treatment every other pop-up
screen gets — Manage Subcategories, the Recurring Payments screen, the
Split Expense screens, and Bank Statement Import. They still work exactly
the same way (same close button, same behavior) — the only difference is
a slightly different, less "pop-up-feeling" opening animation. It's a
minor visual inconsistency, not a functional one.

---

## Structural wireframes

These are simplified, structural sketches — not exact pixel layouts —
meant to show what's on each screen and where, in relation to everything
else.

### The bottom navigation bar (visible on all four main tabs)

```
┌──────────────────────────────────────────────────────┐
│                                                        │
│   [ Home ]   [ Activity ]  ( + )  [ Budgets ] [ Insights ]│
│                              ↑                        │
│                     always opens a blank              │
│                     new-transaction form               │
└──────────────────────────────────────────────────────┘
```

The "+" button sits in the visual center, slightly larger and more
prominent than the four tab icons around it. Tapping an already-selected
tab does nothing — it doesn't scroll back to the top or reset that tab, it
simply stays where you were.

### Home

```
┌──────────────────────────────────────────────────────┐
│  ⚙ (Settings)                                         │
│                                                        │
│           ╭─────────────────────────╮                │
│           │   (large rounded         │                │
│           │    "hero" card)          │  ← your total  │
│           │    Total Balance         │    balance,     │
│           │    ₹ 45,230              │    with small   │
│           │                          │    floating     │
│           ╰─────────────────────────╯    account       │
│                                            bubbles      │
│                                            around it    │
│                                                        │
│   [ Income: ₹12,000 ]   [ Spent: ₹8,400 ]             │
│                                                        │
│   Accounts →  [Cash] [Bank] [Card] [+ Add]            │
│                                                        │
│   Recent activity                        See all →    │
│   ┌────────────────────────────────────────────────┐ │
│   │ ☕ Coffee            −₹150      Today            │ │
│   │ 💰 Salary          +₹50,000     Yesterday        │ │
│   │ 🛒 Groceries         −₹2,300    Yesterday        │ │
│   └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Add / Edit Transaction (a pop-up screen)

```
┌──────────────────────────────────────────────────────┐
│  ✕      New Transaction / Edit Transaction      🗑    │
│                                                        │
│   [ Expense ]  [ Income ]  [ Transfer ]               │
│                                                        │
│   ╭─────────────────────────────────────────────╮    │
│   │              ₹ 1,250                          │   │
│   ╰─────────────────────────────────────────────╯    │
│                                                        │
│   Account:  [Cash] [Bank] [Card]                      │
│   Category: [🛒] [☕] [🏠] [+]                         │
│   Subcategory (if any): [Fruits] [Snacks] [+ Add]     │
│                                                        │
│   Note: ________________     Payee: ________________  │
│   Date: Today                                          │
│                                                        │
│   [ Repeat this payment ]   [ Split with others ]     │
│                                                        │
│   ┌───────────────────────────────────────────────┐  │
│   │  1   2   3                                     │  │
│   │  4   5   6            (number pad)             │  │
│   │  7   8   9                                     │  │
│   │  .   0   ⌫                                      │  │
│   └───────────────────────────────────────────────┘  │
│                        [ Save ]                        │
└──────────────────────────────────────────────────────┘
```

### Settings (a pop-up screen, a menu of rows)

```
┌──────────────────────────────────────────────────────┐
│  ✕                Settings                            │
│                                                        │
│   Manage categories                                 › │
│   Accounts                                          › │
│   Recurring payments                                › │
│   Widget quick presets                              › │
│   Import bank statement (CSV)                       › │
│   Fill test data (custom size)                      › │
│   ──────────────────────────────────────────────      │
│   Export data                                          │
│   Import data                                          │
│   Reset all data                                        │
└──────────────────────────────────────────────────────┘
```

---

## Behavior rules, per screen

For each screen: what it looks like normally, what happens if there's
nothing to show, what happens while something is loading, and what
happens if something goes wrong.

### Home

- **Normal**: balance hero card, income/spent summary for the current
  month, a horizontally-scrolling row of your accounts, and your five most
  recent transactions.
- **Empty**: if you have no transactions yet, the recent-activity section
  simply shows a quiet "Nothing here yet" message instead of a list — the
  rest of the screen still works normally.
- **Loading**: unlike the other three tabs, Home does not currently show
  any loading placeholder while its numbers are being fetched — it appears
  as soon as it can, which in practice is fast enough that this is rarely
  noticeable, but it is a slight inconsistency with the other tabs
  described below.
- **Error**: Home doesn't have its own error state — if a save fails
  anywhere in the app, the shared red banner (see "Something goes wrong,"
  below) appears above every screen including this one.

### Activity

- **Normal**: a search bar, filter chips (All / Spending / Income /
  Transfers), and your transactions grouped by day, newest first, loading
  more automatically as you scroll.
- **Empty**: "No matches" with a message that adjusts depending on whether
  you're searching for something specific or genuinely have no
  transactions at all yet.
- **Loading**: while the screen is first settling in (briefly, right after
  switching to this tab) or fetching its first page of results, a grayed
  placeholder mimicking the shape of the real list is shown instead of a
  spinner.
- **Error**: same shared red banner as Home; no separate error view specific to this screen.

### Budgets

- **Normal**: a month selector at the top, an overall progress summary,
  and a list of each budget with how much of its monthly limit has been
  used.
- **Empty**: "No budgets yet" with a button to create your first one.
- **Loading**: a grayed placeholder shaped like the real content, shown
  briefly while the screen settles in.
- **Error**: same shared red banner; no separate error view.

### Insights

- **Normal**: a three-way switch at the top (Spending / Recurring /
  Shared) changes the entire content below it.
  - **Spending**: an income/expense toggle, currency selector if you use
    more than one, filter options, a headline number, a trend line over
    time, a category breakdown donut chart, a calendar-style activity
    heatmap, and a day-of-week bar chart.
  - **Recurring**: a "monthly commitment" summary card, what's due in the
    next 30 days, and the full list of recurring rules.
  - **Shared**: a "total owed to you" summary card and a list of
    unsettled splits.
- **Empty**: each of the three views has its own empty message — no data
  in range for Spending, no rules yet for Recurring, no splits yet for
  Shared. Worth knowing: the Recurring and Shared empty states are visibly
  slightly different in style from Spending's (and from every other tab's)
  standard empty-state look — a small, cosmetic inconsistency, not a
  functional one.
- **Loading**: same grayed-placeholder pattern as Activity/Budgets while
  first settling in, plus, uniquely on this screen, a second, separate
  "Updating…" indicator with a slightly dimmed view of the existing
  content whenever you change a filter and it's re-fetching.
- **Error**: if fetching the Recurring or Shared data fails for any
  reason, there is currently no distinct error message shown — it looks
  exactly the same as if you simply had no recurring rules or splits yet,
  which can be misleading if it happens.

### Accounts list

- **Normal**: a card per account with its name, type, and current
  balance, plus (once you have two or more accounts) a "Transfer" shortcut.
- **Empty**: an "Add your first account" prompt.
- **Loading / Error**: no distinct states — accounts load quickly since
  there are typically only a handful.

### Add / Edit Transaction

- **Normal (new)**: opens blank, defaulting to Expense, today's date, and
  your first account.
- **Normal (editing)**: opens pre-filled with everything you'd already
  entered, plus a delete option and, if the transaction is part of a split,
  a "Split Details" shortcut.
- **Loading**: when opening an existing transaction to edit, there's a
  brief moment where the fields populate — there's no visible loading
  indicator for that moment, they simply appear once ready.
- **Error**: if saving fails, a plain pop-up alert explains it (distinct
  from the persistent red banner reserved for a broader class of failures
  — see below). If you cancel a delete, nothing happens; if you confirm,
  the transaction is gone and you're returned to where you came from.

### Add / Edit Account, Add / Edit Budget

- **Normal**: a straightforward form (name, type/category, starting
  amount, color/icon where relevant); editing pre-fills everything.
- **Empty / Loading**: not applicable — these are simple forms with
  nothing to fetch.
- **Error**: save/delete failures show a plain pop-up alert.

### Manage Categories / Manage Subcategories

- **Normal**: a list you can add to, rename, recolor, or delete from
  directly, split between Spending and Income for categories.
- **Empty**: subcategories start empty for any category that doesn't have
  any yet — an unobtrusive prompt invites you to add one.
- **Deleting**: deleting a category or subcategory you've already used
  doesn't delete the transactions that used it — they're kept, just
  without that particular label going forward. The app tells you this
  explicitly when you confirm a delete.

### Recurring Payments

- **Normal (list view)**: opened from Settings or from Insights' empty
  state — a summary of your total monthly commitment, what's due soon,
  and the full list, each with a switch to pause/resume it without
  deleting it.
- **Normal (form view)**: opened directly when creating a new rule or
  editing an existing one — the same fields you'd expect (amount, account,
  category, how often, starting date, whether to auto-create or just
  remind).
- **Empty**: "No recurring payments yet" with a button to add one.
- Deleting a rule keeps any transactions it already created in your
  history — only the rule itself, and any future occurrences, go away.

### Split Expense (create) / Split Detail

- **Create screen**: enter the total, choose who's splitting it and how
  (evenly, by percentage, or custom amounts), and save — you're taken
  straight to the Detail screen for that split.
- **Detail screen**: shows the total, how much has been collected so far,
  and each person's status (not yet paid / partially paid / fully paid),
  with a way to record a payment from any one person, or settle everyone
  at once.
- **Empty**: Insights' Shared view shows "No splits yet" until you create
  your first one; once you have splits but they're all settled, it shows
  a distinct "All caught up!" message instead of the standard empty state.

### Bank Statement Import

- **Normal**: a step-by-step flow — choose the file, match its columns to
  date/description/amount, review what was found (with likely duplicates
  flagged and unchecked by default), then import.
- **Known issue**: as documented in `LIFECYCLE_AND_JOURNEYS.md`, this
  screen currently reports success incorrectly and the transactions it
  imports don't correctly affect your balances or charts. Treat this
  screen as not yet reliable.

### Widget Quick Presets

- **Normal**: a simple list of the presets available on your home-screen
  widget (name, emoji, amount, account, category), editable and
  deletable, with changes reflected on any placed widget shortly after
  saving.

### Fill Test Data

- **What it is**: a developer/QA utility for generating a large amount of
  synthetic transaction history, to test how the app behaves with a lot of
  data. Not something an everyday user needs, but present in Settings for
  anyone who wants to stress-test their own device.
- **Behavior**: choose how much data to generate, and it runs with a
  visible progress indicator; you can close the screen while it's still
  running and it keeps going in the background, with a notification when
  it finishes if you've since left the app entirely.

---

## Something goes wrong, everywhere

Two distinct patterns cover every failure in the app, and they're worth
telling apart:

1. **A persistent, hard-to-miss red banner** appears at the top of every
   screen, no matter which one you're on, whenever something fails to
   save to your device. It doesn't go away on its own — it stays until a
   save succeeds again — and tapping it takes you to Settings, where
   exporting a backup is the safest immediate next step. This is reserved
   specifically for save failures, because a failed save means what you
   see on screen might be temporarily ahead of what's actually stored.
2. **An ordinary pop-up alert with an OK button** covers everything else —
   a receipt scan that couldn't read an image, a form that failed to
   save for some other reason, confirming before you delete something.
   These are routine, expected interruptions, not signs that anything is
   broken.

If the app fails to load your data at all when it starts up (rare), it
still shows you the app rather than getting stuck on the splash screen —
you'll just see it alongside the persistent red banner from the moment it
appears, so you're never left looking at a screen that seems frozen with
no explanation.
