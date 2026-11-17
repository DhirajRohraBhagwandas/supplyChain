#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

async function main() {
  const productId = process.env.PRODUCT_ID || process.argv[2];
  if (!productId || !/^0x[0-9a-fA-F]{64}$/.test(productId)) {
    throw new Error('Set PRODUCT_ID to a valid 32-byte product ID or pass it as the first argument.');
  }
  if (!process.env.SENSOR_PRIVATE_KEY) throw new Error('SENSOR_PRIVATE_KEY is required. Use a local test key only.');

  const deploymentPath = path.join(__dirname, '..', 'deployments', 'localhost.json');
  if (!fs.existsSync(deploymentPath)) throw new Error('Local deployment not found. Run npm run deploy:local first.');
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'SmartChainSupplyChain.sol', 'SmartChainSupplyChain.json');
  if (!fs.existsSync(artifactPath)) throw new Error('Contract artifact not found. Run npm run compile first.');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'http://127.0.0.1:8545');
  const oracle = new ethers.Wallet(process.env.SENSOR_PRIVATE_KEY, provider);
  if (oracle.address.toLowerCase() !== deployment.sensorOracle.toLowerCase()) {
    throw new Error(`Oracle signer ${oracle.address} does not match configured oracle ${deployment.sensorOracle}.`);
  }
  const contract = new ethers.Contract(deployment.supplyChain, artifact.abi, oracle);
  const interval = Math.max(5000, Number(process.env.SENSOR_INTERVAL_MS || 12000));
  const forceAlert = process.argv.includes('--alert');

  async function sendReading() {
    const temperature = forceAlert ? 14 : Number((4 + Math.random() * 3).toFixed(1));
    const humidity = forceAlert ? 78 : Math.floor(42 + Math.random() * 15);
    const damaged = false;
    const note = forceAlert ? 'SIMULATED ALERT: temperature/humidity outside product limits' : 'Simulated cold-chain checkpoint reading';
    const tx = await contract.reportSensorData(productId, Math.round(temperature), humidity, damaged, note);
    const receipt = await tx.wait();
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(), productId, temperatureC: temperature,
      humidityPct: humidity, physicallyDamaged: damaged,
      transactionHash: receipt.hash, blockNumber: receipt.blockNumber
    }, null, 2));
  }

  console.log(`Sensor simulator connected as ${oracle.address}. Product: ${productId}`);
  console.log(`Submitting one reading every ${interval}ms. Press Ctrl+C to stop.`);
  await sendReading();
  setInterval(() => sendReading().catch((error) => console.error('Sensor submission failed:', error.shortMessage || error.message)), interval);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
