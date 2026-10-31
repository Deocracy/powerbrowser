#!/usr/bin/env bash
# scripts/matrix/win-matrix-run.sh  (Phase 54, MTX-01)
#
# The host-side matrix driver for the pkg-win11 guest. One run:
#   1. takes the single-writer lock (a second concurrent writer refuses, naming the holder);
#   2. reverts the domain to its clean-baseline snapshot ONCE, then swaps the inputs ISO in;
#   3. runs the cells in schema order inside that one guest session. The cells are a chain: launch,
#      update and uninstall need the product install builds, and no-residue diffs the registry
#      snapshot that install took before it ran, so reverting between cells would make four of the
#      five fail by construction. Each cell runs win-matrix-guest.ps1 through the QEMU guest agent
#      (guest-exec, then guest-exec-status until exit). A WinRM or SSH fallback is an owner setup
#      step and is not coded here;
#   4. keeps each cell's exit code and captured stdout as FILES in a temp directory (never in argv: Linux caps
#      one argument at 128 KiB and a registry diff exceeds it) and hands the directory to
#      win-matrix-record.py, the one writer of the record. Cell names, keys and markers come from
#      win-matrix-schema.json, which the verifier reads too.
#
# The inputs (setup.exe, the complete MAR, win-matrix-guest.ps1) reach the guest on a read-only ISO
# (volume label PBMATRIX, the schema's inputsVolumeLabel) attached to the domain's CD-ROM device; the
# guest writes its own work files under C:\pbmatrix. PB_MATRIX_ISO names the ISO on the host.
#
# Usage (owner, at the 54-04 checkpoint): PB_MATRIX_ISO=/path/pb-matrix-inputs.iso scripts/matrix/win-matrix-run.sh
# The record is scripts/matrix/win-matrix-record.json and is written by this script only.
#
# Honestly: the guest is not provisioned in this environment. Without the domain, the driver fails naming
# the missing piece and writes nothing. The quick tier never runs it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCHEMA="$REPO_ROOT/scripts/matrix/win-matrix-schema.json"
DOMAIN="${PB_MATRIX_DOMAIN:-pkg-win11}"
SNAPSHOT="${PB_MATRIX_SNAPSHOT:-clean-baseline}"
ISO="${PB_MATRIX_ISO:-}"
CDROM_TARGET="${PB_MATRIX_CDROM_TARGET:-sdb}"
RECORD="$REPO_ROOT/scripts/matrix/win-matrix-record.json"
LOCK="$REPO_ROOT/scripts/matrix/.win-matrix-record.lock"
export DOMAIN

fail() { echo "win-matrix-run: FAIL -- $*" >&2; exit 1; }

command -v virsh >/dev/null || fail "virsh is absent on this host; the matrix runs on the libvirt host (owner checkpoint 54-04)"
virsh dominfo "$DOMAIN" >/dev/null 2>&1 || fail "libvirt domain '$DOMAIN' is not defined; the owner defines it from scripts/matrix/pkg-win11-domain.xml"
virsh snapshot-list "$DOMAIN" --name | grep -qx "$SNAPSHOT" || fail "snapshot '$SNAPSHOT' is absent on $DOMAIN; the owner takes it once the clean baseline is installed"
[ -n "$ISO" ] && [ -f "$ISO" ] || fail "PB_MATRIX_ISO must name the inputs ISO (setup.exe, the complete MAR, win-matrix-guest.ps1; volume label from win-matrix-schema.json)"
mapfile -t CELLS < <(python3 -c 'import json,sys; print("\n".join(json.load(open(sys.argv[1]))["cells"]))' "$SCHEMA")
[ "${#CELLS[@]}" -gt 0 ] || fail "$SCHEMA lists no cells"
LABEL="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["inputsVolumeLabel"])' "$SCHEMA")"
export LABEL

# Single writer: a noclobber lock file; a second writer refuses and names the holder.
if ! ( set -o noclobber; echo "$$ $(date -u +%FT%TZ) $(hostname)" > "$LOCK" ) 2>/dev/null; then
    fail "another matrix run holds $LOCK: $(cat "$LOCK" 2>/dev/null || echo unknown holder)"
fi
CELLDIR="$(mktemp -d)"
trap 'rm -f "$LOCK"; rm -rf "$CELLDIR"' EXIT

# Runs one cell in the guest; writes $CELLDIR/<cell>.code and $CELLDIR/<cell>.out (files, not argv).
run_cell() {
    python3 - "$1" "$CELLDIR" <<'PY'
import base64, json, os, subprocess, sys, time
cell, outdir = sys.argv[1:3]
domain, label = os.environ["DOMAIN"], os.environ["LABEL"]
def agent(req):
    r = subprocess.run(["virsh", "qemu-agent-command", domain, json.dumps(req)], check=True, capture_output=True, text=True)
    return json.loads(r.stdout)["return"]
script = "& ((Get-Volume -FileSystemLabel %s).DriveLetter + ':\\win-matrix-guest.ps1') -Cell %s -Work C:\\pbmatrix; exit $LASTEXITCODE" % (label, cell)
pid = agent({"execute": "guest-exec", "arguments": {"path": "powershell.exe",
             "arg": ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], "capture-output": True}})["pid"]
code, text = "1", "guest-exec-status did not report exit within the timeout"
for _ in range(900):
    st = agent({"execute": "guest-exec-status", "arguments": {"pid": pid}})
    if st.get("exited"):
        code = str(st.get("exitcode", 1))
        text = base64.b64decode(st.get("out-data", "")).decode("utf-8", "replace")
        break
    time.sleep(2)
open(os.path.join(outdir, cell + ".out"), "w", encoding="utf-8").write(text)
open(os.path.join(outdir, cell + ".code"), "w").write(code)
PY
}

virsh snapshot-revert "$DOMAIN" "$SNAPSHOT" --running >/dev/null 2>&1 || fail "could not revert $DOMAIN to $SNAPSHOT"
virsh change-media "$DOMAIN" "$CDROM_TARGET" "$ISO" --update --force >/dev/null 2>&1 || fail "could not attach $ISO to $DOMAIN device $CDROM_TARGET"
for _ in $(seq 1 90); do
    virsh qemu-agent-command "$DOMAIN" '{"execute":"guest-ping"}' >/dev/null 2>&1 && break
    sleep 5
done
virsh qemu-agent-command "$DOMAIN" '{"execute":"guest-ping"}' >/dev/null 2>&1 || fail "the guest agent of $DOMAIN did not answer after the revert"

for cell in "${CELLS[@]}"; do
    run_cell "$cell"
done

tmp_record="$(mktemp)"
python3 "$REPO_ROOT/scripts/matrix/win-matrix-record.py" --schema "$SCHEMA" --dir "$CELLDIR" --out "$tmp_record" || { rm -f "$tmp_record"; fail "the record could not be built"; }
mv "$tmp_record" "$RECORD"
echo "win-matrix-run: wrote $RECORD (${#CELLS[@]} cells; the owner adds the background cell, BLOCKED.md item 7)"
