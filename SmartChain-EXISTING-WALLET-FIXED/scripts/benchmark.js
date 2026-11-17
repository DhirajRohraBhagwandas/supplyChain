const fs = require('fs');
const path = require('path');
const { ethers } = require('hardhat');

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length < 10) throw new Error('The benchmark requires at least 10 funded local signers.');
  const [manufacturer, ...route] = signers;
  const rows = [];
  const record = async (label, txPromise) => {
    const tx = await txPromise;
    const receipt = await tx.wait();
    rows.push({ operation: label, gasUsed: receipt.gasUsed.toString(), transactionHash: receipt.hash, blockNumber: receipt.blockNumber });
  };

  const Registry = await ethers.getContractFactory('ParticipantRegistry', manufacturer);
  const registry = await Registry.deploy('Benchmark Pharma', 'benchmark@example.test', manufacturer.address);
  await registry.waitForDeployment();
  rows.push({ operation: 'deploy_participant_registry', gasUsed: (await registry.deploymentTransaction().wait()).gasUsed.toString(), transactionHash: registry.deploymentTransaction().hash, blockNumber: '' });

  const SupplyChain = await ethers.getContractFactory('SmartChainSupplyChain', manufacturer);
  const supplyChain = await SupplyChain.deploy(await registry.getAddress(), manufacturer.address);
  await supplyChain.waitForDeployment();
  rows.push({ operation: 'deploy_supply_chain', gasUsed: (await supplyChain.deploymentTransaction().wait()).gasUsed.toString(), transactionHash: supplyChain.deploymentTransaction().hash, blockNumber: '' });
  await record('configure_registry_manager', registry.setSupplyChainManager(await supplyChain.getAddress()));
  await record('configure_transfer_fee', supplyChain.setTransferFee(1000n));

  const roles = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  let parent = manufacturer;
  for (let i = 0; i < roles.length; i++) {
    const account = route[i];
    await record(`add_participant_role_${roles[i]}`, registry.connect(parent).addParticipant(
      account.address, roles[i], `Benchmark Participant ${roles[i]}`, `p${roles[i]}@example.test`
    ));
    parent = account;
  }

  const productId = ethers.id(`SMARTCHAIN-BENCH-${Date.now()}`);
  const latest = await ethers.provider.getBlock('latest');
  await record('register_product', supplyChain.registerProduct(
    productId, 'Benchmark Vaccine', 'BENCH-001', 100, latest.timestamp + 86400 * 180, 2, 8, 65
  ));
  await record('deposit_wallet', supplyChain.deposit({ value: 30000n }));

  let current = manufacturer;
  for (let i = 0; i < route.length; i++) {
    await record(`forward_transfer_${i + 1}`, supplyChain.connect(current).transferProduct(productId, route[i].address));
    current = route[i];
  }

  await record('sensor_report', supplyChain.reportSensorData(productId, 5, 45, false, 'Benchmark normal reading'));
  await record('mark_for_return', supplyChain.connect(route[route.length - 1]).setProductForReturn(productId, manufacturer.address));

  for (let i = route.length - 1; i >= 0; i--) {
    const receiver = i === 0 ? manufacturer : route[i - 1];
    await record(`reverse_transfer_${route.length - i}`, supplyChain.connect(route[i]).returnTransfer(productId, receiver.address));
  }

  await record('withdraw_wallet', supplyChain.withdraw(10000n));

  const outDir = path.join(__dirname, '..', 'results', 'gas-reports');
  fs.mkdirSync(outDir, { recursive: true });
  const csv = ['operation,gasUsed,transactionHash,blockNumber', ...rows.map((r) => `${r.operation},${r.gasUsed},${r.transactionHash},${r.blockNumber}`)].join('\n');
  fs.writeFileSync(path.join(outDir, 'local-gas.csv'), `${csv}\n`);
  fs.writeFileSync(path.join(outDir, 'local-gas.json'), JSON.stringify({ network: 'hardhat-ephemeral', note: 'Local execution gas only; not a public-testnet fee or latency benchmark.', rows }, null, 2));
  console.log(`Recorded ${rows.length} gas measurements in results/gas-reports/.`);
  console.table(rows.map(({ operation, gasUsed }) => ({ operation, gasUsed })));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
