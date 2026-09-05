// ORACLELESS verify CLI — independent chain-state verification of a condition.
// Reads the vault + the referenced DreamDEX market contract DIRECTLY from the
// chain (no indexer, no backend, no frontend state). Exits non-zero on failure.
//
// Usage: node scripts/verify.mjs <conditionId>
//        node scripts/verify.mjs <conditionId> --json

import { createPublicClient, http, parseAbi } from "viem";

const RPC = process.env.RPC_URL ?? "https://dream-rpc.somnia.network";
const VAULT = process.env.VITE_CONDITION_VAULT ?? process.env.CONDITION_VAULT;
const MODULE = "0x3ecC694Cef705358864a646142ac17A90E29e388"; // DreamDEX BinaryMarketsModule (CREATE3, same on testnet/mainnet)

if (!VAULT) {
  console.error("ERROR: set CONDITION_VAULT (or VITE_CONDITION_VAULT) to the deployed OraclelessConditionVault address.");
  process.exit(1);
}

const id = process.argv[2];
if (!id || !/^\d+$/.test(id)) {
  console.error("Usage: node scripts/verify.mjs <conditionId> [--json]");
  process.exit(1);
}

const client = createPublicClient({ transport: http(RPC) });

const vaultAbi = [
  {
    type: "function",
    name: "conditionState",
    stateMutability: "view",
    inputs: [{ name: "conditionId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "getCondition",
    stateMutability: "view",
    inputs: [{ name: "conditionId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "marketId", type: "bytes32" },
          { name: "market", type: "address" },
          { name: "collateral", type: "address" },
          { name: "expected", type: "uint8" },
          { name: "recipient", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "expiry", type: "uint64" },
          { name: "creator", type: "address" },
          { name: "state", type: "uint8" },
        ],
      },
    ],
  },
];

const marketAbi = parseAbi([
  "function isResolved() view returns (bool)",
  "function isVoided() view returns (bool)",
  "function payoutNumerators() view returns (uint256[])",
]);
const moduleAbi = parseAbi([
  "function markets(bytes32 marketId) view returns (uint256 oracleQuestionId, uint8 outcomeSlotCount, uint8 voidPolicy, address collateral, uint32 originOperatorId, bytes32 originVenueId, address oracleAdapter, address creator, address market, address pool, uint256 yesId, uint256 noId, uint64 tradingStart, uint64 expiry)",
]);

const STATE = ["PENDING", "SATISFIED", "FAILED", "EXECUTED", "EXPIRED"];

function argmax(arr) {
  let best = 0n;
  let idx = 0;
  arr.forEach((v, i) => {
    if (v > best) {
      best = v;
      idx = i;
    }
  });
  return idx;
}

async function main() {
  const [cond, state] = await Promise.all([
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: "getCondition", args: [BigInt(id)] }),
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: "conditionState", args: [BigInt(id)] }),
  ]);

  const stateName = STATE[Number(state)] ?? `UNKNOWN(${state})`;
  const expRaw = cond.expected;
  const expLabel = expRaw === 0n || expRaw === 0 ? "UP" : expRaw === 1n || expRaw === 1 ? "DOWN" : String(expRaw);
  const out = {
    condition: id,
    vault: VAULT,
    expected: expLabel,
    recipient: cond.recipient,
    amountRaw: cond.amount.toString(),
    expiry: Number(cond.expiry),
    creator: cond.creator,
    marketId: cond.marketId,
    conditionState: stateName,
  };

  // Independently re-derive the market outcome from canonical state
  let market = null;
  try {
    const rec = await client.readContract({ address: MODULE, abi: moduleAbi, functionName: "markets", args: [cond.marketId] });
    market = rec[8]; // field index 8 = per-window market contract
    const [resolved, voided, payouts] = await Promise.all([
      client.readContract({ address: market, abi: marketAbi, functionName: "isResolved" }),
      client.readContract({ address: market, abi: marketAbi, functionName: "isVoided" }),
      client.readContract({ address: market, abi: marketAbi, functionName: "payoutNumerators" }),
    ]);
    out.marketContract = market;
    out.marketResolved = resolved;
    out.marketVoided = voided;
    out.payoutNumerators = payouts.map(String);
    if (resolved && !voided) {
      const winner = argmax(payouts);
      out.actualOutcome = winner === 0 ? "UP" : winner === 1 ? "DOWN" : String(winner);
      out.conditionHolds = out.actualOutcome === out.expected;
    } else if (voided) {
      out.actualOutcome = "VOIDED";
      out.conditionHolds = false;
    } else {
      out.actualOutcome = "UNRESOLVED";
      out.conditionHolds = null;
    }
  } catch (e) {
    out.marketError = String(e.message ?? e).slice(0, 200);
  }

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`CONDITION #${out.condition}`);
    console.log(`  vault:            ${out.vault}`);
    console.log(`  marketId:         ${out.marketId}`);
    console.log(`  expected:         ${out.expected}`);
    console.log(`  recipient:        ${out.recipient}`);
    console.log(`  amount:           ${(BigInt(out.amountRaw) / 1000000n).toString()} tUSDC`);
    console.log(`  expiry:           ${new Date(out.expiry * 1000).toISOString()}`);
    if (out.marketContract) console.log(`  market contract:  ${out.marketContract}`);
    if (out.marketResolved !== undefined) console.log(`  market resolved:  ${out.marketResolved}`);
    if (out.actualOutcome) console.log(`  actual outcome:   ${out.actualOutcome}`);
    console.log(`  condition:        ${out.conditionHolds === true ? "TRUE" : out.conditionHolds === false ? "FALSE" : "N/A"}`);
    console.log(`  state:            ${out.conditionState}`);
    if (out.conditionHolds === false && out.conditionState === "SATISFIED") {
      console.error("INCONSISTENCY: condition state SATISFIED but on-chain outcome does not match expected.");
      process.exit(2);
    }
  }
}

main().catch((e) => {
  console.error("Verification failed:", e.message ?? e);
  process.exit(1);
});
