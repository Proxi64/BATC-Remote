package io.github.proxi64.batcremote;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

/**
 * QR code scanner provided by Google Play services ("Google code scanner").
 * The camera UI runs in Play services: no camera permission and no ML model in the APK.
 *
 * JS: QrScanner.scan() → { value: string } | { cancelled: true }; rejects if the scanner is unavailable.
 */
@CapacitorPlugin(name = "QrScanner")
public class QrScannerPlugin extends Plugin {

    @PluginMethod
    public void scan(PluginCall call) {
        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build();
        GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(getActivity(), options);
        scanner.startScan()
            .addOnSuccessListener(barcode -> {
                JSObject result = new JSObject();
                result.put("value", barcode.getRawValue());
                call.resolve(result);
            })
            .addOnCanceledListener(() -> {
                JSObject result = new JSObject();
                result.put("cancelled", true);
                call.resolve(result);
            })
            .addOnFailureListener(e -> call.reject(String.valueOf(e.getMessage()), "SCAN_UNAVAILABLE", e));
    }
}
