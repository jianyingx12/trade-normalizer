# @trade-normalizer/adapter-ibkr

Fixed-profile IBKR equity execution adapter for Universal Trade Normalizer.

The adapter supports only the **UTN IBKR Trade Confirmation Execution CSV v1** profile. Valid rows
produce canonical execution evidence and linked `BrokerActivity` values. Arbitrary Flex Query
exports and IBKR option imports are not supported.

```ts
import { adaptIbkrTradeConfirmationExecutionCsv } from '@trade-normalizer/adapter-ibkr';

const result = adaptIbkrTradeConfirmationExecutionCsv(csvText, {
  sourceId: 'import-1',
  sourceFile: 'trades.csv',
});
```

Most applications should select IBKR through `@trade-normalizer/cli` instead of invoking the
adapter directly.

MIT licensed. Never publish personal brokerage exports as fixtures.
