#!/bin/bash
set -euo pipefail

usage() {
  printf '%s\n' 'Usage: bash setup-safari.sh [--temporary] [extension-folder]' \
    'Run from the Safari setup kit, or pass the folder containing the Safari manifest.json.'
}

fail() {
  printf 'Digii Deadlines: %s\n' "$*" >&2
  exit 1
}

wait_for_user() {
  printf '%s\n' "$1"
  if [ ! -t 0 ]; then
    fail 'Finish the displayed step, then run this script again in Terminal.'
  fi
  read -r -p 'Press Return when ready, or Control-C to stop: ' _
}

case "$#" in
  0|1|2) ;;
  *) usage; exit 2 ;;
esac

if [ "${1:-}" = '--help' ] || [ "${1:-}" = '-h' ]; then
  usage
  exit 0
fi

[ "$(uname -s)" = 'Darwin' ] || fail 'This setup script runs on macOS.'

temporary=false
if [ "${1:-}" = '--temporary' ]; then
  temporary=true
  shift
fi
[ "$#" -le 1 ] || { usage; exit 2; }

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
resources="${1:-$script_dir/extension}"
[ -d "$resources" ] || fail 'Extract the Safari setup kit or pass the extracted Safari extension folder.'
resources="$(cd -- "$resources" && pwd -P)"

runtime_files=(manifest.json background.js sidepanel.html sidepanel.css sidepanel.js sync.js)
for file in "${runtime_files[@]}"; do
  [ -f "$resources/$file" ] || fail "Missing $file in $resources."
done
# Reject the Chrome installer folder, which uses a different background entry.
if grep -q -E '"side_panel"|"service_worker"' "$resources/manifest.json"; then
  fail 'Use the Safari resources from the setup kit.'
fi

if "$temporary"; then
  printf '%s\n' \
    'In Safari Settings → Advanced, turn on “Show features for web developers”.' \
    'In Safari Settings → Developer, click “Add Temporary Extension”.' \
    "Choose this folder: $resources" \
    'If the button is unavailable, use the regular Xcode setup instead.'
  open -a Safari
  open "$resources"
  exit 0
fi

find_xcode() {
  local selected
  selected="${DEVELOPER_DIR:-$(xcode-select -p 2>/dev/null || true)}"
  if [ -x "$selected/usr/bin/xcodebuild" ]; then
    printf '%s\n' "$selected"
  elif [ -x '/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild' ]; then
    printf '%s\n' '/Applications/Xcode.app/Contents/Developer'
  fi
}

developer="$(find_xcode)"
if [ -z "$developer" ]; then
  open 'macappstores://apps.apple.com/app/xcode/id497799835'
  wait_for_user 'Install Xcode from the Mac App Store, then open Xcode once to complete setup.'
  developer="$(find_xcode)"
  [ -n "$developer" ] || fail 'Xcode is still unavailable. If you installed it in another folder, set DEVELOPER_DIR to its Contents/Developer path.'
fi
export DEVELOPER_DIR="$developer"

if ! xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1; then
  open "${developer%/Contents/Developer}"
  wait_for_user 'Complete the license and additional components prompts in Xcode.'
  xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1 ||
    fail 'Xcode first-launch setup is still incomplete.'
fi

if xcrun --find safari-web-extension-packager >/dev/null 2>&1; then
  packager=safari-web-extension-packager
elif xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  packager=safari-web-extension-converter
else
  fail 'This Xcode does not include the Safari web extension packager. Update Xcode and try again.'
fi

app_name='Digii Deadlines'
bundle_id='com.gliminmorais.digiideadlines.local'
destination="$HOME/Applications/$app_name.app"
if [ -e "$destination" ] || [ -L "$destination" ]; then
  installed_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$destination/Contents/Info.plist" 2>/dev/null || true)"
  [ ! -L "$destination" ] && [ "$installed_id" = "$bundle_id" ] ||
    fail 'An unrelated app already exists at ~/Applications/Digii Deadlines.app. Move it before continuing.'
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/digii-safari.XXXXXXXX")"
trap 'rm -rf -- "$work"' EXIT
mkdir "$work/extension" "$work/project"
for file in "${runtime_files[@]}"; do
  cp "$resources/$file" "$work/extension/$file"
done

xcrun "$packager" "$work/extension" --macos-only --swift --copy-resources \
  --app-name "$app_name" --bundle-identifier "$bundle_id" \
  --project-location "$work/project" --no-open --no-prompt

project="$(find "$work/project" -type d -name '*.xcodeproj' -print -quit)"
[ -n "$project" ] || fail 'The Safari packager did not create an Xcode project.'
schemes="$(xcodebuild -project "$project" -list -json)"
scheme=''
for index in 0 1 2 3 4 5; do
  candidate="$(printf '%s' "$schemes" | plutil -extract "project.schemes.$index" raw -o - - 2>/dev/null || true)"
  case "$candidate" in
    "$app_name"|"$app_name (macOS)") scheme="$candidate"; break ;;
  esac
done
[ -n "$scheme" ] || fail 'Could not find the generated macOS app scheme.'

xcodebuild -project "$project" -scheme "$scheme" -configuration Debug \
  -destination 'platform=macOS' -derivedDataPath "$work/build" \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= build

built="$work/build/Build/Products/Debug/$app_name.app"
[ -d "$built" ] || fail 'Xcode did not produce the expected macOS app.'
mkdir -p "$HOME/Applications"
staged="$(mktemp -d "$HOME/Applications/.digii-install.XXXXXXXX")"
cleanup_install() {
  rm -rf -- "$work"
  if [ -e "$staged/previous.app" ] && [ ! -e "$destination" ]; then
    if ! mv "$staged/previous.app" "$destination"; then
      printf 'Restore your previous app from %s/previous.app\n' "$staged" >&2
      return
    fi
  fi
  rm -rf -- "$staged"
}
trap cleanup_install EXIT
ditto "$built" "$staged/$app_name.app"
if [ -e "$destination" ]; then
  mv "$destination" "$staged/previous.app"
fi
mv "$staged/$app_name.app" "$destination" || fail 'Could not move the new app into ~/Applications.'

printf '%s\n' "Installed $destination" \
  'In Safari Settings → Extensions, enable Digii Deadlines and allow access to SNUC DigiiCampus.' \
  'If the extension is not listed, enable web developer features in Safari Settings → Advanced, then look for “Allow unsigned extensions” in Safari developer settings.' \
  'Sign in to SNUC DigiiCampus in Safari and click the Digii Deadlines toolbar button.'
open "$destination"
