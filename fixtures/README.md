# Fixtures

Every tracked fixture in this repository is synthetic. These files are designed to resemble the
documented supported shapes, but they are not official broker exports and contain no personal
brokerage data.

## Organization

- `robinhood/`: supported Robinhood activity input and focused malformed cases when needed
- `ibkr/`: supported fixed-profile IBKR execution input plus duplicate and unsupported-profile cases
- `cross-broker/`: paired sources representing the same economic lifecycle in different formats

Names containing `synthetic` are intentionally fabricated. Account, execution, order, transaction,
price, and activity values are test data.

## Private local fixtures

Place personal or locally sanitized experiments under `fixtures/private/`. That directory is
ignored by Git and must never be referenced by committed tests. Prefer creating a minimal synthetic
reproduction instead of retaining a real export.

Before committing a fixture, verify that it contains no real account identifiers, names, addresses,
tax information, credentials, or recognizable private transaction history. Broker evidence should
be preserved structurally without preserving a person's data.
