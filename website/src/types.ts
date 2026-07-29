export interface Feature {
  title: string;
  desc: string;
  accent: string;
}

export interface Stat {
  value: string;
  label: string;
  detail: string;
}

export interface ComparisonRow {
  feature: string;
  paykit: string;
  gateway: string;
}

export interface CodeSnippet {
  id: string;
  label: string;
  note: string;
  code: string;
}

export interface RouteStatus {
  label: string;
  provider: string;
  status: string;
  amount: string;
}
