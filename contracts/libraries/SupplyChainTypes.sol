// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Shared domain types for the SmartChain supply-chain application.
library SupplyChainTypes {
    // Ordered to describe the intended forward route. Each participant may
    // onboard a direct successor only.
    enum Role {
        None,
        Manufacturer,
        FirstConveyance,
        NationalStorage,
        SecondConveyance,
        ProvincialStorage,
        ThirdConveyance,
        DistrictStorage,
        FourthConveyance,
        Hospital,
        Patient
    }

    enum ProductStatus {
        Unknown,
        Healthy,
        Damaged,
        TemperatureExcursion,
        Returned
    }

    enum Action {
        Created,
        ForwardTransfer,
        SensorReport,
        MarkedForReturn,
        ReturnTransfer,
        ReturnedToOrigin
    }

    struct Participant {
        SupplyChainTypes.Role role;
        address parent;
        string name;
        string email;
        bool active;
        uint64 joinedAt;
    }

    struct Product {
        bytes32 id;
        string name;
        string batchNumber;
        uint32 quantity;
        uint64 manufacturedAt;
        uint64 expiryAt;
        int16 minTemperatureC;
        int16 maxTemperatureC;
        uint16 maxHumidityPct;
        address currentOwner;
        address returnLocation;
        ProductStatus status;
        bool isReturning;
        uint64 createdAt;
        uint64 updatedAt;
    }

    struct HistoryEntry {
        address from;
        address to;
        uint64 timestamp;
        Action action;
        int16 temperatureC;
        uint16 humidityPct;
        ProductStatus status;
        string note;
    }
}
