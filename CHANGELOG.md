# Changelog

All notable changes to this project will be documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project has not published a stable
release yet.

## [Unreleased]

## [0.1.0] - 2026-08-31

### Added

- Canonical runtime schemas for broker activities, executions, instruments, fees, diagnostics, and
  logical Trades using Zod and Decimal arithmetic.
- Robinhood equity account-activity CSV normalization for the observed supported profile.
- Fixed-profile IBKR equity Trade Confirmation normalization into canonical Executions and linked
  BrokerActivities.
- Deterministic long-equity FIFO reconstruction with lots, matches, lifecycle state, and realized
  P&L.
- Canonical option identity and OCC/OSI symbol parsing.
- Deterministic long and short single-contract option reconstruction.
- Ambiguity-safe bull and bear call/put vertical spread reconstruction.
- Canonical logical Trade production with ownership conservation and structured diagnostics.
- Local `normalize`, `inspect`, and `validate` CLI workflows with deterministic JSON output.
- Cross-broker regression tests proving equivalent Robinhood and IBKR equity activity converges on
  equivalent canonical economics.

### Changed

- Advanced the CLI normalization envelope to schema version 2 by adding retained execution counts.
- Preserved timezone-less IBKR execution times as local datetime evidence rather than fabricating
  UTC instants.

### Security

- Broker processing remains local-only with no telemetry, credential handling, database, or
  external service dependency.
