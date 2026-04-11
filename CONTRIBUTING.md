# Contributing to EduPlanner

Welcome — and thank you for your interest in EduPlanner! 🎉

EduPlanner is a free, role-based task planner built for Nigerian educators by [Harmony Digital Consults Ltd](https://harmonydigitalconsults.com). Whether you are a **teacher who spotted a bug**, a **school administrator with a great idea**, or a **developer ready to write code**, your contribution matters.

This guide explains every way you can help — no experience required.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Who Can Contribute?](#who-can-contribute)
3. [Reporting Bugs](#reporting-bugs)
4. [Suggesting Features](#suggesting-features)
5. [Contributing Code](#contributing-code)
   - [Getting Started](#getting-started)
   - [Branch & Commit Conventions](#branch--commit-conventions)
   - [Code Style Guidelines](#code-style-guidelines)
   - [CSS Conventions](#css-conventions)
   - [Accessibility Requirements](#accessibility-requirements)
   - [Testing Checklist](#testing-checklist)
   - [Opening a Pull Request](#opening-a-pull-request)
6. [How Educators Can Contribute (No Coding Needed)](#how-educators-can-contribute-no-coding-needed)
7. [Good First Issues](#good-first-issues)
8. [Attribution & Licensing](#attribution--licensing)

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). We are committed to keeping this community welcoming, respectful, and inclusive for everyone — from first-year teachers to senior developers.

---

## Who Can Contribute?

**Everyone.** EduPlanner is built *for* educators, so educator voices are just as important as code commits. Here is a quick map:

| I am a… | I can… |
|---|---|
| Teacher / Administrator | Report bugs, suggest features, suggest task templates, test the app, share with colleagues |
| Developer | Fix bugs, build features, improve performance, write docs |
| Designer | Improve the UI/UX, accessibility, and visual hierarchy |
| Translator | Translate the app into Yoruba, Hausa, Igbo, or Pidgin |

---

## Reporting Bugs

Found something broken? Please let us know!

**[Open a Bug Report →](.github/ISSUE_TEMPLATE/bug_report.yml)**

Before opening a new report, please [search existing issues](../../issues) to avoid duplicates. Include as much detail as possible — your browser, device, which role you were using, and the exact steps that triggered the problem. Screenshots are very helpful.

---

## Suggesting Features

Have an idea that would make EduPlanner more useful in your school?

**[Open a Feature Request →](.github/ISSUE_TEMPLATE/feature_request.yml)**

Great feature requests explain *who* benefits and *why* — a short scenario goes a long way. You do not need to know how to implement it.

---

## Contributing Code

### Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/eduplanner.git
   cd eduplanner
   ```
3. There is **no build step**. Open `index.html` directly in your browser — that is all you need.
4. Make your changes and test them (see the [Testing Checklist](#testing-checklist)).
5. Push to your fork and open a Pull Request.

### Branch & Commit Conventions

Use descriptive branch names:

```
fix/dark-mode-export-button
feat/librarian-overdue-tasks
docs/update-contributing-guide
chore/service-worker-cache-version
```

Write commit messages in the imperative mood, present tense:

```
✓  Fix dark mode contrast on task cards
✓  Add weekly summary export for Administrators
✗  Fixed bug
✗  changes
```

Reference relevant issue numbers in your commit body or PR description (e.g., `Closes #42`).

### Code Style Guidelines

EduPlanner is intentionally **vanilla** — no frameworks, no bundlers, no build tools. Please keep it that way.

- **JavaScript:** Plain ES6+. No jQuery, React, Vue, or any external JS library beyond SheetJS (already included).
- **Keep it lightweight:** Avoid adding new dependencies. If a native browser API can do the job, use it.
- **Functions over classes:** Prefer small, focused functions. Group related helpers in clearly named sections inside `app.js`.
- **`const` by default**, `let` when reassignment is needed. Never use `var`.
- **Meaningful names:** `renderTaskList()` not `fn1()`. Variables that hold DOM elements should be named after what they represent (`taskCard`, `exportBtn`).
- **Comments:** Explain *why*, not *what*. Complex logic should have a short explanatory comment.
- **No `console.log` in committed code** unless it is inside a clearly marked debug utility.
- **Offline-first:** Any new data-persistence logic must use `localStorage`. Do not introduce network-dependent features without a graceful offline fallback.

### CSS Conventions

The stylesheet lives entirely in `style.css`. All colours, spacing, and typography are defined as **CSS custom properties** at the `:root` level.

**Always use the design tokens — never hard-code hex values in component rules:**

```css
/* ✓ Correct */
.task-card {
  background-color: var(--color-surface);
  border-left: 4px solid var(--color-primary);
}

/* ✗ Wrong */
.task-card {
  background-color: #ffffff;
  border-left: 4px solid #1B5E4B;
}
```

**Key design tokens:**

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#1B5E4B` (Forest Green) | Primary actions, headers |
| `--color-accent` | `#C4960A` (Warm Gold) | Highlights, badges |
| `--color-surface` | varies | Card and panel backgrounds |
| `--color-text` | varies | Body text |

**Naming:** Use a BEM-like convention for new components:

```css
/* Block */
.task-card { }

/* Element */
.task-card__title { }
.task-card__meta { }

/* Modifier */
.task-card--completed { }
.task-card--overdue { }
```

**Dark mode** is handled via the `[data-theme="dark"]` attribute on `<body>`. When adding new rules, always check whether a dark-mode override is needed and add it inside the appropriate `[data-theme="dark"]` block.

### Accessibility Requirements

EduPlanner targets **WCAG 2.1 Level AA**. All contributions must meet these standards:

- **Semantic HTML:** Use the correct element for the job (`<button>` for actions, `<nav>` for navigation, `<main>` for the primary content area, `<section>`/`<article>` where appropriate).
- **Keyboard navigation:** Every interactive element must be reachable and operable via keyboard alone. Tab order must be logical. No keyboard traps.
- **Focus styles:** Never remove `:focus` outlines. You may restyle them, but they must remain clearly visible.
- **Colour contrast:** Text must meet a minimum 4.5:1 contrast ratio against its background (3:1 for large text). Use the [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) to verify.
- **ARIA attributes:** Use ARIA only where native semantics are insufficient. Prefer semantic HTML first. Dynamic content updates (e.g., task list changes) should use `aria-live` regions where appropriate.
- **Images and icons:** All meaningful images need descriptive `alt` text. Decorative images use `alt=""`. Icon-only buttons need an `aria-label`.
- **Form labels:** Every form input must have an associated `<label>` (visible or visually hidden).

### Testing Checklist

Before opening a Pull Request, run through these checks manually:

**Themes**
- [ ] Light mode looks correct and has no regressions
- [ ] Dark mode looks correct and has no regressions
- [ ] Theme toggle switches correctly and persists on reload

**Responsiveness**
- [ ] Layout is usable on mobile (≤ 480 px)
- [ ] Layout is usable on tablet (481 – 1024 px)
- [ ] Layout is usable on desktop (≥ 1025 px)

**Roles** — test your change under each of the six roles:
- [ ] Teacher
- [ ] Administrator
- [ ] Head of Department
- [ ] ICT Coordinator
- [ ] Librarian
- [ ] School Counselor

**Export functions**
- [ ] PDF export generates correctly
- [ ] Excel export generates correctly (via SheetJS)
- [ ] Exported file name is sensible

**PWA / Offline**
- [ ] Service worker registers without errors (check DevTools → Application)
- [ ] App loads when network is disabled (Chrome DevTools → Offline)

**Accessibility**
- [ ] All interactive elements are keyboard-accessible
- [ ] Focus outlines are visible
- [ ] No obvious contrast failures

### Opening a Pull Request

1. Ensure your branch is up to date with `main`.
2. Open a PR against the `main` branch of the upstream repository.
3. Fill in the [Pull Request template](.github/PULL_REQUEST_TEMPLATE.md) completely.
4. Link any issues your PR closes (e.g., `Closes #42`).
5. A maintainer will review your PR, leave feedback if needed, and merge once it is ready.

We aim to respond to all PRs within **7 days**. Thank you for your patience.

---

## How Educators Can Contribute (No Coding Needed)

You do not need to write a single line of code to make EduPlanner better. Here is how educators can have a real impact:

### Suggest New Task Templates

Each role in EduPlanner comes pre-loaded with tasks. You can help us make those lists more useful and accurate.

**[Suggest Task Templates →](.github/ISSUE_TEMPLATE/task_template_suggestion.yml)**

Think about tasks that come up every day, every week, or every month in your role that are not already in the app. Even a simple list of bullet points is incredibly helpful.

### Propose New Roles

Does your school have a role not covered by the current six? Deputy Principal? Bursar? Sports Coordinator? Let us know by [opening a Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml) and describing the role and typical tasks.

### Test on Different Devices and Browsers

EduPlanner should work on the wide variety of devices used in Nigerian schools — older Android phones, basic tablets, and shared desktop computers. If you find anything broken on your device, please [report a bug](.github/ISSUE_TEMPLATE/bug_report.yml). Mention your device model and browser version.

### Translate to Local Languages

EduPlanner currently ships in English. We would love to support:

- **Yoruba**
- **Hausa**
- **Igbo**
- **Nigerian Pidgin**

If you speak one of these languages and are willing to help translate the interface labels, please [open a Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml) with the label `translation` and we will coordinate with you directly.

### Share with Schools and Report Feedback

Word of mouth is powerful. Share EduPlanner with your colleagues and school network. If they have feedback — positive or critical — please bring it back to us via the issue tracker. Real-world usage feedback shapes every new release.

---

## Good First Issues

New to open source? These are great places to start:

| Task | Skills needed | Where to start |
|---|---|---|
| Fix a typo or improve wording in the UI | None | Edit `index.html` |
| Add a missing ARIA label to an icon button | Basic HTML | Edit `index.html` |
| Improve dark mode contrast for a specific element | Basic CSS | Edit `style.css` |
| Add a new task template for an existing role | JavaScript basics | Edit `app.js` |
| Write a missing `alt` attribute for an icon | Basic HTML | Edit `index.html` |
| Improve mobile layout for a specific section | CSS | Edit `style.css` |
| Suggest or add a new role's task list | JavaScript basics | Edit `app.js` |

Look for issues tagged **`good first issue`** in the [issue tracker](../../issues?q=is%3Aopen+label%3A%22good+first+issue%22) for curated beginner-friendly tasks.

Not sure where to start? Open a [Discussion](../../discussions) and introduce yourself — we are happy to point you in the right direction.

---

## Attribution & Licensing

EduPlanner is developed and maintained by **Harmony Digital Consults Ltd** (Nigeria).

All contributions are licensed under the project's existing [MIT License](LICENSE). By submitting a contribution, you agree that your work may be distributed under those terms.

Questions? Reach us at **eziekechukwuemerie@gmail.com**.
