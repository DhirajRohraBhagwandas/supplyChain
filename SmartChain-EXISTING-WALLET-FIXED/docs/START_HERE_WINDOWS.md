# Start Here — Windows / Git Bash / PowerShell

Use this file as the single setup sequence for a clean local demonstration. Run commands from the extracted project root, the directory containing the root `package.json`.

## 0. Make sure you opened the right folder

Extract `SmartChain-EXISTING-WALLET-FIXED.zip` into a new directory (for example `C:\Users\<you>\Downloads\SmartChain-EXISTING-WALLET-FIXED`). Open that directory in VS Code. In the VS Code terminal run:

```bash
pwd
npm run
```

The scripts list must include `check:local`, `setup:local`, `frontend:install`, and `frontend:dev`. If it does not, the terminal is in an older SmartChain folder. Do not mix files between different project ZIPs.

## 1. Install and validate source

```bash
npm install
npm run verify
npm run frontend:install
npm run frontend:build
```

`verify` runs Solidity compilation followed by the automated contract suite. Stop and fix any error before moving on. The test source currently contains 30 test cases; report the actual passing count printed by your machine.

## 2. Start the local chain

Terminal 1:

```bash
npm run node
```

Leave this terminal open. Hardhat prints 20 local development accounts and private keys. Account 0 is the deployment administrator and, in the default setup, the Manufacturer. In the existing-wallet setup, the configured MetaMask address is the Manufacturer. Use only disposable local test accounts.

If you see `EADDRINUSE` on port 8545, a process is already listening. Check other terminals. If the existing Hardhat node is running, do not start another; continue to Step 3 in Terminal 2. If the process is stale, identify it with `netstat -ano | findstr :8545` and `tasklist | findstr <PID>`. Stop only the unwanted process, then restart the node.

## 3. Deploy, seed, and verify

Terminal 2, from the root folder:

```bash
npm run setup:local
```

This command performs, in order:

1. `deploy:local` — deploys ParticipantRegistry and SmartChainSupplyChain, then writes the frontend deployment addresses and ABIs.
2. `seed:local` — creates the participant route, demo vaccine, and Manufacturer's internal wallet funding.
3. `check:local` — verifies chain ID, bytecode at both contract addresses, frontend config and required ABI functions, registry manager link, oracle, all ten role/parent records, demo product, and escrow solvency.

Do not open the dApp until the final line reads `ALL LOCAL DEPLOYMENT CHECKS PASSED`.

## 4. Start the frontend

Terminal 3, from the root folder:

```bash
npm run frontend:dev
```

Open the localhost URL Vite prints (normally `http://localhost:5173`).

## Use an existing MetaMask address as Manufacturer (recommended if you do not have Account #0)

Copy the **full public address** from MetaMask and set `LOCAL_MANUFACTURER_ADDRESS=0x...` in the project-root `.env` file. Then run `npm run setup:local:existing`. This command requires the address to be set, deploys a new registry with that address as Manufacturer, seeds demo data, and verifies the exact configured address. No MetaMask private key is required. See [USE_EXISTING_METAMASK_ACCOUNT.md](USE_EXISTING_METAMASK_ACCOUNT.md). This is only for local chain ID `31337`.

## 5. Connect MetaMask

Select or add:

| Field | Value |
|---|---|
| Network name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency | `ETH` |

For the default setup, Account 0 is the Manufacturer. For the existing-wallet setup, select the address configured in `.env`; it is recorded as `manufacturer` in `frontend/src/deployment.json`. The deployment administrator is recorded separately as `deployer`. The demo role mapping is in `results/demo-accounts.json`.

## 6. Smoke-test real on-chain calls

1. Connect the Manufacturer address (Account 0 for the default setup, or the configured `.env` address for the existing-wallet setup). The profile should say Manufacturer.
2. Open **My inventory**. The seeded Demo Cold-Chain Vaccine should be visible and the product-registration form should be displayed.
3. Register a new product. MetaMask must request a transaction signature. After confirmation, the new product must appear in inventory.
4. Open **Operations** and deposit a small amount into the SmartChain internal wallet. The balance must change after confirmation.
5. Transfer a healthy product to account 1. Switch MetaMask to account 1 and refresh; the product must now appear in account 1 inventory.
6. For a separate test product, submit an out-of-range reading from the configured oracle account. The product must become unhealthy and forward transfer must revert.
7. Mark a product for return from its current owner and send it to the exact immediate previous owner at each reverse step. On reaching the selected return point, status should become `Returned`.
8. Search by Product ID in Product tracking. The record and event history should load from the local RPC.

## 7. When the local chain is restarted

Hardhat's local chain is in-memory. Restarting `npm run node` erases deployed contracts, users, products, transactions, and wallet balances. Run `npm run setup:local` again for the default setup or `npm run setup:local:existing` for an existing-wallet setup, then reconnect MetaMask. Never reuse deployment addresses from a previous node instance.

## 8. Current scope and limits

- The smart contracts and frontend write handlers are designed to interact on-chain. The Ethers v6 helper must receive either a Provider or a Signer; it resolves the Signer's `.provider` for network/bytecode checks while keeping the Signer attached for signed transactions.
- The sensor simulator is an authorized test-account oracle simulator, not a live Chainlink feed or a physical ESP32/DHT sensor.
- QR codes encode a lookup URL. On local development, a QR scanned by a different device cannot reach `127.0.0.1` on the developer's computer without additional network configuration.
- Sepolia is optional. The default project configuration is Hardhat Local chain ID 31337. Do not select Sepolia (11155111) for the local demo.
- No professional smart-contract security audit has been performed.
