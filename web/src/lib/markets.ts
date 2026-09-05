// ORACLELESS — read live DreamDEX event markets from the public indexer (real data).
// The market list is a convenience layer for the UI. Settlement TRUTH always comes
// from the chain (the vault re-reads the market contract at execution).

export interface LiveMarket {
  marketId: string;
  asset: string;
  intervalSec: string;
  question: string;
  expiry: string;
  clobStatus: string;
  createdAtTimestamp: string;
  winningOutcome: number | null;
  lastPrice: string | null;
}

const QUERY = `query LiveMarkets($limit: Int!) {
  Market(
    where: {
      marketType: { _eq: "BINARY" }
      clobStatus: { _in: ["Trading", "Finalized"] }
      intervalSec: { _in: ["300", "900", "3600"] }
    }
    limit: $limit
    order_by: { createdAtTimestamp: desc }
  ) {
    marketId
    asset
    intervalSec
    question
    expiry
    clobStatus
    createdAtTimestamp
    winningOutcome
    lastPrice
  }
}`;

export async function fetchLiveMarkets(indexerUrl: string, limit = 40): Promise<LiveMarket[]> {
  const res = await fetch(indexerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { limit } }),
  });
  if (!res.ok) throw new Error(`indexer ${res.status}`);
  const json = (await res.json()) as { data?: { Market?: LiveMarket[] }; errors?: unknown };
  if (json.errors) throw new Error("indexer query error");
  return json.data?.Market ?? [];
}

export function marketLabel(m: LiveMarket): string {
  const cadence = (() => {
    const s = Number(m.intervalSec);
    if (s === 300) return "5m";
    if (s === 900) return "15m";
    if (s === 3600) return "1h";
    return `${s}s`;
  })();
  const exp = m.expiry ? new Date(Number(m.expiry) * 1000).toLocaleTimeString() : "";
  return `${m.asset} ${cadence} · closes ${exp}`;
}

export function marketQuestion(m: LiveMarket): string {
  return m.question || `${m.asset} closes at or above its opening price`;
}
