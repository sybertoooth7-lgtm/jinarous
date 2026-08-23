#!/usr/bin/env python3
"""
Safe authentication audit tool for Alux Plaza.
Checks a target URL for security best practices on authentication endpoints.
No subprocess spawning, no arbitrary code execution, strict timeouts and size limits.
"""
import sys
import json
import urllib.request
import urllib.error
import ssl
import argparse
from urllib.parse import urlparse

MAX_BODY_SIZE = 1024 * 1024  # 1 MB
REQUEST_TIMEOUT = 15  # seconds


def audit(target, login_path=None):
    results = {
        "target": target,
        "login_path": login_path,
        "checks": {},
        "summary": {
            "score": 0,
            "total_checks": 0,
            "passed": 0,
        },
    }

    # Parse and validate target
    try:
        parsed = urlparse(target)
        if parsed.scheme not in ("http", "https"):
            return {"error": "Only http:// and https:// schemes are supported."}
    except Exception as e:
        return {"error": f"Invalid URL: {e}"}

    # Build final URL if login_path provided
    audit_url = target
    if login_path:
        # Ensure login_path starts with /
        if not login_path.startswith("/"):
            login_path = "/" + login_path
        parsed = parsed._replace(path=login_path)
        audit_url = parsed.geturl()

    # --- Check 1: HTTPS enforcement ---
    https_enforced = parsed.scheme == "https"
    results["checks"]["https_enforced"] = {
        "passed": https_enforced,
        "description": "Site uses HTTPS",
    }
    results["summary"]["total_checks"] += 1
    if https_enforced:
        results["summary"]["passed"] += 1

    # --- Fetch the page ---
    try:
        ctx = ssl.create_default_context()
        req = urllib.request.Request(
            audit_url,
            headers={
                "User-Agent": "AluxPlaza-SecurityAudit/1.0",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT, context=ctx) as resp:
            headers = dict(resp.headers)
            # Read up to MAX_BODY_SIZE
            body = resp.read(MAX_BODY_SIZE).decode("utf-8", errors="replace")
            status_code = resp.status
    except urllib.error.HTTPError as e:
        # HTTP errors are still informative
        headers = dict(e.headers) if e.headers else {}
        body = e.read(MAX_BODY_SIZE).decode("utf-8", errors="replace") if e.fp else ""
        status_code = e.code
    except Exception as e:
        return {"error": f"Request failed: {e}"}

    results["checks"]["reachable"] = {
        "passed": status_code < 500,
        "description": "Target is reachable",
        "status_code": status_code,
    }
    results["summary"]["total_checks"] += 1
    if status_code < 500:
        results["summary"]["passed"] += 1

    # --- Check 2: Security headers ---
    headers_lower = {k.lower(): v for k, v in headers.items()}
    security_headers = {
        "strict-transport-security": "HSTS (HTTPS enforcement header)",
        "x-frame-options": "Clickjacking protection",
        "content-security-policy": "Content Security Policy",
        "x-content-type-options": "MIME sniffing protection",
        "referrer-policy": "Referrer policy",
    }

    for header, description in security_headers.items():
        present = header in headers_lower
        results["checks"][f"header_{header.replace('-', '_')}"] = {
            "passed": present,
            "description": description,
            "value": headers_lower.get(header),
        }
        results["summary"]["total_checks"] += 1
        if present:
            results["summary"]["passed"] += 1

    # --- Check 3: Login form detection ---
    body_lower = body.lower()
    has_password_field = 'type="password"' in body_lower or "type='password'" in body_lower
    results["checks"]["login_form_detected"] = {
        "passed": has_password_field,
        "description": "Password input field detected (indicates login form)",
    }
    results["summary"]["total_checks"] += 1
    if has_password_field:
        results["summary"]["passed"] += 1

    # --- Check 4: Password field autocomplete ---
    # Good practice: autocomplete="new-password" or autocomplete="off" on password fields
    autocomplete_good = (
        'autocomplete="new-password"' in body_lower
        or "autocomplete='new-password'" in body_lower
        or 'autocomplete="off"' in body_lower
        or "autocomplete='off'" in body_lower
    )
    results["checks"]["password_autocomplete_safe"] = {
        "passed": autocomplete_good,
        "description": "Password field has safe autocomplete attribute",
    }
    results["summary"]["total_checks"] += 1
    if autocomplete_good:
        results["summary"]["passed"] += 1

    # --- Calculate score ---
    score = 0
    if https_enforced:
        score += 25
    if status_code < 500:
        score += 10
    header_count = sum(
        1 for h in security_headers if h in headers_lower
    )
    score += header_count * 10
    if has_password_field:
        score += 15
    if autocomplete_good:
        score += 10

    results["summary"]["score"] = min(score, 100)
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Alux Plaza Security Audit Tool")
    parser.add_argument("target", help="Target URL (e.g., https://example.com)")
    parser.add_argument("--login-path", help="Optional login path (e.g., /login)")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    args = parser.parse_args()

    result = audit(args.target, args.login_path)
    print(json.dumps(result, indent=2))
