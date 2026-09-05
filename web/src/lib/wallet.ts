import { useSyncExternalStore } from "react";
import { createWalletClient, custom, type WalletClient } from "viem";
import { somniaShannon } from "./config";

export interface WalletState {
  address: `0x${string}` | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, cb: (...args: unknown[]) => void) => void;
      removeListener: (event: string, cb: (...args: unknown[]) => void) => void;
    };
  }
}

let state: WalletState = { address: null, chainId: null, connecting: false, error: null };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function getSnapshot(): WalletState {
  return state;
}

async function refresh() {
  const eth = window.ethereum;
  if (!eth) {
    state = { address: null, chainId: null, connecting: false, error: "No wallet found. Install MetaMask or an injected wallet." };
    emit();
    return;
  }
  try {
    const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
    const chainId = Number((await eth.request({ method: "eth_chainId" })) as string);
    state = { ...state, address: (accounts[0] as `0x${string}`) ?? null, chainId, error: null };
  } catch {
    /* keep prior state */
  }
  emit();
}

export function useWallet(): WalletState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function ensureConnected(): Promise<`0x${string}` | null> {
  const eth = window.ethereum;
  if (!eth) return null;
  try {
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    state = { ...state, address: (accounts[0] as `0x${string}`) ?? null };
    emit();
    return state.address;
  } catch {
    return null;
  }
}

export async function switchToShannon(): Promise<boolean> {
  const eth = window.ethereum;
  if (!eth) return false;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${somniaShannon.id.toString(16)}` }],
    });
  } catch (err) {
    const e = err as { code?: number };
    if (e.code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${somniaShannon.id.toString(16)}`,
            chainName: somniaShannon.name,
            nativeCurrency: somniaShannon.nativeCurrency,
            rpcUrls: [somniaShannon.rpcUrls.default.http[0]],
          },
        ],
      });
    } else return false;
  }
  await refresh();
  return true;
}

export function makeWalletClient(): WalletClient | null {
  if (!window.ethereum) return null;
  return createWalletClient({ chain: somniaShannon, transport: custom(window.ethereum) });
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
