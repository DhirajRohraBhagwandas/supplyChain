const fs = require('fs');
const path = require('path');
const hre = require('hardhat');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const sameAddress = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

async function main() {
  const root = path.resolve(__dirname, '..');
  if (hre.network.name !== 'localhost') throw new Error('Run this check on the localhost network.');
  const expectedAddress = (process.env.LOCAL_MANUFACTURER_ADDRESS || '').trim();
  if (!expectedAddress) throw new Error('LOCAL_MANUFACTURER_ADDRESS is empty in the project-root .env file.');
  const expectedManufacturer = hre.ethers.getAddress(expectedAddress);
  const expectedOracle = (process.env.SENSOR_ORACLE_ADDRESS || '').trim()
    ? hre.ethers.getAddress(process.env.SENSOR_ORACLE_ADDRESS.trim())
    : expectedManufacturer;
  const manifestPath = path.join(root, 'deployments', 'localhost.json');
  const frontendPath = path.join(root, 'frontend', 'src', 'deployment.json');
  const registryAbiPath = path.join(root, 'frontend', 'src', 'abi', 'ParticipantRegistry.json');
  const chainAbiPath = path.join(root, 'frontend', 'src', 'abi', 'SmartChainSupplyChain.json');
  for (const file of [manifestPath, frontendPath, registryAbiPath, chainAbiPath]) {
    if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run npm run setup:local:existing from the repository root.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const frontend = JSON.parse(fs.readFileSync(frontendPath, 'utf8'));
  const registryAbi = JSON.parse(fs.readFileSync(registryAbiPath, 'utf8'));
  const supplyAbi = JSON.parse(fs.readFileSync(chainAbiPath, 'utf8'));
  const network = await hre.ethers.provider.getNetwork();
  if (Number(network.chainId) !== 31337 || Number(manifest.chainId) !== 31337) throw new Error(`Expected chain 31337; RPC=${network.chainId}, manifest=${manifest.chainId}.`);
  if (!sameAddress(manifest.manufacturer, expectedManufacturer)) {
    throw new Error(`WRONG MANUFACTURER DEPLOYED. .env requests ${expectedManufacturer}, but deployments/localhost.json contains ${manifest.manufacturer || '(missing)'}. Stop here and run npm run setup:local:existing again from this project root.`);
  }
  if (!sameAddress(frontend.manufacturer, expectedManufacturer) || !sameAddress(frontend.participantRegistry, manifest.participantRegistry) || !sameAddress(frontend.supplyChain, manifest.supplyChain)) {
    throw new Error('Frontend deployment config is stale. Run npm run deploy:local from this project root.');
  }
  if (!Array.isArray(registryAbi) || registryAbi.length === 0 || !Array.isArray(supplyAbi) || supplyAbi.length === 0) throw new Error('Frontend ABI files are empty.');
  for (const address of [manifest.participantRegistry, manifest.supplyChain]) {
    if ((await hre.ethers.provider.getCode(address)) === '0x') throw new Error(`No contract bytecode at ${address}; the local node may have restarted.`);
  }
  const registry = await hre.ethers.getContractAt('ParticipantRegistry', manifest.participantRegistry);
  const supply = await hre.ethers.getContractAt('SmartChainSupplyChain', manifest.supplyChain);
  const [manufacturer, admin, manager, linkedRegistry, oracle, balance, solvency] = await Promise.all([
    registry.getParticipant(expectedManufacturer), registry.owner(), registry.supplyChainManager(),
    supply.registry(), supply.sensorOracle(), hre.ethers.provider.getBalance(expectedManufacturer), supply.getEscrowSolvency()
  ]);
  if (!manufacturer.active || Number(manufacturer.role) !== 1 || !sameAddress(manufacturer.parent, hre.ethers.ZeroAddress)) {
    throw new Error(`The selected address ${expectedManufacturer} is not active as Manufacturer (role 1).`);
  }
  if (!sameAddress(admin, manifest.deployer)) throw new Error('Registry admin does not match deployment manifest.');
  if (!sameAddress(manager, manifest.supplyChain) || !sameAddress(linkedRegistry, manifest.participantRegistry)) throw new Error('Registry/SupplyChain manager wiring is incorrect.');
  if (!sameAddress(oracle, expectedOracle)) throw new Error(`Sensor oracle is ${oracle}, expected ${expectedOracle} from .env/default Manufacturer configuration.`);
  if (balance === 0n) throw new Error('Manufacturer has no local gas balance. Run the local setup again.');
  if (!solvency.solvent) throw new Error('Escrow solvency check failed.');

  console.log('PASS RPC chain ID: 31337');
  console.log(`PASS Existing MetaMask address is Manufacturer: ${expectedManufacturer}`);
  console.log(`PASS Deployment admin: ${manifest.deployer}`);
  console.log(`PASS Registry: ${manifest.participantRegistry}`);
  console.log(`PASS SupplyChain: ${manifest.supplyChain}`);
  console.log(`PASS Local ETH balance: ${hre.ethers.formatEther(balance)} ETH`);
  console.log('PASS Frontend deployment and ABI files exist');
  console.log('PASS Sensor oracle is the configured Manufacturer');
  console.log('PASS Escrow is solvent');
  console.log('\nEXISTING METAMASK MANUFACTURER CHECKS PASSED');
}

main().catch((error) => {
  console.error(`\nEXISTING WALLET CHECK FAILED: ${error.shortMessage || error.message || error}`);
  process.exitCode = 1;
});
