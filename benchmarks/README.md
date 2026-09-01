# Benchmarks

Build the workspace, then run the standalone benchmark suite:

```bash
pnpm build
pnpm benchmark
```

The benchmark covers broker CSV parsing, equity reconstruction, option reconstruction, vertical
candidate grouping and ownership, canonical Trade production, and full broker normalization.

Results are seven-sample medians after warmup. They are intended to reveal major regressions and
obvious complexity problems, not to promise production latency. No timing thresholds run in the
normal test suite because shared and CI environments vary substantially.

The generated inputs are deterministic and created in memory. In particular, the vertical case
places 100 option lots in one structural group, producing approximately 2,500 opposite-direction
candidate pairs and directly exercising the grouping path most likely to exhibit quadratic growth.

## Latest local observation

Observed on 2026-08-31 using Node 22.17.0 on Windows x64 with an Intel Core i5-10210U. Times are
median milliseconds per operation:

| Path                                                 | Approximate time |
| ---------------------------------------------------- | ---------------: |
| Robinhood parsing, 17 records                        |         0.142 ms |
| IBKR parsing, 4 records                              |         0.125 ms |
| Equity reconstruction, 10,000 activities             |       922.737 ms |
| Option reconstruction, 2,000 activities              |        58.941 ms |
| Vertical reconstruction, 100 lots / ~2,500 pairs     |        45.065 ms |
| Canonical Trade production, 10,000 equity activities |       112.863 ms |
| Full Robinhood normalization, 17 records             |         1.340 ms |
| Full IBKR normalization, 4 records                   |         1.117 ms |

Run results and environment details will vary. Update this table only when intentionally auditing
performance; do not treat it as a release guarantee. The measurements did not reveal a
release-blocking hotspot. Vertical candidate generation is intentionally pairwise within each
structural group, so unusually large same-contract-family groups can grow quadratically and should
remain a monitored path.
