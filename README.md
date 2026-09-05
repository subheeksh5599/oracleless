# ORACLELESS

**DreamDEX determines what happened. ORACLELESS determines what that fact is allowed to trigger.**

ORACLELESS turns finalized DreamDEX Event Contracts into programmable conditions for arbitrary external smart-contract actions. A third-party contract can say: *"release these funds only if this DreamDEX market settles UP"* — and the vault enforces it from the chain's canonical state. No oracle provider, no backend, no AI, no keeper.

> DreamDEX Event Contracts already turn uncertain future events into deterministic on-chain outcomes. ORACLELESS makes those outcomes consumable as conditions for arbitrary external smart-contract actions.

Built for the **Somnia × DreamDEX Event Contracts Hackathon**.

---

## Why this is not Branch

| | |
|---|---|
| **Branch** | outcome → *another DreamDEX trade* (a trading strategy) |
| **ORACLELESS** | outcome → *arbitrary external programmable contract action* (payment, escrow, treasury, agent authority) |

Branch lets a trader chain DreamDEX positions. ORACLELESS is a condition layer: any contract (not just a trader) can lock an action behind a DreamDEX settlement and have the vault enforce it. The consumer of the outcome is an external contract, not another order.

## How it works

```
  Creator locks tUSDC in a Condition:
    IF  DreamDEX market M settles UP
    THEN release <amount> to <recipient>
    (expiry, immutable params)

  Anyone (permissionless) calls execute(conditionId):

    vault reads M's canonical on-chain state
      ├─ unresolved  → BLOCKED (no release)
      ├─ voided      → FAIL CLOSED (no release)
      ├─ wrong side  → FAIL CLOSED (no release)
      └─ expected side → release funds to recipient
```

- **Source of truth is the chain.** The vault reads the per-window DreamDEX market contract's `isResolved()` + `payoutNumerators()` (Settlement v3: winner = argmax of the payout vector; `winningOutcome()` was removed). No indexer, frontend, backend, or keeper decides the outcome.
- **Permissionless execution.** Anyone may call `execute()`. Nobody can fake the outcome, redirect the payout, or mutate the condition.
- **Fail closed.** Voided, wrong-outcome, unresolved, and expired conditions never release funds. The creator reclaims after expiry.

## Contracts (Shannon testnet, chain 50312)

| Contract | Address |
|---|---|
| OraclelessConditionVault | *see deployments/shannon.json* |
| DreamDEX BinaryMarketsModule | `0x3ecC694Cef705358864a646142ac17A90E29e388` (CREATE3) |
| Collateral (testnet) | tUSDC `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` (6 dp, faucet mints to caller) |

## Repository layout

| Path | What |
|---|---|
| `contracts/` | Foundry: `OraclelessConditionVault.sol`, interfaces mirroring markets-sdk 0.29.0 ABIs, deploy script |
| `contracts/test/` | 17 unit tests (happy path, fail-closed, adversarial) + 2 fork E2E tests against **real Shannon state** |
| `web/` | Vite + React + viem frontend: create a condition against live DreamDEX markets, verify from chain |
| `web/scripts/verify.mjs` | Independent CLI verifier — re-derives a condition from chain state, exits non-zero on failure |

## Verify

```bash
cd web
CONDITION_VAULT=<deployed vault> node scripts/verify.mjs 42
```

Reads the vault + the referenced DreamDEX market contract directly from the chain and prints expected vs actual outcome, condition state, and whether it holds.

## Test

```bash
cd contracts
forge test          # 17 unit tests
# fork E2E (requires an anvil fork of Shannon):
anvil --fork-url https://dream-rpc.somnia.network --port 8545 &
forge test --match-path test/ForkE2E.t.sol
```

## Deploy

```bash
cd contracts
PRIVATE_KEY=<deployer> forge script script/Deploy.s.sol \
  --rpc-url https://dream-rpc.somnia.network --broadcast
```

## Security model

- The vault **never** determines whether an event occurred — DreamDEX's canonical settlement state is the only source of truth.
- Execution permission is separate from payout ownership: anyone can trigger, only the pre-set recipient receives.
- Reentrancy-guarded; checks-effects-interactions; parameters immutable after creation; no admin keys that can move funds; creator reclaim only after expiry and only if not executed.
- Full threat model + limitations: `SECURITY.md` (see repo docs).

## License

MIT
