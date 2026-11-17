# Use an existing MetaMask address as the local Manufacturer

This workflow assigns one of your existing MetaMask **public addresses** the Manufacturer role on a fresh local Hardhat chain. It does not require exporting a private key or importing Hardhat Account #0.

## Important distinction

- `deployer` is the local Hardhat account that deploys/administers the contracts.
- `manufacturer` is the address configured in `LOCAL_MANUFACTURER_ADDRESS` and stored as the Manufacturer participant on-chain.
- They are allowed to be different. The frontend displays and checks `manufacturer`, not `deployer`.

## 1. Use the full MetaMask public address

In MetaMask, choose the account you want to use and click its address to copy it. MetaMask's abbreviated label (such as `0xe09f…3d26`) is not enough. Use the complete 42-character `0x...` address. Never share a private key or recovery phrase.

## 2. Configure the project-root `.env`

Open Git Bash or the VS Code terminal in the directory containing the root `package.json`:

```bash
cp .env.example .env
notepad .env
```

Set exactly one line in `.env`:

```dotenv
LOCAL_MANUFACTURER_ADDRESS=0xPASTE_FULL_PUBLIC_ADDRESS_HERE
```

Save and close Notepad. Make sure the file is named `.env`, not `.env.txt`, and is in the same folder as `package.json`.

## 3. Start the local Hardhat node

Terminal 1:

```bash
npm run node
```

Keep it running at `http://127.0.0.1:8545`. If port 8545 is already in use by your running Hardhat node, leave that node open; do not start another one.

## 4. Deploy and seed with strict verification

Open Terminal 2 in the same project root and run:

```bash
npm run setup:local:existing
```

This command refuses to continue if `LOCAL_MANUFACTURER_ADDRESS` is missing or malformed. It deploys the contracts, assigns the exact configured public address the Manufacturer role, funds that address with disposable local ETH for gas, seeds the demo participant route/product using local-only Hardhat tooling, and checks that the frontend manifest and on-chain Manufacturer address match.

The final line must be:

```text
ALL LOCAL DEPLOYMENT CHECKS PASSED
```

Then also run the dedicated assertion:

```bash
npm run check:local:existing
```

Expected final line:

```text
EXISTING METAMASK MANUFACTURER CHECKS PASSED
```

If the check reports `WRONG MANUFACTURER DEPLOYED`, do not start the frontend. Recheck `.env` and run the setup command from this project root.

## 5. Start or restart the frontend

Stop any old Vite process with Ctrl+C. Then from the repository root:

```bash
npm run frontend:dev
```

Open the new Vite URL, switch MetaMask to Hardhat Local (chain ID `31337`, RPC `http://127.0.0.1:8545`), select the exact address entered in `.env`, and connect again. My Inventory should show the product registration form.

## 6. Why a fresh deployment is required

The previous contracts have immutable constructor state. Editing `.env` does not change an already-deployed Manufacturer role. Running `npm run setup:local:existing` deploys a new registry and supply-chain contract pair and updates `frontend/src/deployment.json` and both ABI files. The frontend must be restarted after this config is rewritten. The old contracts remain on the local node but the frontend manifest points to the new pair.

Restarting the Hardhat node erases its in-memory chain state. If you restart it, run the setup command again. This workflow is only for local Hardhat chain ID `31337`, not Sepolia or Mainnet.
