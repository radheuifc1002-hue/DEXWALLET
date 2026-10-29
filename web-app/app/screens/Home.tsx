import { useState } from "react";
import { useNavigate } from "react-router";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { BottomNav } from "../components/BottomNav";
import { TokenListItem } from "../components/TokenListItem";
import { useWallet, Blockchain } from "../context/WalletContext";
import { Send, Download, Plus, Eye, EyeOff, QrCode, RefreshCw, Loader2 } from "lucide-react";

export function Home() {
  const navigate = useNavigate();
  const {
    tokens,
    selectedBlockchain,
    setSelectedBlockchain,
    network,
    setNetwork,
    walletAddress,
    isLoadingBalances,
    refreshBalances,
  } = useWallet();
  const [showBalance, setShowBalance] = useState(true);

  const filteredTokens = tokens.filter((token) => token.blockchain === selectedBlockchain);

  const totalBalance = filteredTokens.reduce((sum, token) => sum + token.balanceUSD, 0);

  const blockchainOptions: { value: Blockchain; label: string }[] = [
    { value: "ethereum", label: "ETH" },
    { value: "solana", label: "SOL" },
    { value: "bnb", label: "BNB" },
    { value: "polygon", label: "POLY" },
  ];

  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : "No wallet";

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="p-6 pb-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <span className="text-white font-bold">X</span>
            </div>
            <div>
              <h3 className="text-sm text-muted-foreground">Wallet</h3>
              <p className="text-xs text-muted-foreground font-mono">{shortAddress}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshBalances}
              disabled={isLoadingBalances}
              className="p-2 hover:bg-secondary rounded-xl transition-colors"
              title="Refresh balances"
            >
              {isLoadingBalances ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <RefreshCw className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={() => navigate("/receive")}
              className="p-2 hover:bg-secondary rounded-xl transition-colors"
            >
              <QrCode className="w-6 h-6" />
            </button>
          </div>
        </div>

        <Card className="p-6 bg-gradient-to-br from-primary to-primary/80 text-white border-0 shadow-lg shadow-primary/20">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-sm text-white/80 mb-2">Total Balance</p>
              <div className="flex items-center gap-3">
                {isLoadingBalances ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-white/80" />
                    <span className="text-white/60 text-lg">Fetching...</span>
                  </div>
                ) : showBalance ? (
                  <h1 className="text-4xl font-bold text-white">${totalBalance.toFixed(2)}</h1>
                ) : (
                  <h1 className="text-4xl font-bold text-white">••••••</h1>
                )}
                {!isLoadingBalances && (
                  <button
                    onClick={() => setShowBalance(!showBalance)}
                    className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {showBalance ? (
                      <Eye className="w-5 h-5" />
                    ) : (
                      <EyeOff className="w-5 h-5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => navigate("/send")}
              variant="secondary"
              className="flex-1 h-12 bg-white/20 hover:bg-white/30 text-white border-0"
            >
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
            <Button
              onClick={() => navigate("/receive")}
              variant="secondary"
              className="flex-1 h-12 bg-white/20 hover:bg-white/30 text-white border-0"
            >
              <Download className="w-4 h-4 mr-2" />
              Receive
            </Button>
          </div>
        </Card>
      </div>

      <div className="px-6 mb-4">
        <Tabs
          value={selectedBlockchain}
          onValueChange={(value) => setSelectedBlockchain(value as Blockchain)}
        >
          <TabsList className="w-full grid grid-cols-4 h-auto p-1">
            {blockchainOptions.map((option) => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                className="text-xs py-2"
              >
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="px-6 mb-6">
        <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30">
          <Label htmlFor="network" className="text-sm">
            Network: {network === "mainnet" ? "Mainnet" : "Testnet"}
          </Label>
          <Switch
            id="network"
            checked={network === "mainnet"}
            onCheckedChange={(checked) => setNetwork(checked ? "mainnet" : "testnet")}
          />
        </div>
      </div>

      <div className="px-6">
        <div className="flex items-center justify-between mb-4">
          <h3>Assets</h3>
          <button
            onClick={() => navigate("/import-token")}
            className="flex items-center gap-1 text-primary text-sm hover:opacity-80"
          >
            <Plus className="w-4 h-4" />
            Import Token
          </button>
        </div>

        <Card className="p-2">
          {filteredTokens.length > 0 ? (
            <div className="space-y-1">
              {filteredTokens.map((token) => (
                <TokenListItem key={token.id} token={token} />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              <p>No tokens for {selectedBlockchain}</p>
              <button
                onClick={() => navigate("/import-token")}
                className="text-primary text-sm mt-2 hover:opacity-80"
              >
                Import a token
              </button>
            </div>
          )}
        </Card>
      </div>

      <BottomNav />
    </div>
  );
}
