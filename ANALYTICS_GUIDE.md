# Tracking Platform Analytics

Because EduPlanner is a lightweight, zero-backend, purely client-side static web application, it does not inherently send user data back to a server. All task data remains locally in the user's browser via `localStorage`.

If you want to track usage (e.g., how many educators visit the site, which roles are most popular, or daily pageviews), you must embed a third-party analytics script into `index.html`.

Here are two highly recommended options for simple static sites:

---

## Option 1: Plausible Analytics (Recommended - Privacy Friendly)
Plausible is lightweight, doesn't use cookies, and is GDPR compliant out of the box.

1. Sign up for [Plausible](https://plausible.io/).
2. Add your domain (e.g., `eduplanner.harmonydigitalconsults.com.ng`).
3. Copy the provided snippet.
4. Open `index.html` and paste the snippet directly inside the `<head>` tag.

**Example snippet:**
```html
<script defer data-domain="eduplanner.harmonydigitalconsults.com.ng" src="https://plausible.io/js/script.js"></script>
```

---

## Option 2: Google Analytics (GA4)
Google Analytics is free and powerful, but uses cookies and may require a cookie consent banner depending on your users' regions.

1. Sign up for [Google Analytics](https://analytics.google.com/).
2. Create a "Web" Data Stream and get your `G-XXXXXXXXXX` Measurement ID.
3. Open `index.html` and paste the snippet right below the `<head>` tag.

**Example snippet:**
```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Tracking Custom Events
If you want to track specific button clicks (like when someone clicks "Export PDF" or switches roles), you can add custom event triggers into `app.js`:

```javascript
// Example: Put this inside the Export PDF click listener in app.js
if (typeof gtag !== 'undefined') {
  gtag('event', 'export_pdf', { 'role': currentRole });
}
```
