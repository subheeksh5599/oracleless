// ORACLELESS - shared chain reads + formatting helpers.
// Every function here reads the vault and the DreamDEX market contracts
// directly from the chain. Nothing is cached, nothing is backend-served.

import { createPublicClient, http, parseAbi } from "viem";
import { CONDITION_VAULT, EXPLORER_URL, RPC_URL, somniaShannon, vaultAbi } from "./config";

export const publicClient = createPublicClient({ chain: somniaShannon, transport: http(RPC_URL) });

export const STATE_NAMES = ["PENDING", "SATISFIED", "FAILED", "EXECUTED", "EXPIRED"] as const;

export interface ConditionRow {
  marketId: string;
  market: string;
  collateral: string;
  expected: number; // 0 = UP, 1 = DOWN
  recipient: string;
  amount: bigint;
  expiry: bigint;
  creator: string;
}

export interface MarketState {
  resolved: boolean;
  voided: boolean;
  winner: number | null; // 0 = UP, 1 = DOWN
  payouts: string[];
}

const marketAbi = parseAbi([
  "function isResolved() view returns (bool)",
  "function isVoided() view returns (bool)",
  "function payoutNumerators() view returns (uint256[])",
]);

export async function readCondition(id: bigint): Promise<ConditionRow> {
  return (await publicClient.readContract({
    address: CONDITION_VAULT as `0x${string}`,
    abi: vaultAbi,
    functionName: "getCondition",
    args: [id],
  })) as unknown as ConditionRow;
}

export async function readConditionState(id: bigint): Promise<number> {
  return Number(
    await publicClient.readContract({
      address: CONDITION_VAULT as `0x${string}`,
      abi: vaultAbi,
      functionName: "conditionState",
      args: [id],
    }),
  );
}

export async function readConditionCount(): Promise<number> {
  if (!CONDITION_VAULT) return 0;
  return Number(
    await publicClient.readContract({
      address: CONDITION_VAULT as `0x${string}`,
      abi: vaultAbi,
      functionName: "conditionCount",
    }),
  );
}

/** Read a referenced DreamDEX market's canonical settlement state. */
export async function readMarketState(market: string): Promise<MarketState | null> {
  try {
    const [resolved, voided, payouts] = await Promise.all([
      publicClient.readContract({ address: market as `0x${string}`, abi: marketAbi, functionName: "isResolved" }),
      publicClient.readContract({ address: market as `0x${string}`, abi: marketAbi, functionName: "isVoided" }),
      publicClient.readContract({ address: market as `0x${string}`, abi: marketAbi, functionName: "payoutNumerators" }),
    ]);
    let winner: number | null = null;
    if (resolved && !voided) {
      let best = 0n;
      (payouts as bigint[]).forEach((v, i) => {
        if (v > best) {
          best = v;
          winner = i;
        }
      });
    }
    return { resolved: Boolean(resolved), voided: Boolean(voided), winner, payouts: (payouts as bigint[]).map((p) => p.toString()) };
  } catch {
    return null;
  }
}

export function addrLink(a: string): string {
  return `${EXPLORER_URL}/address/${a}`;
}

export function txLink(h: string): string {
  return `${EXPLORER_URL}/tx/${h}`;
}

export function sideLabel(expected: number): string {
  return expected === 0 ? "UP" : "DOWN";
}

export function formatAmount(raw: bigint): string {
  return (Number(raw) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
