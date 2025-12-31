import { Button } from "@/components/ui/button";

type Props = {
  value: "list" | "cards";
  onChange: (v: "list" | "cards") => void;
};

export function ViewToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-md border border-border/50 p-1 bg-card">
      <Button
        size="sm"
        variant={value === "list" ? "default" : "ghost"}
        className="h-8"
        onClick={() => onChange("list")}
      >
        List
      </Button>
      <Button
        size="sm"
        variant={value === "cards" ? "default" : "ghost"}
        className="h-8"
        onClick={() => onChange("cards")}
      >
        Cards
      </Button>
    </div>
  );
}
