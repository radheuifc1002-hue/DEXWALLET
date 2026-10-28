import { useNavigate } from "react-router";
import { Card } from "../components/ui/card";
import { Wallet, Download } from "lucide-react";

export function Onboarding() {
  const navigate = useNavigate();

  return (
    <div className="h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-primary mb-3">XU</h1>
        <p className="text-muted-foreground">Get started with your wallet</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <Card
          className="p-6 cursor-pointer hover:shadow-lg transition-all duration-200 border-2 border-transparent hover:border-primary"
          onClick={() => navigate("/set-pin")}
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Wallet className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="mb-1">Create Wallet</h3>
              <p className="text-sm text-muted-foreground">
                Create a new wallet and secure it
              </p>
            </div>
          </div>
        </Card>

        <Card
          className="p-6 cursor-pointer hover:shadow-lg transition-all duration-200 border-2 border-transparent hover:border-primary"
          onClick={() => navigate("/import-wallet")}
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Download className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="mb-1">Import Wallet</h3>
              <p className="text-sm text-muted-foreground">
                Import existing wallet with seed phrase
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
