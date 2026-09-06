<div align="center">

# ORACLELESS

&nbsp;

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-19%20passing-10b981)](#tests)
[![Solidity](https://img.shields.io/badge/Solidity%200.8.24%20·%20Foundry-1f1f23)]()
[![Somnia Shannon](https://img.shields.io/badge/Somnia%20Shannon%20·%20chain%2050312-e8b84b)]()
[![DreamDEX](https://img.shields.io/badge/Event%20Contracts-DreamDEX-3ecC69)]()

### DreamDEX determines what happened. ORACLELESS determines what that fact is allowed to trigger.

DreamDEX Event Contracts turn uncertain future events into deterministic on-chain outcomes. ORACLELESS makes those outcomes consumable as **programmable conditions for arbitrary external smart-contract actions** — a third-party contract can say *"release these funds only if this DreamDEX market settles UP,"* and the vault enforces it from the chain's canonical state. No oracle provider. No backend. No AI. No keeper.

Built for the **Somnia × DreamDEX Event Contracts Hackathon**.

**[ Live demo ↗ ](https://oracleless-prod.vercel.app)** &nbsp;·&nbsp; **[ The live receipt ↗ ](#the-live-receipt)** &nbsp;·&nbsp; **[ How it works ↗ ](#how-it-works)** &nbsp;·&nbsp; **[ Verify it ↗ ](#verify-it-yourself)** &nbsp;·&nbsp; **[ Run it locally ↗ ](#run-it-locally)**

</div>

---

## Table of contents

- [The problem I set out to solve](#the-problem-i-set-out-to-solve)
- [What I built](#what-i-built)
- [Why this is not Branch](#why-this-is-not-branch)
- [Architecture](#architecture)
- [The condition, step by step](#the-condition-step-by-step)
- [On-chain enforcement (Somnia Shannon)](#on-chain-enforcement-somnia-shannon)
- [The live receipt](#the-live-receipt)
- [Engineering decisions & the hard problems](#engineering-decisions--the-hard-problems)
- [What's real vs mock — the honesty table](#whats-real-vs-mock--the-honesty-table)
- [The app](#the-app)
- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Run it locally](#run-it-locally)
- [Tests](#tests)

---

## The problem I set out to solve

Prediction-market settlements are treated as an endpoint: an event settles, winners redeem, the story ends. But the settlement is also a **fact** — a deterministic, on-chain, adversarial-resistant statement about the world — and right now nothing lets other contracts act on that fact. A treasury can't say *"release this tranche only if the market proves X."* An escrow can't say *"refund the buyer if the market proves Y."* An agent can't hold authority that activates or dies with a market outcome. Every one of those would require building a custom settlement feed, trusting a backend, or wiring a new oracle.

That trust is the problem. The design rule was absolute: **the source of truth is the chain.** The vault never asks a frontend, an indexer, a backend, or a keeper what happened — it reads the DreamDEX market contract's own resolved state, and it releases funds only when that state says the condition holds.

## What I built

A condition layer that consumes finalized DreamDEX Event Contracts and exposes their outcomes to arbitrary smart contracts:

1. **Create** — anyone locks collateral into a `Condition`: `IF market M settles UP THEN release <amount> to <recipient>`. Market, expected outcome, recipient, amount, and expiry are immutable after creation.
2. **Enforce** — the vault evaluates the condition itself by reading the market contract's canonical state (`isResolved()` + `payoutNumerators()`, winner = argmax). It does not ask anyone what happened.
3. **Execute permissionlessly** — anyone can call `execute(conditionId)`. Nobody can fake the outcome, redirect the payout, or mutate the condition. If the market resolved to the expected outcome, funds go to the pre-set recipient; if it resolved the other way, was voided, is unresolved, or expired, **nothing is released**.
4. **Fail closed** — voided/invalid markets, wrong outcomes, and expired conditions never release. The creator reclaims after expiry.
5. **Verify from anywhere** — a proof page and a standalone CLI re-derive a condition's state from the chain and show expected vs actual outcome.

## Why this is not Branch

| | |
|---|---|
| **Branch** | outcome → *another DreamDEX trade* (a trading strategy) |
| **ORACLELESS** | outcome → *arbitrary external programmable contract action* (payment, escrow, treasury, agent authority) |

Branch chains DreamDEX positions. ORACLELESS is a condition layer: the consumer of the outcome is an external contract, not another order. ORACLELESS is not an oracle, prediction market, escrow product, or trading strategy.

## Architecture

```
  Creator locks tUSDC in a Condition:
    IF  DreamDEX market M settles UP
    THEN release <amount> to <recipient>
    (params immutable after creation)

  Anyone (permissionless) calls execute(conditionId):

    vault reads M's canonical on-chain state
      ├─ unresolved     → BLOCKED      (no release)
      ├─ voided         → FAIL CLOSED  (no release)
      ├─ wrong outcome  → FAIL CLOSED  (no release)
      └─ expected side  → funds released to recipient
```

| Contract | Role |
|---|---|
| `OraclelessConditionVault` | The condition registry + enforcer. Creates conditions, evaluates them against the DreamDEX market contract, releases funds only when the condition holds. |
| `IDreamDex` (interfaces) | Minimal typed view of the DreamDEX settlement surface the vault reads — mirrors the markets-sdk ABIs exactly. |
| DreamDEX `BinaryMarketsModule` | The venue's per-window market factory. `markets(bytes32)` → the canonical per-window market contract. ORACLELESS never controls it. |
| DreamDEX market contract | `isResolved()`, `isVoided()`, `payoutNumerators()` — the single source of settlement truth. |

## The condition, step by step

1. **Create** — the creator calls `createCondition(marketId, collateral, expected, recipient, amount, expiry)` and the tokens are pulled into the vault. A `ConditionCreated` event records the immutable parameters.
2. **Wait** — the vault tracks the referenced market through its lifecycle (listed → trading → locked → resolved/voided). No polling loop, no keeper — the market's own lifecycle drives it.
3. **Resolve** — when the DreamDEX market finalizes, its contract flips `isResolved()` and records `payoutNumerators()`. The winner is the index with the maximum payout — for binaries, `[1e7, 0]` means UP, `[0, 1e7]` means DOWN.
4. **Evaluate** — the vault recomputes the condition state from that canonical state on every read and before every `execute`. It never caches a verdict.
5. **Execute** — a permissionless `execute(conditionId)` re-checks the market state and, if the condition holds, transfers the locked collateral to the pre-set recipient. Wrong outcome, voided, unresolved, or expired → the call reverts and funds stay locked.

## On-chain enforcement (Somnia Shannon)

The vault's invariants are enforced in the contract, not in the UI:

- **Canonical reads only.** The vault calls the market contract directly — `isResolved()`, `isVoided()`, `payoutNumerators()` — and derives the winner. The indexer and frontend are conveniences, never truth.
- **Winner = argmax of the payout vector** (Settlement v3 semantics — `winningOutcome()` was removed from the SDK surface; the vault matches the current venue ABI).
- **No admin keys.** No function can redirect a payout, change a condition, or withdraw on the creator's behalf. Only the deterministic condition evaluation moves funds.
- **Checks-effects-interactions + reentrancy guard**, immutable parameters, and fail-closed terminal states.
- **Anyone can execute, only the recipient receives.** Execution permission and payout ownership are separate by construction.

## The live receipt

Everything below is real and on Somnia Shannon (chain 50312) — created and executed during the hackathon:

| Step | Tx | Status |
|---|---|---|
| Deploy `OraclelessConditionVault` | [`0x2cb0713a…7649`](https://shannon-explorer.somnia.network/tx/0x2cb0713a18c9ae8e2ec227ac0bd8720e8098762b5f50cadfeeeff4671ce07649) | ✅ success |
| Mint 1,000 tUSDC (faucet) | [`0x8e8dd02f…d61b`](https://shannon-explorer.somnia.network/tx/0x8e8dd02f4eb3d0e7c77b5d21eba0cfa5748ef0d6cd63ab75448db2533910d61b) | ✅ success |
| Approve vault to spend tUSDC | [`0xdd3ae1f0…a350`](https://shannon-explorer.somnia.network/tx/0xdd3ae1f0e0fe26ec6f937889901553cac71adfa7fa5b6bb191d764b33384a350) | ✅ success |
| **Create condition #1** (BTC market, expects UP, 100 tUSDC) | [`0x7f469326…e5eaf`](https://shannon-explorer.somnia.network/tx/0x7f4693263538ef503599ac4662639da2c3a4592cf853f21d1afc182a848e5eaf) | ✅ success |
| **Execute condition #1 → 100 tUSDC released** | [`0x882e7656…cb955`](https://shannon-explorer.somnia.network/tx/0x882e7656a2908fe5d20aea33adfb764b78ca2cc60f5882e8f0e234b6c4fcb955) | ✅ success |

| Contract | Address |
|---|---|
| `OraclelessConditionVault` | [`0xa40d72099A2db0DCb7696859Fe1A800D9dE4a7B5`](https://shannon-explorer.somnia.network/address/0xa40d72099A2db0DCb7696859Fe1A800D9dE4a7B5) |
| Condition #1 | market `0x…1445c` (BTC), expected **UP**, actual **UP**, state **EXECUTED**, 100 tUSDC → recipient |

Condition #1's market is already finalized, so the condition is immediately satisfiable — the honest way to prove the full settle → release path. The live app also lets you create a condition on a market that is still trading, then watch it settle and execute for real.

## Verify it yourself

```bash
# from the chain, no indexer, no backend:
cd web
CONDITION_VAULT=0xa40d72099A2db0DCb7696859Fe1A800D9dE4a7B5 node scripts/verify.mjs 1
```

Reads the vault + the referenced DreamDEX market contract directly from the chain and prints expected vs actual outcome, the condition state, and whether the condition holds. Or open the live app → **Verify** → condition id `1`, or the full proof page at [/#/condition/1](https://oracleless-prod.vercel.app/#/condition/1).

## Engineering decisions & the hard problems

- **Settlement v3 changed the outcome surface.** The SDK removed `winningOutcome()`; winners are now derived as the argmax of `payoutNumerators()`. The vault's interface mirrors the current ABI exactly — a fork-E2E test against real Shannon state locks this in.
- **The public RPC's gas estimation lies on contract creation.** `eth_estimateGas` returns ~19.5M for the vault's creation; forge's default broadcast cap (~1.16M) made the first deploy attempts run out of gas. The real fix was a manual create with the constructor argument and an explicit high gas limit.
- **No keeper, no cron, no server.** The demo's proof used an already-finalized market so the release is permissionless and immediate; a live trading market needs only one more transaction after it settles. Nothing in the system polls.
- **The vault is its own registry.** A separate `ConditionRegistry` contract would add a hop without adding a guarantee — each condition carries its full parameters and the vault exposes `conditionCount()` / `getCondition(id)` / `conditionState(id)`.

## What's real vs mock — the honesty table

| Claim | Reality |
|---|---|
| Vault deployed on Shannon | ✅ Real — source in `contracts/src/`, verified on-chain |
| Condition #1 created + executed | ✅ Real — two transactions above, funds moved |
| Vault reads canonical market state | ✅ Real — `eth_call` against the live market contract |
| 19 tests passing | ✅ Real — `forge test`, including 2 fork E2E tests against a live Shannon fork |
| Live frontend | ✅ Real — create / browse / verify against the live vault |
| Anything else | ❌ Nothing is mocked — no fake settlement, no demo-only code path, no hidden backend |

## The app

The live app at [oracleless-prod.vercel.app](https://oracleless-prod.vercel.app) is a thin, honest surface over the chain:

- **Home** — the condition flow, vault status, and live DreamDEX markets
- **Conditions** — create a condition on a live or settled DreamDEX market, then browse every condition on the vault
- **Condition proof page** — the timeline (created → funded → resolved → executed) and the canonical DreamDEX market state behind a condition, all read live from the chain
- **Verify** — expected vs on-chain outcome verdict
- **Docs** — trust model, contracts, CLI verifier

Every number on the site is a live chain read. There is no database.

## Tech stack

Solidity 0.8.24 · Foundry · Vite · React · TypeScript · viem · pnpm · Vercel · Somnia Shannon (chain 50312) · DreamDEX Event Contracts (markets-sdk 0.29.0 ABIs)

## Project layout

| Path | What |
|---|---|
| `contracts/src/OraclelessConditionVault.sol` | The condition layer — create, evaluate, execute, reclaim |
| `contracts/src/interfaces/IDreamDex.sol` | Typed DreamDEX settlement surface (markets, isResolved, payoutNumerators) |
| `contracts/test/` | 17 unit tests + 2 fork E2E tests against real Shannon state |
| `contracts/script/Deploy.s.sol` | Deployment script |
| `web/` | Vite + React + viem frontend |
| `web/scripts/verify.mjs` | Independent CLI verifier — exits non-zero on inconsistency |
| `deployments/shannon.json` | Live deployment record (RPC, explorer, addresses) |

## Run it locally

```bash
# contracts
cd contracts
forge build
forge test                       # 19 tests (unit + fork E2E)

# frontend
cd web
pnpm install
pnpm build                       # requires VITE_CONDITION_VAULT=0xa40d72099A2db0DCb7696859Fe1A800D9dE4a7B5
pnpm preview
```

## Tests

```bash
cd contracts
forge test
```

19 passing — 17 unit tests covering the happy path, fail-closed semantics (wrong outcome, voided, unresolved, expired), permissionless execution, and adversarial cases; plus 2 fork E2E tests that run against a live fork of Shannon state and prove a real finalized DreamDEX market triggers a real release.

---

<div align="center">

**ORACLELESS** — DreamDEX determines what happened. ORACLELESS determines what that fact is allowed to trigger.

[Somnia × DreamDEX Event Contracts Hackathon](https://dorahacks.io) · [Live app](https://oracleless-prod.vercel.app)

</div>
