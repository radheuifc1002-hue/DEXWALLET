import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { useWallet } from "../context/WalletContext";
import { ArrowLeft, Loader2 } from "lucide-react";

export function ConfirmSeedPhrase() {
  const navigate = useNavigate();
  const { seedPhrase, setIsWalletCreated, initWallet } = useWallet();
  const [selectedWords, setSelectedWords] = useState<number[]>([]);
  const [shuffledWords, setShuffledWords] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [positions] = useState(() => {
    const pos = new Set<number>();
    while (pos.size < 3) {
      pos.add(Math.floor(Math.random() * 12));
    }
    return Array.from(pos).sort((a, b) => a - b);
  });

  useEffect(() => {
    const wordsToVerify = positions.map((pos) => seedPhrase[pos]);
    const shuffled = [...wordsToVerify].sort(() => Math.random() - 0.5);
    setShuffledWords(shuffled);
  }, [positions, seedPhrase]);

  const handleWordSelect = (_word: string, index: number) => {
    if (selectedWords.includes(index)) {
      setSelectedWords(selectedWords.filter((i) => i !== index));
    } else if (selectedWords.length < 3) {
      setSelectedWords([...selectedWords, index]);
    }
  };

  const handleVerify = async () => {
    const isCorrect = selectedWords.every((wordIndex, i) => {
      return shuffledWords[wordIndex] === seedPhrase[positions[i]];
    });

    if (isCorrect && selectedWords.length === 3) {
      setVerifying(true);
      try {
        await initWallet(seedPhrase.join(" "));
        setIsWalletCreated(true);
        navigate("/home");
      } catch (e) {
        console.error("Wallet init error:", e);
        setVerifying(false);
      }
    } else {
      setError(true);
      setTimeout(() => {
        setError(false);
        setSelectedWords([]);
      }, 1000);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Creating your wallet...</p>
      </div>
    );
  }

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
        <h1 className="mb-3">Verify Seed Phrase</h1>
        <p className="text-muted-foreground">
          Select the words in the correct order
        </p>
        {error && (
          <p className="text-destructive mt-2">Incorrect order. Try again.</p>
        )}
      </div>

      <div className="mb-6">
        <div className="flex gap-3 mb-4">
          {positions.map((pos, i) => (
            <div
              key={pos}
              className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                selectedWords[i] !== undefined
                  ? "border-primary bg-primary/10"
                  : "border-dashed border-border bg-secondary/30"
              }`}
            >
              <div className="text-xs text-muted-foreground mb-1">Word #{pos + 1}</div>
              {selectedWords[i] !== undefined && (
                <div className="font-medium">{shuffledWords[selectedWords[i]]}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <p className="text-sm text-muted-foreground mb-3">Select words:</p>
        <div className="grid grid-cols-3 gap-3">
          {shuffledWords.map((word, index) => (
            <button
              key={index}
              onClick={() => handleWordSelect(word, index)}
              disabled={selectedWords.includes(index)}
              className={`p-4 rounded-xl transition-all ${
                selectedWords.includes(index)
                  ? "bg-secondary/30 text-muted-foreground"
                  : "bg-secondary hover:bg-secondary/80 active:scale-95"
              }`}
            >
              {word}
            </button>
          ))}
        </div>
      </div>

      <Button
        onClick={handleVerify}
        disabled={selectedWords.length !== 3}
        className="h-12"
      >
        Verify & Create Wallet
      </Button>
    </div>
  );
}
