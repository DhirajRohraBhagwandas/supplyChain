const fs = require('fs');
const path = require('path');
const hre = require('hardhat');
const { getLocalManufacturerSigner } = require('./lib/local-manufacturer');

const ROLE_NAMES = [
  'Manufacturer', 'First Conveyance', 'National Storage', 'Second Conveyance',
  'Provincial Storage', 'Third Conveyance', 'District Storage',
  'Fourth Conveyance', 'Hospital', 'Patient'
];

const sameAddress = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

async function main() {
  const root = path.resolve(__dirname, '..');
  const deploymentPath = path.join(root, 'deployments', `${hre.network.name}.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`No deployment manifest for ${hre.network.name}. Run npm run deploy:local first.`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const net = await hre.ethers.provider.getNetwork();
  if (Number(net.chainId) !== Number(deployment.chainId)) {
    throw new Error(`Wrong RPC chain. Manifest says ${deployment.chainId}, connected RPC says ${net.chainId}.`);
  }
  if (hre.network.name === 'localhost' && Number(net.chainId) !== 31337) {
    throw new Error('Local demo requires Hardhat chain ID 31337.');
  }

  const localSigners = await hre.ethers.getSigners();
  const manufacturerAddress = deployment.manufacturer || deployment.deployer;
  const knownManufacturer = localSigners.find((signer) => sameAddress(signer.address, manufacturerAddress));
  let manufacturer = knownManufacturer;
  if (!manufacturer) {
    // Seed a custom MetaMask Manufacturer using Hardhat's local-only impersonation.
    // The frontend itself uses the user's real MetaMask signature for normal actions.
    manufacturer = await getLocalManufacturerSigner(manufacturerAddress);
  }
  const participants = localSigners.filter((signer) => !sameAddress(signer.address, manufacturerAddress)).slice(0, 9);
  if (participants.length < 9) {
    throw new Error('The demo requires nine additional local participant accounts besides the Manufacturer.');
  }

  const registryCode = await hre.ethers.provider.getCode(deployment.participantRegistry);
  const supplyChainCode = await hre.ethers.provider.getCode(deployment.supplyChain);
  if (registryCode === '0x' || supplyChainCode === '0x') {
    throw new Error('No contract bytecode at the saved addresses. The local node may have restarted; run npm run deploy:local first.');
  }

  const registry = await hre.ethers.getContractAt('ParticipantRegistry', deployment.participantRegistry, manufacturer);
  const supplyChain = await hre.ethers.getContractAt('SmartChainSupplyChain', deployment.supplyChain, manufacturer);
  if (!sameAddress(await registry.owner(), deployment.deployer)) {
    throw new Error('ParticipantRegistry administrator does not match the deployment manifest. Deploy a fresh local instance.');
  }
  const manufacturerRecord = await registry.getParticipant(manufacturerAddress);
  if (!manufacturerRecord.active || Number(manufacturerRecord.role) !== 1) {
    throw new Error(`Configured Manufacturer ${manufacturerAddress} is not registered with role 1 in this deployment.`);
  }
  if (!sameAddress(await registry.supplyChainManager(), deployment.supplyChain)) {
    throw new Error('ParticipantRegistry manager does not match the deployed SupplyChain contract. Redeploy the contracts.');
  }
  if (!sameAddress(await supplyChain.registry(), deployment.participantRegistry)) {
    throw new Error('SupplyChain is connected to a different ParticipantRegistry than the deployment manifest.');
  }

  const accounts = [{ role: ROLE_NAMES[0], address: manufacturerAddress }];
  let parent = manufacturer;

  for (let i = 0; i < 9; i++) {
    const account = participants[i];
    const expectedRole = i + 2;
    const current = await registry.getParticipant(account.address);

    if (current.active) {
      if (Number(current.role) !== expectedRole || !sameAddress(current.parent, parent.address) ||
          !(await registry.isDirectConnection(parent.address, account.address))) {
        throw new Error(
          `${ROLE_NAMES[i + 1]} account ${account.address} is already registered with a different role/parent. ` +
          'Use a fresh Hardhat node or correct the participant route before seeding.'
        );
      }
    } else {
      if (await registry.hasEverRegistered(account.address)) {
        throw new Error(
          `${ROLE_NAMES[i + 1]} account ${account.address} was previously registered and removed. ` +
          'Use a fresh Hardhat node for a clean demo seed.'
        );
      }
      await (await registry.connect(parent).addParticipant(
        account.address,
        expectedRole,
        ROLE_NAMES[i + 1],
        `${ROLE_NAMES[i + 1].toLowerCase().replaceAll(' ', '.')}@demo.example`
      )).wait();
    }

    accounts.push({ role: ROLE_NAMES[i + 1], address: account.address });
    parent = account;
  }

  const productId = hre.ethers.id('SMARTCHAIN-DEMO-VACCINE-001');
  if (!(await supplyChain.productExists(productId))) {
    const block = await hre.ethers.provider.getBlock('latest');
    await (await supplyChain.registerProduct(
      productId, 'Demo Cold-Chain Vaccine', 'DEMO-VAX-001', 500,
      block.timestamp + 180 * 24 * 60 * 60, 2, 8, 65
    )).wait();
  } else {
    const product = await supplyChain.getProduct(productId);
    if (product.name !== 'Demo Cold-Chain Vaccine' || product.batchNumber !== 'DEMO-VAX-001') {
      throw new Error('The reserved demo product ID already exists with unexpected data. Use a fresh local chain.');
    }
  }

  const currentBalance = await supplyChain.walletBalance(manufacturer.address);
  const feeWei = await supplyChain.transferFeeWei();
  const demoFundingTarget = hre.ethers.parseEther('0.02') > feeWei * 2n
    ? hre.ethers.parseEther('0.02')
    : feeWei * 2n;
  if (currentBalance < demoFundingTarget) {
    await (await supplyChain.deposit({ value: demoFundingTarget - currentBalance })).wait();
  }

  const output = {
    network: hre.network.name,
    chainId: Number(net.chainId),
    deployedAt: deployment.deployedAt,
    deployer: deployment.deployer,
    manufacturer: manufacturerAddress,
    participantRegistry: deployment.participantRegistry,
    supplyChain: deployment.supplyChain,
    productId,
    transferFeeWei: (await supplyChain.transferFeeWei()).toString(),
    participants: accounts
  };
  const outDir = path.join(root, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'demo-accounts.json'), JSON.stringify(output, null, 2));

  console.log('\nDemo participants and vaccine product are ready.');
  console.log(JSON.stringify(output, null, 2));
  console.log('\nNext: npm run check:local (and npm run check:local:existing when using LOCAL_MANUFACTURER_ADDRESS).');
}

main().catch((error) => {
  console.error(`\nDemo seed failed: ${error.shortMessage || error.message || error}`);
  process.exitCode = 1;
});
