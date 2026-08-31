# Security Policy

## Reporting a vulnerability

Please report security issues privately. Use GitHub private vulnerability reporting from the
repository's **Security** tab if it is available. If no private channel is available, open a minimal
issue requesting a private contact method without including exploit details, broker data, account
information, or credentials.

Do not include private brokerage exports in a report.

## Data and privacy expectations

Broker files may contain sensitive financial activity, account identifiers, and personally
identifying information. Sanitize all reproductions and use synthetic identifiers and values.

Universal Trade Normalizer currently:

- processes files locally;
- sends no telemetry;
- calls no market-data or external normalization services;
- stores no credentials; and
- provides no hosted service or authentication layer.

These properties reduce exposure but do not make raw brokerage files safe to publish. Users remain
responsible for protecting input files, normalized output, shell history, logs, and generated test
fixtures.
