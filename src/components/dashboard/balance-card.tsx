import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDisplayDate } from "@/lib/dates";

export function BalanceCard({ balance, today }: { balance: number; today: string }) {
  const negative = balance < 0;
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-1 py-6">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Shared balance · {formatDisplayDate(today)}
        </span>
        <span
          className={cn(
            "text-5xl font-bold tabular-nums tracking-tight",
            negative ? "text-destructive" : "text-foreground",
          )}
        >
          {negative ? "−" : ""}
          {Math.abs(balance).toLocaleString(undefined, { maximumFractionDigits: 1 })}
          <span className="ml-1 text-xl font-medium text-muted-foreground">min</span>
        </span>
        {negative && <span className="text-xs font-medium text-destructive">In debt — next credits pay it down first</span>}
      </CardContent>
    </Card>
  );
}
