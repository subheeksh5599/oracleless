import { useEffect, useState } from "react";
import { decodeEventLog } from "viem";
import { fetchLiveMarkets, marketLabel, marketQuestion, type LiveMarket } from "../lib/markets";
import { makeWalletClient, useWallet } from "../lib/wallet";
import { readConditionCount, publicClient } from "../lib/chain";
import { CONDITION_VAULT, INDEXER_URL, TUSDC, TUSDC_DECIMALS, vaultAbi, erc20Abi } from "../lib/config";
import { nav } from "../lib/router";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export function CreateView() {
  const wallet = useWallet();
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

  const connected = !!wallet.address && wallet.chainId === 50312;

  const create = async () => {
    if (!wallet.address || !selected || !recipient || !CONDITION_VAULT) return;
    setBusy(true);
    setMsg(null);
    try {
      const wc = makeWalletClient();
      if (!wc) throw new Error("no wallet client");
      const amt = BigInt(Math.round(Number(amount) * 10 ** TUSDC_DECIMALS));
      const expiry = BigInt(Math.floor(Date.now() / 1000) + Number(expiryMin) * 60);

      setMsg("Step 1 of 2: approve tUSDC spending.");
      const appr = await wc.writeContract({
        address: TUSDC as `0x${string}`,
        abi: erc20Abi,
        functionName: "approve",
        args: [CONDITION_VAULT as `0x${string}`, amt as bigint],
        account: wallet.address as `0x${string}`,
      } as never);
      await publicClient.waitForTransactionReceipt({ hash: appr });

      setMsg("Step 2 of 2: create the condition. Confirm in your wallet.");
      const tx = await wc.writeContract({
        address: CONDITION_VAULT as `0x${string}`,
        abi: vaultAbi,
        functionName: "createCondition",
        args: [selected.marketId as `0x${string}`, TUSDC as `0x${string}`, side === "UP" ? 0 : 1, recipient as `0x${string}`, amt as bigint, expiry as bigint],
        account: wallet.address as `0x${string}`,
      } as never);
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
      setMsg(`Transaction failed: ${(e as Error).message?.slice(0, 220) ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-2xl font-bold uppercase tracking-tight">Create a condition</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Lock tUSDC behind a DreamDEX outcome. The vault releases to the recipient only when the market settles as you
          expect. Two transactions: approve, then create.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        {/* market list */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="display text-sm uppercase tracking-wider">1. Pick a market</CardTitle>
          </CardHeader>
          <CardContent>
            {marketErr && <p className="mb-3 text-sm text-[#ff4d00]">Could not load markets: {marketErr}</p>}
            {!marketErr && markets.length === 0 && <p className="text-sm text-foreground/55">Loading live markets...</p>}
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {markets.map((m) => {
                const isSel = selected?.marketId === m.marketId;
                const live = m.clobStatus === "Trading";
                return (
                  <button
                    key={m.marketId}
                    className={`block w-full border p-3 text-left transition-colors ${
                      isSel ? "border-foreground bg-[#d9ff00]/40" : "border-foreground/20 bg-white/40 hover:bg-white/70"
                    }`}
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
          </CardContent>
        </Card>

        {/* condition builder */}
        <Card className="h-fit border-2 border-foreground">
          <CardHeader>
            <CardTitle className="display text-sm uppercase tracking-wider">2. Set the condition</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <p className="text-sm text-foreground/55">Select a market on the left to continue.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={side === "UP" ? "default" : "outline"}
                    className="display border-2 border-foreground uppercase tracking-wider"
                    onClick={() => setSide("UP")}
                  >
                    settles UP
                  </Button>
                  <Button
                    variant={side === "DOWN" ? "default" : "outline"}
                    className="display border-2 border-foreground uppercase tracking-wider"
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
                  <Input id="rcpt" placeholder="0x..." value={recipient} onChange={(e) => setRecipient(e.target.value)} className="data rounded-none border-foreground bg-white/60" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="exp" className="data text-xs uppercase tracking-wider">
                    Expiry, minutes
                  </Label>
                  <Input id="exp" type="number" min="1" value={expiryMin} onChange={(e) => setExpiryMin(e.target.value)} className="rounded-none border-foreground bg-white/60" />
                </div>

                <div className="border-2 border-foreground bg-[#0a0a0a] p-3 text-[#edeae3]">
                  <div className="display text-sm uppercase tracking-wide">
                    <span className="text-[#d9ff00]">IF</span> {selected ? marketLabel(selected).split("·")[0].trim() : ""} settles {side}
                  </div>
                  <div className="mt-1 text-sm text-[#edeae3]/75">
                    <span className="data text-[#d9ff00]">THEN</span> release {amount || "0"} tUSDC to{" "}
                    <span className="data text-[#edeae3]">
                      {recipient ? `${recipient.slice(0, 6)}...${recipient.slice(-4)}` : "0x..."}
                    </span>
                  </div>
                </div>

                {!connected && <p className="text-sm text-[#ff4d00]">Connect your wallet and switch to Somnia Shannon (chain 50312).</p>}

                {createdId ? (
                  <div className="border-2 border-[#2c5f4d] bg-[#2c5f4d]/10 p-3">
                    <p className="text-sm">
                      <span className="font-semibold text-[#2c5f4d]">Condition #{createdId} created.</span> Funds are locked in the vault.
                    </p>
                    <Button variant="link" size="sm" className="p-0 text-[#2c5f4d]" onClick={() => nav(`/app/condition/${createdId}`)}>
                      View condition proof →
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="lg"
                    className="display w-full border-2 border-foreground bg-[#d9ff00] uppercase tracking-wider text-foreground shadow-[4px_4px_0_#0a0a0a] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:shadow-none"
                    disabled={busy || !connected || !CONDITION_VAULT}
                    onClick={create}
                  >
                    {busy ? "Working..." : "Lock funds"}
                  </Button>
                )}
                {msg && <p className={`text-sm ${msg.startsWith("Transaction failed") ? "text-[#ff4d00]" : "text-foreground/70"}`}>{msg}</p>}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
