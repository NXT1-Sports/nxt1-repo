#!/bin/bash

# NXT1 Mobile - Test on Physical Device (No Xcode IDE needed)
# This script helps you test the app on your iPhone with live reload

echo "🚀 NXT1 Mobile Device Testing Setup"
echo "===================================="
echo ""

# Get Mac's local IP
echo "📱 Finding your Mac's IP address..."
MAC_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)

if [ -z "$MAC_IP" ]; then
    echo "❌ Could not find local IP address. Make sure you're connected to WiFi."
    exit 1
fi

echo "✅ Your Mac's IP: $MAC_IP"
echo ""
echo "⚡ INSTRUCTIONS:"
echo "1. Connect your iPhone to the SAME WiFi network"
echo "2. Plug your iPhone into your Mac via USB cable"
echo "3. Trust this computer on your iPhone when prompted"
echo ""
echo "Choose your testing method:"
echo ""
echo "A) LIVE RELOAD (Recommended) - Changes appear instantly"
echo "   Command: npm run ios:live"
echo ""
echo "B) MANUAL CONFIG - Set IP manually in capacitor.config.json"
echo "   Update 'url': 'http://$MAC_IP:4200'"
echo ""

read -p "Run live reload now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "🔧 Starting development server and deploying to device..."
    npm run ios:live
fi
