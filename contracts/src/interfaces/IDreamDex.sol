// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IDreamDexMarkets
/// @notice Minimal, exact read surface for DreamDEX Event Contract canonical state.
///         Source of truth is the ON-CHAIN contracts, never an indexer or frontend.
///         Verified against the markets-sdk 0.29.0 ABIs.
interface IDreamDexBinaryModule {
    /// @notice Canonical market record. Returns the per-window market contract address
    ///         (field index 8) which exposes payoutNumerators()/isResolved()/isVoided().
    function markets(bytes32 marketId)
        external
        view
        returns (
            uint256 oracleQuestionId,
            uint8 outcomeSlotCount,
            uint8 voidPolicy,
            address collateral,
            uint32 originOperatorId,
            bytes32 originVenueId,
            address oracleAdapter,
            address creator,
            address market,
            address pool,
            uint256 yesId,
            uint256 noId,
            uint64 tradingStart,
            uint64 expiry
        );
}

/// @notice Per-window binary market contract (Settlement v3).
///         winner is NOT a stored field — derive it as argmax of payoutNumerators,
///         gated on isResolved(). winningOutcome() was removed and reverts.
interface IDreamDexBinaryMarket {
    function payoutNumerators() external view returns (uint256[] memory);
    function isResolved() external view returns (bool);
    function isVoided() external view returns (bool);
}
