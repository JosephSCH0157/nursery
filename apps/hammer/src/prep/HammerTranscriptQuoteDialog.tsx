import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import type { CustomerSpendingQuote } from "../../../../packages/tongs/src/customer-spending-confirmation";

export type HammerTranscriptQuoteDecision = Readonly<{
  request: (quote: CustomerSpendingQuote) => Promise<boolean>;
  dialog: JSX.Element | null;
}>;

export function useHammerTranscriptQuoteDecision(): HammerTranscriptQuoteDecision {
  const [quote, setQuote] = useState<CustomerSpendingQuote | null>(null);
  const resolverRef = useRef<((accepted: boolean) => void) | null>(null);

  const resolve = useCallback((accepted: boolean): void => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setQuote(null);
    resolver?.(accepted);
  }, []);

  const request = useCallback((nextQuote: CustomerSpendingQuote): Promise<boolean> => {
    resolverRef.current?.(false);
    return new Promise<boolean>((resolver) => {
      resolverRef.current = resolver;
      setQuote(nextQuote);
    });
  }, []);

  useEffect(() => () => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resolver?.(false);
  }, []);

  const dialog = quote ? (
    <div className="hammer-prep-shell__overlay" role="presentation">
      <section className="hammer-prep-shell__notice-modal" role="dialog" aria-modal="true"
        aria-labelledby="hammer-transcription-quote-title" aria-describedby="hammer-transcription-quote-detail">
        <div id="hammer-transcription-quote-title" className="hammer-prep-shell__notice-title">
          Owner-sponsored AssemblyAI transcription
        </div>
        <div className="hammer-prep-shell__notice-body">
          Review and accept this exact quote before Hammer reserves owner funds or contacts AssemblyAI.
        </div>
        <div id="hammer-transcription-quote-detail" className="hammer-prep-shell__notice-detail">
          <div>Model: {quote.model_display_name ?? "AssemblyAI transcription"}</div>
          {quote.model_tradeoff_summary ? <div>{quote.model_tradeoff_summary}</div> : null}
          <div>Reference price: {quote.reference_credit_units ?? quote.credit_charge} Forge Credits</div>
          <div>Customer charge: {quote.credit_charge} Forge Credits</div>
          <div>Funding: {quote.funding_label}</div>
          <div>{quote.failure_terms}</div>
          <div>Quote expires: {new Date(quote.expires_at).toLocaleString()}</div>
        </div>
        <div className="hammer-prep-shell__notice-actions">
          <button type="button" className="hammer-prep-shell__button hammer-prep-shell__button--secondary"
            onClick={() => resolve(false)}>Cancel</button>
          <button type="button" className="hammer-prep-shell__button"
            onClick={() => resolve(true)}>Accept quote and start transcription</button>
        </div>
      </section>
    </div>
  ) : null;

  return { request, dialog };
}
