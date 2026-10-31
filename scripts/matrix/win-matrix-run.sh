#!/usr/bin/env bash
# scripts/matrix/win-matrix-run.sh  (Phase 54, MTX-01)
#
# The host-side matrix driver for the pkg-win11 guest. Per cell it:
#   1. takes the single-writer lock (a second concurrent writer refuses, naming the holder);
#   2. reverts the domain to its clean-baseline snapshot, so every cell starts from the same state;
#   3. runs win-matrix-guest.ps1 for that one cell through the QEMU guest agent (guest-exec, then
#      guest-exec-status until the process exits). The guest agent is the only transport here; a
#      WinRM or SSH fallback is an owner setup step and is not coded in this driver;
#   4. takes the verdict from the guest process exit code and the evidence from its captured stdout,
#      verbatim, and writes both into the record under the lock.
#
# The staged inputs (setup.exe, the complete MAR, win-matrix-guest.ps1) reach the guest on a read-only
# virtual CD-ROM that the owner attaches at setup (BLOCKED.md); this driver does not copy files into the guest.
#
# Usage (owner, at the 54-04 checkpoint): scripts/matrix/win-matrix-run.sh   (no arguments)
# The record is scripts/matrix/win-matrix-record.json and is written by this script only.
#
# Honestly: the guest is not provisioned in this environment. Without the domain, the driver fails naming
# the missing piece and writes nothing. The quick tier never runs it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOMAIN="${PB_MATRIX_DOMAIN:-pkg-win11}"
SNAPSHOT="${PB_MATRIX_SNAPSHOT:-clean-baseline}"
GUEST_WORK='C:\pbmatrix'
RECORD="$REPO_ROOT/scripts/matrix/win-matrix-record.json"
LOCK="$REPO_ROOT/scripts/matrix/.win-matrix-record.lock"
CELLS=(install launch update uninstall no-residue)

fail() { echo "win-matrix-run: FAIL -- $*" >&2; exit 1; }

command -v virsh >/dev/null || fail "virsh is absent on this host; the matrix runs on the libvirt host (owner checkpoint 54-04)"
virsh dominfo "$DOMAIN" >/dev/null 2>&1 || fail "libvirt domain '$DOMAIN' is not defined; the owner defines it from scripts/matrix/pkg-win11-domain.xml"
virsh snapshot-list "$DOMAIN" --name | grep -qx "$SNAPSHOT" || fail "snapshot '$SNAPSHOT' is absent on $DOMAIN; the owner takes it once the clean baseline is installed"

# Single writer: a noclobber lock file; a second writer refuses and names the holder.
if ! ( set -o noclobber; echo "$$ $(date -u +%FT%TZ) $(hostname)" > "$LOCK" ) 2>/dev/null; then
    fail "another matrix run holds $LOCK: $(cat "$LOCK" 2>/dev/null || echo unknown holder)"
fi
trap 'rm -f "$LOCK"' EXIT

# Runs one cell in the guest and prints '<exit-code>' on the first line, then the captured stdout.
run_cell() {
    local cell="$1" pid
    pid="$(python3 - "$DOMAIN" "$cell" "$GUEST_WORK" <<'PY'
import base64, json, subprocess, sys
domain, cell, work = sys.argv[1:4]
args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", work + r"\win-matrix-guest.ps1",
        "-Cell", cell, "-Work", work]
req = {"execute": "guest-exec", "arguments": {"path": "powershell.exe", "arg": args, "capture-output": True}}
out = subprocess.run(["virsh", "qemu-agent-command", domain, json.dumps(req)], check=True, capture_output=True, text=True).stdout
print(json.loads(out)["return"]["pid"])
PY
)"
    python3 - "$DOMAIN" "$pid" <<'PY'
import base64, json, subprocess, sys, time
domain, pid = sys.argv[1], int(sys.argv[2])
for _ in range(600):
    req = {"execute": "guest-exec-status", "arguments": {"pid": pid}}
    st = json.loads(subprocess.run(["virsh", "qemu-agent-command", domain, json.dumps(req)],
                                   check=True, capture_output=True, text=True).stdout)["return"]
    if st.get("exited"):
        code = st.get("exitcode", 1)
        text = base64.b64decode(st.get("out-data", "")).decode("utf-8", "replace")
        print(code)
        print(text, end="")
        break
    time.sleep(2)
else:
    print(1)
    print("guest-exec-status did not report exit within the timeout", end="")
PY
}

tmp_record="$(mktemp)"
printf '{"build_target":"","application_ini":"","maintenance_service_enabled":false,"cells":{}}\n' > "$tmp_record"

for cell in "${CELLS[@]}"; do
    virsh snapshot-revert "$DOMAIN" "$SNAPSHOT" --running >/dev/null 2>&1 || fail "could not revert $DOMAIN to $SNAPSHOT before cell $cell"
    result="$(run_cell "$cell")"
    code="$(printf '%s\n' "$result" | sed -n '1p')"
    evidence="$(printf '%s\n' "$result" | sed '1d')"
    verdict="FAIL"
    [ "$code" = "0" ] && verdict="PASS"
    python3 - "$tmp_record" "$cell" "$verdict" "$evidence" <<'PY'
import json, sys
path, cell, verdict, evidence = sys.argv[1:5]
rec = json.load(open(path))
rec["cells"][cell] = {"verdict": verdict, "evidence": evidence, "transport": "guest-agent"}
json.dump(rec, open(path, "w"), indent=2)
PY
done

mv "$tmp_record" "$RECORD"
echo "win-matrix-run: wrote $RECORD (${#CELLS[@]} cells)"
