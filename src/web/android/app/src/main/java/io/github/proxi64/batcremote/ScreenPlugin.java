package io.github.proxi64.batcremote;

import android.app.Activity;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Screen control for the flight. No permission is needed: the window settings only
 * apply to the app's own window, and the accelerometer is free to read.
 *
 * JS: Screen.keepOn({ on })                     keep the screen on (FLAG_KEEP_SCREEN_ON)
 *     Screen.setDim({ dim })                    minimum brightness for this window, or back to the system brightness
 *     Screen.watchMotion({ on, sensitivity })   while the screen is dimmed: emits "motion" once when the phone
 *                                               is picked up or moved (sensitivity 1 = least sensitive … 10 = most)
 */
@CapacitorPlugin(name = "Screen")
public class ScreenPlugin extends Plugin implements SensorEventListener {

    /** Lowest brightness that still shows the content (0 can switch the backlight off on some phones). */
    private static final float DIM_BRIGHTNESS = 0.01f;

    /** Gravity low-pass filter (0..1, higher = smoother). */
    private static final float GRAVITY_ALPHA = 0.9f;
    /** Time for the filter to settle before the resting position is taken as reference. */
    private static final long SETTLE_MS = 500;
    /** Shake = average movement over this many samples (~20 ms each): brief desk vibrations are ignored. */
    private static final int SHAKE_WINDOW = 6;

    private SensorManager sensors;
    private Sensor accelerometer;
    private boolean watching = false;
    private boolean paused = false;
    private int sensitivity = 5;

    private final float[] gravity = new float[3];
    private float[] reference = null;
    private long startedAt = 0;
    private final float[] shake = new float[SHAKE_WINDOW];
    private int shakeIndex = 0;

    @Override
    public void load() {
        sensors = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        accelerometer = sensors != null ? sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) : null;
    }

    @PluginMethod
    public void keepOn(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        final Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    @PluginMethod
    public void setDim(PluginCall call) {
        final boolean dim = Boolean.TRUE.equals(call.getBoolean("dim", false));
        final Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.screenBrightness = dim ? DIM_BRIGHTNESS : WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
            window.setAttributes(lp);
            call.resolve();
        });
    }

    @PluginMethod
    public void watchMotion(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        Integer s = call.getInt("sensitivity", 5);
        sensitivity = Math.max(1, Math.min(10, s == null ? 5 : s));
        if (on) startWatching(); else stopWatching();
        JSObject ret = new JSObject();
        ret.put("available", accelerometer != null);
        call.resolve(ret);
    }

    // ---------- accelerometer ----------

    private void startWatching() {
        watching = true;
        if (paused || accelerometer == null) return;
        reference = null;
        startedAt = System.currentTimeMillis();
        java.util.Arrays.fill(shake, 0f);
        shakeIndex = 0;
        gravity[0] = gravity[1] = gravity[2] = 0f;
        sensors.unregisterListener(this);
        sensors.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME);
    }

    private void stopWatching() {
        watching = false;
        if (sensors != null) sensors.unregisterListener(this);
    }

    /** 1 → 35°, 10 → 8°: angle change that counts as "picked up". */
    private float tiltThresholdDeg() { return 35f - 3f * (sensitivity - 1); }

    /** 1 → 3.0 m/s², 10 → 0.57 m/s²: average movement that counts as "moved". */
    private float shakeThreshold() { return 3.0f - 0.27f * (sensitivity - 1); }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!watching) return;
        float x = event.values[0], y = event.values[1], z = event.values[2];
        boolean first = gravity[0] == 0f && gravity[1] == 0f && gravity[2] == 0f;
        float a = first ? 0f : GRAVITY_ALPHA;
        gravity[0] = a * gravity[0] + (1 - a) * x;
        gravity[1] = a * gravity[1] + (1 - a) * y;
        gravity[2] = a * gravity[2] + (1 - a) * z;

        // Movement = what remains once gravity is removed, averaged over a short window.
        float lx = x - gravity[0], ly = y - gravity[1], lz = z - gravity[2];
        shake[shakeIndex] = (float) Math.sqrt(lx * lx + ly * ly + lz * lz);
        shakeIndex = (shakeIndex + 1) % SHAKE_WINDOW;

        if (System.currentTimeMillis() - startedAt < SETTLE_MS) return;
        if (reference == null) {
            reference = gravity.clone();
            return;
        }

        float avg = 0f;
        for (float v : shake) avg += v;
        avg /= SHAKE_WINDOW;

        if (angleDeg(reference, gravity) > tiltThresholdDeg() || avg > shakeThreshold()) {
            stopWatching();
            notifyListeners("motion", new JSObject());
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { /* not used */ }

    private static float angleDeg(float[] u, float[] v) {
        double dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
        double nu = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
        double nv = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        if (nu == 0 || nv == 0) return 0f;
        double c = Math.max(-1.0, Math.min(1.0, dot / (nu * nv)));
        return (float) Math.toDegrees(Math.acos(c));
    }

    // The sensor is only read while the app is in the foreground.
    @Override
    protected void handleOnPause() {
        paused = true;
        if (sensors != null) sensors.unregisterListener(this);
        super.handleOnPause();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        paused = false;
        if (watching) startWatching();
    }
}
