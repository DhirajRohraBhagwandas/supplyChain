# SmartChain existing-wallet fix and code-audit notes

## Root cause addressed

Earlier existing-wallet instructions could silently fall back to Hardhat Account 0 when `LOCAL_MANUFACTURER_ADDRESS` was not loaded from the correct `.env` file. The generic deployment check could still pass because Account 0 was a valid Manufacturer in that fallback deployment. This made it appear that changing the account had not worked.

The updated design separates two addresses:

- `deployer`: local Hardhat account used as deployment administrator.
- `manufacturer`: exact public address stored with the Manufacturer role by the `ParticipantRegistry` constructor.

`scripts/require-existing-wallet.js` refuses to start if the full address is missing or malformed. `setup:local:existing` compiles, deploys, seeds, runs general checks and then runs a dedicated check that compares `.env`, deployment JSON, on-chain participant role, network, bytecode, oracle and local gas balance. It will fail rather than silently fall back.

## Additional defect fixed

`SmartChainSupplyChain.deposit()` previously increased `walletBalance[msg.sender]` twice while increasing `totalEscrowed` once. The duplicate credit has been removed. A regression test now checks the wallet balance, contract balance and escrow liabilities immediately after a deposit.

## Other changes

- ParticipantRegistry supports a separate Manufacturer address while retaining the deployer as contract administrator.
- The local deployment funds the selected MetaMask address with disposable local ETH for transaction gas; no private key is needed in `.env`.
- The frontend displays `manufacturer` rather than assuming `deployer` is always the Manufacturer.
- The existing-wallet setup restarts no chain process and deploys a fresh contract pair to the currently running Hardhat node. Restarting the node later erases local state and requires setup again.
- The test suite now contains 30 authored test cases.

## Verification performed in this package build

- JavaScript syntax checks: passed.
- React JSX/ESM parse checks: passed using the available TypeScript transpiler.
- JSON configuration parse checks: passed.
- NPM script and referenced-file consistency checks: passed.
- Source inspection confirmed all ParticipantRegistry deploy call sites include the new constructor argument.

## Not verified here

`npm install` was attempted but timed out while contacting the npm registry. Therefore Solidity compilation, execution of the 30 Hardhat tests, Vite production build, local RPC deployment and MetaMask browser transactions have **not** been runtime-verified in this environment. Run `npm run verify` and `npm run frontend:build` locally before demonstration. No professional smart-contract audit has been performed.
