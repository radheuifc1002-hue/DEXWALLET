import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { useWallet } from "../context/WalletContext";
import { AlertTriangle, Copy, Check, RefreshCw } from "lucide-react";
import { generateMnemonic } from "../services/walletService";

export function GenerateSeedPhrase() {
  const navigate = useNavigate();
  const { setSeedPhrase, seedPhrase } = useWallet();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (seedPhrase.length === 0) {
      const mnemonic = generateMnemonic();
      setSeedPhrase(mnemonic.split(" "));
    }
  }, [seedPhrase.length, setSeedPhrase]);

  const handleRegenerate = () => {
    const mnemonic = generateMnemonic();
    setSeedPhrase(mnemonic.split(" "));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(seedPhrase.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col p-6 bg-background">
      <div className="mb-6">
        <h1 className="mb-3">Backup Seed Phrase</h1>
        <p className="text-muted-foreground">
          Write down these 12 words in order and keep them safe
        </p>
      </div>

      <Card className="p-4 mb-6 bg-destructive/10 border-destructive/20">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-destructive mb-1">Keep it secret!</p>
            <p className="text-destructive/80">
              Never share your seed phrase. Anyone with this phrase can access your funds.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <div className="grid grid-cols-2 gap-3">
          {seedPhrase.map((word, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30"
            >
              <span className="text-sm text-muted-foreground w-6 shrink-0">{index + 1}.</span>
              <span className="font-medium">{word}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex gap-3 mb-4">
        <Button
          variant="outline"
          onClick={handleCopy}
          className="flex-1 h-12"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" />
              Copy Phrase
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={handleRegenerate}
          className="h-12 px-4"
          title="Generate new phrase"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <Button
        onClick={() => navigate("/confirm-seed")}
        className="h-12"
      >
        I've Written It Down
      </Button>
    </div>
  );
}
