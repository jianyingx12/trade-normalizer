# @trade-normalizer/adapter-robinhood

Robinhood account-activity CSV adapter for Universal Trade Normalizer.

The adapter supports the project's documented Robinhood equity activity profile. It maps valid
rows to canonical `BrokerActivity` values and preserves date-only source precision. It does not
claim that activity rows are broker-confirmed executions, and it does not support Robinhood option
imports.

```ts
import { adaptRobinhoodActivityCsv } from '@trade-normalizer/adapter-robinhood';

const result = adaptRobinhoodActivityCsv(csvText, {
  sourceId: 'import-1',
  sourceFile: 'trades.csv',
});
```

Most applications should select Robinhood through `@trade-normalizer/cli` instead of invoking the
adapter directly.

MIT licensed. Never publish personal brokerage exports as fixtures.
