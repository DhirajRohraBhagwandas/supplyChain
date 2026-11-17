const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

const ROLE_NAMES = [
  'Manufacturer', 'First Conveyance', 'National Storage', 'Second Conveyance',
  'Provincial Storage', 'Third Conveyance', 'District Storage',
  'Fourth Conveyance', 'Hospital', 'Patient'
];
const sameAddress = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

async function main() {
  const root = path.resolve(__dirname, '..');
  const manifestPath = path.join(root, 'deployments', `${hre.network.name}.json`);
  const demoPath = path.join(root, 'results', 'demo-accounts.json');

  if (hre.network.name !== 'localhost') {
    throw new Error(`Run this check with the localhost network. Current Hardhat network: ${hre.network.name}.`);
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Deployment manifest is missing. Run npm run deploy:local first.');
  }
  if (!fs.existsSync(demoPath)) {
    throw new Error('Demo seed data is missing. Run npm run seed:local after deployment.');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const demo = JSON.parse(fs.readFileSync(demoPath, 'utf8'));
  const manufacturerAddress = manifest.manufacturer || manifest.deployer;
  const frontendRoot = path.join(root, 'frontend', 'src');
  const frontendDeploymentPath = path.join(frontendRoot, 'deployment.json');
  const registryAbiPath = path.join(frontendRoot, 'abi', 'ParticipantRegistry.json');
  const supplyChainAbiPath = path.join(frontendRoot, 'abi', 'SmartChainSupplyChain.json');
  for (const file of [frontendDeploymentPath, registryAbiPath, supplyChainAbiPath]) {
    if (!fs.existsSync(file)) throw new Error(`Frontend deployment file is missing: ${file}. Run npm run deploy:local.`);
  }
  const frontendDeployment = JSON.parse(fs.readFileSync(frontendDeploymentPath, 'utf8'));
  const registryAbi = JSON.parse(fs.readFileSync(registryAbiPath, 'utf8'));
  const supplyChainAbi = JSON.parse(fs.readFileSync(supplyChainAbiPath, 'utf8'));
  if (Number(frontendDeployment.chainId) !== Number(manifest.chainId) ||
      !sameAddress(frontendDeployment.deployer, manifest.deployer) ||
      !sameAddress(frontendDeployment.manufacturer || frontendDeployment.deployer, manifest.manufacturer || manifest.deployer) ||
      !sameAddress(frontendDeployment.participantRegistry, manifest.participantRegistry) ||
      !sameAddress(frontendDeployment.supplyChain, manifest.supplyChain)) {
    throw new Error('Frontend deployment.json is stale or does not match deployments/localhost.json. Run npm run deploy:local.');
  }
  const hasFunctions = (abi, names) => Array.isArray(abi) && names.every((name) =>
    abi.some((entry) => entry.type === 'function' && entry.name === name)
  );
  if (!hasFunctions(registryAbi, ['getParticipant', 'getChildren', 'addParticipant', 'hasEverRegistered']) ||
      !hasFunctions(supplyChainAbi, [
        'registerProduct', 'transferProduct', 'setProductForReturn', 'returnTransfer',
        'reportSensorData', 'deposit', 'withdraw', 'getProduct', 'getProductHistory',
        'getInventoryOf', 'sensorOracle', 'walletBalance'
      ])) {
    throw new Error('Frontend contract ABI files are empty or incomplete. Run npm run compile and npm run deploy:local.');
  }
  const net = await hre.ethers.provider.getNetwork();
  console.log(`Connected RPC chain ID: ${net.chainId}`);
  console.log(`Deployment chain ID:   ${manifest.chainId}`);

  if (Number(net.chainId) !== 31337 || Number(manifest.chainId) !== 31337 || Number(net.chainId) !== Number(manifest.chainId)) {
    throw new Error('Expected a Hardhat Local chain with ID 31337. Check the node and localhost RPC URL.');
  }
  if (demo.network !== 'localhost' || demo.chainId !== 31337 || !sameAddress(demo.deployer, manifest.deployer)) {
    throw new Error('Demo seed file does not match the current deployment. Run npm run seed:local again.');
  }

  const registryCode = await hre.ethers.provider.getCode(manifest.participantRegistry);
  const supplyChainCode = await hre.ethers.provider.getCode(manifest.supplyChain);
  if (registryCode === '0x' || supplyChainCode === '0x') {
    throw new Error('Saved addresses have no bytecode on this node. The Hardhat node may have restarted. Run deploy:local and seed:local again.');
  }

  const registry = await hre.ethers.getContractAt('ParticipantRegistry', manifest.participantRegistry);
  const supplyChain = await hre.ethers.getContractAt('SmartChainSupplyChain', manifest.supplyChain);
  const [registryOwner, manager, linkedRegistry, oracle] = await Promise.all([
    registry.owner(), registry.supplyChainManager(), supplyChain.registry(), supplyChain.sensorOracle()
  ]);

  if (!sameAddress(registryOwner, manifest.deployer)) throw new Error('Registry owner and saved deployer do not match.');
  if (!sameAddress(manager, manifest.supplyChain)) throw new Error('Registry manager is not the deployed SupplyChain contract.');
  if (!sameAddress(linkedRegistry, manifest.participantRegistry)) throw new Error('SupplyChain points to a different ParticipantRegistry.');
  if (!sameAddress(oracle, manifest.sensorOracle)) throw new Error('Sensor oracle and deployment manifest do not match.');

  console.log(`Deployment admin:      ${manifest.deployer}`);
  console.log(`Manufacturer wallet:   ${manufacturerAddress}`);
  console.log(`Registry:              ${manifest.participantRegistry}`);
  console.log(`Supply chain:          ${manifest.supplyChain}`);
  console.log(`Sensor oracle:         ${oracle}`);

  if (!Array.isArray(demo.participants) || demo.participants.length !== 10 ||
      !sameAddress(demo.manufacturer || demo.deployer, manufacturerAddress) ||
      !sameAddress(demo.participantRegistry, manifest.participantRegistry) ||
      !sameAddress(demo.supplyChain, manifest.supplyChain) ||
      !sameAddress(demo.participants[0].address, manufacturerAddress)) {
    throw new Error('Demo account mapping is incomplete or does not match this deployment. Re-run npm run seed:local.');
  }

  console.log('\nParticipant route:');
  for (let i = 0; i < demo.participants.length; i++) {
    const item = demo.participants[i];
    if (item.role !== ROLE_NAMES[i]) throw new Error(`Demo role mapping at account index ${i} should be ${ROLE_NAMES[i]}.`);
    const record = await registry.getParticipant(item.address);
    const expectedParent = i === 0 ? hre.ethers.ZeroAddress : demo.participants[i - 1].address;
    if (!record.active || Number(record.role) !== i + 1 || !sameAddress(record.parent, expectedParent)) {
      throw new Error(`${item.role} is not active with the expected role/parent. Re-run seed:local or redeploy a clean chain.`);
    }
    if (i > 0 && !(await registry.isDirectConnection(expectedParent, item.address))) {
      throw new Error(`Missing direct participant link: ${demo.participants[i - 1].role} -> ${item.role}.`);
    }
    console.log(`  PASS ${item.role.padEnd(22)} ${item.address}`);
  }

  const productId = demo.productId;
  if (!/^0x[0-9a-fA-F]{64}$/.test(productId || '') || !(await supplyChain.productExists(productId))) {
    throw new Error('Demo vaccine is missing from this deployment. Run npm run seed:local.');
  }
  const product = await supplyChain.getProduct(productId);
  if (product.name !== 'Demo Cold-Chain Vaccine' || product.batchNumber !== 'DEMO-VAX-001') {
    throw new Error('Demo vaccine metadata does not match the expected seed record.');
  }
  if (!(await registry.isActive(product.currentOwner))) {
    throw new Error('Demo vaccine current owner is not an active participant.');
  }

  const solvency = await supplyChain.getEscrowSolvency();
  if (!solvency.solvent) throw new Error('Internal wallet escrow is insolvent.');
  console.log(`\nPASS Demo vaccine exists: ${productId}`);
  console.log(`PASS Current product owner: ${product.currentOwner}`);
  console.log(`PASS Escrow solvency: ${solvency.solvent} (liabilities ${solvency.liabilities} wei)`);
  console.log('\nALL LOCAL DEPLOYMENT CHECKS PASSED');
  console.log('Use the Manufacturer wallet address above in MetaMask on Hardhat Local (chain ID 31337).');
}

main().catch((error) => {
  console.error(`\nLOCAL CHECK FAILED: ${error.shortMessage || error.message || error}`);
  process.exitCode = 1;
});
