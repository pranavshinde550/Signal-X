package com.signalx.app;

import com.getcapacitor.BridgeActivity;

import com.signalx.app.plugins.WifiInfoPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(WifiInfoPlugin.class);

        super.onCreate(savedInstanceState);
    }
}