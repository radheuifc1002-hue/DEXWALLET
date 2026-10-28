import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Card } from "../components/ui/card";
import { BottomNav } from "../components/BottomNav";
import { Search, Globe, History, Trash2, X, ArrowUpRight, Sparkles, ShieldCheck } from "lucide-react";
import { getHistory, clearHistory, HistoryEntry, formatTimeAgo } from "../services/browserHistory";

interface DApp {
  name: string;
  url: string;
  domain: string;
  category: string;
  description: string;
}

const popularDApps: DApp[] = [
  { name: "Uniswap", url: "app.uniswap.org", domain: "app.uniswap.org", category: "DEX", description: "Swap tokens across chains" },
  { name: "Hyperliquid", url: "app.hyperliquid.xyz", domain: "hyperliquid.xyz", category: "Perps", description: "Onchain perpetuals trading" },
  { name: "Jupiter", url: "jup.ag", domain: "jup.ag", category: "DEX", description: "Solana trading and swaps" },
  { name: "Aave", url: "app.aave.com", domain: "aave.com", category: "Lending", description: "Lend and borrow crypto" },
  { name: "PancakeSwap", url: "pancakeswap.finance", domain: "pancakeswap.finance", category: "DEX", description: "Trade tokens and liquidity" },
  { name: "Polymarket", url: "polymarket.com", domain: "polymarket.com", category: "Predictions", description: "Explore prediction markets" },
  { name: "OpenSea", url: "opensea.io", domain: "opensea.io", category: "NFT", description: "Discover digital collectibles" },
  { name: "Lido", url: "lido.fi", domain: "lido.fi", category: "Staking", description: "Liquid staking" },
  { name: "Morpho", url: "app.morpho.org", domain: "morpho.org", category: "Lending", description: "Permissionless lending markets" },
  { name: "Aerodrome", url: "aerodrome.finance", domain: "aerodrome.finance", category: "DEX", description: "Base ecosystem liquidity" },
  { name: "Raydium", url: "raydium.io", domain: "raydium.io", category: "DEX", description: "Solana swaps and liquidity" },
  { name: "Magic Eden", url: "magiceden.io", domain: "magiceden.io", category: "NFT", description: "NFTs across multiple chains" },
  { name: "1inch", url: "app.1inch.io", domain: "1inch.io", category: "DEX", description: "DEX aggregation and swaps" },
  { name: "Curve", url: "curve.fi", domain: "curve.fi", category: "DEX", description: "Stablecoin-focused trading" },
  { name: "dYdX", url: "dydx.trade", domain: "dydx.trade", category: "Perps", description: "Decentralized derivatives" },
];

const categories = ["All", "DEX", "Perps", "Lending", "Staking", "NFT", "Predictions"];

function DAppLogo({ dapp }: { dapp: DApp }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-sm">
      {!failed ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${dapp.domain}&sz=128`}
          alt={`${dapp.name} logo`}
          loading="lazy"
          className="h-9 w-9 object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-lg font-bold text-white">{dapp.name.slice(0, 1)}</span>
      )}
    </div>
  );
}

export function Browser() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setRecentHistory(getHistory().slice(0, 10));
  }, []);

  const navigateToDApp = (url: string, name: string) => {
    navigate(`/dapp/${encodeURIComponent(url)}`, {
      state: { dapp: { name, url } },
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) navigateToDApp(searchQuery.trim(), searchQuery.trim());
  };

  const handleClearHistory = () => {
    clearHistory();
    setRecentHistory([]);
  };

  const filteredDApps = activeCategory === "All"
    ? popularDApps
    : popularDApps.filter((d) => d.category === activeCategory);

  return (
    <div className="min-h-screen bg-[#0b0d12] pb-24 text-white">
      <div className="mx-auto max-w-3xl px-5 pb-8 pt-7 sm:px-7">
        <header className="mb-7 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
              <Sparkles className="h-3.5 w-3.5" /> Explore Web3
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">DApp Browser</h1>
            <p className="mt-2 text-sm text-slate-400">Your gateway to decentralized apps.</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
            <Globe className="h-5 w-5 text-violet-300" />
          </div>
        </header>

        <form onSubmit={handleSearch} className="mb-7">
          <div className="group relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-violet-300" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dapps or enter a website URL"
              aria-label="Search dapps or enter a website URL"
              className="h-14 w-full rounded-2xl border border-white/10 bg-[#141720] pl-12 pr-12 text-sm text-white outline-none transition focus:border-violet-400/60 focus:ring-4 focus:ring-violet-500/10"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            {searchQuery && (
              <button type="button" aria-label="Clear search" onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchQuery && (
            <button type="submit" className="mt-2 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold transition hover:bg-violet-500">
              Open “{searchQuery}”
            </button>
          )}
          <div className="mt-3 flex items-center gap-2 px-1 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            Check website addresses carefully before connecting your wallet.
          </div>
        </form>

        <section className="mb-8">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Discover DApps</h2>
              <p className="mt-1 text-xs text-slate-500">Popular destinations across Web3</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-400">{filteredDApps.length} apps</span>
          </div>

          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition ${activeCategory === cat ? "border-violet-400/50 bg-violet-500/15 text-violet-200" : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-white"}`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filteredDApps.map((dapp) => (
              <Card
                key={dapp.name}
                onClick={() => navigateToDApp(dapp.url, dapp.name)}
                className="group cursor-pointer rounded-2xl border border-white/[0.08] bg-[#12151d] p-4 text-white shadow-none transition duration-200 hover:-translate-y-0.5 hover:border-violet-400/30 hover:bg-[#171a25] hover:shadow-lg hover:shadow-violet-950/20 active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <DAppLogo dapp={dapp} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{dapp.name}</h3>
                      <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400">{dapp.category}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{dapp.description}</p>
                    <p className="mt-1.5 truncate text-[11px] text-slate-600">{dapp.url}</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:text-violet-300" />
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-2 text-left hover:opacity-80">
              <History className="h-4 w-4 text-violet-300" />
              <h2 className="text-sm font-semibold">Recently visited</h2>
              {recentHistory.length > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">{recentHistory.length}</span>}
            </button>
            {recentHistory.length > 0 && (
              <button onClick={handleClearHistory} className="flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-red-300">
                <Trash2 className="h-3.5 w-3.5" /> Clear history
              </button>
            )}
          </div>

          {recentHistory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-7 text-center">
              <Globe className="mx-auto mb-2 h-5 w-5 text-slate-600" />
              <p className="text-sm text-slate-400">Your browsing history will appear here.</p>
            </div>
          ) : (
            <Card className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-[#12151d] p-1 text-white shadow-none">
              {(showHistory ? recentHistory : recentHistory.slice(0, 3)).map((item, index) => (
                <button key={`${item.url}-${index}`} onClick={() => navigateToDApp(item.url, item.name)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-white/[0.04]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10"><Globe className="h-4 w-4 text-violet-300" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-slate-500">{item.url}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-600">{formatTimeAgo(item.visitedAt)}</span>
                </button>
              ))}
              {!showHistory && recentHistory.length > 3 && (
                <button onClick={() => setShowHistory(true)} className="w-full rounded-xl p-3 text-xs font-medium text-violet-300 transition hover:bg-white/[0.04]">Show {recentHistory.length - 3} more</button>
              )}
            </Card>
          )}
        </section>
      </div>
      <BottomNav />
    </div>
  );
}
