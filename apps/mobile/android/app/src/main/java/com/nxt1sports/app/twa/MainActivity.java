package com.nxt1sports.app.twa;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeConfigPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
