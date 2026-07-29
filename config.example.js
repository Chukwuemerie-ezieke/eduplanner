window.EDUPLANNER_CONFIG = {
    // Set to true to enable analytics tracking.
    // If false, the analytics module is disabled and will not queue or send events.
    ANALYTICS_ENABLED: false,

    // Turn this on to see console logs for analytics events (useful for local testing)
    ANALYTICS_DEBUG: true,

    // Cloudflare Web Analytics Token
    // Leave empty to disable Cloudflare Web Analytics
    CLOUDFLARE_TOKEN: "",

    // PostHog Analytics configuration
    // Leave POSTHOG_PROJECT_API_KEY empty to disable PostHog
    POSTHOG_PROJECT_API_KEY: "",
    POSTHOG_HOST: "https://eu.i.posthog.com" // or "https://us.i.posthog.com"
};
