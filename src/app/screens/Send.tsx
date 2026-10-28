import { useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { useWallet } from "../context/WalletContext";
import { ArrowLeft, AlertCircle, QrCode, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { PinInput } from "../components/PinInput";
import { QRScanner } from "../components/QRScanner";

export function Send() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tokens, selectedBlockchain, pin } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(
    location.state?.token || tokens.find((t) => t.blockchain === selectedBlockchain)
  );
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [sending, setSending] = useState(false);
  const [txResult, setTxResult] = useState<{ success: boolean; message: string } | null>(null);

  const filteredTokens = tokens.filter((token) => token.blockchain === selectedBlockchain);

  const handleSend = () => {
    if (!recipient || !amount || parseFloat(amount) <= 0) return;
    setShowPinDialog(true);
  };

  const handlePinComplete = (enteredPin: string) => {
    if (enteredPin === pin) {
      setSending(true);
      setTimeout(() => {
        setShowPinDialog(false);
        setSending(false);
        setTxResult({
          success: true,
          message: `Transaction submitted! Connect a funded wallet to broadcast on-chain.`,
        });
      }, 1500);
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 1000);
    }
  };

  const handleQRResult = (address: string) => {
    setRecipient(address);
    setShowScanner(false);
  };

  const gasFees: Record<string, string> = {
    solana: "~0.000005 SOL",
    ethereum: "~0.0005 ETH",
    bnb: "~0.0003 BNB",
    polygon: "~0.02 MATIC",
  };

  const gasFee = gasFees[selectedBlockchain] || "~0.001";

  if (txResult) {
    return (
      <div className="min-h-screen p-6 bg-background flex flex-col items-center justify-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${txResult.success ? "bg-green-500/10" : "bg-destructive/10"}`}>
          <div className={`text-4xl ${txResult.success ? "text-green-500" : "text-destructive"}`}>
            {txResult.success ? "✓" : "✕"}
          </div>
        </div>
        <h2 className="mb-3 text-center">{txResult.success ? "Transaction Sent!" : "Failed"}</h2>
        <p className="text-muted-foreground text-center mb-8">{txResult.message}</p>
        <Button onClick={() => navigate("/home")} className="w-full h-12">
          Back to Home
        </Button>
      </div>
    );
  }

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

      <div className="mb-8">
        <h1 className="mb-3">Send Crypto</h1>
        <p className="text-muted-foreground">Transfer tokens to another wallet</p>
      </div>

      <div className="mb-6">
        <Label className="mb-2 block">Select Token</Label>
        <select
          value={selectedToken?.id}
          onChange={(e) => setSelectedToken(tokens.find((t) => t.id === e.target.value))}
          className="w-full h-12 px-4 rounded-xl border border-border bg-background"
        >
          {filteredTokens.map((token) => (
            <option key={token.id} value={token.id}>
              {token.name} ({token.symbol}) — {token.balance.toFixed(6)}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-6">
        <Label htmlFor="recipient" className="mb-2 block">
          Recipient Address
        </Label>
        <div className="flex gap-2">
          <Input
            id="recipient"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={selectedBlockchain === "solana" ? "Solana wallet address" : "0x..."}
            className="flex-1 font-mono text-sm"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowScanner(true)}
            title="Scan QR Code"
            className="shrink-0 w-12"
          >
            <QrCode className="w-5 h-5" />
          </Button>
        </div>
        {recipient && (
          <p className="text-xs text-muted-foreground mt-1 font-mono break-all">{recipient}</p>
        )}
      </div>

      <div className="mb-6">
        <Label htmlFor="amount" className="mb-2 block">
          Amount
        </Label>
        <div className="relative">
          <Input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
          />
          {selectedToken && (
            <button
              onClick={() => setAmount(selectedToken.balance.toString())}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary hover:opacity-80 font-medium"
            >
              Max
            </button>
          )}
        </div>
        {selectedToken && amount && parseFloat(amount) > 0 && (
          <p className="text-sm text-muted-foreground mt-2">
            ≈ ${(parseFloat(amount) * (selectedToken.balanceUSD / (selectedToken.balance || 1))).toFixed(2)} USD
          </p>
        )}
      </div>

      <Card className="p-4 mb-8 bg-secondary/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Network Fee</span>
          <span className="text-sm font-medium">{gasFee}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">You Send</span>
          <span className="text-sm font-medium">
            {amount || "0"} {selectedToken?.symbol}
          </span>
        </div>
      </Card>

      <Button
        onClick={handleSend}
        disabled={!recipient || !amount || parseFloat(amount) <= 0}
        className="w-full h-14"
      >
        Review Transaction
      </Button>

      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">
              {sending ? "Sending..." : "Enter PIN to Confirm"}
            </DialogTitle>
          </DialogHeader>
          {!sending && (
            <div className="py-4">
              {pinError && (
                <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>Incorrect PIN</span>
                </div>
              )}
              <PinInput onComplete={handlePinComplete} error={pinError} />
            </div>
          )}
          {sending && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Processing transaction...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showScanner} onOpenChange={setShowScanner}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Scan Wallet QR Code</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <QRScanner
              onResult={handleQRResult}
              onClose={() => setShowScanner(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
