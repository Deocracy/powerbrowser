#!/usr/bin/env python3
"""Ledger gate: row rules, ID-set equality, deferral owner/phase/age."""
import argparse
import datetime
import hashlib
import json
import os
import re
import signal
import sys
from pathlib import Path

ID_RE = re.compile(r"^[A-Z][A-Z0-9]*-[0-9]+$")
STATUS_VALUES = ["open", "done", "verified", "deferred-requested",
                 "deferred-approved", "dropped"]
DEFERRAL_SET = {"deferred-requested", "deferred-approved"}
ROW_FIELDS = ["id", "text", "status", "spec_ref", "test_ref", "code_ref",
              "evidence", "owner", "phase", "deferred_at", "reason"]


def parse_phase(value):
    try:
        parts = str(value).strip().split(".")
        if not parts or any(p == "" for p in parts):
            return None
        return tuple(int(p) for p in parts)
    except ValueError:
        return None


def tree_fingerprint(root):
    """sha256 over HEAD, the binary worktree diff, and each untracked non-ignored
    path plus its content, excluding .claude/ledger-state/ itself (the cache's
    own directory, or the cache would never hit). None when git is unavailable
    or any git call fails."""
    import subprocess
    try:
        head = subprocess.run(["git", "rev-parse", "HEAD"],
                              cwd=str(root), capture_output=True,
                              text=True, timeout=10)
        diff = subprocess.run(["git", "diff", "HEAD", "--binary"],
                              cwd=str(root), capture_output=True,
                              text=True, timeout=10)
        others = subprocess.run(["git", "ls-files", "--others",
                                 "--exclude-standard", "-z"],
                                cwd=str(root), capture_output=True,
                                text=True, timeout=10)
        if head.returncode != 0 or diff.returncode != 0 or others.returncode != 0:
            return None
        h = hashlib.sha256()
        h.update(head.stdout.encode("utf-8", "replace"))
        h.update(b"\x00")
        h.update(diff.stdout.encode("utf-8", "replace"))
        h.update(b"\x00")
        for name in sorted(p for p in others.stdout.split("\x00") if p):
            if name == ".claude/ledger-state/check-pass" or name.startswith(".claude/ledger-state/"):
                continue
            h.update(name.encode("utf-8", "replace"))
            h.update(b"\x00")
            try:
                h.update((Path(root) / name).read_bytes())
            except OSError:
                return None
            h.update(b"\x00")
        return h.hexdigest()
    except Exception:
        return None


def mockup_id_violations(root, data):
    """IDs of the frozen mockup variant missing from the built UI sources.

    Runs only when the user froze a variant (top-level mockup_freeze); with
    no frozen variant there is nothing checkable (S8-lean). The worker is
    scripts/mockup-id-check.py (G11 layout, else the kit copy); its lines
    are already exact violation lines, so they join the gate output as-is."""
    import subprocess
    import sys
    freeze = data.get("mockup_freeze")
    if freeze is None:
        return []
    if not isinstance(freeze, dict):
        return ["LEDGER: mockup_freeze must be an object or null"]
    script = None
    for cand in (Path(root) / "scripts" / "mockup-id-check.py",
                 Path(root) / "core" / "scripts" / "mockup-id-check.py",
                 Path(__file__).with_name("mockup-id-check.py")):
        if cand.is_file():
            script = cand
            break
    if script is None:
        return ["mockup check unavailable: mockup-id-check.py not found (G11 layout)"]
    try:
        proc = subprocess.run([sys.executable, str(script),
                               "--root", str(root)],
                              capture_output=True, text=True, timeout=30)
    except Exception:
        return ["mockup check could not run: mockup-id-check.py failed to execute"]
    lines = [line.strip() for line in
             (proc.stdout + "\n" + proc.stderr).splitlines()
             if line.strip()]
    if proc.returncode == 0:
        return []
    return lines if lines else ["mockup check failed with no output"]


def run_check_command(root, data, args):
    raw = data.get("check_cmd")
    cmd = raw.strip() if isinstance(raw, str) else ""
    if not cmd:
        print("check_cmd not set; skipping runnable check "
              "(S8-lean: gates on checkable items only)")
        return []
    state_dir = Path(root) / ".claude" / "ledger-state"
    stamp = state_dir / "check-pass"
    fingerprint = tree_fingerprint(root)
    if fingerprint is not None:
        try:
            if stamp.read_text(encoding="utf-8").strip() == fingerprint:
                print("check_cmd skipped (tree unchanged since last pass)")
                return []
        except OSError:
            pass
    try:
        timeout = float(args.check_timeout)
    except (TypeError, ValueError):
        print("LEDGER: --check-timeout must be a number")
        return ["LEDGER: --check-timeout must be a number"]
    import subprocess
    child = subprocess.Popen(cmd, shell=True, cwd=str(root),
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             text=True, start_new_session=True)
    try:
        stdout, stderr = child.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except (OSError, ProcessLookupError):
            pass
        try:
            stdout, stderr = child.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            stdout, stderr = "", ""
        label = str(int(timeout)) if float(timeout).is_integer() else ("%g" % timeout)
        return [f"check_cmd timed out after {label}s: {cmd}"]
    if child.returncode == 0:
        if fingerprint is not None:
            try:
                state_dir.mkdir(parents=True, exist_ok=True)
                ignore = state_dir / ".gitignore"
                if not ignore.exists():
                    ignore.write_text("*\n", encoding="utf-8")
                stamp.write_text(fingerprint, encoding="utf-8")
            except OSError:
                pass
        return []
    lines = [f"check_cmd failed with exit {child.returncode}: {cmd}"]
    tail = [line for line in (stdout + "\n" + stderr).splitlines()
            if line.strip()][-20:]
    lines.extend(f"check output: {line.rstrip()}" for line in tail)
    return lines


def run_scope_check(root):
    """Scope-lock lines for --complete: run plan-gate.py --check-scope from the
    G11 layout. Fail closed when the script is missing or cannot run."""
    import subprocess
    import sys
    for cand in (Path(root) / "scripts" / "plan-gate.py",
                 Path(root) / "core" / "scripts" / "plan-gate.py",
                 Path(__file__).with_name("plan-gate.py")):
        if cand.is_file():
            script = cand
            break
    else:
        return ["scope check unavailable: plan-gate.py not found (G11 layout)"]
    try:
        proc = subprocess.run([sys.executable, str(script),
                               "--root", str(root), "--check-scope"],
                              capture_output=True, text=True, timeout=15)
    except subprocess.TimeoutExpired:
        return ["LEDGER: scope check timed out"]
    except Exception:
        return ["scope check cannot run: plan-gate.py --check-scope failed to start"]
    if proc.returncode == 0:
        return []
    lines = [line.strip() for line in
             (proc.stdout + "\n" + proc.stderr).splitlines()
             if line.strip()]
    return lines if lines else ["scope check cannot run: plan-gate.py produced no output"]


def run_phase_gate(root):
    """Violation lines from phase-gate.py, so --complete joins the checks-before-code gate."""
    import subprocess
    for cand in (Path(root) / "scripts" / "phase-gate.py",
                 Path(root) / "core" / "scripts" / "phase-gate.py",
                 Path(__file__).resolve().parent / "phase-gate.py"):
        if cand.is_file():
            script = cand
            break
    else:
        return ["LEDGER: phase-gate.py not found; install the kit scripts (G11 layout)"]
    try:
        child = subprocess.run([sys.executable, str(script),
                                "--root", str(root)],
                               capture_output=True, text=True, timeout=30)
    except subprocess.TimeoutExpired:
        return ["LEDGER: phase-gate.py timed out after 30s"]
    except Exception:
        return ["LEDGER: phase-gate.py could not run"]
    if child.returncode == 0:
        return []
    lines = [line.strip() for line in (child.stdout + child.stderr).splitlines()
             if line.strip()]
    return lines or [f"LEDGER: phase-gate.py failed with exit {child.returncode}"]


def main():
    ap = argparse.ArgumentParser(prog="check-ledger.py")
    ap.add_argument("--root", default=".")
    ap.add_argument("--current-phase", default=None)
    ap.add_argument("--base-log", default=None,
                    help="history log from the base commit; the current log must extend it")
    ap.add_argument("--complete", action="store_true",
                    help="also fail due open rows, unapproved deferrals and overdue deferrals")
    ap.add_argument("--run-check", action="store_true",
                    help="also run the ledger check_cmd through the shell")
    # Budget under the 1020 s Stop hook timeout (a killed hook does not block):
    # git fingerprint 3x10 + check_cmd 900 + kill wait 5 + mockup 30 + scope 15
    # + phase gate 30 = 1010 s (D-63 (11), Chris 2026-11-23).
    ap.add_argument("--check-timeout", type=float, default=900,
                    help="seconds before check_cmd counts as timed out")
    args = ap.parse_args()
    root = Path(args.root)
    ledger = root / "ledger" / "REQUIREMENTS.json"
    log = root / "ledger" / "history" / "log.jsonl"
    sums = root / "ledger" / "checksums.sha256"
    if not ledger.is_file():
        print("LEDGER: REQUIREMENTS.json missing")
        return 1
    try:
        data = json.loads(ledger.read_text(encoding="utf-8"))
    except Exception:
        print("LEDGER: REQUIREMENTS.json unparsable")
        return 1
    if not isinstance(data, dict):
        print("LEDGER: REQUIREMENTS.json must be a JSON object")
        return 1
    if not log.is_file():
        print("LEDGER: history/log.jsonl missing")
        return 1
    ops = []
    try:
        for line in log.read_text(encoding="utf-8").splitlines():
            if line.strip():
                ops.append(json.loads(line))
    except Exception:
        print("LEDGER: history/log.jsonl unparsable")
        return 1
    if not sums.is_file():
        print("LEDGER: checksums.sha256 missing")
        return 1
    try:
        lines = sums.read_text(encoding="utf-8").splitlines()
    except OSError:
        print("LEDGER: checksums.sha256 unparsable")
        return 1
    want = {}
    for line in lines:
        parts = line.split()
        if len(parts) >= 2:
            want[parts[1]] = parts[0]
    out = []
    for name, path in (("REQUIREMENTS.json", ledger),
                       ("history/log.jsonl", log)):
        try:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
        except OSError:
            out.append(f"LEDGER: checksum mismatch for {name}")
            continue
        if want.get(name) != digest:
            out.append(f"LEDGER: checksum mismatch for {name}")
    if args.base_log is not None:
        # A ledger rolled back to an older commit is consistent with itself, so only
        # the base commit's log can show that entries were removed or rewritten.
        try:
            base_ops = [json.loads(line) for line in
                        Path(args.base_log).read_text(encoding="utf-8").splitlines()
                        if line.strip()]
        except (OSError, ValueError):
            print("LEDGER: base log unreadable")
            return 1
        if ops[:len(base_ops)] != base_ops:
            out.append("LEDGER: history log does not extend the base log "
                       "(entries changed or removed)")
    for key in ("current_phase", "check_cmd"):
        if key in data and data[key] is not None and not isinstance(data[key], str):
            print(f"LEDGER: {key} must be a string or null")
            return 1
    mf = data.get("mockup_freeze")
    if mf is not None and not isinstance(mf, dict):
        print("LEDGER: mockup_freeze must be an object or null")
        return 1
    if "scope_lock" in data and data["scope_lock"] is not None \
            and not isinstance(data["scope_lock"], dict):
        print("LEDGER: scope_lock must be an object or null")
        return 1
    locks = data.get("check_locks")
    if locks is not None and not (
            isinstance(locks, dict) and isinstance(locks.get("commit"), str)
            and isinstance(locks.get("files"), dict)
            and all(isinstance(v, str) for v in locks["files"].values())):
        print("LEDGER: check_locks must be an object or null")
        return 1
    base = data.get("check_baseline")
    if base is not None and (not isinstance(base, int) or isinstance(base, bool)):
        print("LEDGER: check_baseline must be an integer or null")
        return 1
    if args.current_phase is None:
        cur = data.get("current_phase")
        if isinstance(cur, str) and cur.strip():
            args.current_phase = cur
    items = data.get("items")
    if not isinstance(items, list):
        print("LEDGER: items is not a list")
        return 1
    seen = {}
    for row in items:
        rid = str(row.get("id", "?")) if isinstance(row, dict) else "?"
        seen[rid] = seen.get(rid, 0) + 1
    for rid, count in seen.items():
        if count > 1:
            out.append(f"{rid}: duplicate id")
    current = set()
    for row in items:
        if not isinstance(row, dict):
            out.append("?: row must be an object")
            continue
        rid = str(row.get("id", "?"))
        current.add(rid)
        for key in ROW_FIELDS:
            if key not in row:
                out.append(f"{rid}: missing field {key}")
        if not ID_RE.match(rid):
            out.append(f"{rid}: malformed id")
        if not isinstance(row.get("text"), str) or not row.get("text", ""):
            out.append(f"{rid}: empty text")
        if row.get("status") not in STATUS_VALUES:
            out.append(f"{rid}: bad status {row.get('status')}")
        if row.get("status") in DEFERRAL_SET:
            for key in ("owner", "phase", "reason"):
                if not isinstance(row.get(key), str) or not row.get(key, ""):
                    out.append(f"{rid}: deferral missing {key}")
            try:
                day = datetime.date.fromisoformat(str(row.get("deferred_at", "")))
            except ValueError:
                out.append(f"{rid}: deferral bad deferred_at")
            else:
                if day > datetime.date.today():
                    out.append(f"{rid}: deferred_at in the future")
            if args.current_phase is not None:
                now_p = parse_phase(args.current_phase)
                tgt_p = parse_phase(str(row.get("phase", "")))
                if now_p is not None and tgt_p is not None and tgt_p < now_p:
                    out.append(f"{rid}: deferral overdue (target phase "
                               f"{row.get('phase')}, current phase "
                               f"{args.current_phase})")
    added = {}
    for op in ops:
        if isinstance(op, dict) and op.get("op") == "add" \
                and isinstance(op.get("id"), str):
            added.setdefault(op["id"], op.get("v", "?"))
    for rid in sorted(set(added) - current):
        out.append(f"{rid}: deleted (added in v{added[rid]})")
    for rid in sorted(current - set(added)):
        if rid != "?":
            out.append(f"{rid}: not added through ledger-amend.py")
    quoted = set()
    for op in ops:
        if not isinstance(op, dict):
            continue
        if op.get("op") in ("approve", "drop") \
                and isinstance(op.get("id"), str) \
                and isinstance(op.get("quote"), str) \
                and op.get("quote", "").strip():
            quoted.add((op["op"], op["id"]))
    for row in items:
        if not isinstance(row, dict):
            continue
        rid = str(row.get("id", "?"))
        if row.get("status") == "deferred-approved" \
                and ("approve", rid) not in quoted:
            out.append(f"{rid}: deferred-approved without a recorded user approval quote")
        if row.get("status") == "dropped" \
                and ("drop", rid) not in quoted:
            out.append(f"{rid}: dropped without a recorded user cut quote")
    if args.complete:
        cur_raw = data.get("current_phase")
        cur_str = cur_raw.strip() if isinstance(cur_raw, str) and cur_raw.strip() else "unset"
        cur_p = parse_phase(cur_raw) if isinstance(cur_raw, str) and cur_raw.strip() else None
        for row in items:
            if not isinstance(row, dict):
                continue
            rid = str(row.get("id", "?"))
            status = row.get("status")
            if status == "open":
                rp_raw = str(row.get("phase", ""))
                rp_str = rp_raw.strip() if rp_raw.strip() else "unset"
                row_p = parse_phase(rp_raw) if rp_raw.strip() else None
                if not rp_raw.strip() or cur_p is None or row_p is None or row_p <= cur_p:
                    out.append(f"{rid}: open and due (row phase {rp_str}, current phase {cur_str})")
            if status == "deferred-requested":
                out.append(f"{rid}: deferred-requested without user approval")
            if status == "deferred-approved":
                rp_raw = str(row.get("phase", ""))
                row_p = parse_phase(rp_raw)
                if cur_p is not None and row_p is not None and row_p <= cur_p:
                    out.append(f"{rid}: deferred to phase {rp_raw.strip()}, due now "
                               f"(current phase {cur_str})")
        out.extend(mockup_id_violations(root, data))
    if args.complete and isinstance(data.get("scope_lock"), dict):
        out.extend(run_scope_check(root))
    if args.run_check:
        code = run_check_command(root, data, args)
        out.extend(code)
    if args.complete:
        out.extend(run_phase_gate(root))
    for line in out:
        print(line)
    return 1 if out else 0


if __name__ == "__main__":
    raise SystemExit(main())
