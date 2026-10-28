import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { Button } from "../components/ui/button";
import { useWallet } from "../context/WalletContext";

export function Splash() {
  const navigate = useNavigate();
  const { isWalletCreated } = useWallet();
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowButton(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  const handleContinue = () => {
    if (isWalletCreated) {
      navigate("/home");
    } else {
      navigate("/onboarding");
    }
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center p-6 bg-white">
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative mb-8"
      >
        <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
        <div className="relative text-8xl font-bold text-primary">
          XU
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.8 }}
        className="text-lg text-muted-foreground mb-12"
      >
        Your Keys. Your Crypto.
      </motion.p>

      {showButton && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-xs"
        >
          <Button
            onClick={handleContinue}
            className="w-full h-14 text-lg rounded-2xl"
          >
            Continue
          </Button>
        </motion.div>
      )}
    </div>
  );
}
