export type RiskCategory = "GREEN" | "YELLOW" | "ORANGE" | "RED";

export interface RiskOutput {
  category: RiskCategory;
  label: string;
  intensity: number;
  factors: string[];
  source: string;
  state: "CALCULATED" | "LIVE";
}
