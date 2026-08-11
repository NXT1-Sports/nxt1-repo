package com.nxt1sports.app.twa;

import android.content.Intent;
import android.os.Bundle;

import com.microsoft.identity.common.internal.broker.BrokerActivity;

/**
 * Fix Issue #5: NPE in BrokerActivity.onResume() — migrateExtraStreamToClipData on null Intent.
 *
 * Root cause: When the OS restores BrokerActivity after process death or low-memory reclamation
 * (especially on Android 10+/API 29+), getIntent() can return null. The Android framework then
 * calls the internal migrateExtraStreamToClipData(null) during the onResume lifecycle transition,
 * crashing with a NullPointerException.
 *
 * Fix: Override onResume() to guarantee getIntent() is never null before super.onResume() runs.
 * An empty Intent is safe — MSAL's BrokerActivity checks for specific extras/actions and handles
 * their absence gracefully (it simply finishes with no result, which is the correct behavior when
 * the original intent data is lost after process death).
 */
public class SafeBrokerActivity extends BrokerActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        ensureNonNullIntent();
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onResume() {
        ensureNonNullIntent();
        super.onResume();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        // Also guard onNewIntent: pass an empty Intent rather than null to avoid
        // setIntent(null) being propagated, which would trigger the same NPE on the
        // next onResume call.
        super.onNewIntent(intent != null ? intent : new Intent());
    }

    /**
     * If getIntent() is null (can happen after process death + activity restore on API 29+),
     * inject a safe empty Intent so the Android framework's migrateExtraStreamToClipData()
     * call inside onResume does not receive a null target.
     */
    private void ensureNonNullIntent() {
        if (getIntent() == null) {
            setIntent(new Intent());
        }
    }
}
