# Universal Trade Normalizer

Universal Trade Normalizer is an open-source TypeScript library and CLI for converting
broker-specific trade exports into a deterministic canonical format.

The repository foundation, canonical schemas, a narrowly scoped Robinhood equities activity
adapter, deterministic long-equity FIFO reconstruction, and deterministic single-contract option
FIFO reconstruction are complete. Execution promotion, multi-leg option grouping, and strategy
detection have not yet been implemented. No broker option export format is implemented yet.

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
    ibkr/                 Interactive Brokers adapter boundary
    robinhood/            Robinhood adapter boundary
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
pnpm check
```

## Root Commands

| Command             | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `pnpm build`        | Build all TypeScript projects using project references    |
| `pnpm clean`        | Remove TypeScript project build outputs                   |
| `pnpm typecheck`    | Type-check the complete workspace without emitting files  |
| `pnpm test`         | Run the Vitest suite once                                 |
| `pnpm test:watch`   | Run Vitest in watch mode                                  |
| `pnpm lint`         | Run ESLint with zero warnings allowed                     |
| `pnpm format`       | Format supported files with Prettier                      |
| `pnpm format:check` | Verify formatting without changing files                  |
| `pnpm check`        | Run formatting, linting, type-checking, tests, and builds |

## Current Scope

Repository tooling, package boundaries, canonical instruments, broker activities, executions,
trades, fees, and diagnostics are defined and runtime-validated. The Robinhood adapter parses the
observed synthetic equities activity format into `BrokerActivity`. The public core API
`reconstructEquityPositions` reconstructs long-equity FIFO lots, matches, position lifecycles,
known fees, and realized P&L without promoting date-only activity to `Execution`.

The core package can also parse standard compact or root-padded OCC/OSI equity option symbols into
canonical option instruments and create deterministic contract keys from their complete identity.
These utilities are broker-independent and are not evidence that any adapter supports option CSV
rows.

`reconstructOptionPositions` reconstructs independent canonical option contracts as flat, long, or
short FIFO positions. It calculates multiplier-aware premiums and P&L, allocates known monetary
fees, rejects zero-crossing reversals atomically, and emits contract-direction lifecycles. It does
not group contracts into spreads or other strategies.

IBKR, Webull, execution promotion, multi-leg option grouping, strategy detection, broker-specific
option parsing, exercise/assignment/expiration, and useful CLI commands remain future work.
