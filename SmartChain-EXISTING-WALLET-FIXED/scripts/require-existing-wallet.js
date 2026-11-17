const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { getAddress, ZeroAddress } = require('ethers');

const raw = (process.env.LOCAL_MANUFACTURER_ADDRESS || '').trim();
if (!raw) {
  console.error(`LOCAL_MANUFACTURER_ADDRESS is not set.\n\nCreate a project-root .env file (copy .env.example) and set:\nLOCAL_MANUFACTURER_ADDRESS=0xYourFullMetaMaskPublicAddress\n\nUse the full 42-character public address, not the shortened address shown by MetaMask. Never paste a private key or recovery phrase.`);
  process.exit(1);
}
try {
  const address = getAddress(raw);
  if (address === ZeroAddress) throw new Error('Zero address is not allowed.');
  console.log(`Existing MetaMask Manufacturer selected: ${address}`);
  console.log('This setup will deploy a fresh local contract pair and assign this exact address the Manufacturer role.');
} catch (error) {
  console.error(`LOCAL_MANUFACTURER_ADDRESS is invalid: ${error.message}`);
  process.exit(1);
}
