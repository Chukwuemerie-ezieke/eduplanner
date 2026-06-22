# Tracking Platform Analytics

Because EduPlanner is a lightweight, zero-backend, purely client-side static web application, it does not inherently send user data back to a server. All task data remains locally in the user's browser via `localStorage`.

If you want to track usage (e.g., how many educators visit the site, which roles are most popular, or daily pageviews), you must embed a third-party analytics script into `index.html`.

Since budget is often a concern, here are the best **100% free or generous free-tier** analytics platforms you can use:

---

## 1. Cloudflare Web Analytics (100% Free & Privacy-First)
If you already use Cloudflare for DNS, this is the best option. It is completely free, does not use cookies (so no cookie banners needed), and doesn't collect personal IP addresses.

1. Log into your Cloudflare dashboard.
2. Go to **Web Analytics** -> **Add Site**.
3. Enter your domain (e.g., `eduplanner.harmonydigitalconsults.com.ng`).
4. Copy the JS snippet provided and paste it right before the closing `</body>` tag in `index.html`.

**Example snippet:**
```html
<!-- Cloudflare Web Analytics -->
<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "YOUR_TOKEN"}'></script>
<!-- End Cloudflare Web Analytics -->
```

---

## 2. Umami Analytics (Generous Free Tier)
Umami is an open-source, privacy-focused alternative to Google Analytics. Their cloud version offers 10,000 pageviews per month for free, which is usually plenty for a single school or small community.

1. Sign up for [Umami Cloud](https://umami.is/).
2. Add your website.
3. Copy the script snippet and place it in the `<head>` of your `index.html`.

**Example snippet:**
```html
<script defer src="https://cloud.umami.is/script.js" data-website-id="YOUR-UUID-HERE"></script>
```

---

## 3. PostHog (Massive Free Tier)
PostHog is an extremely powerful product analytics tool. While it can do complex funnels and session recordings, it is free for up to 1,000,000 events per month.

1. Sign up for [PostHog](https://posthog.com/).
2. Get your Project API Key.
3. Paste their snippet in the `<head>` of `index.html`.

---

## 4. Google Analytics (GA4 - Free, but requires Cookie Banners)
Google Analytics is totally free, but because it sets cookies to track users across sessions, you are legally required to put a "Cookie Consent Banner" on your site for users in certain regions (like Europe or California).

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
If you choose a platform like Google Analytics or PostHog, you can track specific button clicks (like when someone clicks "Export PDF" or switches roles) by adding custom event triggers into `app.js`:

```javascript
// Example for Google Analytics inside app.js:
if (typeof gtag !== 'undefined') {
  gtag('event', 'export_pdf', { 'role': currentRole });
}

// Example for PostHog inside app.js:
if (typeof posthog !== 'undefined') {
  posthog.capture('export_pdf_clicked', { role: currentRole });
}
```
