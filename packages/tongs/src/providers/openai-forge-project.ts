/** Non-secret project routing. Never attach Forge account headers to BYO. */
export function openAiProviderHeaders(apiKey: string, credentialFunding: "forge" | "byo_customer"): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    ...(credentialFunding === "forge" ? {
      "openai-organization": "org-M9AuhWvVFuGxXTGTsv33dc7X",
      "openai-project": "proj_ZuYi36uhWk4Xu8zEYs0PmI2H",
    } : {}),
  };
}
