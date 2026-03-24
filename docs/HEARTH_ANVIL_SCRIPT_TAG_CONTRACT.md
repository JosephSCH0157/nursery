# Hearth/Anvil Script Tag Contract

Canonical rule:
A Hearth script is not eligible for Ready, Approval, or Open-in-Anvil unless it passes the shared canonical Anvil tag validator.

Implementation rule:
Hearth and Anvil must import validator logic from `@forge/shared/script-tags`. Hearth-local or Anvil-local validator forks are not allowed.

Safety rule:
Normalization may run automatically. Repair may run automatically only for deterministic low-risk fixes. Ambiguous structural fixes must remain manual.
