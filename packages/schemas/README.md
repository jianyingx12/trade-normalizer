# @trade-normalizer/schemas

Canonical runtime schemas and TypeScript domain types for Universal Trade Normalizer.

This package defines broker-agnostic instruments, activities, executions, trades, provenance, fees,
commissions, and structured warnings. Precision-sensitive values use `decimal.js`; their JSON
representation is a decimal string.

```ts
import { BrokerActivitySchema, TradeSchema } from '@trade-normalizer/schemas';

const activity = BrokerActivitySchema.parse(input);
const trade = TradeSchema.parse(output);
```

Most applications should use the high-level workflow from `@trade-normalizer/cli`. Use this package
directly when validating canonical data or building an adapter.

MIT licensed. Broker exports may contain private financial information; use sanitized synthetic
data in issues and tests.
