package com.nxt1sports.app.twa;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeConfig")
public class NativeConfigPlugin extends Plugin {
    @PluginMethod
    public void getMicrosoftAuthConfig(PluginCall call) {
        JSObject result = new JSObject();
        result.put("androidKeyHash", getContext().getString(R.string.msauth_android_key_hash));
        call.resolve(result);
    }
}
