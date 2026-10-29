import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { useWallet } from "../context/WalletContext";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { validateMnemonic } from "../services/walletService";

export function ImportWallet() {
  const navigate = useNavigate();
  const { setSeedPhrase } = useWallet();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    const cleaned = input.trim().toLowerCase();
    const words = cleaned.split(/\s+/);

    if (words.length !== 12 && words.length !== 24) {
      setError("Please enter a valid 12 or 24-word seed phrase");
      return;
    }

    if (!validateMnemonic(cleaned)) {
      setError("Invalid seed phrase. Please check your words and try again.");
      return;
    }

    setLoading(true);
    setError("");

    setSeedPhrase(words);

    navigate("/set-pin", {
      state: { returnTo: "/home", mnemonic: cleaned },
    });
  };

  return (
    <div className="min-h-screen flex flex-col p-6 bg-background">
      <div className="flex items-center mb-8">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 hover:bg-secondary rounded-xl transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="mb-6">
        <h1 className="mb-3">Import Wallet</h1>
        <p className="text-muted-foreground">
          Enter your 12 or 24-word BIP39 seed phrase
        </p>
      </div>

      <div className="flex-1 flex flex-col">
        <Textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError("");
          }}
          placeholder="Enter your seed phrase words separated by spaces..."
          className="min-h-[200px] mb-4 resize-none font-mono"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
        />

        {error && (
          <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          onClick={handleImport}
          disabled={!input.trim() || loading}
          className="h-12 mt-auto"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying Seed Phrase...
            </>
          ) : (
            "Import Wallet"
          )}
        </Button>
      </div>
    </div>
  );
}
