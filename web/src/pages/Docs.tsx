import { CONDITION_VAULT } from "../lib/config";
import { addrLink } from "../lib/chain";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Separator } from "../components/ui/separator";

export function DocsView() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="display text-2xl font-bold uppercase tracking-tight">How ORACLELESS works</h1>
        <p className="mt-1 text-sm text-foreground/60">The condition layer, its trust model, and its contracts.</p>
      </div>

      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="display text-sm uppercase tracking-wider">Not Branch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <p>
            <b>Branch:</b> outcome to another DreamDEX trade. A trading strategy.
          </p>
          <p>
            <b>ORACLELESS:</b> outcome to an arbitrary external contract action. Payment, escrow, treasury, agent
            authority.
          </p>
          <p className="pt-2 text-foreground/65">
            The consumer of the outcome is an external contract, not another order. ORACLELESS is not an oracle,
            prediction market, escrow product, or trading strategy.
          </p>
        </CardContent>
      </Card>

      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="display text-sm uppercase tracking-wider">Trust model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Trust t="Source of truth is the chain" d="The vault reads isResolved plus payoutNumerators. Winner is the argmax of the payout vector. No indexer, backend, AI, or keeper." />
          <Trust t="Anyone can execute, only the recipient receives" d="execute() is permissionless. Execution permission and payout ownership are separate by construction." />
          <Trust t="Fail closed" d="Wrong outcome, voided, unresolved, and expired conditions never release funds. Creator reclaims after expiry." />
          <Trust t="No admin keys" d="No function can redirect a payout, change a condition, or withdraw on the creator's behalf." />
        </CardContent>
      </Card>

      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="display text-sm uppercase tracking-wider">Contracts</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <KV k="OraclelessConditionVault" v={CONDITION_VAULT ? CONDITION_VAULT : "unset"} mono link={CONDITION_VAULT ? addrLink(CONDITION_VAULT) : undefined} />
          <KV k="DreamDEX BinaryMarketsModule" v="0x3ecC694Cef705358864a646142ac17A90E29e388" mono />
          <KV k="Collateral" v="tUSDC, 6 decimals, faucet minted" />
          <KV k="Network" v="Somnia Shannon, chain 50312" />
          <Separator className="my-3" />
          <p className="text-[13px] text-foreground/60">
            Settlement truth comes from the DreamDEX market contract, which ORACLELESS never controls.
          </p>
        </CardContent>
      </Card>

      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="display text-sm uppercase tracking-wider">Verify from the CLI</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="data overflow-x-auto border border-foreground/20 bg-[#0a0a0a] p-3 text-[12px] text-[#d9ff00]">{`CONDITION_VAULT=${CONDITION_VAULT || "<vault>"} node web/scripts/verify.mjs 1`}</pre>
          <p className="mt-2 text-xs text-foreground/50">
            The verifier re-derives a condition's state from the chain and exits non-zero on inconsistency.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Trust({ t, d }: { t: string; d: string }) {
  return (
    <div>
      <div className="display font-semibold uppercase">{t}</div>
      <p className="text-foreground/65">{d}</p>
    </div>
  );
}

function KV({ k, v, mono, link }: { k: string; v: string; mono?: boolean; link?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-foreground/10 py-2 last:border-0">
      <span className="data text-xs uppercase tracking-wider text-foreground/55">{k}</span>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" className={`${mono ? "data" : ""} underline-offset-4 hover:underline`}>
          {v.slice(0, 10)}...{v.slice(-6)} ↗
        </a>
      ) : (
        <span className={`${mono ? "data" : ""} text-right`}>{v}</span>
      )}
    </div>
  );
}
