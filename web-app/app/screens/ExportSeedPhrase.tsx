import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { useWallet } from "../context/WalletContext";
import { ArrowLeft, AlertTriangle, Eye, EyeOff, Copy, Check } from "lucide-react";
import { PinInput } from "../components/PinInput";

export function ExportSeedPhrase() {
  const navigate = useNavigate();
  const { seedPhrase, pin } = useWallet();
  const [verified, setVerified] = useState(false);
  const [showPhrase, setShowPhrase] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [copied, setCopied] = useState(false);

  const handlePinComplete = (enteredPin: string) => {
    if (enteredPin === pin) {
      setVerified(true);
      setShowPhrase(true);
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 1000);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(seedPhrase.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen p-6 bg-background">
      {/* Header */}
      <div className="flex items-center mb-8">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 hover:bg-secondary rounded-xl transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="mb-6">
        <h1 className="mb-3">Export Seed Phrase</h1>
        <p className="text-muted-foreground">
          {verified ? "Your recovery phrase" : "Enter PIN to view your seed phrase"}
        </p>
      </div>

      {/* Warning */}
      <Card className="p-4 mb-6 bg-destructive/10 border-destructive/20">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-destructive mb-1">Security Warning</p>
            <p className="text-destructive/80">
              Never share your seed phrase. Anyone with this phrase has full access to your wallet.
            </p>
          </div>
        </div>
      </Card>

      {!verified ? (
        <div className="mt-12">
          {pinError && (
            <p className="text-destructive text-center mb-4">Incorrect PIN. Try again.</p>
          )}
          <PinInput onComplete={handlePinComplete} error={pinError} />
        </div>
      ) : (
        <>
          {/* Seed Phrase Display */}
          <Card className="p-6 mb-6">
            {showPhrase ? (
              <div className="grid grid-cols-2 gap-3">
                {seedPhrase.map((word, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30"
                  >
                    <span className="text-sm text-muted-foreground w-6">
                      {index + 1}.
                    </span>
                    <span className="font-medium">{word}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {seedPhrase.map((_, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30"
                  >
                    <span className="text-sm text-muted-foreground w-6">
                      {index + 1}.
                    </span>
                    <span className="font-medium">••••••</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Toggle Visibility */}
          <Button
            onClick={() => setShowPhrase(!showPhrase)}
            variant="outline"
            className="w-full h-12 mb-4"
          >
            {showPhrase ? (
              <>
                <EyeOff className="w-4 h-4 mr-2" />
                Hide Phrase
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                Show Phrase
              </>
            )}
          </Button>

          {/* Copy Button */}
          <Button onClick={handleCopy} className="w-full h-12">
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy to Clipboard
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
