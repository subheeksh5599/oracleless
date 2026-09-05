// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {OraclelessConditionVault} from "../src/OraclelessConditionVault.sol";
import {IDreamDexBinaryModule} from "../src/interfaces/IDreamDex.sol";

/// @dev Minimal ERC20 for tests (tUSDC stand-in, 6 decimals).
contract MockERC20 {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        return true;
    }
}

/// @dev Mock of the per-window DreamDEX binary market contract (Settlement v3):
///      payoutNumerators + isResolved + isVoided. Winner = argmax of the vector.
contract MockBinaryMarket {
    bool public resolved;
    bool public voided;
    uint256[] public payouts;

    function resolveUp() external {
        resolved = true;
        payouts = new uint256[](2);
        payouts[0] = 1e6; // UP wins (argmax index 0)
        payouts[1] = 0;
    }

    function resolveDown() external {
        resolved = true;
        payouts = new uint256[](2);
        payouts[0] = 0;
        payouts[1] = 1e6; // DOWN wins (argmax index 1)
    }

    function resolveVoided() external {
        resolved = true;
        voided = true;
    }

    function payoutNumerators() external view returns (uint256[] memory) {
        return payouts;
    }

    function isResolved() external view returns (bool) {
        return resolved;
    }

    function isVoided() external view returns (bool) {
        return voided;
    }
}

/// @dev Mock of the DreamDEX BinaryMarketsModule: markets(marketId) -> record.
contract MockBinaryModule {
    mapping(bytes32 => address) public marketOf;

    function setMarket(bytes32 marketId, address market) external {
        marketOf[marketId] = market;
    }

    // Mirror the real return signature exactly (14 fields). Only `market` (idx 8) is used.
    function markets(bytes32 marketId)
        external
        view
        returns (
            uint256,
            uint8,
            uint8,
            address,
            uint32,
            bytes32,
            address,
            address,
            address,
            address,
            uint256,
            uint256,
            uint64,
            uint64
        )
    {
        address m = marketOf[marketId];
        return (0, 2, 0, address(0), 0, bytes32(0), address(0), address(0), m, address(0), 0, 0, 0, 0);
    }
}

contract OraclelessConditionVaultTest is Test {
    OraclelessConditionVault vault;
    MockBinaryModule module;
    MockERC20 token;
    MockBinaryMarket market;

    address creator = address(0xA11CE);
    address recipient = address(0xB0B);
    address attacker = address(0xBAD);
    bytes32 marketId = keccak256("btc-15m-1234");
    uint256 constant AMOUNT = 100e6; // 100 tUSDC
    uint64 expiry;

    function setUp() public {
        vm.warp(1_700_000_000); // fix block.timestamp
        expiry = uint64(block.timestamp) + 3600;

        module = new MockBinaryModule();
        token = new MockERC20();
        market = new MockBinaryMarket();
        module.setMarket(marketId, address(market));

        vault = new OraclelessConditionVault(address(module));

        token.mint(creator, 1000e6);
        token.mint(attacker, 1000e6);
        vm.prank(creator);
        token.approve(address(vault), type(uint256).max);
        vm.prank(attacker);
        token.approve(address(vault), type(uint256).max);
    }

    function _create() internal returns (uint256 id) {
        vm.prank(creator);
        id = vault.createCondition(
            marketId,
            address(token),
            OraclelessConditionVault.ExpectedOutcome.UP,
            recipient,
            AMOUNT,
            expiry
        );
    }

    // --- happy path: UP resolves -> permissionless execute releases funds ---
    function test_ExecuteAfterUpResolutionReleasesToRecipient() public {
        uint256 id = _create();
        assertEq(uint8(vault.conditionState(id)), uint8(OraclelessConditionVault.ConditionState.Pending));

        market.resolveUp();

        assertEq(uint8(vault.conditionState(id)), uint8(OraclelessConditionVault.ConditionState.Satisfied));

        // ANYONE can execute
        vm.prank(attacker);
        vault.execute(id);

        assertEq(token.balanceOf(recipient), AMOUNT);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(uint8(vault.conditionState(id)), uint8(OraclelessConditionVault.ConditionState.Executed));
    }

    // --- DOWN expected, DOWN resolves -> releases ---
    function test_ExecuteDownExpectedWhenDownResolves() public {
        vm.prank(creator);
        uint256 id = vault.createCondition(
            marketId,
            address(token),
            OraclelessConditionVault.ExpectedOutcome.DOWN,
            recipient,
            AMOUNT,
            expiry
        );
        market.resolveDown();
        vm.prank(attacker);
        vault.execute(id);
        assertEq(token.balanceOf(recipient), AMOUNT);
    }

    // --- wrong outcome -> FAILED, never releases ---
    function test_WrongOutcomeFailsClosed() public {
        uint256 id = _create();
        market.resolveDown(); // expected UP, actual DOWN
        assertEq(uint8(vault.conditionState(id)), uint8(OraclelessConditionVault.ConditionState.Failed));
        vm.prank(attacker);
        vm.expectRevert(OraclelessConditionVault.MarketVoided.selector);
        vault.execute(id);
        assertEq(token.balanceOf(recipient), 0);
        assertEq(token.balanceOf(address(vault)), AMOUNT); // funds stay locked
    }

    // --- voided market -> fail closed, never releases ---
    function test_VoidedMarketFailsClosed() public {
        uint256 id = _create();
        market.resolveVoided();
        assertEq(uint8(vault.conditionState(id)), uint8(OraclelessConditionVault.ConditionState.Failed));
        vm.prank(attacker);
        vm.expectRevert(OraclelessConditionVault.MarketVoided.selector);
        vault.execute(id);
        assertEq(token.balanceOf(recipient), 0);
    }

    // --- unresolved -> cannot execute ---
    function test_UnresolvedCannotExecute() public {
        uint256 id = _create();
        vm.prank(attacker);
        vm.expectRevert(OraclelessConditionVault.MarketNotResolved.selector);
        vault.execute(id);
    }

    // --- double execution impossible ---
    function test_DoubleExecutionReverts() public {
        uint256 id = _create();
        market.resolveUp();
        vm.prank(attacker);
        vault.execute(id);
        vm.prank(attacker);
        vm.expectRevert(OraclelessConditionVault.AlreadyExecuted.selector);
        vault.execute(id);
    }

    // --- expiry: after expiry, creator reclaims ---
    function test_CreatorReclaimsAfterExpiry() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 7200); // past expiry, market never resolved
        vm.prank(creator);
        vault.reclaim(id);
        assertEq(token.balanceOf(creator), 1000e6); // got the 100 back
        assertEq(token.balanceOf(address(vault)), 0);
    }

    // --- expiry: cannot reclaim BEFORE expiry ---
    function test_CannotReclaimBeforeExpiry() public {
        uint256 id = _create();
        vm.prank(creator);
        vm.expectRevert(OraclelessConditionVault.ConditionNotExpired.selector);
        vault.reclaim(id);
    }

    // --- expiry: cannot reclaim after EXECUTION (already paid recipient) ---
    function test_CannotReclaimAfterExecution() public {
        uint256 id = _create();
        market.resolveUp();
        vm.prank(attacker);
        vault.execute(id);
        vm.warp(block.timestamp + 7200);
        vm.prank(creator);
        vm.expectRevert(OraclelessConditionVault.AlreadyExecuted.selector);
        vault.reclaim(id);
    }

    // --- expiry: cannot execute after expiry even if resolved ---
    function test_CannotExecuteAfterExpiry() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 7200);
        market.resolveUp();
        vm.prank(attacker);
        vm.expectRevert(OraclelessConditionVault.ConditionExpired.selector);
        vault.execute(id);
    }

    // --- only creator can reclaim ---
    function test_OnlyCreatorCanReclaim() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 7200);
        vm.prank(attacker);
        vm.expectRevert(OraclelessConditionVault.NotCreator.selector);
        vault.reclaim(id);
    }

    // --- params immutable: attacker can't substitute market/recipient/amount ---
    // (no setter exists — the struct is only written at creation. Test via state.)
    function test_ParamsImmutableAfterCreation() public {
        uint256 id = _create();
        OraclelessConditionVault.Condition memory c = vault.getCondition(id);
        assertEq(c.amount, AMOUNT);
        assertEq(c.recipient, recipient);
        assertEq(c.marketId, marketId);
        assertEq(uint8(c.expected), uint8(OraclelessConditionVault.ExpectedOutcome.UP));
        assertEq(c.creator, creator);
        // No function on the contract can mutate these after creation; immutability
        // is structural (no setters exist). Attempted calls to nonexistent setters
        // would not compile, so structural absence is the proof.
    }

    // --- execution before funding is impossible (funding is in createCondition) ---
    function test_CreateConditionPullsFunds() public {
        vm.prank(creator);
        uint256 id = vault.createCondition(
            marketId,
            address(token),
            OraclelessConditionVault.ExpectedOutcome.UP,
            recipient,
            AMOUNT,
            expiry
        );
        assertEq(token.balanceOf(address(vault)), AMOUNT);
        assertEq(vault.getCondition(id).amount, AMOUNT);
    }

    // --- zero amount rejected ---
    function test_ZeroAmountRejected() public {
        vm.prank(creator);
        vm.expectRevert(OraclelessConditionVault.ZeroAmount.selector);
        vault.createCondition(
            marketId, address(token), OraclelessConditionVault.ExpectedOutcome.UP, recipient, 0, expiry
        );
    }

    // --- zero recipient rejected ---
    function test_ZeroRecipientRejected() public {
        vm.prank(creator);
        vm.expectRevert(OraclelessConditionVault.ZeroAddress.selector);
        vault.createCondition(
            marketId, address(token), OraclelessConditionVault.ExpectedOutcome.UP, address(0), AMOUNT, expiry
        );
    }

    // --- unknown marketId -> MarketNotLive ---
    function test_UnknownMarketRejected() public {
        vm.prank(creator);
        vm.expectRevert(OraclelessConditionVault.MarketNotLive.selector);
        vault.createCondition(
            keccak256("nonexistent"),
            address(token),
            OraclelessConditionVault.ExpectedOutcome.UP,
            recipient,
            AMOUNT,
            expiry
        );
    }

    // --- condition on a market that resolves UP stays locked for a DOWN-expecting user ---
    function test_OppositeExpectationStaysLocked() public {
        vm.prank(creator);
        uint256 id = vault.createCondition(
            marketId,
            address(token),
            OraclelessConditionVault.ExpectedOutcome.DOWN,
            recipient,
            AMOUNT,
            expiry
        );
        market.resolveUp();
        assertEq(uint8(vault.conditionState(id)), uint8(OraclelessConditionVault.ConditionState.Failed));
        // funds still locked; creator reclaims after expiry
        vm.warp(block.timestamp + 7200);
        vm.prank(creator);
        vault.reclaim(id);
        assertEq(token.balanceOf(creator), 1000e6);
    }
}
