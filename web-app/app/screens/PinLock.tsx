import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { PinInput } from "../components/PinInput";
import { useWallet } from "../context/WalletContext";
import { Fingerprint, Loader2 } from "lucide-react";
import { authenticateWithBiometric } from "../services/biometricService";
import { motion } from "motion/react";

export function PinLock() {
  const navigate = useNavigate();
  const { pin, setIsLocked, biometricEnabled } = useWallet();
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricFailed, setBiometricFailed] = useState(false);
  const maxAttempts = 5;

  const handleBiometric = useCallback(async () => {
    setBiometricLoading(true);
    setBiometricFailed(false);
    const success = await authenticateWithBiometric();
    setBiometricLoading(false);
    if (success) {
      setIsLocked(false);
      navigate("/home");
    } else {
      setBiometricFailed(true);
    }
  }, [setIsLocked, navigate]);

  useEffect(() => {
    if (biometricEnabled) {
      handleBiometric();
    }
  }, [biometricEnabled, handleBiometric]);

  const handlePinComplete = (enteredPin: string) => {
    if (enteredPin === pin) {
      setIsLocked(false);
      navigate("/home");
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setError(true);
      if (newAttempts >= maxAttempts) {
        alert("Too many failed attempts. Please restart the app.");
      }
      setTimeout(() => setError(false), 1000);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="mb-12 text-center">
        <div className="text-6xl font-bold text-primary mb-6">XU</div>
        <h2 className="mb-3">Wallet Locked</h2>
        <p className="text-muted-foreground">Enter your PIN to unlock</p>
        {error && (
          <p className="text-destructive mt-2">
            Incorrect PIN ({maxAttempts - attempts} attempts remaining)
          </p>
        )}
      </div>

      <PinInput onComplete={handlePinComplete} error={error} />

      {biometricEnabled && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-10 flex flex-col items-center gap-3"
        >
          <button
            onClick={handleBiometric}
            disabled={biometricLoading}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-secondary/50 active:scale-95 transition-all disabled:opacity-50"
          >
            {biometricLoading ? (
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            ) : (
              <Fingerprint className="w-10 h-10 text-primary" />
            )}
            <span className="text-sm text-muted-foreground">
              {biometricLoading ? "Verifying..." : "Use Biometric"}
            </span>
          </button>
          {biometricFailed && (
            <p className="text-sm text-destructive">
              Biometric failed. Use your PIN instead.
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}
