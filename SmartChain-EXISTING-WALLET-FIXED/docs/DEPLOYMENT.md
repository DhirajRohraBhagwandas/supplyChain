# Deployment Runbook

## Local Hardhat chain

Run from the repository root (the directory containing `package.json`).

1. Install root dependencies: `npm install`.
2. Compile and run contract tests: `npm run verify`.
3. Install frontend dependencies: `npm run frontend:install`.
4. Terminal A: `npm run node` and leave it running.
5. Terminal B: `npm run setup:local` (deploy, seed demo participants/product, and verify local state).
6. Terminal C: `npm run frontend:dev`.
7. Open the Vite URL and select MetaMask network Hardhat Local: `http://127.0.0.1:8545`, chain ID `31337`, currency `ETH`.

The deployment script writes the chain ID, contract addresses, deployment time, deployer and sensor oracle to `deployments/<network>.json`, and exports the frontend ABIs and `frontend/src/deployment.json`. The seed script writes `results/demo-accounts.json` with the demo product ID and role/address mapping.

The verification command checks the actual RPC chain, deployed bytecode, manifest/ABI consistency, registry manager wiring, oracle, each demo role/parent link, the demo product and escrow solvency. It must finish with `ALL LOCAL DEPLOYMENT CHECKS PASSED` before the browser demo.

### Port 8545 is already in use

If `npm run node` reports `EADDRINUSE`, first check whether the existing Hardhat node is already running in another terminal. Leave it running and proceed with `npm run setup:local` in Terminal B. If it is an unwanted stale process, identify it with `netstat -ano | findstr :8545` and `tasklist | findstr <PID>`. Stop only that process. Restarting Hardhat clears all in-memory chain state, so deploy and seed again afterward.

## Sepolia testnet (optional)

1. Copy `.env.example` to `.env`.
2. Replace the example placeholders with a working `SEPOLIA_RPC_URL` and a disposable testnet `PRIVATE_KEY`. Keep `.env` out of Git.
3. Fund the deployer with Sepolia test ETH.
4. Run `npm run compile`, `npm test`, and then `npm run deploy:sepolia`.

The Hardhat config only enables the Sepolia network when a non-placeholder RPC URL is set. Never deploy real product/patient data to a public chain, and never put a real wallet's private key in the project or chat.

## Sensor oracle account

By default the deployment account is the sensor oracle. For a separate test wallet, set `SENSOR_ORACLE_ADDRESS` before deployment and use the corresponding local/testnet key as `SENSOR_PRIVATE_KEY` for `npm run sensor:simulate`. The simulator is a controlled test input, not a physical sensor or Chainlink feed.
