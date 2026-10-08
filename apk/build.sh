#!/bin/bash
# circub Android shell builder - JRE-only pipeline (no javac, no gradle).
#   aapt2 compile/link -> ecj (Eclipse compiler jar) -> d8 -> zip -> zipalign -> apksigner
# Output: /home/z/circub/public/circub.apk
#
# Prereq: apk/setup-android-sdk.sh (platforms;android-36 + build-tools;36.0.0)
# Manifest attributes and the aapt2 CLI flags below MUST stay in lockstep
# (CLI flags lose to manifest attributes - dual-write is deliberate).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SDK="${ANDROID_HOME:-$HOME/android-sdk}"
BT="$SDK/build-tools/36.0.0"
PLATFORM="$SDK/platforms/android-36/android.jar"
OUT=apk/out
ECJ=apk/ecj.jar
ECJ_URL="https://repo1.maven.org/maven2/org/eclipse/jdt/ecj/3.33.0/ecj-3.33.0.jar"

KS=signing/circub.keystore
KS_ALIAS=circub
KS_PASS=circub123

echo "[1/7] aapt2 compile resources"
rm -rf "$OUT"; mkdir -p "$OUT/gen" "$OUT/classes"
"$BT/aapt2" compile --dir apk/res -o "$OUT/res.zip"

echo "[2/7] aapt2 link (vc3: versionCode 3, versionName 1.1.0, min 15, target 36)"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$PLATFORM" \
  --manifest apk/AndroidManifest.xml \
  --min-sdk-version 15 --target-sdk-version 36 \
  --version-code 3 --version-name 1.1.0 \
  --java "$OUT/gen" \
  "$OUT/res.zip"

echo "[3/7] ecj compile MainActivity"
[ -f "$ECJ" ] || curl -fsSL -o "$ECJ" "$ECJ_URL"
java -jar "$ECJ" -source 8 -target 8 -nowarn \
  -bootclasspath "$PLATFORM" \
  -d "$OUT/classes" \
  apk/java/com/circub/app/MainActivity.java

echo "[4/7] d8 dex"
(cd "$OUT/classes" && "$BT/d8" --min-api 15 --lib "$PLATFORM" --output "$ROOT/$OUT" \
  $(find . -name '*.class' | sed 's|^\./||'))

echo "[5/7] zip classes.dex into the apk"
(cd "$OUT" && zip -q base.apk classes.dex)

echo "[6/7] zipalign"
"$BT/zipalign" -f 4 "$OUT/base.apk" "$OUT/aligned.apk"

echo "[7/7] keystore + sign"
if [ ! -f "$KS" ]; then
  mkdir -p signing
  keytool -genkeypair -v -keystore "$KS" -alias "$KS_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -dname "CN=circub, OU=circub, O=circub, L=Addis Ababa, C=ET" >/dev/null 2>&1
  echo "  (keystore regenerated - cert SHA-256 is NEW, see apksigner verify)"
fi
"$BT/apksigner" sign --ks "$KS" --ks-key-alias "$KS_ALIAS" \
  --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --out public/circub.apk "$OUT/aligned.apk"

"$BT/apksigner" verify --print-certs public/circub.apk | head -4
ls -l public/circub.apk
md5sum public/circub.apk
echo "[done] public/circub.apk"
