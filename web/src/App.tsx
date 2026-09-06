import { useEffect, useMemo, useState } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Separator } from "./components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import {
  CONDITION_VAULT,
  EXPLORER_URL,
  INDEXER_URL,
  RPC_URL,
  TUSDC,
  TUSDC_DECIMALS,
  somniaShannon,
  vaultAbi,
} from "./lib/config";
import { fetchLiveMarkets, marketLabel, marketQuestion, type LiveMarket } from "./lib/markets";
import { ensureConnected, shortAddr, switchToShannon, useWallet } from "./lib/wallet";
import "./index.css";

export const publicClient = createPublicClient({ chain: somniaShannon, transport: http(RPC_URL) });

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

const STATE_NAMES = ["PENDING", "SATISFIED", "FAILED", "EXECUTED", "EXPIRED"] as const;

function stateBadgeVariant(state: number): "default" | "secondary" | "destructive" | "outline" {
  if (state === 1 || state === 3) return "default"; // satisfied / executed: chartreuse
  if (state === 2) return "destructive"; // failed
  return "outline";
}

export interface ConditionRow {
  marketId: string;
  market: string;
  collateral: string;
  expected: number;
  recipient: string;
  amount: bigint;
  expiry: bigint;
  creator: string;
}

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

function addrLink(a: string): string {
  return `${EXPLORER_URL}/address/${a}`;
}

function txLink(h: string): string {
  return `${EXPLORER_URL}/tx/${h}`;
}

function useRoute(): string {
  const [route, setRoute] = useState(window.location.hash.replace(/^#/, "") || "/");
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace(/^#/, "") || "/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

function nav(h: string) {
  window.location.hash = h;
}

/* ---------------- shell ---------------- */

function App() {
  const route = useRoute();
  const wallet = useWallet();

  useEffect(() => {
    window.ethereum?.on?.("accountsChanged", () => window.location.reload());
    window.ethereum?.on?.("chainChanged", () => window.location.reload());
  }, []);

  const wrongChain = !!wallet.address && wallet.chainId !== somniaShannon.id;

  let page: React.ReactNode;
  if (route.startsWith("/condition/")) page = <ConditionDetailView id={route.split("/")[2]} />;
  else if (route.startsWith("/verify")) page = <VerifyView />;
  else if (route.startsWith("/conditions")) page = <ConditionsView />;
  else if (route.startsWith("/docs")) page = <DocsView />;
  else page = <HomeView />;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-10 border-b border-foreground/15 bg-[#edeae3]/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <button className="display text-xl font-bold tracking-tight" onClick={() => nav("/")}>
            ORACLELESS
          </button>
          <nav className="hidden items-center gap-1 md:flex">
            <NavBtn route="/" active={route === "/" || route.startsWith("/condition")}>
              Home
            </NavBtn>
            <NavBtn route="/conditions" active={route.startsWith("/conditions")}>
              Conditions
            </NavBtn>
            <NavBtn route="/verify" active={route.startsWith("/verify")}>
              Verify
            </NavBtn>
            <NavBtn route="/docs" active={route.startsWith("/docs")}>
              Docs
            </NavBtn>
          </nav>
          <div className="flex items-center gap-2">
            {wrongChain && (
              <Button size="sm" onClick={() => switchToShannon()}>
                Switch to Shannon
              </Button>
            )}
            <WalletButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{page}</main>

      <footer className="border-t border-foreground/15 py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 text-[13px] text-foreground/55 md:flex-row md:items-center md:justify-between">
          <span className="data text-xs uppercase tracking-wide">Live on Somnia Shannon, testnet, chain 50312</span>
          <span>DreamDEX determines what happened. ORACLELESS determines what that fact may trigger.</span>
        </div>
      </footer>
    </div>
  );
}

function NavBtn({ route, active, children }: { route: string; active: boolean; children: React.ReactNode }) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="sm"
      className="data text-xs uppercase tracking-wider"
      onClick={() => nav(route)}
    >
      {children}
    </Button>
  );
}

function WalletButton() {
  const wallet = useWallet();
  if (!wallet.address) {
    return (
      <Button
        className="border-2 border-foreground bg-[#d9ff00] px-3 py-1.5 text-[13px] font-semibold text-foreground shadow-[3px_3px_0_#0a0a0a] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
        onClick={async () => {
          await ensureConnected();
          await switchToShannon();
        }}
      >
        Connect wallet
      </Button>
    );
  }
  return (
    <div className="data flex items-center gap-1 border border-foreground/30 bg-white/60 px-2.5 py-1 text-xs">
      <span className="inline-block size-1.5 rounded-full bg-[#2c5f4d]" />
      {shortAddr(wallet.address)}
    </div>
  );
}

/* ---------------- home ---------------- */

function HomeView() {
  const [count, setCount] = useState<number | null>(null);
  const [markets, setMarkets] = useState<LiveMarket[]>([]);
  useEffect(() => {
    readConditionCount().then(setCount).catch(() => setCount(null));
    fetchLiveMarkets(INDEXER_URL, 4)
      .then((ms) => setMarkets(ms.filter((x) => x.clobStatus === "Trading").slice(0, 3)))
      .catch(() => setMarkets([]));
  }, []);

  const mechanism = useMemo(
    () => [
      { label: "Market", text: "A DreamDEX event contract is trading" },
      { label: "Outcome", text: "It settles UP or DOWN on chain" },
      { label: "Condition", text: "The vault reads the resolved state" },
      { label: "Action", text: "Funds release to the recipient" },
    ],
    [],
  );

  return (
    <div className="space-y-10">
      {/* hero */}
      <section className="grid gap-6 pt-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="data mb-3 inline-flex items-center gap-2 border border-foreground/20 px-2 py-1 text-[11px] uppercase tracking-widest">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-[#ff4d00]" />
            Live on Shannon
          </div>
          <h1 className="display text-5xl font-bold leading-[0.95] tracking-tight sm:text-6xl">
            DreamDEX events,
            <br />
            <span className="serif-it font-normal">now programmable.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-foreground/70">
            ORACLELESS turns finalized DreamDEX Event Contracts into conditions for arbitrary on-chain actions. Lock
            funds behind a market outcome. The vault releases them only when the chain proves the condition holds.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="display border-2 border-foreground bg-[#d9ff00] px-6 text-sm font-semibold uppercase tracking-wider text-foreground shadow-[4px_4px_0_#0a0a0a] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
              onClick={() => nav("/conditions")}
            >
              Create a condition
            </Button>
            <Button variant="ghost" size="lg" className="data text-sm uppercase tracking-wider" onClick={() => nav("/verify")}>
              Verify condition 1
            </Button>
          </div>
        </div>

        {/* live receipt card */}
        <Card className="border-2 border-foreground bg-white/50 shadow-[6px_6px_0_#0a0a0a]">
          <CardHeader className="pb-2">
            <CardTitle className="data flex items-center justify-between text-xs uppercase tracking-widest">
              <span>Proof, on chain</span>
              <Badge variant="default" className="border-2 border-foreground">
                LIVE
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Row k="Vault" mono link={addrLink(CONDITION_VAULT)} v={CONDITION_VAULT ? shortAddr(CONDITION_VAULT) : "not deployed"} />
            <Row k="Conditions" v={count === null ? "-" : String(count)} />
            <Separator />
            <Row k="Condition 1" v="EXECUTED" accent />
            <Row k="Market" v="BTC, settled UP" />
            <Row k="Recipient paid" v="100 tUSDC" />
            <a className="data block pt-1 text-[11px] uppercase tracking-wider underline underline-offset-4" href={txLink("0x882e7656a2908fe5d20aea33adfb764b78ca2cc60f5882e8f0e234b6c4fcb955")} target="_blank" rel="noreferrer">
              view release tx ↗
            </a>
          </CardContent>
        </Card>
      </section>

      {/* mechanism */}
      <section className="border-2 border-foreground bg-[#0a0a0a] p-6 text-[#edeae3] sm:p-8">
        <div className="data mb-6 text-xs uppercase tracking-widest text-[#edeae3]/50">The mechanism</div>
        <div className="grid gap-6 md:grid-cols-4">
          {mechanism.map((s, i) => (
            <div key={s.label}>
              <div className="display mb-2 text-sm font-semibold text-[#d9ff00]">0{i + 1}</div>
              <div className="display mb-1 text-lg font-semibold uppercase tracking-wide">{s.label}</div>
              <div className="text-sm text-[#edeae3]/65">{s.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* trust model */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border border-foreground/20">
          <CardContent className="pt-6">
            <div className="display mb-2 text-lg font-semibold uppercase">Source of truth is the chain</div>
            <p className="text-sm text-foreground/65">
              The vault reads the market contract's isResolved and payout vector. No indexer, backend, or keeper decides
              the outcome.
            </p>
          </CardContent>
        </Card>
        <Card className="border border-foreground/20">
          <CardContent className="pt-6">
            <div className="display mb-2 text-lg font-semibold uppercase">Anyone can execute</div>
            <p className="text-sm text-foreground/65">
              execute() is permissionless. Nobody can fake the outcome, redirect the payout, or mutate the condition.
            </p>
          </CardContent>
        </Card>
        <Card className="border border-foreground/20">
          <CardContent className="pt-6">
            <div className="display mb-2 text-lg font-semibold uppercase">Fail closed</div>
            <p className="text-sm text-foreground/65">
              Wrong outcome, voided, unresolved, and expired conditions never release funds. The creator reclaims after
              expiry.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* live markets */}
      <section>
        <div className="data mb-4 text-xs uppercase tracking-widest text-foreground/50">Trading right now, on DreamDEX</div>
        {markets.length === 0 ? (
          <p className="text-sm text-foreground/55">No markets trading at this instant. Markets roll every 5 minutes.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {markets.map((m) => (
              <button key={m.marketId} className="border border-foreground/20 bg-white/40 p-4 text-left transition-colors hover:bg-[#d9ff00]/40" onClick={() => nav("/conditions")}>
                <div className="data mb-1 text-xs uppercase tracking-wider text-foreground/60">{marketLabel(m)}</div>
                <div className="text-sm font-medium">{marketQuestion(m)}</div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ k, v, mono, link, accent }: { k: string; v: string; mono?: boolean; link?: string; accent?: boolean }) {
  const inner = (
    <>
      <span className={mono ? "data" : ""}>{k}</span>
      <span className={`${mono ? "data" : ""} ${accent ? "font-semibold text-[#2c5f4d]" : "font-medium"}`}>{v}</span>
    </>
  );
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-sm">
      {link ? (
        <a className="flex w-full items-center justify-between gap-2 text-[13px] underline-offset-4 hover:underline" href={link} target="_blank" rel="noreferrer">
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
}

/* ---------------- create / conditions ---------------- */

function ConditionsView() {
  const wallet = useWallet();
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="display text-3xl font-bold uppercase tracking-tight">Create a condition</h1>
        <p className="text-sm text-foreground/60">
          Lock tUSDC behind a DreamDEX outcome. The vault releases to the recipient only when the market settles as you
          expect.
        </p>
      </div>
      <CreateView wallet={wallet} />
      <RecentConditions />
    </div>
  );
}

function CreateView({ wallet }: { wallet: { address: `0x${string}` | null; chainId: number | null } }) {
  const [markets, setMarkets] = useState<LiveMarket[]>([]);
  const [marketErr, setMarketErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<LiveMarket | null>(null);
  const [side, setSide] = useState<"UP" | "DOWN">("UP");
  const [amount, setAmount] = useState("25");
  const [recipient, setRecipient] = useState("");
  const [expiryMin, setExpiryMin] = useState("180");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    fetchLiveMarkets(INDEXER_URL)
      .then(setMarkets)
      .catch((e) => setMarketErr(String((e as Error).message ?? e)));
  }, []);

  const connected = !!wallet.address && wallet.chainId === somniaShannon.id;

  const create = async () => {
    if (!wallet.address || !selected || !recipient || !CONDITION_VAULT) return;
    setBusy(true);
    setMsg(null);
    try {
      const { createWalletClient, custom, decodeEventLog } = await import("viem");
      const wc = createWalletClient({ chain: somniaShannon, transport: custom(window.ethereum!) });
      const amt = BigInt(Math.round(Number(amount) * 10 ** TUSDC_DECIMALS));
      const expiry = BigInt(Math.floor(Date.now() / 1000) + Number(expiryMin) * 60);

      const appr = await wc.writeContract({
        address: TUSDC,
        abi: erc20Abi,
        functionName: "approve",
        args: [CONDITION_VAULT as `0x${string}`, amt],
        account: wallet.address,
      });
      setMsg("Approval sent. Confirm the second transaction to lock funds.");
      await publicClient.waitForTransactionReceipt({ hash: appr });

      const tx = await wc.writeContract({
        address: CONDITION_VAULT as `0x${string}`,
        abi: vaultAbi,
        functionName: "createCondition",
        args: [selected.marketId as `0x${string}`, TUSDC, side === "UP" ? 0 : 1, recipient as `0x${string}`, amt, expiry],
        account: wallet.address,
      });
      setMsg("Creating condition...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      const iface =
        "event ConditionCreated(uint256 indexed conditionId, bytes32 indexed marketId, address indexed creator, address recipient, address collateral, uint256 amount, uint8 expected, uint64 expiry)";
      let id: string | null = null;
      for (const log of receipt.logs ?? []) {
        try {
          const d = decodeEventLog({ abi: [iface], data: log.data, topics: log.topics as [`0x${string}`, ...`0x${string}`[]] });
          if (d.eventName === "ConditionCreated") id = String((d.args as unknown as { conditionId: bigint }).conditionId);
        } catch {
          /* not ours */
        }
      }
      setCreatedId(id ?? String(await readConditionCount()));
      setMsg(null);
    } catch (e) {
      setMsg(`Transaction failed: ${(e as Error).message?.slice(0, 200) ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* pick market */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="display text-sm uppercase tracking-wider">1. Pick a market</CardTitle>
        </CardHeader>
        <CardContent>
          {marketErr && <p className="mb-3 text-sm text-[#ff4d00]">Could not load markets: {marketErr}</p>}
          {!marketErr && markets.length === 0 && <p className="text-sm text-foreground/55">Loading live markets...</p>}
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {markets.map((m) => {
              const isSel = selected?.marketId === m.marketId;
              const live = m.clobStatus === "Trading";
              return (
                <button
                  key={m.marketId}
                  className={`block w-full border p-3 text-left transition-colors ${isSel ? "border-foreground bg-[#d9ff00]/50" : "border-foreground/20 bg-white/40 hover:bg-white/70"}`}
                  onClick={() => setSelected(m)}
                >
                  <div className="flex items-center justify-between">
                    <span className="data text-xs uppercase tracking-wider">{marketLabel(m)}</span>
                    <Badge variant={live ? "default" : "secondary"} className="border border-foreground">
                      {live ? "LIVE" : "SETTLED"}
                    </Badge>
                  </div>
                  <div className="mt-1 text-[13px] text-foreground/70">{marketQuestion(m)}</div>
                </button>
              );
            })}
          </div>
          {markets.some((m) => m.clobStatus === "Finalized") && (
            <p className="mt-3 text-xs text-foreground/50">
              Settled markets are listed too. A condition on a settled market is satisfiable immediately, which proves the
              full release path.
            </p>
          )}
        </CardContent>
      </Card>

      {/* set the condition */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="display text-sm uppercase tracking-wider">2. Set the condition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected ? (
            <p className="text-sm text-foreground/55">Select a market to continue.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={side === "UP" ? "default" : "outline"}
                  className="display uppercase tracking-wider"
                  onClick={() => setSide("UP")}
                >
                  settles UP
                </Button>
                <Button
                  variant={side === "DOWN" ? "default" : "outline"}
                  className="display uppercase tracking-wider"
                  onClick={() => setSide("DOWN")}
                >
                  settles DOWN
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="amt" className="data text-xs uppercase tracking-wider">
                  Amount, tUSDC
                </Label>
                <Input id="amt" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-none border-foreground bg-white/60" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rcpt" className="data text-xs uppercase tracking-wider">
                  Recipient address
                </Label>
                <Input id="rcpt" placeholder="0x..." value={recipient} onChange={(e) => setRecipient(e.target.value)} className="rounded-none border-foreground bg-white/60 data" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exp" className="data text-xs uppercase tracking-wider">
                  Expiry, minutes
                </Label>
                <Input id="exp" type="number" min="1" value={expiryMin} onChange={(e) => setExpiryMin(e.target.value)} className="rounded-none border-foreground bg-white/60" />
              </div>

              {/* the condition line */}
              <div className="border-2 border-foreground bg-[#0a0a0a] p-3 text-[#edeae3]">
                <div className="display text-sm uppercase tracking-wide">
                  <span className="text-[#d9ff00]">IF</span> {selected ? marketLabel(selected).split("·")[0].trim() : ""} settles {side}
                </div>
                <div className="mt-1 text-sm text-[#edeae3]/75">
                  <span className="data text-[#d9ff00]">THEN</span> release {amount || "0"} tUSDC to{" "}
                  <span className="data text-[#edeae3]">{recipient ? shortAddr(recipient) : "0x..."}</span>
                </div>
              </div>

              {!connected && <p className="text-sm text-[#ff4d00]">Connect your wallet and switch to Somnia Shannon (chain 50312).</p>}

              {createdId ? (
                <div className="border-2 border-[#2c5f4d] bg-[#2c5f4d]/10 p-3">
                  <p className="text-sm">
                    <span className="font-semibold text-[#2c5f4d]">Condition #{createdId} created.</span> Funds are locked
                    in the vault.
                  </p>
                  <Button variant="link" size="sm" className="p-0 text-[#2c5f4d]" onClick={() => nav(`/condition/${createdId}`)}>
                    View condition proof →
                  </Button>
                </div>
              ) : (
                <Button
                  size="lg"
                  className="display w-full border-2 border-foreground bg-[#d9ff00] uppercase tracking-wider text-foreground shadow-[4px_4px_0_#0a0a0a] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                  disabled={busy || !connected || !CONDITION_VAULT}
                  onClick={create}
                >
                  {busy ? "Locking funds..." : "Lock funds"}
                </Button>
              )}
              {msg && <p className={`text-sm ${msg.startsWith("Transaction failed") ? "text-[#ff4d00]" : "text-foreground/70"}`}>{msg}</p>}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RecentConditions() {
  const [items, setItems] = useState<{ id: string; state: number }[] | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const count = await readConditionCount();
        const out: { id: string; state: number }[] = [];
        for (let i = Math.max(1, count - 9); i <= count; i++) {
          try {
            out.push({ id: String(i), state: await readConditionState(BigInt(i)) });
          } catch {
            /* skip */
          }
        }
        setItems(out.reverse());
      } catch {
        setItems([]);
      }
    })();
  }, []);
  if (!items) return <p className="text-sm text-foreground/55">Loading conditions...</p>;
  if (items.length === 0) return <p className="text-sm text-foreground/55">No conditions yet. Create the first one above.</p>;
  return (
    <section>
      <div className="data mb-4 text-xs uppercase tracking-widest text-foreground/50">Recent conditions</div>
      <div className="border-2 border-foreground bg-white/40">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="data text-xs uppercase">Id</TableHead>
              <TableHead className="data text-xs uppercase">Market</TableHead>
              <TableHead className="data text-xs uppercase">Expected</TableHead>
              <TableHead className="data text-xs uppercase">Amount</TableHead>
              <TableHead className="data text-xs uppercase">State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => {
              const st = STATE_NAMES[c.state] ?? "UNKNOWN";
              return (
                <TableRow key={c.id} className="cursor-pointer hover:bg-[#d9ff00]/30" onClick={() => nav(`/condition/${c.id}`)}>
                  <TableCell className="data">#{c.id}</TableCell>
                  <TableCell className="data">on chain</TableCell>
                  <TableCell className="data">-</TableCell>
                  <TableCell className="data">-</TableCell>
                  <TableCell>
                    <Badge variant={stateBadgeVariant(c.state)} className="border border-foreground">
                      {st}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

/* ---------------- condition detail ---------------- */

function ConditionDetailView({ id }: { id: string }) {
  const [cond, setCond] = useState<ConditionRow | null>(null);
  const [state, setState] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mkt, setMkt] = useState<{ resolved: boolean; voided: boolean; winner: number | null; payouts: string[] } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cid = BigInt(id.replace(/\D/g, "") || "0");
        const [c, s] = await Promise.all([readCondition(cid), readConditionState(cid)]);
        setCond(c);
        setState(s);
        try {
          const marketAbi = parseAbi([
            "function isResolved() view returns (bool)",
            "function isVoided() view returns (bool)",
            "function payoutNumerators() view returns (uint256[])",
          ]);
          const [resolved, voided, payouts] = await Promise.all([
            publicClient.readContract({ address: c.market as `0x${string}`, abi: marketAbi, functionName: "isResolved" }),
            publicClient.readContract({ address: c.market as `0x${string}`, abi: marketAbi, functionName: "isVoided" }),
            publicClient.readContract({ address: c.market as `0x${string}`, abi: marketAbi, functionName: "payoutNumerators" }),
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
          setMkt({ resolved: Boolean(resolved), voided: Boolean(voided), winner, payouts: (payouts as bigint[]).map((p) => p.toString()) });
        } catch {
          setMkt(null);
        }
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    })();
  }, [id]);

  if (err) return <p className="text-sm text-[#ff4d00]">Could not read condition #{id}: {err}</p>;
  if (!cond || state === null) return <p className="text-sm text-foreground/55">Reading condition #{id} from the chain...</p>;

  const st = STATE_NAMES[state] ?? "UNKNOWN";
  const expSide = cond.expected === 0 ? "UP" : "DOWN";
  const actualSide = mkt?.winner === 0 ? "UP" : mkt?.winner === 1 ? "DOWN" : null;
  const holds = actualSide ? actualSide === expSide : null;
  const amountStr = (Number(cond.amount) / 10 ** TUSDC_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const steps = [
    { label: "Created", on: true, sub: `condition #${id} recorded` },
    { label: "Funded", on: true, sub: `${amountStr} tUSDC locked` },
    { label: "Market resolved", on: state >= 1, sub: mkt?.resolved ? `market ${shortAddr(cond.market)}` : "not finalized yet" },
    {
      label: "Condition",
      on: state >= 1,
      sub: mkt?.resolved ? (holds ? "TRUE, release allowed" : mkt.voided ? "VOIDED, fail closed" : "FALSE, fail closed") : "unresolved",
    },
    { label: "Executed", on: state === 3, sub: "funds sent to recipient" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-3xl font-bold uppercase tracking-tight">
          Condition #{id} <Badge variant={stateBadgeVariant(state)} className="ml-2 border-2 border-foreground">{st}</Badge>
        </h1>
        <Button variant="outline" size="sm" className="data uppercase tracking-wider" onClick={() => nav("/verify")}>
          Verify from chain
        </Button>
      </div>

      {/* timeline */}
      <div className="border-2 border-foreground bg-white/40 p-4">
        <div className="grid gap-2 sm:grid-cols-5">
          {steps.map((s, i) => (
            <div key={s.label} className={`border p-3 ${s.on ? "border-foreground bg-[#d9ff00]/30" : "border-foreground/20 bg-white/30 opacity-55"}`}>
              <div className="data text-[10px] uppercase tracking-wider text-foreground/50">Step {i + 1}</div>
              <div className="display mt-1 text-sm font-semibold uppercase">{s.label}</div>
              <div className="mt-0.5 text-[11px] text-foreground/60">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* condition params */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="display text-sm uppercase tracking-wider">Condition parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <KV k="Market id" v={`${cond.marketId.slice(0, 10)}...${cond.marketId.slice(-6)}`} mono />
                <KV k="Market contract" v={shortAddr(cond.market)} mono link={addrLink(cond.market)} />
                <KV k="Expected" v={expSide} strong />
                <KV k="Amount locked" v={`${amountStr} tUSDC`} />
                <KV k="Recipient" v={shortAddr(cond.recipient)} mono link={addrLink(cond.recipient)} />
                <KV k="Creator" v={shortAddr(cond.creator)} mono link={addrLink(cond.creator)} />
                <KV k="Expiry" v={new Date(Number(cond.expiry) * 1000).toLocaleString()} />
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* market canonical state */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="display text-sm uppercase tracking-wider">DreamDEX market state, read on chain</CardTitle>
          </CardHeader>
          <CardContent>
            {mkt ? (
              <Table>
                <TableBody>
                  <KV k="isResolved" v={mkt.resolved ? "true" : "false"} />
                  <KV k="isVoided" v={mkt.voided ? "true" : "false"} />
                  <KV k="Actual outcome" v={actualSide ?? "none yet"} strong={mkt.resolved && !mkt.voided} />
                  <KV k="Payout vector" v={`[${mkt.payouts.join(", ")}]`} mono />
                  <KV k="Condition holds" v={holds === null ? "pending" : holds ? "TRUE" : "FALSE"} strong={holds === true} accent={holds === false} />
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-foreground/55">Market state read failed. Check the market contract on the explorer.</p>
            )}
            <p className="mt-3 text-[11px] text-foreground/45">Every field on this page is a live read. No database, no cached result.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KV({ k, v, mono, link, strong, accent }: { k: string; v: string; mono?: boolean; link?: string; strong?: boolean; accent?: boolean }) {
  return (
    <TableRow>
      <TableCell className="data py-2 text-xs uppercase tracking-wider text-foreground/55">{k}</TableCell>
      <TableCell className={`py-2 text-sm ${mono ? "data" : ""} ${strong ? "font-semibold" : ""} ${accent ? "text-[#ff4d00]" : ""}`}>
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
            {v} ↗
          </a>
        ) : (
          v
        )}
      </TableCell>
    </TableRow>
  );
}

/* ---------------- verify ---------------- */

function VerifyView() {
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<{ cond: ConditionRow; state: number; mkt: { resolved: boolean; voided: boolean; winner: number | null } | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const lookup = async (raw: string) => {
    const cid = raw.replace(/\D/g, "").trim();
    if (!cid) return;
    setLoading(true);
    setErr(null);
    setRes(null);
    try {
      const n = BigInt(cid);
      const [cond, state] = await Promise.all([readCondition(n), readConditionState(n)]);
      let mkt: { resolved: boolean; voided: boolean; winner: number | null } | null = null;
      try {
        const marketAbi = parseAbi([
          "function isResolved() view returns (bool)",
          "function isVoided() view returns (bool)",
          "function payoutNumerators() view returns (uint256[])",
        ]);
        const [resolved, voided, payouts] = await Promise.all([
          publicClient.readContract({ address: cond.market as `0x${string}`, abi: marketAbi, functionName: "isResolved" }),
          publicClient.readContract({ address: cond.market as `0x${string}`, abi: marketAbi, functionName: "isVoided" }),
          publicClient.readContract({ address: cond.market as `0x${string}`, abi: marketAbi, functionName: "payoutNumerators" }),
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
        mkt = { resolved: Boolean(resolved), voided: Boolean(voided), winner };
      } catch {
        mkt = null;
      }
      setRes({ cond, state, mkt });
    } catch (e) {
      setErr(`Could not read condition #${cid}: ${(e as Error).message?.slice(0, 160)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-1">
        <h1 className="display text-3xl font-bold uppercase tracking-tight">Verify from chain state</h1>
        <p className="text-sm text-foreground/60">
          Enter a condition id. The verifier reads the vault and the referenced DreamDEX market directly from the chain.
          No backend decides anything.
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="condition id, e.g. 1"
          value={id}
          onChange={(e) => setId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup(id)}
          className="rounded-none border-2 border-foreground bg-white/60 data"
        />
        <Button
          className="display border-2 border-foreground bg-[#d9ff00] uppercase tracking-wider shadow-[3px_3px_0_#0a0a0a] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
          disabled={!CONDITION_VAULT || !id || loading}
          onClick={() => lookup(id)}
        >
          {loading ? "Reading..." : "Verify"}
        </Button>
      </div>
      {err && <p className="text-sm text-[#ff4d00]">{err}</p>}
      {res && (
        <Card className="border-2 border-foreground bg-white/50 shadow-[5px_5px_0_#0a0a0a]">
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between">
              <span className="data text-sm uppercase tracking-wider">Condition #{id}</span>
              <Badge variant={stateBadgeVariant(res.state)} className="border-2 border-foreground">{STATE_NAMES[res.state]}</Badge>
            </div>
            {res.mkt && (
              <div className="grid grid-cols-3 gap-3 border-y border-foreground/15 py-3">
                <div>
                  <div className="data text-[10px] uppercase tracking-wider text-foreground/50">Expected</div>
                  <div className="display text-xl font-semibold">{res.cond.expected === 0 ? "UP" : "DOWN"}</div>
                </div>
                <div className="text-center">
                  <div className="data text-[10px] uppercase tracking-wider text-foreground/50">On chain</div>
                  <div className="display text-xl font-semibold">
                    {res.mkt.winner === null ? "-" : res.mkt.winner === 0 ? "UP" : "DOWN"}
                    {res.mkt.voided ? " (void)" : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="data text-[10px] uppercase tracking-wider text-foreground/50">Condition</div>
                  <div className={`display text-xl font-semibold ${res.mkt.winner === (res.cond.expected as number) ? "text-[#2c5f4d]" : "text-[#ff4d00]"}`}>
                    {res.mkt.winner === null ? "-" : res.mkt.winner === (res.cond.expected as number) ? "TRUE" : "FALSE"}
                  </div>
                </div>
              </div>
            )}
            <Button variant="link" size="sm" className="p-0 text-[#2c5f4d]" onClick={() => nav(`/condition/${id}`)}>
              Open full proof page →
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ---------------- docs ---------------- */

function DocsView() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="display text-3xl font-bold uppercase tracking-tight">How ORACLELESS works</h1>

      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="display text-sm uppercase tracking-wider">Not Branch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p><b>Branch:</b> outcome to another DreamDEX trade. A trading strategy.</p>
          <p><b>ORACLELESS:</b> outcome to an arbitrary external contract action. Payment, escrow, treasury, agent authority.</p>
          <p className="pt-2 text-foreground/65">
            The consumer of the outcome is an external contract, not another order. ORACLELESS is not an oracle, prediction
            market, escrow product, or trading strategy.
          </p>
        </CardContent>
      </Card>

      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="display text-sm uppercase tracking-wider">Trust model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="display font-semibold uppercase">Source of truth is the chain</div>
            <p className="text-foreground/65">The vault reads isResolved plus payoutNumerators (winner is the argmax). No indexer, backend, or keeper.</p>
          </div>
          <div>
            <div className="display font-semibold uppercase">Anyone can execute, only the recipient receives</div>
            <p className="text-foreground/65">Execution permission and payout ownership are separate by construction.</p>
          </div>
          <div>
            <div className="display font-semibold uppercase">Fail closed</div>
            <p className="text-foreground/65">Wrong outcome, voided, unresolved, and expired conditions never release funds. Creator reclaims after expiry.</p>
          </div>
          <div>
            <div className="display font-semibold uppercase">No admin keys</div>
            <p className="text-foreground/65">No function can redirect a payout, change a condition, or withdraw on the creator's behalf.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="display text-sm uppercase tracking-wider">Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <KV k="OraclelessConditionVault" v={CONDITION_VAULT ? shortAddr(CONDITION_VAULT) : "unset"} mono link={CONDITION_VAULT ? addrLink(CONDITION_VAULT) : undefined} />
              <KV k="DreamDEX BinaryMarketsModule" v="0x3ecC...E388" mono />
              <KV k="Collateral" v="tUSDC, 6 decimals, faucet minted" />
              <KV k="Network" v="Somnia Shannon, chain 50312" />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="display text-sm uppercase tracking-wider">Verify from the CLI</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto border border-foreground/20 bg-[#0a0a0a] p-3 text-[12px] text-[#d9ff00] data">{`CONDITION_VAULT=${CONDITION_VAULT || "<vault>"} node web/scripts/verify.mjs 1`}</pre>
          <p className="mt-2 text-xs text-foreground/50">The verifier re-derives a condition's state from the chain and exits non-zero on inconsistency.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
