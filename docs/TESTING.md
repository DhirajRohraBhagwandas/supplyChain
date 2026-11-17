# Testing Plan

## Run

```bash
npm install
npm run compile
npm test
npm run test:gas
```

## Test areas

| Area | Positive paths | Negative / edge cases |
|---|---|---|
| Registry | Manufacturer and sequential onboarding | Wrong next role, unregistered caller, duplicate address |
| Product | Valid registration and inventory assignment | Duplicate ID, empty data, zero quantity, invalid thresholds, non-manufacturer |
| Transfer | Direct next participant and fee movement | Skip checkpoint, wrong owner, underfunded wallet, unhealthy product |
| Sensor | Oracle reports inside/outside bounds | Unauthorized reporter, sticky unhealthy status |
| Return | Designated route back to origin | Wrong destination, skipped checkpoint, forward movement after return begins |
| Wallet | Deposit, transfer credits, withdrawal | Zero amount, excessive withdrawal, escrow solvency |
| Participant removal | Remove an empty child participant | Holder with inventory, non-parent caller, child with descendants |

## Further validation recommended

- Add invariant tests for inventory uniqueness and escrow solvency after arbitrary action sequences.
- Add property-based fuzz tests for role transitions, fee balances and return-path stack operations.
- Add Slither static analysis and a manual review of access control, external calls and denial-of-service risks.
- Add frontend unit tests and Playwright journeys for the role-by-role demo.
- Measure actual deployed testnet gas and latency separately from local Hardhat values.

Do not claim a test has passed until `npm test` has been run and its output recorded.
