# Changelog

All notable changes to EduPlanner. The version shown in the app footer matches the newest entry here.

## 2.0.1 (November 2026)

### Fixed
- The first time the app opened on a device (for example after restoring a backup on a new phone), ticked tasks were cleared. Existing ticks are now kept.
- Backups now record when their ticks were current. Restoring an older backup resets any day, week or month that has since ended, and saves it to history, instead of showing old ticks as today's.

## 2.0.0 (November 2026)

### New
- **Term report:** a printable record of completed tasks for any date range, with a summary, week-by-week progress, completion per task, a comments box and signature lines for the staff member, HOD and principal.
- **Completion history:** when a day, week or month ends, the app saves what was done before the ticks reset.
- **School terms:** set the three term dates and mid-term breaks once. The app shows the current term and week, skips holidays and breaks in history, and the term report picks the term automatically.
- **Edit tasks:** change a task's text, frequency, due date or tag. Subtasks can be removed.
- **French and Nigerian Pidgin:** the whole interface and all 105 built-in tasks, plus exports and messages. French browsers start in French.
- **Recently deleted:** deleted and cleared tasks can be restored for 30 days.
- **Backups:** one file now holds tasks, custom roles, quick notes, history and term dates. Reminders appear when a backup is overdue, and new visitors are offered a restore.

### Changed
- **Analytics is opt-in:** nothing is sent until the user clicks Allow, and Do Not Track / Global Privacy Control are respected.
- **Browser pop-ups replaced** by an in-app dialog that is translated and works with the keyboard.
- **Quick Notes** is a small round button on phones, so it no longer covers the task list, and can be opened with the keyboard.
- **App updates reach installed copies:** the service worker fetches new files first and falls back to the cache offline.
- The version number is shown in the footer.

### Fixed
- The task list was empty on load, and adding a task crashed.
- The app failed to start on browsers without notifications (iOS Safari).
- The page was wider than phone screens.
- A shared link could inject a script; shared links and backups are now validated.
- Unreadable saved data was silently replaced; it is now kept, with a warning.
- A full storage quota failed silently; a warning now offers a backup.
- The daily reset and reminders used UTC instead of the local date.

### For developers
- Browser smoke tests (`npm test`) run on every pull request.
- `npm run screenshots` regenerates the README screenshots.
- Translations live in `i18n.js`, built-in tasks in `default-tasks.js`, the dialog in `dialog.js` and the term report layout in `report.js`.

## 1.0.0

First release: six roles with built-in daily, weekly and monthly tasks, custom tasks, PDF and Excel export, offline support, dark mode.
