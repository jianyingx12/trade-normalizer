# Universal Trade Normalizer 0.1.0

`0.1.0` is the first public release version. It communicates that the project has a usable, tested
workflow while its broker coverage and lifecycle support remain intentionally narrower than a
stable `1.0.0` contract.

## Highlights

- Normalize the supported Robinhood equity account-activity CSV profile into canonical
  `BrokerActivity` records.
- Normalize the fixed 24-column IBKR Trade Confirmation Execution CSV v1 profile into canonical
  `Execution` records and linked `BrokerActivity` records.
- Reconstruct long-equity positions with deterministic FIFO lot matching, fractional quantities,
  partial closes, repeated lifecycles, and realized P&L.
- Produce stable canonical logical `Trade` objects with Decimal-safe financial values and
  structured diagnostics.
- Reconstruct canonical long and short call/put activity supplied programmatically.
- Infer bull and bear call/put vertical spreads using conservative, quantity-based ownership.
- Normalize, inspect, and validate local files through the CLI or the programmatic API.
- Produce deterministic JSON suitable for regression testing and downstream tooling.

## Correctness and hardening

- Runtime validation uses Zod; precision-sensitive arithmetic uses `decimal.js`.
- Quantity, P&L, and option ownership conservation are covered by generated invariant tests.
- Cross-broker tests verify that economically equivalent Robinhood and IBKR histories converge on
  the same canonical economics.
- Duplicate IBKR execution IDs, malformed inputs, unsupported profiles, and ambiguous option
  pairings have explicit diagnostic behavior.
- Date-only evidence never receives a fabricated timestamp, and missing fees remain unknown rather
  than defaulting to zero.
- CI checks formatting, linting, types, tests, builds, and production dependency advisories.

## Try it

```bash
pnpm install
pnpm demo
```

The demo uses committed synthetic data and requires no account, credentials, or environment
variables.

## Current limitations

- Broker adapters import equities only; broker-specific option CSV parsing is not implemented.
- IBKR support is limited to the documented fixed profile, not arbitrary Flex Query exports.
- Exercise, assignment, expiration, currency conversion, tax reporting, market data, persistence,
  API server, and web UI behavior are outside this release.
- Supported option strategies are single calls/puts and vertical spreads; ambiguous groupings remain
  unclassified.
- Deduplication is scoped to the supplied source rather than persisted across separate runs.

## Suggested GitHub metadata

**Description:** Turns messy brokerage exports into consistent trade histories with support for
partial fills, FIFO positions, and options spreads.

**Topics:** `typescript`, `fintech`, `trading`, `options`, `brokerage`, `csv`, `financial-data`,
`open-source`

The repository name `trade-normalizer`, package scope `@trade-normalizer`, and product name
Universal Trade Normalizer describe the same project at different naming levels. No rename is
needed for the initial release.
