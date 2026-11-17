import { BrowserProvider, Contract, JsonRpcProvider, keccak256, toUtf8Bytes } from 'ethers';
import deployment from '../deployment.json';
import registryAbi from '../abi/ParticipantRegistry.json';
import supplyChainAbi from '../abi/SmartChainSupplyChain.json';

export const ROLE_NAMES = ['None', 'Manufacturer', 'First Conveyance', 'National Storage', 'Second Conveyance', 'Provincial Storage', 'Third Conveyance', 'District Storage', 'Fourth Conveyance', 'Hospital', 'Patient'];
export const STATUS_NAMES = ['Unknown', 'Healthy', 'Damaged', 'Temperature Excursion', 'Returned'];
export const ACTION_NAMES = ['Created', 'Forward Transfer', 'Sensor Report', 'Marked for Return', 'Return Transfer', 'Returned to Origin'];

export function requireWallet() {
  if (!window.ethereum) throw new Error('MetaMask is not installed. Install MetaMask to use this application.');
}

export async function connectWallet() {
  requireWallet();
  const provider = new BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const network = await provider.getNetwork();
  return { provider, signer, account: await signer.getAddress(), chainId: Number(network.chainId) };
}

/** Switch MetaMask to the chain configured by the deployment manifest.
 * For the default local development chain, add Hardhat Local if it is unknown.
 */
export async function switchToConfiguredNetwork() {
  requireWallet();
  const chainId = Number(deployment.chainId || 31337);
  const chainIdHex = `0x${chainId.toString(16)}`;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }]
    });
  } catch (error) {
    if (error?.code !== 4902 || chainId !== 31337) throw error;
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: chainIdHex,
        chainName: 'Hardhat Local',
        rpcUrls: ['http://127.0.0.1:8545'],
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
      }]
    });
    // Some wallet versions add the chain without selecting it; explicitly switch after adding.
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }]
    });
  }
  return connectWallet();
}

export function getReadProvider() {
  const rpcUrl = import.meta.env.VITE_RPC_URL || 'http://127.0.0.1:8545';
  return new JsonRpcProvider(rpcUrl);
}

export async function getContracts(signerOrProvider) {
  const registryAddress = deployment.participantRegistry;
  const supplyChainAddress = deployment.supplyChain;
  const isAddress = (value) => /^0x[0-9a-fA-F]{40}$/.test(value || '');

  if (!isAddress(registryAddress) || !isAddress(supplyChainAddress) ||
      /^0x0{40}$/i.test(registryAddress) || /^0x0{40}$/i.test(supplyChainAddress)) {
    throw new Error('SmartChain contracts are not deployed. From the project root run: npm run deploy:local, then npm run seed:local.');
  }
  if (!Array.isArray(registryAbi) || registryAbi.length === 0 ||
      !Array.isArray(supplyChainAbi) || supplyChainAbi.length === 0) {
    throw new Error('Contract ABI files are empty. Run npm run compile and npm run deploy:local from the project root.');
  }

  // In ethers v6 a Signer exposes its provider at `.provider`; getNetwork/getCode
  // belong to the provider, not to the signer. Keep the original signer attached
  // to Contract so state-changing calls still prompt MetaMask for signatures.
  const provider = signerOrProvider?.provider || signerOrProvider;
  if (!provider || typeof provider.getNetwork !== 'function' || typeof provider.getCode !== 'function') {
    throw new Error('A valid ethers Provider or Signer connected to a provider is required. Reconnect MetaMask and try again.');
  }

  const network = await provider.getNetwork();
  if (deployment.chainId && Number(network.chainId) !== Number(deployment.chainId)) {
    throw new Error(`Wrong network. SmartChain is configured for chain ID ${deployment.chainId}, but the connected provider is on ${network.chainId}.`);
  }

  const [registryCode, supplyChainCode] = await Promise.all([
    provider.getCode(registryAddress), provider.getCode(supplyChainAddress)
  ]);
  if (registryCode === '0x' || supplyChainCode === '0x') {
    throw new Error('No contract bytecode found at the saved addresses. The local Hardhat node may have restarted. Run npm run deploy:local and npm run seed:local again.');
  }

  return {
    registry: new Contract(registryAddress, registryAbi, signerOrProvider),
    supplyChain: new Contract(supplyChainAddress, supplyChainAbi, signerOrProvider)
  };
}

export function makeProductId(batchNumber) {
  return keccak256(toUtf8Bytes(`${batchNumber}:${Date.now()}:${crypto.randomUUID()}`));
}

export function formatEth(value) {
  return Number(value) / 1e18;
}

export function shortAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—';
}

export { deployment };
