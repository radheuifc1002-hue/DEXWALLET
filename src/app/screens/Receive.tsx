import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { useWallet } from "../context/WalletContext";
import { ArrowLeft, Copy, Check } from "lucide-react";
import QRCode from "qrcode";

export function Receive() {
  const navigate = useNavigate();
  const { walletAddress, selectedBlockchain } = useWallet();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current && walletAddress) {
      QRCode.toCanvas(
        canvasRef.current,
        walletAddress,
        {
          width: 280,
          margin: 2,
          color: {
            dark: "#6C4CF1",
            light: "#FFFFFF",
          },
        },
        (error) => {
          if (error) console.error(error);
        }
      );
    }
  }, [walletAddress]);

  const handleCopy = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

      <div className="mb-8 text-center">
        <h1 className="mb-3">Receive Crypto</h1>
        <p className="text-muted-foreground">
          Scan QR code or copy address to receive funds
        </p>
      </div>

      <div className="flex justify-center mb-6">
        <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary/10 text-primary">
          {selectedBlockchain.charAt(0).toUpperCase() + selectedBlockchain.slice(1)} Network
        </div>
      </div>

      <Card className="p-8 mb-6">
        <div className="flex justify-center">
          {walletAddress ? (
            <canvas ref={canvasRef} className="rounded-2xl" />
          ) : (
            <div className="w-[280px] h-[280px] rounded-2xl bg-secondary/30 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No wallet address</p>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4 mb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground mb-1">Your {selectedBlockchain.charAt(0).toUpperCase() + selectedBlockchain.slice(1)} Address</p>
            <p className="text-sm font-mono break-all">
              {walletAddress || "Wallet not initialized"}
            </p>
          </div>
          {walletAddress && (
            <button
              onClick={handleCopy}
              className="p-3 hover:bg-secondary rounded-xl transition-colors shrink-0"
            >
              {copied ? (
                <Check className="w-5 h-5 text-primary" />
              ) : (
                <Copy className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
      </Card>

      {walletAddress && (
        <Button onClick={handleCopy} className="w-full h-12">
          {copied ? "Copied!" : "Copy Address"}
        </Button>
      )}

      <div className="mt-6 p-4 rounded-xl bg-secondary/30">
        <p className="text-sm text-muted-foreground text-center">
          Only send {selectedBlockchain.toUpperCase()} assets to this address
        </p>
      </div>
    </div>
  );
}
