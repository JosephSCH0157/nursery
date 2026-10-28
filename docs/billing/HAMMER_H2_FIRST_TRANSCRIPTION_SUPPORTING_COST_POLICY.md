# Hammer H2 first-transcription supporting-cost policy

Status: private operator draft for review. This document publishes no customer
price, creates no provider or customer authority, and does not authorize a
provider request, reservation, database write, or financial activation.

## Revision 2 — full canonical episode

The owner selected plan-funded baseline treatment for the first bounded Test
transcription. Fixed Netlify and Supabase subscriptions and continuing canonical
transcript storage remain Forge operating expenses. Capacity consumption is not
zero: quote admission must prove fresh plan headroom for the complete operation,
and new work halts when that proof is unavailable.

The per-operation supporting-cost ceiling and supporting-only failure-loss
ceiling remain **6,000 USD micros**. This is sufficient only while fresh capacity
evidence proves that the entire bounded operation fits inside the already-paid
Netlify and Supabase plans with the Supabase spend cap enabled. The operation
fails closed before provider submission when that evidence is absent or
insufficient; the policy does not treat capacity consumption as free. The
existing 33% cost-plus markup and whole-Forge-Credit rounding remain unchanged.
A complete customer quote still requires account-authoritative AssemblyAI rate,
increment, minimum, failure, and reconciliation evidence.

## Enforced first-operation envelope

- exact workspace `cc5478ff-37be-403e-824c-467fa7da061e`, workpiece
  `21d16d6a-905b-491e-8761-028789612ae5`, canonical recording
  `4cc846e3-187c-46d9-8733-e7402488236c`, active revision
  `9c991aa7-f551-4f03-a4d6-41eb40ef81ec`, and trusted completion
  `bf67d649-1bc2-44ba-9a33-783b3ab523ea`;
- exact media revision 1, SHA-256
  `595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24`,
  120,617,428 bytes, and trusted duration 603,848 ms;
- maximum two complete source reads and 241,234,856 source-egress bytes;
- direct project-scoped signed Supabase URL for the exact `forge-workpieces`
  object; the signed token must remain valid through the 30-minute
  reconciliation window plus one 15-second invocation; no Forge media proxy or
  AssemblyAI upload endpoint;
- maximum one provider attempt, one concurrent operation, and zero automatic
  retries;
- maximum 16 one-GiB function invocations, 15 seconds each and 240 seconds
  aggregate execution;
- maximum 12 provider reads inside a 30-minute reconciliation window;
- maximum 1 MiB raw provider payload and 1 MiB canonical transcript;
- maximum 64 KiB customer response and two 1-MiB transcript readbacks;
- maximum 8 MiB total database growth for transcript, receipts, indexes, and
  conservative amplification;
- no preprocessing, transcoding, Fly, email, search, enrichment, or second paid
  service.

Fresh private capacity evidence must cover at least 671,178 Netlify credit
microunits, 243,332,008 bytes of Supabase uncached egress, and 8 MiB of database
headroom. It expires within 24 hours and is admitted only by SHA-256 fingerprint.

## Full-episode payload evidence

The retained 1 MiB provider-response and canonical-transcript limits were
re-certified rather than copied from the 47-second fixture. A deterministic
603,848-ms high-density fixture uses 3,624 timestamped words (360 words/minute),
302 twelve-word turns, eight rotating speakers, and duplicates word evidence in
the top-level AssemblyAI `words` array and speaker-labelled `utterances`. Its
serialized provider response is 688,957 bytes. The corresponding canonical v2
transcript is 389,128 bytes. The provider limit therefore retains 359,619 bytes
of headroom and the canonical limit retains 659,448 bytes. The 8 MiB persistence
bound exceeds twenty copies of the measured canonical artifact, covering the
artifact, receipts, indexes, and conservative database amplification without
making storage unbounded.

Twelve provider reads inside 30 minutes and sixteen 15-second function
invocations (240 seconds aggregate) remain hard ceilings, not completion
promises. Exhausting any ceiling terminalizes the attempt for reconciliation;
it never causes an automatic provider retry.

## Failure and ambiguity

Verified provider, validation, persistence, or resource failure charges the
customer zero and releases the customer reservation while retaining supplier
exposure for reconciliation. Submission ambiguity charges the customer zero but
keeps the reservation and supplier exposure unresolved. Every terminal path
returns Hammer to `halt_new`; no path may submit again.

The total failure-loss ceiling remains:

`account-certified supplier ceiling + 6,000 supporting micros`

Until the supplier ceiling is certified, neither a numeric aggregate loss limit
nor a customer quote is complete.

## Remaining account evidence

- Universal-3.5 Pro and standard speaker-label rate for the exact account;
- billing increment, rounding, minimum, and multichannel rule;
- balance, payment standing, and model availability;
- US/EU processing selection and account data-control settings;
- failed, canceled, timeout, and accepted-but-ambiguous billing treatment;
- usage/invoice fields sufficient to reconcile transcript identity, model,
  feature, duration, charge, and request time.

Executable authority still requires a separately reviewed forward activation
migration and coordinator release. This draft must remain server/operator-only
and inactive until those later approvals.
