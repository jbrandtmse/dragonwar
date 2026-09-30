#!/usr/bin/env bash
# Deferred-work ledger tool for /epic-cycle (skill-rules Rule 15 + Rule 17).
#
# Cross-platform: Git Bash on Windows, bash 3.2+ on macOS/Linux; needs awk (gawk, mawk, or
# BSD awk) and date. Output is pure ASCII key=value / TAB-separated text for the lead to parse.
# The lead NEVER reads the whole ledger: it uses `load`, `slice`, and `show`, and writes only
# through `new` and `append` (append-only trailer lines; union-merge safe).
#
# Entry grammar (one entry = one heading, a fixed body written once, then trailer lines):
#   ### DW-41: <one-line summary>
#   - source: <spec or stage> | severity: <high|med|low> | fix-risk: <low|med|high> | footprint: <in-story|in-epic|out-of-footprint>
#   - evidence: <why this is real, <= 3 lines>
#   - <UTC> status=<status> owner=<story-key|burndown|none> by=<stage> note=<short>
#   - <UTC> occurrence=<story-key>
# Effective status/owner = the LAST trailer line that sets each. Statuses:
#   non-terminal: open | routed | escalated | decision-pending
#   terminal:     by-design | wontfix-theoretical | wontfix-accepted | dropped | resolved-by:<story-key>
set -euo pipefail

FILE="${1:-}"; CMD="${2:-}"
usage() {
  cat >&2 <<'EOF'
usage: bash ledger.sh <deferred-work.md> <command> [args]
  load                        counts: total open routed escalated decision_pending terminal owner_unknown, then owner:<key>=<n> for non-terminal
                              (an owner that is not `burndown` and not a key in the sibling sprint-status.yaml is suffixed " UNKNOWN")
  slice <owner>|all|unknown   non-terminal entries: DW-n TAB status TAB owner TAB summary (`unknown` = owners the tracker does not know)
  show DW-<n>                 print one entry verbatim
  next-id                     next unused DW number
  new "<summary>" "<source>" "<severity>" "<fix-risk>" "<footprint>" "<evidence>" "<status>" "<owner>" "<by>" "<note>"
                              append a canonical entry with the next id; prints DW-<n>
  append DW-<n> "<trailer>"   add one trailer line to that entry (UTC prepended), e.g.
                              "status=resolved-by:3-4-retry-hardening by=adjudication note=commit 9f8e7d6"
Owner validation: `new` and any `append` carrying owner= refuse an owner that is neither `burndown` nor a
`development_status:` key in <ledger-dir>/sprint-status.yaml (skipped when that file is absent, or with
LEDGER_OWNER_CHECK=off). A retitled story changes its key; a stale key would orphan the entry from every gate.
EOF
  exit 1
}
[ -n "$FILE" ] && [ -n "$CMD" ] || usage
case "$CMD" in load|slice|show|next-id|new|append) ;; *) usage ;; esac
if [ ! -f "$FILE" ]; then
  case "$CMD" in
    load) echo "total=0 open=0 routed=0 escalated=0 decision_pending=0 terminal=0"; exit 0 ;;
    slice) exit 0 ;;
    next-id) echo 1; exit 0 ;;
    new) printf '# Deferred Work Ledger\n\nSee _bmad/custom/skill-rules.md Rule 15 (entry grammar) and Rule 17 (the drain).\n' > "$FILE" ;;
    *) echo "ERROR: $FILE not found" >&2; exit 1 ;;
  esac
fi

# Shared scanner: computes effective status/owner per entry, then acts per mode.
scan() {
  awk -v mode="$1" -v arg="${2:-}" '
    function terminal(s) { return (s == "by-design" || s == "wontfix-theoretical" || s == "wontfix-accepted" || s == "dropped" || s ~ /^resolved-by:/) }
    function emit(   k) {
      if (id == "") return
      n++; ids[n] = id; st[n] = status; ow[n] = owner; sm[n] = summary; blk[n] = block
    }
    /^### DW-[0-9]+: / {
      emit(); id = $2; sub(/:$/, "", id); summary = $0; sub(/^### DW-[0-9]+: /, "", summary)
      status = "open"; owner = "none"; block = $0; next
    }
    id != "" {
      if ($0 ~ /^### /) { emit(); id = ""; next }
      block = block "\n" $0
      if ($0 ~ /^- [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9:]+Z /) {
        for (i = 3; i <= NF; i++) {
          if ($i ~ /^status=/) status = substr($i, 8)
          else if ($i ~ /^owner=/) owner = substr($i, 7)
        }
      }
    }
    END {
      emit()
      if (mode == "load") {
        for (i = 1; i <= n; i++) {
          total++
          if (terminal(st[i])) term++
          else { cnt[st[i]]++; own[ow[i]]++ }
        }
        printf "total=%d open=%d routed=%d escalated=%d decision_pending=%d terminal=%d\n", total, cnt["open"]+0, cnt["routed"]+0, cnt["escalated"]+0, cnt["decision-pending"]+0, term+0
        for (k in own) printf "owner:%s=%d\n", k, own[k]
      } else if (mode == "slice") {
        for (i = 1; i <= n; i++) if (!terminal(st[i]) && (arg == "all" || ow[i] == arg)) printf "%s\t%s\t%s\t%s\n", ids[i], st[i], ow[i], sm[i]
      } else if (mode == "show") {
        for (i = 1; i <= n; i++) if (ids[i] == arg) { print blk[i]; found = 1 }
        if (!found) { print "ERROR: " arg " not found" > "/dev/stderr"; exit 1 }
      } else if (mode == "next-id") {
        for (i = 1; i <= n; i++) { v = ids[i]; sub(/^DW-/, "", v); if (v + 0 > max) max = v + 0 }
        print max + 1
      } else if (mode == "exists") {
        for (i = 1; i <= n; i++) if (ids[i] == arg) found = 1
        exit found ? 0 : 1
      }
    }
  ' "$FILE"
}

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Parallel epics (/epic-cycle orchestrator mode) share ONE DW number space across worktrees,
# each holding its own copy of this file. "Highest id in THIS file + 1" let two concurrent
# worktrees mint the same DW-n for different findings (DragonWar, 2026-09-29: both epics
# minted DW-292..294), which the union merge then turns into duplicate headings. So when a
# shared counter exists, `new` claims its number there under an atomic mkdir lock -- the
# mechanism spine-next-id already uses for AD ids -- and never below this file's own
# high-water mark. No counter (a sequential run): unchanged behaviour, max + 1.
# Counter: $LEDGER_NEXT_ID_FILE, else <main checkout>/.worktrees/.coordination/ledger-next-id
# (found through git's common dir, so it resolves identically from any linked worktree).
counter_file() {
  if [ -n "${LEDGER_NEXT_ID_FILE:-}" ]; then printf '%s' "$LEDGER_NEXT_ID_FILE"; return 0; fi
  gcd="$(git -C "$(dirname "$FILE")" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 0
  [ -n "$gcd" ] && printf '%s' "$(dirname "$gcd")/.worktrees/.coordination/ledger-next-id"
  return 0
}
claim_id() {
  local_next="$(scan next-id)"
  cf="$(counter_file)"
  if [ -z "$cf" ] || [ ! -f "$cf" ]; then printf '%s' "$local_next"; return 0; fi
  lk="$cf.lock"; tries=0
  until mkdir "$lk" 2>/dev/null; do
    tries=$((tries + 1))
    if [ "$tries" -ge 120 ]; then echo "ERROR: ledger id counter lock $lk held for over 60 s; not stealing it" >&2; return 1; fi
    sleep 0.5
  done
  n="$(tr -dc '0-9' < "$cf")"
  if [ -z "$n" ]; then rmdir "$lk"; echo "ERROR: ledger id counter $cf is empty or not a number" >&2; return 1; fi
  [ "$local_next" -gt "$n" ] && n="$local_next"
  printf '%s\n' "$((n + 1))" > "$cf"
  rmdir "$lk"
  printf '%s' "$n"
}

# Owner validation (Rule 15/17). The tracker lives next to the ledger; its `development_status:` keys are the
# only legal owners besides `burndown`. Field report 2026-08-30: two entries sat on a retitled story's old
# key and were invisible to every drain, with no error and no count anomaly.
TRACKER="$(dirname "$FILE")/sprint-status.yaml"
tracker_keys() {
  awk '/^development_status:/ { f = 1; next } f && /^[^ #]/ { f = 0 } f && /^  [A-Za-z0-9_-]+:/ { k = $1; sub(/:$/, "", k); print k }' "$TRACKER"
}
owner_check_active() { [ "${LEDGER_OWNER_CHECK:-on}" != "off" ] && [ -f "$TRACKER" ]; }
check_owner() {
  owner_check_active || return 0
  case "$1" in burndown|"") return 0 ;; esac
  if ! tracker_keys | grep -qx -- "$1"; then
    pre="$(printf '%s' "$1" | sed -E 's/^([0-9]+-[0-9]+)-.*/\1-/')"
    cand="$(tracker_keys | grep -- "^$pre" | head -3 | tr '\n' ' ')"
    echo "ERROR: owner=$1 is not a story key in $TRACKER (same-number keys: ${cand:-none}). Use the exact key or burndown; LEDGER_OWNER_CHECK=off to bypass (migration only)." >&2
    return 1
  fi
}

case "$CMD" in
  load)
    if owner_check_active; then
      scan load | awk -v keys="$(tracker_keys | tr '\n' ' ')" '
        BEGIN { n = split(keys, a, " "); for (i = 1; i <= n; i++) known[a[i]] = 1 }
        /^total=/ { hdr = $0; next }
        /^owner:/ { k = $0; sub(/^owner:/, "", k); sub(/=.*/, "", k); if (k != "burndown" && !(k in known)) { unknown++; $0 = $0 " UNKNOWN" } }
        { lines[++m] = $0 }
        END { print hdr " owner_unknown=" unknown + 0; for (i = 1; i <= m; i++) print lines[i] }'
    else
      scan load | awk '/^total=/ { print $0 " owner_unknown=0"; next } { print }'
    fi ;;
  slice)
    [ -n "${3:-}" ] || usage
    if [ "$3" = "unknown" ]; then
      owner_check_active || exit 0
      scan slice all | awk -F'\t' -v keys="$(tracker_keys | tr '\n' ' ')" '
        BEGIN { n = split(keys, a, " "); for (i = 1; i <= n; i++) known[a[i]] = 1 }
        $3 != "burndown" && !($3 in known)'
    else scan slice "$3"; fi ;;
  show)    [ -n "${3:-}" ] || usage; scan show "$3" ;;
  next-id) scan next-id ;;
  new)
    [ $# -eq 12 ] || { echo "ERROR: new needs exactly 10 arguments (see usage)" >&2; usage; }
    SUMMARY="$3"; SOURCE="$4"; SEV="$5"; RISK="$6"; FOOT="$7"; EVID="$8"; STATUS="$9"; OWNER="${10}"; BY="${11}"; NOTE="${12}"
    case "$SUMMARY$SOURCE$EVID$NOTE" in *$'\n'*) echo "ERROR: arguments must be single-line" >&2; exit 1 ;; esac
    check_owner "$OWNER" || exit 1
    NUM="$(claim_id)" || exit 1
    ID="DW-$NUM"
    {
      printf '\n### %s: %s\n' "$ID" "$SUMMARY"
      printf -- '- source: %s | severity: %s | fix-risk: %s | footprint: %s\n' "$SOURCE" "$SEV" "$RISK" "$FOOT"
      printf -- '- evidence: %s\n' "$EVID"
      printf -- '- %s status=%s owner=%s by=%s note=%s\n' "$(now)" "$STATUS" "$OWNER" "$BY" "$NOTE"
    } >> "$FILE"
    echo "$ID" ;;
  append)
    [ -n "${3:-}" ] && [ -n "${4:-}" ] || usage
    ID="$3"; LINE="$4"
    case "$LINE" in *$'\n'*) echo "ERROR: trailer must be a single line" >&2; exit 1 ;; esac
    case " $LINE" in *" owner="*) check_owner "$(printf '%s' "$LINE" | tr ' ' '\n' | grep -m1 '^owner=' | cut -d= -f2-)" || exit 1 ;; esac
    scan exists "$ID" || { echo "ERROR: $ID not found" >&2; exit 1; }
    TS="$(now)"
    # Insert the trailer as the last line of the entry (before the next heading or EOF). Pure line insertion: union-merge safe.
    awk -v id="$ID" -v line="- $TS $LINE" '
      function flushpending() { print line; if (blanks != "") { printf "%s", blanks; blanks = "" } }
      BEGIN { inside = 0 }
      /^### DW-[0-9]+: / {
        if (inside) { flushpending(); inside = 0 }
        h = $2; sub(/:$/, "", h); if (h == id) inside = 1
        print; next
      }
      /^### / { if (inside) { flushpending(); inside = 0 } print; next }
      {
        if (inside) {
          # buffer trailing blank lines so the trailer lands directly after the last content line
          if ($0 ~ /^[[:space:]]*$/) { blanks = blanks $0 "\n"; next }
          if (blanks != "") { printf "%s", blanks; blanks = "" }
          print; next
        }
        print
      }
      END { if (inside) flushpending() }
    ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
    echo "$ID $TS $LINE" ;;
esac
