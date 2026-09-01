# @trade-normalizer/core

Broker-independent reconstruction engine for Universal Trade Normalizer.

The package provides deterministic FIFO equity reconstruction, single-leg option reconstruction,
vertical-spread ownership, canonical Trade production, and adapter contracts. It operates on
canonical evidence from `@trade-normalizer/schemas` and does not parse broker CSV files.

```ts
import { reconstructEquityPositions } from '@trade-normalizer/core';

const result = reconstructEquityPositions(activities);
```

These lower-level APIs are intended for advanced integrations. Most applications should use
`normalizeBrokerSource` or `normalizeBrokerFile` from `@trade-normalizer/cli`.

MIT licensed. Financial quantities and values use exact Decimal arithmetic.
