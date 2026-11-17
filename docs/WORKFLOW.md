# Workflows

## Participant onboarding

1. Manufacturer connects its wallet.
2. Manufacturer adds a First Conveyance address.
3. The new participant connects and adds National Storage.
4. The process repeats through the ordered route.
5. The registry persists `parent` and `isDirectConnection[parent][child]`.

## Product registration

1. Manufacturer creates a unique bytes32 product ID.
2. Manufacturer provides product, batch, expiry, quantity and cold-chain thresholds.
3. The contract validates the input and assigns current owner and return location to the manufacturer.
4. The product is added to manufacturer inventory and a creation history record is stored.

## Forward transfer

1. Current owner selects a direct successor.
2. Contract verifies ownership, role link, active receiver and Healthy status.
3. Contract checks internal wallet balance and moves the configured fee from sender to receiver.
4. Inventory membership and `currentOwner` change atomically in the transaction.
5. Prior owner is pushed to the return path and a history entry is stored.

## Sensor report

1. Sensor simulator or external integration submits temperature, humidity, damage flag and note from the configured oracle account.
2. The contract checks the product's configured limits.
3. A threshold breach or damage flag updates status to an unhealthy value.
4. The sensor observation is appended to the product history.
5. Forward transfer is blocked until the product is routed into the return flow. This prototype intentionally has no status-reset operation.

## Reverse logistics

1. Current owner selects a previous owner from the recorded route as return destination.
2. Contract verifies that the destination is part of this product's prior-owner route.
3. Product is marked for return and forward transfers are disabled.
4. Each reverse transfer must go to the most recent previous owner, so no checkpoint can be skipped.
5. Reaching the configured return location marks the product Returned and ends return transfers.

## Wallet operations

1. Participant deposits ETH to create an internal wallet balance.
2. A product transfer charges the configured fee against that balance.
3. Receiver receives the internal credit.
4. A participant may withdraw only its own available internal balance.
