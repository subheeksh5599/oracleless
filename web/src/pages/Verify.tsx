import { useState } from "react";
import { nav } from "../lib/router";
import { readCondition, readConditionState, readMarketState, sideLabel, type ConditionRow, type MarketState } from "../lib/chain";
import { STATE_NAMES } from "../lib/chain";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";

export function VerifyView() {
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ cond: ConditionRow; state: number; mkt: MarketState | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const lookup = async (raw: string) => {
    const cid = raw.replace(/\D/g, "").trim();
    if (!cid) return;
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      const n = BigInt(cid);
      const [cond, state] = await Promise.all([readCondition(n), readConditionState(n)]);
      const mkt = await readMarketState(cond.market);
      setRes({ cond, state, mkt });
    } catch (e) {
      setErr(`Could not read condition #${cid}: ${(e as Error).message?.slice(0, 160)}`);
    } finally {
      setBusy(false);
    }
  };

  const exp = res ? sideLabel(res.cond.expected) : "";
  const actual = res?.mkt?.winner === null ? null : res?.mkt?.winner === 0 ? "UP" : res?.mkt?.winner === 1 ? "DOWN" : null;
  const holds = actual && res ? actual === sideLabel(res.cond.expected) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="display text-2xl font-bold uppercase tracking-tight">Verify from chain state</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Enter a condition id. Reads the vault and the referenced DreamDEX market directly from the chain. No backend
          decides anything.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="condition id, e.g. 1"
          value={id}
          onChange={(e) => setId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup(id)}
          className="data rounded-none border-2 border-foreground bg-white/60"
        />
        <Button
          className="display border-2 border-foreground bg-[#d9ff00] text-xs uppercase tracking-wider shadow-[3px_3px_0_#0a0a0a] hover:shadow-none"
          disabled={!id || busy}
          onClick={() => lookup(id)}
        >
          {busy ? "Reading..." : "Verify"}
        </Button>
      </div>

      {err && <p className="text-sm text-[#ff4d00]">{err}</p>}

      {res && (
        <Card className="border-2 border-foreground bg-white/50 shadow-[5px_5px_0_#0a0a0a]">
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between">
              <span className="data text-sm uppercase tracking-wider">Condition #{id}</span>
              <Badge className="border-2 border-foreground">{STATE_NAMES[res.state]}</Badge>
            </div>

            <div className="grid grid-cols-3 gap-3 border-y border-foreground/15 py-3">
              <div>
                <div className="data text-[10px] uppercase tracking-wider text-foreground/50">Expected</div>
                <div className="display text-2xl font-semibold">{exp}</div>
              </div>
              <div className="text-center">
                <div className="data text-[10px] uppercase tracking-wider text-foreground/50">On chain</div>
                <div className="display text-2xl font-semibold">{actual ?? "-"}</div>
              </div>
              <div className="text-right">
                <div className="data text-[10px] uppercase tracking-wider text-foreground/50">Condition</div>
                <div className={`display text-2xl font-semibold ${holds === true ? "text-[#2c5f4d]" : holds === false ? "text-[#ff4d00]" : ""}`}>
                  {holds === null ? "-" : holds ? "TRUE" : "FALSE"}
                </div>
              </div>
            </div>

            <Button variant="link" size="sm" className="p-0 text-[#2c5f4d]" onClick={() => nav(`/app/condition/${id}`)}>
              Open full proof page →
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
