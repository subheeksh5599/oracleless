import { useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, decodeEventLog, http, parseAbi } from "viem";
import { CONDITION_VAULT, EXPLORER_URL, INDEXER_URL, RPC_URL, TUSDC, somniaShannon, vaultAbi } from "./lib/config";
import { fetchLiveMarkets, marketLabel, marketQuestion, type LiveMarket } from "./lib/markets";
import { ensureConnected, switchToShannon, useWallet } from "./lib/wallet";
import "./App.css";

type View = "create" | "verify" | "about";

const publicClient = createPublicClient({
  chain: somniaShannon,
  transport: http(RPC_URL),
});

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

const STATE_NAMES = ["PENDING", "SATISFIED", "FAILED", "EXECUTED", "EXPIRED"] as const;
const STATE_COLORS: Record<string, string> = {
  PENDING: "var(--accent)",
  SATISFIED: "var(--ok)",
  FAILED: "var(--bad)",
  EXECUTED: "var(--ok)",
  EXPIRED: "var(--muted)",
};

function App() {
  const [view, setView] = useState<View>("create");
  const wallet = useWallet();

  useEffect(() => {
    const onAccounts = () => window.location.reload();
    window.ethereum?.on("accountsChanged", onAccounts);
    window.ethereum?.on("chainChanged", onAccounts);
    return () => {
      window.ethereum?.removeListener("accountsChanged", onAccounts);
      window.ethereum?.removeListener("chainChanged", onAccounts);
    };
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand" onClick={() => setView("create")}>
          <span className="logo">◈</span> ORACLELESS
        </div>
        <nav>
          <button className={view === "create" ? "navbtn on" : "navbtn"} onClick={() => setView("create")}>
            Create
          </button>
          <button className={view === "verify" ? "navbtn on" : "navbtn"} onClick={() => setView("verify")}>
            Verify
          </button>
          <button className={view === "about" ? "navbtn on" : "navbtn"} onClick={() => setView("about")}>
            Docs
          </button>
        </nav>
        <WalletButton />
      </header>

      <main>
        {view === "create" && <CreateView wallet={wallet} />}
        {view === "verify" && <VerifyView />}
        {view === "about" && <AboutView />}
      </main>

      <footer className="foot">
        <span>Live on Somnia Shannon · testnet</span>
        <span className="muted">DreamDEX determines what happened. ORACLELESS determines what that fact may trigger.</span>
      </footer>
    </div>
  );
}

function WalletButton() {
  const wallet = useWallet();
  const onConnect = async () => {
    const addr = await ensureConnected();
    if (addr) {
      const ok = await switchToShannon();
      if (!ok && window.ethereum) {
        // add chain
      }
    }
  };
  if (!wallet.address) {
    return (
      <button className="walletbtn" onClick={onConnect}>
        {wallet.connecting ? "Connecting…" : "Connect wallet"}
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
        {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
      </span>
    </div>
  );
}

// ---------------- CREATE ----------------

function CreateView({ wallet }: { wallet: { address: `0x${string}` | null; chainId: number | null } }) {
  const [markets, setMarkets] = useState<LiveMarket[]>([]);
  const [marketErr, setMarketErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<LiveMarket | null>(null);
  const [side, setSide] = useState<"UP" | "DOWN">("UP");
  const [amount, setAmount] = useState("50");
  const [recipient, setRecipient] = useState("");
  const [expiryMin, setExpiryMin] = useState("120");
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
    if (!wallet.address || !selected || !recipient || !CONDITION_VAULT) {
      setMsg(CONDITION_VAULT ? "Connect, pick a market, and set a recipient." : "ConditionVault not deployed yet — set VITE_CONDITION_VAULT.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const wc = createWalletClient({ chain: somniaShannon, transport: custom(window.ethereum!) });
      const amt = BigInt(Math.round(Number(amount) * 1e6));
      const expiry = BigInt(Math.floor(Date.now() / 1000) + Number(expiryMin) * 60);

      // approve
      const appr = await wc.writeContract({
        address: TUSDC,
        abi: erc20Abi,
        functionName: "approve",
        args: [CONDITION_VAULT as `0x${string}`, amt],
        account: wallet.address,
      });
      setMsg(`Approved. tx ${appr.slice(0, 10)}… waiting`);
      await publicClient.waitForTransactionReceipt({ hash: appr });

      const marketId = selected.marketId as `0x${string}`;
      const tx = await wc.writeContract({
        address: CONDITION_VAULT as `0x${string}`,
        abi: vaultAbi,
        functionName: "createCondition",
        args: [marketId, TUSDC, side === "UP" ? 0 : 1, recipient as `0x${string}`, amt, expiry],
        account: wallet.address,
      });
      setMsg(`Condition tx ${tx.slice(0, 10)}… waiting for confirmation`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      // parse ConditionCreated log for id
      const iface = { ConditionCreated: "event ConditionCreated(uint256 indexed conditionId, bytes32 indexed marketId, address indexed creator, address recipient, address collateral, uint256 amount, uint8 expected, uint64 expiry)" };
      let id: string | null = null;
      if (receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const d = decodeEventLog({ abi: [iface.ConditionCreated], data: log.data, topics: log.topics as [`0x${string}`, ...`0x${string}`[]] });
            if (d.eventName === "ConditionCreated") id = ((d.args as unknown as { conditionId: bigint }).conditionId).toString();
          } catch {
            /* not our event */
          }
        }
      }
      setCreatedId(id ?? (await publicClient.readContract({ address: CONDITION_VAULT as `0x${string}`, abi: vaultAbi, functionName: "conditionCount" })).toString());
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
        <div className="marketlist">
          {markets.map((m) => (
            <button
              key={m.marketId}
              className={`marketrow ${selected?.marketId === m.marketId ? "on" : ""}`}
              onClick={() => setSelected(m)}
            >
              <div className="mrow-top">
                <span className="mtitle">{marketLabel(m)}</span>
                <span className={`mstatus ${m.clobStatus === "Trading" ? "live" : "settled"}`}>{m.clobStatus === "Trading" ? "LIVE" : "SETTLED"}</span>
              </div>
              <div className="mq">{marketQuestion(m)}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="card step">
        <h2>2 · Set the condition</h2>
        {!selected ? (
          <p className="muted">Select a market to continue.</p>
        ) : (
          <>
            <div className="siderow">
              <button className={`sidebtn ${side === "UP" ? "on up" : ""}`} onClick={() => setSide("UP")}>
                settles UP
              </button>
              <button className={`sidebtn ${side === "DOWN" ? "on down" : ""}`} onClick={() => setSide("DOWN")}>
                settles DOWN
              </button>
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

            {!CONDITION_VAULT && (
              <p className="err">ConditionVault address not configured (VITE_CONDITION_VAULT). Deploy first.</p>
            )}
            {!connected && <p className="err">Connect your wallet and switch to Somnia Shannon (chain 50312).</p>}

            {createdId ? (
              <div className="donebox">
                <p>✔ Condition #{createdId} created.</p>
                <a className="btnlink" href={`#/verify/${createdId}`} onClick={() => window.location.reload()}>
                  View proof →
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

// ---------------- VERIFY ----------------

function VerifyView() {
  const [id, setId] = useState("");
  const [data, setData] = useState<null | { id: string; state: number; cond: Awaited<ReturnType<typeof readCondition>> }>(null);
  const [err, setErr] = useState<string | null>(null);

  const lookup = async (raw: string) => {
    const cid = raw.replace("#", "").trim();
    if (!cid) return;
    setErr(null);
    setData(null);
    try {
      const cond = await readCondition(cid);
      const st = await publicClient.readContract({
        address: CONDITION_VAULT as `0x${string}`,
        abi: vaultAbi,
        functionName: "conditionState",
        args: [BigInt(cid)],
      });
      setData({ id: cid, state: Number(st), cond });
    } catch (e) {
      setErr(`Could not read condition #${cid}: ${(e as Error).message?.slice(0, 160)}`);
    }
  };

  // support #/verify/<id> deep link
  useEffect(() => {
    const m = window.location.hash.match(/verify\/(\d+)/);
    if (m) {
      setId(m[1]);
      lookup(m[1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="verifywrap">
      <h1>Verify a condition from chain state</h1>
      <p className="muted">Enter a condition id. Reads the vault + the referenced DreamDEX market directly from the chain — no backend, no indexer truth.</p>
      <div className="verifyrow">
        <input placeholder="condition id, e.g. 42" value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup(id)} />
        <button className="cta" onClick={() => lookup(id)} disabled={!CONDITION_VAULT || !id}>
          VERIFY
        </button>
      </div>
      {!CONDITION_VAULT && <p className="err">ConditionVault not deployed — set VITE_CONDITION_VAULT.</p>}
      {err && <p className="err">{err}</p>}
      {data && <ConditionCard data={data} />}
    </div>
  );
}

async function readCondition(id: string) {
  return publicClient.readContract({
    address: CONDITION_VAULT as `0x${string}`,
    abi: vaultAbi,
    functionName: "getCondition",
    args: [BigInt(id)],
  });
}

function ConditionCard({ data }: { data: { id: string; state: number; cond: Awaited<ReturnType<typeof readCondition>> } }) {
  const c = data.cond as unknown as {
    marketId: string;
    market: string;
    collateral: string;
    expected: number;
    recipient: string;
    amount: bigint;
    expiry: bigint;
    creator: string;
  };
  const stateName = STATE_NAMES[data.state] ?? "UNKNOWN";
  const color = STATE_COLORS[stateName] ?? "var(--muted)";
  const amountStr = (Number(c.amount) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const exp = new Date(Number(c.expiry) * 1000).toLocaleString();
  const href = (h: string) => `${EXPLORER_URL}${h}`;
  return (
    <div className="card condcard">
      <div className="condhead">
        <span>CONDITION #{data.id}</span>
        <span className="statepill" style={{ background: color }}>
          {stateName}
        </span>
      </div>
      <table className="kv">
        <tbody>
          <tr>
            <td>DreamDEX market</td>
            <td className="mono">
              {c.marketId.slice(0, 10)}…{c.marketId.slice(-6)}
            </td>
          </tr>
          <tr>
            <td>Market contract</td>
            <td className="mono">
              <a href={href(`/address/${c.market}`)} target="_blank" rel="noreferrer">
                {c.market.slice(0, 8)}…{c.market.slice(-6)}
              </a>
            </td>
          </tr>
          <tr>
            <td>Expected</td>
            <td>{c.expected === 0 ? "UP" : "DOWN"}</td>
          </tr>
          <tr>
            <td>Amount locked</td>
            <td>
              {amountStr} tUSDC
            </td>
          </tr>
          <tr>
            <td>Recipient</td>
            <td className="mono">{c.recipient.slice(0, 8)}…{c.recipient.slice(-6)}</td>
          </tr>
          <tr>
            <td>Creator</td>
            <td className="mono">{c.creator.slice(0, 8)}…{c.creator.slice(-6)}</td>
          </tr>
          <tr>
            <td>Expiry</td>
            <td>{exp}</td>
          </tr>
        </tbody>
      </table>
      <p className="muted small">Read from the vault on Shannon. Actual outcome is read live from the DreamDEX market contract (payoutNumerators) at verification time.</p>
    </div>
  );
}

// ---------------- ABOUT ----------------

function AboutView() {
  return (
    <div className="aboutwrap">
      <h1>
        DreamDEX events, <em>now programmable</em>.
      </h1>
      <p className="lede">
        DreamDEX Event Contracts already turn uncertain futures into deterministic on-chain outcomes. ORACLELESS makes those
        outcomes consumable as conditions for arbitrary external smart-contract actions.
      </p>
      <div className="flow">
        <div>DreamDEX market</div>
        <div className="arrow">↓ settles</div>
        <div>on-chain outcome</div>
        <div className="arrow">↓ verified</div>
        <div>condition</div>
        <div className="arrow">↓ triggers</div>
        <div>external action</div>
      </div>
      <div className="card trust">
        <h3>Trust model</h3>
        <ul>
          <li><b>DreamDEX determines what happened.</b> The vault reads the market contract's canonical state (isResolved + payout vector) — never a frontend, indexer, backend, or keeper.</li>
          <li><b>ORACLELESS determines what that fact may trigger.</b> execute() is permissionless: anyone can fire it, nobody can fake the outcome.</li>
          <li><b>Fail closed.</b> Voided, wrong-outcome, unresolved, and expired conditions never release funds. The creator reclaims after expiry.</li>
        </ul>
      </div>
      <div className="card notbranch">
        <h3>Why this is not Branch</h3>
        <p>
          Branch: outcome → <b>another DreamDEX trade</b> (a trading strategy).<br />
          ORACLELESS: outcome → <b>arbitrary external contract action</b> (payment, escrow, treasury, agent authority — any programmable state transition).
        </p>
      </div>
    </div>
  );
}

export default App;
