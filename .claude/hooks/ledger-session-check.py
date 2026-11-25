#!/usr/bin/env python3
"""SessionStart/SubagentStart hook: ledger summary, checksum check and the
completion verdict as JSON additionalContext (both harnesses read that field);
a new session's start also judges the pause hand-off record. Always exits 0:
neither event can block. DSH's SessionStart wiring passes --harness dsh."""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

PARSE_MSG = "ledger-session-check: cannot parse hook input"
NO_CHECK_MSG = ("LEDGER: project check (check_cmd) not run at this start; it runs "
                "at session resume, after compaction (Claude Code only) and in "
                "the Stop gate")
HANDOFF_TRIPPED = ("LEDGER: ledger changed since the pause hand-off "
                   "(recorded ledger_version={old}, now {new}); write tools and "
                   "Bash/pwsh are blocked until the user runs python3 "
                   "scripts/ledger-amend.py acknowledge-handoff in their own terminal.")
# SessionStart sources that judge the pause record. DSH also fires startup for
# every subagent child, with no parent marker, so there only resume judges it.
JUDGE_SOURCES = {"claude-code": ("startup", "resume", "clear"), "dsh": ("resume",)}


def project_root(payload):
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return env
    cwd = payload.get("cwd")
    if isinstance(cwd, str) and cwd:
        return cwd
    return os.getcwd()


def kit_root():
    return Path(__file__).resolve().parents[3]


def check_script(root):
    for cand in (Path(root) / "scripts" / "check-ledger.py",
                 Path(root) / "core" / "scripts" / "check-ledger.py",
                 kit_root() / "core" / "scripts" / "check-ledger.py"):
        if cand.is_file():
            return cand
    return None


def read_ledger(root):
    """REQUIREMENTS.json as a dict; None when unreadable or not a JSON object."""
    try:
        data = json.loads((Path(root) / "ledger" / "REQUIREMENTS.json")
                          .read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def ledger_phase(data):
    cur = data.get("current_phase") if data is not None else None
    return cur.strip() if isinstance(cur, str) and cur.strip() else "unset"


def active_check_cmd(data):
    raw = data.get("check_cmd") if data is not None else None
    cmd = raw.strip() if isinstance(raw, str) else ""
    return cmd if cmd else "check_cmd not set"


STATUS_ORDER = ["open", "done", "verified", "deferred-requested",
                "deferred-approved", "dropped"]


def ledger_summary(data):
    if data is None:
        return "LEDGER: summary unavailable (REQUIREMENTS.json unreadable)"
    version = data.get("ledger_version", "?")
    phase = ledger_phase(data)
    counts = {s: 0 for s in STATUS_ORDER}
    items = data.get("items", [])
    if isinstance(items, list):
        for row in items:
            if isinstance(row, dict) and row.get("status") in counts:
                counts[row["status"]] += 1
    tail = " ".join(f"{s}={counts[s]}" for s in STATUS_ORDER)
    return (f"LEDGER: summary ledger_version={version} phase={phase} {tail}")


def checksum_lines(root, data):
    ledger = Path(root) / "ledger" / "REQUIREMENTS.json"
    log = Path(root) / "ledger" / "history" / "log.jsonl"
    sums = Path(root) / "ledger" / "checksums.sha256"
    if data is None:
        return ["LEDGER: checksum check skipped (REQUIREMENTS.json unreadable)"]
    version = data.get("ledger_version", "?")
    try:
        lines = sums.read_text(encoding="utf-8").splitlines()
    except (OSError, ValueError):
        return ["LEDGER: checksums.sha256 unreadable; restore ledger/ from version control"]
    want = {}
    for line in lines:
        parts = line.split()
        if len(parts) >= 2:
            want[parts[1]] = parts[0]
    out = []
    for name, path in (("REQUIREMENTS.json", ledger), ("history/log.jsonl", log)):
        try:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
        except OSError:
            out.append(f"LEDGER: checksum mismatch for {name}")
            continue
        if want.get(name) != digest:
            out.append(f"LEDGER: checksum mismatch for {name}")
    if out:
        out.append("LEDGER: ledger/ changed outside ledger-amend.py; "
                   "restore it before trusting this session")
        return out
    return [f"LEDGER: checksums ok (ledger_version {version})"]


def tripped_line(record):
    new = record.get("current_ledger_version")
    return HANDOFF_TRIPPED.format(old=record.get("ledger_version"),
                                  new="unreadable" if new is None else new)


def judge_handoff(root, data):
    """Judge a pause record once, at a new session's start (P7-3). A matching
    hash deletes it. A changed or unreadable ledger marks it tripped (current
    values null when unreadable), and the verify hook then blocks write tools
    until the user runs acknowledge-handoff."""
    state = Path(root) / ".claude" / "ledger-state" / "handoff.json"
    try:
        record = json.loads(state.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    if not isinstance(record, dict):
        return []
    if record.get("tripped") is not True:
        try:
            digest = hashlib.sha256((Path(root) / "ledger" / "checksums.sha256")
                                    .read_bytes()).hexdigest()
        except OSError:
            digest = None
        readable = data is not None and digest is not None
        version = data.get("ledger_version") if readable else None
        if readable and record.get("ledger_version") == version \
                and record.get("checksums_sha256") == digest:
            try:
                state.unlink()
            except OSError:
                pass
            return [f"LEDGER: hand-off clean (ledger_version={version} "
                    "unchanged since the pause)"]
        record.update(tripped=True, current_ledger_version=version,
                      current_checksums_sha256=digest if readable else None)
        tmp = state.with_name(state.name + ".tmp")
        try:
            tmp.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
            os.replace(tmp, state)
        except OSError as exc:
            return [tripped_line(record),
                    f"LEDGER: could not mark the hand-off tripped ({exc}); "
                    "stop and ask the user"]
    return [tripped_line(record)]


def main():
    ap = argparse.ArgumentParser(prog="ledger-session-check.py")
    ap.add_argument("--harness", choices=sorted(JUDGE_SOURCES), default="claude-code")
    args = ap.parse_args()
    try:
        payload = json.load(sys.stdin)
    except Exception:
        print(PARSE_MSG)
        return 0
    if not isinstance(payload, dict):
        print(PARSE_MSG)
        return 0
    root = project_root(payload)
    if not (Path(root) / "ledger").is_dir() and \
            not (Path(root) / ".claude" / "ledger-state" / "handoff.json").is_file():
        return 0  # no ledger and no pause record: not a kit project, stay silent
    event = "SubagentStart" if payload.get("hook_event_name") == "SubagentStart" else "SessionStart"
    # The project check can take minutes: run it where the session resumes
    # work, not on every subagent spawn or fresh start.
    run_check = event == "SessionStart" and payload.get("source") in ("resume", "compact")
    data = read_ledger(root)
    lines = [ledger_summary(data)]
    lines.extend(checksum_lines(root, data))
    if event == "SessionStart" and payload.get("source") in JUDGE_SOURCES[args.harness]:
        lines.extend(judge_handoff(root, data))
    script = check_script(root)
    if script is None:
        lines.append("LEDGER: check-ledger.py not found; install the kit scripts (G11 layout)")
    else:
        cmd = [sys.executable, str(script), "--root", str(root), "--complete"]
        if run_check:
            # shortcut: Orca abandons a session whose SessionStart hooks run past 60s, so the
            # resume check gets 45s; raise it when the quick gate fits in that budget.
            cmd += ["--run-check", "--check-timeout", "45"]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        checker = [line.strip() for line in
                   (proc.stdout + proc.stderr).splitlines()
                   if line.strip()]
        if proc.returncode == 0:
            lines.append(f"LEDGER: completion gate passes (phase {ledger_phase(data)}; "
                         f"{active_check_cmd(data)})")
            lines.extend(f"LEDGER: {line}" for line in checker)
        else:
            lines.append("LEDGER: completion gate fails; do not claim the phase is complete:")
            lines.extend(f"LEDGER: {line}" for line in checker)
            lines.append("LEDGER: finish the due rows; list any pending deferral requests "
                         "for the user and ask for APPROVE <ID> or REJECT <ID> <reason>.")
        if not run_check:
            lines.append(NO_CHECK_MSG)
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": event,
        "additionalContext": "\n".join(lines)}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
