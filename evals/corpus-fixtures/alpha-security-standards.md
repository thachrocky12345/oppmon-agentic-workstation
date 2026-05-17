# Alpha Co. Security Standards

The Security Standards document defines baseline security requirements
for all Alpha Co. systems and personnel. It is reviewed annually by the
Chief Information Security Officer.

## Disk Encryption

All company laptops must use full-disk encryption (FileVault on macOS,
BitLocker on Windows, LUKS on Linux). Encryption keys are escrowed in
the IT key-management service.

## Password Standards

User passwords must be at least 16 characters long and contain a mix of
character classes. Passwords are rotated annually. Password reuse
across systems is forbidden.

## Phishing Simulations

The security team runs phishing simulations on a monthly basis. Employees
who fail a simulation are enrolled in remedial training. Repeat failures
are escalated to the employee's manager.

## PII Handling

Storage or transmission of customer personally identifiable information
requires written approval at the VP level. PII data flows must be
documented in the data-flow registry before they go live.

## Production Access

All production access requires multi-factor authentication. Hardware
security keys (YubiKey) are mandatory for engineers with shell access
to production hosts.
