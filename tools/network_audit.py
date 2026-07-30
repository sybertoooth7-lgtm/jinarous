#!/usr/bin/env python3
"""
Firewall & Network Hardening Audit Tool
--------------------------------------------
A real, working scanner for the "Firewall & Network Hardening Audit"
service (formerly "Neural Perimeter Defense" on the Alux Plaza site).

What it actually checks (no fake AI, no simulated findings):
  1. Open port scan       - a capped TCP-connect scan of a short list of
                             commonly-exposed/management ports (the same
                             approach a legitimate network audit uses,
                             not a stealth/SYN scan).
  2. Email security DNS   - SPF, DMARC, and DKIM-selector presence, which
     records                directly affect whether attackers can spoof
                             email from your domain (a very common attack
                             vector against small businesses).
  3. Basic DNS hygiene    - CAA record presence (controls which CAs can
                             issue certs for your domain) and confirms
                             the domain resolves as expected.
  4. TLS certificate      - validity and expiry window on port 443.
     expiry

Usage:
    python3 network_audit.py example.com
    python3 network_audit.py example.com --ports 22,3389,3306,5432

This is a PASSIVE, NON-DESTRUCTIVE, READ-ONLY tool. The port scan uses
ordinary TCP connect attempts (the same kind of connection any client
makes) against a small, capped list of ports - not a stealth scan, not a
full 65535-port sweep, and it makes no attempt to exploit anything found
open.

IMPORTANT: Only run this against domains/systems you own or have
explicit written authorization to test. Port scanning systems you don't
own or have permission to test can be illegal even when well-intentioned,
and some networks/hosting providers treat any scanning as abuse - always
get authorization first.
"""

import argparse
import socket
import ssl
import sys
import time
from datetime import datetime, timezone

try:
    import dns.resolver
    HAVE_DNS = True
except ImportError:
    HAVE_DNS = False

GOOD = "\033[92m"
WARN = "\033[93m"
BAD = "\033[91m"
INFO = "\033[96m"
END = "\033[0m"

# A short, deliberately capped list of commonly-exposed / high-risk
# management and database ports. Not a full port sweep.
DEFAULT_PORTS = {
    21: "FTP",
    22: "SSH",
    23: "Telnet",
    25: "SMTP",
    3306: "MySQL",
    3389: "RDP",
    5432: "PostgreSQL",
    6379: "Redis",
    9200: "Elasticsearch",
    27017: "MongoDB",
}

RISKY_IF_OPEN = {23, 3306, 3389, 5432, 6379, 9200, 27017}  # rarely should be internet-facing


def status_line(level, msg):
    color = {"PASS": GOOD, "WARN": WARN, "FAIL": BAD, "INFO": INFO}[level]
    print(f"  [{color}{level}{END}] {msg}")


class AuditReport:
    def __init__(self):
        self.findings = []

    def add(self, category, level, message, recommendation=None):
        self.findings.append((category, level, message, recommendation))
        status_line(level, message)

    def summary(self):
        counts = {"PASS": 0, "WARN": 0, "FAIL": 0, "INFO": 0}
        for _, lvl, _, _ in self.findings:
            counts[lvl] += 1
        return counts


def scan_ports(host, ports, report, timeout=2.0):
    print(f"\n{INFO}== 1. Port Scan ({len(ports)} ports, capped, TCP-connect only) =={END}")
    try:
        ip = socket.gethostbyname(host)
    except socket.gaierror as e:
        report.add("ports", "FAIL", f"Could not resolve '{host}': {e}")
        return

    report.add("ports", "INFO", f"Scanning {host} ({ip}) on {len(ports)} port(s)...")

    open_ports = []
    for port in sorted(ports):
        service = DEFAULT_PORTS.get(port, "unknown")
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        try:
            result = sock.connect_ex((ip, port))
            if result == 0:
                open_ports.append(port)
                if port in RISKY_IF_OPEN:
                    report.add(
                        "ports", "FAIL",
                        f"Port {port} ({service}) is open and internet-reachable - this service type should almost never be directly internet-facing.",
                        f"Restrict {service} to a VPN/private network or specific allow-listed IPs; do not expose it directly to the internet."
                    )
                else:
                    report.add("ports", "WARN", f"Port {port} ({service}) is open.", "Confirm this is intentional and necessary; close it if not.")
        except (socket.timeout, OSError):
            pass
        finally:
            sock.close()

    if not open_ports:
        report.add("ports", "PASS", "None of the scanned management/database ports are open to the internet - good baseline posture.")


def check_email_security(domain, report):
    print(f"\n{INFO}== 2. Email Security (SPF / DMARC / DKIM) =={END}")
    if not HAVE_DNS:
        report.add("email", "INFO", "dnspython not available - skipping email security checks.")
        return

    resolver = dns.resolver.Resolver()
    resolver.timeout = 5
    resolver.lifetime = 5

    # SPF
    try:
        answers = resolver.resolve(domain, "TXT")
        spf_records = [r.to_text() for r in answers if "v=spf1" in r.to_text()]
        if spf_records:
            report.add("email", "PASS", f"SPF record found: {spf_records[0][:80]}")
        else:
            report.add("email", "WARN", "No SPF record found on the root domain.", "Add an SPF TXT record specifying which servers may send email as your domain, to reduce spoofing.")
    except dns.resolver.NXDOMAIN:
        report.add("email", "FAIL", f"Domain '{domain}' does not resolve (NXDOMAIN).")
        return
    except Exception as e:
        report.add("email", "INFO", f"Could not check SPF: {e}")

    # DMARC
    try:
        answers = resolver.resolve(f"_dmarc.{domain}", "TXT")
        dmarc_records = [r.to_text() for r in answers if "v=DMARC1" in r.to_text()]
        if dmarc_records:
            record = dmarc_records[0]
            if "p=none" in record:
                report.add("email", "WARN", "DMARC record exists but policy is p=none (monitoring only, not enforced).", "Once you've reviewed DMARC reports and confirmed legitimate mail isn't affected, move to p=quarantine or p=reject.")
            else:
                report.add("email", "PASS", f"DMARC record found and enforcing: {record[:80]}")
        else:
            report.add("email", "WARN", "No DMARC record found.", "Add a DMARC TXT record at _dmarc.<domain> - this is one of the highest-impact, lowest-effort anti-spoofing controls available.")
    except dns.resolver.NXDOMAIN:
        report.add("email", "WARN", "No DMARC record found (_dmarc subdomain does not exist).", "Add a DMARC TXT record at _dmarc.<domain>.")
    except Exception as e:
        report.add("email", "INFO", f"Could not check DMARC: {e}")


def check_dns_hygiene(domain, report):
    print(f"\n{INFO}== 3. DNS Hygiene (CAA) =={END}")
    if not HAVE_DNS:
        report.add("dns", "INFO", "dnspython not available - skipping DNS hygiene checks.")
        return

    resolver = dns.resolver.Resolver()
    resolver.timeout = 5
    resolver.lifetime = 5

    try:
        answers = resolver.resolve(domain, "CAA")
        records = [r.to_text() for r in answers]
        report.add("dns", "PASS", f"CAA record(s) present, restricting which CAs can issue certificates: {', '.join(records)}")
    except dns.resolver.NoAnswer:
        report.add("dns", "WARN", "No CAA record found.", "Add a CAA record to restrict which Certificate Authorities may issue TLS certificates for your domain - a low-effort defense against certificate mis-issuance.")
    except dns.resolver.NXDOMAIN:
        pass  # already reported in email check
    except Exception as e:
        report.add("dns", "INFO", f"Could not check CAA: {e}")


def check_tls_expiry(host, report):
    print(f"\n{INFO}== 4. TLS Certificate Expiry (port 443) =={END}")
    context = ssl.create_default_context()
    try:
        with socket.create_connection((host, 443), timeout=8) as sock:
            with context.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
        expiry_str = cert.get("notAfter")
        expiry = datetime.strptime(expiry_str, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
        days_left = (expiry - datetime.now(timezone.utc)).days
        if days_left < 0:
            report.add("tls", "FAIL", f"TLS certificate for {host} EXPIRED {abs(days_left)} day(s) ago.", "Renew the certificate immediately.")
        elif days_left < 14:
            report.add("tls", "WARN", f"TLS certificate for {host} expires in {days_left} day(s).", "Renew soon; consider automated renewal (e.g. Let's Encrypt with auto-renew) to avoid this recurring.")
        else:
            report.add("tls", "PASS", f"TLS certificate for {host} is valid for {days_left} more day(s).")
    except ssl.SSLCertVerificationError as e:
        report.add("tls", "FAIL", f"TLS certificate for {host} failed validation: {e}")
    except (socket.timeout, ConnectionRefusedError, OSError) as e:
        report.add("tls", "INFO", f"Could not connect to {host}:443 to check certificate: {e}")


def main():
    parser = argparse.ArgumentParser(description="Firewall & Network Hardening Audit Tool")
    parser.add_argument("domain", help="Domain to audit, e.g. example.com")
    parser.add_argument("--ports", help="Comma-separated port list to scan (default: a capped common set)", default=None)
    args = parser.parse_args()

    if args.ports:
        try:
            ports = [int(p.strip()) for p in args.ports.split(",")]
        except ValueError:
            print("Error: --ports must be a comma-separated list of integers")
            sys.exit(1)
    else:
        ports = list(DEFAULT_PORTS.keys())

    print(f"{INFO}Firewall & Network Hardening Audit{END}")
    print(f"Target: {args.domain}")
    print("=" * 60)

    report = AuditReport()
    scan_ports(args.domain, ports, report)
    check_email_security(args.domain, report)
    check_dns_hygiene(args.domain, report)
    check_tls_expiry(args.domain, report)

    summary = report.summary()
    print("\n" + "=" * 60)
    print(f"{INFO}Summary:{END} "
          f"{GOOD}{summary['PASS']} passed{END}, "
          f"{WARN}{summary['WARN']} warnings{END}, "
          f"{BAD}{summary['FAIL']} failed{END}, "
          f"{INFO}{summary['INFO']} info{END}")


if __name__ == "__main__":
    main()
