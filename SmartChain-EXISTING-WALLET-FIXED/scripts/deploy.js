const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  if (hre.network.name === 'sepolia') {
    if (!process.env.SEPOLIA_RPC_URL || process.env.SEPOLIA_RPC_URL.includes('YOUR_PROJECT_ID')) {
      throw new Error('Set a working SEPOLIA_RPC_URL in .env before deploying to Sepolia.');
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || '')) {
      throw new Error('Set PRIVATE_KEY to a disposable Sepolia deployer private key in .env. Never use or share a real wallet key.');
    }
  }
  const network = await hre.ethers.provider.getNetwork();
  if (hre.network.name === 'localhost' && Number(network.chainId) !== 31337) {
    throw new Error(`Local deployment requires chain ID 31337, but RPC returned ${network.chainId}.`);
  }
  if (hre.network.name === 'sepolia' && Number(network.chainId) !== 11155111) {
    throw new Error(`Sepolia deployment requires chain ID 11155111, but RPC returned ${network.chainId}.`);
  }
  const localManufacturerAddress = (process.env.LOCAL_MANUFACTURER_ADDRESS || '').trim();
  if (localManufacturerAddress && hre.network.name !== 'localhost') {
    throw new Error('LOCAL_MANUFACTURER_ADDRESS is only for the Hardhat localhost demo. Do not use it on Sepolia or mainnet.');
  }

  // Deploy contracts from the local admin signer. The Manufacturer is stored
  // separately in ParticipantRegistry, so users can use an existing MetaMask
  // address without importing a Hardhat private key or impersonating it to deploy.
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error(`No signer is available for network ${hre.network.name}. Check its account configuration.`);
  const manufacturerAddress = localManufacturerAddress
    ? hre.ethers.getAddress(localManufacturerAddress)
    : deployer.address;
  if (manufacturerAddress === hre.ethers.ZeroAddress) {
    throw new Error('LOCAL_MANUFACTURER_ADDRESS cannot be the zero address.');
  }
  if (hre.network.name === 'localhost' && manufacturerAddress !== deployer.address) {
    // Fund the user's local account with disposable test ETH for MetaMask gas.
    // This RPC changes only the local Hardhat node; it does not access the wallet key.
    const localFunding = hre.ethers.toQuantity(hre.ethers.parseEther('100'));
    await hre.ethers.provider.send('hardhat_setBalance', [manufacturerAddress, localFunding]);
    console.log(`Configured existing MetaMask address as local Manufacturer: ${manufacturerAddress}`);
  } else {
    console.log(`Configured local Manufacturer: ${manufacturerAddress}`);
  }
  const oracle = process.env.SENSOR_ORACLE_ADDRESS || manufacturerAddress;

  const Registry = await hre.ethers.getContractFactory('ParticipantRegistry', deployer);
  const registry = await Registry.deploy(
    'Demo Pharmaceutical Manufacturer', 'manufacturer@example.test', manufacturerAddress
  );
  await registry.waitForDeployment();

  const SupplyChain = await hre.ethers.getContractFactory('SmartChainSupplyChain', deployer);
  const supplyChain = await SupplyChain.deploy(await registry.getAddress(), oracle);
  await supplyChain.waitForDeployment();
  await (await registry.setSupplyChainManager(await supplyChain.getAddress())).wait();
  const initialFee = BigInt(process.env.INITIAL_TRANSFER_FEE_WEI || '10000000000000');
  await (await supplyChain.setTransferFee(initialFee)).wait();

  const deployment = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    manufacturer: manufacturerAddress,
    sensorOracle: oracle,
    participantRegistry: await registry.getAddress(),
    supplyChain: await supplyChain.getAddress(),
    transferFeeWei: initialFee.toString()
  };

  const root = path.resolve(__dirname, '..');
  const deploymentsDir = path.join(root, 'deployments');
  const frontendAbiDir = path.join(root, 'frontend', 'src', 'abi');
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.mkdirSync(frontendAbiDir, { recursive: true });
  fs.writeFileSync(path.join(deploymentsDir, `${hre.network.name}.json`), JSON.stringify(deployment, null, 2));
  fs.writeFileSync(path.join(root, 'frontend', 'src', 'deployment.json'), JSON.stringify(deployment, null, 2));

  const registryArtifact = await hre.artifacts.readArtifact('ParticipantRegistry');
  const supplyChainArtifact = await hre.artifacts.readArtifact('SmartChainSupplyChain');
  fs.writeFileSync(path.join(frontendAbiDir, 'ParticipantRegistry.json'), JSON.stringify(registryArtifact.abi, null, 2));
  fs.writeFileSync(path.join(frontendAbiDir, 'SmartChainSupplyChain.json'), JSON.stringify(supplyChainArtifact.abi, null, 2));

  console.log('\nSmartChain deployed successfully');
  console.log(JSON.stringify(deployment, null, 2));
  console.log('\nABIs and frontend deployment configuration have been generated.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
