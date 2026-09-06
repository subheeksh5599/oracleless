import { useEffect, useState } from "react";
import { fetchLiveMarkets, marketLabel, marketQuestion, type LiveMarket } from "../lib/markets";
import { nav } from "../lib/router";
import { INDEXER_URL } from "../lib/config";
import { formatAmount, readCondition, readConditionCount, readConditionState } from "../lib/chain";
import { STATE_NAMES } from "../lib/chain";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { WalletButton } from "../components/wallet-button";

const RELEASE_TX = "0x882e7656a2908fe5d20aea33adfb764b78ca2cc60f5882e8f0e234b6c4fcb955";

const USECASES = [
  {
    n: "Escrow",
    title: "IF the market settles DOWN, THEN refund the buyer",
    body: "An escrow releases to the seller only when the agreed event outcome is proven on chain. No mediator, no backend.",
  },
  {
    n: "Treasury",
    title: "IF BTC settles UP, THEN release the tranche",
    body: "A treasury tranche unlocks only on a verified market outcome. The vault enforces it, not a multi-sig meeting.",
  },
  {
    n: "Agents",
    title: "IF the event resolves, THEN the agent authority activates",
    body: "An autonomous agent's spending power switches on only when the market settles the way the policy requires.",
  },
  {
    n: "Payouts",
    title: "IF the index settles DOWN, THEN trigger the protection payout",
    body: "Insurance-style payouts fire from the market settlement itself. Anyone can trigger the release; only the recipient receives.",
  },
];

const TRUST = [
  { t: "Source of truth is the chain", d: "The vault reads the market contract's isResolved and payout vector. No indexer, backend, AI, or keeper decides the outcome." },
  { t: "Anyone can execute, only the recipient receives", d: "execute() is permissionless. Nobody can fake the outcome, redirect the payout, or mutate the condition after creation." },
  { t: "Fail closed", d: "Wrong outcome, voided, unresolved, and expired conditions never release funds. The creator reclaims after expiry." },
  { t: "No admin keys", d: "No function can redirect a payout, change a condition, or withdraw on the creator's behalf. The deterministic evaluation moves funds." },
];

function useProof(): { count: number | null; c1: string | null; c1Amt: string | null } {
  const [count, setCount] = useState<number | null>(null);
  const [c1, setC1] = useState<string | null>(null);
  const [c1Amt, setC1Amt] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const [cnt, cond, st] = await Promise.all([readConditionCount(), readCondition(1n), readConditionState(1n)]);
        setCount(cnt);
        setC1(STATE_NAMES[st] ?? null);
        setC1Amt(formatAmount(cond.amount));
      } catch {
        /* ignore */
      }
    })();
  }, []);
  return { count, c1, c1Amt };
}

function HomePage() {
  const [markets, setMarkets] = useState<LiveMarket[]>([]);
  const { c1, c1Amt } = useProof();
  useEffect(() => {
    fetchLiveMarkets(INDEXER_URL, 8)
      .then((ms) => setMarkets(ms.filter((m) => m.clobStatus === "Trading").slice(0, 3)))
      .catch(() => setMarkets([]));
  }, []);

  return (
    <div>
      {/* landing header */}
      <header className="sticky top-0 z-10 border-b-2 border-foreground bg-[#edeae3]/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <button className="display text-xl font-bold uppercase tracking-tight" onClick={() => nav("/")}>
            ORACLELESS
          </button>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="display text-xs uppercase tracking-wider" onClick={() => nav("/app")}>
              App
            </Button>
            <WalletButton />
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="border-b-2 border-foreground bg-[#d9ff00]">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[1.2fr_1fr] lg:py-24">
          <div>
            <div className="data mb-4 inline-flex items-center gap-2 border border-foreground/40 px-2 py-1 text-[11px] uppercase tracking-widest">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-[#ff4d00]" />
              Live on Somnia Shannon
            </div>
            <h1 className="display text-5xl font-bold uppercase leading-[0.9] tracking-tight sm:text-7xl">
              DreamDEX events,
              <br />
              <span className="serif-it font-normal normal-case">now programmable.</span>
            </h1>
            <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-foreground/80">
              ORACLELESS turns finalized DreamDEX Event Contracts into conditions for arbitrary on-chain actions. Lock
              funds behind a market outcome. The vault releases them only when the chain proves the condition holds.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="display border-2 border-foreground bg-[#0a0a0a] px-7 text-sm uppercase tracking-wider text-[#edeae3] shadow-[5px_5px_0_#0a0a0a] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none" onClick={() => nav("/app")}>
                Open the app
              </Button>
              <Button size="lg" variant="ghost" className="display border-2 border-foreground bg-transparent px-7 text-sm uppercase tracking-wider" onClick={() => nav("/app/verify")}>
                Verify on chain
              </Button>
            </div>
          </div>

          {/* proof card */}
          <div className="flex items-center">
            <div className="w-full border-2 border-foreground bg-[#edeae3] p-5 shadow-[8px_8px_0_#0a0a0a]">
              <div className="data mb-3 flex items-center justify-between text-[11px] uppercase tracking-widest">
                <span>Condition #1</span>
                <span className="flex items-center gap-1 text-[#2c5f4d]">
                  <span className="inline-block size-1.5 rounded-full bg-[#2c5f4d]" />
                  {c1 ?? "..."}
                </span>
              </div>
              <div className="serif-it text-2xl">A market settled. Funds moved.</div>
              <div className="mt-3 space-y-1.5 border-y border-foreground/15 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground/60">Market</span>
                  <span className="data font-medium">BTC 15m, settled UP</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/60">Condition</span>
                  <span className="data font-medium text-[#2c5f4d]">TRUE</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/60">Released</span>
                  <span className="data font-medium">{c1Amt ?? "..."} tUSDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/60">Triggered by</span>
                  <span className="data font-medium">anyone, permissionless</span>
                </div>
              </div>
              <a className="data mt-3 inline-block text-[11px] uppercase tracking-wider underline underline-offset-4" href={`https://shannon-explorer.somnia.network/tx/${RELEASE_TX}`} target="_blank" rel="noreferrer">
                view release tx ↗
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* mechanism band */}
      <section className="border-b-2 border-foreground bg-[#0a0a0a] text-[#edeae3]">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <h2 className="display text-3xl font-bold uppercase tracking-tight sm:text-4xl">
              One settlement, <span className="text-[#d9ff00]">one condition,</span> one action
            </h2>
            <div className="data max-w-sm text-xs uppercase leading-relaxed tracking-wider text-[#edeae3]/50">
              DreamDEX settles the fact. ORACLELESS enforces what that fact may trigger.
            </div>
          </div>
          <div className="grid gap-px bg-[#edeae3]/15 md:grid-cols-4">
            {["Market trades", "Chain settles", "Vault reads", "Funds release"].map((s, i) => (
              <div key={s} className="bg-[#0a0a0a] p-6">
                <div className="display text-3xl font-bold text-[#d9ff00]">0{i + 1}</div>
                <div className="display mt-2 text-lg font-semibold uppercase tracking-wide">{s}</div>
                <div className="mt-1 text-sm text-[#edeae3]/60">
                  {i === 0 && "A DreamDEX event contract is trading on Shannon."}
                  {i === 1 && "It resolves UP or DOWN. The market contract records it on chain."}
                  {i === 2 && "The vault reads isResolved and the payout vector. No backend is asked."}
                  {i === 3 && "If the condition holds, the locked collateral goes to the recipient."}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* problem / statement */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="display text-3xl font-bold uppercase tracking-tight">Settlements are facts, not endpoints</h2>
          </div>
          <div className="space-y-4 text-[15px] leading-relaxed text-foreground/75">
            <p>
              A prediction market settlement is a deterministic, on-chain, adversarial-resistant statement about the
              world. Today it is treated as the end of a story: the market settles, winners redeem, nothing else
              happens.
            </p>
            <p>
              But that settlement is also a fact other contracts should be able to act on. A treasury tranche, an
              escrow release, an agent authority, a protection payout. Today each of those needs a custom feed, a
              trusted backend, or a new oracle. ORACLELESS removes that layer.
            </p>
            <p className="border-l-2 border-[#d9ff00] pl-4 font-medium">
              DreamDEX determines what happened. ORACLELESS determines what that fact is allowed to trigger.
            </p>
          </div>
        </div>
      </section>

      {/* use cases */}
      <section className="border-y-2 border-foreground bg-white/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="display mb-8 text-3xl font-bold uppercase tracking-tight">What becomes programmable</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {USECASES.map((u) => (
              <Card key={u.n} className="border-2 border-foreground bg-[#edeae3] shadow-[5px_5px_0_#0a0a0a]">
                <CardContent className="p-5">
                  <div className="data mb-2 text-[11px] uppercase tracking-widest text-foreground/50">{u.n}</div>
                  <div className="display text-lg font-semibold uppercase leading-snug">{u.title}</div>
                  <p className="mt-2 text-sm text-foreground/70">{u.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* trust */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="display mb-8 text-3xl font-bold uppercase tracking-tight">The trust model</h2>
        <div className="grid gap-px border-2 border-foreground bg-foreground md:grid-cols-2">
          {TRUST.map((x) => (
            <div key={x.t} className="bg-[#edeae3] p-6">
              <div className="display text-base font-semibold uppercase">{x.t}</div>
              <p className="mt-2 text-sm leading-relaxed text-foreground/70">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* live markets */}
      <section className="border-t-2 border-foreground bg-[#0a0a0a] text-[#edeae3]">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="display text-2xl font-bold uppercase tracking-tight">Trading right now</h2>
            <Button variant="ghost" className="data text-xs uppercase tracking-wider text-[#d9ff00]" onClick={() => nav("/app")}>
              Create a condition →
            </Button>
          </div>
          {markets.length === 0 ? (
            <p className="text-sm text-[#edeae3]/50">No markets trading at this instant. Markets roll every 5 minutes.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {markets.map((m) => (
                <button key={m.marketId} className="border border-[#edeae3]/20 p-4 text-left transition-colors hover:border-[#d9ff00]" onClick={() => nav("/app")}>
                  <div className="data mb-1 text-[11px] uppercase tracking-wider text-[#edeae3]/50">{marketLabel(m)}</div>
                  <div className="text-sm text-[#edeae3]/90">{marketQuestion(m)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default HomePage;
