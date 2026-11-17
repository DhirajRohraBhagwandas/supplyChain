import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Activity, ArrowDownLeft, ArrowLeftRight, ArrowRight, Box, CheckCircle2,
  ChevronRight, Clock3, Factory, FileSearch, LayoutDashboard, Link2,
  LoaderCircle, Package, Plus, RefreshCw, ScanLine, ShieldCheck,
  Thermometer, Truck, Wallet, XCircle
} from 'lucide-react';
import { formatEther, parseEther } from 'ethers';
import {
  ACTION_NAMES, ROLE_NAMES, STATUS_NAMES, connectWallet, getReadProvider,
  getContracts, makeProductId, shortAddress, switchToConfiguredNetwork, deployment
} from './lib/chain';

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'inventory', label: 'My inventory', icon: Package },
  { id: 'participants', label: 'Participants', icon: Truck },
  { id: 'tracking', label: 'Product tracking', icon: ScanLine },
  { id: 'operations', label: 'Operations', icon: ArrowLeftRight }
];
const EMPTY_PRODUCT = { name: '', batch: '', quantity: '100', expiryDays: '180', minTemp: '2', maxTemp: '8', maxHumidity: '65' };

function StatusPill({ status }) {
  const good = Number(status) === 1;
  const returned = Number(status) === 4;
  return <span className={`status-pill ${good ? 'good' : returned ? 'muted' : 'danger'}`}><span />{STATUS_NAMES[Number(status)] || 'Unknown'}</span>;
}

function Metric({ label, value, detail, icon: Icon, tone = 'blue' }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={19} /></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div></div>;
}

function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function App() {
  const [wallet, setWallet] = useState(null);
  const [participant, setParticipant] = useState(null);
  const [products, setProducts] = useState([]);
  const [children, setChildren] = useState([]);
  const [balance, setBalance] = useState('0');
  const [activeTab, setActiveTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [trackId, setTrackId] = useState('');
  const [tracked, setTracked] = useState(null);
  const [trackedHistory, setTrackedHistory] = useState([]);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [participantForm, setParticipantForm] = useState({ address: '', role: '2', name: '', email: '' });
  const [transferForm, setTransferForm] = useState({ productId: '', receiver: '' });
  const [returnForm, setReturnForm] = useState({ productId: '', destination: '', previousOwner: '' });
  const [sensorForm, setSensorForm] = useState({ productId: '', temperature: '5', humidity: '45', damaged: false, note: 'Routine checkpoint reading' });
  const [walletForm, setWalletForm] = useState({ deposit: '0.01', withdraw: '0.005' });
  const [isOracle, setIsOracle] = useState(false);

  const role = Number(participant?.role ?? 0);
  const isManufacturer = role === 1;
  const isRegistered = Boolean(participant?.active);
  const isCorrectNetwork = Boolean(wallet && Number(wallet.chainId) === Number(deployment.chainId));
  const networkLabel = wallet?.chainId === 11155111 ? 'Sepolia testnet' : wallet?.chainId === 31337 ? 'Local Hardhat' : wallet ? `Chain ${wallet.chainId}` : 'Not connected';
  const healthyCount = products.filter((p) => Number(p.status) === 1).length;
  const flaggedCount = products.filter((p) => [2, 3].includes(Number(p.status))).length;

  const refresh = useCallback(async (session = wallet) => {
    if (!session) return;
    const { registry, supplyChain } = await getContracts(session.provider);
    const [p, ids, bal, oracleAddress, childAddresses] = await Promise.all([
      registry.getParticipant(session.account),
      supplyChain.getInventoryOf(session.account),
      supplyChain.walletBalance(session.account),
      supplyChain.sensorOracle(),
      registry.getChildren(session.account)
    ]);
    const [records, childRecords] = await Promise.all([
      Promise.all(ids.map((id) => supplyChain.getProduct(id))),
      Promise.all(childAddresses.map(async (address) => { const child = await registry.getParticipant(address); return { address, role: child.role, name: child.name, email: child.email, active: child.active }; }))
    ]);
    setChildren(childRecords.filter((child) => child.active));
    setParticipant(p);
    setProducts(records);
    setBalance(formatEther(bal));
    setIsOracle(oracleAddress.toLowerCase() === session.account.toLowerCase());
  }, [wallet]);

  useEffect(() => {
    if (!window.ethereum) return;
    const onAccounts = () => window.location.reload();
    // Keep the page alive after a chain switch so the user can reconnect without a hard refresh.
    const onChain = () => {
      setWallet(null);
      setParticipant(null);
      setProducts([]);
      setChildren([]);
      setBalance('0');
      setNotice({ type: 'warning', text: 'Network changed. Reconnect your wallet to continue.' });
    };
    window.ethereum.on?.('accountsChanged', onAccounts);
    window.ethereum.on?.('chainChanged', onChain);
    return () => {
      window.ethereum.removeListener?.('accountsChanged', onAccounts);
      window.ethereum.removeListener?.('chainChanged', onChain);
    };
  }, []);

  const run = async (label, task) => {
    setBusy(true); setNotice(null);
    try {
      const result = await task();
      if (wallet) await refresh(wallet);
      setNotice({ type: 'success', text: result || `${label} completed successfully.` });
      return true;
    } catch (error) {
      const message = error?.shortMessage || error?.reason || error?.info?.error?.message || error?.message || 'Transaction failed.';
      setNotice({ type: 'error', text: message.replace(/^execution reverted: /, '') });
      return false;
    } finally { setBusy(false); }
  };

  const finishWalletConnection = async (session) => {
    // Save the account immediately. A network/deployment validation error should not
    // make an actually-authorized MetaMask account appear disconnected in the UI.
    setWallet(session);
    if (Number(session.chainId) !== Number(deployment.chainId)) {
      setNotice({
        type: 'warning',
        text: `MetaMask is connected (${shortAddress(session.account)}), but it is on chain ${session.chainId}. SmartChain requires chain ${deployment.chainId}. Switch networks to continue.`
      });
      return;
    }
    await getContracts(session.provider);
    await refresh(session);
    setNotice({ type: 'success', text: `Wallet connected: ${shortAddress(session.account)}` });
  };

  const handleConnect = async () => {
    setBusy(true); setNotice(null);
    try {
      const session = await connectWallet();
      await finishWalletConnection(session);
    } catch (error) {
      setNotice({ type: 'error', text: error?.shortMessage || error?.message || 'Could not connect wallet.' });
    } finally { setBusy(false); }
  };

  const handleSwitchNetwork = async () => {
    setBusy(true); setNotice(null);
    try {
      const session = await switchToConfiguredNetwork();
      await finishWalletConnection(session);
    } catch (error) {
      const message = error?.shortMessage || error?.message || 'Could not switch MetaMask network.';
      setNotice({ type: 'error', text: `${message} Make sure the local Hardhat node is running at http://127.0.0.1:8545.` });
    } finally { setBusy(false); }
  };

  const loadProduct = async (id) => {
    const clean = id.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(clean)) {
      setNotice({ type: 'error', text: 'Enter a valid 32-byte product ID.' }); return;
    }
    setBusy(true); setNotice(null);
    try {
      const lookupProvider = wallet && Number(wallet.chainId) === Number(deployment.chainId)
        ? wallet.provider
        : getReadProvider();
      const { supplyChain } = await getContracts(lookupProvider);
      const [p, h] = await Promise.all([supplyChain.getProduct(clean), supplyChain.getProductHistory(clean)]);
      setTracked(p); setTrackedHistory(h);
      setNotice({ type: 'success', text: 'Product record and on-chain history loaded.' });
    } catch (error) {
      setTracked(null); setTrackedHistory([]);
      setNotice({ type: 'error', text: error?.shortMessage || error?.reason || 'Product was not found on this network.' });
    } finally { setBusy(false); }
  };

  useEffect(() => {
    const idFromQr = new URLSearchParams(window.location.search).get('product');
    if (idFromQr) {
      setTrackId(idFromQr);
      setActiveTab('tracking');
    }
  }, []);

  useEffect(() => {
    const idFromQr = new URLSearchParams(window.location.search).get('product');
    if (idFromQr && !tracked) loadProduct(idFromQr);
  }, []);

  const inspect = async (product) => {
    setTrackId(product.id);
    setTransferForm((v) => ({ ...v, productId: product.id }));
    setReturnForm((v) => ({ ...v, productId: product.id }));
    setSensorForm((v) => ({ ...v, productId: product.id }));
    setActiveTab('tracking');
    await loadProduct(product.id);
  };

  const registerProduct = () => run('Product registration', async () => {
    const { supplyChain } = await getContracts(wallet.signer);
    const id = makeProductId(productForm.batch);
    const expiry = Math.floor(Date.now() / 1000) + Number(productForm.expiryDays) * 86400;
    await (await supplyChain.registerProduct(
      id, productForm.name, productForm.batch, Number(productForm.quantity), expiry,
      Number(productForm.minTemp), Number(productForm.maxTemp), Number(productForm.maxHumidity)
    )).wait();
    setProductForm(EMPTY_PRODUCT);
    return `Product registered. Product ID: ${id}`;
  });

  const addParticipant = () => run('Participant onboarding', async () => {
    const { registry } = await getContracts(wallet.signer);
    await (await registry.addParticipant(participantForm.address, Number(participantForm.role), participantForm.name, participantForm.email)).wait();
    setParticipantForm({ address: '', role: String(Math.min(10, role + 1)), name: '', email: '' });
    return 'The next-stage participant has been connected to your account.';
  });

  const removeParticipant = (account) => run('Participant removal', async () => {
    const { supplyChain } = await getContracts(wallet.signer);
    await (await supplyChain.removeParticipant(account)).wait();
    return 'Participant removed. The contract allowed removal because the participant has no inventory.';
  });

  const transferProduct = () => run('Product transfer', async () => {
    const { supplyChain } = await getContracts(wallet.signer);
    await (await supplyChain.transferProduct(transferForm.productId, transferForm.receiver)).wait();
    return 'Forward transfer recorded on-chain.';
  });

  const markReturn = () => run('Return request', async () => {
    const { supplyChain } = await getContracts(wallet.signer);
    await (await supplyChain.setProductForReturn(returnForm.productId, returnForm.destination)).wait();
    return 'Product marked for reverse logistics. Forward transfers are now blocked.';
  });

  const returnProduct = () => run('Reverse transfer', async () => {
    const { supplyChain } = await getContracts(wallet.signer);
    await (await supplyChain.returnTransfer(returnForm.productId, returnForm.previousOwner)).wait();
    return 'Reverse transfer recorded on-chain.';
  });

  const reportSensor = () => run('Sensor report', async () => {
    const { supplyChain } = await getContracts(wallet.signer);
    await (await supplyChain.reportSensorData(sensorForm.productId, Number(sensorForm.temperature), Number(sensorForm.humidity), sensorForm.damaged, sensorForm.note)).wait();
    return 'Sensor reading recorded. Unhealthy product status is enforced by the contract.';
  });

  const deposit = () => run('Wallet deposit', async () => {
    const { supplyChain } = await getContracts(wallet.signer);
    await (await supplyChain.deposit({ value: parseEther(walletForm.deposit) })).wait();
    return 'Funds deposited into your SmartChain contract wallet.';
  });

  const withdraw = () => run('Wallet withdrawal', async () => {
    const { supplyChain } = await getContracts(wallet.signer);
    await (await supplyChain.withdraw(parseEther(walletForm.withdraw))).wait();
    return 'Funds withdrawn from your SmartChain contract wallet.';
  });

  const copyText = async (value) => {
    await navigator.clipboard.writeText(value);
    setNotice({ type: 'success', text: 'Copied to clipboard.' });
  };

  const title = NAV.find((n) => n.id === activeTab)?.label || 'Overview';

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Link2 size={22} /></div><div><strong>SmartChain</strong><span>SUPPLY NETWORK</span></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}><Icon size={18}/><span>{label}</span>{activeTab === id && <ChevronRight size={15}/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="network-card"><span className="network-dot"/><div><strong>{networkLabel}</strong><small>{wallet ? 'Wallet network' : 'Connect a wallet to begin'}</small></div></div><div className="sidebar-foot"><ShieldCheck size={15}/> Blockchain-backed audit trail</div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{title}</strong></div><div className="top-actions"><span className="chain-chip"><span className="network-dot"/>{networkLabel}</span>{wallet ? <><button className="wallet-button connected"><span className="wallet-led"/>{shortAddress(wallet.account)}</button>{!isCorrectNetwork && <button className="button primary" onClick={handleSwitchNetwork} disabled={busy}>{busy ? 'Switching…' : 'Switch network'}</button>}</> : <button className="wallet-button" onClick={handleConnect} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Wallet size={16}/>} Connect wallet</button>}</div></header>

      <section className="page-content">
        <div className="page-heading"><div><div className="eyebrow">PHARMACEUTICAL LOGISTICS / ON-CHAIN OPERATIONS</div><h1>{title}</h1><p>Monitor product movement, custody and cold-chain conditions from one trusted ledger.</p></div><div className="heading-actions"><button className="button secondary" disabled={!wallet || busy} onClick={() => refresh()}><RefreshCw size={15}/> Refresh</button></div></div>

        {notice && <div className={`notice ${notice.type}`}><span>{notice.type === 'success' ? <CheckCircle2 size={17}/> : <XCircle size={17}/>}</span><div>{notice.text}</div><button onClick={() => setNotice(null)} aria-label="Dismiss"><XCircle size={16}/></button></div>}
        {!wallet && <div className="connect-banner"><div className="connect-icon"><Wallet size={22}/></div><div><strong>Connect your MetaMask wallet</strong><p>Use a registered participant account on the local Hardhat network or configured testnet.</p></div><button className="button primary" onClick={handleConnect} disabled={busy}>{busy ? 'Connecting…' : 'Connect wallet'} <ArrowRight size={16}/></button></div>}
        {wallet && !isCorrectNetwork && <div className="notice warning"><ShieldCheck size={17}/><div>MetaMask account {shortAddress(wallet.account)} is connected, but this application is configured for chain ID {deployment.chainId}. Switch MetaMask to the configured network before using SmartChain.</div><button className="button primary" onClick={handleSwitchNetwork} disabled={busy}>{busy ? 'Switching…' : 'Switch network'}</button></div>}
        {wallet && isCorrectNetwork && !isRegistered && <div className="notice warning"><ShieldCheck size={17}/><div><strong>This wallet is not registered on this deployment.</strong><br/>The Manufacturer is the address configured for this deployment (shown below in My inventory). Other roles must be onboarded by their immediate parent participant; a wallet cannot register itself.</div></div>}

        {activeTab === 'overview' && <>
          <div className="metrics-grid">
            <Metric label="Products in my custody" value={products.length} detail="Current on-chain inventory" icon={Package} tone="blue"/>
            <Metric label="Healthy products" value={healthyCount} detail="Within recorded thresholds" icon={CheckCircle2} tone="green"/>
            <Metric label="Flagged products" value={flaggedCount} detail="Damaged or temperature excursion" icon={Activity} tone="red"/>
            <Metric label="Wallet balance" value={`${Number(balance).toFixed(4)} ETH`} detail="Internal contract wallet" icon={Wallet} tone="violet"/>
          </div>
          <div className="content-grid overview-grid">
            <div className="panel"><div className="panel-head"><div><h2>My inventory</h2><p>Products currently assigned to this wallet</p></div><button className="text-button" onClick={() => setActiveTab('inventory')}>View all <ArrowRight size={14}/></button></div><ProductTable products={products.slice(0, 5)} onInspect={inspect}/></div>
            <div className="panel profile-panel"><div className="panel-head"><div><h2>Participant profile</h2><p>Your verified network identity</p></div><span className="verified-tag"><ShieldCheck size={13}/> On-chain</span></div><div className="profile-avatar">{participant?.name?.slice(0, 1)?.toUpperCase() || 'S'}</div><h3>{participant?.name || 'Not registered'}</h3><p className="profile-role">{ROLE_NAMES[role] || 'Unknown role'}</p><div className="profile-details"><div><span>Wallet address</span><strong>{shortAddress(wallet?.account)}</strong></div><div><span>Parent participant</span><strong>{shortAddress(participant?.parent)}</strong></div><div><span>Internal balance</span><strong>{Number(balance).toFixed(5)} ETH</strong></div><div><span>Sensor authority</span><strong>{isOracle ? 'Enabled' : 'Not assigned'}</strong></div></div><button className="button secondary full" onClick={() => setActiveTab('participants')}>Participant operations <ArrowRight size={15}/></button></div>
          </div>
          <div className="panel quick-panel"><div className="panel-head"><div><h2>Quick actions</h2><p>Common supply-chain operations</p></div></div><div className="quick-actions"><button onClick={() => setActiveTab('tracking')}><FileSearch/><span><strong>Track a product</strong><small>View verified history</small></span><ArrowRight/></button><button onClick={() => setActiveTab('operations')}><ArrowLeftRight/><span><strong>Transfer / return</strong><small>Move product ownership</small></span><ArrowRight/></button><button onClick={() => setActiveTab('operations')}><Wallet/><span><strong>Manage wallet</strong><small>Deposit or withdraw ETH</small></span><ArrowRight/></button></div></div>
        </>}

        {activeTab === 'inventory' && <>{isManufacturer ? <div className="panel registration-panel"><div className="panel-head"><div><h2>Register a new product</h2><p>Only the Manufacturer can create a product record on-chain.</p></div><span className="panel-icon"><Factory size={18}/></span></div><form className="registration-grid" onSubmit={(e) => { e.preventDefault(); registerProduct(); }}><Field label="Product name"><input required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder="Cold-chain vaccine"/></Field><Field label="Batch number"><input required value={productForm.batch} onChange={(e) => setProductForm({ ...productForm, batch: e.target.value })} placeholder="BATCH-2026-001"/></Field><Field label="Quantity"><input type="number" min="1" required value={productForm.quantity} onChange={(e) => setProductForm({ ...productForm, quantity: e.target.value })}/></Field><Field label="Expiry in days"><input type="number" min="1" required value={productForm.expiryDays} onChange={(e) => setProductForm({ ...productForm, expiryDays: e.target.value })}/></Field><Field label="Minimum temperature °C"><input type="number" value={productForm.minTemp} onChange={(e) => setProductForm({ ...productForm, minTemp: e.target.value })}/></Field><Field label="Maximum temperature °C"><input type="number" value={productForm.maxTemp} onChange={(e) => setProductForm({ ...productForm, maxTemp: e.target.value })}/></Field><Field label="Maximum humidity %"><input type="number" min="0" max="100" value={productForm.maxHumidity} onChange={(e) => setProductForm({ ...productForm, maxHumidity: e.target.value })}/></Field><div className="registration-submit"><button className="button primary" disabled={!wallet || !isCorrectNetwork || !isRegistered || busy}><Plus size={16}/> Register product</button></div></form></div> : <div className="panel registration-panel locked-feature"><div className="panel-head"><div><h2>Product registration is locked</h2><p>The smart contract allows only the Manufacturer role to register products.</p></div><span className="panel-icon"><ShieldCheck size={18}/></span></div>{!wallet ? <p className="form-note">Connect the Manufacturer wallet to register a product.</p> : !isCorrectNetwork ? <p className="form-note">Switch to the configured network (chain ID {deployment.chainId}) and reconnect.</p> : !isRegistered ? <><p className="form-note">Your connected address {shortAddress(wallet.account)} is not registered. The configured Manufacturer address for this deployment is:</p><div className="expected-account"><code>{deployment.manufacturer || deployment.deployer || 'Manufacturer account not found. Run the local deployment setup.'}</code>{(deployment.manufacturer || deployment.deployer) && <button className="text-button" type="button" onClick={() => copyText(deployment.manufacturer || deployment.deployer)}>Copy manufacturer address</button>}</div><p className="form-note">Select the configured Manufacturer address in MetaMask on Hardhat Local (chain ID 31337). If you intended to use a different account, set LOCAL_MANUFACTURER_ADDRESS in the project-root .env file and redeploy using the existing-wallet setup command. Do not paste a private key into .env.</p></> : <p className="form-note">Connected role: <strong>{ROLE_NAMES[role] || 'Unknown'}</strong>. Only Manufacturer can register products. The manufacturer wallet is {shortAddress(deployment.manufacturer || deployment.deployer)}.</p>}</div>}<div className="panel"><div className="panel-head"><div><h2>Products in custody</h2><p>Inventory is updated by smart-contract ownership transfers.</p></div><span className="count-chip">{products.length} products</span></div><ProductTable products={products} onInspect={inspect}/></div></>}

        {activeTab === 'participants' && <div className="content-grid two-col"><div className="panel"><div className="panel-head"><div><h2>Participant onboarding</h2><p>Register the next role in your direct supply-chain route.</p></div><span className="panel-icon"><Truck size={18}/></span></div><form className="form-grid" onSubmit={(e) => { e.preventDefault(); addParticipant(); }}><Field label="Wallet address"><input required value={participantForm.address} onChange={(e) => setParticipantForm({ ...participantForm, address: e.target.value })} placeholder="0x…"/></Field><Field label="Next role"><select value={participantForm.role} onChange={(e) => setParticipantForm({ ...participantForm, role: e.target.value })}>{ROLE_NAMES.map((name, index) => index > 0 && index === role + 1 ? <option value={index} key={index}>{name}</option> : null)}</select></Field><Field label="Organization / participant name"><input required value={participantForm.name} onChange={(e) => setParticipantForm({ ...participantForm, name: e.target.value })} placeholder="e.g. West Zone Cold Storage"/></Field><Field label="Contact email (demo data)"><input type="email" value={participantForm.email} onChange={(e) => setParticipantForm({ ...participantForm, email: e.target.value })} placeholder="ops@example.test"/></Field><div className="form-note">Only the immediately following role may be added. This link becomes the allowed direct transfer route.</div><button className="button primary" disabled={!wallet || !isRegistered || busy || role >= 10}><Plus size={16}/> Add participant</button></form><div className="soft-divider"/><div className="panel-head"><div><h2>Directly linked participants</h2><p>Accounts onboarded by this wallet.</p></div><span className="count-chip">{children.length} linked</span></div>{children.length ? <div className="children-list">{children.map((child) => <div className="child-row" key={child.address}><div><strong>{child.name}</strong><small>{ROLE_NAMES[Number(child.role)]} · {shortAddress(child.address)}</small></div><button className="text-button danger-text" onClick={() => removeParticipant(child.address)} disabled={busy}>Remove</button></div>)}</div> : <p className="small-muted">No active participants have been added by this wallet yet.</p>}</div><div className="panel guidance-panel"><div className="panel-head"><div><h2>Supply-chain route</h2><p>Role order enforced by ParticipantRegistry.</p></div></div><div className="route-list">{ROLE_NAMES.slice(1).map((name, idx) => <div className={`route-step ${role === idx + 1 ? 'current' : role > idx + 1 ? 'complete' : ''}`} key={name}><span>{role > idx + 1 ? <CheckCircle2 size={15}/> : idx + 1}</span><div><strong>{name}</strong>{role === idx + 1 && <small>Connected wallet role</small>}</div></div>)}</div><div className="warning-note"><ShieldCheck size={16}/><span>Participants cannot change their assigned role, and a participant holding inventory cannot be removed.</span></div></div></div>}

        {activeTab === 'tracking' && <div className="content-grid tracking-grid"><div className="panel"><div className="panel-head"><div><h2>Trace a product</h2><p>Fetch the product record and immutable event history using its ID.</p></div><span className="panel-icon"><ScanLine size={18}/></span></div><form className="track-form" onSubmit={(e) => { e.preventDefault(); loadProduct(trackId); }}><Field label="Product ID"><input value={trackId} onChange={(e) => setTrackId(e.target.value)} placeholder="0x + 64 hexadecimal characters"/></Field><button className="button primary" disabled={busy}><FileSearch size={16}/> Verify on blockchain</button></form>{tracked && <div className="tracked-card"><div className="tracked-title"><div><span className="eyebrow">VERIFIED PRODUCT RECORD</span><h3>{tracked.name}</h3><p>{tracked.batchNumber}</p></div><StatusPill status={tracked.status}/></div><div className="tracked-grid"><div><small>Current owner</small><strong>{shortAddress(tracked.currentOwner)}</strong></div><div><small>Quantity</small><strong>{tracked.quantity.toString()}</strong></div><div><small>Expiry</small><strong>{new Date(Number(tracked.expiryAt) * 1000).toLocaleDateString()}</strong></div><div><small>Return route</small><strong>{tracked.isReturning ? 'Active' : 'Not active'}</strong></div></div><div className="qr-block"><QRCodeSVG value={`${window.location.origin}/?product=${tracked.id}`} size={104}/><div><strong>Product QR</strong><p>Share this code as a product lookup reference. Read-only lookup uses the configured RPC; a wallet is needed only for transactions.</p><button className="text-button" onClick={() => copyText(tracked.id)}>Copy product ID</button></div></div></div>}</div><div className="panel"><div className="panel-head"><div><h2>Product event history</h2><p>Chronological events recorded by the contract.</p></div><span className="count-chip">{trackedHistory.length} events</span></div>{trackedHistory.length ? <HistoryTimeline history={trackedHistory}/> : <EmptyState icon={Clock3} title="No record loaded" text="Search for a product to inspect its blockchain history."/>}</div></div>}

        {activeTab === 'operations' && <div className="operations-layout"><div className="content-grid two-col"><div className="panel"><div className="panel-head"><div><h2>Product transfer</h2><p>Send a healthy product to a directly linked participant.</p></div><span className="panel-icon"><ArrowLeftRight size={18}/></span></div><form className="form-grid" onSubmit={(e) => { e.preventDefault(); transferProduct(); }}><Field label="Product ID"><input required value={transferForm.productId} onChange={(e) => setTransferForm({ ...transferForm, productId: e.target.value })} placeholder="0x…"/></Field><Field label="Receiver address"><input required value={transferForm.receiver} onChange={(e) => setTransferForm({ ...transferForm, receiver: e.target.value })} placeholder="Directly connected wallet"/></Field><div className="form-note">The contract checks current ownership, product health, route permissions and your internal wallet balance.</div><button className="button primary" disabled={!wallet || !isRegistered || busy}><ArrowRight size={16}/> Transfer product</button></form></div><div className="panel"><div className="panel-head"><div><h2>Reverse logistics</h2><p>Initiate or execute a return through the previous-owner route.</p></div><span className="panel-icon"><ArrowDownLeft size={18}/></span></div><form className="form-grid" onSubmit={(e) => { e.preventDefault(); markReturn(); }}><Field label="Product ID"><input required value={returnForm.productId} onChange={(e) => setReturnForm({ ...returnForm, productId: e.target.value })} placeholder="0x…"/></Field><Field label="Return destination"><input required value={returnForm.destination} onChange={(e) => setReturnForm({ ...returnForm, destination: e.target.value })} placeholder="Earlier owner in the product route"/></Field><button className="button secondary" disabled={!wallet || !isRegistered || busy}>Mark product for return</button></form><div className="soft-divider"/><form className="form-grid" onSubmit={(e) => { e.preventDefault(); returnProduct(); }}><Field label="Immediate previous owner"><input required value={returnForm.previousOwner} onChange={(e) => setReturnForm({ ...returnForm, previousOwner: e.target.value })} placeholder="Immediate previous owner address"/></Field><button className="button dark" disabled={!wallet || !isRegistered || busy}><ArrowLeftRight size={16}/> Execute reverse transfer</button></form></div></div>
          <div className="content-grid two-col"><div className="panel"><div className="panel-head"><div><h2>Wallet management</h2><p>Internal balances used for predefined transfer fees.</p></div><span className="panel-icon"><Wallet size={18}/></span></div><div className="wallet-balance"><span>AVAILABLE INTERNAL BALANCE</span><strong>{Number(balance).toFixed(6)} <small>ETH</small></strong></div><div className="wallet-actions"><form onSubmit={(e) => { e.preventDefault(); deposit(); }}><Field label="Deposit ETH"><input type="number" step="0.0001" min="0.0001" value={walletForm.deposit} onChange={(e) => setWalletForm({ ...walletForm, deposit: e.target.value })}/></Field><button className="button primary" disabled={!wallet || busy}>Deposit</button></form><form onSubmit={(e) => { e.preventDefault(); withdraw(); }}><Field label="Withdraw ETH"><input type="number" step="0.0001" min="0.0001" value={walletForm.withdraw} onChange={(e) => setWalletForm({ ...walletForm, withdraw: e.target.value })}/></Field><button className="button secondary" disabled={!wallet || busy}>Withdraw</button></form></div><p className="small-muted">A participant must deposit enough ETH before a transfer. The contract debits the sender and credits the receiver using the configured transfer fee.</p></div>
            <div className="panel"><div className="panel-head"><div><h2>Cold-chain sensor report</h2><p>Submit an oracle-authorized condition reading.</p></div><span className="panel-icon"><Thermometer size={18}/></span></div>{!isOracle && <div className="warning-note"><ShieldCheck size={16}/><span>This wallet is not the configured sensor oracle. Contract submissions will be rejected.</span></div>}<form className="form-grid" onSubmit={(e) => { e.preventDefault(); reportSensor(); }}><Field label="Product ID"><input required value={sensorForm.productId} onChange={(e) => setSensorForm({ ...sensorForm, productId: e.target.value })} placeholder="0x…"/></Field><div className="inline-fields"><Field label="Temperature (°C)"><input type="number" value={sensorForm.temperature} onChange={(e) => setSensorForm({ ...sensorForm, temperature: e.target.value })}/></Field><Field label="Humidity (%)"><input type="number" min="0" max="100" value={sensorForm.humidity} onChange={(e) => setSensorForm({ ...sensorForm, humidity: e.target.value })}/></Field></div><label className="check-field"><input type="checkbox" checked={sensorForm.damaged} onChange={(e) => setSensorForm({ ...sensorForm, damaged: e.target.checked })}/> Physical damage detected</label><Field label="Observation note"><input value={sensorForm.note} onChange={(e) => setSensorForm({ ...sensorForm, note: e.target.value })}/></Field><button className="button dark" disabled={!wallet || !isOracle || busy}><Activity size={16}/> Submit sensor report</button></form></div></div>
        </div>}

        <footer className="page-footer"><span>SmartChain · Research prototype</span><span>Connected chain: {wallet ? wallet.chainId : '—'} · Contract addresses are read from deployment.json</span></footer>
      </section>
    </main>
    {busy && <div className="busy-indicator"><LoaderCircle size={16} className="spin"/> Waiting for wallet / blockchain response…</div>}
  </div>;
}

function ProductTable({ products, onInspect }) {
  if (!products.length) return <EmptyState icon={Package} title="Inventory is empty" text="Registered products will appear here when this wallet owns them."/>;
  return <div className="table-wrap"><table className="data-table"><thead><tr><th>PRODUCT</th><th>BATCH</th><th>QUANTITY</th><th>STATUS</th><th> </th></tr></thead><tbody>{products.map((p) => <tr key={p.id}><td><div className="product-cell"><div className="product-icon"><Box size={17}/></div><div><strong>{p.name}</strong><small>{shortAddress(p.id)}</small></div></div></td><td>{p.batchNumber}</td><td>{p.quantity.toString()}</td><td><StatusPill status={p.status}/></td><td><button className="inspect-button" onClick={() => onInspect(p)}>Details <ChevronRight size={14}/></button></td></tr>)}</tbody></table></div>;
}

function HistoryTimeline({ history }) {
  return <div className="timeline">{[...history].reverse().map((item, index) => <div className="timeline-item" key={`${item.timestamp}-${index}`}><span className={`timeline-marker ${Number(item.status) === 1 ? 'healthy' : 'alert'}`}/><div className="timeline-content"><div className="timeline-top"><strong>{ACTION_NAMES[Number(item.action)] || 'Update'}</strong><small>{new Date(Number(item.timestamp) * 1000).toLocaleString()}</small></div><p>{item.note || 'Blockchain state updated.'}</p><div className="timeline-meta"><span>From {shortAddress(item.from)}</span><ArrowRight size={12}/><span>To {shortAddress(item.to)}</span></div>{Number(item.action) === 2 && <div className="sensor-tags"><span>{item.temperatureC.toString()}°C</span><span>{item.humidityPct.toString()}% RH</span><StatusPill status={item.status}/></div>}</div></div>)}</div>;
}

function EmptyState({ icon: Icon, title, text }) {
  return <div className="empty-state"><div><Icon size={23}/></div><strong>{title}</strong><p>{text}</p></div>;
}

export default App;
