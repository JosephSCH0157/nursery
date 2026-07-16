export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  tongs: {
    Tables: {
      account_balances: {
        Row: {
          ai_credit_balance: number
          base_storage_bytes: number
          created_at: string
          plan_current_period_end: string | null
          plan_entitled: boolean
          plan_interval: string | null
          plan_item_id: string | null
          plan_status: string | null
          storage_bytes_entitled: number
          storage_current_period_end: string | null
          storage_item_id: string | null
          storage_status: string | null
          stripe_customer_id: string | null
          total_storage_bytes_entitled: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_credit_balance?: number
          base_storage_bytes?: number
          created_at?: string
          plan_current_period_end?: string | null
          plan_entitled?: boolean
          plan_interval?: string | null
          plan_item_id?: string | null
          plan_status?: string | null
          storage_bytes_entitled?: number
          storage_current_period_end?: string | null
          storage_item_id?: string | null
          storage_status?: string | null
          stripe_customer_id?: string | null
          total_storage_bytes_entitled?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_credit_balance?: number
          base_storage_bytes?: number
          created_at?: string
          plan_current_period_end?: string | null
          plan_entitled?: boolean
          plan_interval?: string | null
          plan_item_id?: string | null
          plan_status?: string | null
          storage_bytes_entitled?: number
          storage_current_period_end?: string | null
          storage_item_id?: string | null
          storage_status?: string | null
          stripe_customer_id?: string | null
          total_storage_bytes_entitled?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_credit_ledger: {
        Row: {
          created_at: string
          delta: number
          id: number
          provider_request_id: string | null
          reason: string
          request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: number
          provider_request_id?: string | null
          reason: string
          request_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: number
          provider_request_id?: string | null
          reason?: string
          request_id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_credit_purchases: {
        Row: {
          amount_total: number | null
          created_at: string
          currency: string | null
          id: number
          pack_id: string
          stripe_event_id: string
          stripe_session_id: string
          tokens_granted: number
          user_id: string
        }
        Insert: {
          amount_total?: number | null
          created_at?: string
          currency?: string | null
          id?: number
          pack_id: string
          stripe_event_id: string
          stripe_session_id: string
          tokens_granted: number
          user_id: string
        }
        Update: {
          amount_total?: number | null
          created_at?: string
          currency?: string | null
          id?: number
          pack_id?: string
          stripe_event_id?: string
          stripe_session_id?: string
          tokens_granted?: number
          user_id?: string
        }
        Relationships: []
      }
      ai_credits: {
        Row: {
          billing_mode: string
          created_at: string
          token_balance: number
          token_monthly_limit: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_mode?: string
          created_at?: string
          token_balance?: number
          token_monthly_limit?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_mode?: string
          created_at?: string
          token_balance?: number
          token_monthly_limit?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_token_ledger: {
        Row: {
          created_at: string
          delta: number
          id: string
          reason: string
          request_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          reason?: string
          request_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          reason?: string
          request_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          action_id: string | null
          actual_cost_usd: number
          billable_tokens: number
          correlation_id: string | null
          created_at: string
          effective_ai_key_source: string | null
          effective_billing_lane: string | null
          estimated_cost_usd: number
          feature: string
          id: string
          input_tokens: number
          key_resolution_status: string | null
          key_source: string
          lane: string
          model: string
          occurred_at_ms: number
          output_tokens: number
          policy_decision_type: string | null
          policy_enforced: boolean
          policy_reason_code: string | null
          policy_snapshot: Json
          provider: string | null
          provider_request_id: string | null
          reasoning_effort: string | null
          session_id: string | null
          status: string
          subfeature: string | null
          total_tokens: number
          trigger: string
          user_id: string
          workpiece_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action_id?: string | null
          actual_cost_usd?: number
          billable_tokens?: number
          correlation_id?: string | null
          created_at?: string
          effective_ai_key_source?: string | null
          effective_billing_lane?: string | null
          estimated_cost_usd?: number
          feature: string
          id?: string
          input_tokens?: number
          key_resolution_status?: string | null
          key_source?: string
          lane?: string
          model: string
          occurred_at_ms?: number
          output_tokens?: number
          policy_decision_type?: string | null
          policy_enforced?: boolean
          policy_reason_code?: string | null
          policy_snapshot?: Json
          provider?: string | null
          provider_request_id?: string | null
          reasoning_effort?: string | null
          session_id?: string | null
          status: string
          subfeature?: string | null
          total_tokens?: number
          trigger: string
          user_id: string
          workpiece_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action_id?: string | null
          actual_cost_usd?: number
          billable_tokens?: number
          correlation_id?: string | null
          created_at?: string
          effective_ai_key_source?: string | null
          effective_billing_lane?: string | null
          estimated_cost_usd?: number
          feature?: string
          id?: string
          input_tokens?: number
          key_resolution_status?: string | null
          key_source?: string
          lane?: string
          model?: string
          occurred_at_ms?: number
          output_tokens?: number
          policy_decision_type?: string | null
          policy_enforced?: boolean
          policy_reason_code?: string | null
          policy_snapshot?: Json
          provider?: string | null
          provider_request_id?: string | null
          reasoning_effort?: string | null
          session_id?: string | null
          status?: string
          subfeature?: string | null
          total_tokens?: number
          trigger?: string
          user_id?: string
          workpiece_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "recording_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_ledger: {
        Row: {
          action: string | null
          actual_cost_usd: number | null
          allowed: boolean | null
          created_at: string
          decision_type: Database["tongs"]["Enums"]["ai_decision_type"]
          effective_policy_snapshot: Json
          estimated_cost_usd: number | null
          fallback_available: boolean
          fallback_from: Database["tongs"]["Enums"]["ai_funding_source"] | null
          fallback_to: Database["tongs"]["Enums"]["ai_funding_source"] | null
          fallback_used: boolean
          feature: string | null
          funding_source: Database["tongs"]["Enums"]["ai_funding_source"] | null
          id: string
          model: string | null
          org_id: string | null
          provider: string | null
          reason_code: string | null
          request_id: string | null
          tool: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          action?: string | null
          actual_cost_usd?: number | null
          allowed?: boolean | null
          created_at?: string
          decision_type: Database["tongs"]["Enums"]["ai_decision_type"]
          effective_policy_snapshot?: Json
          estimated_cost_usd?: number | null
          fallback_available?: boolean
          fallback_from?: Database["tongs"]["Enums"]["ai_funding_source"] | null
          fallback_to?: Database["tongs"]["Enums"]["ai_funding_source"] | null
          fallback_used?: boolean
          feature?: string | null
          funding_source?:
            | Database["tongs"]["Enums"]["ai_funding_source"]
            | null
          id?: string
          model?: string | null
          org_id?: string | null
          provider?: string | null
          reason_code?: string | null
          request_id?: string | null
          tool: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          action?: string | null
          actual_cost_usd?: number | null
          allowed?: boolean | null
          created_at?: string
          decision_type?: Database["tongs"]["Enums"]["ai_decision_type"]
          effective_policy_snapshot?: Json
          estimated_cost_usd?: number | null
          fallback_available?: boolean
          fallback_from?: Database["tongs"]["Enums"]["ai_funding_source"] | null
          fallback_to?: Database["tongs"]["Enums"]["ai_funding_source"] | null
          fallback_used?: boolean
          feature?: string | null
          funding_source?:
            | Database["tongs"]["Enums"]["ai_funding_source"]
            | null
          id?: string
          model?: string | null
          org_id?: string | null
          provider?: string | null
          reason_code?: string | null
          request_id?: string | null
          tool?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_ledger_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      anvil_recording_completion_requests: {
        Row: {
          capture_session_id: string
          completed_by: string
          completion_evidence: Json
          created_at: string
          id: string
          idempotency_key: string
          media_hash: string
          media_path: string
          media_revision: number
          ready_transition_id: string
          request_fingerprint: string
          script_hash: string
          script_revision: number
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          capture_session_id: string
          completed_by: string
          completion_evidence: Json
          created_at?: string
          id?: string
          idempotency_key: string
          media_hash: string
          media_path: string
          media_revision: number
          ready_transition_id: string
          request_fingerprint: string
          script_hash: string
          script_revision: number
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          capture_session_id?: string
          completed_by?: string
          completion_evidence?: Json
          created_at?: string
          id?: string
          idempotency_key?: string
          media_hash?: string
          media_path?: string
          media_revision?: number
          ready_transition_id?: string
          request_fingerprint?: string
          script_hash?: string
          script_revision?: number
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anvil_recording_completion_requests_ready_transition_id_fkey"
            columns: ["ready_transition_id"]
            isOneToOne: false
            referencedRelation: "workpiece_ready_transition_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anvil_recording_completion_requests_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anvil_recording_completion_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      anvil_recording_keep_requests: {
        Row: {
          capture_session_id: string
          completion_id: string
          created_at: string
          decision_evidence: Json
          id: string
          idempotency_key: string
          kept_by: string
          request_fingerprint: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          capture_session_id: string
          completion_id: string
          created_at?: string
          decision_evidence: Json
          id?: string
          idempotency_key: string
          kept_by: string
          request_fingerprint: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          capture_session_id?: string
          completion_id?: string
          created_at?: string
          decision_evidence?: Json
          id?: string
          idempotency_key?: string
          kept_by?: string
          request_fingerprint?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anvil_recording_keep_requests_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: true
            referencedRelation: "anvil_recording_completion_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anvil_recording_keep_requests_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: true
            referencedRelation: "current_workpiece_recorded_takes"
            referencedColumns: ["completion_id"]
          },
          {
            foreignKeyName: "anvil_recording_keep_requests_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anvil_recording_keep_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_kind: string
          bytes: number
          cache_control: string | null
          content_hash: string | null
          created_at: string
          created_by: string
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          height: number | null
          id: string
          metadata: Json
          metadata_json: Json
          mime_type: string
          operation_fingerprint: string | null
          operation_id: string | null
          path: string
          prompt: string | null
          provider: string
          provider_request_id: string | null
          ready_at: string | null
          reference_committed_at: string | null
          request_id: string | null
          reuse_identity: string | null
          source_asset_id: string | null
          status: string
          storage_bucket: string
          storage_key: string
          supersedes_asset_id: string | null
          updated_at: string
          variant_kind: string
          variant_version: number
          width: number | null
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          asset_kind?: string
          bytes: number
          cache_control?: string | null
          content_hash?: string | null
          created_at?: string
          created_by: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          height?: number | null
          id?: string
          metadata?: Json
          metadata_json?: Json
          mime_type: string
          operation_fingerprint?: string | null
          operation_id?: string | null
          path: string
          prompt?: string | null
          provider: string
          provider_request_id?: string | null
          ready_at?: string | null
          reference_committed_at?: string | null
          request_id?: string | null
          reuse_identity?: string | null
          source_asset_id?: string | null
          status?: string
          storage_bucket?: string
          storage_key: string
          supersedes_asset_id?: string | null
          updated_at?: string
          variant_kind?: string
          variant_version?: number
          width?: number | null
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          asset_kind?: string
          bytes?: number
          cache_control?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          height?: number | null
          id?: string
          metadata?: Json
          metadata_json?: Json
          mime_type?: string
          operation_fingerprint?: string | null
          operation_id?: string | null
          path?: string
          prompt?: string | null
          provider?: string
          provider_request_id?: string | null
          ready_at?: string | null
          reference_committed_at?: string | null
          request_id?: string | null
          reuse_identity?: string | null
          source_asset_id?: string | null
          status?: string
          storage_bucket?: string
          storage_key?: string
          supersedes_asset_id?: string | null
          updated_at?: string
          variant_kind?: string
          variant_version?: number
          width?: number | null
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_supersedes_asset_id_fkey"
            columns: ["supersedes_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      barstock_assignments: {
        Row: {
          created_at: string
          created_by: string
          id: string
          import_key: string | null
          revision: number
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          import_key?: string | null
          revision?: number
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          import_key?: string | null
          revision?: number
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      barstock_project_episode_links: {
        Row: {
          created_at: string
          project_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "barstock_project_episode_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "barstock_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      barstock_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          pinned: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          pinned?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          pinned?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "barstock_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      barstock_sparks: {
        Row: {
          assignment_id: string | null
          body: string
          client_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          episode_id: string | null
          id: string
          import_key: string | null
          pinned: boolean
          revision: number
          source: string
          status: string
          tags: string[]
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assignment_id?: string | null
          body: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          episode_id?: string | null
          id?: string
          import_key?: string | null
          pinned?: boolean
          revision?: number
          source: string
          status: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assignment_id?: string | null
          body?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          episode_id?: string | null
          id?: string
          import_key?: string | null
          pinned?: boolean
          revision?: number
          source?: string
          status?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "barstock_sparks_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "barstock_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barstock_sparks_episode_fk"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barstock_sparks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bellows_session_checkpoints: {
        Row: {
          acting_authority_state: string
          acting_host_participant_id: string | null
          actor_id: string | null
          actor_type: string | null
          broadcast_state: string
          checkpoint_kind: string
          co_host_participant_ids: string[]
          delta: Json | null
          effect_type: string | null
          event_count: number
          follow_up_action_source: string | null
          follow_up_action_type: string | null
          host_participant_id: string | null
          id: string
          integrity_flags: string[]
          lifecycle_state: string
          occurred_at: string | null
          offset_ms: number | null
          outcome: string | null
          recorded_at: string
          recording_state: string
          seal_state: string
          sequence_no: number
          session_id: string
          session_snapshot: Json
          snapshot_schema_version: number
          trigger_action_source: string
          trigger_action_type: string
          upload_state: string
        }
        Insert: {
          acting_authority_state: string
          acting_host_participant_id?: string | null
          actor_id?: string | null
          actor_type?: string | null
          broadcast_state: string
          checkpoint_kind: string
          co_host_participant_ids?: string[]
          delta?: Json | null
          effect_type?: string | null
          event_count?: number
          follow_up_action_source?: string | null
          follow_up_action_type?: string | null
          host_participant_id?: string | null
          id?: string
          integrity_flags?: string[]
          lifecycle_state: string
          occurred_at?: string | null
          offset_ms?: number | null
          outcome?: string | null
          recorded_at?: string
          recording_state: string
          seal_state: string
          sequence_no: number
          session_id: string
          session_snapshot: Json
          snapshot_schema_version?: number
          trigger_action_source: string
          trigger_action_type: string
          upload_state: string
        }
        Update: {
          acting_authority_state?: string
          acting_host_participant_id?: string | null
          actor_id?: string | null
          actor_type?: string | null
          broadcast_state?: string
          checkpoint_kind?: string
          co_host_participant_ids?: string[]
          delta?: Json | null
          effect_type?: string | null
          event_count?: number
          follow_up_action_source?: string | null
          follow_up_action_type?: string | null
          host_participant_id?: string | null
          id?: string
          integrity_flags?: string[]
          lifecycle_state?: string
          occurred_at?: string | null
          offset_ms?: number | null
          outcome?: string | null
          recorded_at?: string
          recording_state?: string
          seal_state?: string
          sequence_no?: number
          session_id?: string
          session_snapshot?: Json
          snapshot_schema_version?: number
          trigger_action_source?: string
          trigger_action_type?: string
          upload_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "bellows_session_checkpoints_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "bellows_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      bellows_session_join_links: {
        Row: {
          created_at: string
          created_by_user_id: string
          expires_at: string
          id: string
          last_used_at: string | null
          max_uses: number
          revoked_at: string | null
          role_code: string
          session_id: string
          token_hash: string
          updated_at: string
          use_count: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          expires_at: string
          id?: string
          last_used_at?: string | null
          max_uses?: number
          revoked_at?: string | null
          role_code: string
          session_id: string
          token_hash: string
          updated_at?: string
          use_count?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          max_uses?: number
          revoked_at?: string | null
          role_code?: string
          session_id?: string
          token_hash?: string
          updated_at?: string
          use_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bellows_session_join_links_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "bellows_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bellows_session_join_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bellows_sessions: {
        Row: {
          acting_authority_state: string
          acting_host_participant_id: string | null
          archived_at: string | null
          broadcast_state: string
          calendar_event_id: string | null
          co_host_participant_ids: string[]
          created_at: string
          ended_at: string | null
          host_participant_id: string | null
          host_user_id: string
          id: string
          integrity_flags: string[]
          latest_checkpoint_id: string | null
          lifecycle_state: string
          mode: string
          outcome: string | null
          recording_session_id: string | null
          recording_state: string
          seal_state: string
          sealed_at: string | null
          session_type: string
          snapshot_schema_version: number
          started_at: string | null
          title: string
          updated_at: string
          upload_state: string
          workspace_id: string
        }
        Insert: {
          acting_authority_state: string
          acting_host_participant_id?: string | null
          archived_at?: string | null
          broadcast_state: string
          calendar_event_id?: string | null
          co_host_participant_ids?: string[]
          created_at?: string
          ended_at?: string | null
          host_participant_id?: string | null
          host_user_id: string
          id: string
          integrity_flags?: string[]
          latest_checkpoint_id?: string | null
          lifecycle_state: string
          mode: string
          outcome?: string | null
          recording_session_id?: string | null
          recording_state: string
          seal_state: string
          sealed_at?: string | null
          session_type: string
          snapshot_schema_version?: number
          started_at?: string | null
          title: string
          updated_at?: string
          upload_state: string
          workspace_id: string
        }
        Update: {
          acting_authority_state?: string
          acting_host_participant_id?: string | null
          archived_at?: string | null
          broadcast_state?: string
          calendar_event_id?: string | null
          co_host_participant_ids?: string[]
          created_at?: string
          ended_at?: string | null
          host_participant_id?: string | null
          host_user_id?: string
          id?: string
          integrity_flags?: string[]
          latest_checkpoint_id?: string | null
          lifecycle_state?: string
          mode?: string
          outcome?: string | null
          recording_session_id?: string | null
          recording_state?: string
          seal_state?: string
          sealed_at?: string | null
          session_type?: string
          snapshot_schema_version?: number
          started_at?: string | null
          title?: string
          updated_at?: string
          upload_state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bellows_sessions_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bellows_sessions_latest_checkpoint_belongs_to_session_fkey"
            columns: ["id", "latest_checkpoint_id"]
            isOneToOne: false
            referencedRelation: "bellows_session_checkpoints"
            referencedColumns: ["session_id", "id"]
          },
          {
            foreignKeyName: "bellows_sessions_recording_session_id_fkey"
            columns: ["recording_session_id"]
            isOneToOne: false
            referencedRelation: "recording_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bellows_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_customers: {
        Row: {
          created_at: string
          customer_name: string | null
          email: string | null
          metadata_json: Json
          stripe_customer_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          email?: string | null
          metadata_json?: Json
          stripe_customer_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          email?: string | null
          metadata_json?: Json
          stripe_customer_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          created_at: string
          event_type: string
          livemode: boolean | null
          payload_json: Json
          processed_at: string
          stripe_customer_id: string | null
          stripe_event_id: string
          stripe_session_id: string | null
          stripe_subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          livemode?: boolean | null
          payload_json?: Json
          processed_at?: string
          stripe_customer_id?: string | null
          stripe_event_id: string
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          livemode?: boolean | null
          payload_json?: Json
          processed_at?: string
          stripe_customer_id?: string | null
          stripe_event_id?: string
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      billing_one_time_purchases: {
        Row: {
          amount_total: number | null
          created_at: string
          currency: string | null
          item_id: string
          metadata_json: Json
          payment_intent_id: string | null
          purchase_type: string
          status: string
          stripe_customer_id: string
          stripe_event_id: string
          stripe_session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_total?: number | null
          created_at?: string
          currency?: string | null
          item_id: string
          metadata_json?: Json
          payment_intent_id?: string | null
          purchase_type: string
          status: string
          stripe_customer_id: string
          stripe_event_id: string
          stripe_session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_total?: number | null
          created_at?: string
          currency?: string | null
          item_id?: string
          metadata_json?: Json
          payment_intent_id?: string | null
          purchase_type?: string
          status?: string
          stripe_customer_id?: string
          stripe_event_id?: string
          stripe_session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          interval: string
          item_id: string
          metadata_json: Json
          price_id: string | null
          purchase_type: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          interval: string
          item_id: string
          metadata_json?: Json
          price_id?: string | null
          purchase_type: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          interval?: string
          item_id?: string
          metadata_json?: Json
          price_id?: string | null
          purchase_type?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_event_assignments: {
        Row: {
          assignment_id: string
          created_at: string
          created_by: string | null
          event_id: string
          workspace_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          created_by?: string | null
          event_id: string
          workspace_id: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          created_by?: string | null
          event_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_assignments_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          assignment_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_at: string | null
          id: string
          location: string | null
          session_id: string | null
          start_at: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          all_day?: boolean
          assignment_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at?: string | null
          id?: string
          location?: string | null
          session_id?: string | null
          start_at: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          all_day?: boolean
          assignment_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at?: string | null
          id?: string
          location?: string | null
          session_id?: string | null
          start_at?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "recording_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_recordings: {
        Row: {
          anvil_capture_session_id: string | null
          baseline_speaker_map_path: string | null
          baseline_timing_path: string | null
          baseline_transcript_path: string | null
          created_at: string
          created_by: string
          id: string
          kept_take_event_id: number | null
          media_bytes: number | null
          media_content_type: string | null
          media_duration_ms: number | null
          media_id: string
          media_path: string
          media_signature: string | null
          recording_session_id: string | null
          sealed_at: string | null
          status: string
          updated_at: string
          updated_by: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          anvil_capture_session_id?: string | null
          baseline_speaker_map_path?: string | null
          baseline_timing_path?: string | null
          baseline_transcript_path?: string | null
          created_at?: string
          created_by: string
          id?: string
          kept_take_event_id?: number | null
          media_bytes?: number | null
          media_content_type?: string | null
          media_duration_ms?: number | null
          media_id: string
          media_path: string
          media_signature?: string | null
          recording_session_id?: string | null
          sealed_at?: string | null
          status?: string
          updated_at?: string
          updated_by: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          anvil_capture_session_id?: string | null
          baseline_speaker_map_path?: string | null
          baseline_timing_path?: string | null
          baseline_transcript_path?: string | null
          created_at?: string
          created_by?: string
          id?: string
          kept_take_event_id?: number | null
          media_bytes?: number | null
          media_content_type?: string | null
          media_duration_ms?: number | null
          media_id?: string
          media_path?: string
          media_signature?: string | null
          recording_session_id?: string | null
          sealed_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_recordings_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_recordings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_deletion_audit: {
        Row: {
          actor_user_id: string
          bytes_removed_estimate: number
          created_at: string
          deleted_asset_rows_count: number
          deleted_presence_rows_count: number
          deleted_project_links_count: number
          deleted_recording_links_count: number
          deleted_workpiece_event_rows_count: number
          deleted_workpiece_file_rows_count: number
          deletion_mode: string
          id: number
          retained_performance_stub: boolean
          retained_reusable_assets_count: number
          warnings: Json
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          bytes_removed_estimate?: number
          created_at?: string
          deleted_asset_rows_count?: number
          deleted_presence_rows_count?: number
          deleted_project_links_count?: number
          deleted_recording_links_count?: number
          deleted_workpiece_event_rows_count?: number
          deleted_workpiece_file_rows_count?: number
          deletion_mode: string
          id?: never
          retained_performance_stub?: boolean
          retained_reusable_assets_count?: number
          warnings?: Json
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          bytes_removed_estimate?: number
          created_at?: string
          deleted_asset_rows_count?: number
          deleted_presence_rows_count?: number
          deleted_project_links_count?: number
          deleted_recording_links_count?: number
          deleted_workpiece_event_rows_count?: number
          deleted_workpiece_file_rows_count?: number
          deletion_mode?: string
          id?: never
          retained_performance_stub?: boolean
          retained_reusable_assets_count?: number
          warnings?: Json
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_deletion_audit_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_performance_retention: {
        Row: {
          canonical_url: string | null
          created_at: string
          created_by: string | null
          deletion_mode: string
          detached_at: string
          former_workpiece_id: string
          id: string
          last_analytics_fetch_at: string | null
          platform_records: Json
          publish_timestamp: string | null
          title_snapshot: string | null
          tracking_enabled: boolean
          updated_at: string
          workpiece_id: string | null
          workspace_id: string
        }
        Insert: {
          canonical_url?: string | null
          created_at?: string
          created_by?: string | null
          deletion_mode: string
          detached_at?: string
          former_workpiece_id: string
          id?: string
          last_analytics_fetch_at?: string | null
          platform_records?: Json
          publish_timestamp?: string | null
          title_snapshot?: string | null
          tracking_enabled?: boolean
          updated_at?: string
          workpiece_id?: string | null
          workspace_id: string
        }
        Update: {
          canonical_url?: string | null
          created_at?: string
          created_by?: string | null
          deletion_mode?: string
          detached_at?: string
          former_workpiece_id?: string
          id?: string
          last_analytics_fetch_at?: string | null
          platform_records?: Json
          publish_timestamp?: string | null
          title_snapshot?: string | null
          tracking_enabled?: boolean
          updated_at?: string
          workpiece_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_performance_retention_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_performance_retention_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          active_revision_id: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          canonical_recording_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          detached_at: string | null
          id: string
          label: string
          lifecycle_state: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active_revision_id?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          canonical_recording_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          detached_at?: string | null
          id?: string
          label: string
          lifecycle_state?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active_revision_id?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          canonical_recording_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          detached_at?: string | null
          id?: string
          label?: string
          lifecycle_state?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodes_active_revision_id_fkey"
            columns: ["active_revision_id"]
            isOneToOne: false
            referencedRelation: "recording_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_canonical_recording_id_fkey"
            columns: ["canonical_recording_id"]
            isOneToOne: false
            referencedRelation: "canonical_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      hammer_workpiece_presence: {
        Row: {
          created_at: string
          display_name: string | null
          last_seen_at: string
          mode: string
          session_id: string | null
          user_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          last_seen_at?: string
          mode?: string
          session_id?: string | null
          user_id: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          last_seen_at?: string
          mode?: string
          session_id?: string | null
          user_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hammer_workpiece_presence_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hammer_workpiece_presence_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hammer_workpiece_state: {
        Row: {
          active_session_id: string | null
          alignment_status: string
          audio_polish_artifact_path: string | null
          current_pass: string
          edit_plan_artifact_path: string | null
          edit_plan_signature: string | null
          editor_session_path: string | null
          last_macro_run_ref: string | null
          last_opened_at: string
          macro_recipe_ref: string | null
          pass_order_version: number
          pass_status: Json
          prep_status: string
          speaker_map_artifact_path: string | null
          transcript_artifact_path: string | null
          transcript_versions_artifact_path: string | null
          updated_at: string
          updated_by: string
          visual_placement_artifact_path: string | null
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          active_session_id?: string | null
          alignment_status?: string
          audio_polish_artifact_path?: string | null
          current_pass?: string
          edit_plan_artifact_path?: string | null
          edit_plan_signature?: string | null
          editor_session_path?: string | null
          last_macro_run_ref?: string | null
          last_opened_at?: string
          macro_recipe_ref?: string | null
          pass_order_version?: number
          pass_status?: Json
          prep_status?: string
          speaker_map_artifact_path?: string | null
          transcript_artifact_path?: string | null
          transcript_versions_artifact_path?: string | null
          updated_at?: string
          updated_by: string
          visual_placement_artifact_path?: string | null
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          active_session_id?: string | null
          alignment_status?: string
          audio_polish_artifact_path?: string | null
          current_pass?: string
          edit_plan_artifact_path?: string | null
          edit_plan_signature?: string | null
          editor_session_path?: string | null
          last_macro_run_ref?: string | null
          last_opened_at?: string
          macro_recipe_ref?: string | null
          pass_order_version?: number
          pass_status?: Json
          prep_status?: string
          speaker_map_artifact_path?: string | null
          transcript_artifact_path?: string | null
          transcript_versions_artifact_path?: string | null
          updated_at?: string
          updated_by?: string
          visual_placement_artifact_path?: string | null
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hammer_workpiece_state_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hammer_workpiece_state_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hearth_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          episode_id: string
          extracted_text: string | null
          filename: string
          id: string
          mime_type: string
          parse_error: string | null
          parse_status: string
          size_bytes: number
          storage_bucket: string
          storage_key: string
          storage_path: string
          text_source: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          episode_id: string
          extracted_text?: string | null
          filename: string
          id?: string
          mime_type: string
          parse_error?: string | null
          parse_status?: string
          size_bytes: number
          storage_bucket?: string
          storage_key: string
          storage_path: string
          text_source?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          episode_id?: string
          extracted_text?: string | null
          filename?: string
          id?: string
          mime_type?: string
          parse_error?: string | null
          parse_status?: string
          size_bytes?: number
          storage_bucket?: string
          storage_key?: string
          storage_path?: string
          text_source?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hearth_attachments_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearth_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hearth_creator_profiles: {
        Row: {
          clarify_first_bias: number
          confidence: number
          outline_first_bias: number
          profile_json: Json
          risk_sensitivity: number
          script_first_bias: number
          tone_style: string
          updated_at: string
          user_id: string
        }
        Insert: {
          clarify_first_bias?: number
          confidence?: number
          outline_first_bias?: number
          profile_json?: Json
          risk_sensitivity?: number
          script_first_bias?: number
          tone_style?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          clarify_first_bias?: number
          confidence?: number
          outline_first_bias?: number
          profile_json?: Json
          risk_sensitivity?: number
          script_first_bias?: number
          tone_style?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      hearth_interaction_events: {
        Row: {
          created_at: string
          episode_id: string | null
          event_type: string
          id: string
          payload: Json
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          episode_id?: string | null
          event_type: string
          id?: string
          payload?: Json
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          episode_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hearth_interaction_events_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearth_interaction_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hearth_workpiece_presence: {
        Row: {
          created_at: string
          display_name: string | null
          last_seen_at: string
          mode: string
          user_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          last_seen_at?: string
          mode?: string
          user_id: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          last_seen_at?: string
          mode?: string
          user_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hearth_workpiece_presence_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearth_workpiece_presence_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      henry_events: {
        Row: {
          created_at: string
          event_id: string
          event_name: string
          metadata: Json
          surface: string
          user_id: string
          workpiece_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          event_id?: string
          event_name: string
          metadata?: Json
          surface: string
          user_id: string
          workpiece_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          event_name?: string
          metadata?: Json
          surface?: string
          user_id?: string
          workpiece_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "henry_events_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "henry_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      henry_message_state: {
        Row: {
          cooldown_until: string | null
          created_at: string
          dismiss_count: number
          last_dismissed_at: string | null
          last_seen_at: string
          message_id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          cooldown_until?: string | null
          created_at?: string
          dismiss_count?: number
          last_dismissed_at?: string | null
          last_seen_at?: string
          message_id: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          cooldown_until?: string | null
          created_at?: string
          dismiss_count?: number
          last_dismissed_at?: string | null
          last_seen_at?: string
          message_id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "henry_message_state_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      henry_user_preferences: {
        Row: {
          created_at: string
          hide_tips: boolean
          muted_until: string | null
          open_last_tab: boolean
          show_henry: boolean
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          hide_tips?: boolean
          muted_until?: string | null
          open_last_tab?: boolean
          show_henry?: boolean
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          hide_tips?: boolean
          muted_until?: string | null
          open_last_tab?: boolean
          show_henry?: boolean
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "henry_user_preferences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_ops: {
        Row: {
          created_at: string
          id: number
          op: Json
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          op: Json
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: number
          op?: Json
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_ops_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      member_ai_policy: {
        Row: {
          ai_enabled: boolean
          allow_heavy_tasks: boolean
          allow_image_generation: boolean
          allow_research_flows: boolean
          created_at: string
          daily_cap_usd: number | null
          mode_override: Database["tongs"]["Enums"]["ai_mode"] | null
          monthly_cap_usd: number | null
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_enabled?: boolean
          allow_heavy_tasks?: boolean
          allow_image_generation?: boolean
          allow_research_flows?: boolean
          created_at?: string
          daily_cap_usd?: number | null
          mode_override?: Database["tongs"]["Enums"]["ai_mode"] | null
          monthly_cap_usd?: number | null
          org_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_enabled?: boolean
          allow_heavy_tasks?: boolean
          allow_image_generation?: boolean
          allow_research_flows?: boolean
          created_at?: string
          daily_cap_usd?: number | null
          mode_override?: Database["tongs"]["Enums"]["ai_mode"] | null
          monthly_cap_usd?: number | null
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_ai_policy_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      mount_registry: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          policy: Json
          role: string
          target_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          policy?: Json
          role: string
          target_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          policy?: Json
          role?: string
          target_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mount_registry_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          created_by: string | null
          org_id: string
          org_role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          org_id: string
          org_role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          org_id?: string
          org_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_ai_policy: {
        Row: {
          created_at: string
          default_mode: Database["tongs"]["Enums"]["ai_mode"]
          fallback_allowed: boolean
          feature_flags: Json
          member_byo_allowed: boolean
          org_daily_cap_usd: number | null
          org_id: string
          org_monthly_cap_usd: number | null
          shared_org_ai_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_mode?: Database["tongs"]["Enums"]["ai_mode"]
          fallback_allowed?: boolean
          feature_flags?: Json
          member_byo_allowed?: boolean
          org_daily_cap_usd?: number | null
          org_id: string
          org_monthly_cap_usd?: number | null
          shared_org_ai_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_mode?: Database["tongs"]["Enums"]["ai_mode"]
          fallback_allowed?: boolean
          feature_flags?: Json
          member_byo_allowed?: boolean
          org_daily_cap_usd?: number | null
          org_id?: string
          org_monthly_cap_usd?: number | null
          shared_org_ai_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_ai_policy_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          personal_owner_user_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          personal_owner_user_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          personal_owner_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      plan_credit_grants: {
        Row: {
          created_at: string
          credits_granted: number
          id: number
          period_end: string | null
          period_start: string
          plan_item_id: string
          source_event_id: string | null
          stripe_subscription_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_granted: number
          id?: number
          period_end?: string | null
          period_start: string
          plan_item_id: string
          source_event_id?: string | null
          stripe_subscription_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_granted?: number
          id?: number
          period_end?: string | null
          period_start?: string
          plan_item_id?: string
          source_event_id?: string | null
          stripe_subscription_id?: string
          user_id?: string
        }
        Relationships: []
      }
      project_cradles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          manifest_path: string
          metadata: Json
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          manifest_path?: string
          metadata?: Json
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          manifest_path?: string
          metadata?: Json
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_cradles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_revisions: {
        Row: {
          audio_polish_path: string | null
          canonical_recording_id: string
          composition_fingerprint: string | null
          composition_history_head_id: string | null
          composition_revision: number | null
          composition_v2_path: string | null
          created_at: string
          created_by: string
          editor_session_path: string | null
          history_path: string | null
          id: string
          label: string | null
          media_provenance_path: string | null
          release_packet_path: string | null
          render_jobs_path: string | null
          revision_transcript_path: string | null
          snapshots_manifest_path: string | null
          status: string
          updated_at: string
          updated_by: string
          visual_placements_path: string | null
          visual_timeline_path: string | null
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          audio_polish_path?: string | null
          canonical_recording_id: string
          composition_fingerprint?: string | null
          composition_history_head_id?: string | null
          composition_revision?: number | null
          composition_v2_path?: string | null
          created_at?: string
          created_by: string
          editor_session_path?: string | null
          history_path?: string | null
          id?: string
          label?: string | null
          media_provenance_path?: string | null
          release_packet_path?: string | null
          render_jobs_path?: string | null
          revision_transcript_path?: string | null
          snapshots_manifest_path?: string | null
          status?: string
          updated_at?: string
          updated_by: string
          visual_placements_path?: string | null
          visual_timeline_path?: string | null
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          audio_polish_path?: string | null
          canonical_recording_id?: string
          composition_fingerprint?: string | null
          composition_history_head_id?: string | null
          composition_revision?: number | null
          composition_v2_path?: string | null
          created_at?: string
          created_by?: string
          editor_session_path?: string | null
          history_path?: string | null
          id?: string
          label?: string | null
          media_provenance_path?: string | null
          release_packet_path?: string | null
          render_jobs_path?: string | null
          revision_transcript_path?: string | null
          snapshots_manifest_path?: string | null
          status?: string
          updated_at?: string
          updated_by?: string
          visual_placements_path?: string | null
          visual_timeline_path?: string | null
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recording_revisions_canonical_recording_id_fkey"
            columns: ["canonical_recording_id"]
            isOneToOne: false
            referencedRelation: "canonical_recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_revisions_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_session_episodes: {
        Row: {
          created_at: string
          episode_id: string
          notes: string | null
          position: number
          recording_session_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          episode_id: string
          notes?: string | null
          position?: number
          recording_session_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          episode_id?: string
          notes?: string | null
          position?: number
          recording_session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rse_episode_fk"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rse_recording_fk"
            columns: ["recording_session_id"]
            isOneToOne: false
            referencedRelation: "recording_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_session_items: {
        Row: {
          created_at: string
          episode_id: string
          id: string
          position: number
          script_path: string
          session_id: string
        }
        Insert: {
          created_at?: string
          episode_id: string
          id?: string
          position: number
          script_path: string
          session_id: string
        }
        Update: {
          created_at?: string
          episode_id?: string
          id?: string
          position?: number
          script_path?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recording_session_items_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_session_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "recording_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_sessions: {
        Row: {
          calendar_event_id: string | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          notes: string | null
          session_type: Database["tongs"]["Enums"]["session_type"]
          starts_at: string
          status: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          notes?: string | null
          session_type?: Database["tongs"]["Enums"]["session_type"]
          starts_at: string
          status?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          notes?: string | null
          session_type?: Database["tongs"]["Enums"]["session_type"]
          starts_at?: string
          status?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recording_sessions_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_sessions_workspace_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_takes: {
        Row: {
          created_at: string
          duration_sec: number | null
          id: string
          local_artifact_ref: string | null
          notes: string | null
          recorded_at: string
          script_id: string
          session_id: string | null
          status: Database["tongs"]["Enums"]["take_status"]
        }
        Insert: {
          created_at?: string
          duration_sec?: number | null
          id?: string
          local_artifact_ref?: string | null
          notes?: string | null
          recorded_at?: string
          script_id: string
          session_id?: string | null
          status?: Database["tongs"]["Enums"]["take_status"]
        }
        Update: {
          created_at?: string
          duration_sec?: number | null
          id?: string
          local_artifact_ref?: string | null
          notes?: string | null
          recorded_at?: string
          script_id?: string
          session_id?: string | null
          status?: Database["tongs"]["Enums"]["take_status"]
        }
        Relationships: [
          {
            foreignKeyName: "recording_takes_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_takes_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "v_scripts_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_takes_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "v_scripts_ready_for_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_takes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "recording_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      script_revisions: {
        Row: {
          body_anvil: string
          created_at: string
          id: string
          revision: number
          script_id: string
        }
        Insert: {
          body_anvil: string
          created_at?: string
          id?: string
          revision: number
          script_id: string
        }
        Update: {
          body_anvil?: string
          created_at?: string
          id?: string
          revision?: number
          script_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_revisions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_revisions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "v_scripts_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_revisions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "v_scripts_ready_for_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
      script_state_overrides: {
        Row: {
          id: string
          overridden_at: string
          overridden_by: string | null
          reason: string | null
          script_id: string
          supersedes_take_ids: string[] | null
          to_state: Database["tongs"]["Enums"]["script_effective_state"]
        }
        Insert: {
          id?: string
          overridden_at?: string
          overridden_by?: string | null
          reason?: string | null
          script_id: string
          supersedes_take_ids?: string[] | null
          to_state: Database["tongs"]["Enums"]["script_effective_state"]
        }
        Update: {
          id?: string
          overridden_at?: string
          overridden_by?: string | null
          reason?: string | null
          script_id?: string
          supersedes_take_ids?: string[] | null
          to_state?: Database["tongs"]["Enums"]["script_effective_state"]
        }
        Relationships: [
          {
            foreignKeyName: "script_state_overrides_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_state_overrides_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "v_scripts_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_state_overrides_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "v_scripts_ready_for_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          base_state: Database["tongs"]["Enums"]["script_base_state"]
          body_anvil: string
          created_at: string
          id: string
          origin_spark_id: string | null
          owner_user_id: string | null
          relevance: Database["tongs"]["Enums"]["script_relevance"]
          revision: number
          title_working: string | null
          updated_at: string
        }
        Insert: {
          base_state?: Database["tongs"]["Enums"]["script_base_state"]
          body_anvil?: string
          created_at?: string
          id?: string
          origin_spark_id?: string | null
          owner_user_id?: string | null
          relevance?: Database["tongs"]["Enums"]["script_relevance"]
          revision?: number
          title_working?: string | null
          updated_at?: string
        }
        Update: {
          base_state?: Database["tongs"]["Enums"]["script_base_state"]
          body_anvil?: string
          created_at?: string
          id?: string
          origin_spark_id?: string | null
          owner_user_id?: string | null
          relevance?: Database["tongs"]["Enums"]["script_relevance"]
          revision?: number
          title_working?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      session_scripts: {
        Row: {
          script_id: string
          selected_at: string
          selected_by: string | null
          session_id: string
        }
        Insert: {
          script_id: string
          selected_at?: string
          selected_by?: string | null
          session_id: string
        }
        Update: {
          script_id?: string
          selected_at?: string
          selected_by?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_scripts_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_scripts_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "v_scripts_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_scripts_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "v_scripts_ready_for_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_scripts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "recording_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          created_by: string | null
          team_id: string
          team_role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          team_id: string
          team_role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          team_id?: string
          team_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ai_keys: {
        Row: {
          created_at: string
          encrypted_api_key: string
          key_label: string | null
          key_version: number
          last_used_at: string | null
          last_validated_at: string | null
          last_validation_status: string | null
          provider: string
          provider_account_id: string | null
          status: string
          updated_at: string
          user_id: string
          validation_mode: string
        }
        Insert: {
          created_at?: string
          encrypted_api_key: string
          key_label?: string | null
          key_version?: number
          last_used_at?: string | null
          last_validated_at?: string | null
          last_validation_status?: string | null
          provider: string
          provider_account_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          validation_mode?: string
        }
        Update: {
          created_at?: string
          encrypted_api_key?: string
          key_label?: string | null
          key_version?: number
          last_used_at?: string | null
          last_validated_at?: string | null
          last_validation_status?: string | null
          provider?: string
          provider_account_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          validation_mode?: string
        }
        Relationships: []
      }
      user_style_profile: {
        Row: {
          adaptation_weight: number
          avg_s1_block_length: number
          avg_s2_block_length: number
          avg_sentence_length: number
          created_at: string
          last_updated: string
          pause_per_1000_words: number
          reflective_pause_ratio: number
          scripts_analyzed_count: number
          sentence_length_variance: number
          structural_intent_vector: Json
          user_id: string
          workspace_id: string
        }
        Insert: {
          adaptation_weight?: number
          avg_s1_block_length?: number
          avg_s2_block_length?: number
          avg_sentence_length?: number
          created_at?: string
          last_updated?: string
          pause_per_1000_words?: number
          reflective_pause_ratio?: number
          scripts_analyzed_count?: number
          sentence_length_variance?: number
          structural_intent_vector?: Json
          user_id: string
          workspace_id: string
        }
        Update: {
          adaptation_weight?: number
          avg_s1_block_length?: number
          avg_s2_block_length?: number
          avg_sentence_length?: number
          created_at?: string
          last_updated?: string
          pause_per_1000_words?: number
          reflective_pause_ratio?: number
          scripts_analyzed_count?: number
          sentence_length_variance?: number
          structural_intent_vector?: Json
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_style_profile_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workpiece_events: {
        Row: {
          correlation_id: string | null
          created_at: string
          event_name: string
          id: number
          payload: Json
          workpiece_id: string
          written_by_lane: string
          written_by_tool: string
          written_by_tool_version: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          event_name: string
          id?: never
          payload?: Json
          workpiece_id: string
          written_by_lane: string
          written_by_tool: string
          written_by_tool_version: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          event_name?: string
          id?: never
          payload?: Json
          workpiece_id?: string
          written_by_lane?: string
          written_by_tool?: string
          written_by_tool_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "workpiece_events_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      workpiece_files: {
        Row: {
          bytes: number
          content_type: string
          created_at: string
          file_type: string
          hash_algo: string
          hash_value: string
          path: string
          revision: number
          storage_bucket: string
          storage_key: string
          updated_at: string
          workpiece_id: string
          written_by_lane: string
          written_by_tool: string
          written_by_tool_version: string
        }
        Insert: {
          bytes: number
          content_type: string
          created_at?: string
          file_type?: string
          hash_algo?: string
          hash_value: string
          path: string
          revision?: number
          storage_bucket?: string
          storage_key: string
          updated_at?: string
          workpiece_id: string
          written_by_lane: string
          written_by_tool: string
          written_by_tool_version: string
        }
        Update: {
          bytes?: number
          content_type?: string
          created_at?: string
          file_type?: string
          hash_algo?: string
          hash_value?: string
          path?: string
          revision?: number
          storage_bucket?: string
          storage_key?: string
          updated_at?: string
          workpiece_id?: string
          written_by_lane?: string
          written_by_tool?: string
          written_by_tool_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "workpiece_files_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      workpiece_jobs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          heartbeat_at: string | null
          id: string
          job_type: string
          lease_expires_at: string | null
          payload_json: Json
          progress_percent: number | null
          requested_by: string
          result_json: Json | null
          runner_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          heartbeat_at?: string | null
          id?: string
          job_type: string
          lease_expires_at?: string | null
          payload_json?: Json
          progress_percent?: number | null
          requested_by: string
          result_json?: Json | null
          runner_id?: string | null
          started_at?: string | null
          status: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          heartbeat_at?: string | null
          id?: string
          job_type?: string
          lease_expires_at?: string | null
          payload_json?: Json
          progress_percent?: number | null
          requested_by?: string
          result_json?: Json | null
          runner_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workpiece_jobs_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workpiece_ready_script_meta: {
        Row: {
          marked_ready_at: string
          marked_ready_by: string
          publish_evidence: Json | null
          script_hash: string | null
          script_path: string
          script_revision: number | null
          transition_id: string | null
          updated_at: string
          updated_by: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          marked_ready_at?: string
          marked_ready_by: string
          publish_evidence?: Json | null
          script_hash?: string | null
          script_path: string
          script_revision?: number | null
          transition_id?: string | null
          updated_at?: string
          updated_by: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          marked_ready_at?: string
          marked_ready_by?: string
          publish_evidence?: Json | null
          script_hash?: string | null
          script_path?: string
          script_revision?: number | null
          transition_id?: string | null
          updated_at?: string
          updated_by?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workpiece_ready_script_meta_transition_id_fkey"
            columns: ["transition_id"]
            isOneToOne: false
            referencedRelation: "workpiece_ready_transition_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_ready_script_meta_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_ready_script_meta_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workpiece_ready_transition_requests: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          publish_evidence: Json
          request_fingerprint: string
          script_hash: string
          script_path: string
          script_revision: number
          transitioned_by: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          publish_evidence: Json
          request_fingerprint: string
          script_hash: string
          script_path: string
          script_revision: number
          transitioned_by: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          publish_evidence?: Json
          request_fingerprint?: string
          script_hash?: string
          script_path?: string
          script_revision?: number
          transitioned_by?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workpiece_ready_transition_requests_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_ready_transition_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_grants: {
        Row: {
          access_role: string
          created_at: string
          created_by: string | null
          team_id: string
          workspace_id: string
        }
        Insert: {
          access_role?: string
          created_at?: string
          created_by?: string | null
          team_id: string
          workspace_id: string
        }
        Update: {
          access_role?: string
          created_at?: string
          created_by?: string | null
          team_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_grants_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_grants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: string
          token: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          email: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          role: string
          token: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: string
          token?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          created_by: string | null
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_ready_queue_state: {
        Row: {
          hidden_at: string | null
          hidden_by: string | null
          queue_rank: number | null
          updated_at: string
          updated_by: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          hidden_at?: string | null
          hidden_by?: string | null
          queue_rank?: number | null
          updated_at?: string
          updated_by: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          hidden_at?: string | null
          hidden_by?: string | null
          queue_rank?: number | null
          updated_at?: string
          updated_by?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_ready_queue_state_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_ready_queue_state_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_style_samples: {
        Row: {
          content: string
          content_chars: number
          content_digest: string
          created_at: string
          id: string
          source_kind: string
          source_label: string | null
          source_path: string | null
          source_workpiece_id: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          content: string
          content_chars?: number
          content_digest: string
          created_at?: string
          id?: string
          source_kind?: string
          source_label?: string | null
          source_path?: string | null
          source_workpiece_id?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          content?: string
          content_chars?: number
          content_digest?: string
          created_at?: string
          id?: string
          source_kind?: string
          source_label?: string | null
          source_path?: string | null
          source_workpiece_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_style_samples_source_workpiece_id_fkey"
            columns: ["source_workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_style_samples_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_thumbnail_brand_templates: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          slug: string
          template_json: Json
          updated_at: string
          updated_by: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          slug: string
          template_json: Json
          updated_at?: string
          updated_by: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          slug?: string
          template_json?: Json
          updated_at?: string
          updated_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_thumbnail_brand_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_writing_profiles: {
        Row: {
          created_at: string
          default_audience: string | null
          default_structure: string | null
          last_used_tone_preset: string | null
          style_notes: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          default_audience?: string | null
          default_structure?: string | null
          last_used_tone_preset?: string | null
          style_notes?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          default_audience?: string | null
          default_structure?: string | null
          last_used_tone_preset?: string | null
          style_notes?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_writing_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          adaptive_style_ai_accelerate_enabled: boolean
          adaptive_style_alignment_enabled: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          adaptive_style_ai_accelerate_enabled?: boolean
          adaptive_style_alignment_enabled?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          adaptive_style_ai_accelerate_enabled?: boolean
          adaptive_style_alignment_enabled?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      current_workpiece_ready_scripts: {
        Row: {
          marked_ready_at: string | null
          marked_ready_by: string | null
          publish_evidence: Json | null
          script_hash: string | null
          script_path: string | null
          script_revision: number | null
          script_updated_at: string | null
          transition_id: string | null
          workpiece_id: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workpiece_ready_script_meta_transition_id_fkey"
            columns: ["transition_id"]
            isOneToOne: false
            referencedRelation: "workpiece_ready_transition_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_ready_script_meta_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_ready_script_meta_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      current_workpiece_recorded_takes: {
        Row: {
          capture_session_id: string | null
          completed_at: string | null
          completed_by: string | null
          completion_evidence: Json | null
          completion_id: string | null
          decision_evidence: Json | null
          keep_id: string | null
          kept_at: string | null
          kept_by: string | null
          media_hash: string | null
          media_path: string | null
          media_revision: number | null
          ready_transition_id: string | null
          script_hash: string | null
          script_revision: number | null
          workpiece_id: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anvil_recording_completion_requests_ready_transition_id_fkey"
            columns: ["ready_transition_id"]
            isOneToOne: false
            referencedRelation: "workpiece_ready_transition_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anvil_recording_completion_requests_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anvil_recording_completion_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ai_keys_safe: {
        Row: {
          created_at: string | null
          provider: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          provider?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          provider?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_calendar_events: {
        Row: {}
        Relationships: []
      }
      v_scripts_effective: {
        Row: {
          base_state: Database["tongs"]["Enums"]["script_base_state"] | null
          body_anvil: string | null
          created_at: string | null
          effective_state:
            | Database["tongs"]["Enums"]["script_effective_state"]
            | null
          effective_state_overridden_at: string | null
          id: string | null
          origin_spark_id: string | null
          owner_user_id: string | null
          relevance: Database["tongs"]["Enums"]["script_relevance"] | null
          revision: number | null
          title_working: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      v_scripts_ready_for_schedule: {
        Row: {
          base_state: Database["tongs"]["Enums"]["script_base_state"] | null
          body_anvil: string | null
          created_at: string | null
          effective_state:
            | Database["tongs"]["Enums"]["script_effective_state"]
            | null
          effective_state_overridden_at: string | null
          id: string | null
          origin_spark_id: string | null
          owner_user_id: string | null
          relevance: Database["tongs"]["Enums"]["script_relevance"] | null
          revision: number | null
          title_working: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _first_token: { Args: { txt: string }; Returns: string }
      _insert_missing_org_members_from_teams: {
        Args: { p_org_id?: string }
        Returns: number
      }
      _sanitize_keyword: { Args: { raw: string }; Returns: string }
      accept_workspace_invite: {
        Args: { p_token: string }
        Returns: {
          membership_created: boolean
          role: string
          workspace_id: string
        }[]
      }
      add_my_style_sample: {
        Args: {
          p_content?: string
          p_source_kind?: string
          p_source_label?: string
          p_source_path?: string
          p_source_workpiece_id?: string
          p_workspace_id: string
        }
        Returns: {
          content: string
          content_chars: number
          created_at: string
          sample_id: string
          source_kind: string
          source_label: string
          source_path: string
          source_workpiece_id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }[]
      }
      add_team_member: {
        Args: { p_team_id: string; p_team_role?: string; p_user_id: string }
        Returns: {
          created_at: string
          created_by: string
          team_id: string
          team_role: string
          user_email: string
          user_id: string
        }[]
      }
      add_team_member_by_email: {
        Args: { p_email: string; p_team_id: string; p_team_role?: string }
        Returns: {
          created_at: string
          created_by: string
          team_id: string
          team_role: string
          user_email: string
          user_id: string
        }[]
      }
      admin_get_ai_usage_export_rows: {
        Args: { p_days?: number; p_limit?: number; p_org_id: string }
        Returns: {
          action_id: string
          actual_cost_usd: number
          billable_tokens: number
          created_at: string
          effective_ai_key_source: string
          effective_billing_lane: string
          estimated_cost_usd: number
          feature: string
          key_resolution_status: string
          lane: string
          model: string
          policy_decision_type: string
          provider: string
          status: string
          subfeature: string
          user_id: string
          workspace_id: string
        }[]
      }
      admin_get_ai_usage_overview: {
        Args: { p_org_id: string }
        Returns: {
          total_actual_cost_today: number
          total_billable_tokens_today: number
          total_estimated_cost_today: number
          total_usage_today: number
          usage_by_feature: Json
          usage_by_lane: Json
        }[]
      }
      admin_get_ai_usage_overview_window: {
        Args: { p_days?: number; p_org_id: string }
        Returns: {
          total_actual_cost: number
          total_billable_tokens: number
          total_estimated_cost: number
          total_usage: number
          usage_by_feature: Json
          usage_by_lane: Json
        }[]
      }
      admin_get_user_ai_inspection: {
        Args: {
          p_org_id: string
          p_target_user_id: string
          p_workspace_id?: string
        }
        Returns: {
          active_plan_code: string
          byo_configured: boolean
          byo_provider: string
          effective_ai_key_source: string
          effective_policy_snapshot: Json
          fallback_available: boolean
          fallback_used: boolean
          founders_club_flag: boolean
          is_founder_entitled: boolean
          is_studio_entitled: boolean
          member_allow_heavy_tasks: boolean
          member_mode_override: Database["tongs"]["Enums"]["ai_mode"]
          org_member_byo_allowed: boolean
          org_policy_default_mode: Database["tongs"]["Enums"]["ai_mode"]
          org_role: string
          org_shared_ai_enabled: boolean
          org_toolbox_allowed: boolean
          policy_decision_type: Database["tongs"]["Enums"]["ai_decision_type"]
          policy_reason_code: string
          profile_tier: string
          selected_funding_source: Database["tongs"]["Enums"]["ai_funding_source"]
          target_user_id: string
          workspace_role: string
        }[]
      }
      admin_list_ai_usage_events: {
        Args: { p_limit?: number; p_org_id: string; p_user_id?: string }
        Returns: {
          action_id: string
          actual_cost_usd: number
          billable_tokens: number
          created_at: string
          effective_ai_key_source: string
          effective_billing_lane: string
          estimated_cost_usd: number
          feature: string
          key_resolution_status: string
          lane: string
          model: string
          policy_decision_type: string
          provider: string
          status: string
          subfeature: string
          user_id: string
          workspace_id: string
        }[]
      }
      admin_set_org_shared_ai_enabled: {
        Args: { p_enabled: boolean; p_org_id: string }
        Returns: {
          default_mode: Database["tongs"]["Enums"]["ai_mode"]
          member_byo_allowed: boolean
          org_id: string
          shared_org_ai_enabled: boolean
        }[]
      }
      anvil_transition_take_completed: {
        Args: {
          p_capture_session_id: string
          p_completion_evidence: Json
          p_expected_media_hash: string
          p_expected_media_revision: number
          p_expected_script_hash: string
          p_expected_script_revision: number
          p_idempotency_key: string
          p_media_path: string
          p_ready_transition_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      anvil_transition_take_kept: {
        Args: {
          p_capture_session_id: string
          p_completion_id: string
          p_decision_evidence: Json
          p_idempotency_key: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      append_bellows_session_checkpoint: {
        Args: {
          p_acting_authority_state?: string
          p_acting_host_participant_id?: string
          p_actor_id?: string
          p_actor_type?: string
          p_archived_at?: string
          p_broadcast_state?: string
          p_checkpoint_kind: string
          p_co_host_participant_ids?: string[]
          p_delta?: Json
          p_effect_type?: string
          p_ended_at?: string
          p_event_count?: number
          p_follow_up_action_source?: string
          p_follow_up_action_type?: string
          p_host_participant_id?: string
          p_integrity_flags?: string[]
          p_lifecycle_state?: string
          p_occurred_at?: string
          p_offset_ms?: number
          p_outcome?: string
          p_recording_state?: string
          p_seal_state?: string
          p_sealed_at?: string
          p_session_id: string
          p_session_snapshot?: Json
          p_snapshot_schema_version?: number
          p_started_at?: string
          p_trigger_action_source: string
          p_trigger_action_type: string
          p_upload_state?: string
        }
        Returns: {
          acting_authority_state: string
          acting_host_participant_id: string | null
          actor_id: string | null
          actor_type: string | null
          broadcast_state: string
          checkpoint_kind: string
          co_host_participant_ids: string[]
          delta: Json | null
          effect_type: string | null
          event_count: number
          follow_up_action_source: string | null
          follow_up_action_type: string | null
          host_participant_id: string | null
          id: string
          integrity_flags: string[]
          lifecycle_state: string
          occurred_at: string | null
          offset_ms: number | null
          outcome: string | null
          recorded_at: string
          recording_state: string
          seal_state: string
          sequence_no: number
          session_id: string
          session_snapshot: Json
          snapshot_schema_version: number
          trigger_action_source: string
          trigger_action_type: string
          upload_state: string
        }
        SetofOptions: {
          from: "*"
          to: "bellows_session_checkpoints"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_ai_token_delta:
        | {
            Args: {
              p_delta: number
              p_reason?: string
              p_request_id?: string
              p_user_id: string
            }
            Returns: {
              billing_mode: string
              created_at: string
              token_balance: number
              token_monthly_limit: number | null
              updated_at: string
              user_id: string
            }
            SetofOptions: {
              from: "*"
              to: "ai_credits"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_delta: number
              p_provider_request_id?: string
              p_reason: string
              p_request_id: string
              p_user_id: string
            }
            Returns: {
              billing_mode: string
              token_balance: number
            }[]
          }
      archive_my_thumbnail_brand_template: {
        Args: { p_template_id: string; p_workspace_id: string }
        Returns: {
          archived_at: string
          created_at: string
          is_default: boolean
          name: string
          slug: string
          template_id: string
          template_json: Json
          updated_at: string
          updated_by: string
          workspace_id: string
        }[]
      }
      assert_org_role: {
        Args: { p_min_role?: string; p_org_id: string }
        Returns: string
      }
      assert_workspace_role: {
        Args: { _min_role: string; _workspace_id: string }
        Returns: undefined
      }
      barstock_apply_assignment: {
        Args: {
          p_expected_revision?: number
          p_import_key?: string
          p_row: Json
        }
        Returns: Json
      }
      barstock_apply_spark: {
        Args: {
          p_expected_revision?: number
          p_import_key?: string
          p_row: Json
        }
        Returns: Json
      }
      barstock_archive_assignment: {
        Args: {
          p_expected_revision: number
          p_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      barstock_archive_spark: {
        Args: {
          p_expected_revision: number
          p_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      barstock_delete_assignment: {
        Args: {
          p_expected_revision: number
          p_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      billing_item_is_plan: { Args: { p_item_id: string }; Returns: boolean }
      billing_plan_base_storage_bytes: {
        Args: { p_plan_item_id: string }
        Returns: number
      }
      billing_status_entitles_access: {
        Args: { p_status: string }
        Returns: boolean
      }
      billing_storage_entitled_bytes: {
        Args: { p_item_id: string }
        Returns: number
      }
      billing_storage_entitlement_active: {
        Args: { p_current_period_end: string; p_status: string }
        Returns: boolean
      }
      blend_structural_intent_vector: {
        Args: { p_existing: Json; p_incoming: Json; p_weight: number }
        Returns: Json
      }
      can_access_workpiece: {
        Args: { _workpiece_id: string }
        Returns: boolean
      }
      can_access_workspace: {
        Args: { _workspace_id: string }
        Returns: boolean
      }
      can_admin_org_workspace_members: {
        Args: { _workspace_id: string }
        Returns: boolean
      }
      connect_user_ai_key: {
        Args: {
          p_encrypted_api_key: string
          p_key_label?: string
          p_key_version?: number
          p_last_validated_at?: string
          p_last_validation_status?: string
          p_provider: string
          p_provider_account_id?: string
          p_validation_mode?: string
        }
        Returns: {
          connected: boolean
          created_at: string
          key_label: string
          key_version: number
          last_validated_at: string
          last_validation_status: string
          provider: string
          provider_account_id: string
          status: string
          updated_at: string
          validation_mode: string
        }[]
      }
      count_missing_org_members_for_org: {
        Args: { p_org_id: string }
        Returns: {
          missing_members_count: number
        }[]
      }
      create_bellows_join_link: {
        Args: {
          p_created_by_user_id?: string
          p_expires_hours?: number
          p_max_uses?: number
          p_role_code?: string
          p_session_id: string
        }
        Returns: {
          created_at: string
          expires_at: string
          join_link_id: string
          last_used_at: string
          max_uses: number
          revoked_at: string
          role_code: string
          session_id: string
          token: string
          use_count: number
          workspace_id: string
        }[]
      }
      create_bellows_session_header: {
        Args: {
          p_acting_authority_state: string
          p_acting_host_participant_id?: string
          p_archived_at?: string
          p_broadcast_state?: string
          p_calendar_event_id?: string
          p_co_host_participant_ids?: string[]
          p_ended_at?: string
          p_host_participant_id?: string
          p_host_user_id: string
          p_integrity_flags?: string[]
          p_lifecycle_state?: string
          p_mode: string
          p_outcome?: string
          p_recording_session_id?: string
          p_recording_state?: string
          p_seal_state?: string
          p_sealed_at?: string
          p_session_id: string
          p_session_type: string
          p_snapshot_schema_version?: number
          p_started_at?: string
          p_title: string
          p_upload_state?: string
          p_workspace_id: string
        }
        Returns: {
          acting_authority_state: string
          acting_host_participant_id: string | null
          archived_at: string | null
          broadcast_state: string
          calendar_event_id: string | null
          co_host_participant_ids: string[]
          created_at: string
          ended_at: string | null
          host_participant_id: string | null
          host_user_id: string
          id: string
          integrity_flags: string[]
          latest_checkpoint_id: string | null
          lifecycle_state: string
          mode: string
          outcome: string | null
          recording_session_id: string | null
          recording_state: string
          seal_state: string
          sealed_at: string | null
          session_type: string
          snapshot_schema_version: number
          started_at: string | null
          title: string
          updated_at: string
          upload_state: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "bellows_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_my_thumbnail_brand_template: {
        Args: {
          p_is_default?: boolean
          p_name: string
          p_slug: string
          p_template_json: Json
          p_workspace_id: string
        }
        Returns: {
          archived_at: string
          created_at: string
          is_default: boolean
          name: string
          slug: string
          template_id: string
          template_json: Json
          updated_at: string
          updated_by: string
          workspace_id: string
        }[]
      }
      create_org_team: {
        Args: { p_name: string; p_org_id: string }
        Returns: {
          created_at: string
          org_id: string
          team_id: string
          team_name: string
          updated_at: string
        }[]
      }
      create_recording_session: {
        Args: {
          p_calendar_event_id?: string
          p_created_by: string
          p_title: string
          p_workspace_id: string
        }
        Returns: {
          calendar_event_id: string | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          notes: string | null
          session_type: Database["tongs"]["Enums"]["session_type"]
          starts_at: string
          status: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "recording_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_workspace: { Args: { p_name: string }; Returns: string }
      create_workspace_admin: {
        Args: { p_name: string; p_owner_id: string }
        Returns: string
      }
      create_workspace_invite: {
        Args: {
          p_email: string
          p_expires_hours?: number
          p_role?: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          email: string
          expires_at: string
          invite_id: string
          role: string
          token: string
          workspace_id: string
        }[]
      }
      create_workspace_with_owner: {
        Args: { _name?: string }
        Returns: {
          created_at: string
          created_by: string
          id: string
          name: string
        }[]
      }
      delete_org_team: {
        Args: { p_team_id: string }
        Returns: {
          deleted: boolean
          org_id: string
          team_id: string
        }[]
      }
      delete_workspace_with_owner_check: {
        Args: { _workspace_id: string }
        Returns: {
          deleted: boolean
          workspace_id: string
        }[]
      }
      disconnect_user_ai_key: {
        Args: { p_provider: string; p_provider_account_id?: string }
        Returns: {
          connected: boolean
          provider: string
          provider_account_id: string
          status: string
          updated_at: string
        }[]
      }
      ensure_personal_org: { Args: { p_user_id?: string }; Returns: string }
      episode_label_from_spark: {
        Args: {
          spark_body: string
          spark_created_at: string
          spark_title: string
        }
        Returns: string
      }
      get_my_ai_credits: {
        Args: never
        Returns: {
          billing_mode: string
          token_balance: number
        }[]
      }
      get_my_ai_key_status: {
        Args: { p_provider?: string }
        Returns: {
          connected: boolean
          created_at: string
          key_label: string
          key_version: number
          last_used_at: string
          last_validated_at: string
          last_validation_status: string
          provider: string
          provider_account_id: string
          status: string
          updated_at: string
          validation_mode: string
        }[]
      }
      get_my_ai_spend_rollup: {
        Args: { p_days?: number; p_lane?: string }
        Returns: {
          call_count: number
          day: string
          deduped_action_count: number
          feature: string
          lane: string
          subfeature: string
          total_actual_cost_usd: number
          total_billable_tokens: number
        }[]
      }
      get_my_ai_top_actions: {
        Args: { p_days?: number; p_lane?: string; p_limit?: number }
        Returns: {
          action_key: string
          call_count: number
          feature: string
          lane: string
          last_seen_at: string
          subfeature: string
          total_actual_cost_usd: number
          total_billable_tokens: number
        }[]
      }
      get_my_henry_message_state: {
        Args: { p_workspace_id: string }
        Returns: {
          cooldown_until: string
          dismiss_count: number
          last_dismissed_at: string
          last_seen_at: string
          message_id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }[]
      }
      get_my_henry_preferences: {
        Args: { p_workspace_id: string }
        Returns: {
          hide_tips: boolean
          muted_until: string
          open_last_tab: boolean
          show_henry: boolean
          updated_at: string
          user_id: string
          workspace_id: string
        }[]
      }
      get_my_style_profile: {
        Args: { p_workspace_id: string }
        Returns: {
          adaptation_weight: number
          avg_s1_block_length: number
          avg_s2_block_length: number
          avg_sentence_length: number
          last_updated: string
          pause_per_1000_words: number
          reflective_pause_ratio: number
          scripts_analyzed_count: number
          sentence_length_variance: number
          structural_intent_vector: Json
          user_id: string
          workspace_id: string
        }[]
      }
      get_my_workspace_features: {
        Args: { p_workspace_id: string }
        Returns: {
          adaptive_style_ai_accelerate_enabled: boolean
          adaptive_style_alignment_enabled: boolean
          workspace_id: string
        }[]
      }
      get_my_workspace_role: {
        Args: { _workspace_id: string }
        Returns: string
      }
      get_my_writing_profile: {
        Args: { p_workspace_id: string }
        Returns: {
          default_audience: string
          default_structure: string
          last_used_tone_preset: string
          style_notes: string
          updated_at: string
          user_id: string
          workspace_id: string
        }[]
      }
      get_or_create_creator_profile: {
        Args: never
        Returns: {
          clarify_first_bias: number
          confidence: number
          outline_first_bias: number
          profile_json: Json
          risk_sensitivity: number
          script_first_bias: number
          tone_style: string
          updated_at: string
          user_id: string
        }[]
      }
      get_or_create_my_personal_org_id: {
        Args: never
        Returns: {
          org_id: string
        }[]
      }
      get_user_ai_key_for_resolution: {
        Args: {
          p_provider: string
          p_provider_account_id?: string
          p_user_id: string
        }
        Returns: {
          encrypted_api_key: string
          key_version: number
          last_validated_at: string
          last_validation_status: string
          provider: string
          provider_account_id: string
          status: string
          user_id: string
          validation_mode: string
        }[]
      }
      get_workspace_invite_preview: {
        Args: { p_token: string }
        Returns: {
          email: string
          expires_at: string
          role: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      grant_ai_credits: {
        Args: {
          p_amount_total?: number
          p_currency?: string
          p_event_id: string
          p_pack_id: string
          p_session_id: string
          p_tokens: number
          p_user_id: string
        }
        Returns: undefined
      }
      grant_plan_cycle_ai_credits: {
        Args: {
          p_period_end?: string
          p_period_start: string
          p_plan_item_id: string
          p_source_event_id?: string
          p_stripe_subscription_id: string
          p_user_id: string
        }
        Returns: number
      }
      has_workspace_role:
        | {
            Args: { _min_role: string; _workspace_id: string }
            Returns: boolean
          }
        | {
            Args: { p_roles: string[]; p_workspace_id: string }
            Returns: boolean
          }
      hash_bellows_join_link_token: {
        Args: { p_token: string }
        Returns: string
      }
      hearth_transition_script_ready: {
        Args: {
          p_expected_script_hash: string
          p_expected_script_revision: number
          p_idempotency_key: string
          p_publish_evidence: Json
          p_script_path: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      is_workspace_admin: { Args: { ws: string }; Returns: boolean }
      is_workspace_member: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      leave_workspace: {
        Args: { p_workspace_id: string }
        Returns: {
          left_workspace: boolean
          user_id: string
          workspace_id: string
        }[]
      }
      list_my_orgs: {
        Args: never
        Returns: {
          created_at: string
          my_org_role: string
          org_id: string
          org_name: string
        }[]
      }
      list_my_recent_script_references: {
        Args: { p_limit?: number; p_workspace_id: string }
        Returns: {
          marked_ready_at: string
          script_path: string
          title: string
          workpiece_id: string
          workspace_id: string
        }[]
      }
      list_my_style_samples: {
        Args: { p_limit?: number; p_workspace_id: string }
        Returns: {
          content: string
          content_chars: number
          created_at: string
          sample_id: string
          source_kind: string
          source_label: string
          source_path: string
          source_workpiece_id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }[]
      }
      list_my_thumbnail_brand_templates: {
        Args: { p_include_archived?: boolean; p_workspace_id: string }
        Returns: {
          archived_at: string
          created_at: string
          is_default: boolean
          name: string
          slug: string
          template_id: string
          template_json: Json
          updated_at: string
          updated_by: string
          workspace_id: string
        }[]
      }
      list_my_workspace_access: {
        Args: never
        Returns: {
          created_at: string
          org_id: string
          org_name: string
          role: string
          source_type: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      list_my_workspaces: {
        Args: never
        Returns: {
          created_at: string
          role: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      list_org_members: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string
          created_by: string
          org_id: string
          org_role: string
          user_email: string
          user_id: string
        }[]
      }
      list_org_teams: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string
          member_count: number
          org_id: string
          team_id: string
          team_name: string
          updated_at: string
        }[]
      }
      list_team_members: {
        Args: { p_team_id: string }
        Returns: {
          created_at: string
          created_by: string
          team_id: string
          team_role: string
          user_email: string
          user_id: string
        }[]
      }
      list_workspace_invites: {
        Args: { p_only_pending?: boolean; p_workspace_id: string }
        Returns: {
          accepted_at: string
          created_at: string
          created_by: string
          created_by_email: string
          email: string
          expires_at: string
          id: string
          revoked_at: string
          role: string
          workspace_id: string
        }[]
      }
      list_workspace_members: {
        Args: { p_workspace_id: string }
        Returns: {
          created_at: string
          created_by: string
          created_by_email: string
          role: string
          user_email: string
          user_id: string
          workspace_id: string
        }[]
      }
      mark_bellows_session_latest_checkpoint: {
        Args: { p_checkpoint_id: string; p_session_id: string }
        Returns: {
          acting_authority_state: string
          acting_host_participant_id: string | null
          archived_at: string | null
          broadcast_state: string
          calendar_event_id: string | null
          co_host_participant_ids: string[]
          created_at: string
          ended_at: string | null
          host_participant_id: string | null
          host_user_id: string
          id: string
          integrity_flags: string[]
          latest_checkpoint_id: string | null
          lifecycle_state: string
          mode: string
          outcome: string | null
          recording_session_id: string | null
          recording_state: string
          seal_state: string
          sealed_at: string | null
          session_type: string
          snapshot_schema_version: number
          started_at: string | null
          title: string
          updated_at: string
          upload_state: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "bellows_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      org_role_rank: { Args: { p_role: string }; Returns: number }
      plan_included_ai_credits: {
        Args: { p_plan_item_id: string }
        Returns: number
      }
      recompute_account_balance: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      record_billing_event: {
        Args: {
          p_event_type: string
          p_livemode?: boolean
          p_payload?: Json
          p_stripe_customer_id?: string
          p_stripe_event_id: string
          p_stripe_session_id?: string
          p_stripe_subscription_id?: string
          p_user_id?: string
        }
        Returns: undefined
      }
      record_hearth_event: {
        Args: { p_episode_id?: string; p_event_type: string; p_payload?: Json }
        Returns: string
      }
      remove_team_member: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: {
          old_team_role: string
          removed: boolean
          team_id: string
          user_id: string
        }[]
      }
      remove_workspace_member: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          removed: boolean
          user_id: string
          workspace_id: string
        }[]
      }
      rename_org_team: {
        Args: { p_name: string; p_team_id: string }
        Returns: {
          created_at: string
          org_id: string
          team_id: string
          team_name: string
          updated_at: string
        }[]
      }
      repair_org_members_from_teams: {
        Args: { p_org_id: string }
        Returns: {
          repaired_members_count: number
        }[]
      }
      replace_recording_session_items: {
        Args: { p_items: Json; p_session_id: string }
        Returns: {
          created_at: string
          episode_id: string
          id: string
          position: number
          script_path: string
          session_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "recording_session_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reset_my_style_profile: {
        Args: { p_workspace_id: string }
        Returns: {
          reset: boolean
          user_id: string
          workspace_id: string
        }[]
      }
      reset_my_writing_profile: {
        Args: { p_workspace_id: string }
        Returns: {
          default_audience: string
          default_structure: string
          last_used_tone_preset: string
          style_notes: string
          updated_at: string
          user_id: string
          workspace_id: string
        }[]
      }
      resolve_ai_policy: {
        Args: {
          p_action?: string
          p_estimated_cost_usd?: number
          p_feature?: string
          p_model?: string
          p_org_ai_available?: boolean
          p_org_id: string
          p_personal_ai_configured?: boolean
          p_provider?: string
          p_request_id?: string
          p_requested_funding_source?: Database["tongs"]["Enums"]["ai_funding_source"]
          p_requested_mode?: Database["tongs"]["Enums"]["ai_mode"]
          p_tool: string
          p_user_id: string
          p_workspace_id: string
          p_write_ledger?: boolean
        }
        Returns: {
          decision_type: Database["tongs"]["Enums"]["ai_decision_type"]
          effective_policy_snapshot: Json
          fallback_available: boolean
          fallback_used: boolean
          reason_code: string
          selected_funding_source: Database["tongs"]["Enums"]["ai_funding_source"]
        }[]
      }
      resolve_ai_policy_legacy: {
        Args: {
          p_action?: string
          p_estimated_cost_usd?: number
          p_feature?: string
          p_model?: string
          p_org_ai_available?: boolean
          p_org_id: string
          p_personal_ai_configured?: boolean
          p_provider?: string
          p_request_id?: string
          p_requested_funding_source?: Database["tongs"]["Enums"]["ai_funding_source"]
          p_requested_mode?: Database["tongs"]["Enums"]["ai_mode"]
          p_tool: string
          p_user_id: string
          p_workspace_id: string
          p_write_ledger?: boolean
        }
        Returns: {
          decision_type: Database["tongs"]["Enums"]["ai_decision_type"]
          effective_policy_snapshot: Json
          fallback_available: boolean
          fallback_used: boolean
          reason_code: string
          selected_funding_source: Database["tongs"]["Enums"]["ai_funding_source"]
        }[]
      }
      resolve_bellows_join_link: {
        Args: { p_session_id: string; p_token: string }
        Returns: {
          expires_at: string
          host_user_id: string
          join_link_id: string
          last_used_at: string
          lifecycle_state: string
          max_uses: number
          resolved_at: string
          role_code: string
          session_id: string
          title: string
          use_count: number
          workspace_id: string
        }[]
      }
      resolve_membership_entitlement: {
        Args: { p_org_id: string; p_user_id: string; p_workspace_id?: string }
        Returns: {
          active_plan_code: string
          founders_club_flag: boolean
          is_founder_entitled: boolean
          is_studio_entitled: boolean
          org_role: string
          org_toolbox_allowed: boolean
          profile_tier: string
          source_meta: Json
          workspace_role: string
        }[]
      }
      resolve_org_user_by_email: {
        Args: { p_email: string; p_org_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      revoke_bellows_join_link: {
        Args: { p_join_link_id: string }
        Returns: {
          join_link_id: string
          revoked: boolean
        }[]
      }
      revoke_workspace_invite: {
        Args: { p_invite_id: string }
        Returns: {
          invite_id: string
          revoked: boolean
        }[]
      }
      seed_my_thumbnail_brand_templates: {
        Args: { p_workspace_id: string }
        Returns: {
          inserted_count: number
        }[]
      }
      set_adaptive_style_features: {
        Args: {
          p_ai_accelerate_enabled: boolean
          p_alignment_enabled: boolean
          p_workspace_id: string
        }
        Returns: {
          adaptive_style_ai_accelerate_enabled: boolean
          adaptive_style_alignment_enabled: boolean
          workspace_id: string
        }[]
      }
      set_my_writing_profile: {
        Args: {
          p_default_audience?: string
          p_default_structure?: string
          p_style_notes?: string
          p_workspace_id: string
        }
        Returns: {
          default_audience: string
          default_structure: string
          last_used_tone_preset: string
          style_notes: string
          updated_at: string
          user_id: string
          workspace_id: string
        }[]
      }
      set_my_writing_tone_preset: {
        Args: { p_tone_preset: string; p_workspace_id: string }
        Returns: {
          default_audience: string
          default_structure: string
          last_used_tone_preset: string
          style_notes: string
          updated_at: string
          user_id: string
          workspace_id: string
        }[]
      }
      sync_legacy_profile_from_account_balance: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      track_henry_event: {
        Args: {
          p_event_name: string
          p_metadata?: Json
          p_surface: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      update_creator_profile_from_event: {
        Args: { p_event_type: string; p_payload?: Json }
        Returns: {
          clarify_first_bias: number
          confidence: number
          outline_first_bias: number
          risk_sensitivity: number
          script_first_bias: number
          tone_style: string
          user_id: string
        }[]
      }
      update_my_thumbnail_brand_template: {
        Args: {
          p_is_default?: boolean
          p_name?: string
          p_template_id: string
          p_template_json?: Json
          p_workspace_id: string
        }
        Returns: {
          archived_at: string
          created_at: string
          is_default: boolean
          name: string
          slug: string
          template_id: string
          template_json: Json
          updated_at: string
          updated_by: string
          workspace_id: string
        }[]
      }
      update_workspace_member_role: {
        Args: { p_role: string; p_user_id: string; p_workspace_id: string }
        Returns: {
          role: string
          user_id: string
          workspace_id: string
        }[]
      }
      upsert_billing_customer: {
        Args: {
          p_customer_name?: string
          p_email?: string
          p_metadata?: Json
          p_stripe_customer_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      upsert_billing_one_time_purchase: {
        Args: {
          p_amount_total?: number
          p_currency?: string
          p_item_id: string
          p_metadata?: Json
          p_payment_intent_id?: string
          p_purchase_type: string
          p_status: string
          p_stripe_customer_id: string
          p_stripe_event_id: string
          p_stripe_session_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      upsert_billing_subscription: {
        Args: {
          p_cancel_at_period_end?: boolean
          p_canceled_at?: string
          p_current_period_end?: string
          p_current_period_start?: string
          p_interval: string
          p_item_id: string
          p_metadata?: Json
          p_price_id?: string
          p_purchase_type: string
          p_status: string
          p_stripe_customer_id: string
          p_stripe_subscription_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      upsert_my_henry_message_state: {
        Args: {
          p_cooldown_until: string
          p_increment_dismiss?: number
          p_last_dismissed_at: string
          p_last_seen_at: string
          p_message_id: string
          p_workspace_id: string
        }
        Returns: {
          cooldown_until: string
          dismiss_count: number
          last_dismissed_at: string
          last_seen_at: string
          message_id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }[]
      }
      upsert_my_henry_preferences: {
        Args: {
          p_hide_tips: boolean
          p_muted_until: string
          p_open_last_tab: boolean
          p_show_henry: boolean
          p_workspace_id: string
        }
        Returns: {
          hide_tips: boolean
          muted_until: string
          open_last_tab: boolean
          show_henry: boolean
          updated_at: string
          user_id: string
          workspace_id: string
        }[]
      }
      upsert_script_draft_v1: {
        Args: {
          p_base_state: Database["tongs"]["Enums"]["script_base_state"]
          p_body_anvil: string
          p_origin_spark_id: string
          p_relevance: Database["tongs"]["Enums"]["script_relevance"]
          p_revision: number
          p_script_id: string
          p_title_working: string
        }
        Returns: {
          revision: number
          script_id: string
          updated_at: string
        }[]
      }
      upsert_style_profile_metrics: {
        Args: {
          p_adaptation_weight?: number
          p_avg_s1_block_length: number
          p_avg_s2_block_length: number
          p_avg_sentence_length: number
          p_pause_per_1000_words: number
          p_reflective_pause_ratio: number
          p_sentence_length_variance: number
          p_structural_intent_vector?: Json
          p_workspace_id: string
        }
        Returns: {
          adaptation_weight: number
          avg_s1_block_length: number
          avg_s2_block_length: number
          avg_sentence_length: number
          last_updated: string
          pause_per_1000_words: number
          reflective_pause_ratio: number
          scripts_analyzed_count: number
          sentence_length_variance: number
          structural_intent_vector: Json
          user_id: string
          workspace_id: string
        }[]
      }
      workspace_is_creator: {
        Args: { _workspace_id: string }
        Returns: boolean
      }
      workspace_is_member: { Args: { _workspace_id: string }; Returns: boolean }
      workspace_is_owner: { Args: { _workspace_id: string }; Returns: boolean }
      workspace_role_rank: { Args: { _role: string }; Returns: number }
    }
    Enums: {
      ai_decision_type: "ALLOW" | "SOFT_DENY" | "HARD_DENY"
      ai_funding_source:
        | "org_byo_key"
        | "org_shared_credits"
        | "personal_byo_key"
        | "personal_credits"
        | "forge_managed_credits"
      ai_mode:
        | "AI_DISABLED"
        | "ORG_ONLY"
        | "PERSONAL_ONLY"
        | "ORG_FIRST_PERSONAL_FALLBACK"
      script_base_state: "warming" | "ready"
      script_effective_state: "warming" | "ready" | "scheduled" | "recorded"
      script_relevance:
        | "hot_topic"
        | "current_events"
        | "evergreen"
        | "series"
        | "other"
      session_type: "recording" | "rehearsal"
      take_status: "unreviewed" | "kept" | "discarded"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  tongs: {
    Enums: {
      ai_decision_type: ["ALLOW", "SOFT_DENY", "HARD_DENY"],
      ai_funding_source: [
        "org_byo_key",
        "org_shared_credits",
        "personal_byo_key",
        "personal_credits",
        "forge_managed_credits",
      ],
      ai_mode: [
        "AI_DISABLED",
        "ORG_ONLY",
        "PERSONAL_ONLY",
        "ORG_FIRST_PERSONAL_FALLBACK",
      ],
      script_base_state: ["warming", "ready"],
      script_effective_state: ["warming", "ready", "scheduled", "recorded"],
      script_relevance: [
        "hot_topic",
        "current_events",
        "evergreen",
        "series",
        "other",
      ],
      session_type: ["recording", "rehearsal"],
      take_status: ["unreviewed", "kept", "discarded"],
    },
  },
} as const
