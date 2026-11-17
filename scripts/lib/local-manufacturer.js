const hre = require('hardhat');

/**
 * Return a signer for the configured local Manufacturer.
 * This is deliberately restricted to the Hardhat localhost development node.
 * Hardhat impersonation avoids asking the user to export or share a private key.
 */
async function getLocalManufacturerSigner(address) {
  if (hre.network.name !== 'localhost') {
    throw new Error('LOCAL_MANUFACTURER_ADDRESS is supported only on the local Hardhat network.');
  }

  const network = await hre.ethers.provider.getNetwork();
  if (Number(network.chainId) !== 31337) {
    throw new Error(`Manufacturer override requires local chain ID 31337; received ${network.chainId}.`);
  }

  const manufacturerAddress = hre.ethers.getAddress(address);
  if (manufacturerAddress === hre.ethers.ZeroAddress) {
    throw new Error('LOCAL_MANUFACTURER_ADDRESS cannot be the zero address.');
  }

  // Set test ETH only on this disposable local Hardhat chain.
  const localFunding = hre.ethers.toQuantity(hre.ethers.parseEther('100'));
  await hre.ethers.provider.send('hardhat_setBalance', [manufacturerAddress, localFunding]);
  await hre.ethers.provider.send('hardhat_impersonateAccount', [manufacturerAddress]);

  return hre.ethers.getSigner(manufacturerAddress);
}

module.exports = { getLocalManufacturerSigner };
