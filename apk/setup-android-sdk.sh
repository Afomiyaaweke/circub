#!/bin/bash
# Rebuild the Android SDK toolchain for JRE-only environments (no javac).
# Installs: commandline-tools, platform-tools, platforms;android-36, build-tools;36.0.0
# Everything lands in $ANDROID_HOME (default: $HOME/android-sdk).
set -e
SDK="${ANDROID_HOME:-$HOME/android-sdk}"
mkdir -p "$SDK/cmdline-tools"

CLT_ZIP="$SDK/cmdline-tools.zip"
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "[setup] downloading commandline-tools..."
  curl -fsSL -o "$CLT_ZIP" https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
  rm -rf "$SDK/cmdline-tools/latest"
  unzip -q -o "$CLT_ZIP" -d "$SDK/cmdline-tools"
  mv "$SDK/cmdline-tools/cmdline-tools" "$SDK/cmdline-tools/latest"
  rm -f "$CLT_ZIP"
fi
export ANDROID_HOME="$SDK"
yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null 2>&1 || true

if [ ! -f "$SDK/platforms/android-36/android.jar" ] || [ ! -d "$SDK/build-tools/36.0.0" ]; then
  echo "[setup] installing platform + build-tools (this downloads ~120MB)..."
  yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" \
    "platform-tools" "platforms;android-36" "build-tools;36.0.0" >/dev/null
fi
echo "[setup] OK: $(ls "$SDK/platforms" 2>/dev/null) / $(ls "$SDK/build-tools" 2>/dev/null)"
