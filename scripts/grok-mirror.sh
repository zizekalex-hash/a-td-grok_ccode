#!/usr/bin/env bash
# Keeps the public copy for Grok (github.com/zizekalex-hash/a-td-grok_ccode) in step
# with this private repository. Grok's GitHub login only reaches public
# repositories, so it works there; see "Working together" in COURT_HANDOFF.md.
#
#   scripts/grok-mirror.sh publish   Puts this repository's committed files (less
#                                    the private ones below) on the copy's main
#                                    branch as one new commit. The private history
#                                    is never pushed. Makes grok/next if missing.
#   scripts/grok-mirror.sh pull      Applies Grok's new work on the copy's
#                                    grok/next branch to this working tree (not
#                                    committed), and remembers how far it got.
#   scripts/grok-mirror.sh status    Shows what Grok has that is not brought over yet.
set -euo pipefail

MIRROR=${MIRROR:-https://github.com/zizekalex-hash/a-td-grok_ccode}
cd "$(git rev-parse --show-toplevel)"

# Never copied: the APK signing key and its build settings, the APK workflow,
# sandbox files, the project id, screenshots and this sync's own marker.
EXCLUDE=(mobile/android .github .grok .project_id screenshots AGENTS.md .grok-mirror-last)
# The last commit of grok/next already brought over (committed with the rest).
MARK=.grok-mirror-last

remote() {
  git remote get-url grok >/dev/null 2>&1 || git remote add grok "$MIRROR"
  git fetch -q grok 2>/dev/null || true
}

publish() {
  remote
  local idx tree parent commit
  idx=$(mktemp)
  GIT_INDEX_FILE=$idx git read-tree HEAD
  GIT_INDEX_FILE=$idx git rm -rq --cached --ignore-unmatch -- "${EXCLUDE[@]}" >/dev/null
  tree=$(GIT_INDEX_FILE=$idx git write-tree)
  rm -f "$idx"
  parent=$(git rev-parse -q --verify refs/remotes/grok/main || true)
  if [ -n "$parent" ] && [ "$(git rev-parse "$parent^{tree}")" = "$tree" ]; then
    echo "The public copy is already up to date."
    commit=$parent
  else
    commit=$(git commit-tree "$tree" ${parent:+-p "$parent"} \
      -m "Sync from the private repository ($(git rev-parse --short HEAD))")
    git push -q grok "$commit:refs/heads/main"
    echo "Published $(git rev-parse --short HEAD) to the public copy's main."
  fi
  if ! git ls-remote --exit-code --heads grok grok/next >/dev/null 2>&1; then
    git push -q grok "$commit:refs/heads/grok/next"
    echo "Made grok/next for Grok."
  fi
  git fetch -q grok
}

# Where Grok's new work starts: the last commit brought over, or where grok/next left main.
base_of() {
  local head=$1 base
  base=$(cat "$MARK" 2>/dev/null || true)
  if [ -z "$base" ] || ! git merge-base --is-ancestor "$base" "$head" 2>/dev/null; then
    base=$(git merge-base refs/remotes/grok/main "$head")
  fi
  echo "$base"
}

status() {
  remote
  local head base
  head=$(git rev-parse -q --verify refs/remotes/grok/grok/next || true)
  if [ -z "$head" ]; then echo "No grok/next yet."; return 0; fi
  base=$(base_of "$head")
  if [ "$base" = "$head" ]; then echo "Nothing new from Grok."; return 0; fi
  git log --oneline "$base..$head"
}

pull() {
  remote
  local head base patch
  head=$(git rev-parse -q --verify refs/remotes/grok/grok/next || true)
  if [ -z "$head" ]; then echo "No grok/next yet."; return 0; fi
  base=$(base_of "$head")
  if [ "$base" = "$head" ]; then echo "Nothing new from Grok."; return 0; fi
  echo "Grok's new commits:"
  git log --oneline "$base..$head"
  patch=$(mktemp)
  git diff --binary "$base" "$head" -- . "${EXCLUDE[@]/#/:(exclude)}" >"$patch"
  if [ -s "$patch" ]; then
    git apply --3way --whitespace=nowarn "$patch"
    echo "Applied to the working tree. Review, test and commit it."
  else
    echo "Grok's commits change nothing that is brought over."
  fi
  rm -f "$patch"
  echo "$head" >"$MARK"
}

case "${1:-}" in
  publish) publish ;;
  pull) pull ;;
  status) status ;;
  *)
    echo "Usage: scripts/grok-mirror.sh publish|pull|status" >&2
    exit 2
    ;;
esac
