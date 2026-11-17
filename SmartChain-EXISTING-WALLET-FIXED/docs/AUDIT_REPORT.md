# SmartChain source audit — 10 November 2026

## Scope reviewed

The review covered the root/frontend npm scripts, Hardhat configuration, participant and supply-chain Solidity contracts, deployment/seed/check scripts, existing-wallet onboarding flow, Ethers v6 frontend helper, React wallet/transaction handlers, sensor simulator, and Hardhat test source.

## Root causes and defects addressed

1. **Existing-wallet setup could silently use the wrong Manufacturer.** The earlier version attempted to use the selected address as a deployer through local impersonation. If the project-root `.env` value was absent or not loaded, the deploy script fell back to Hardhat Account 0 and the generic deployment checks could still pass. The current version distinguishes `deployer` (contract administrator) from `manufacturer` (on-chain supply-chain participant). The selected MetaMask public address is passed into the ParticipantRegistry constructor and stored as role Manufacturer.
2. **No strict proof that the intended account was deployed.** Added `scripts/require-existing-wallet.js`, `setup:local:existing`, and `check:local:existing`. The strict command refuses to run with a missing/malformed address and verifies that `.env`, deployment JSON, on-chain role/parent, configured oracle, contract bytecode, chain ID and frontend manifest all match.
3. **Frontend message showed the wrong address concept.** The My Inventory locked state now displays `manufacturer` from the deployment manifest instead of assuming the deployer is always the Manufacturer. The main not-registered notice also reflects the configured Manufacturer address.
4. **Wallet accounting defect.** `deposit()` previously incremented `walletBalance[msg.sender]` twice but increased `totalEscrowed` only once. Removed the duplicate credit and added a regression test that checks the wallet balance, contract balance and escrow liabilities after a deposit.
5. **Ethers v6 signer/provider mismatch.** The frontend helper resolves the Signer's `.provider` for network/bytecode checks while leaving the Contract connected to the Signer for MetaMask signatures.
6. **Stale deployment/ABI handling.** Deployment writes a manifest and ABI JSON files. Frontend contract setup checks nonzero addresses, ABI presence, chain ID and deployed bytecode, and reports actionable errors.
7. **Seed consistency.** The seed script validates the active deployment and expected participant role/parent relationships; the checker validates all ten role records and the seeded product.
8. **Environment path consistency.** Hardhat and the strict preflight load `.env` from the project root rather than relying on the terminal's current directory.
9. **Test source updated.** The suite now contains 30 authored test cases, including custom Manufacturer assignment and deposit accounting. The authored count is not a claim that the tests have passed at runtime.

## Static checks completed in this package build

- `node --check` passed for `hardhat.config.js`, root scripts, library scripts, IoT script and Hardhat test source.
- TypeScript transpile/parser check passed for `App.jsx`, `main.jsx`, `chain.js` and Vite config.
- JSON parsing passed for root/frontend package files, deployment JSON and ABI placeholders.
- Package script and source reference consistency checked; all `ParticipantRegistry.deploy()` call sites include the new constructor argument.
- The deposit implementation was inspected and now credits `walletBalance` once per deposit.

## Not verified here

`npm install --no-audit --no-fund` was attempted but timed out while contacting the npm registry. Therefore this environment could not run Solidity compilation, execute the 30 Hardhat tests, build the Vite frontend, start a local RPC deployment, or conduct MetaMask/browser transactions. Run `npm run verify` and `npm run frontend:build` locally before the demo. The `setup:local:existing` and `check:local:existing` commands must also complete successfully on the user's machine. No runtime pass is claimed here.

## Remaining limitations

- The sensor process is a signed test-wallet simulator, not a physical ESP32/DHT sensor or production Chainlink oracle integration.
- IPFS document storage is not implemented in this version.
- Participant name/email and product data are public on-chain in this research prototype; use synthetic demo data.
- The current participant route is linear and does not model branching, split batches, or many-to-many logistics networks.
- No professional security audit, fuzzing campaign, formal verification, Sepolia deployment or live user acceptance test has been completed.
