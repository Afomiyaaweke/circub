package com.circub.app;

import android.content.SharedPreferences;
import android.os.Bundle;

import com.appodeal.ads.Appodeal;
import com.appodeal.ads.initialization.ApdInitializationCallback;
import com.appodeal.ads.initialization.ApdInitializationError;
import com.getcapacitor.BridgeActivity;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Capacitor bridge activity + Appodeal interstitial (added v106).
 *
 * Behaviour (as chosen by the product owner):
 *  - format: interstitial only
 *  - placement: on app open (cold start / resume)
 *  - frequency cap: at most one ad every 3 hours
 *  - never shown in the user's very first session
 *
 * BEFORE BUILDING A RELEASE AAB, replace TWO placeholders:
 *  1. APPODEAL_APP_KEY below  (https://app.appodeal.com -> Apps -> circub)
 *  2. AdMob App ID in AndroidManifest.xml
 *     (https://apps.admob.com -> Apps -> App settings -> App ID)
 */
public class MainActivity extends BridgeActivity {

    // ============================================================
    // TODO (BEFORE RELEASE): real Appodeal APP_KEY.
    // With the placeholder the SDK initialises with test/zero fill -
    // the app still runs, it just will not serve paid ads.
    // ============================================================
    private static final String APPODEAL_APP_KEY = "YOUR_APPODEAL_KEY";

    /** At most one interstitial per 3 hours. */
    private static final long MIN_INTERVAL_MS = TimeUnit.HOURS.toMillis(3);

    private static final String PREFS = "circub_ads";
    private static final String KEY_SESSIONS = "session_count";
    private static final String KEY_LAST_SHOWN = "last_interstitial_at";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Count sessions: the very first session never sees an ad, so the
        // user gets a clean first impression before monetisation kicks in.
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        prefs.edit().putInt(KEY_SESSIONS, prefs.getInt(KEY_SESSIONS, 0) + 1).apply();

        // Uncomment while testing to force test ads + verbose logs:
        // Appodeal.setTesting(true);

        Appodeal.initialize(this, APPODEAL_APP_KEY, Appodeal.INTERSTITIAL,
                new ApdInitializationCallback() {
                    @Override
                    public void onInitializationFinished(List<ApdInitializationError> errors) {
                        // SDK ready: pre-load an interstitial so the next
                        // eligible open has an ad ready to show.
                        if (shouldShowInterstitial()) {
                            Appodeal.cache(MainActivity.this, Appodeal.INTERSTITIAL);
                        }
                    }
                });
    }

    @Override
    public void onResume() {
        super.onResume();
        maybeShowInterstitial();
    }

    /** Cap rules: not the first session AND at least 3h since the last ad. */
    private boolean shouldShowInterstitial() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        boolean notFirstSession = prefs.getInt(KEY_SESSIONS, 1) > 1;
        long sinceLast = System.currentTimeMillis() - prefs.getLong(KEY_LAST_SHOWN, 0L);
        return notFirstSession && sinceLast >= MIN_INTERVAL_MS;
    }

    /** Show if loaded; otherwise request a cache for the next opportunity. */
    private void maybeShowInterstitial() {
        if (!shouldShowInterstitial()) {
            return;
        }
        if (!Appodeal.isLoaded(Appodeal.INTERSTITIAL)) {
            Appodeal.cache(this, Appodeal.INTERSTITIAL);
            return;
        }
        if (Appodeal.show(this, Appodeal.INTERSTITIAL)) {
            getSharedPreferences(PREFS, MODE_PRIVATE)
                    .edit()
                    .putLong(KEY_LAST_SHOWN, System.currentTimeMillis())
                    .apply();
        }
    }
}
