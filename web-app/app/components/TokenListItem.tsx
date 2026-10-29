import { useNavigate } from "react-router";
import { Token } from "../context/WalletContext";

interface TokenListItemProps {
  token: Token;
}

export function TokenListItem({ token }: TokenListItemProps) {
  const navigate = useNavigate();

  // Simple token icon colors
  const getTokenColor = (symbol: string) => {
    const colors: Record<string, string> = {
      SOL: "#14F195",
      ETH: "#627EEA",
      BNB: "#F3BA2F",
      MATIC: "#8247E5",
      USDC: "#2775CA",
      USDT: "#26A17B",
    };
    return colors[symbol] || "#6C4CF1";
  };

  return (
    <div
      onClick={() => navigate(`/token/${token.id}`)}
      className="flex items-center gap-4 p-4 rounded-2xl hover:bg-secondary/30 transition-colors cursor-pointer"
    >
      {/* Token Icon */}
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
        style={{ backgroundColor: getTokenColor(token.symbol) }}
      >
        {token.symbol.slice(0, 1)}
      </div>

      {/* Token Info */}
      <div className="flex-1">
        <h4 className="mb-0.5">{token.name}</h4>
        <p className="text-sm text-muted-foreground">{token.symbol}</p>
      </div>

      {/* Balance */}
      <div className="text-right">
        <p className="font-medium">{token.balance.toFixed(4)}</p>
        <p className="text-sm text-muted-foreground">
          ${token.balanceUSD.toFixed(2)}
        </p>
      </div>
    </div>
  );
}
