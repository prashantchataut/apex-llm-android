#!/usr/bin/env bash
# Hard install-compatibility gate for the Apex Android APK (Nothing Phone 4a / Android 15-16, arm64-v8a only).
# Usage: scripts/verify-apk.sh path/to/app.apk
# Needs (PATH or $ANDROID_HOME): apksigner, apkanalyzer, zipalign, readelf, unzip, python3.
set -euo pipefail
APK="${1:?usage: verify-apk.sh app.apk}"
BT="$(ls -d "${ANDROID_HOME:-/nonexistent}"/build-tools/* 2>/dev/null | sort -V | tail -1 || true)"
CT="$(ls -d "${ANDROID_HOME:-/nonexistent}"/cmdline-tools/*/bin 2>/dev/null | sort -V | tail -1 || true)"
export PATH="${BT:+$BT:}${CT:+$CT:}$PATH"
fail() { echo "::error::APK GATE FAILED: $*"; exit 1; }
ok() { echo "  ok  $*"; }

echo "== apksigner verify (min SDK 26)"
SIG="$(apksigner verify --verbose --print-certs --min-sdk-version 26 "$APK")" || fail "apksigner verify rejected the APK"
echo "$SIG" | head -14
echo "$SIG" | grep -q "v2 scheme (APK Signature Scheme v2): true" || fail "v2 signature missing"
echo "$SIG" | grep -q "v3 scheme (APK Signature Scheme v3): true" || fail "v3 signature missing"
ok "v2 + v3 signatures verified (v1 is not evaluated for minSdk >= 24)"
# v1 (JAR) is only needed below API 24; report it, never fail on it (verify with --min-sdk-version 26 skips it by design)
if apksigner verify --verbose "$APK" 2>/dev/null | grep -q "v1 scheme (JAR signing): true"; then ok "v1 (JAR) signature also present"; else echo "  info v1 (JAR) signature absent: fine for minSdk 26"; fi

echo "== zipalign"
zipalign -c -P 16 4 "$APK" || fail "zip alignment check failed (zipalign -c -P 16 4)"
ok "4-byte / 16 KB page alignment"

echo "== manifest (apkanalyzer)"
MAN="$(apkanalyzer manifest print "$APK")"
echo "$MAN" | grep -E "versionName|minSdkVersion|targetSdkVersion|compileSdkVersion|<service|<receiver" || true
echo "$MAN" | grep -q 'android:targetSdkVersion="34"' || fail "targetSdkVersion is not 34"
echo "$MAN" | grep -q 'android:minSdkVersion="26"' || fail "minSdkVersion is not 26"
echo "$MAN" | grep -q 'MainActivity' || fail "MainActivity missing from manifest"
MANFILE="$(mktemp)"
printf '%s' "$MAN" > "$MANFILE"
cat > "$MANFILE.py" <<'PYEOF'
import re, sys
m = open(sys.argv[1]).read()
bad = []
for kind, attrs in re.findall(r"<(activity|service|receiver|provider)\b([^>]*)>", m, re.S):
    if "android:exported" not in attrs:
        n = re.search(r'android:name="([^"]+)"', attrs)
        bad.append(kind + " " + (n.group(1) if n else "?"))
if bad:
    print("::error::components without android:exported:", bad)
    sys.exit(1)
if "FOREGROUND_SERVICE" in m and "foregroundServiceType" not in m:
    print("::error::FOREGROUND_SERVICE declared without a typed service")
    sys.exit(1)
print("  ok  every component declares android:exported; no untyped foreground service")
PYEOF
python3 "$MANFILE.py" "$MANFILE" || fail "manifest component check"
rm -f "$MANFILE" "$MANFILE.py"

echo "== contents"
LIST="$(unzip -l "$APK")"
echo "$LIST" | grep -E "classes[0-9]*\.dex|resources\.arsc|AndroidManifest\.xml|lib/" || true
echo "$LIST" | grep -q " classes.dex$" || fail "classes.dex missing"
echo "$LIST" | grep -q " resources.arsc$" || fail "resources.arsc missing"
BAD_ABI="$(echo "$LIST" | grep -oE "lib/[^/]+/[^ ]+\.so" | grep -v "^lib/arm64-v8a/" || true)"
[ -z "$BAD_ABI" ] || fail "non-arm64 native libraries present: $BAD_ABI"
SOS="$(echo "$LIST" | grep -oE "lib/arm64-v8a/[^ ]+\.so" || true)"
[ -n "$SOS" ] || fail "no lib/arm64-v8a/*.so (the Rust engine is missing)"
ok "only lib/arm64-v8a/*.so present"

echo "== ELF checks (AArch64, not a stub, 16 KB LOAD alignment)"
TMP="$(mktemp -d)"
for so in $SOS; do
  unzip -o -q "$APK" "$so" -d "$TMP"
  f="$TMP/$so"
  [ "$(stat -c %s "$f")" -gt 102400 ] || fail "$so is a stub (<100 KB)"
  readelf -h "$f" | grep -q "Machine:.*AArch64" || fail "$so is not AArch64"
  for a in $(readelf -lW "$f" | awk '/ LOAD /{print $NF}'); do
    [ "$((a))" -ge 16384 ] || fail "$so LOAD segment align $a < 0x4000 (not linked with -z max-page-size=16384)"
  done
  ok "$so AArch64, $(stat -c %s "$f") bytes, every LOAD align >= 0x4000"
done
rm -rf "$TMP"
sha256sum "$APK"
echo "APK GATE PASSED"
