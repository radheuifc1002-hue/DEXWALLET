import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Card } from "../components/ui/card";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { BottomNav } from "../components/BottomNav";
import { useWallet } from "../context/WalletContext";
import {
  Key,
  FileText,
  Network,
  Timer,
  ChevronRight,
  Fingerprint,
  Trash2,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { PinInput } from "../components/PinInput";
import {
  isBiometricAvailable,
  registerBiometric,
  clearBiometricCredential,
} from "../services/biometricService";
import { toast } from "sonner";

type RemoveStep = "idle" | "warning" | "pin";

export function Settings() {
  const navigate = useNavigate();
  const {
    pin,
    biometricEnabled,
    setBiometricEnabled,
    network,
    setNetwork,
    autoLockTimer,
    setAutoLockTimer,
    resetWallet,
  } = useWallet();

  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [removeStep, setRemoveStep] = useState<RemoveStep>("idle");
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBiometricSupported);
  }, []);

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
      toast.success("Biometric authentication disabled.");
    }
  };

  const handlePinConfirm = (enteredPin: string) => {
    if (enteredPin === pin) {
      setRemoveStep("idle");
      resetWallet();
      navigate("/onboarding", { replace: true });
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 1000);
    }
  };

  const autoLockOptions = [
    { value: 1, label: "1 minute" },
    { value: 5, label: "5 minutes" },
    { value: 15, label: "15 minutes" },
  ];

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="p-6">
        <div className="mb-8">
          <h1 className="mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your wallet settings</p>
        </div>

        {/* Security Section */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm text-muted-foreground">Security</h3>
          <Card className="p-2">
            <div className="flex items-center justify-between p-4 rounded-xl hover:bg-secondary/50 transition-colors">
              <div className="flex items-center gap-3 flex-1">
                <Fingerprint className={`w-5 h-5 ${biometricSupported ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <Label
                    htmlFor="biometric"
                    className={`cursor-pointer ${!biometricSupported ? "text-muted-foreground" : ""}`}
                  >
                    Biometric Authentication
                  </Label>
                  {!biometricSupported && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Not supported on this device
                    </p>
                  )}
                </div>
              </div>
              <Switch
                id="biometric"
                checked={biometricEnabled}
                onCheckedChange={handleBiometricToggle}
                disabled={!biometricSupported || biometricLoading}
              />
            </div>

            <div
              onClick={() => navigate("/change-pin")}
              className="flex items-center justify-between p-4 rounded-xl hover:bg-secondary/50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                <Key className="w-5 h-5 text-primary" />
                <span>Change PIN</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>

            <div
              onClick={() => navigate("/export-seed")}
              className="flex items-center justify-between p-4 rounded-xl hover:bg-secondary/50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-primary" />
                <span>Export Seed Phrase</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </Card>
        </div>

        {/* Network Section */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm text-muted-foreground">Network</h3>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Network className="w-5 h-5 text-primary" />
                <Label htmlFor="network" className="cursor-pointer">
                  {network === "mainnet" ? "Mainnet" : "Testnet"}
                </Label>
              </div>
              <Switch
                id="network"
                checked={network === "mainnet"}
                onCheckedChange={(checked) =>
                  setNetwork(checked ? "mainnet" : "testnet")
                }
              />
            </div>
          </Card>
        </div>

        {/* Auto-Lock Timer */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm text-muted-foreground">Auto-Lock Timer</h3>
          <Card className="p-2">
            {autoLockOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setAutoLockTimer(option.value)}
                className="flex items-center justify-between w-full p-4 rounded-xl hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Timer className="w-5 h-5 text-primary" />
                  <span>{option.label}</span>
                </div>
                {autoLockTimer === option.value && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                )}
              </button>
            ))}
          </Card>
        </div>

        {/* About */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm text-muted-foreground">About</h3>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary mb-2">XU</div>
              <p className="text-sm text-muted-foreground mb-1">Version 1.0.0</p>
              <p className="text-xs text-muted-foreground">
                Non-Custodial Crypto Wallet
              </p>
            </div>
          </Card>
        </div>

        {/* Danger Zone */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm text-destructive">Danger Zone</h3>
          <Card className="p-2 border-destructive/30">
            <button
              onClick={() => setRemoveStep("warning")}
              className="flex items-center justify-between w-full p-4 rounded-xl hover:bg-destructive/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-5 h-5 text-destructive" />
                <span className="text-destructive font-medium">Remove Wallet</span>
              </div>
              <ChevronRight className="w-5 h-5 text-destructive/60" />
            </button>
          </Card>
        </div>
      </div>

      <BottomNav />

      {/* Warning Dialog */}
      <Dialog
        open={removeStep === "warning"}
        onOpenChange={(open) => !open && setRemoveStep("idle")}
      >
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <ShieldAlert className="w-8 h-8 text-destructive" />
              </div>
            </div>
            <DialogTitle className="text-center text-destructive">
              Remove Wallet
            </DialogTitle>
            <DialogDescription className="text-center space-y-3 pt-2">
              <span className="block font-semibold text-foreground">
                Are you sure you want to remove your wallet?
              </span>
              <span className="flex items-start gap-2 text-left bg-destructive/10 text-destructive rounded-xl p-3 text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                You cannot recover your wallet without your private keys (seed phrase). Make sure you have backed it up before proceeding.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-2">
            <Button
              variant="destructive"
              className="w-full h-12 rounded-xl"
              onClick={() => setRemoveStep("pin")}
            >
              Yes, Remove Wallet
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl"
              onClick={() => setRemoveStep("idle")}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PIN Confirmation Dialog */}
      <Dialog
        open={removeStep === "pin"}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveStep("idle");
            setPinError(false);
          }
        }}
      >
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center">Confirm with PIN</DialogTitle>
            <DialogDescription className="text-center">
              Enter your PIN to confirm wallet removal
            </DialogDescription>
            {pinError && (
              <p className="text-center text-sm text-destructive pt-1">
                Incorrect PIN. Try again.
              </p>
            )}
          </DialogHeader>
          <div className="py-4">
            <PinInput
              key={pinError ? "error" : "input"}
              onComplete={handlePinConfirm}
              error={pinError}
            />
          </div>
          <Button
            variant="outline"
            className="w-full h-12 rounded-xl"
            onClick={() => {
              setRemoveStep("idle");
              setPinError(false);
            }}
          >
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
