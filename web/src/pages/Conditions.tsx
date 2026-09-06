import { useEffect, useState } from "react";
import { nav } from "../lib/router";
import { readCondition, readConditionCount, readConditionState, sideLabel } from "../lib/chain";
import { STATE_NAMES } from "../lib/chain";
import { formatAmount } from "../lib/chain";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";

interface Row {
  id: string;
  state: number;
  market: string;
  expected: number;
  amount: string;
  recipient: string;
}

function stateVariant(state: number): "default" | "secondary" | "destructive" | "outline" {
  if (state === 1 || state === 3) return "default";
  if (state === 2) return "destructive";
  return "outline";
}

export function ConditionsView() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const count = await readConditionCount();
        const out: Row[] = [];
        for (let i = Math.max(1, count - 24); i <= count; i++) {
          try {
            const [c, s] = await Promise.all([readCondition(BigInt(i)), readConditionState(BigInt(i))]);
            out.push({
              id: String(i),
              state: s,
              market: c.marketId.slice(0, 10),
              expected: c.expected,
              amount: formatAmount(c.amount),
              recipient: c.recipient,
            });
          } catch {
            /* skip */
          }
        }
        setRows(out.reverse());
      } catch {
        setRows([]);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl font-bold uppercase tracking-tight">Conditions</h1>
          <p className="mt-1 text-sm text-foreground/60">Every condition on the vault, read live from the chain.</p>
        </div>
        <Button className="display border-2 border-foreground bg-[#d9ff00] text-xs uppercase tracking-wider shadow-[3px_3px_0_#0a0a0a] hover:shadow-none" onClick={() => nav("/app")}>
          New condition
        </Button>
      </div>

      {rows === null ? (
        <p className="text-sm text-foreground/55">Loading conditions from the chain...</p>
      ) : rows.length === 0 ? (
        <Card className="border-2 border-foreground">
          <CardContent className="p-8 text-center">
            <p className="display text-lg uppercase">No conditions yet</p>
            <p className="mt-1 text-sm text-foreground/60">Create the first one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto border-2 border-foreground bg-white/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-foreground text-left">
                {["Id", "Market", "Expected", "Amount", "Recipient", "State"].map((h) => (
                  <th key={h} className="data px-3 py-2 text-[11px] uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-b border-foreground/10 transition-colors hover:bg-[#d9ff00]/20" onClick={() => nav(`/app/condition/${r.id}`)}>
                  <td className="data px-3 py-2.5">#{r.id}</td>
                  <td className="data px-3 py-2.5">{r.market}...</td>
                  <td className="data px-3 py-2.5">{sideLabel(r.expected)}</td>
                  <td className="data px-3 py-2.5">{r.amount} tUSDC</td>
                  <td className="data px-3 py-2.5">
                    {r.recipient.slice(0, 6)}...{r.recipient.slice(-4)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={stateVariant(r.state)} className="border border-foreground">
                      {STATE_NAMES[r.state] ?? "UNKNOWN"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
