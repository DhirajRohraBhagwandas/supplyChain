# Architecture and Design Notes

## Scope

SmartChain turns the research paper's pharmaceutical supply-chain framework into a demonstrable dApp. The system is intentionally permissioned at the participant layer while keeping the recorded product lifecycle verifiable through EVM state and events.

## Trust boundaries

| Actor / component | Trusted for | Not trusted for |
|---|---|---|
| Participant wallet | Signing its own onboarding and product operations | Changing role, skipping linked parties, overriding health checks |
| ParticipantRegistry | Role order and direct participant relationships | Product health or sensor truth |
| SmartChainSupplyChain | Product ownership, inventory, history, fee and return rules | Physical identity of goods |
| Sensor oracle account | Submitting condition observations | Proving a physical sensor is genuine |
| Frontend | Forms, display and transaction initiation | Enforcing authorization or ownership rules |
| Local simulator | Producing demo readings | Real-world cold-chain measurement |

## Data stored on-chain

### Participant

`role`, `parent`, `name`, `email`, `active`, `joinedAt`.

### Product

`id`, `name`, `batchNumber`, `quantity`, `manufacturedAt`, `expiryAt`, `minTemperatureC`, `maxTemperatureC`, `maxHumidityPct`, `currentOwner`, `returnLocation`, `status`, `isReturning`, `createdAt`, `updatedAt`.

### Product history event

`from`, `to`, `timestamp`, `action`, `temperatureC`, `humidityPct`, `status`, `note`.

### Wallet accounting

`walletBalance[address]` and `totalEscrowed`. The latter is the sum of liabilities tracked by the contract and can be compared with the actual contract ETH balance using `getEscrowSolvency()`.

## Important invariants

- Only a registered Manufacturer may call `registerProduct`.
- A product ID is unique.
- A participant can onboard only the immediate next role in the configured route.
- A forward transfer requires the caller to own the product, the product to be Healthy, the receiver to be active and directly linked, and the caller's internal balance to cover the fee.
- A sensor report can be submitted only by the configured oracle.
- An unhealthy status cannot be cleared by a subsequent normal reading.
- A return transfer can move only to the latest address in the recorded prior-owner stack.
- When a product reaches its designated return location, its status becomes Returned and the reverse flow ends.
- A participant with inventory or a live reverse-route reference cannot be removed.
- Withdrawals cannot exceed the sender's internal balance.

## Limitations

The role route is linear and does not support split/merge lots, partial quantity transfers, parallel suppliers, or multiple branches. There is one trusted oracle account. Product and participant data are public in this prototype. These limits are acceptable for a first academic demonstrator but must be addressed before a real deployment.
