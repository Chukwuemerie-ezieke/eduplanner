(function () {
    // Analytics module configuration
    const config = window.EDUPLANNER_CONFIG || { ANALYTICS_ENABLED: false };
    const IS_ENABLED = config.ANALYTICS_ENABLED === true;
    const IS_DEBUG = config.ANALYTICS_DEBUG === true;

    // Allowed event names and properties to ensure strict privacy
    const ALLOWED_EVENTS = [
        'app_open',
        'session_start',
        'pwa_install',
        'a2hs_accepted',
        'task_create',
        'task_complete',
        'task_uncomplete',
        'task_delete',
        'planner_view',
        'export_data',
        'import_data',
        'settings_change',
        'theme_change',
        'error_occurred'
    ];

    const ALLOWED_PROPERTIES = [
        'event_name',
        'timestamp',
        'app_version',
        'route',
        'screen',
        'online',
        'setting_key',
        'theme_name',
        'error_code',
        'component_name',
        'task_count_bucket',
        'role',
        'frequency',
        'export_type'
    ];

    const QUEUE_KEY = 'eduplanner_analytics_queue';
    const MAX_QUEUE_SIZE = 100;
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Check Do Not Track
    const doNotTrack = (navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl === true);

    if (IS_ENABLED && doNotTrack) {
        if (IS_DEBUG) console.info('[Analytics] Disabled via Do Not Track (DNT) / GPC.');
    }

    const SHOULD_TRACK = IS_ENABLED && !doNotTrack;

    // Load queue from localStorage
    function loadQueue() {
        try {
            return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    function saveQueue(queue) {
        try {
            localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        } catch (e) {
            if (IS_DEBUG) console.warn('[Analytics] Failed to save queue:', e);
        }
    }

    function filterProperties(props) {
        if (!props) return {};
        const safeProps = {};
        for (const key of Object.keys(props)) {
            if (ALLOWED_PROPERTIES.includes(key)) {
                safeProps[key] = props[key];
            } else if (IS_DEBUG) {
                console.warn(`[Analytics] Dropped forbidden property: ${key}`);
            }
        }
        return safeProps;
    }

    function enqueueEvent(eventName, properties) {
        if (!SHOULD_TRACK) return;
        if (!ALLOWED_EVENTS.includes(eventName) && eventName !== '$pageview') {
            if (IS_DEBUG) console.warn(`[Analytics] Event not allowed: ${eventName}`);
            return;
        }

        const safeProps = filterProperties(properties);
        safeProps.timestamp = Date.now();
        safeProps.online = navigator.onLine;

        if (IS_DEBUG) {
            console.log(`[Analytics] Tracked: ${eventName}`, safeProps);
        }

        if (navigator.onLine) {
            sendEvent(eventName, safeProps);
        } else {
            let queue = loadQueue();
            queue.push({ eventName, properties: safeProps });

            // Limit queue size, dropping oldest
            if (queue.length > MAX_QUEUE_SIZE) {
                queue = queue.slice(queue.length - MAX_QUEUE_SIZE);
            }
            saveQueue(queue);
            if (IS_DEBUG) console.log(`[Analytics] Queued for offline. Queue size: ${queue.length}`);
        }
    }

    function sendEvent(eventName, properties) {
        if (window.posthog) {
            window.posthog.capture(eventName, properties);
        }
    }

    function flushQueue() {
        if (!SHOULD_TRACK || !navigator.onLine) return;

        let queue = loadQueue();
        if (queue.length === 0) return;

        if (IS_DEBUG) console.log(`[Analytics] Flushing ${queue.length} events from queue...`);

        const now = Date.now();
        const validEvents = queue.filter(evt => {
            const isFresh = (now - evt.properties.timestamp) < MAX_AGE_MS;
            return isFresh;
        });

        // Try to send valid events
        if (window.posthog) {
            validEvents.forEach(evt => {
                window.posthog.capture(evt.eventName, evt.properties);
            });
            // Clear queue after sending
            saveQueue([]);
        } else if (config.POSTHOG_PROJECT_API_KEY) {
            // Posthog configured but script not loaded or ready yet
            if (IS_DEBUG) console.log(`[Analytics] PostHog not ready, keeping queue.`);
        } else {
             // Custom or no endpoint
             saveQueue([]);
        }
    }

    function initPostHog() {
        if (config.POSTHOG_PROJECT_API_KEY) {
            !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId setPersonProperties".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

            posthog.init(config.POSTHOG_PROJECT_API_KEY, {
                api_host: config.POSTHOG_HOST || 'https://eu.i.posthog.com',
                person_profiles: 'always',
                autocapture: false,
                capture_pageview: false,
                capture_pageleave: false,
                disable_session_recording: true,
                opt_out_capturing_by_default: !SHOULD_TRACK
            });

            if (SHOULD_TRACK) {
                // Ensure identity is purely anonymous (no user details)
                posthog.identify(posthog.get_distinct_id());
            }
        }
    }

    // Public API
    window.Analytics = {
        init: function() {
            if (SHOULD_TRACK) {
                initPostHog();

                window.addEventListener('online', flushQueue);

                // Flush anything stuck in queue initially (if online)
                setTimeout(flushQueue, 1000);
            }
        },
        track: function(eventName, properties = {}) {
            enqueueEvent(eventName, properties);
        },
        page: function(screenName) {
            enqueueEvent('$pageview', { screen: screenName });
        }
    };

    // Auto-init on load
    window.Analytics.init();

})();
