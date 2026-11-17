// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SupplyChainTypes} from './libraries/SupplyChainTypes.sol';

/// @title ParticipantRegistry
/// @notice On-chain participant directory with explicit parent/child links.
contract ParticipantRegistry {
    using SupplyChainTypes for SupplyChainTypes.Role;

    address public immutable owner;
    address public supplyChainManager;
    mapping(address => SupplyChainTypes.Participant) private participants;
    mapping(address => mapping(address => bool)) public isDirectConnection;
    mapping(address => bool) public hasEverRegistered;
    mapping(address => address[]) private children;
    mapping(address => uint256) public activeChildrenCount;

    event ParticipantAdded(address indexed account, address indexed parent, SupplyChainTypes.Role role, string name);
    event ParticipantRemoved(address indexed account, address indexed parent);
    event ManagerConfigured(address indexed manager);

    error NotOwner();
    error NotManager();
    error NotParticipant();
    error AlreadyRegistered();
    error InvalidNextRole();
    error InvalidAddress();
    error NotParent();
    error HasChildren();

    /// @param manufacturerAddress Wallet that receives the Manufacturer role.
    ///        Pass address(0) to use the deployer (the original paper's default).
    ///        `owner` remains the deployment administrator; the Manufacturer
    ///        participant can be a separate MetaMask address for local demos.
    constructor(string memory manufacturerName, string memory contactEmail, address manufacturerAddress) {
        owner = msg.sender;
        address initialManufacturer = manufacturerAddress == address(0) ? msg.sender : manufacturerAddress;
        participants[initialManufacturer] = SupplyChainTypes.Participant({
            role: SupplyChainTypes.Role.Manufacturer,
            parent: address(0),
            name: manufacturerName,
            email: contactEmail,
            active: true,
            joinedAt: uint64(block.timestamp)
        });
        hasEverRegistered[initialManufacturer] = true;
        emit ParticipantAdded(initialManufacturer, address(0), SupplyChainTypes.Role.Manufacturer, manufacturerName);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Set once by the deployer so the supply-chain contract can remove
    /// an account after checking that its inventory is empty.
    function setSupplyChainManager(address manager) external onlyOwner {
        if (manager == address(0)) revert InvalidAddress();
        require(supplyChainManager == address(0), 'MANAGER_ALREADY_SET');
        supplyChainManager = manager;
        emit ManagerConfigured(manager);
    }

    /// @notice A participant may onboard only the immediately following role.
    function addParticipant(
        address account,
        SupplyChainTypes.Role role,
        string calldata name,
        string calldata email
    ) external {
        SupplyChainTypes.Participant storage parent = participants[msg.sender];
        if (!parent.active) revert NotParticipant();
        if (account == address(0) || account == msg.sender) revert InvalidAddress();
        // Keep a permanent registration marker: removed addresses cannot be
        // re-enrolled under a different parent/role, which would leave stale
        // parent-child entries in the historical children arrays.
        if (hasEverRegistered[account]) revert AlreadyRegistered();
        if (uint8(role) != uint8(parent.role) + 1 || role == SupplyChainTypes.Role.None) revert InvalidNextRole();

        participants[account] = SupplyChainTypes.Participant({
            role: role,
            parent: msg.sender,
            name: name,
            email: email,
            active: true,
            joinedAt: uint64(block.timestamp)
        });
        hasEverRegistered[account] = true;
        isDirectConnection[msg.sender][account] = true;
        children[msg.sender].push(account);
        activeChildrenCount[msg.sender] += 1;
        emit ParticipantAdded(account, msg.sender, role, name);
    }

    function removeParticipant(address account) external {
        if (msg.sender != supplyChainManager) revert NotManager();
        SupplyChainTypes.Participant storage participant = participants[account];
        if (!participant.active || participant.parent == address(0)) revert NotParticipant();
        if (activeChildrenCount[account] != 0) revert HasChildren();
        address parent = participant.parent;
        participant.active = false;
        isDirectConnection[parent][account] = false;
        activeChildrenCount[parent] -= 1;
        emit ParticipantRemoved(account, parent);
    }

    function getParticipant(address account) external view returns (SupplyChainTypes.Participant memory) {
        return participants[account];
    }

    function getChildren(address account) external view returns (address[] memory) {
        return children[account];
    }

    function isActive(address account) external view returns (bool) {
        return participants[account].active;
    }

    function isParticipant(address account) external view returns (bool) {
        return participants[account].active;
    }

    function parentOf(address account) external view returns (address) {
        return participants[account].parent;
    }
}
