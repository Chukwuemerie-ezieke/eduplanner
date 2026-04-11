## Description

<!-- Describe your changes clearly and concisely. What problem does this PR solve, and how? -->



## Related Issue(s)

<!-- Link to any issues this PR addresses. Use "Closes #XX" to auto-close on merge. -->

Closes #

---

## Type of Change

<!-- Check all that apply. -->

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Task template update (new or modified tasks for a role)
- [ ] Documentation update (CONTRIBUTING.md, README.md, code comments, etc.)
- [ ] UI/UX improvement (layout, styling, accessibility, responsiveness)
- [ ] Breaking change (fixes or features that would cause existing functionality to behave differently)
- [ ] Other (please describe):

---

## Testing Checklist

Please confirm you have tested your changes by checking all applicable boxes. If an item does not apply to your PR, mark it and add a note.

**Themes**
- [ ] Tested in **light mode** — no visual regressions
- [ ] Tested in **dark mode** — no visual regressions

**Responsiveness**
- [ ] Tested on **mobile** (≤ 480 px) — layout is usable
- [ ] Tested on **desktop** (≥ 1025 px) — layout is usable

**Roles** — verified that the change works correctly for all six roles:
- [ ] Teacher
- [ ] Administrator
- [ ] Head of Department
- [ ] ICT Coordinator
- [ ] Librarian
- [ ] School Counselor

**Export Functions**
- [ ] **PDF export** generates and downloads correctly
- [ ] **Excel export** generates and downloads correctly (SheetJS)

**PWA / Offline**
- [ ] App loads correctly when network is disabled (Chrome DevTools → Offline)
- [ ] Service worker registers without console errors

**Accessibility**
- [ ] All new interactive elements are keyboard-accessible (Tab / Enter / Space)
- [ ] Focus outlines are visible and not removed
- [ ] New images have descriptive `alt` text; decorative images use `alt=""`
- [ ] No obvious colour contrast failures (checked with WebAIM Contrast Checker or similar)

---

## Screenshots

<!-- If this PR includes any UI changes, please add before/after screenshots or a screen recording. This helps reviewers and is required for UI/UX PRs. -->

| Before | After |
|--------|-------|
| _(screenshot)_ | _(screenshot)_ |

---

## Additional Notes

<!-- Anything else reviewers should know? Tradeoffs, follow-up issues, known limitations? -->
