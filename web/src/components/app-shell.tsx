import { useEffect, useState } from "react";
import { nav, useRoute } from "../lib/router";
import { CONDITION_VAULT } from "../lib/config";
import { ensureConnected, shortAddr, switchToShannon, useWallet } from "../lib/wallet";
import { readConditionCount } from "../lib/chain";
import { Button } from "../components/ui/button";

const NAV = [
  { route: "/app", label: "Create", hint: "new condition" },
  { route: "/app/conditions", label: "Conditions", hint: "all on the vault" },
  { route: "/app/verify", label: "Verify", hint: "from chain state" },
  { route: "/app/docs", label: "Docs", hint: "how it works" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const route = useRoute();
  const wallet = useWallet();
  const [count, setCount] = useState<number | null>(null);
  const wrong = !!wallet.address && wallet.chainId !== 50312;

  useEffect(() => {
    if (CONDITION_VAULT) {
      readConditionCount().then(setCount).catch(() => setCount(null));
    }
  }, []);

  const connect = async () => {
    await ensureConnected();
    await switchToShannon();
  };

  return (
    <div className="flex min-h-dvh bg-[#edeae3]">
      {/* sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-56 flex-col border-r-2 border-foreground bg-[#0a0a0a] text-[#edeae3]">
        <div className="border-b border-[#edeae3]/15 p-4">
          <button className="display text-lg font-bold uppercase tracking-tight text-[#d9ff00]" onClick={() => nav("/")}>
            ◈ ORACLELESS
          </button>
          <div className="data mt-1 text-[10px] uppercase tracking-widest text-[#edeae3]/40">Condition layer</div>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((n) => {
            const active =
              route === n.route || (n.route === "/app" && route.startsWith("/app/condition")) || (n.route === "/app/conditions" && route.startsWith("/app/condition"));
            return (
              <button
                key={n.route}
                className={`flex w-full items-center justify-between border-l-2 px-3 py-2.5 text-left transition-colors ${
                  active ? "border-[#d9ff00] bg-[#d9ff00]/10" : "border-transparent hover:bg-[#edeae3]/5"
                }`}
                onClick={() => nav(n.route)}
              >
                <span className={`display text-sm uppercase tracking-wide ${active ? "text-[#d9ff00]" : ""}`}>{n.label}</span>
                <span className="data text-[9px] uppercase tracking-wider text-[#edeae3]/30">{n.hint}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-[#edeae3]/15 p-3">
          <div className="flex items-center gap-2 text-[11px] text-[#edeae3]/60">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-[#d9ff00]" />
            <span className="data uppercase tracking-wider">Shannon live</span>
          </div>
          <div className="data truncate text-[10px] text-[#edeae3]/40">
            {CONDITION_VAULT ? `vault ${CONDITION_VAULT.slice(0, 8)}...` : "vault unset"}
          </div>
          <div className="data text-[10px] text-[#edeae3]/40">{count === null ? "-" : count} conditions on vault</div>
        </div>
      </aside>

      {/* main column */}
      <div className="ml-56 flex min-h-dvh flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b-2 border-foreground bg-[#edeae3]/95 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            {wrong && (
              <Button size="sm" className="data border-2 border-foreground bg-[#ff4d00] text-[11px] uppercase tracking-wider" onClick={() => switchToShannon()}>
                Wrong network, switch to Shannon
              </Button>
            )}
            {!wrong && wallet.address && (
              <span className="data text-[11px] uppercase tracking-wider text-foreground/50">Somnia Shannon, chain 50312</span>
            )}
          </div>
          {!wallet.address ? (
            <Button
              className="border-2 border-foreground bg-[#d9ff00] px-3 py-1 text-[12px] font-semibold text-foreground shadow-[2px_2px_0_#0a0a0a] hover:shadow-none"
              onClick={connect}
            >
              Connect wallet
            </Button>
          ) : (
            <span className="data flex items-center gap-1.5 border border-foreground/30 bg-white/60 px-2.5 py-1 text-xs" title={wallet.address}>
              <span className="inline-block size-1.5 rounded-full bg-[#2c5f4d]" />
              {shortAddr(wallet.address)}
            </span>
          )}
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
