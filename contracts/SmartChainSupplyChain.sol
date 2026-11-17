// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ParticipantRegistry} from './ParticipantRegistry.sol';
import {SupplyChainTypes} from './libraries/SupplyChainTypes.sol';

/// @title SmartChainSupplyChain
/// @notice Product lifecycle, inventory, sensor-condition, returns and internal
/// wallet accounting for a permissioned pharmaceutical supply-chain workflow.
contract SmartChainSupplyChain {
    using SupplyChainTypes for SupplyChainTypes.ProductStatus;

    ParticipantRegistry public immutable registry;
    address public immutable owner;
    address public sensorOracle;
    uint256 public transferFeeWei;
    bool private entered;

    mapping(bytes32 => SupplyChainTypes.Product) private products;
    mapping(bytes32 => bool) public productExists;
    mapping(address => bytes32[]) private inventories;
    mapping(bytes32 => uint256) private inventoryIndexPlusOne;
    mapping(bytes32 => SupplyChainTypes.HistoryEntry[]) private productHistory;
    mapping(bytes32 => address[]) private returnPath;
    mapping(address => uint256) public activeProductRouteReferences;
    mapping(address => uint256) public walletBalance;
    uint256 public totalEscrowed;

    event ProductRegistered(bytes32 indexed productId, address indexed manufacturer, string batchNumber);
    event ProductTransferred(bytes32 indexed productId, address indexed from, address indexed to, uint256 fee);
    event SensorDataRecorded(bytes32 indexed productId, int16 temperatureC, uint16 humidityPct, SupplyChainTypes.ProductStatus status);
    event ProductMarkedForReturn(bytes32 indexed productId, address indexed owner, address indexed returnLocation);
    event ProductReturned(bytes32 indexed productId, address indexed returnLocation);
    event Deposit(address indexed account, uint256 amount);
    event Withdrawal(address indexed account, uint256 amount);
    event TransferFeeUpdated(uint256 fee);
    event SensorOracleUpdated(address indexed oracle);
    event ParticipantRemoved(address indexed account);

    error NotOwner();
    error NotManufacturer();
    error NotOracle();
    error NotParticipant();
    error ProductAlreadyExists();
    error ProductNotFound();
    error InvalidProductData();
    error NotProductOwner();
    error NotDirectlyConnected();
    error ProductNotHealthy();
    error ProductIsReturning();
    error ProductNotReturning();
    error InvalidReturnLocation();
    error InsufficientWalletBalance();
    error InvalidAmount();
    error ReentrantCall();
    error ParticipantHasInventory();
    error ParticipantHasActiveProductRoute();
    error InvalidParticipantParent();

    constructor(address registryAddress, address oracleAddress) {
        require(registryAddress != address(0), 'INVALID_REGISTRY');
        registry = ParticipantRegistry(registryAddress);
        owner = msg.sender;
        sensorOracle = oracleAddress == address(0) ? msg.sender : oracleAddress;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOracle() {
        if (msg.sender != sensorOracle) revert NotOracle();
        _;
    }

    modifier nonReentrant() {
        if (entered) revert ReentrantCall();
        entered = true;
        _;
        entered = false;
    }

    function setSensorOracle(address oracleAddress) external onlyOwner {
        require(oracleAddress != address(0), 'INVALID_ORACLE');
        sensorOracle = oracleAddress;
        emit SensorOracleUpdated(oracleAddress);
    }

    function setTransferFee(uint256 feeWei) external onlyOwner {
        transferFeeWei = feeWei;
        emit TransferFeeUpdated(feeWei);
    }

    function registerProduct(
        bytes32 productId,
        string calldata name,
        string calldata batchNumber,
        uint32 quantity,
        uint64 expiryAt,
        int16 minTemperatureC,
        int16 maxTemperatureC,
        uint16 maxHumidityPct
    ) external {
        if (!registry.isActive(msg.sender)) revert NotParticipant();
        SupplyChainTypes.Participant memory caller = registry.getParticipant(msg.sender);
        if (caller.role != SupplyChainTypes.Role.Manufacturer) revert NotManufacturer();
        if (productExists[productId]) revert ProductAlreadyExists();
        if (
            productId == bytes32(0) || bytes(name).length == 0 || bytes(batchNumber).length == 0 ||
            quantity == 0 || expiryAt <= block.timestamp || minTemperatureC > maxTemperatureC || maxHumidityPct > 100
        ) revert InvalidProductData();

        SupplyChainTypes.Product storage product = products[productId];
        product.id = productId;
        product.name = name;
        product.batchNumber = batchNumber;
        product.quantity = quantity;
        product.manufacturedAt = uint64(block.timestamp);
        product.expiryAt = expiryAt;
        product.minTemperatureC = minTemperatureC;
        product.maxTemperatureC = maxTemperatureC;
        product.maxHumidityPct = maxHumidityPct;
        product.currentOwner = msg.sender;
        product.returnLocation = msg.sender;
        product.status = SupplyChainTypes.ProductStatus.Healthy;
        product.isReturning = false;
        product.createdAt = uint64(block.timestamp);
        product.updatedAt = uint64(block.timestamp);
        productExists[productId] = true;
        _addToInventory(msg.sender, productId);
        _appendHistory(productId, address(0), msg.sender, SupplyChainTypes.Action.Created, 0, 0, 'Product registered');
        emit ProductRegistered(productId, msg.sender, batchNumber);
    }

    function transferProduct(bytes32 productId, address receiver) external {
        SupplyChainTypes.Product storage product = _getProduct(productId);
        if (product.currentOwner != msg.sender) revert NotProductOwner();
        if (product.isReturning) revert ProductIsReturning();
        if (product.status != SupplyChainTypes.ProductStatus.Healthy) revert ProductNotHealthy();
        if (!registry.isDirectConnection(msg.sender, receiver) || !registry.isActive(receiver)) revert NotDirectlyConnected();
        _chargeTransferFee(msg.sender, receiver);

        address previousOwner = msg.sender;
        _removeFromInventory(previousOwner, productId);
        _addToInventory(receiver, productId);
        returnPath[productId].push(previousOwner);
        activeProductRouteReferences[previousOwner] += 1;
        product.currentOwner = receiver;
        product.updatedAt = uint64(block.timestamp);
        _appendHistory(productId, previousOwner, receiver, SupplyChainTypes.Action.ForwardTransfer, 0, 0, 'Forward ownership transfer');
        emit ProductTransferred(productId, previousOwner, receiver, transferFeeWei);
    }

    /// @notice Oracle-only sensor input. Unhealthy states are sticky: a later
    /// normal reading does not silently clear a damaged/unsafe product.
    function reportSensorData(
        bytes32 productId,
        int16 temperatureC,
        uint16 humidityPct,
        bool physicallyDamaged,
        string calldata note
    ) external onlyOracle {
        SupplyChainTypes.Product storage product = _getProduct(productId);
        if (product.status == SupplyChainTypes.ProductStatus.Healthy) {
            if (physicallyDamaged) {
                product.status = SupplyChainTypes.ProductStatus.Damaged;
            } else if (
                temperatureC < product.minTemperatureC || temperatureC > product.maxTemperatureC ||
                humidityPct > product.maxHumidityPct
            ) {
                product.status = SupplyChainTypes.ProductStatus.TemperatureExcursion;
            }
        }
        product.updatedAt = uint64(block.timestamp);
        _appendHistory(productId, product.currentOwner, product.currentOwner, SupplyChainTypes.Action.SensorReport, temperatureC, humidityPct, note);
        emit SensorDataRecorded(productId, temperatureC, humidityPct, product.status);
    }

    function setProductForReturn(bytes32 productId, address returnLocation) external {
        SupplyChainTypes.Product storage product = _getProduct(productId);
        if (product.currentOwner != msg.sender) revert NotProductOwner();
        if (product.isReturning || product.status == SupplyChainTypes.ProductStatus.Returned) revert ProductIsReturning();
        if (returnLocation == address(0) || returnLocation == msg.sender || !_isOnReturnPath(productId, returnLocation)) {
            revert InvalidReturnLocation();
        }
        product.isReturning = true;
        product.returnLocation = returnLocation;
        product.updatedAt = uint64(block.timestamp);
        _appendHistory(productId, msg.sender, msg.sender, SupplyChainTypes.Action.MarkedForReturn, 0, 0, 'Reverse logistics initiated');
        emit ProductMarkedForReturn(productId, msg.sender, returnLocation);
    }

    /// @notice A return can move only to the immediately preceding owner. The
    /// route stack ensures checkpoints cannot be skipped or traversed forward.
    function returnTransfer(bytes32 productId, address receiver) external {
        SupplyChainTypes.Product storage product = _getProduct(productId);
        if (product.currentOwner != msg.sender) revert NotProductOwner();
        if (!product.isReturning) revert ProductNotReturning();
        address[] storage path = returnPath[productId];
        if (path.length == 0 || path[path.length - 1] != receiver || receiver == address(0)) revert InvalidReturnLocation();
        if (!registry.isActive(receiver)) revert NotParticipant();
        _chargeTransferFee(msg.sender, receiver);

        _removeFromInventory(msg.sender, productId);
        _addToInventory(receiver, productId);
        path.pop();
        activeProductRouteReferences[receiver] -= 1;
        product.currentOwner = receiver;
        product.updatedAt = uint64(block.timestamp);

        if (receiver == product.returnLocation) {
            // The selected return checkpoint has been reached. Clear any older
            // route references beyond it so those participants can later be removed.
            while (path.length > 0) {
                address obsoleteOwner = path[path.length - 1];
                path.pop();
                activeProductRouteReferences[obsoleteOwner] -= 1;
            }
            product.isReturning = false;
            product.status = SupplyChainTypes.ProductStatus.Returned;
            _appendHistory(productId, msg.sender, receiver, SupplyChainTypes.Action.ReturnedToOrigin, 0, 0, 'Reached designated return location');
            emit ProductReturned(productId, receiver);
        } else {
            _appendHistory(productId, msg.sender, receiver, SupplyChainTypes.Action.ReturnTransfer, 0, 0, 'Reverse ownership transfer');
        }
        emit ProductTransferred(productId, msg.sender, receiver, transferFeeWei);
    }

    function removeParticipant(address account) external {
        if (registry.parentOf(account) != msg.sender) revert InvalidParticipantParent();
        if (inventories[account].length != 0) revert ParticipantHasInventory();
        if (activeProductRouteReferences[account] != 0) revert ParticipantHasActiveProductRoute();
        registry.removeParticipant(account);
        emit ParticipantRemoved(account);
    }

    function deposit() external payable {
        if (msg.value == 0) revert InvalidAmount();
        walletBalance[msg.sender] += msg.value;
        totalEscrowed += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (walletBalance[msg.sender] < amount) revert InsufficientWalletBalance();
        walletBalance[msg.sender] -= amount;
        totalEscrowed -= amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}('');
        require(ok, 'WITHDRAW_FAILED');
        emit Withdrawal(msg.sender, amount);
    }

    function getProduct(bytes32 productId) external view returns (SupplyChainTypes.Product memory) {
        return _getProductView(productId);
    }

    function getMyInventory() external view returns (bytes32[] memory) {
        return inventories[msg.sender];
    }

    function getInventoryOf(address account) external view returns (bytes32[] memory) {
        return inventories[account];
    }

    function getProductHistory(bytes32 productId) external view returns (SupplyChainTypes.HistoryEntry[] memory) {
        if (!productExists[productId]) revert ProductNotFound();
        return productHistory[productId];
    }

    function getReturnPath(bytes32 productId) external view returns (address[] memory) {
        if (!productExists[productId]) revert ProductNotFound();
        return returnPath[productId];
    }

    function getEscrowSolvency() external view returns (uint256 contractBalance, uint256 liabilities, bool solvent) {
        contractBalance = address(this).balance;
        liabilities = totalEscrowed;
        solvent = contractBalance >= liabilities;
    }

    function _chargeTransferFee(address from, address to) private {
        if (walletBalance[from] < transferFeeWei) revert InsufficientWalletBalance();
        if (transferFeeWei != 0) {
            walletBalance[from] -= transferFeeWei;
            walletBalance[to] += transferFeeWei;
        }
    }

    function _getProduct(bytes32 productId) private view returns (SupplyChainTypes.Product storage product) {
        if (!productExists[productId]) revert ProductNotFound();
        return products[productId];
    }

    function _getProductView(bytes32 productId) private view returns (SupplyChainTypes.Product memory) {
        if (!productExists[productId]) revert ProductNotFound();
        return products[productId];
    }

    function _addToInventory(address account, bytes32 productId) private {
        inventories[account].push(productId);
        inventoryIndexPlusOne[productId] = inventories[account].length;
    }

    function _removeFromInventory(address account, bytes32 productId) private {
        uint256 indexPlusOne = inventoryIndexPlusOne[productId];
        require(indexPlusOne != 0, 'INVENTORY_INDEX_MISSING');
        bytes32[] storage items = inventories[account];
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = items.length - 1;
        if (index != lastIndex) {
            bytes32 lastId = items[lastIndex];
            items[index] = lastId;
            inventoryIndexPlusOne[lastId] = index + 1;
        }
        items.pop();
        inventoryIndexPlusOne[productId] = 0;
    }

    function _appendHistory(
        bytes32 productId,
        address from,
        address to,
        SupplyChainTypes.Action action,
        int16 temperatureC,
        uint16 humidityPct,
        string memory note
    ) private {
        SupplyChainTypes.Product storage product = products[productId];
        productHistory[productId].push();
        SupplyChainTypes.HistoryEntry storage entry = productHistory[productId][productHistory[productId].length - 1];
        entry.from = from;
        entry.to = to;
        entry.timestamp = uint64(block.timestamp);
        entry.action = action;
        entry.temperatureC = temperatureC;
        entry.humidityPct = humidityPct;
        entry.status = product.status;
        entry.note = note;
    }

    function _isOnReturnPath(bytes32 productId, address target) private view returns (bool) {
        address[] storage path = returnPath[productId];
        for (uint256 i = 0; i < path.length; i++) {
            if (path[i] == target) return true;
        }
        return false;
    }
}
