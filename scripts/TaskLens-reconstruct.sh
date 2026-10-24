#!/bin/sh
# Run this reviewed script from the same directory as official SHA256SUMS and parts.
set -eu
usage() { echo 'Usage: sh TaskLens-reconstruct.sh [--download RELEASE_TAG] TaskLens-<version>-<platform>.<extension>' >&2; exit 2; }
tag=''
if [ "${1:-}" = '--download' ]; then [ "$#" -eq 3 ] || usage; tag=$2; shift 2; fi
[ "$#" -eq 1 ] || usage
installer=$1
case "$installer" in TaskLens-*) ;; *) usage ;; esac
case "$installer" in *[!A-Za-z0-9._-]*|*.part*|*.json|*.sh|*.ps1) usage ;; esac
case "$installer" in *.rpm|*.deb|*.AppImage|*.dmg|*.exe) ;; *) usage ;; esac
[ ! -e "$installer" ] && [ ! -L "$installer" ] || { echo 'Refusing to overwrite an existing installer.' >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then
  digest() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  digest() { shasum -a 256 "$1" | awk '{print $1}'; }
else echo 'A system SHA-256 tool is required.' >&2; exit 1; fi
work=$(mktemp -d './.tasklens-reconstruct.XXXXXXXX')
trap 'rm -rf "$work"' EXIT HUP INT TERM
fetch() {
  [ -n "$tag" ] || { echo "Missing file: $1" >&2; exit 1; }
  case "$tag" in v[0-9]*) ;; *) usage ;; esac
  case "$tag" in *[!A-Za-z0-9._-]*) usage ;; esac
  curl --fail --location --proto '=https' --proto-redir '=https' --retry 3 --max-filesize "$2" \
    --output "$work/download" "https://github.com/clarkkkkkkk/tasklens-desktopApp/releases/download/$tag/$1"
  # Exclusive link avoids overwriting a concurrently created file.
  ln "$work/download" "$1"
  rm "$work/download"
}
[ -e SHA256SUMS ] || fetch SHA256SUMS 1048576
[ -f SHA256SUMS ] && [ ! -L SHA256SUMS ] && [ "$(wc -c < SHA256SUMS)" -le 1048576 ] || exit 1
# Parse data, never evaluate a manifest or filename as shell code. Enforce exact order.
awk -v name="$installer" '
  $2 == name || (index($2, name ".part") == 1 && $2 != name ".parts.json") {
    if (NF != 2 || length($1) != 64 || $1 ~ /[^a-f0-9]/) exit 1
    if ($2 == name) { if (whole++) exit 1; print $1 > "/dev/stderr" }
    else { count++; if (count > 32 || $2 != name sprintf(".part%03d", count)) exit 1; print $1 " " $2 }
  }
  END { if (whole != 1 || count < 1) exit 1 }
' SHA256SUMS > "$work/parts" 2> "$work/whole" || { echo 'Invalid or incomplete checksum inventory.' >&2; exit 1; }
while read -r expected part; do
  [ -e "$part" ] || fetch "$part" 1073741824
  [ -f "$part" ] && [ ! -L "$part" ] && [ "$(wc -c < "$part")" -le 1073741824 ] || exit 1
  [ "$(digest "$part")" = "$expected" ] || { echo "Checksum mismatch: $part" >&2; exit 1; }
  cat "$part" >> "$work/installer"
done < "$work/parts"
[ "$(digest "$work/installer")" = "$(cat "$work/whole")" ] || { echo 'Complete installer checksum mismatch.' >&2; exit 1; }
ln "$work/installer" "$installer"
echo "Verified and reconstructed: $installer"
echo 'Install this verified file using the platform instructions in the official release notes.'
