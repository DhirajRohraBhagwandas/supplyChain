# Manufacturer account and registration behavior

The local deployment supports a Manufacturer address that is different from the deployment administrator.

- `deployer`: local Hardhat admin account used to deploy and configure the contracts.
- `manufacturer`: address in `LOCAL_MANUFACTURER_ADDRESS`; ParticipantRegistry stores this address as role `Manufacturer` in its constructor.
- The Manufacturer uses its own MetaMask private key to sign normal dApp transactions. No private key is entered into project files.

To use an existing MetaMask wallet:

1. Copy its full public address (not the shortened label).
2. In the project root, create `.env` from `.env.example`.
3. Set `LOCAL_MANUFACTURER_ADDRESS=0x...` to the full address.
4. Ensure the Hardhat node is running on port 8545.
5. Run `npm run setup:local:existing`.
6. Confirm both `ALL LOCAL DEPLOYMENT CHECKS PASSED` and `EXISTING METAMASK MANUFACTURER CHECKS PASSED`.
7. Stop any old Vite terminal with Ctrl+C, restart `npm run frontend:dev`, select the same MetaMask address on chain 31337, and reconnect.

If My Inventory still says the wallet is unregistered, compare the connected MetaMask address with `manufacturer` in both `deployments/localhost.json` and `frontend/src/deployment.json`. They must match exactly. Also run `npm run check:local:existing`; do not proceed if it fails.

A wallet cannot register itself through the dApp. The selected address is made Manufacturer during a fresh local contract deployment. Other participants are onboarded by their immediate parent according to the contract role order.

This workflow is local-only and must not be used on Sepolia or mainnet.
