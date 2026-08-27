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
  load                        counts: total open routed escalated decision_pending terminal, then owner:<key>=<n> for non-terminal
  slice <owner>|all           non-terminal entries: DW-n TAB status TAB owner TAB summary
  show DW-<n>                 print one entry verbatim
  next-id                     next unused DW number
  new "<summary>" "<source>" "<severity>" "<fix-risk>" "<footprint>" "<evidence>" "<status>" "<owner>" "<by>" "<note>"
                              append a canonical entry with the next id; prints DW-<n>
  append DW-<n> "<trailer>"   add one trailer line to that entry (UTC prepended), e.g.
                              "status=resolved-by:3-4-retry-hardening by=adjudication note=commit 9f8e7d6"
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

case "$CMD" in
  load)    scan load ;;
  slice)   [ -n "${3:-}" ] || usage; scan slice "$3" ;;
  show)    [ -n "${3:-}" ] || usage; scan show "$3" ;;
  next-id) scan next-id ;;
  new)
    [ $# -eq 12 ] || { echo "ERROR: new needs exactly 10 arguments (see usage)" >&2; usage; }
    SUMMARY="$3"; SOURCE="$4"; SEV="$5"; RISK="$6"; FOOT="$7"; EVID="$8"; STATUS="$9"; OWNER="${10}"; BY="${11}"; NOTE="${12}"
    case "$SUMMARY$SOURCE$EVID$NOTE" in *$'\n'*) echo "ERROR: arguments must be single-line" >&2; exit 1 ;; esac
    ID="DW-$(scan next-id)"
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
