#!/usr/bin/env python3
"""
Post-Quantum Cryptography Readiness Assessment Tool
--------------------------------------------
A real, working scanner for the "Post-Quantum Cryptography Readiness
Assessment" service (formerly "Quantum Neural Cryptography" in the
Alux Plaza AI Lab).

Grounded in NIST's finalized post-quantum cryptography standards:
FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), and FIPS 205 (SLH-DSA), published
13 August 2024. NIST IR 8547 (draft transition guidance) targets
deprecating RSA-2048 and ECC P-256 by 2030 and removing quantum-
vulnerable algorithms from NIST standards entirely by 2035.

What it actually checks (no fake AI, no simulated findings):
  1. Certificate algorithm & key size  - identifies whether the server's
                                         TLS certificate uses RSA or ECC
                                         (both broken by Shor's algorithm
                                         on a sufficiently capable quantum
                                         computer) and flags undersized
                                         keys as a nearer-term concern
                                         regardless of the quantum question.
  2. TLS version                      - PQC hybrid key exchange requires
                                         TLS 1.3; older versions can't
                                         support it at all.
  3. Hybrid PQC key exchange support  - attempts to detect whether the
                                         server negotiates a post-quantum
                                         hybrid group (e.g. X25519MLKEM768);
                                         requires a PQC-capable OpenSSL
                                         (3.5+) on the machine running
                                         this tool - flags clearly when
                                         that capability isn't available
                                         rather than guessing.

This tool does NOT attempt to break, weaken, or exploit any cryptography.
Every check is a standard TLS handshake and public certificate inspection
- the same information any browser sees when connecting. Note: this tool
intentionally does NOT verify the certificate trust chain (it uses
CERT_NONE) because its purpose is inspecting the certificate's algorithm
and key size for a PQC-readiness report, even on weak or self-signed
certs - a strict default context would simply refuse to connect to a
weak cert at all, hiding the very issue being checked for. This is NOT
a substitute for the Access Control & Authentication Audit service's
TLS validity checks, which DO verify the trust chain.

Usage:
    python3 pqc_readiness.py example.com

IMPORTANT: Only run this against domains you own or have explicit
authorization to test (a plain TLS handshake and public cert read is
low-impact, but authorization is still good practice for any service
engagement).
"""

import argparse
import shutil
import socket
import ssl
import subprocess
import sys
from datetime import datetime, timezone

GOOD = "\033[92m"
WARN = "\033[93m"
BAD = "\033[91m"
INFO = "\033[96m"
END = "\033[0m"

# Known hybrid post-quantum key-exchange group names in current use
# (OpenSSL 3.5+/BoringSSL/browsers). Naming has varied during
# standardization; this covers the names in active production use.
KNOWN_HYBRID_PQC_GROUPS = [
    "X25519MLKEM768",
    "X25519Kyber768Draft00",
    "SecP256r1MLKEM768",
    "SecP384r1MLKEM1024",
]


def status_line(level, msg):
    color = {"PASS": GOOD, "WARN": WARN, "FAIL": BAD, "INFO": INFO}[level]
    print(f"  [{color}{level}{END}] {msg}")


class PQCReport:
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


def check_certificate(host, report):
    print(f"\n{INFO}== 1. Certificate Algorithm & Key Size =={END}")
    # Deliberately permissive context: this tool's job is to INSPECT the
    # certificate (including weak ones) for reporting purposes, not to
    # enforce trust. A strict default context would simply refuse to
    # complete the handshake with a weak/self-signed cert, which would
    # hide the very issue this check exists to find.
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    try:
        context.set_ciphers("DEFAULT:@SECLEVEL=0")
    except ssl.SSLError:
        pass

    try:
        with socket.create_connection((host, 443), timeout=8) as sock:
            with context.wrap_socket(sock, server_hostname=host) as ssock:
                der_cert = ssock.getpeercert(binary_form=True)
                cipher = ssock.cipher()
                tls_version = ssock.version()
    except Exception as e:
        report.add("cert", "FAIL", f"Could not connect to {host}:443 - {e}")
        return None

    # Parse algorithm info from the certificate using the standard library
    # only where possible; fall back to openssl CLI for detail not exposed
    # by the ssl module.
    algo_info = "unknown"
    key_bits = None
    openssl_path = shutil.which("openssl")
    if openssl_path:
        try:
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".der", delete=False) as f:
                f.write(der_cert)
                der_path = f.name
            result = subprocess.run(
                [openssl_path, "x509", "-inform", "der", "-in", der_path, "-noout", "-text"],
                capture_output=True, text=True, timeout=10
            )
            text = result.stdout
            if "id-ecPublicKey" in text or "ecPublicKey" in text:
                algo_info = "ECDSA"
                for line in text.splitlines():
                    if "NIST CURVE" in line or "ASN1 OID" in line:
                        algo_info = f"ECDSA ({line.strip()})"
                        break
            elif "rsaEncryption" in text:
                algo_info = "RSA"
                for line in text.splitlines():
                    if "Public-Key:" in line and "bit" in line:
                        try:
                            key_bits = int(line.split("(")[1].split(" bit")[0])
                        except (IndexError, ValueError):
                            pass
                        break
        except Exception:
            pass

    report.add("cert", "INFO", f"Connected via {tls_version}, cipher {cipher[0] if cipher else 'unknown'}.")

    if algo_info.startswith("RSA"):
        size_note = f" ({key_bits}-bit)" if key_bits else ""
        report.add(
            "cert", "WARN",
            f"Certificate uses RSA{size_note} - vulnerable to Shor's algorithm on a future cryptographically relevant quantum computer (CRQC). This is a real but longer-horizon risk (most estimates place CRQC arrival mid-2030s or later).",
            "Not urgent to rotate the cert alone, but plan RSA/ECC retirement per NIST's 2030 deprecation guidance (NIST IR 8547) as part of a broader PQC migration roadmap, not as an isolated fix."
        )
        if key_bits and key_bits < 2048:
            report.add(
                "cert", "FAIL",
                f"RSA key size is only {key_bits} bits - this is weak against classical (non-quantum) attacks TODAY, a more urgent issue than the quantum question.",
                "Rotate to at least RSA-2048, or move directly to ECDSA/modern algorithms."
            )
    elif algo_info.startswith("ECDSA"):
        report.add(
            "cert", "WARN",
            f"Certificate uses {algo_info} - also vulnerable to Shor's algorithm on a future CRQC, same category of longer-horizon risk as RSA.",
            "Plan for migration to ML-DSA (FIPS 204) as PQC-capable certificate issuance becomes broadly available; not urgent in isolation today."
        )
    else:
        report.add("cert", "INFO", "Could not determine certificate algorithm precisely (openssl CLI unavailable or output format unrecognized) - verify manually.")

    return tls_version


def check_tls_version(tls_version, report):
    print(f"\n{INFO}== 2. TLS Version (prerequisite for PQC hybrid key exchange) =={END}")
    if tls_version is None:
        report.add("tls_version", "INFO", "Could not determine TLS version (connection failed earlier).")
        return
    if tls_version == "TLSv1.3":
        report.add("tls_version", "PASS", "Server supports TLS 1.3 - a prerequisite for post-quantum hybrid key exchange.")
    else:
        report.add(
            "tls_version", "FAIL",
            f"Server negotiated {tls_version}, not TLS 1.3 - post-quantum hybrid key exchange is not possible on this connection at all.",
            "Upgrade to TLS 1.3 support as a prerequisite before any PQC migration can happen."
        )


def check_hybrid_pqc_support(host, report):
    print(f"\n{INFO}== 3. Hybrid Post-Quantum Key Exchange Support =={END}")
    openssl_path = shutil.which("openssl")
    if not openssl_path:
        report.add("pqc_kex", "INFO", "openssl CLI not found on this machine - cannot test hybrid PQC group negotiation.")
        return

    version_result = subprocess.run([openssl_path, "version"], capture_output=True, text=True)
    version_str = version_result.stdout.strip()

    any_supported = False
    for group in KNOWN_HYBRID_PQC_GROUPS:
        try:
            result = subprocess.run(
                [openssl_path, "s_client", "-connect", f"{host}:443", "-groups", group, "-servername", host],
                input="", capture_output=True, text=True, timeout=10
            )
            output = result.stdout + result.stderr
            if "Verify return code" in output and ("New," in output or "Cipher is" in output) and "no peer certificate available" not in output.lower():
                any_supported = True
                report.add("pqc_kex", "PASS", f"Server accepted a handshake advertising hybrid PQC group '{group}'.")
        except subprocess.TimeoutExpired:
            continue
        except Exception:
            continue

    if not any_supported:
        report.add(
            "pqc_kex", "INFO",
            f"Could not confirm hybrid PQC key exchange support (using {version_str}, which may not support advertising PQC groups - this requires OpenSSL 3.5+, and the version here is older or the server simply doesn't support it).",
            "Re-test with an OpenSSL 3.5+ build, or check directly with your CDN/hosting provider (Cloudflare, AWS, and major browsers already support hybrid PQC key exchange - confirm whether it's enabled on your specific origin/edge configuration)."
        )


def main():
    parser = argparse.ArgumentParser(description="Post-Quantum Cryptography Readiness Assessment Tool")
    parser.add_argument("domain", help="Domain to assess, e.g. example.com")
    args = parser.parse_args()

    print(f"{INFO}Post-Quantum Cryptography Readiness Assessment{END}")
    print(f"Target: {args.domain}")
    print(f"Grounded in NIST FIPS 203/204/205 (finalized 13 Aug 2024) and NIST IR 8547 transition guidance")
    print("=" * 60)

    report = PQCReport()
    tls_version = check_certificate(args.domain, report)
    check_tls_version(tls_version, report)
    check_hybrid_pqc_support(args.domain, report)

    summary = report.summary()
    print("\n" + "=" * 60)
    print(f"{INFO}Summary:{END} "
          f"{GOOD}{summary['PASS']} passed{END}, "
          f"{WARN}{summary['WARN']} warnings{END}, "
          f"{BAD}{summary['FAIL']} failed{END}, "
          f"{INFO}{summary['INFO']} info{END}")
    print(f"\n{INFO}Context:{END} Most credible estimates place a cryptographically relevant quantum "
          f"computer (capable of breaking RSA-2048) in the mid-2030s or later. This is a real but "
          f"longer-horizon risk - the main near-term concern is 'harvest now, decrypt later': data "
          f"encrypted today with classical algorithms could be recorded now and decrypted once such "
          f"a computer exists, which matters most for data that needs confidentiality for 10+ years.")


if __name__ == "__main__":
    main()
