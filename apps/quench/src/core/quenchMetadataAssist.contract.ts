export const QUENCH_METADATA_ASSIST_ROUTE = "/api/quench/metadata/assist";

export type QuenchMetadataAssistDraft = {
  title: string;
  description: string;
  tags: string[];
};
