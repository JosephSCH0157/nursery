# Nursery Agents

This document defines the **canonical agent roles** inside the Nursery workspace. Each agent has a clear scope, inputs/outputs, and guardrails so tools can cooperate without stepping on each other.

Release baseline: **Forge v1.0.0** (`forge-v1.0.0`).

---

## 🏗️ Core System Agents

### **Nursery** (Orchestrator)

**Role:** Workspace coordinator and contract enforcer.

* Owns boot order, environment wiring, and cross‑tool contracts.
* Validates schema versions and feature flags.
* No business logic; routes and verifies only.

**Inputs:** Workspace config, feature flags, tool manifests  
**Outputs:** Initialized tools, validated contracts

---

### **Tongs** (Storage & Registry)

**Role:** Canonical storage brain and calendar.

* Mount registry (cloud/local, role‑based).
* Script/recording metadata, revisions, mirrors.
* Calendar, sessions, and scheduling.

**Inputs:** Tool storage requests  
**Outputs:** Normalized storage decisions, snapshots, mirrors

---

## 🔥 Creation Agents

### **Bar‑Stock** (Idea Capture)

**Role:** Fast idea intake.

* Sparks, notes, fragments.
* UUID‑first creation.
* Zero structure pressure.

**Inputs:** Raw ideas  
**Outputs:** Sparks → Hearth

---

### **Hearth** (Script & Research)

**Role:** Idea‑to‑script refinement.

* Drafting, outlining, research assist.
* Style adaptation per creator.
* Script revisions (non‑destructive).

**Inputs:** Sparks, references  
**Outputs:** Scripts → Anvil / Tongs

---

## ⚒️ Production Agents

### **Anvil** (Teleprompter & Recording)

**Role:** Performance and capture.

* Script rendering & scroll engines.
* Recording (audio/video).
* ASR assist (mode‑aware).

**Inputs:** Scripts, settings  
**Outputs:** Recordings → Hammer / Tongs

---

### **Hammer** (Editing)

**Role:** Post‑production shaping.

* Cuts, trims, shorts.
* Non‑linear edits.

**Inputs:** Raw recordings  
**Outputs:** Finals → Quench

---

## 🚀 Distribution & Insight Agents

### **Quench** (Publish & Distribute)

**Role:** Platform delivery.

* Uploads, scheduling.
* Metadata & thumbnails.

**Inputs:** Final media  
**Outputs:** Live publishes

---

### **Ledger** (Analytics)

**Role:** Feedback and metrics.

* Views, CTR, retention.
* Comment intake & response cues.

**Inputs:** Platform data  
**Outputs:** Insights → Hearth / Strategy

---

## 🧭 Design Principles

* **Single Source of Truth:** Tongs for storage decisions.
* **Loose Coupling:** Agents communicate via contracts, not internals.
* **Fail Fast:** Invalid contracts halt rendering by design.
* **Creator First:** Tools adapt to the human, not the reverse.

---

*Last updated: 2026‑02‑07*
