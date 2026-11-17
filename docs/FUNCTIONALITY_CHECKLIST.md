# SmartChain functionality verification checklist

This checklist tests the current prototype against the local Hardhat blockchain. The frontend is not a mock-only UI: its transaction handlers call the deployed Solidity contracts through ethers.js. The app is usable only after contracts have been compiled, deployed, and their generated ABI/deployment files have been written by the deployment script.

## 1. Install dependencies and run the automated contract tests

Open PowerShell in the `SmartChain` root folder:

```powershell
npm install
npm run compile
npm test
```

Expected:

- `npm run compile` finishes without Solidity errors.
- `npm test` reports 28 passing test cases.
- Tests cover participant onboarding/authorization, product registration and inventory, forward transfers, invalid routes, internal wallet fees, oracle-only sensor reports, unhealthy product blocking, product history, return routing, participant removal restrictions, and withdrawals.

Do not continue to the browser demo if compile or tests fail. Save the complete terminal error for debugging.

## 2. Start a clean local blockchain

Terminal 1 (leave it running):

```powershell
npm run node
```

Hardhat prints funded development accounts and private keys. Use only these disposable local accounts. Never import a real wallet private key or use a personal wallet for local development.

## 3. Deploy the contracts and seed demo data

Terminal 2, from the project root:

```powershell
npm run deploy:local
npm run seed:local
```

Expected:

- Two contracts are deployed: `ParticipantRegistry` and `SmartChainSupplyChain`.
- `frontend/src/deployment.json` is updated with non-zero addresses and chain ID `31337`.
- `frontend/src/abi/ParticipantRegistry.json` and `frontend/src/abi/SmartChainSupplyChain.json` are populated with ABI JSON (they are placeholders before deployment).
- `results/demo-accounts.json` is created with the product ID and participant addresses.

If these files are not updated, stop: the frontend cannot interact with the contracts yet.

## 4. Install and start the frontend

Terminal 3, from the project root:

```powershell
npm run frontend:install
npm run frontend:dev
```

Open the Vite URL printed in the terminal, normally `http://localhost:5173`.

## 5. Configure MetaMask

Add/select this custom network:

| Setting | Value |
|---|---|
| Network name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency | `ETH` |

Import the first Hardhat account (account 0) from the terminal's local node output. This is the manufacturer/deployer and default sensor oracle. Connect it to SmartChain.

The seed script maps accounts as follows:

| Hardhat account | Demo role |
|---:|---|
| 0 | Manufacturer / default oracle |
| 1 | First Conveyance |
| 2 | National Storage |
| 3 | Second Conveyance |
| 4 | Provincial Storage |
| 5 | Third Conveyance |
| 6 | District Storage |
| 7 | Fourth Conveyance |
| 8 | Hospital |
| 9 | Patient |

Import each account only when you need to test that participant. Account private keys are printed by the local Hardhat node; `results/demo-accounts.json` contains addresses and role names, not private keys.

## 6. Verify the features one by one

### A. Wallet and participant connection

1. Connect account 0 in MetaMask.
2. Confirm the app shows the shortened account address, `Local Hardhat`, and the Manufacturer profile.
3. Click **Refresh**.

Expected: the participant profile loads from `ParticipantRegistry`; the app does not merely show a connected wallet badge.

### B. Product registration and inventory

1. Open **My inventory**.
2. Confirm the seeded `Demo Cold-Chain Vaccine` is visible.
3. Register another test product with a unique batch number, quantity greater than zero, a future expiry, and a valid temperature range (for example 2–8°C).
4. Confirm MetaMask asks for a transaction signature and wait for confirmation.

Expected: the new product appears in the manufacturer's inventory after refresh. The product record is stored by `SmartChainSupplyChain` and its creation is in the history.

### C. Internal wallet deposit and withdrawal

1. Open **Operations**.
2. Deposit a small amount such as `0.01` ETH into the SmartChain internal wallet.
3. Confirm the displayed internal balance increases.
4. Withdraw a smaller amount such as `0.001` ETH.

Expected: MetaMask confirms each transaction; the internal balance changes by the amount deposited/withdrawn. This is separate from the ETH used by MetaMask to pay blockchain gas.

### D. Participant onboarding

The seed has already added the main route. To test onboarding without disturbing it:

1. Import another unused Hardhat account (account 10).
2. Switch back to account 0 (Manufacturer).
3. Open **Participants** and add account 10 as another **First Conveyance** participant, with a demo name/email.

Expected: a MetaMask transaction is confirmed and the new participant appears under directly linked participants. The contract rejects invalid role order, duplicate active address, and unregistered callers.

### E. Normal product transfer and inventory update

Use a healthy product currently owned by account 0.

1. On account 0, open **Operations** and transfer its product ID to account 1's address from `results/demo-accounts.json`.
2. Confirm the transaction in MetaMask.
3. Switch MetaMask to account 1 and reconnect/refresh.
4. Confirm the product is now in account 1's inventory.
5. Transfer it from account 1 to account 2, then repeat for later stages if you want to demonstrate the full route.

Expected: ownership and inventories update after every confirmed transaction. A transfer fee is deducted from the sender's internal balance and credited to the receiver. An account cannot skip a direct checkpoint.

### F. Product tracking and event history

1. Copy the product ID from `results/demo-accounts.json` or from the registration success notice.
2. Open **Product tracking**, paste the ID, and click **Verify on blockchain**.
3. Confirm the record shows batch, owner, quantity, expiry and status, and the history shows creation/transfer events.
4. Test the QR code or use `http://localhost:5173/?product=<PRODUCT_ID>`.

Expected: the product record and event history are read from the deployed contract. Read-only lookup uses the local RPC and does not require a connected wallet; the local node and deployment manifest must still be available.

### G. Sensor report and unhealthy-product restriction

Use a separate test product so the healthy demo product can still be transferred normally.

1. Create a test product with temperature range 2–8°C.
2. Transfer it to account 1.
3. Switch back to account 0, which is the default sensor oracle unless `SENSOR_ORACLE_ADDRESS` was configured during deployment.
4. In **Operations**, submit a reading for that product with temperature `12`, humidity `45`, damage unchecked.
5. Switch to the current product owner (account 1) and attempt a forward transfer.

Expected: the sensor report is recorded and status becomes `Temperature Excursion`; the forward transfer reverts with a product-health error. An unhealthy state is intentionally sticky in this prototype; use a new product for further healthy-transfer tests.

### H. Reverse logistics / product return

Use the product that was transferred from account 0 to account 1 (even if it was flagged unhealthy in the previous test).

1. Connect account 1, the current owner.
2. Open **Operations** and mark the product for return, setting the destination to account 0 (the previous owner).
3. Execute reverse transfer with account 0 as the immediate previous owner.
4. Switch to account 0 and refresh.

Expected: product returns to account 0, status becomes `Returned`, and the history records the return events. Return transfers cannot skip the previous-owner checkpoint.

### I. Negative/authorization checks

Try these only after the normal path is understood:

- Attempt to transfer a product from an account that is not its current owner.
- Attempt to transfer to an account that is not directly linked.
- Attempt to transfer a flagged/unhealthy product forward.
- Attempt to mark a return to an address that is not on the product's recorded route.
- Attempt to withdraw more than the internal balance.
- Attempt to remove a participant who holds inventory or is still referenced by an active product route.

Expected: these transactions are rejected by the smart contract; the on-chain state should remain unchanged.

## 7. Sensor simulator (optional separate process)

The simulator is a Node.js script, not a physical sensor and not a Chainlink integration. Configure a root `.env` with the local RPC, the default oracle's local private key, and an actual deployed product ID:

```dotenv
RPC_URL=http://127.0.0.1:8545
SENSOR_PRIVATE_KEY=YOUR_DISPOSABLE_LOCAL_ORACLE_PRIVATE_KEY
PRODUCT_ID=0xYOUR_PRODUCT_ID
SENSOR_INTERVAL_MS=12000
```

Then run from the project root:

```powershell
npm run sensor:simulate
```

Use `npm run sensor:simulate -- --alert` only with a disposable test product because an unhealthy status is sticky. Do not claim real-world IoT readings: the script submits generated/simulated values.

## 8. If something does not work

| Symptom | Check |
|---|---|
| Wrong network / chain ID | MetaMask must use Hardhat Local, chain ID `31337`. |
| Connection says contracts not deployed | Run the deploy command after starting the Hardhat node. |
| Contract calls fail or ABI error | Check that deployment wrote non-empty ABI JSON and non-zero addresses. |
| RPC connection refused | Keep `npm run node` running at `127.0.0.1:8545`. |
| Product not found | Confirm the ID and current chain; redeploying resets local chain state and creates new contract addresses. |
| Transfer fails for insufficient internal balance | Deposit into the SmartChain contract wallet; MetaMask gas balance is a different balance. |
| Sensor transaction rejected | Use the configured oracle account (account 0 by default). |
| New participant cannot be added | Caller must be registered and may add only the next sequential role. |
| Return fails | Caller must be current owner and receiver must be the immediate previous owner on the recorded path. |
| `npm install` fails | Check internet/proxy/firewall/DNS access to `registry.npmjs.org`, then retry. |

## 9. Current implementation boundaries

Implemented in source: participant role hierarchy and parent-child links; product registration; inventories; forward transfers; return routing; wallet deposit/withdrawal and internal transfer fees; oracle-authorized sensor reports; event history; deployment/seed scripts; React transaction screens; QR lookup; and a 26-case Hardhat test source file.

Not yet production implementations: physical ESP32/DHT sensor connectivity, live Chainlink oracle integration, IPFS document storage, a public hosted QR verifier, professional security audit, or public testnet deployment validation. The tests are authored but must be run successfully on your computer before reporting them as passed.
