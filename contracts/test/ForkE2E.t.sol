// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {OraclelessConditionVault} from "../src/OraclelessConditionVault.sol";
import {IDreamDexBinaryModule} from "../src/interfaces/IDreamDex.sol";

/// @dev END-TO-END against REAL Shannon state via anvil fork: create a condition
///      on a REAL finalized DreamDEX market (0x...2ef5 = BTC window, resolved DOWN),
///      execute permissionlessly, confirm funds release. No mocks in this path.
contract ForkE2ETest is Test {
    address constant MODULE = 0x3ecC694Cef705358864a646142ac17A90E29e388;
    address constant TUSDC = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E;
    bytes32 constant MARKET = 0x0000000000000000000000000000000000000000000000000000000000002ef5;
    // real resolved winner for 2ef5 from the fork probe: payoutNumerators [0, 1e7] => DOWN (idx 1)
    OraclelessConditionVault vault;
    address recipient = address(0xB0B);

    function setUp() public {
        vm.createSelectFork("shannon_fork");
        vault = new OraclelessConditionVault(MODULE);
        // fund this test contract with tUSDC via the faucet (mints to caller)
        // faucet(uint256) is on the tUSDC contract; mint 100 tUSDC (6dp)
        (bool ok, ) = TUSDC.call(abi.encodeWithSignature("faucet(uint256)", 100e6));
        require(ok, "faucet failed");
        IERC20(TUSDC).approve(address(vault), type(uint256).max);
    }

    function test_Fork_CreateAndExecuteOnRealResolvedMarket() public {
        // The real market 2ef5 already resolved DOWN. Create a DOWN condition -> should be Satisfied
        // and immediately executable.
        uint256 id = vault.createCondition(
            MARKET,
            TUSDC,
            OraclelessConditionVault.ExpectedOutcome.DOWN,
            recipient,
            25e6, // 25 tUSDC
            uint64(block.timestamp) + 3600
        );
        assertEq(uint8(vault.conditionState(id)), uint8(OraclelessConditionVault.ConditionState.Satisfied));

        uint256 recipientBefore = IERC20(TUSDC).balanceOf(recipient);
        vault.execute(id);
        uint256 recipientAfter = IERC20(TUSDC).balanceOf(recipient);
        assertEq(recipientAfter - recipientBefore, 25e6);
        assertEq(uint8(vault.conditionState(id)), uint8(OraclelessConditionVault.ConditionState.Executed));
    }

    function test_Fork_WrongExpectedOutcomeFailsClosed() public {
        // Same real market resolved DOWN; expect UP -> Failed, cannot execute
        uint256 id = vault.createCondition(
            MARKET,
            TUSDC,
            OraclelessConditionVault.ExpectedOutcome.UP,
            recipient,
            25e6,
            uint64(block.timestamp) + 3600
        );
        assertEq(uint8(vault.conditionState(id)), uint8(OraclelessConditionVault.ConditionState.Failed));
        vm.expectRevert(OraclelessConditionVault.MarketVoided.selector);
        vault.execute(id);
        assertEq(IERC20(TUSDC).balanceOf(address(vault)), 25e6);
    }
}
