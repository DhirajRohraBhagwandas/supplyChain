require('@nomicfoundation/hardhat-toolbox');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const networks = {
  hardhat: { chainId: 31337 },
  localhost: { url: 'http://127.0.0.1:8545', chainId: 31337 }
};

// Do not register an HTTP network with an empty URL. Hardhat validates every
// network definition when loading the config, which can otherwise break even
// local compile/test commands when Sepolia credentials are not configured.
const sepoliaRpcUrl = (process.env.SEPOLIA_RPC_URL || '').trim();
const sepoliaPrivateKey = (process.env.PRIVATE_KEY || '').trim();
const hasUsableSepoliaUrl = /^https?:\/\/.+/.test(sepoliaRpcUrl) && !sepoliaRpcUrl.includes('YOUR_PROJECT_ID');
const hasUsableSepoliaKey = /^0x[0-9a-fA-F]{64}$/.test(sepoliaPrivateKey);
if (hasUsableSepoliaUrl) {
  networks.sepolia = {
    url: sepoliaRpcUrl,
    chainId: 11155111,
    accounts: hasUsableSepoliaKey ? [sepoliaPrivateKey] : []
  };
}

module.exports = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 300 }, viaIR: true }
  },
  networks,
  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
    currency: 'USD'
  }
};
