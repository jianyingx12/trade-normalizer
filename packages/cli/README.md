# @trade-normalizer/cli

Command-line interface and high-level normalization API for Universal Trade Normalizer.

```bash
trade-normalizer normalize trades.csv --broker robinhood
trade-normalizer normalize trades.csv --broker ibkr --output normalized.json
trade-normalizer inspect trades.csv --broker ibkr
trade-normalizer validate trades.csv --broker ibkr
```

Programmatic callers can run the same end-to-end workflow without coordinating adapters and core
reconstruction stages themselves:

```ts
import { normalizeBrokerSource } from '@trade-normalizer/cli';

const result = normalizeBrokerSource({
  source: csvText,
  sourceFile: 'trades.csv',
  broker: 'robinhood',
});
```

The tool runs locally with no telemetry, database, credentials, market-data service, or AI
dependency. MIT licensed. Treat broker exports as sensitive financial data.
