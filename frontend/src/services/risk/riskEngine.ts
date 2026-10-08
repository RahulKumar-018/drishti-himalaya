import type { RiskCategory, RiskOutput } from "../../types/risk";

export type RiskState = "ASSESSED" | "UNASSESSED";

export function getRiskColor(risk: RiskOutput | null) {
  if (!risk) return "#7d8980";
  return {
    GREEN: "#98B66E",
    YELLOW: "#D7B867",
    ORANGE: "#D77E4A",
    RED: "#C65649",
  }[risk.category];
}

export function getRiskIntensity(risk: RiskOutput | null) {
  return risk ? Math.min(1, Math.max(0, risk.intensity)) : 0.18;
}

export function getRiskLabel(risk: RiskOutput | null) {
  return risk?.label ?? "UNASSESSED";
}

export function getRiskState(risk: RiskOutput | null): RiskState {
  return risk ? "ASSESSED" : "UNASSESSED";
}

export function getRiskCategoryLabel(category: RiskCategory) {
  return { GREEN: "LOW", YELLOW: "WATCH", ORANGE: "ELEVATED", RED: "HIGH" }[category];
}
