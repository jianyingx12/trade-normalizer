# Contributing

Thanks for helping improve Universal Trade Normalizer. Contributions should preserve its central
rule: canonical output must represent only facts supported by the broker source.

## Development setup

Requirements:

- Node.js 22 or newer
- pnpm 11

Install and verify the workspace:

```bash
pnpm install --frozen-lockfile
pnpm check
```

Useful individual commands are `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm test:coverage`, and `pnpm build`. Run `pnpm audit:prod` when reviewing dependency changes;
it queries the configured package registry and is intentionally separate from the offline-capable
quality gate.

## Repository layout

- `packages/schemas`: canonical Zod schemas and shared domain types
- `packages/core`: broker-independent reconstruction and Trade production
- `packages/adapters`: isolated broker parsing and normalization
- `packages/cli`: commands and high-level broker orchestration
- `fixtures`: synthetic public and test inputs
- `docs`: local design documentation when present

Keep related logic in focused files and folders. Broker packages may depend on canonical
boundaries, but schemas and core code must not depend on broker-specific formats.

## Adding or changing a broker adapter

Base behavior only on an observed and documented source profile. Validate its headers, parse into a
broker-specific record first, and then normalize into `BrokerActivity` or `Execution` evidence as
the source permits. Do not infer fills, timestamps, fees, option fields, or order relationships that
the source does not prove.

New profiles need synthetic fixtures, structured diagnostics, deterministic source ordering, and
tests covering malformed input. Do not claim support for customizable broker exports without
defining the exact supported profile.

## Financial and deterministic behavior

- Use `decimal.js` for quantities and precision-sensitive financial values.
- Serialize Decimal values as JSON strings.
- Preserve missing fee evidence as absent; do not replace unknown values with zero.
- Preserve date and time precision without inventing timezones.
- Keep IDs, ordering, diagnostics, allocation, and output deterministic.
- Add conservation or invariant tests when changing reconstruction logic.

## Fixtures and privacy

Only commit synthetic or explicitly public fixture data. Never commit personal brokerage exports,
account numbers, credentials, tax records, or other identifying financial information. Use clearly
synthetic account and transaction identifiers.

Before opening a pull request, run:

```bash
pnpm check
```

Describe the source evidence behind adapter changes and call out any assumptions or intentionally
unsupported behavior.
