"""Repository consistency checks run by CI.

    cd backend && python -m scripts.check_repo

Fails (exit 1) when:
  - a module in ingestion/jobs/ is not imported by ingestion/registry.py;
  - a registered job has no home: not in SCHEDULES, MONITORED_EXTERNAL or WORKSTATION;
  - schedule.py names a job that is not registered;
  - docs/ingestion.md does not mention a registered job;
  - a source file contains control characters (scripted edits once wrote \\b as a
    backspace into regexes).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
ROOT = BACKEND.parent
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
SCAN = [
    ("backend", "*.py"),
    ("backend", "*.sql"),
    ("frontend/src", "*.ts"),
    ("frontend/src", "*.tsx"),
    ("frontend/scripts", "*.mjs"),
    ("frontend/content", "*.md"),
    ("docs", "*.md"),
    ("ops", "*.yml"),
    ("ops", "*.sh"),
    (".github", "*.yml"),
]


def main() -> int:
    sys.path.insert(0, str(BACKEND))
    from ingestion import schedule
    from ingestion.registry import JOBS

    errors: list[str] = []
    jobs = set(JOBS)

    registry_src = (BACKEND / "ingestion" / "registry.py").read_text(encoding="utf-8")
    for f in sorted((BACKEND / "ingestion" / "jobs").glob("*.py")):
        if f.stem != "__init__" and f"ingestion.jobs.{f.stem} import" not in registry_src:
            errors.append(f"ingestion/jobs/{f.name} is not imported by ingestion/registry.py")

    scheduled = {s.job for s in schedule.SCHEDULES}
    external = {s.job for s in schedule.MONITORED_EXTERNAL}
    for j in sorted(jobs - scheduled - external - set(schedule.WORKSTATION)):
        errors.append(f"job {j!r} has no home: add it to SCHEDULES, MONITORED_EXTERNAL or WORKSTATION")
    for j in sorted((scheduled | external | set(schedule.WORKSTATION)) - jobs):
        errors.append(f"schedule.py names {j!r}, which is not registered")
    both = scheduled & external
    if both:
        errors.append(f"jobs both VPS-scheduled and external: {sorted(both)}")

    catalogue = (ROOT / "docs" / "ingestion.md").read_text(encoding="utf-8")
    for j in sorted(jobs):
        if f"`{j}`" not in catalogue:
            errors.append(f"docs/ingestion.md does not mention job `{j}`")

    for base, pattern in SCAN:
        for f in sorted((ROOT / base).rglob(pattern)):
            if "node_modules" in f.parts or ".output" in f.parts:
                continue
            text = f.read_text(encoding="utf-8", errors="replace")
            m = CONTROL.search(text)
            if m:
                line = text.count("\n", 0, m.start()) + 1
                errors.append(f"{f.relative_to(ROOT)}:{line}: control character {m.group()!r}")

    for e in errors:
        print(f"::error::{e}")
    print(
        f"check_repo: {len(jobs)} jobs, {len(scheduled)} scheduled, "
        f"{len(external)} external, {len(schedule.WORKSTATION)} workstation — "
        f"{len(errors)} problem(s)"
    )
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
