// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IDreamDexBinaryModule, IDreamDexBinaryMarket} from "./interfaces/IDreamDex.sol";

/// @title OraclelessConditionVault
/// @notice Turns finalized DreamDEX Event Contract outcomes into conditions that
///         gate arbitrary external actions (v1: release of escrowed ERC-20 funds).
///
///         "DreamDEX determines what happened. ORACLELESS determines what that
///          fact is allowed to trigger."
///
/// @dev Trust model:
///      - DreamDEX's canonical on-chain market state is the ONLY source of truth
///        for whether a condition is satisfied. No indexer, no frontend, no
///        backend, no keeper decides it.
///      - execute() is permissionless: anyone may call it, but nobody can make a
///        condition release funds unless the referenced market is resolved and
///        its winning outcome (argmax of the payout vector) matches the expected
///        outcome recorded at creation.
///      - Every condition's parameters (market, expected outcome, recipient,
///        amount, expiry) are immutable once created.
///      - Voided markets fail closed (no release). Expired conditions fail safely
///        (creator reclaims). Unresolved conditions cannot execute.
contract OraclelessConditionVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ //
    // Errors
    // ------------------------------------------------------------------ //
    error ZeroAddress();
    error ZeroAmount();
    error MarketNotResolved();
    error MarketVoided();
    error ConditionExpired();
    error NotExpectedOutcome();
    error AlreadyExecuted();
    error NotCreator();
    error ConditionNotExpired();
    error ConditionCountExceeded();
    error MarketNotLive(); // market contract returned zero address (unknown marketId)

    // ------------------------------------------------------------------ //
    // Types
    // ------------------------------------------------------------------ //

    /// @dev Expected outcome for a binary event market.
    ///      payoutNumerators argmax index 0 == YES (Up), index 1 == NO (Down).
    enum ExpectedOutcome {
        UP, // argmax index 0
        DOWN // argmax index 1
    }

    enum ConditionState {
        Pending, // created, awaiting funding or market resolution
        Satisfied, // market resolved to expected outcome, funds releasable
        Failed, // market resolved to other outcome, or voided
        Executed, // funds released to recipient
        Expired // creator reclaimed after expiry
    }

    struct Condition {
        bytes32 marketId; // DreamDEX event market id
        address market; // resolved per-window market contract (from module.markets)
        address collateral; // token locked (must match market collateral)
        ExpectedOutcome expected; // UP or DOWN
        address recipient; // who receives funds when condition is true
        uint256 amount; // amount locked (immutable)
        uint64 expiry; // unix ts; after this, creator may reclaim if not executed
        address creator; // who funded the condition
        ConditionState state;
    }

    // ------------------------------------------------------------------ //
    // Immutable config
    // ------------------------------------------------------------------ //
    address public immutable binaryModule; // DreamDEX BinaryMarketsModule

    // ------------------------------------------------------------------ //
    // Storage
    // ------------------------------------------------------------------ //
    uint256 public conditionCount;
    mapping(uint256 => Condition) public conditions;

    // ------------------------------------------------------------------ //
    // Events
    // ------------------------------------------------------------------ //
    event ConditionCreated(
        uint256 indexed conditionId,
        bytes32 indexed marketId,
        address indexed creator,
        address recipient,
        address collateral,
        uint256 amount,
        uint8 expected, // ExpectedOutcome
        uint64 expiry
    );
    event ConditionExecuted(
        uint256 indexed conditionId,
        address indexed recipient,
        uint256 amount,
        address executor,
        uint8 actualOutcome
    );
    event ConditionExpiredReclaimed(uint256 indexed conditionId, address indexed creator, uint256 amount);

    // ------------------------------------------------------------------ //
    // Constructor
    // ------------------------------------------------------------------ //
    constructor(address binaryModule_) {
        if (binaryModule_ == address(0)) revert ZeroAddress();
        binaryModule = binaryModule_;
    }

    // ------------------------------------------------------------------ //
    // Read helpers
    // ------------------------------------------------------------------ //

    /// @notice Explicit struct getter (public mapping getters return a tuple,
    ///         not the struct — needed for cross-contract/test reads).
    function getCondition(uint256 conditionId) external view returns (Condition memory) {
        return conditions[conditionId];
    }

    /// @notice Current state of a condition, recomputed fresh from chain state.
    function conditionState(uint256 conditionId) public view returns (ConditionState) {
        Condition storage c = conditions[conditionId];
        if (c.creator == address(0)) revert ConditionCountExceeded(); // never created
        if (c.state == ConditionState.Executed || c.state == ConditionState.Expired) {
            return c.state;
        }
        (bool resolved, bool voided, uint8 winnerIdx) = _readMarket(c.market);
        if (!resolved) {
            // Not yet resolved: if past expiry, it is effectively expired (creator may reclaim)
            return block.timestamp >= c.expiry ? ConditionState.Expired : ConditionState.Pending;
        }
        if (voided) return ConditionState.Failed; // fail closed
        uint8 expectedIdx = c.expected == ExpectedOutcome.UP ? 0 : 1;
        return winnerIdx == expectedIdx ? ConditionState.Satisfied : ConditionState.Failed;
    }

    // ------------------------------------------------------------------ //
    // Creator: create + fund in one call
    // ------------------------------------------------------------------ //

    /// @notice Create and fund a condition in one transaction.
    ///         Pulls `amount` of `collateral_` from the caller and locks it.
    function createCondition(
        bytes32 marketId_,
        address collateral_,
        ExpectedOutcome expected_,
        address recipient_,
        uint256 amount_,
        uint64 expiry_
    ) external nonReentrant returns (uint256 conditionId) {
        if (collateral_ == address(0)) revert ZeroAddress();
        if (recipient_ == address(0)) revert ZeroAddress();
        if (amount_ == 0) revert ZeroAmount();
        if (expiry_ <= block.timestamp) revert ConditionExpired();

        // Resolve the per-window market contract from the module's canonical record.
        // This also validates the marketId exists (reverts MarketNotLive if unset).
        (, , , , , , , , address market, , , , , ) = IDreamDexBinaryModule(binaryModule).markets(marketId_);
        if (market == address(0)) revert MarketNotLive();

        conditionId = ++conditionCount;
        conditions[conditionId] = Condition({
            marketId: marketId_,
            market: market,
            collateral: collateral_,
            expected: expected_,
            recipient: recipient_,
            amount: amount_,
            expiry: expiry_,
            creator: msg.sender,
            state: ConditionState.Pending
        });

        IERC20(collateral_).safeTransferFrom(msg.sender, address(this), amount_);

        emit ConditionCreated(
            conditionId, marketId_, msg.sender, recipient_, collateral_, amount_, uint8(expected_), expiry_
        );
    }

    // ------------------------------------------------------------------ //
    // Permissionless execution
    // ------------------------------------------------------------------ //

    /// @notice Anyone may call. Releases funds to the recipient ONLY if the
    ///         referenced DreamDEX market has resolved with the expected outcome.
    ///         The caller cannot influence the outcome, parameters, or recipient.
    function execute(uint256 conditionId) external nonReentrant {
        Condition storage c = conditions[conditionId];
        if (c.creator == address(0)) revert ConditionCountExceeded();

        ConditionState st = conditionState(conditionId);
        if (st == ConditionState.Executed) revert AlreadyExecuted();
        if (st == ConditionState.Expired) revert ConditionExpired();
        if (block.timestamp >= c.expiry) revert ConditionExpired();
        if (st == ConditionState.Failed) revert MarketVoided(); // covers voided + wrong outcome
        if (st != ConditionState.Satisfied) revert MarketNotResolved();

        (bool resolved, bool voided, uint8 winnerIdx) = _readMarket(c.market);
        if (!resolved || voided) revert MarketNotResolved();

        c.state = ConditionState.Executed;
        uint256 amount = c.amount;
        address recipient = c.recipient;
        address token = c.collateral;

        IERC20(token).safeTransfer(recipient, amount);

        emit ConditionExecuted(conditionId, recipient, amount, msg.sender, winnerIdx);
    }

    // ------------------------------------------------------------------ //
    // Creator: reclaim after expiry (fail-safe)
    // ------------------------------------------------------------------ //

    /// @notice After expiry, the creator may reclaim locked funds if the condition
    ///         never executed. Fails closed: cannot reclaim before expiry, cannot
    ///         reclaim after execution.
    function reclaim(uint256 conditionId) external nonReentrant {
        Condition storage c = conditions[conditionId];
        if (c.creator == address(0)) revert ConditionCountExceeded();
        if (msg.sender != c.creator) revert NotCreator();
        if (block.timestamp < c.expiry) revert ConditionNotExpired();

        ConditionState st = conditionState(conditionId);
        if (st == ConditionState.Executed) revert AlreadyExecuted();
        if (st == ConditionState.Satisfied) {
            // Market already resolved to expected outcome: release to recipient,
            // not reclaim — the condition is live and true.
            // (An executor could still call execute(); but the creator calling
            //  reclaim on a satisfied condition must not be able to divert funds.)
            revert AlreadyExecuted(); // keep it simple: satisfied => only execute()
        }
        if (block.timestamp < c.expiry) revert ConditionNotExpired();

        c.state = ConditionState.Expired;
        uint256 amount = c.amount;
        IERC20(c.collateral).safeTransfer(msg.sender, amount);
        emit ConditionExpiredReclaimed(conditionId, msg.sender, amount);
    }

    // ------------------------------------------------------------------ //
    // Internal
    // ------------------------------------------------------------------ //

    /// @dev Reads the canonical market state. Winner = argmax(payoutNumerators),
    ///      gated on isResolved. Voided fails closed.
    function _readMarket(address market)
        internal
        view
        returns (bool resolved, bool voided, uint8 winnerIdx)
    {
        resolved = IDreamDexBinaryMarket(market).isResolved();
        if (!resolved) return (false, false, 0);
        voided = IDreamDexBinaryMarket(market).isVoided();
        if (voided) return (true, true, 0);
        uint256[] memory payouts = IDreamDexBinaryMarket(market).payoutNumerators();
        // argmax
        uint256 best = 0;
        for (uint256 i = 0; i < payouts.length; i++) {
            if (payouts[i] > best) {
                best = payouts[i];
                winnerIdx = uint8(i);
            }
        }
        return (true, false, winnerIdx);
    }
}
