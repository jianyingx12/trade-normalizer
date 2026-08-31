# Universal Trade Normalizer

Universal Trade Normalizer is an open-source TypeScript library and CLI for converting
broker-specific trade exports into a deterministic canonical format.

The repository includes canonical schemas, a Robinhood equities activity adapter, a fixed-profile
IBKR equity execution adapter, deterministic long-equity and single-contract option FIFO
reconstruction, and canonical logical Trade production. The core also reconstructs ambiguity-safe
two-leg vertical spreads from canonical option results. No broker option export format is
implemented yet.

## Goals

- Keep broker-specific behavior isolated in adapter packages.
- Provide a broker-independent core library.
- Reconstruct trades deterministically and explain ambiguous results.
- Use precise decimal arithmetic for financial values.
- Support library and CLI consumers without requiring market data or external services.

## Workspace

```text
apps/                     Future demonstration applications
fixtures/                 Broker and canonical test fixtures
packages/
  adapters/
    ibkr/                 Fixed-profile IBKR equity execution adapter
    robinhood/            Robinhood equity activity adapter
    webull/               Webull adapter boundary
  cli/                    Command-line interface
  core/                   Broker-independent engine boundary
  schemas/                Canonical schemas and shared types
```

## Requirements

- Node.js 22 or newer
- pnpm 11

## Getting Started

```bash
pnpm install
pnpm build
pnpm check
```

## Root Commands

| Command             | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `pnpm build`        | Build all TypeScript projects using project references    |
| `pnpm cli`          | Run the compiled CLI after `pnpm build`                   |
| `pnpm clean`        | Remove TypeScript project build outputs                   |
| `pnpm typecheck`    | Type-check the complete workspace without emitting files  |
| `pnpm test`         | Run the Vitest suite once                                 |
| `pnpm test:watch`   | Run Vitest in watch mode                                  |
| `pnpm lint`         | Run ESLint with zero warnings allowed                     |
| `pnpm format`       | Format supported files with Prettier                      |
| `pnpm format:check` | Verify formatting without changing files                  |
| `pnpm check`        | Run formatting, linting, type-checking, tests, and builds |

## CLI Usage

Build the workspace before using the development CLI:

```bash
pnpm build
pnpm cli normalize trades.csv --broker robinhood
pnpm cli inspect trades.csv --broker robinhood
pnpm cli validate trades.csv --broker robinhood
pnpm cli normalize trades.csv --broker ibkr
pnpm cli inspect trades.csv --broker ibkr
pnpm cli validate trades.csv --broker ibkr
```

The installed-package command has the same interface:

```bash
trade-normalizer normalize trades.csv --broker robinhood
trade-normalizer normalize trades.csv --broker robinhood --output normalized.json
trade-normalizer inspect trades.csv --broker robinhood
trade-normalizer inspect trades.csv --broker robinhood --json
trade-normalizer validate trades.csv --broker robinhood
trade-normalizer normalize trades.csv --broker ibkr
trade-normalizer inspect trades.csv --broker ibkr
trade-normalizer validate trades.csv --broker ibkr
```

`normalize` writes a deterministic JSON envelope to stdout unless `--output` is provided. The
current envelope has `schemaVersion: "2"`, source and summary information (including retained
execution count), canonical logical Trades, and diagnostics. Decimal quantities and financial
values are JSON strings. Date-only input stays date-only. IBKR local datetimes remain local in
programmatic execution evidence and are conservatively represented as date precision in Trades;
the system never fabricates a UTC offset. Missing realized fees and net P&L remain absent when they
cannot be known truthfully.

`inspect` reports adaptation facts without reconstructing positions or Trades. `validate` checks
UTF-8 file readability, broker compatibility, CSV structure, and canonical activity normalization.
Warnings are considered usable validation results; error diagnostics fail validation.

Exit codes are stable:

| Code | Meaning                                                          |
| ---- | ---------------------------------------------------------------- |
| `0`  | Command completed, including usable results containing warnings  |
| `1`  | File, broker, parsing, normalization, validation, or write error |
| `2`  | Invalid command-line usage                                       |

Successful normalization emits no logs or ANSI formatting into stdout JSON. Fatal operational
errors go to stderr and do not emit partial JSON. Output files are completely serialized before an
atomic replacement, and the CLI refuses to overwrite its own input CSV.

The CLI runs locally. It does not upload broker data, send telemetry, call external APIs, request
market data, or use OpenAI services.

## Supported Broker Profiles

Broker selection is explicit; automatic detection is not enabled.

- **Robinhood:** the observed Robinhood-style equities account-activity CSV profile. It provides
  date-level account activity rather than confirmed fills, so the adapter emits `BrokerActivity`
  and zero canonical executions.
- **IBKR:** **UTN IBKR Trade Confirmation Execution CSV v1**. This requires the exact fixed
  24-column profile implemented by the adapter; arbitrary Flex Query CSVs are not supported. Each
  valid equity row emits one canonical `Execution` and one linked `BrokerActivity`.

Both profiles feed the same equity FIFO reconstruction and canonical logical Trade layer. This is
economic convergence, not source-evidence equivalence: broker IDs, account IDs, execution IDs,
order IDs, timing precision, and canonical Trade IDs remain source-specific.

Robinhood options, IBKR options, Webull, and unobserved variations of either supported CSV profile
are not implemented. The core can produce `equity_long`, long/short call and put, and four
vertical-spread Trade types when canonical activities are supplied, but current broker adapters
produce equities only.

## Current Scope

Repository tooling, package boundaries, canonical instruments, broker activities, executions,
trades, fees, and diagnostics are defined and runtime-validated. The Robinhood adapter parses the
observed equities activity format into `BrokerActivity`. The IBKR adapter parses its fixed Trade
Confirmation profile into canonical executions and linked activities while retaining account,
execution, order, venue, currency, reported commission, and local-time evidence. Reported
commission is not treated as a complete canonical fee breakdown. The public core API
`reconstructEquityPositions` reconstructs long-equity FIFO lots, matches, position lifecycles,
known fees, and realized P&L from canonical activities.

The core package can also parse standard compact or root-padded OCC/OSI equity option symbols into
canonical option instruments and create deterministic contract keys from their complete identity.
These utilities are broker-independent and are not evidence that any adapter supports option CSV
rows.

`reconstructOptionPositions` reconstructs independent canonical option contracts as flat, long, or
short FIFO positions. It calculates multiplier-aware premiums and P&L, allocates known monetary
fees, rejects zero-crossing reversals atomically, and emits contract-direction lifecycles.

`reconstructVerticalSpreads` consumes that contract reconstruction and infers only bull/bear call
and put verticals with confirmed datetime correlation. It allocates quantities conservatively,
preserves partial or ambiguous ownership as ungrouped, and aggregates spread cash flow and realized
P&L from the existing contract matches. Structural inference does not claim broker-confirmed order
intent.

`buildCanonicalTrades` consumes all three reconstruction results and produces deterministic,
runtime-validated logical Trades. It verifies global option ownership before promotion, preserves
upstream diagnostics, and returns structured `unpromoted` records when inconsistent ownership or
an isolated promotion failure makes a Trade unsafe to produce.

Webull, arbitrary IBKR Flex profiles, direct reconstruction from executions, strategies beyond
vertical spreads, broker-specific option parsing, and exercise/assignment/expiration remain future
work.
