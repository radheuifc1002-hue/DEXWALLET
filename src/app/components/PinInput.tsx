import { useState, useEffect } from "react";
import { motion } from "motion/react";

interface PinInputProps {
  length?: number;
  onComplete: (pin: string) => void;
  error?: boolean;
  onClear?: () => void;
}

export function PinInput({ length = 6, onComplete, error = false, onClear }: PinInputProps) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (pin.length === length) {
      onComplete(pin);
    }
  }, [pin, length, onComplete]);

  useEffect(() => {
    if (error) {
      setPin("");
      onClear?.();
    }
  }, [error, onClear]);

  const handleNumber = (num: string) => {
    if (pin.length < length) {
      setPin(pin + num);
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* PIN Dots Display */}
      <div className="flex justify-center gap-4 mb-12">
        {Array.from({ length }).map((_, i) => (
          <motion.div
            key={i}
            initial={false}
            animate={{
              scale: error ? [1, 1.2, 1] : 1,
              backgroundColor: error
                ? "#d4183d"
                : pin.length > i
                ? "#6C4CF1"
                : "#ececf0",
            }}
            transition={{ duration: 0.2 }}
            className="w-4 h-4 rounded-full"
          />
        ))}
      </div>

      {/* Number Pad */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            onClick={() => handleNumber(num.toString())}
            className="h-16 rounded-2xl bg-secondary/50 hover:bg-secondary active:scale-95 transition-all"
          >
            <span className="text-2xl">{num}</span>
          </button>
        ))}
        <div /> {/* Empty space */}
        <button
          onClick={() => handleNumber("0")}
          className="h-16 rounded-2xl bg-secondary/50 hover:bg-secondary active:scale-95 transition-all"
        >
          <span className="text-2xl">0</span>
        </button>
        <button
          onClick={handleDelete}
          className="h-16 rounded-2xl bg-secondary/50 hover:bg-secondary active:scale-95 transition-all flex items-center justify-center"
        >
          <span className="text-xl">⌫</span>
        </button>
      </div>
    </div>
  );
}
