export type Env = "development" | "test" | "staging" | "production";

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

export const APP_NAME = "CSPM";
