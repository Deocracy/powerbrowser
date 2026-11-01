#!/usr/bin/env python3
"""Plan-to-list gate and scope-lock check: fail a phase plan that drops a due
ledger ID, and fail a changed locked scope. Fail closed: a ledger, plans
directory or plan the check cannot read is a violation, never a pass."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ID_RE = re.compile(r"\b[A-Z][A-Z0-9]*-[0-9]+\b")


def parse_phase(value):
    try:
        parts = str(value).strip().split(".")
        if not parts or any(p == "" for p in parts):
            return None
        return tuple(int(p) for p in parts)
    except ValueError:
        return None


def load_ledger(root):
    ledger = Path(root) / "ledger" / "REQUIREMENTS.json"
    if not ledger.is_file():
        return None, "LEDGER: REQUIREMENTS.json missing"
    try:
        data = json.loads(ledger.read_text(encoding="utf-8"))
    except Exception:
        return None, "LEDGER: REQUIREMENTS.json unparsable"
    if not isinstance(data.get("items"), list):
        return None, "LEDGER: items is not a list"
    return data, None


def effective_phase(args, data):
    raw = args.phase
    if raw is None or not str(raw).strip():
        cur = data.get("current_phase")
        raw = cur if isinstance(cur, str) and cur.strip() else None
    text = str(raw).strip() if raw is not None else ""
    return text if text else "unset"


def due_ids(data, phase_text, stream="default"):
    """Due set: open rows due under P5-1(a), every deferred-requested row, and
    deferred-approved rows whose target phase is at or below the planned phase
    (ruling I2: the deferral ends there, so the plan must cite the ID).
    Only rows in the planned stream count: a GSD workstream numbers its phases
    independently, so a row's phase compares only within its own stream (a row
    with no "stream" field belongs to "default")."""
    cur_p = parse_phase(phase_text) if phase_text != "unset" else None
    due = []
    for row in data.get("items", []):
        if not isinstance(row, dict):
            continue
        if str(row.get("stream") or "default") != stream:
            continue
        status = row.get("status")
        rid = str(row.get("id", "?"))
        if status == "deferred-requested":
            due.append((rid, "deferred"))
        elif status == "open":
            rp = str(row.get("phase", ""))
            row_p = parse_phase(rp) if rp.strip() else None
            if not rp.strip() or cur_p is None or row_p is None or row_p <= cur_p:
                due.append((rid, "open"))
        elif status == "deferred-approved":
            row_p = parse_phase(row.get("phase", ""))
            if cur_p is not None and row_p is not None and row_p <= cur_p:
                due.append((rid, "open"))
    return due


def cited_ids(plans_dir):
    cited = set()
    for plan in sorted(plans_dir.glob("*-PLAN.md")):
        try:
            text = plan.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            return None, f"PLAN: {plan.name} unreadable: {getattr(exc, 'strerror', None) or exc}"
        cited.update(ID_RE.findall(text))
    return cited, None


def run_coverage(args, data):
    plans_dir = Path(args.plans)
    if not plans_dir.is_dir():
        return [f"PLAN: plans directory missing: {args.plans}"]
    if not sorted(plans_dir.glob("*-PLAN.md")):
        return [f"PLAN: no plans found in {args.plans}"]
    cited, err = cited_ids(plans_dir)
    if err is not None:
        return [err]
    phase_text = effective_phase(args, data)
    out = []
    for rid, kind in due_ids(data, phase_text, args.stream):
        if rid in cited and kind == "open":
            continue
        if kind == "deferred":
            out.append(f"{rid}: deferred-requested without user approval")
        else:
            out.append(f"{rid}: due but not cited in any plan (phase {phase_text})")
    if not out:
        total = len(due_ids(data, phase_text, args.stream))
        scope = "" if args.stream == "default" else f", stream {args.stream}"
        out.append(f"plan gate passed: {total}/{total} IDs cited (phase {phase_text}{scope})")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(prog="plan-gate.py")
    ap.add_argument("--root", default=".")
    ap.add_argument("--phase", default=None)
    ap.add_argument("--plans", default=None)
    ap.add_argument("--check-scope", action="store_true")
    ap.add_argument("--stream", default="default")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args(argv)
    if args.self_test:
        return self_test()
    if not args.stream.strip():
        print("plan-gate.py: --stream needs a name")
        return 2
    if args.plans is None and not args.check_scope:
        print("plan-gate.py: need --plans PLANDIR and/or --check-scope")
        return 2
    if args.phase is not None and args.phase.strip() and parse_phase(args.phase) is None:
        print(f"plan-gate.py: --phase needs a phase value (such as 3 or 2.1): {args.phase}")
        return 2
    data, err = load_ledger(args.root)
    if err is not None:
        print(err)
        return 1
    out = []
    failed = False
    if args.plans is not None:
        lines = run_coverage(args, data)
        if len(lines) == 1 and (lines[0].startswith("plan gate passed")):
            print(lines[0])
        else:
            out.extend(lines)
            failed = True
    if args.check_scope:
        lines, ok = run_scope(args, data)
        if ok and len(lines) == 1 and lines[0].startswith("scope check passed"):
            print(lines[0])
        elif ok:
            print(lines[0])
        else:
            out.extend(lines)
            failed = True
    for line in out:
        print(line)
    return 1 if failed else 0


def extract_scope_field(section, label):
    lab = re.escape(label)
    m = re.search(r"\*\*" + lab + r"(?::\*\*|\*\*\s*:?)\s*([^\n]+)",
                  section, re.IGNORECASE)
    if not m:
        return None
    first = m.group(1).strip()
    cont = []
    for raw in section[m.end():].split("\n")[1:]:
        if not raw.strip():
            break
        if re.match(r"\s*\*\*[A-Z][A-Za-z ]*:?(\*\*)?:?\s", raw):
            break
        if re.match(r"\s*#{1,4}\s", raw):
            break
        if re.match(r"\s*\|", raw):
            break
        cont.append(raw.strip())
    val = " ".join([first] + cont).strip()
    return val or None


def scope_prose_digest(text, phase):
    head = r"^#{2,4}\s*(?:\[[^\]]+\]\s*)?Phase\s+"
    blocks = re.findall(r"(?m)" + head + re.escape(phase) + r"(?![0-9.])[\s\S]*?"
                        r"(?=" + head + r"|\Z)", text, re.IGNORECASE)
    if not blocks:
        return None, "block"
    if len(blocks) > 1:
        return None, "ambiguous"
    section = blocks[0]
    goal = extract_scope_field(section, "Goal")
    if goal is None:
        return None, "Goal"
    reqs = extract_scope_field(section, "Requirements")
    if reqs is None:
        return None, "Requirements"
    norm = lambda t: " ".join(t.split())
    blob = f"{norm(goal)}\n{norm(reqs)}".encode("utf-8")
    return hashlib.sha256(blob).hexdigest(), None


def run_scope(args, data):
    lock = data.get("scope_lock")
    if lock is None:
        return ["scope check skipped (no locked scope; S8-lean: gates on checkable items only)"], True
    if not isinstance(lock, dict) or not isinstance(lock.get("phase"), str) \
            or not all(isinstance(lock.get(k), str) and lock.get(k, "").strip()
                       for k in ("source", "sha256")):
        return ["LEDGER: scope_lock must be an object or null"], False
    phase, source = lock["phase"], lock["source"]
    target = Path(args.root) / source
    if phase and source == "ROADMAP.md" and not target.exists():
        target = Path(args.root) / ".planning" / "ROADMAP.md"  # GSD layout
    try:
        blob = target.read_bytes()
    except OSError:
        return [f"scope file missing: {source} (locked phase {phase})"], False
    if not phase:
        if hashlib.sha256(blob).hexdigest() != lock["sha256"]:
            return [f"scope changed since lock: {source} (locked phase {phase})"], False
        return [f"scope check passed (phase {phase})"], True
    try:
        text = blob.decode("utf-8")
    except UnicodeDecodeError:
        return [f"scope file missing: {source} (locked phase {phase})"], False
    digest, missing = scope_prose_digest(text, phase)
    if missing == "block":
        return [f"scope phase missing: phase {phase} in {source} (locked phase {phase})"], False
    if missing == "ambiguous":
        return [f"phase block ambiguous: phase {phase} in {source}"], False
    if missing in ("Goal", "Requirements"):
        return [f"scope field missing: {missing} (locked phase {phase})"], False
    if digest != lock["sha256"]:
        return [f"scope changed since lock: {source} (locked phase {phase})"], False
    return [f"scope check passed (phase {phase})"], True


def self_test():
    """Plant ledgers in a temp dir; each case must give its stated verdict."""
    import contextlib
    import io
    import tempfile
    rows = [
        {"id": "AA-1", "status": "deferred-approved", "phase": "26"},
        {"id": "BB-1", "status": "deferred-approved", "phase": "40", "stream": "ws"},
    ]
    cases = [  # (label, extra argv, plan text, expected exit, required output fragment)
        ("default stream counts a stream-less row", [], "cites nothing", 1, "AA-1: due"),
        ("default stream ignores another stream's row", [], "cites AA-1", 0, "plan gate passed"),
        ("named stream ignores default rows", ["--stream", "ws"], "cites BB-1", 0, "stream ws"),
        ("named stream counts its own row", ["--stream", "ws"], "cites AA-1", 1, "BB-1: due"),
    ]
    failures = []
    for label, extra, plan, want_rc, want_out in cases:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "ledger").mkdir()
            (root / "ledger" / "REQUIREMENTS.json").write_text(
                json.dumps({"items": rows}), encoding="utf-8")
            (root / "plans").mkdir()
            (root / "plans" / "01-PLAN.md").write_text(plan, encoding="utf-8")
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rc = main(["--root", tmp, "--phase", "40",
                           "--plans", str(root / "plans")] + extra)
            if rc != want_rc or want_out not in buf.getvalue():
                failures.append(f"{label}: rc={rc} output={buf.getvalue().strip()!r}")
    for line in failures:
        print(f"plan-gate self-test FAIL -- {line}")
    if failures:
        return 1
    print(f"plan-gate self-test PASS -- {len(cases)} planted cases")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
