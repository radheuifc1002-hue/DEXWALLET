import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { useWallet } from "../context/WalletContext";
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Shield,
  AlertTriangle,
  X,
  Home,
  Loader2,
} from "lucide-react";
import { PinInput } from "../components/PinInput";
import { addToHistory } from "../services/browserHistory";

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url;
  }
}

export function DAppView() {
  const { url: rawUrl } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedBlockchain, walletAddress, pin } = useWallet();

  const dappMeta = location.state?.dapp || { name: rawUrl, url: rawUrl };
  const initialUrl = normalizeUrl(decodeURIComponent(rawUrl || ""));

  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [addressBarValue, setAddressBarValue] = useState(initialUrl);
  const [iframeKey, setIframeKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<string[]>([initialUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isAddressBarFocused, setIsAddressBarFocused] = useState(false);

  const [connected, setConnected] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [showTxDialog, setShowTxDialog] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinError, setPinError] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (currentUrl) {
      addToHistory({ name: dappMeta.name || displayUrl(currentUrl), url: currentUrl });
    }
  }, [currentUrl]);

  const navigateTo = useCallback((url: string) => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    setCurrentUrl(normalized);
    setAddressBarValue(normalized);
    setLoading(true);
    setIframeKey((k) => k + 1);
    setHistory((prev) => {
      const slice = prev.slice(0, historyIndex + 1);
      return [...slice, normalized];
    });
    setHistoryIndex((i) => i + 1);
  }, [historyIndex]);

  const handleBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const url = history[newIndex];
      setCurrentUrl(url);
      setAddressBarValue(url);
      setLoading(true);
      setIframeKey((k) => k + 1);
    }
  };

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const url = history[newIndex];
      setCurrentUrl(url);
      setAddressBarValue(url);
      setLoading(true);
      setIframeKey((k) => k + 1);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    setIframeKey((k) => k + 1);
  };

  const handleAddressBarSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateTo(addressBarValue);
    (document.activeElement as HTMLElement)?.blur();
  };

  const handlePinComplete = (enteredPin: string) => {
    if (enteredPin === pin) {
      setShowPinDialog(false);
      setShowTxDialog(false);
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 1000);
    }
  };

  const isSecure = currentUrl.startsWith("https://");
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Browser Chrome */}
      <div className="bg-background border-b border-border shrink-0 shadow-sm">
        {/* Navigation Row */}
        <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-secondary rounded-lg transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>

          <button
            onClick={handleBack}
            disabled={!canGoBack}
            className="p-2 hover:bg-secondary rounded-lg transition-colors disabled:opacity-30 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <button
            onClick={handleForward}
            disabled={!canGoForward}
            className="p-2 hover:bg-secondary rounded-lg transition-colors disabled:opacity-30 shrink-0"
          >
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Address Bar */}
          <form onSubmit={handleAddressBarSubmit} className="flex-1 min-w-0">
            <div className="flex items-center gap-2 h-9 px-3 rounded-full bg-secondary/60 border border-border/50">
              {isSecure ? (
                <Shield className="w-3.5 h-3.5 text-green-500 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
              )}
              <input
                value={isAddressBarFocused ? addressBarValue : displayUrl(currentUrl)}
                onChange={(e) => setAddressBarValue(e.target.value)}
                onFocus={() => {
                  setIsAddressBarFocused(true);
                  setAddressBarValue(currentUrl);
                }}
                onBlur={() => setIsAddressBarFocused(false)}
                className="flex-1 bg-transparent text-xs font-mono outline-none truncate min-w-0"
                placeholder="Search or enter URL"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
          </form>

          <button
            onClick={handleRefresh}
            className="p-2 hover:bg-secondary rounded-lg transition-colors shrink-0"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={() => navigate("/browser")}
            className="p-2 hover:bg-secondary rounded-lg transition-colors shrink-0"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>

        {/* Connection Bar */}
        <div className="px-3 pb-2">
          {!connected ? (
            <button
              onClick={() => setShowConnectDialog(true)}
              className="w-full h-8 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
            >
              Connect Wallet
            </button>
          ) : (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-green-500/10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-green-600 font-medium">Connected</span>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </span>
              <button
                onClick={() => setConnected(false)}
                className="text-xs text-muted-foreground hover:text-destructive ml-2"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>

      {/* iframe Content */}
      <div className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Loading {displayUrl(currentUrl)}...</p>
          </div>
        )}
        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={currentUrl}
          className="w-full h-full border-0"
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation"
          allow="camera; microphone; clipboard-read; clipboard-write"
          title="DApp Browser"
        />
      </div>

      {/* Connect Wallet Dialog */}
      <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Connect to {dappMeta.name || displayUrl(currentUrl)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="p-3 rounded-xl bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-1">Network</p>
              <p className="font-medium text-sm capitalize">{selectedBlockchain}</p>
            </div>
            <div className="p-3 rounded-xl bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-1">Wallet Address</p>
              <p className="font-mono text-xs break-all">{walletAddress || "No wallet"}</p>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-50 border border-yellow-200">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
              <p className="text-xs text-yellow-900">
                Only connect to trusted websites. Malicious sites can drain your wallet.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowConnectDialog(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={() => { setConnected(true); setShowConnectDialog(false); }} className="flex-1">
              Connect
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PIN Dialog */}
      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Enter PIN to Confirm</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {pinError && (
              <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-destructive/10 text-destructive text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Incorrect PIN</span>
              </div>
            )}
            <PinInput onComplete={handlePinComplete} error={pinError} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
