import { useState } from "react";
import { useNavigate } from "react-router";
import { PinInput } from "../components/PinInput";
import { useWallet } from "../context/WalletContext";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

type Step = "verify" | "new" | "confirm" | "success";

export function ChangePin() {
  const navigate = useNavigate();
  const { pin: currentPin, setPin } = useWallet();
  const [step, setStep] = useState<Step>("verify");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState(false);

  const handleVerifyPin = (enteredPin: string) => {
    if (enteredPin === currentPin) {
      setStep("new");
    } else {
      setError(true);
      setTimeout(() => setError(false), 1000);
    }
  };

  const handleNewPin = (pin: string) => {
    setNewPin(pin);
    setStep("confirm");
  };

  const handleConfirmPin = (pin: string) => {
    if (pin === newPin) {
      setPin(pin);
      setStep("success");
      setTimeout(() => navigate("/settings"), 1500);
    } else {
      setError(true);
      setTimeout(() => {
        setError(false);
        setStep("new");
        setNewPin("");
      }, 1000);
    }
  };

  const handlePinComplete = (pin: string) => {
    switch (step) {
      case "verify": handleVerifyPin(pin); break;
      case "new": handleNewPin(pin); break;
      case "confirm": handleConfirmPin(pin); break;
    }
  };

  const getTitle = () => {
    switch (step) {
      case "verify": return "Enter Current PIN";
      case "new": return "Enter New PIN";
      case "confirm": return "Confirm New PIN";
      case "success": return "PIN Changed!";
    }
  };

  const getDescription = () => {
    switch (step) {
      case "verify": return "Verify your current PIN to continue";
      case "new": return "Create a new 6-digit PIN";
      case "confirm": return "Re-enter your new PIN to verify it";
      case "success": return "Your PIN has been updated successfully";
    }
  };

  const getErrorMessage = () => {
    switch (step) {
      case "verify": return "Incorrect PIN. Try again.";
      default: return "PINs do not match. Try again.";
    }
  };

  const progressSteps: Step[] = ["verify", "new", "confirm"];
  const progressIndex = progressSteps.indexOf(step as any);

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
                {progressSteps.map((s, i) => (
                  <div
                    key={s}
                    className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${
                      i <= progressIndex ? "bg-primary" : "bg-secondary"
                    }`}
                  />
                ))}
              </div>

              <div className="text-center mb-12">
                <h1 className="mb-3">{getTitle()}</h1>
                <p className="text-muted-foreground">{getDescription()}</p>
                {error && (
                  <p className="text-destructive mt-2">{getErrorMessage()}</p>
                )}
              </div>

              <PinInput
                key={step}
                onComplete={handlePinComplete}
                error={error}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
