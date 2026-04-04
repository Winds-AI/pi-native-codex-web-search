export interface WebSearchInput {
  query: string;
  maxSources?: number;
  freshness?: "cached" | "live";
}

export interface WebSearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchDetails {
  query: string;
  freshness: "cached" | "live";
  sourceCount: number;
  sources: WebSearchSource[];
  summary: string;
  truncated: boolean;
}
