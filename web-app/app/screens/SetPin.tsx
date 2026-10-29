import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { PinInput } from "../components/PinInput";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { useWallet } from "../context/WalletContext";
import { ArrowLeft, Fingerprint, CheckCircle2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  isBiometricAvailable,
  registerBiometric,
  clearBiometricCredential,
} from "../services/biometricService";
import { toast } from "sonner";

type Step = "set" | "confirm" | "success";

export function SetPin() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { returnTo?: string; mnemonic?: string } | null;
  const returnTo: string = locationState?.returnTo ?? "/generate-seed";
  const importMnemonic: string | undefined = locationState?.mnemonic;
  const { setPin: savePin, setIsWalletCreated, initWallet, biometricEnabled, setBiometricEnabled } = useWallet();
  const [step, setStep] = useState<Step>("set");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBiometricSupported);
  }, []);

  const handleFirstPin = (pin: string) => {
    setFirstPin(pin);
    setStep("confirm");
  };

  const handleConfirmPin = async (pin: string) => {
    if (pin === firstPin) {
      if (importMnemonic) {
        setCommitting(true);
        try {
          await initWallet(importMnemonic);
          setIsWalletCreated(true);
        } catch {
          setCommitting(false);
          setError(true);
          setTimeout(() => {
            setError(false);
            setStep("set");
            setFirstPin("");
          }, 1000);
          return;
        }
        setCommitting(false);
      }
      savePin(pin);
      setStep("success");
      setTimeout(() => navigate(returnTo, { replace: true }), 1500);
    } else {
      setError(true);
      setTimeout(() => {
        setError(false);
        setStep("set");
        setFirstPin("");
      }, 1000);
    }
  };

  const handleBiometricToggle = async (enabled: boolean) => {
    if (enabled) {
      if (!biometricSupported) {
        toast.error("Biometric authentication is not supported on this device.");
        return;
      }
      setBiometricLoading(true);
      const success = await registerBiometric();
      setBiometricLoading(false);
      if (success) {
        setBiometricEnabled(true);
        toast.success("Biometric authentication enabled.");
      } else {
        toast.error("Biometric registration failed. Please try again.");
      }
    } else {
      clearBiometricCredential();
      setBiometricEnabled(false);
    }
  };

  const getTitle = () => {
    switch (step) {
      case "set": return "Secure Your Wallet";
      case "confirm": return committing ? "Setting Up Wallet..." : "Confirm Your PIN";
      case "success": return importMnemonic ? "Wallet Imported!" : "PIN Created!";
    }
  };

  const getDescription = () => {
    switch (step) {
      case "set": return "Create a 6-digit PIN to protect your wallet";
      case "confirm": return committing
        ? "Deriving wallet addresses, please wait..."
        : "Re-enter your PIN to verify it";
      case "success": return importMnemonic
        ? "Your wallet has been imported and secured with your PIN"
        : "Your PIN has been set successfully";
    }
  };

  return (
    <div className="min-h-screen flex flex-col p-6 bg-background">
      <div className="flex items-center mb-8">
        {step !== "success" && (
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-secondary rounded-xl transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {step === "success" ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center"
              >
                <CheckCircle2 className="w-12 h-12 text-primary" />
              </motion.div>
              <div>
                <h1 className="mb-2">{getTitle()}</h1>
                <p className="text-muted-foreground">{getDescription()}</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="w-full flex flex-col items-center"
            >
              {/* Step indicator */}
              <div className="flex gap-2 mb-10">
                {(["set", "confirm"] as Step[]).map((s) => (
                  <div
                    key={s}
                    className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${
                      step === s || (s === "set" && step === "confirm")
                        ? "bg-primary"
                        : "bg-secondary"
                    }`}
                  />
                ))}
              </div>

              <div className="text-center mb-12">
                <h1 className="mb-3">{getTitle()}</h1>
                <p className="text-muted-foreground">{getDescription()}</p>
                {error && (
                  <p className="text-destructive mt-2">PINs do not match. Try again.</p>
                )}
              </div>

              {committing ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                </div>
              ) : (
                <PinInput
                  key={step}
                  length={6}
                  onComplete={step === "set" ? handleFirstPin : handleConfirmPin}
                  error={error}
                />
              )}

              {step === "set" && biometricSupported && (
                <div className="mt-12 w-full max-w-sm">
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/30">
                    <div className="flex items-center gap-3">
                      <Fingerprint className="w-5 h-5 text-primary" />
                      <Label htmlFor="biometric" className="cursor-pointer">
                        {biometricLoading ? "Setting up..." : "Enable Biometric"}
                      </Label>
                    </div>
                    <Switch
                      id="biometric"
                      checked={biometricEnabled}
                      onCheckedChange={handleBiometricToggle}
                      disabled={biometricLoading}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
