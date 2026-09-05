import {console2} from "forge-std/console2.sol";
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {IDreamDexBinaryModule, IDreamDexBinaryMarket} from "../src/interfaces/IDreamDex.sol";

/// @dev Fork probe: read a REAL finalized DreamDEX market through the module on
///      the Shannon fork, proving the canonical read path the vault depends on.
contract ForkProbe is Script {
    address constant MODULE = 0x3ecC694Cef705358864a646142ac17A90E29e388;

    function run() external {
        // Use a known finalized market id from the indexer (2ef5 = BTC 5m, resolved UP)
        bytes32 marketId = 0x0000000000000000000000000000000000000000000000000000000000002ef5;
        (
            uint256 oracleQuestionId,
            , // outcomeSlotCount
            uint8 voidPolicy,
            address collateral,
            , , , , // originOperatorId, originVenueId, oracleAdapter, creator
            address market,
            , // pool
            uint256 yesId,
            uint256 noId,
            uint64 tradingStart,
            uint64 expiry
        ) = IDreamDexBinaryModule(MODULE).markets(marketId);

        console2.log("marketId:            ", vm.toString(marketId));
        console2.log("oracleQuestionId:    ", oracleQuestionId);
        console2.log("voidPolicy:          ", voidPolicy);
        console2.log("collateral:          ", collateral);
        console2.log("market contract:     ", market);
        console2.log("yesId:               ", yesId);
        console2.log("noId:                ", noId);
        console2.log("tradingStart:        ", tradingStart);
        console2.log("expiry:              ", expiry);

        if (market == address(0)) {
            console2.log("MARKET NOT LIVE (address 0)");
            return;
        }
        bool resolved = IDreamDexBinaryMarket(market).isResolved();
        bool voided = IDreamDexBinaryMarket(market).isVoided();
        uint256[] memory payouts = IDreamDexBinaryMarket(market).payoutNumerators();
        console2.log("isResolved:          ", resolved);
        console2.log("isVoided:            ", voided);
        console2.log("payouts length:      ", payouts.length);
        for (uint256 i = 0; i < payouts.length; i++) {
            console2.log("  payouts[", i, "]:   ", payouts[i]);
        }
    }
}
