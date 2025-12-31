#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROOT

python3 <<'PY'
import os
import re
from pathlib import Path

ROOT = Path(os.environ.get("ROOT", Path.cwd()))
INCLUDE_DIRS = ["execution", "node", "simulator", "client", "types"]
EXCLUDE_PATTERNS = [
    "**/*_test.rs",
    "**/tests/**",
    "**/tests.rs",
    "**/test/**",
    "**/benches/**",
    "**/examples/**",
    "**/mocks/**",
    "**/fixtures/**",
]
PATTERN = re.compile(r"(panic!\(|\.unwrap\(|\.expect\()")

def is_excluded(path: Path) -> bool:
    path_str = str(path)
    return any(Path(path_str).match(pattern) for pattern in EXCLUDE_PATTERNS)

def should_skip_line(line: str, state: dict) -> bool:
    if state["skip_depth"] > 0:
        state["skip_depth"] += line.count("{") - line.count("}")
        if state["skip_depth"] <= 0:
            state["skip_depth"] = 0
        return True

    if state["pending_cfg"]:
        if "{" in line:
            state["skip_depth"] = line.count("{") - line.count("}")
            state["pending_cfg"] = False
            return True
        if line.strip().startswith("mod ") and "{" in line:
            state["skip_depth"] = line.count("{") - line.count("}")
            state["pending_cfg"] = False
            return True
        if line.strip().endswith(";"):
            state["pending_cfg"] = False
        return True

    stripped = line.strip()
    if stripped.startswith("#[cfg(") and "test" in stripped:
        state["pending_cfg"] = True
        return True

    return False

def scan_file(path: Path) -> list[tuple[int, str]]:
    matches = []
    state = {"pending_cfg": False, "skip_depth": 0}
    try:
        content = path.read_text(encoding="utf-8").splitlines()
    except Exception:
        return matches

    for line in content:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#![cfg(") and ("test" in stripped or "feature = \"mocks\"" in stripped):
            return matches
        break

    for idx, line in enumerate(content, start=1):
        if should_skip_line(line, state):
            continue
        if PATTERN.search(line):
            matches.append((idx, line.strip()))
    return matches

violations = []
for directory in INCLUDE_DIRS:
    root = ROOT / directory
    if not root.exists():
        continue
    for path in root.rglob("*.rs"):
        if is_excluded(path):
            continue
        for line_no, line in scan_file(path):
            violations.append((path, line_no, line))

if violations:
    print("ERROR: panic!/unwrap/expect found in production Rust code.")
    for path, line_no, line in violations:
        print(f"{path}:{line_no}: {line}")
    raise SystemExit(1)

print("✓ No panic!/unwrap/expect in production Rust code")
PY
