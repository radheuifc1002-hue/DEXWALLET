import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X, Camera } from "lucide-react";
import { Button } from "./ui/button";

interface QRScannerProps {
  onResult: (result: string) => void;
  onClose: () => void;
}

export function QRScanner({ onResult, onClose }: QRScannerProps) {
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const divId = "xu-qr-scanner";

  useEffect(() => {
    const scanner = new Html5Qrcode(divId);
    scannerRef.current = scanner;

    Html5Qrcode.getCameras()
      .then((cameras) => {
        if (!cameras || cameras.length === 0) {
          setError("No camera found");
          setStarting(false);
          return;
        }
        const cameraId = cameras[cameras.length - 1].id;
        return scanner.start(
          cameraId,
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (text) => {
            const address = text.replace(/^(ethereum:|solana:|bitcoin:)/i, "").split("?")[0].trim();
            onResult(address);
            scanner.stop().catch(() => {});
          },
          () => {}
        );
      })
      .then(() => setStarting(false))
      .catch((err) => {
        setError("Camera access denied. Please allow camera permission.");
        setStarting(false);
        console.error(err);
      });

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [onResult]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full">
        <div id={divId} className="w-full rounded-xl overflow-hidden" style={{ minHeight: 260 }} />
        {starting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl">
            <Camera className="w-10 h-10 text-white mb-3 animate-pulse" />
            <p className="text-white text-sm">Starting camera...</p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-destructive/10 text-destructive text-sm w-full text-center">
          {error}
        </div>
      )}

      <p className="text-sm text-muted-foreground mt-3 text-center">
        Point your camera at a wallet QR code
      </p>

      <Button variant="outline" onClick={onClose} className="mt-4 w-full">
        <X className="w-4 h-4 mr-2" />
        Cancel
      </Button>
    </div>
  );
}
