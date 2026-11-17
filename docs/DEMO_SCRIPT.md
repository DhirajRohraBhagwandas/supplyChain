# End-to-End Demonstration Script

## Preparation

- Start the local Hardhat node.
- Deploy the contracts.
- Run the React frontend.
- Add the Hardhat local network to MetaMask.
- Import only disposable Hardhat accounts.
- Keep a written mapping of which test account represents each participant role.

## Demo route

Use separate accounts in this order:

1. Account 0 — Manufacturer
2. Account 1 — First Conveyance
3. Account 2 — National Storage
4. Account 3 — Second Conveyance
5. Account 4 — Provincial Storage
6. Account 5 — Third Conveyance
7. Account 6 — District Storage
8. Account 7 — Fourth Conveyance
9. Account 8 — Hospital
10. Account 9 — Patient

## Walkthrough

1. Show the manufacturer profile and empty inventory.
2. Onboard the First Conveyance account. Switch to that wallet and onboard National Storage. Repeat through Patient.
3. Register a vaccine batch with an example safe range such as 2–8 °C and humidity maximum 65%.
4. Deposit enough internal ETH into the manufacturer wallet.
5. Transfer the product through each direct successor. Show how the previous owner's inventory becomes empty and the receiver's inventory gains the product.
6. Open Product Tracking and show the product ID, QR code and on-chain history.
7. Submit a normal reading from the configured oracle wallet.
8. For a second product, submit a temperature reading outside the configured range. Show the `Temperature Excursion` state and attempt a forward transfer; the contract should reject it.
9. For a product that completed one or more forward transfers, initiate a return to an earlier checkpoint. Attempt to skip a checkpoint and show that the contract rejects it; then execute the exact reverse path.
10. Show wallet fee credits, balances and a permitted withdrawal.
11. Run the Hardhat test suite and gas benchmark. Display the actual console output and CSV generated during this run.

## Claims to avoid

- Do not call the local sensor simulator a physical IoT device.
- Do not call the single configured oracle a decentralized oracle network.
- Do not claim the project is secure for commercial deployment or professionally audited.
- Do not present local execution gas as actual Sepolia or Ethereum mainnet fees.
