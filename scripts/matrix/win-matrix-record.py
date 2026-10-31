#!/usr/bin/env python3
"""scripts/matrix/win-matrix-record.py (Phase 54, MTX-01) -- the one writer of the matrix record.

Builds scripts/matrix/win-matrix-record.json's content from a directory holding, per cell, the guest
process exit code (<cell>.code) and its captured stdout (<cell>.out). Every cell name, key and marker
comes from win-matrix-schema.json; verify-win-matrix-record.mjs reads the same file, so the writer and
the verifier cannot drift apart. Evidence is passed by FILE, never by argv, and capped with a marker.

usage: win-matrix-record.py --schema SCHEMA.json --dir CELLDIR --out RECORD.json
"""
import argparse
import json
import re
import sys
from pathlib import Path


def read_cell(cell_dir: Path, cell: str):
    code_file, out_file = cell_dir / f"{cell}.code", cell_dir / f"{cell}.out"
    if not code_file.is_file():
        return None, "cell did not run: no exit code was captured"
    code = code_file.read_text().strip()
    text = out_file.read_text(encoding="utf-8", errors="replace") if out_file.is_file() else ""
    return code, text


def marker_lines(text: str, prefix: str):
    return [line[len(prefix):].strip() for line in text.splitlines() if line.startswith(prefix)]


def build(schema: dict, cell_dir: Path) -> dict:
    cap, trunc = schema["evidenceCapChars"], schema["truncationMarker"]
    markers = schema["markers"]
    cells, texts = {}, {}
    for cell in schema["cells"]:
        code, text = read_cell(cell_dir, cell)
        texts[cell] = text if code is not None else ""
        evidence = text if len(text) <= cap else text[:cap] + "\n" + trunc
        cells[cell] = {"verdict": "PASS" if code == "0" else "FAIL", "evidence": evidence, "transport": "guest-agent"}

    def lines(name):
        m = markers[name]
        return marker_lines(texts.get(m["cell"], ""), m["prefix"])

    for cell, keys in schema["extraCellKeys"].items():
        for key in keys:
            cells[cell][key] = ""
    cells["launch"]["smartscreen"] = "\n".join(lines("smartscreen"))
    cells["update"]["version_before"] = (lines("versionBefore") or [""])[0]
    cells["update"]["version_after"] = (lines("versionAfter") or [""])[0]
    cells["no-residue"]["registry_diff"] = "\n".join(lines("regDiff"))
    cells["no-residue"]["registry_residue"] = "\n".join(lines("regResidue"))

    ini = "\n".join(lines("ini"))
    target = re.search(r"^BUILD_TARGET=(\S+)$", ini, re.M)
    service = (lines("maintenanceService") or [""])[0]
    return {
        "build_target": target.group(1) if target else "",
        "application_ini": ini,
        # Observed in the guest, never defaulted: an absent or unknown marker stays null and the verifier refuses it.
        "maintenance_service_enabled": {"enabled": True, "disabled": False}.get(service),
        "cells": cells,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", required=True)
    ap.add_argument("--dir", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    schema = json.loads(Path(a.schema).read_text())
    record = build(schema, Path(a.dir))
    missing = set(schema["recordKeys"]) ^ set(record)
    if missing:
        print(f"win-matrix-record: FAIL -- record keys differ from the schema by {sorted(missing)}", file=sys.stderr)
        return 1
    Path(a.out).write_text(json.dumps(record, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
