import { useEffect, useState } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { CONDITION_VAULT, EXPLORER_URL, INDEXER_URL, RPC_URL, TUSDC, TUSDC_DECIMALS, somniaShannon, vaultAbi } from "./lib/config";
import { fetchLiveMarkets, marketLabel, marketQuestion, type LiveMarket } from "./lib/markets";
import { ensureConnected, switchToShannon, useWallet } from "./lib/wallet";
import "./App.css";

export const publicClient = createPublicClient({ chain: somniaShannon, transport: http(RPC_URL) });

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

const STATE_NAMES = ["PENDING", "SATISFIED", "FAILED", "EXECUTED", "EXPIRED"] as const;
const STATE_COLORS: Record<string, string> = {
  PENDING: "var(--accent)",
  SATISFIED: "var(--ok)",
  FAILED: "var(--bad)",
  EXECUTED: "var(--ok)",
  EXPIRED: "var(--muted)",
};

export interface ConditionRow {
  marketId: string;
  market: string;
  collateral: string;
  expected: number; // 0 UP 1 DOWN
  recipient: string;
  amount: bigint;
  expiry: bigint;
  creator: string;
}

export async function readCondition(id: bigint): Promise<ConditionRow> {
  const c = (await publicClient.readContract({
    address: CONDITION_VAULT as `0x${string}`,
    abi: vaultAbi,
    functionName: "getCondition",
    args: [id],
  })) as unknown as ConditionRow;
  return c;
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

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function addrLink(a: string): string {
  return `${EXPLORER_URL}/address/${a}`;
}

// tiny hash router
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

function App() {
  const route = useRoute();

  useEffect(() => {
    // subscribe to wallet events only when a wallet is present
    window.ethereum?.on?.("accountsChanged", () => window.location.reload());
    window.ethereum?.on?.("chainChanged", () => window.location.reload());
  }, []);

  let page: React.ReactNode;
  if (route.startsWith("/condition/")) {
    page = <ConditionDetailView id={route.split("/")[2]} />;
  } else if (route.startsWith("/verify")) {
    page = <VerifyView />;
  } else if (route.startsWith("/conditions")) {
    page = <ConditionsView />;
  } else if (route.startsWith("/docs")) {
    page = <DocsView />;
  } else {
    page = <HomeView />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand" onClick={() => nav("/")}>
          <span className="logo">◈</span> ORACLELESS
        </div>
        <nav>
          <NavBtn route="/" active={route === "/" || route.startsWith("/condition")}>Home</NavBtn>
          <NavBtn route="/conditions" active={route.startsWith("/conditions")}>Conditions</NavBtn>
          <NavBtn route="/verify" active={route.startsWith("/verify")}>Verify</NavBtn>
          <NavBtn route="/docs" active={route.startsWith("/docs")}>Docs</NavBtn>
        </nav>
        <WalletButton />
      </header>
      <main>{page}</main>
      <footer className="foot">
        <span>Live on Somnia Shannon · testnet</span>
        <span className="muted">DreamDEX determines what happened. ORACLELESS determines what that fact may trigger.</span>
      </footer>
    </div>
  );
}

function NavBtn({ route, active, children }: { route: string; active: boolean; children: React.ReactNode }) {
  return (
    <button className={`navbtn ${active ? "on" : ""}`} onClick={() => nav(route)}>
      {children}
    </button>
  );
}

function WalletButton() {
  const wallet = useWallet();
  const onConnect = async () => {
    await ensureConnected();
    await switchToShannon();
  };
  if (!wallet.address) {
    return (
      <button className="walletbtn" onClick={onConnect}>
        Connect wallet
      </button>
    );
  }
  const onWrong = wallet.chainId !== somniaShannon.id;
  return (
    <div className="walletrow">
      {onWrong && (
        <button className="walletbtn warn" onClick={() => switchToShannon()}>
          Switch to Shannon
        </button>
      )}
      <span className="pill" title={wallet.address}>
        {shortAddr(wallet.address)}
      </span>
    </div>
  );
}

// ---------------- HOME ----------------

function HomeView() {
  const [count, setCount] = useState<number | null>(null);
  const [markets, setMarkets] = useState<LiveMarket[]>([]);
  useEffect(() => {
    readConditionCount().then(setCount).catch(() => setCount(null));
    fetchLiveMarkets(INDEXER_URL, 4)
      .then((m) => setMarkets(m.filter((x) => x.clobStatus === "Trading").slice(0, 3)))
      .catch(() => setMarkets([]));
  }, []);

  return (
    <div className="homewrap">
      <div className="hero">
        <div className="hero-kicker">DREAMDEX EVENT CONTRACTS × SOMNIA</div>
        <h1>
          DreamDEX events, <em>now programmable</em>.
        </h1>
        <p className="hero-sub">
          ORACLELESS turns finalized DreamDEX Event Contracts into verifiable conditions for arbitrary on-chain actions.
          Lock funds behind a market outcome — the vault releases them only when the chain says the condition holds.
        </p>
        <div className="hero-ctas">
          <button className="cta" onClick={() => nav("/conditions")}>
            CREATE A CONDITION
          </button>
          <a className="btnlink" onClick={() => nav("/verify")} style={{ cursor: "pointer" }}>
            Verify a condition →
          </a>
        </div>
      </div>

      <div className="flow">
        <div>DreamDEX market</div>
        <div className="arrow">↓ settles</div>
        <div>on-chain outcome</div>
        <div className="arrow">↓ verified</div>
        <div>condition</div>
        <div className="arrow">↓ triggers</div>
        <div>external action</div>
      </div>

      <div className="homerow">
        <section className="card">
          <h3>Vault status</h3>
          <div className="kvline">
            <span>ConditionVault</span>
            <a className="mono" href={addrLink(CONDITION_VAULT)} target="_blank" rel="noreferrer">
              {shortAddr(CONDITION_VAULT)}
            </a>
          </div>
          <div className="kvline">
            <span>Conditions created</span>
            <b>{count ?? "—"}</b>
          </div>
          <div className="kvline">
            <span>Network</span>
            <b>Somnia Shannon</b>
          </div>
          <div className="kvline">
            <span>Source of truth</span>
            <b>chain</b>
          </div>
          <button className="cta" onClick={() => nav("/conditions")} disabled={!CONDITION_VAULT}>
            {CONDITION_VAULT ? "Browse conditions" : "Vault not deployed"}
          </button>
        </section>

        <section className="card">
          <h3>Live DreamDEX markets</h3>
          {markets.length === 0 ? (
            <p className="muted small">No markets trading right now — check back at the next window.</p>
          ) : (
            markets.map((m) => (
              <button key={m.marketId} className="marketrow" onClick={() => nav("/conditions")}>
                <div className="mrow-top">
                  <span className="mtitle">{marketLabel(m)}</span>
                  <span className="mstatus live">LIVE</span>
                </div>
                <div className="mq">{marketQuestion(m)}</div>
              </button>
            ))
          )}
        </section>
      </div>

      <div className="card trust">
        <h3>The trust model, in three lines</h3>
        <ul>
          <li>
            <b>DreamDEX determines what happened.</b> The vault reads the market contract's canonical state (isResolved +
            payout vector) — never a frontend, indexer, backend, or keeper.
          </li>
          <li>
            <b>ORACLELESS determines what that fact may trigger.</b> execute() is permissionless: anyone can fire it, nobody
            can fake the outcome.
          </li>
          <li>
            <b>Fail closed.</b> Voided, wrong-outcome, unresolved, and expired conditions never release funds. The creator
            reclaims after expiry.
          </li>
        </ul>
      </div>
    </div>
  );
}

// ---------------- CREATE / CONDITIONS ----------------

function ConditionsView() {
  const wallet = useWallet();
  return (
    <div>
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
      .then((ms) => setMarkets(ms))
      .catch((e) => setMarketErr(String(e.message ?? e)));
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
      setMsg(`Approval sent…`);
      await publicClient.waitForTransactionReceipt({ hash: appr });

      const tx = await wc.writeContract({
        address: CONDITION_VAULT as `0x${string}`,
        abi: vaultAbi,
        functionName: "createCondition",
        args: [selected.marketId as `0x${string}`, TUSDC, side === "UP" ? 0 : 1, recipient as `0x${string}`, amt, expiry],
        account: wallet.address,
      });
      setMsg("Creating condition…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      const iface = "event ConditionCreated(uint256 indexed conditionId, bytes32 indexed marketId, address indexed creator, address recipient, address collateral, uint256 amount, uint8 expected, uint64 expiry)";
      let id: string | null = null;
      for (const log of receipt.logs ?? []) {
        try {
          const d = decodeEventLog({ abi: [iface], data: log.data, topics: log.topics as [`0x${string}`, ...`0x${string}`[]] });
          if (d.eventName === "ConditionCreated") id = ((d.args as unknown as { conditionId: bigint }).conditionId).toString();
        } catch {
          /* not ours */
        }
      }
      setCreatedId(id ?? (await readConditionCount()).toString());
      setMsg(null);
    } catch (e) {
      setMsg(`Transaction failed: ${(e as Error).message?.slice(0, 200) ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="creategrid">
      <section className="card step">
        <h2>1 · Pick a live DreamDEX market</h2>
        {marketErr && <p className="err">Could not load markets: {marketErr}</p>}
        {!marketErr && markets.length === 0 && <p className="muted small">Loading markets…</p>}
        <div className="marketlist">
          {markets.map((m) => (
            <button key={m.marketId} className={`marketrow ${selected?.marketId === m.marketId ? "on" : ""}`} onClick={() => setSelected(m)}>
              <div className="mrow-top">
                <span className="mtitle">{marketLabel(m)}</span>
                <span className={`mstatus ${m.clobStatus === "Trading" ? "live" : "settled"}`}>{m.clobStatus === "Trading" ? "LIVE" : "SETTLED"}</span>
              </div>
              <div className="mq">{marketQuestion(m)}</div>
            </button>
          ))}
        </div>
        {markets.some((m) => m.clobStatus === "Finalized") && (
          <p className="muted small" style={{ marginTop: 8 }}>
            Settled markets are listed too — a condition on an already-settled market is immediately satisfiable, useful for testing the full path.
          </p>
        )}
      </section>

      <section className="card step">
        <h2>2 · Set the condition</h2>
        {!selected ? (
          <p className="muted">Select a market to continue.</p>
        ) : (
          <>
            <div className="siderow">
              <button className={`sidebtn ${side === "UP" ? "on up" : ""}`} onClick={() => setSide("UP")}>settles UP</button>
              <button className={`sidebtn ${side === "DOWN" ? "on down" : ""}`} onClick={() => setSide("DOWN")}>settles DOWN</button>
            </div>
            <label>
              Amount (tUSDC)
              <input type="number" value={amount} min="1" onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label>
              Recipient address
              <input placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </label>
            <label>
              Expiry (minutes)
              <input type="number" value={expiryMin} min="1" onChange={(e) => setExpiryMin(e.target.value)} />
            </label>

            <div className="condbox">
              <div className="condline">
                <span className="k">IF</span> {marketLabel(selected)} <span className="k">settles {side}</span>
              </div>
              <div className="condline">
                <span className="k">THEN</span> release <b>{amount} tUSDC</b> to <span className="mono">{recipient || "0x…"}</span>
              </div>
            </div>

            {!connected && <p className="err">Connect your wallet and switch to Somnia Shannon (chain 50312).</p>}

            {createdId ? (
              <div className="donebox">
                <p>✔ Condition #{createdId} created — funds locked.</p>
                <a className="btnlink" style={{ cursor: "pointer" }} onClick={() => nav(`/condition/${createdId}`)}>
                  View condition proof →
                </a>
              </div>
            ) : (
              <button className="cta" disabled={busy || !connected || !CONDITION_VAULT} onClick={create}>
                {busy ? "Locking funds…" : "LOCK FUNDS"}
              </button>
            )}
            {msg && <p className={msg.startsWith("Transaction failed") ? "err" : "msg"}>{msg}</p>}
          </>
        )}
      </section>
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
  if (!items) return <p className="muted small">Loading conditions…</p>;
  if (items.length === 0) return <p className="muted small">No conditions yet — create the first one above.</p>;
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2 className="step" style={{ margin: "0 0 12px" }}>Recent conditions</h2>
      <div className="condlist">
        {items.map((c) => {
          const st = STATE_NAMES[c.state] ?? "UNKNOWN";
          return (
            <button key={c.id} className="condrow" onClick={() => nav(`/condition/${c.id}`)}>
              <span className="mono">#{c.id}</span>
              <span className="statepill" style={{ background: STATE_COLORS[st] }}>{st}</span>
              <span className="arrow-more">→</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------- CONDITION DETAIL ----------------

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
        // read the DreamDEX market's canonical state
        try {
          const { parseAbi: pa } = await import("viem");
          const marketAbi = pa([
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
            payouts.forEach((v: bigint, i: number) => {
              if (v > best) {
                best = v;
                winner = i;
              }
            });
          }
          setMkt({ resolved: Boolean(resolved), voided: Boolean(voided), winner, payouts: payouts.map((p: bigint) => p.toString()) });
        } catch {
          setMkt(null);
        }
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    })();
  }, [id]);

  if (err) return <p className="err">Could not read condition #{id}: {err}</p>;
  if (!cond || state === null) return <p className="muted">Reading condition #{id} from the chain…</p>;

  const st = STATE_NAMES[state] ?? "UNKNOWN";
  const expSide = cond.expected === 0 ? "UP" : "DOWN";
  const actualSide = mkt?.winner === 0 ? "UP" : mkt?.winner === 1 ? "DOWN" : null;
  const holds = actualSide ? actualSide === expSide : null;
  const amountStr = (Number(cond.amount) / 10 ** TUSDC_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div className="detailwrap">
      <div className="detailhead">
        <h1>
          CONDITION #{id} <span className="statepill big" style={{ background: STATE_COLORS[st] }}>{st}</span>
        </h1>
        <button className="btnlink" style={{ cursor: "pointer" }} onClick={() => nav("/verify")}>
          Verify from chain →
        </button>
      </div>

      <div className="timeline">
        <Step on label="CREATED" sub={`condition #${id} recorded`} />
        <Step on label="FUNDED" sub={`${amountStr} tUSDC locked`} />
        <Step on={state >= 1 && state !== 4} label={mkt?.resolved ? "DREAMDEX RESOLVED" : "WAITING FOR MARKET"} sub={mkt?.resolved ? `market contract ${shortAddr(cond.market)}` : "market has not finalized yet"} />
        {mkt && (
          <Step
            on={state >= 1}
            label={mkt.resolved ? `CONDITION ${holds ? "TRUE" : "FALSE"}` : "UNRESOLVED"}
            sub={
              mkt.resolved
                ? mkt.voided
                  ? "market voided — fail closed"
                  : `market settled ${actualSide} · expected ${expSide}`
                : "read isResolved from the market contract"
            }
          />
        )}
        <Step on={state === 3} label="EXECUTED" sub="funds released to recipient" />
      </div>

      <div className="homerow">
        <section className="card">
          <h3>Condition</h3>
          <table className="kv">
            <tbody>
              <tr><td>Market id</td><td className="mono">{cond.marketId.slice(0, 12)}…{cond.marketId.slice(-6)}</td></tr>
              <tr><td>Market contract</td><td className="mono"><a href={addrLink(cond.market)} target="_blank" rel="noreferrer">{shortAddr(cond.market)} ↗</a></td></tr>
              <tr><td>Expected</td><td><b>{expSide}</b></td></tr>
              <tr><td>Amount locked</td><td>{amountStr} tUSDC</td></tr>
              <tr><td>Recipient</td><td className="mono">{shortAddr(cond.recipient)}</td></tr>
              <tr><td>Creator</td><td className="mono">{shortAddr(cond.creator)}</td></tr>
              <tr><td>Expiry</td><td>{new Date(Number(cond.expiry) * 1000).toLocaleString()}</td></tr>
            </tbody>
          </table>
        </section>

        <section className="card">
          <h3>DreamDEX market state (canonical)</h3>
          {mkt ? (
            <table className="kv">
              <tbody>
                <tr><td>isResolved</td><td><b>{mkt.resolved ? "true" : "false"}</b></td></tr>
                <tr><td>isVoided</td><td><b>{mkt.voided ? "true" : "false"}</b></td></tr>
                <tr><td>Actual outcome</td><td><b>{mkt.winner === null ? "—" : actualSide}</b></td></tr>
                <tr><td>Payout vector</td><td className="mono">[{mkt.payouts.join(", ")}]</td></tr>
                <tr><td>Condition holds</td><td><b>{holds === null ? "—" : holds ? "TRUE ✓" : "FALSE ✗"}</b></td></tr>
              </tbody>
            </table>
          ) : (
            <p className="muted small">Market state read failed — check the market contract on the explorer.</p>
          )}
          <p className="muted small" style={{ marginTop: 10 }}>
            Every field on this page is read live from the chain — no database, no cached result.
          </p>
        </section>
      </div>
    </div>
  );
}

function Step({ label, sub, on }: { label: string; sub?: string; on: boolean }) {
  return (
    <div className={`tl-step ${on ? "on" : ""}`}>
      <div className="tl-dot" />
      <div>
        <div className="tl-label">{label}</div>
        {sub && <div className="tl-sub">{sub}</div>}
      </div>
    </div>
  );
}

// ---------------- VERIFY ----------------

function VerifyView() {
  const [id, setId] = useState("");
  const [data, setData] = useState<{ id: string; cond: ConditionRow; state: number; mkt: { resolved: boolean; voided: boolean; winner: number | null } | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const lookup = async (raw: string) => {
    const cid = raw.replace(/\D/g, "").trim();
    if (!cid) return;
    setErr(null);
    setData(null);
    try {
      const n = BigInt(cid);
      const [cond, state] = await Promise.all([readCondition(n), readConditionState(n)]);
      let mkt: { resolved: boolean; voided: boolean; winner: number | null } | null = null;
      try {
        const { parseAbi: pa } = await import("viem");
        const marketAbi = pa([
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
          payouts.forEach((v: bigint, i: number) => {
            if (v > best) { best = v; winner = i; }
          });
        }
        mkt = { resolved: Boolean(resolved), voided: Boolean(voided), winner };
      } catch {
        mkt = null;
      }
      setData({ id: cid, cond, state, mkt });
    } catch (e) {
      setErr(`Could not read condition #${cid}: ${(e as Error).message?.slice(0, 160)}`);
    }
  };

  return (
    <div className="verifywrap">
      <h1>Verify a condition from chain state</h1>
      <p className="muted">Enter a condition id. Reads the vault + the referenced DreamDEX market directly from the chain — no backend, no indexer truth.</p>
      <div className="verifyrow">
        <input placeholder="condition id, e.g. 1" value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup(id)} />
        <button className="cta" onClick={() => lookup(id)} disabled={!CONDITION_VAULT || !id}>VERIFY</button>
      </div>
      {err && <p className="err">{err}</p>}
      {data && (
        <div className="card verifycard">
          <div className="condhead">
            <span>CONDITION #{data.id}</span>
            <span className="statepill" style={{ background: STATE_COLORS[STATE_NAMES[data.state]] }}>{STATE_NAMES[data.state]}</span>
          </div>
          {data.mkt && (
            <div className="verifyverdict">
              <div>
                <span className="muted small">expected</span>
                <b>{data.cond.expected === 0 ? "UP" : "DOWN"}</b>
              </div>
              <div className="vs">vs</div>
              <div>
                <span className="muted small">on-chain result</span>
                <b>
                  {data.mkt.winner === null ? "unresolved" : data.mkt.winner === 0 ? "UP" : "DOWN"}
                  {data.mkt.voided ? " (voided)" : ""}
                </b>
              </div>
              <div className="vs">=</div>
              <div>
                <span className="muted small">condition</span>
                <b className={data.mkt.winner === (data.cond.expected as number) ? "oktext" : "badtext"}>
                  {data.mkt.winner === null ? "—" : data.mkt.winner === (data.cond.expected as number) ? "TRUE ✓" : "FALSE ✗"}
                </b>
              </div>
            </div>
          )}
          <button className="btnlink" style={{ cursor: "pointer" }} onClick={() => nav(`/condition/${data.id}`)}>
            Full proof page →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------- DOCS ----------------

function DocsView() {
  return (
    <div className="aboutwrap">
      <h1>How ORACLELESS works</h1>
      <div className="card notbranch">
        <h3>Why this is not Branch</h3>
        <p>
          Branch: outcome → <b>another DreamDEX trade</b> (a trading strategy).<br />
          ORACLELESS: outcome → <b>arbitrary external contract action</b> (payment, escrow, treasury, agent authority — any programmable state transition).
        </p>
      </div>
      <div className="card trust">
        <h3>Trust model</h3>
        <ul>
          <li><b>DreamDEX determines what happened.</b> The vault reads the market contract's canonical state (isResolved + payoutNumerators, winner = argmax). No indexer, frontend, backend, or keeper decides.</li>
          <li><b>ORACLELESS determines what that fact may trigger.</b> execute() is permissionless — anyone can fire it, nobody can fake the outcome or redirect the payout.</li>
          <li><b>Fail closed.</b> Voided, wrong-outcome, unresolved, and expired conditions never release funds. The creator reclaims after expiry.</li>
          <li><b>Parameters are immutable</b> after creation — market, expected outcome, recipient, amount, and expiry cannot be changed.</li>
        </ul>
      </div>
      <div className="card">
        <h3>Contracts</h3>
        <table className="kv">
          <tbody>
            <tr><td>OraclelessConditionVault</td><td className="mono"><a href={addrLink(CONDITION_VAULT)} target="_blank" rel="noreferrer">{CONDITION_VAULT.slice(0, 10)}…{CONDITION_VAULT.slice(-6)} ↗</a></td></tr>
            <tr><td>DreamDEX BinaryMarketsModule</td><td className="mono">0x3ecC694C…E388</td></tr>
            <tr><td>Collateral</td><td>tUSDC (6 dp, faucet-mintable)</td></tr>
            <tr><td>Network</td><td>Somnia Shannon · chain 50312</td></tr>
          </tbody>
        </table>
        <p className="muted small">Settlement truth comes from the DreamDEX market contract, which ORACLELESS never controls.</p>
      </div>
      <div className="card">
        <h3>Verify from the CLI</h3>
        <pre className="codeblock">{`CONDITION_VAULT=${CONDITION_VAULT || "<vault>"} node web/scripts/verify.mjs 1`}</pre>
        <p className="muted small">The verifier re-derives a condition's state from the chain and exits non-zero on inconsistency.</p>
      </div>
    </div>
  );
}

export default App;
