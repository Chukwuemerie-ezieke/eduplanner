# EduPlanner

A free, role-based task planner for educators, administrators, and school staff. Built by **Harmony Digital Consults Ltd**.

## Features

- **6 Dedicated Roles**: Teacher, Administrator, Head of Department, ICT Coordinator, Librarian, School Counselor
- **Pre-populated Tasks**: Each role comes with suggested daily, weekly, and monthly tasks
- **Add Custom Tasks**: Add your own tasks to any frequency category
- **Export to PDF**: Generate printable task reports
- **Export to Excel**: Download task data as .xlsx spreadsheets
- **Works Offline (PWA)**: Install on your phone or computer — works without internet
- **Dark Mode**: Automatic detection + manual toggle
- **No Account Needed**: Data stays on your device via localStorage
- **100% Free & Open Source**: MIT License

## Getting Started

1. Open the app in any browser
2. Select your role
3. Review pre-populated tasks or add your own
4. Track progress with checkboxes
5. Export your tasks as PDF or Excel when needed

## Tech Stack

- Vanilla HTML, CSS, JavaScript (no framework dependencies)
- SheetJS for Excel export
- Service Worker for offline capability
- General Sans font via Fontshare

## Self-Hosting

Simply serve the files from any static web server. No build step required.

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx serve .
```

## License

MIT License — See [LICENSE](LICENSE) file.

## Credits

Built by [Harmony Digital Consults Ltd](https://harmonyconsults.com)
