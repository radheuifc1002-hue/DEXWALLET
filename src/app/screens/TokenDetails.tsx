import { useParams, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { useWallet } from "../context/WalletContext";
import { ArrowLeft, Send, Download, Copy, Check, ArrowUpRight, ArrowDownLeft, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { fetchTransactions, Transaction } from "../services/balanceService";

function formatTimeAgo(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function shortHash(hash: string): string {
  if (!hash || hash.length < 12) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export function TokenDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tokens, walletAddress, selectedBlockchain } = useWallet();
  const [copied, setCopied] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [txnError, setTxnError] = useState("");

  const token = tokens.find((t) => t.id === id);

  const getExplorerUrl = (hash: string): string => {
    const urls: Record<string, string> = {
      ethereum: `https://etherscan.io/tx/${hash}`,
      bnb: `https://bscscan.com/tx/${hash}`,
      polygon: `https://polygonscan.com/tx/${hash}`,
      solana: `https://solscan.io/tx/${hash}`,
    };
    return urls[selectedBlockchain] || "#";
  };

  const loadTransactions = async () => {
    if (!walletAddress) return;
    setLoadingTxns(true);
    setTxnError("");
    try {
      const txns = await fetchTransactions(walletAddress, selectedBlockchain);
      setTransactions(txns);
      if (txns.length === 0) {
        setTxnError("No transactions found");
      }
    } catch (e: any) {
      setTxnError("Could not load transactions");
    } finally {
      setLoadingTxns(false);
    }
  };

  useEffect(() => {
    if (walletAddress) loadTransactions();
  }, [walletAddress, selectedBlockchain]);

  const getTokenColor = (symbol: string) => {
    const colors: Record<string, string> = {
      SOL: "#14F195",
      ETH: "#627EEA",
      BNB: "#F3BA2F",
      MATIC: "#8247E5",
      USDC: "#2775CA",
      USDT: "#26A17B",
    };
    return colors[symbol] || "#6C4CF1";
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-muted-foreground">Token not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="p-6 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 hover:bg-secondary rounded-xl transition-colors mb-6"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <div className="text-center mb-8">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4"
            style={{ backgroundColor: getTokenColor(token.symbol) }}
          >
            {token.symbol.slice(0, 1)}
          </div>
          <h2 className="mb-1">{token.name}</h2>
          <p className="text-muted-foreground">{token.symbol}</p>
        </div>

        <Card className="p-6 mb-6 text-center">
          <p className="text-sm text-muted-foreground mb-2">Balance</p>
          <h1 className="text-4xl mb-2">{token.balance.toFixed(6)}</h1>
          <p className="text-xl text-muted-foreground">
            ${token.balanceUSD.toFixed(2)} USD
          </p>
        </Card>

        {token.contractAddress && (
          <Card className="p-4 mb-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground mb-1">Contract Address</p>
                <p className="text-xs font-mono break-all">{token.contractAddress}</p>
              </div>
              <button
                onClick={() => handleCopy(token.contractAddress!)}
                className="p-2 hover:bg-secondary rounded-lg transition-colors shrink-0"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-primary" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </Card>
        )}

        <div className="mb-6">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-secondary text-sm">
            {token.blockchain.charAt(0).toUpperCase() + token.blockchain.slice(1)}
          </div>
        </div>

        <div className="flex gap-4 mb-8">
          <Button
            onClick={() => navigate("/send", { state: { token } })}
            className="flex-1 h-14"
          >
            <Send className="w-4 h-4 mr-2" />
            Send
          </Button>
          <Button
            onClick={() => navigate("/receive")}
            variant="outline"
            className="flex-1 h-14"
          >
            <Download className="w-4 h-4 mr-2" />
            Receive
          </Button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h3>Transaction History</h3>
            <button
              onClick={loadTransactions}
              disabled={loadingTxns}
              className="p-2 hover:bg-secondary rounded-xl transition-colors"
              title="Refresh transactions"
            >
              <RefreshCw className={`w-4 h-4 ${loadingTxns ? "animate-spin" : ""}`} />
            </button>
          </div>

          {loadingTxns && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
              <span className="text-muted-foreground text-sm">Loading transactions...</span>
            </div>
          )}

          {!loadingTxns && txnError && transactions.length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-muted-foreground text-sm">{txnError}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Add an Etherscan API key in settings for better results.
              </p>
            </Card>
          )}

          {!loadingTxns && transactions.length > 0 && (
            <Card className="p-2">
              <div className="space-y-1">
                {transactions.map((tx) => (
                  <div
                    key={tx.hash}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/30 transition-colors"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        tx.type === "receive"
                          ? "bg-green-500/10 text-green-500"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {tx.type === "receive" ? (
                        <ArrowDownLeft className="w-5 h-5" />
                      ) : (
                        <ArrowUpRight className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm capitalize">{tx.type}</p>
                        {tx.status === "failed" && (
                          <span className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Failed</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{shortHash(tx.hash)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium">{tx.value} {token.symbol}</p>
                      <p className="text-xs text-muted-foreground">{formatTimeAgo(tx.timestamp)}</p>
                    </div>
                    <a
                      href={getExplorerUrl(tx.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 hover:bg-secondary rounded-lg transition-colors shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </a>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
