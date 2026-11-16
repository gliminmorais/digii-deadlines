#!/bin/bash
set -u

pause() {
  if [ -t 0 ]; then
    printf '\nPress Return to close this window. '
    read -r _ || true
  fi
}

install() {
  if [ "$(uname -s)" != Darwin ]; then
    printf '%s\n' 'The Safari installer runs on a Mac.' >&2
    return 1
  fi

  local root work file
  root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" || return 1
  if [ ! -f "$root/manifests/safari.json" ] || [ ! -f "$root/scripts/setup-safari.sh" ]; then
    printf '%s\n' 'Download and extract the whole Digii Deadlines repository, then open this launcher from the extracted folder.' >&2
    return 1
  fi

  work="$(mktemp -d "${TMPDIR:-/tmp}/digii-launcher.XXXXXXXX")" || return 1
  staging_directory="$work"
  trap 'rm -rf -- "$staging_directory"' EXIT
  cp "$root/manifests/safari.json" "$work/manifest.json" || return 1
  for file in background.js sidepanel.html sidepanel.css sidepanel.js sync.js; do
    cp "$root/$file" "$work/$file" || return 1
  done
  /bin/bash "$root/scripts/setup-safari.sh" "$work"
}

install
status=$?
pause
exit "$status"
