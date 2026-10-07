package io.github.proxi64.batcremote;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins written inside the app must be registered before the bridge starts.
        registerPlugin(QrScannerPlugin.class);
        registerPlugin(ScreenPlugin.class);
        super.onCreate(savedInstanceState);
        // Ignore Android's system font size: only the app's own "Text size" setting applies.
        // (The activity is recreated when the system font size changes, so this is re-applied.)
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
