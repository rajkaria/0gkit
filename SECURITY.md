# Security Policy

## Supported versions

The latest published `@foundryprotocol/0gkit-*` minor line is supported.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Use GitHub's private vulnerability reporting:
<https://github.com/rajkaria/0gkit/security/advisories/new>

Please include a description, reproduction steps, affected package(s) and
version(s), and impact. We aim to acknowledge within 72 hours and to ship a
fix or mitigation as quickly as the severity warrants.

## Scope

In scope: the `@foundryprotocol/0gkit-*` library packages and the `0g` CLI.
The `apps/*` (playground, docs) are demos and not part of the security
contract, but reports are still welcome.

## Handling keys

The toolkit never logs or transmits private keys. Clients accept a key only
to sign locally. If you find a path where a secret could leak, treat it as a
high-severity report.
