import { useEffect, useState } from "react";
import { nav } from "../lib/router";
import { addrLink, formatAmount, readCondition, readConditionState, readMarketState, sideLabel, type ConditionRow, type MarketState } from "../lib/chain";
import { STATE_NAMES } from "../lib/chain";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

function stateVariant(state: number): "default" | "secondary" | "destructive" | "outline" {
  if (state === 1 || state === 3) return "default";
  if (state === 2) return "destructive";
  return "outline";
}

export function ConditionDetailView({ id }: { id: string }) {
  const [cond, setCond] = useState<ConditionRow | null>(null);
  const [state, setState] = useState<number | null>(null);
  const [mkt, setMkt] = useState<MarketState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cid = BigInt(id.replace(/\D/g, "") || "0");
        const [c, s] = await Promise.all([readCondition(cid), readConditionState(cid)]);
        setCond(c);
        setState(s);
        setMkt(await readMarketState(c.market));
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    })();
  }, [id]);

  if (err) return <p className="text-sm text-[#ff4d00]">Could not read condition #{id}: {err}</p>;
  if (!cond || state === null) return <p className="text-sm text-foreground/55">Reading condition #{id} from the chain...</p>;

  const st = STATE_NAMES[state] ?? "UNKNOWN";
  const expSide = sideLabel(cond.expected);
  const actualSide = mkt?.winner === 0 ? "UP" : mkt?.winner === 1 ? "DOWN" : null;
  const holds = actualSide ? actualSide === expSide : null;

  const steps = [
    { label: "Created", on: true, sub: `condition #${id} recorded` },
    { label: "Funded", on: true, sub: `${formatAmount(cond.amount)} tUSDC locked` },
    { label: "Market resolved", on: state >= 1, sub: mkt?.resolved ? `market ${cond.market.slice(0, 8)}...` : "not finalized yet" },
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
        <h1 className="display text-2xl font-bold uppercase tracking-tight">
          Condition #{id} <Badge variant={stateVariant(state)} className="ml-2 border-2 border-foreground">{st}</Badge>
        </h1>
        <Button variant="outline" size="sm" className="data border-2 border-foreground text-xs uppercase tracking-wider" onClick={() => nav("/app/verify")}>
          Verify
        </Button>
      </div>

      {/* timeline */}
      <div className="border-2 border-foreground bg-white/40 p-4">
        <div className="grid gap-2 sm:grid-cols-5">
          {steps.map((s, i) => (
            <div key={s.label} className={`border p-3 ${s.on ? "border-foreground bg-[#d9ff00]/25" : "border-foreground/15 bg-white/30 opacity-50"}`}>
              <div className="data text-[10px] uppercase tracking-wider text-foreground/50">Step {i + 1}</div>
              <div className="display mt-1 text-sm font-semibold uppercase">{s.label}</div>
              <div className="mt-0.5 text-[11px] text-foreground/60">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="display text-sm uppercase tracking-wider">Condition parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <KV k="Market id" v={`${cond.marketId.slice(0, 10)}...${cond.marketId.slice(-6)}`} mono />
            <KV k="Market contract" v={cond.market} mono link={addrLink(cond.market)} />
            <KV k="Expected" v={expSide} strong />
            <KV k="Amount locked" v={`${formatAmount(cond.amount)} tUSDC`} />
            <KV k="Recipient" v={cond.recipient} mono link={addrLink(cond.recipient)} />
            <KV k="Creator" v={cond.creator} mono link={addrLink(cond.creator)} />
            <KV k="Expiry" v={new Date(Number(cond.expiry) * 1000).toLocaleString()} />
          </CardContent>
        </Card>

        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="display text-sm uppercase tracking-wider">DreamDEX market state, read on chain</CardTitle>
          </CardHeader>
          <CardContent>
            {mkt ? (
              <>
                <KV k="isResolved" v={mkt.resolved ? "true" : "false"} />
                <KV k="isVoided" v={mkt.voided ? "true" : "false"} />
                <KV k="Actual outcome" v={actualSide ?? "none yet"} strong={mkt.resolved && !mkt.voided} />
                <KV k="Payout vector" v={`[${mkt.payouts.join(", ")}]`} mono />
                <KV k="Condition holds" v={holds === null ? "pending" : holds ? "TRUE" : "FALSE"} strong={holds === true} accent={holds === false} />
              </>
            ) : (
              <p className="text-sm text-foreground/55">Market state read failed. Check the market contract on the explorer.</p>
            )}
            <p className="mt-3 text-[11px] text-foreground/45">Every field is a live chain read. No database, no cached result.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KV({ k, v, mono, link, strong, accent }: { k: string; v: string; mono?: boolean; link?: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-foreground/10 py-2 text-sm last:border-0">
      <span className="data text-xs uppercase tracking-wider text-foreground/55">{k}</span>
      <span className={`text-right ${mono ? "data" : ""} ${strong ? "font-semibold" : ""} ${accent ? "text-[#ff4d00]" : ""}`}>
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="data underline-offset-4 hover:underline">
            {v.slice(0, 12)}...{v.slice(-4)} ↗
          </a>
        ) : (
          v
        )}
      </span>
    </div>
  );
}
