const { expect } = require('chai');
const { ethers } = require('hardhat');

const Role = {
  Manufacturer: 1,
  FirstConveyance: 2,
  NationalStorage: 3,
  SecondConveyance: 4,
  ProvincialStorage: 5,
  ThirdConveyance: 6,
  DistrictStorage: 7,
  FourthConveyance: 8,
  Hospital: 9,
  Patient: 10
};

async function futureExpiry() {
  const block = await ethers.provider.getBlock('latest');
  return block.timestamp + 60 * 60 * 24 * 180;
}

describe('SmartChainSupplyChain', function () {
  let owner, manufacturer, carrier1, national, carrier2, provincial, carrier3, district, carrier4, hospital, patient, outsider, oracle;
  let registry, chain;
  const fee = 1000n;
  const productId = ethers.id('VAX-LOT-0001');

  async function add(parent, account, role, name) {
    await registry.connect(parent).addParticipant(account.address, role, name, `${name.toLowerCase().replaceAll(' ', '.')}@example.test`);
  }

  async function register() {
    await chain.connect(manufacturer).registerProduct(
      productId, 'Temperature-Sensitive Vaccine', 'BATCH-0001', 250,
      await futureExpiry(), 2, 8, 65
    );
  }

  async function buildRoute() {
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    await add(carrier1, national, Role.NationalStorage, 'National Storage');
    await add(national, carrier2, Role.SecondConveyance, 'Second Carrier');
    await add(carrier2, provincial, Role.ProvincialStorage, 'Provincial Storage');
    await add(provincial, carrier3, Role.ThirdConveyance, 'Third Carrier');
    await add(carrier3, district, Role.DistrictStorage, 'District Storage');
    await add(district, carrier4, Role.FourthConveyance, 'Fourth Carrier');
    await add(carrier4, hospital, Role.Hospital, 'City Hospital');
    await add(hospital, patient, Role.Patient, 'Patient');
  }

  beforeEach(async function () {
    [owner, manufacturer, carrier1, national, carrier2, provincial, carrier3, district, carrier4, hospital, patient, outsider, oracle] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory('ParticipantRegistry', owner);
    registry = await Registry.deploy('Acme Pharma', 'demo@acme.example', owner.address);
    await registry.waitForDeployment();
    // The registry deployer is the first manufacturer. Use that account as the
    // manufacturer for this fixture, with owner retained as the administrator.
    manufacturer = owner;
    const SupplyChain = await ethers.getContractFactory('SmartChainSupplyChain', owner);
    chain = await SupplyChain.deploy(await registry.getAddress(), oracle.address);
    await chain.waitForDeployment();
    await registry.setSupplyChainManager(await chain.getAddress());
    await chain.setTransferFee(fee);
  });

  it('registers the deployer as the manufacturer by default', async function () {
    const p = await registry.getParticipant(manufacturer.address);
    expect(p.active).to.equal(true);
    expect(p.role).to.equal(Role.Manufacturer);
  });

  it('can assign the Manufacturer role to a separate existing wallet address', async function () {
    const Registry = await ethers.getContractFactory('ParticipantRegistry', owner);
    const customRegistry = await Registry.deploy('Custom Manufacturer', 'custom@example.test', outsider.address);
    await customRegistry.waitForDeployment();
    expect(await customRegistry.owner()).to.equal(owner.address);
    const manufacturerRecord = await customRegistry.getParticipant(outsider.address);
    expect(manufacturerRecord.active).to.equal(true);
    expect(manufacturerRecord.role).to.equal(Role.Manufacturer);
    const deployerRecord = await customRegistry.getParticipant(owner.address);
    expect(deployerRecord.active).to.equal(false);
  });

  it('allows only the next role to be onboarded', async function () {
    await expect(registry.connect(manufacturer).addParticipant(outsider.address, Role.Hospital, 'Invalid', 'x@example.test'))
      .to.be.revertedWithCustomError(registry, 'InvalidNextRole');
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    expect(await registry.isDirectConnection(manufacturer.address, carrier1.address)).to.equal(true);
  });

  it('prevents an unregistered account from onboarding participants', async function () {
    await expect(registry.connect(outsider).addParticipant(carrier1.address, Role.FirstConveyance, 'Carrier', 'x@example.test'))
      .to.be.revertedWithCustomError(registry, 'NotParticipant');
  });

  it('prevents duplicate participant registration', async function () {
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    await expect(add(manufacturer, carrier1, Role.FirstConveyance, 'Duplicate'))
      .to.be.revertedWithCustomError(registry, 'AlreadyRegistered');
  });

  it('allows only the manufacturer to register products', async function () {
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    await expect(chain.connect(carrier1).registerProduct(productId, 'Vaccine', 'B1', 1, await futureExpiry(), 2, 8, 65))
      .to.be.revertedWithCustomError(chain, 'NotManufacturer');
  });

  it('registers a product and places it in the manufacturer inventory', async function () {
    await register();
    const p = await chain.getProduct(productId);
    expect(p.name).to.equal('Temperature-Sensitive Vaccine');
    expect(p.currentOwner).to.equal(manufacturer.address);
    expect(p.status).to.equal(1);
    expect(await chain.getInventoryOf(manufacturer.address)).to.deep.equal([productId]);
  });

  it('rejects duplicate product identifiers', async function () {
    await register();
    await expect(register()).to.be.revertedWithCustomError(chain, 'ProductAlreadyExists');
  });

  it('rejects invalid product quantities and temperature ranges', async function () {
    await expect(chain.registerProduct(productId, 'Vaccine', 'B1', 0, await futureExpiry(), 2, 8, 65))
      .to.be.revertedWithCustomError(chain, 'InvalidProductData');
    await expect(chain.registerProduct(productId, 'Vaccine', 'B1', 1, await futureExpiry(), 10, 2, 65))
      .to.be.revertedWithCustomError(chain, 'InvalidProductData');
  });

  it('transfers ownership only to a directly connected participant', async function () {
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    await register();
    await chain.deposit({ value: 3000n });
    await chain.transferProduct(productId, carrier1.address);
    expect((await chain.getProduct(productId)).currentOwner).to.equal(carrier1.address);
    expect(await chain.getInventoryOf(manufacturer.address)).to.deep.equal([]);
    expect(await chain.getInventoryOf(carrier1.address)).to.deep.equal([productId]);
  });

  it('rejects a transfer that skips a participant', async function () {
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    await add(carrier1, national, Role.NationalStorage, 'National Storage');
    await register();
    await chain.deposit({ value: 3000n });
    await expect(chain.transferProduct(productId, national.address)).to.be.revertedWithCustomError(chain, 'NotDirectlyConnected');
  });

  it('deducts the transfer fee from sender wallet and credits the receiver', async function () {
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    await register();
    await chain.deposit({ value: 2000n });
    await chain.transferProduct(productId, carrier1.address);
    expect(await chain.walletBalance(manufacturer.address)).to.equal(1000n);
    expect(await chain.walletBalance(carrier1.address)).to.equal(1000n);
  });

  it('rejects transfers when the sender wallet is underfunded', async function () {
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    await register();
    await expect(chain.transferProduct(productId, carrier1.address)).to.be.revertedWithCustomError(chain, 'InsufficientWalletBalance');
  });

  it('accepts sensor reports only from the configured oracle', async function () {
    await register();
    await expect(chain.connect(outsider).reportSensorData(productId, 5, 45, false, 'test'))
      .to.be.revertedWithCustomError(chain, 'NotOracle');
  });

  it('marks a product unhealthy when a temperature threshold is breached', async function () {
    await register();
    await chain.connect(oracle).reportSensorData(productId, 12, 45, false, 'Temperature excursion');
    expect((await chain.getProduct(productId)).status).to.equal(3);
  });

  it('marks a product damaged when the physical-damage flag is set', async function () {
    await register();
    await chain.connect(oracle).reportSensorData(productId, 5, 45, true, 'Impact detected');
    expect((await chain.getProduct(productId)).status).to.equal(2);
  });

  it('does not silently clear an unhealthy status after a normal sensor reading', async function () {
    await register();
    await chain.connect(oracle).reportSensorData(productId, 12, 45, false, 'Out of range');
    await chain.connect(oracle).reportSensorData(productId, 5, 45, false, 'Back to normal');
    expect((await chain.getProduct(productId)).status).to.equal(3);
  });

  it('blocks an unhealthy product from moving forward', async function () {
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    await register();
    await chain.deposit({ value: 2000n });
    await chain.connect(oracle).reportSensorData(productId, 15, 45, false, 'Temperature excursion');
    await expect(chain.transferProduct(productId, carrier1.address)).to.be.revertedWithCustomError(chain, 'ProductNotHealthy');
  });

  it('records product history for registration, sensor reports and transfers', async function () {
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    await register();
    await chain.connect(oracle).reportSensorData(productId, 5, 45, false, 'Normal reading');
    await chain.deposit({ value: 2000n });
    await chain.transferProduct(productId, carrier1.address);
    const history = await chain.getProductHistory(productId);
    expect(history.length).to.equal(3);
    expect(history[0].action).to.equal(0);
    expect(history[2].action).to.equal(1);
  });

  it('supports reverse transfers through the exact previous-owner path', async function () {
    await buildRoute();
    await register();
    await chain.deposit({ value: 10000n });
    await chain.transferProduct(productId, carrier1.address);
    await chain.connect(carrier1).transferProduct(productId, national.address);
    await chain.connect(national).setProductForReturn(productId, manufacturer.address);
    await chain.connect(national).returnTransfer(productId, carrier1.address);
    await chain.connect(carrier1).returnTransfer(productId, manufacturer.address);
    const p = await chain.getProduct(productId);
    expect(p.currentOwner).to.equal(manufacturer.address);
    expect(p.status).to.equal(4);
    expect(p.isReturning).to.equal(false);
    expect(await chain.activeProductRouteReferences(manufacturer.address)).to.equal(0);
    expect(await chain.activeProductRouteReferences(carrier1.address)).to.equal(0);
  });

  it('does not allow a return transfer to skip a checkpoint', async function () {
    await buildRoute();
    await register();
    await chain.deposit({ value: 10000n });
    await chain.transferProduct(productId, carrier1.address);
    await chain.connect(carrier1).transferProduct(productId, national.address);
    await chain.connect(national).setProductForReturn(productId, manufacturer.address);
    await expect(chain.connect(national).returnTransfer(productId, manufacturer.address))
      .to.be.revertedWithCustomError(chain, 'InvalidReturnLocation');
  });

  it('blocks forward transfers after a return is initiated', async function () {
    await buildRoute();
    await register();
    await chain.deposit({ value: 10000n });
    await chain.transferProduct(productId, carrier1.address);
    await chain.connect(carrier1).setProductForReturn(productId, manufacturer.address);
    await expect(chain.connect(carrier1).transferProduct(productId, national.address))
      .to.be.revertedWithCustomError(chain, 'ProductIsReturning');
  });

  it('prevents participants with inventory from being removed', async function () {
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    await register();
    await chain.deposit({ value: 2000n });
    await chain.transferProduct(productId, carrier1.address);
    await expect(chain.removeParticipant(carrier1.address)).to.be.revertedWithCustomError(chain, 'ParticipantHasInventory');
  });


  it('prevents removal of an empty checkpoint while a product route still references it', async function () {
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    await add(carrier1, national, Role.NationalStorage, 'National Storage');
    await register();
    await chain.deposit({ value: 3000n });
    await chain.transferProduct(productId, carrier1.address);
    await chain.connect(carrier1).transferProduct(productId, national.address);
    await expect(chain.removeParticipant(carrier1.address))
      .to.be.revertedWithCustomError(chain, 'ParticipantHasActiveProductRoute');
  });

  it('allows a parent to remove an empty child participant', async function () {
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    await chain.removeParticipant(carrier1.address);
    expect(await registry.isActive(carrier1.address)).to.equal(false);
  });

  it('does not allow a participant with active children to be removed', async function () {
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    await add(carrier1, national, Role.NationalStorage, 'National Storage');
    await expect(chain.removeParticipant(carrier1.address))
      .to.be.revertedWithCustomError(registry, 'HasChildren');
  });

  it('does not allow a removed address to be registered again under another role or parent', async function () {
    await add(manufacturer, carrier1, Role.FirstConveyance, 'First Carrier');
    await chain.removeParticipant(carrier1.address);
    await expect(add(manufacturer, carrier1, Role.FirstConveyance, 'Re-enrolled Carrier'))
      .to.be.revertedWithCustomError(registry, 'AlreadyRegistered');
  });

  it('rejects withdrawal above the internal wallet balance', async function () {
    await expect(chain.withdraw(1n)).to.be.revertedWithCustomError(chain, 'InsufficientWalletBalance');
  });

  it('credits a deposit exactly once and matches escrow liabilities', async function () {
    await chain.deposit({ value: 5000n });
    expect(await chain.walletBalance(manufacturer.address)).to.equal(5000n);
    expect(await chain.totalEscrowed()).to.equal(5000n);
    const solvency = await chain.getEscrowSolvency();
    expect(solvency.contractBalance).to.equal(5000n);
    expect(solvency.liabilities).to.equal(5000n);
    expect(solvency.solvent).to.equal(true);
  });

  it('allows deposits and withdrawals while keeping escrow accounting solvent', async function () {
    await chain.deposit({ value: 5000n });
    await chain.withdraw(2000n);
    expect(await chain.walletBalance(manufacturer.address)).to.equal(3000n);
    const solvency = await chain.getEscrowSolvency();
    expect(solvency.solvent).to.equal(true);
    expect(solvency.liabilities).to.equal(3000n);
  });
});
