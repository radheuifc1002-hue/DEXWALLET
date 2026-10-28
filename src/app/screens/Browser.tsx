import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Card } from "../components/ui/card";
import { BottomNav } from "../components/BottomNav";
import { Search, Globe, History, Trash2, X } from "lucide-react";
import { getHistory, clearHistory, HistoryEntry, formatTimeAgo } from "../services/browserHistory";

interface DApp {
  name: string;
  url: string;
  category: string;
  icon: string;
}

const popularDApps: DApp[] = [
  { name: "Uniswap", url: "app.uniswap.org", category: "DeFi", icon: "🦄" },
  { name: "OpenSea", url: "opensea.io", category: "NFT", icon: "🌊" },
  { name: "PancakeSwap", url: "pancakeswap.finance", category: "DeFi", icon: "🥞" },
  { name: "Magic Eden", url: "magiceden.io", category: "NFT", icon: "✨" },
  { name: "Aave", url: "app.aave.com", category: "DeFi", icon: "👻" },
  { name: "Rarible", url: "rarible.com", category: "NFT", icon: "🎨" },
  { name: "1inch", url: "app.1inch.io", category: "DeFi", icon: "🔥" },
  { name: "Curve", url: "curve.fi", category: "DeFi", icon: "🔵" },
  { name: "dYdX", url: "dydx.exchange", category: "DeFi", icon: "📈" },
  { name: "Tensor", url: "tensor.trade", category: "NFT", icon: "⚡" },
];

const categories = ["All", "DeFi", "NFT", "Gaming"];

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
    if (searchQuery.trim()) {
      navigateToDApp(searchQuery.trim(), searchQuery.trim());
    }
  };

  const handleClearHistory = () => {
    clearHistory();
    setRecentHistory([]);
  };

  const filteredDApps =
    activeCategory === "All"
      ? popularDApps
      : popularDApps.filter((d) => d.category === activeCategory);

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="mb-2">DApp Browser</h1>
          <p className="text-muted-foreground">Explore decentralized apps</p>
        </div>

        {/* Search / Address Bar */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search or enter URL (e.g. app.uniswap.org)"
              className="w-full pl-12 pr-12 h-14 text-sm rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {searchQuery && (
            <button
              type="submit"
              className="mt-2 w-full h-11 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Go to "{searchQuery}"
            </button>
          )}
        </form>

        {/* Categories */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors shrink-0 ${
                activeCategory === cat
                  ? "bg-primary text-white"
                  : "bg-secondary text-foreground hover:bg-secondary/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Popular DApps Grid */}
        <div className="mb-8">
          <h3 className="mb-4">Popular DApps</h3>
          <div className="grid grid-cols-2 gap-3">
            {filteredDApps.map((dapp) => (
              <Card
                key={dapp.name}
                className="p-4 cursor-pointer hover:shadow-md active:scale-95 transition-all"
                onClick={() => navigateToDApp(dapp.url, dapp.name)}
              >
                <div className="text-3xl mb-2">{dapp.icon}</div>
                <h4 className="text-sm font-semibold mb-0.5">{dapp.name}</h4>
                <p className="text-xs text-muted-foreground">{dapp.category}</p>
                <p className="text-xs text-primary/70 truncate mt-1">{dapp.url}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* Browse History */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 hover:opacity-70 transition-opacity"
            >
              <History className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm">Recently Visited</h3>
              {recentHistory.length > 0 && (
                <span className="text-xs bg-secondary px-1.5 py-0.5 rounded-full text-muted-foreground">
                  {recentHistory.length}
                </span>
              )}
            </button>
            {recentHistory.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>

          {recentHistory.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No history yet — visit a DApp to get started
            </div>
          ) : (
            <Card className="p-2">
              {(showHistory ? recentHistory : recentHistory.slice(0, 3)).map((item, index) => (
                <div
                  key={index}
                  onClick={() => navigateToDApp(item.url, item.name)}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/50 cursor-pointer transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Globe className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.url}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatTimeAgo(item.visitedAt)}
                  </span>
                </div>
              ))}
              {!showHistory && recentHistory.length > 3 && (
                <button
                  onClick={() => setShowHistory(true)}
                  className="w-full p-3 text-xs text-primary hover:bg-secondary/30 rounded-xl transition-colors"
                >
                  Show {recentHistory.length - 3} more
                </button>
              )}
            </Card>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
