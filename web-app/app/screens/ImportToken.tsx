import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { useWallet } from "../context/WalletContext";
import { ArrowLeft, Loader2, Copy, AlertCircle, CheckCircle2 } from "lucide-react";
import { fetchERC20Info } from "../services/balanceService";

export function ImportToken() {
  const navigate = useNavigate();
  const { addToken, selectedBlockchain, walletAddress } = useWallet();
  const [contractAddress, setContractAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenData, setTokenData] = useState<{
    name: string;
    symbol: string;
    decimals: number;
    balance: number;
    balanceUSD: number;
  } | null>(null);
  const [error, setError] = useState("");

  const isSolana = selectedBlockchain === "solana";

  const handleFetchToken = async () => {
    if (!contractAddress.trim()) return;
    if (isSolana) {
      setError("Solana SPL token import requires a token mint address. Showing placeholder info.");
      setTokenData({ name: "SPL Token", symbol: "SPL", decimals: 9, balance: 0, balanceUSD: 0 });
      return;
    }

    setLoading(true);
    setError("");
    setTokenData(null);

    try {
      const info = await fetchERC20Info(contractAddress.trim(), walletAddress, selectedBlockchain);
      setTokenData(info);
    } catch (e: any) {
      setError(
        e.message?.includes("call revert") || e.message?.includes("BAD_DATA")
          ? "Could not fetch token. Make sure the contract address is correct for this network."
          : `Error: ${e.message ?? "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!tokenData) return;

    addToken({
      id: `custom-${contractAddress.toLowerCase()}-${selectedBlockchain}`,
      name: tokenData.name,
      symbol: tokenData.symbol,
      balance: tokenData.balance,
      balanceUSD: tokenData.balanceUSD,
      contractAddress: contractAddress.trim(),
      decimals: tokenData.decimals,
      blockchain: selectedBlockchain,
    });

    navigate("/home");
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setContractAddress(text.trim());
    } catch {
      setError("Clipboard access denied");
    }
  };

  return (
    <div className="min-h-screen p-6 bg-background">
      <div className="flex items-center mb-8">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 hover:bg-secondary rounded-xl transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="mb-6">
        <h1 className="mb-3">Import Token</h1>
        <p className="text-muted-foreground">
          Add a custom token for {selectedBlockchain.charAt(0).toUpperCase() + selectedBlockchain.slice(1)}
        </p>
      </div>

      {isSolana && (
        <Card className="p-4 mb-6 bg-yellow-500/10 border-yellow-500/20">
          <div className="flex gap-2 text-sm text-yellow-600">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Solana SPL token import uses the token mint address. Balance shown as 0 — use a Solana explorer for full token details.</span>
          </div>
        </Card>
      )}

      <div className="mb-6">
        <Label htmlFor="contract" className="mb-2 block">
          {isSolana ? "Token Mint Address" : "Contract Address"}
        </Label>
        <div className="flex gap-2">
          <Input
            id="contract"
            value={contractAddress}
            onChange={(e) => {
              setContractAddress(e.target.value);
              setTokenData(null);
              setError("");
            }}
            placeholder={isSolana ? "Solana token mint address" : "0x..."}
            className="flex-1 font-mono text-sm"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={handlePaste}
            className="shrink-0"
            title="Paste from clipboard"
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
        {error && (
          <div className="flex items-start gap-2 mt-2 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {!tokenData && (
        <Button
          onClick={handleFetchToken}
          disabled={!contractAddress.trim() || loading}
          className="w-full h-12 mb-6"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Fetching Token Info...
            </>
          ) : (
            "Fetch Token Info"
          )}
        </Button>
      )}

      {tokenData && (
        <>
          <Card className="p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <h3>Token Found</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="font-medium">{tokenData.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Symbol</span>
                <span className="font-medium">{tokenData.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Decimals</span>
                <span className="font-medium">{tokenData.decimals}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Your Balance</span>
                <span className="font-medium">{tokenData.balance.toFixed(4)} {tokenData.symbol}</span>
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-1">Contract</p>
                <p className="font-mono text-xs break-all">{contractAddress}</p>
              </div>
            </div>
          </Card>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => { setTokenData(null); setContractAddress(""); }}
              className="flex-1 h-12"
            >
              Cancel
            </Button>
            <Button onClick={handleImport} className="flex-1 h-12">
              Import Token
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
