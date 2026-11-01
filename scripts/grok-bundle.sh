#!/usr/bin/env bash
# Writes two files for reading elsewhere (Grok, another AI, a person), from the
# last commit:
#   azshara-source.txt   the whole app as one readable text file: every source
#                        file, config.json, the docs, with a contents list.
#   court-talk-pack.zip  the Court's words (src/game/court/talk/*.json) and
#                        GROK_TALK.md, the prompt for filling them in.
# The same files as the public copy (scripts/grok-mirror.sh): never the Android
# signing files, CI, saves or images. Usage: scripts/grok-bundle.sh [out-dir]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
out=${1:-grok-bundle}
mkdir -p "$out"
out=$(cd "$out" && pwd)

EXCLUDE='^(mobile/android/|\.github/|\.grok|\.project_id|screenshots/|AGENTS\.md)'
SKIP='(package-lock\.json|\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp3|ogg|wav|apk|keystore|jks|zip|pdf))$'
mapfile -t all < <(git ls-files | grep -Ev "$EXCLUDE" | grep -Ev "$SKIP")

# The docs and the config first, then the talk pack, then the rest in path order.
first=(README.md GROK_TALK.md COURT_HANDOFF.md COLLAB.md package.json src/game/config.json src/game/config.ts)
ordered=()
for f in "${first[@]}"; do [[ " ${all[*]} " == *" $f "* ]] && ordered+=("$f"); done
for f in "${all[@]}"; do [[ $f == src/game/court/talk/* ]] && ordered+=("$f"); done
for f in "${all[@]}"; do
  [[ " ${first[*]} " == *" $f "* || $f == src/game/court/talk/* ]] || ordered+=("$f")
done

rev=$(git rev-parse --short HEAD)
txt="$out/azshara-source.txt"
{
  echo "AZSHARA'S SIGNAL DEFENSE: THE WHOLE APP, READABLE"
  echo "From commit $rev, $(date -u +%Y-%m-%d). For reading, review and suggestions."
  echo
  echo "What is here: every source file (React + TypeScript, TanStack Start, Canvas games),"
  echo "src/game/config.json (every number and name the game uses), the Court's words"
  echo "(src/game/court/talk/*.json) and the docs. Not here: the Android signing files,"
  echo "CI, lockfiles and images. Your own settings, texts and Reps live on your phone:"
  echo "Options -> Backup -> Share file gives them as one JSON file, to attach as well."
  echo "README.md explains every mode; GROK_TALK.md how to add to the Court's words."
  echo
  echo "CONTENTS (${#ordered[@]} files, lines each)"
  for f in "${ordered[@]}"; do printf '  %s  (%s)\n' "$f" "$(git show "HEAD:$f" | wc -l | tr -d ' ')"; done
  for f in "${ordered[@]}"; do
    echo
    echo "==================== FILE: $f ===================="
    git show "HEAD:$f"
  done
} >"$txt"

zip="$out/court-talk-pack.zip"
rm -f "$zip"
python3 - "$zip" "$rev" <<'PY'
import subprocess, sys, zipfile
zip_path, rev = sys.argv[1], sys.argv[2]
files = subprocess.run(["git", "ls-files", "src/game/court/talk", "GROK_TALK.md"], capture_output=True, text=True, check=True).stdout.split()
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for f in files:
        data = subprocess.run(["git", "show", f"HEAD:{f}"], capture_output=True, check=True).stdout
        z.writestr(f.split("/")[-1], data)
PY

echo "Wrote $txt ($(du -h "$txt" | cut -f1)) and $zip ($(du -h "$zip" | cut -f1)) from $rev."
