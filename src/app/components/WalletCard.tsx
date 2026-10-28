import { ReactNode } from "react";
import { Card } from "./ui/card";

interface WalletCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  gradient?: boolean;
}

export function WalletCard({
  children,
  className = "",
  onClick,
  gradient = false,
}: WalletCardProps) {
  return (
    <Card
      onClick={onClick}
      className={`
        ${gradient ? "bg-gradient-to-br from-primary to-primary/80 text-white border-0 shadow-lg shadow-primary/20" : ""}
        ${onClick ? "cursor-pointer hover:shadow-md transition-all" : ""}
        ${className}
      `}
    >
      {children}
    </Card>
  );
}
