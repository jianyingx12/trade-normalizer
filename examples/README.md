# Examples

Build the workspace before running these examples:

```bash
pnpm build
```

Normalize the public synthetic Robinhood fixture:

```bash
pnpm example:robinhood
```

Normalize the fixed-profile public synthetic IBKR fixture:

```bash
pnpm example:ibkr
```

Normalize an in-memory CSV string through the programmatic API:

```bash
pnpm example:memory
```

Each command writes a V2 normalization envelope to stdout. The examples import the built
`@trade-normalizer/cli` API directly from this workspace and make no network requests.

For an arbitrary supported local file after building:

```bash
node examples/normalize-broker-file.mjs robinhood path/to/activity.csv
node examples/normalize-broker-file.mjs ibkr path/to/trade-confirmation.csv
```
