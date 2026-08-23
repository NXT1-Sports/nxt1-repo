# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Release builds currently ship with minification disabled, but we keep the
# MSAL/Common auth fragments stable so future shrinking changes do not reintroduce
# restore-time crashes in CurrentTaskAuthorizationActivity.
-keep class com.microsoft.identity.common.** { *; }
-keep interface com.microsoft.identity.common.** { *; }
-keep class com.microsoft.identity.client.** { *; }
-keep interface com.microsoft.identity.client.** { *; }

# FragmentManager restores fragments by class name from saved state.
-keep public class * extends androidx.fragment.app.Fragment
-keep public class * extends android.app.Fragment
