#!/usr/bin/env python3
"""
tools/auth_audit.py

Lightweight repository auth/security audit helpers.

This script performs quick checks for common authentication-related issues:
- scans files for likely hardcoded secrets (password, secret, API key tokens)
- looks for .env or config files with suspicious entries
- reports files that import or reference insecure libs (placeholder)

It's intended as a starting point — adapt checks for your project's languages and needs.
"""

from __future__ import annotations
import argparse
import os
import re
from pathlib import Path
from typing import List, Tuple

# Patterns that often indicate hardcoded secrets or tokens
SECRET_PATTERNS: List[re.Pattern] = [
    re.compile(r"(?i)(?:api[_-]?key|apikey|secret|auth[_-]?token|access[_-]?token|client[_-]?secret|aws[_-]?access[_-]?key)") ,
    re.compile(r"(?i)password\s*=\s*['\"].{3,}['\"]"),
    re.compile(r"(?i)SECRET\s*=\s*['\"].{3,}['\"]"),
]

# File extensions to scan (add .ts, .tsx, .js, .py, .env, .yaml etc.)
SCAN_EXTENSIONS = {'.py', '.ts', '.tsx', '.js', '.jsx', '.env', '.json', '.yaml', '.yml', '.ini', '.cfg'}


def find_files(root: Path) -> List[Path]:
    files: List[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Skip virtualenvs, node_modules, .git, build directories
        skip = {'.git', 'node_modules', 'venv', '.venv', '__pycache__', 'dist', 'build'}
        parts = set(Path(dirpath).parts)
        if parts & skip:
            continue
        for fn in filenames:
            p = Path(dirpath) / fn
            if p.suffix.lower() in SCAN_EXTENSIONS or fn.lower() in {'.env', 'dockerfile'}:
                files.append(p)
    return files


def scan_file_for_secrets(path: Path) -> List[Tuple[int, str]]:
    """Return list of (lineno, matched_text) for suspicious lines."""
    results: List[Tuple[int, str]] = []
    try:
        text = path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        return results
    for i, line in enumerate(text.splitlines(), start=1):
        for pat in SECRET_PATTERNS:
            if pat.search(line):
                results.append((i, line.strip()))
                break
    return results


def simple_report(root: Path) -> str:
    files = find_files(root)
    findings = []
    for f in files:
        hits = scan_file_for_secrets(f)
        if hits:
            findings.append((f, hits))
    if not findings:
        return "No obvious hardcoded secrets found by lightweight scan.\n"

    lines: List[str] = ["Potential hardcoded secrets found:", ""]
    for f, hits in findings:
        lines.append(f"- {f}:")
        for lineno, snippet in hits:
            lines.append(f"    {lineno}: {snippet}")
        lines.append("")
    return "\n".join(lines)


def main(argv: List[str] | None = None) -> int:
    p = argparse.ArgumentParser(description='Run a lightweight auth audit on the repository')
    p.add_argument('path', nargs='?', default='.', help='Path to repository root (default: current dir)')
    p.add_argument('--limit', type=int, default=2000, help='Maximum number of files to scan')
    args = p.parse_args(argv)

    root = Path(args.path).resolve()
    print(f"Scanning repository: {root}")
    files = find_files(root)
    if len(files) > args.limit:
        print(f"Found {len(files)} candidate files, limiting to first {args.limit} to avoid long runs.")
        files = files[: args.limit]

    report = simple_report(root)
    print(report)
    print("Notes: This is a simple heuristic scanner. Review flagged lines manually and extend checks as needed.")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
