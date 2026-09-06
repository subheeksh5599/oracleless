import { useEffect, useState } from "react";
import { createWalletClient, custom } from "viem";
import { somniaShannon } from "../lib/config";
import { shortAddr } from "../lib/wallet";
import { Button } from "../components/ui/button";

export function useWallet() {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => {
      const eth = window.ethereum;
      if (!eth) return;
      eth.request({ method: "eth_accounts" }).then((a) => {
        const accts = a as string[];
        setAddress((accts[0] as `0x${string}`) ?? null);
      });
      eth.request({ method: "eth_chainId" }).then((c) => setChainId(Number(c)));
    };
    sync();
    window.ethereum?.on?.("accountsChanged", sync);
    window.ethereum?.on?.("chainChanged", sync);
    const t = setInterval(sync, 4000);
    return () => {
      clearInterval(t);
      window.ethereum?.removeListener?.("accountsChanged", sync);
      window.ethereum?.removeListener?.("chainChanged", sync);
    };
  }, []);

  return { address, chainId };
}

export async function ensureConnected(): Promise<`0x${string}` | null> {
  const eth = window.ethereum;
  if (!eth) return null;
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  return (accounts[0] as `0x${string}`) ?? null;
}

export async function switchToShannon(): Promise<boolean> {
  const eth = window.ethereum;
  if (!eth) return false;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${somniaShannon.id.toString(16)}` }] });
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
  return true;
}

export function makeWalletClient() {
  if (!window.ethereum) return null;
  return createWalletClient({ chain: somniaShannon, transport: custom(window.ethereum) });
}

export function WalletButton({ className }: { className?: string }) {
  const { address, chainId } = useWallet();
  const connected = !!address;
  const wrong = connected && chainId !== somniaShannon.id;

  const connect = async () => {
    await ensureConnected();
    await switchToShannon();
  };

  if (!connected) {
    return (
      <Button
        className={`border-2 border-foreground bg-[#d9ff00] px-3 py-1.5 text-[13px] font-semibold text-foreground shadow-[3px_3px_0_#0a0a0a] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none ${className ?? ""}`}
        onClick={connect}
      >
        Connect wallet
      </Button>
    );
  }

  if (wrong) {
    return (
      <Button className={`border-2 border-foreground bg-[#ff4d00] px-3 py-1.5 text-[13px] font-semibold text-foreground ${className ?? ""}`} onClick={connect}>
        Switch to Shannon
      </Button>
    );
  }

  return (
    <span className="data flex items-center gap-1.5 border border-foreground/30 bg-white/60 px-2.5 py-1 text-xs" title={address}>
      <span className="inline-block size-1.5 rounded-full bg-[#2c5f4d]" />
      {shortAddr(address)}
    </span>
  );
}
