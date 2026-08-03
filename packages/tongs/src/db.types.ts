export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      workspaces: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string | null
          name: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          name?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  tongs: {
    Tables: {
      account_balances: {
        Row: {
          ai_credit_balance: number
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
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_credit_balance?: number
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
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_credit_balance?: number
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
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_mode?: string
          created_at?: string
          token_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_mode?: string
          created_at?: string
          token_balance?: number
          updated_at?: string
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
            referencedRelation: "recording_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "workpiece_ready_transition_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anvil_recording_completion_requests_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anvil_recording_completion_requests_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "anvil_recording_completion_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anvil_recording_keep_requests_completion_id_fkey"
            columns: ["completion_id"]
            referencedRelation: "current_workpiece_recorded_takes"
            referencedColumns: ["completion_id"]
          },
          {
            foreignKeyName: "anvil_recording_keep_requests_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anvil_recording_keep_requests_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_supersedes_asset_id_fkey"
            columns: ["supersedes_asset_id"]
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_workspace_id_fkey"
            columns: ["workspace_id"]
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
          id: string
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
        Relationships: [
          {
            foreignKeyName: "barstock_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "barstock_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barstock_project_episode_links_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barstock_project_episode_links_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      barstock_sparks: {
        Row: {
          assignment_id: string | null
          body: string
          created_at: string
          created_by: string
          deleted_at: string | null
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
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id: string
          import_key?: string | null
          pinned?: boolean
          revision?: number
          source?: string
          status?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assignment_id?: string | null
          body?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
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
            referencedRelation: "barstock_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barstock_sparks_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "bellows_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bellows_session_join_links_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bellows_sessions_latest_checkpoint_belongs_to_session_fkey"
            columns: ["id", "latest_checkpoint_id"]
            referencedRelation: "bellows_session_checkpoints"
            referencedColumns: ["session_id", "id"]
          },
          {
            foreignKeyName: "bellows_sessions_recording_session_id_fkey"
            columns: ["recording_session_id"]
            referencedRelation: "recording_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bellows_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
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
      brand_asset_revisions: {
        Row: {
          asset_id: string
          bytes: number
          content_hash: string | null
          created_at: string
          created_by: string
          duration_ms: number | null
          failure_message: string | null
          has_audio: boolean | null
          height: number | null
          id: string
          mime_type: string
          operation_fingerprint: string
          operation_id: string
          ready_at: string | null
          revision: number
          role: string
          state: string
          storage_bucket: string
          storage_key: string
          width: number | null
          workspace_id: string
        }
        Insert: {
          asset_id: string
          bytes?: number
          content_hash?: string | null
          created_at?: string
          created_by: string
          duration_ms?: number | null
          failure_message?: string | null
          has_audio?: boolean | null
          height?: number | null
          id?: string
          mime_type: string
          operation_fingerprint: string
          operation_id: string
          ready_at?: string | null
          revision: number
          role: string
          state: string
          storage_bucket?: string
          storage_key: string
          width?: number | null
          workspace_id: string
        }
        Update: {
          asset_id?: string
          bytes?: number
          content_hash?: string | null
          created_at?: string
          created_by?: string
          duration_ms?: number | null
          failure_message?: string | null
          has_audio?: boolean | null
          height?: number | null
          id?: string
          mime_type?: string
          operation_fingerprint?: string
          operation_id?: string
          ready_at?: string | null
          revision?: number
          role?: string
          state?: string
          storage_bucket?: string
          storage_key?: string
          width?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_asset_revisions_asset_id_fkey"
            columns: ["asset_id"]
            referencedRelation: "brand_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_asset_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_assets: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          id: string
          internal_label: string
          profile_id: string
          role: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          internal_label: string
          profile_id: string
          role: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          internal_label?: string
          profile_id?: string
          role?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_assets_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profile_revisions: {
        Row: {
          content_hash: string
          created_at: string
          created_by: string
          eligible_for_new_use: boolean
          id: string
          profile_id: string
          revision: number
          rules_json: Json
          state: string
          validation_json: Json
          verification_version: string
          verified_at: string | null
          workspace_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          created_by: string
          eligible_for_new_use?: boolean
          id?: string
          profile_id: string
          revision: number
          rules_json: Json
          state?: string
          validation_json: Json
          verification_version?: string
          verified_at?: string | null
          workspace_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          created_by?: string
          eligible_for_new_use?: boolean
          id?: string
          profile_id?: string
          revision?: number
          rules_json?: Json
          state?: string
          validation_json?: Json
          verification_version?: string
          verified_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_profile_revisions_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_profile_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profiles: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          id: string
          internal_label: string
          legacy_template_id: string | null
          updated_at: string
          updated_by: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          internal_label: string
          legacy_template_id?: string | null
          updated_at?: string
          updated_by: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          internal_label?: string
          legacy_template_id?: string | null
          updated_at?: string
          updated_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      broll_beat_revisions: {
        Row: {
          asset_category: string
          beat_id: string
          canonical_anchor_assessment: Json
          content_hash: string
          context_after: string
          context_before: string
          context_focus: string
          created_at: string
          created_by: string
          duration_target_ms: number
          id: string
          immutable_revision_hash: string
          mood_pacing: string
          motion_intent: string
          narrative_purpose: string
          placement_hint: string
          previous_revision: number | null
          previous_revision_id: string | null
          revision: number
          script_approval_id: string
          script_approval_revision: number
          shot_type: string
          source_plan_revision: number
          source_plan_revision_id: string
          trim_guidance_json: Json
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          asset_category: string
          beat_id: string
          canonical_anchor_assessment: Json
          content_hash: string
          context_after?: string
          context_before?: string
          context_focus: string
          created_at?: string
          created_by: string
          duration_target_ms: number
          id?: string
          immutable_revision_hash: string
          mood_pacing: string
          motion_intent: string
          narrative_purpose: string
          placement_hint: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          revision: number
          script_approval_id: string
          script_approval_revision: number
          shot_type: string
          source_plan_revision: number
          source_plan_revision_id: string
          trim_guidance_json?: Json
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          asset_category?: string
          beat_id?: string
          canonical_anchor_assessment?: Json
          content_hash?: string
          context_after?: string
          context_before?: string
          context_focus?: string
          created_at?: string
          created_by?: string
          duration_target_ms?: number
          id?: string
          immutable_revision_hash?: string
          mood_pacing?: string
          motion_intent?: string
          narrative_purpose?: string
          placement_hint?: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          revision?: number
          script_approval_id?: string
          script_approval_revision?: number
          shot_type?: string
          source_plan_revision?: number
          source_plan_revision_id?: string
          trim_guidance_json?: Json
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broll_beat_revisions_previous_revision_id_workspace_id_wor_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "previous_revision",
            ]
            referencedRelation: "broll_beat_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "broll_beat_revisions_script_approval_id_workspace_id_workp_fkey"
            columns: [
              "script_approval_id",
              "workspace_id",
              "workpiece_id",
              "script_approval_revision",
            ]
            referencedRelation: "script_approval_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "approval_revision",
            ]
          },
          {
            foreignKeyName: "broll_beat_revisions_source_plan_revision_id_workspace_id__fkey"
            columns: [
              "source_plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "source_plan_revision",
            ]
            referencedRelation: "broll_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "broll_beat_revisions_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "broll_beat_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      broll_candidate_revisions: {
        Row: {
          asset_content_hash: string
          asset_id: string
          asset_path: string
          beat_id: string
          candidate_id: string
          content_hash: string
          created_at: string
          created_by: string
          duration_ms: number
          height: number
          id: string
          immutable_revision_hash: string
          license_json: Json
          mime_type: string
          poster_asset_id: string | null
          previous_revision: number | null
          previous_revision_id: string | null
          prompt_content_hash: string | null
          prompt_revision: number | null
          prompt_revision_id: string | null
          provenance_json: Json
          provider: string
          provider_request_id: string | null
          revision: number
          source_kind: string
          source_url: string | null
          storage_bucket: string
          storage_key: string
          width: number
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          asset_content_hash: string
          asset_id: string
          asset_path: string
          beat_id: string
          candidate_id: string
          content_hash: string
          created_at?: string
          created_by: string
          duration_ms: number
          height: number
          id?: string
          immutable_revision_hash: string
          license_json: Json
          mime_type: string
          poster_asset_id?: string | null
          previous_revision?: number | null
          previous_revision_id?: string | null
          prompt_content_hash?: string | null
          prompt_revision?: number | null
          prompt_revision_id?: string | null
          provenance_json: Json
          provider: string
          provider_request_id?: string | null
          revision: number
          source_kind: string
          source_url?: string | null
          storage_bucket: string
          storage_key: string
          width: number
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          asset_content_hash?: string
          asset_id?: string
          asset_path?: string
          beat_id?: string
          candidate_id?: string
          content_hash?: string
          created_at?: string
          created_by?: string
          duration_ms?: number
          height?: number
          id?: string
          immutable_revision_hash?: string
          license_json?: Json
          mime_type?: string
          poster_asset_id?: string | null
          previous_revision?: number | null
          previous_revision_id?: string | null
          prompt_content_hash?: string | null
          prompt_revision?: number | null
          prompt_revision_id?: string | null
          provenance_json?: Json
          provider?: string
          provider_request_id?: string | null
          revision?: number
          source_kind?: string
          source_url?: string | null
          storage_bucket?: string
          storage_key?: string
          width?: number
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broll_candidate_revisions_asset_id_fkey"
            columns: ["asset_id"]
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broll_candidate_revisions_candidate_id_fkey"
            columns: ["candidate_id"]
            referencedRelation: "broll_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broll_candidate_revisions_poster_asset_id_fkey"
            columns: ["poster_asset_id"]
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broll_candidate_revisions_previous_revision_id_workspace_i_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "previous_revision",
            ]
            referencedRelation: "broll_candidate_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "broll_candidate_revisions_prompt_revision_id_workspace_id__fkey"
            columns: [
              "prompt_revision_id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "prompt_revision",
            ]
            referencedRelation: "broll_prompt_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "revision",
            ]
          },
        ]
      }
      broll_candidates: {
        Row: {
          beat_id: string
          created_at: string
          created_by: string
          id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          beat_id: string
          created_at?: string
          created_by: string
          id?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          beat_id?: string
          created_at?: string
          created_by?: string
          id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broll_candidates_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "broll_candidates_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      broll_operation_receipts: {
        Row: {
          beat_id: string | null
          created_at: string
          created_by: string
          failed_stage: string | null
          failure_code: string | null
          failure_message: string | null
          normalized_inputs_json: Json
          operation_fingerprint: string
          operation_id: string
          operation_type: string
          provider_response_hash: string | null
          provider_response_json: Json | null
          receipt_json: Json | null
          result_candidate_revision_id: string | null
          result_plan_revision_id: string | null
          result_prompt_revision_id: string | null
          result_selection_id: string | null
          state: string
          updated_at: string
          verified_asset_id: string | null
          verified_poster_asset_id: string | null
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          beat_id?: string | null
          created_at?: string
          created_by: string
          failed_stage?: string | null
          failure_code?: string | null
          failure_message?: string | null
          normalized_inputs_json: Json
          operation_fingerprint: string
          operation_id: string
          operation_type: string
          provider_response_hash?: string | null
          provider_response_json?: Json | null
          receipt_json?: Json | null
          result_candidate_revision_id?: string | null
          result_plan_revision_id?: string | null
          result_prompt_revision_id?: string | null
          result_selection_id?: string | null
          state: string
          updated_at?: string
          verified_asset_id?: string | null
          verified_poster_asset_id?: string | null
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          beat_id?: string | null
          created_at?: string
          created_by?: string
          failed_stage?: string | null
          failure_code?: string | null
          failure_message?: string | null
          normalized_inputs_json?: Json
          operation_fingerprint?: string
          operation_id?: string
          operation_type?: string
          provider_response_hash?: string | null
          provider_response_json?: Json | null
          receipt_json?: Json | null
          result_candidate_revision_id?: string | null
          result_plan_revision_id?: string | null
          result_prompt_revision_id?: string | null
          result_selection_id?: string | null
          state?: string
          updated_at?: string
          verified_asset_id?: string | null
          verified_poster_asset_id?: string | null
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broll_operation_receipts_verified_asset_id_fkey"
            columns: ["verified_asset_id"]
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broll_operation_receipts_verified_poster_asset_id_fkey"
            columns: ["verified_poster_asset_id"]
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broll_operation_receipts_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "broll_operation_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      broll_plan_beat_membership: {
        Row: {
          beat_id: string
          beat_revision: number
          beat_revision_id: string
          ordinal: number
          plan_revision: number
          plan_revision_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          beat_id: string
          beat_revision: number
          beat_revision_id: string
          ordinal: number
          plan_revision: number
          plan_revision_id: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          beat_id?: string
          beat_revision?: number
          beat_revision_id?: string
          ordinal?: number
          plan_revision?: number
          plan_revision_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broll_plan_beat_membership_beat_revision_id_workspace_id_w_fkey"
            columns: [
              "beat_revision_id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "beat_revision",
            ]
            referencedRelation: "broll_beat_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "broll_plan_beat_membership_plan_revision_id_workspace_id_w_fkey"
            columns: [
              "plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "plan_revision",
            ]
            referencedRelation: "broll_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
        ]
      }
      broll_plan_revisions: {
        Row: {
          content_hash: string
          created_at: string
          created_by: string
          id: string
          immutable_revision_hash: string
          previous_revision: number | null
          previous_revision_id: string | null
          revision: number
          script_approval_id: string
          script_approval_revision: number
          script_content_hash: string
          source_context_contract_version: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          created_by: string
          id?: string
          immutable_revision_hash: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          revision: number
          script_approval_id: string
          script_approval_revision: number
          script_content_hash: string
          source_context_contract_version: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          created_by?: string
          id?: string
          immutable_revision_hash?: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          revision?: number
          script_approval_id?: string
          script_approval_revision?: number
          script_content_hash?: string
          source_context_contract_version?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broll_plan_revisions_previous_revision_id_workspace_id_wor_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "previous_revision",
            ]
            referencedRelation: "broll_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "broll_plan_revisions_script_approval_id_workspace_id_workp_fkey"
            columns: [
              "script_approval_id",
              "workspace_id",
              "workpiece_id",
              "script_approval_revision",
            ]
            referencedRelation: "script_approval_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "approval_revision",
            ]
          },
          {
            foreignKeyName: "broll_plan_revisions_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "broll_plan_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      broll_plan_sequences: {
        Row: {
          current_plan_revision: number
          current_plan_revision_id: string | null
          current_selection_revision: number
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          current_plan_revision?: number
          current_plan_revision_id?: string | null
          current_selection_revision?: number
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          current_plan_revision?: number
          current_plan_revision_id?: string | null
          current_selection_revision?: number
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broll_plan_sequences_current_plan_revision_id_workspace_id_fkey"
            columns: [
              "current_plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "current_plan_revision",
            ]
            referencedRelation: "broll_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "broll_plan_sequences_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "broll_plan_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      broll_prompt_revisions: {
        Row: {
          beat_id: string
          content_hash: string
          created_at: string
          created_by: string
          final_prompt: string
          id: string
          immutable_revision_hash: string
          interpretation_contract_version: string
          motion_brief_json: Json
          previous_revision: number | null
          previous_revision_id: string | null
          prompt_source: string
          provider_response_json: Json | null
          revision: number
          source_beat_revision: number
          source_beat_revision_id: string
          synthesis_contract_version: string
          validator_version: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          beat_id: string
          content_hash: string
          created_at?: string
          created_by: string
          final_prompt: string
          id?: string
          immutable_revision_hash: string
          interpretation_contract_version: string
          motion_brief_json: Json
          previous_revision?: number | null
          previous_revision_id?: string | null
          prompt_source: string
          provider_response_json?: Json | null
          revision: number
          source_beat_revision: number
          source_beat_revision_id: string
          synthesis_contract_version: string
          validator_version: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          beat_id?: string
          content_hash?: string
          created_at?: string
          created_by?: string
          final_prompt?: string
          id?: string
          immutable_revision_hash?: string
          interpretation_contract_version?: string
          motion_brief_json?: Json
          previous_revision?: number | null
          previous_revision_id?: string | null
          prompt_source?: string
          provider_response_json?: Json | null
          revision?: number
          source_beat_revision?: number
          source_beat_revision_id?: string
          synthesis_contract_version?: string
          validator_version?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broll_prompt_revisions_previous_revision_id_workspace_id_w_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "previous_revision",
            ]
            referencedRelation: "broll_prompt_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "broll_prompt_revisions_source_beat_revision_id_workspace_i_fkey"
            columns: [
              "source_beat_revision_id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "source_beat_revision",
            ]
            referencedRelation: "broll_beat_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "broll_prompt_revisions_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "broll_prompt_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      broll_prompt_sequences: {
        Row: {
          beat_id: string
          current_prompt_revision: number
          current_prompt_revision_id: string | null
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          beat_id: string
          current_prompt_revision?: number
          current_prompt_revision_id?: string | null
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          beat_id?: string
          current_prompt_revision?: number
          current_prompt_revision_id?: string | null
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broll_prompt_sequences_current_prompt_revision_id_workspac_fkey"
            columns: [
              "current_prompt_revision_id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "current_prompt_revision",
            ]
            referencedRelation: "broll_prompt_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "broll_prompt_sequences_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      broll_selections: {
        Row: {
          beat_id: string
          beat_revision: number
          beat_revision_id: string
          candidate_revision: number
          candidate_revision_id: string
          created_at: string
          created_by: string
          decision: string
          id: string
          operation_fingerprint: string
          operation_id: string
          plan_revision: number
          plan_revision_id: string
          previous_revision: number | null
          previous_selection_id: string | null
          revision: number
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          beat_id: string
          beat_revision: number
          beat_revision_id: string
          candidate_revision: number
          candidate_revision_id: string
          created_at?: string
          created_by: string
          decision: string
          id?: string
          operation_fingerprint: string
          operation_id: string
          plan_revision: number
          plan_revision_id: string
          previous_revision?: number | null
          previous_selection_id?: string | null
          revision: number
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          beat_id?: string
          beat_revision?: number
          beat_revision_id?: string
          candidate_revision?: number
          candidate_revision_id?: string
          created_at?: string
          created_by?: string
          decision?: string
          id?: string
          operation_fingerprint?: string
          operation_id?: string
          plan_revision?: number
          plan_revision_id?: string
          previous_revision?: number | null
          previous_selection_id?: string | null
          revision?: number
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broll_selections_beat_revision_id_workspace_id_workpiece_i_fkey"
            columns: [
              "beat_revision_id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "beat_revision",
            ]
            referencedRelation: "broll_beat_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "broll_selections_candidate_revision_id_workspace_id_workpi_fkey"
            columns: [
              "candidate_revision_id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "candidate_revision",
            ]
            referencedRelation: "broll_candidate_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "beat_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "broll_selections_plan_revision_id_workspace_id_workpiece_i_fkey"
            columns: [
              "plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "plan_revision",
            ]
            referencedRelation: "broll_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "broll_selections_previous_selection_id_fkey"
            columns: ["previous_selection_id"]
            referencedRelation: "broll_selections"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_assignments_event_id_fkey"
            columns: ["event_id"]
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "recording_sessions"
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_recordings_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_performance_retention_workspace_id_fkey"
            columns: ["workspace_id"]
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
          storage_tier: string
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
          storage_tier?: string
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
          storage_tier?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodes_active_revision_id_fkey"
            columns: ["active_revision_id"]
            referencedRelation: "recording_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_canonical_recording_id_fkey"
            columns: ["canonical_recording_id"]
            referencedRelation: "canonical_recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hammer_workpiece_presence_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hammer_workpiece_state_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearth_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hearth_authority_operation_receipts: {
        Row: {
          created_at: string
          created_by: string
          immutable_result_json: Json
          mutation_kind: string
          operation_fingerprint: string
          operation_id: string
          result_image_map_revision: number | null
          result_image_map_revision_id: string | null
          result_script_approval_id: string | null
          result_script_approval_revision: number | null
          source_image_map_revision: number | null
          source_image_map_revision_id: string | null
          target_script_approval_id: string | null
          target_script_approval_revision: number | null
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          immutable_result_json: Json
          mutation_kind: string
          operation_fingerprint: string
          operation_id: string
          result_image_map_revision?: number | null
          result_image_map_revision_id?: string | null
          result_script_approval_id?: string | null
          result_script_approval_revision?: number | null
          source_image_map_revision?: number | null
          source_image_map_revision_id?: string | null
          target_script_approval_id?: string | null
          target_script_approval_revision?: number | null
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          immutable_result_json?: Json
          mutation_kind?: string
          operation_fingerprint?: string
          operation_id?: string
          result_image_map_revision?: number | null
          result_image_map_revision_id?: string | null
          result_script_approval_id?: string | null
          result_script_approval_revision?: number | null
          source_image_map_revision?: number | null
          source_image_map_revision_id?: string | null
          target_script_approval_id?: string | null
          target_script_approval_revision?: number | null
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hearth_authority_operation_re_result_image_map_revision_id_fkey"
            columns: [
              "result_image_map_revision_id",
              "workspace_id",
              "workpiece_id",
              "result_image_map_revision",
            ]
            referencedRelation: "image_map_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "hearth_authority_operation_re_result_script_approval_id_wo_fkey"
            columns: [
              "result_script_approval_id",
              "workspace_id",
              "workpiece_id",
              "result_script_approval_revision",
            ]
            referencedRelation: "script_approval_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "approval_revision",
            ]
          },
          {
            foreignKeyName: "hearth_authority_operation_re_source_image_map_revision_id_fkey"
            columns: [
              "source_image_map_revision_id",
              "workspace_id",
              "workpiece_id",
              "source_image_map_revision",
            ]
            referencedRelation: "image_map_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "hearth_authority_operation_re_target_script_approval_id_wo_fkey"
            columns: [
              "target_script_approval_id",
              "workspace_id",
              "workpiece_id",
              "target_script_approval_revision",
            ]
            referencedRelation: "script_approval_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "approval_revision",
            ]
          },
          {
            foreignKeyName: "hearth_authority_operation_recei_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "hearth_authority_operation_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearth_interaction_events_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearth_workpiece_presence_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "henry_events_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      image_map_prompt_operation_receipts: {
        Row: {
          created_at: string
          created_by: string
          expected_prompt_revision: number
          expected_prompt_revision_id: string | null
          failed_stage: string | null
          failure_code: string | null
          failure_message: string | null
          image_map_revision: number
          image_map_revision_id: string
          image_moment_id: string
          normalized_inputs_json: Json
          operation_fingerprint: string
          operation_id: string
          operation_type: string
          provider_response_hash: string | null
          provider_response_json: Json | null
          receipt_json: Json | null
          result_revision: number | null
          result_revision_id: string | null
          script_approval_id: string
          script_approval_revision: number
          state: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expected_prompt_revision: number
          expected_prompt_revision_id?: string | null
          failed_stage?: string | null
          failure_code?: string | null
          failure_message?: string | null
          image_map_revision: number
          image_map_revision_id: string
          image_moment_id: string
          normalized_inputs_json: Json
          operation_fingerprint: string
          operation_id: string
          operation_type: string
          provider_response_hash?: string | null
          provider_response_json?: Json | null
          receipt_json?: Json | null
          result_revision?: number | null
          result_revision_id?: string | null
          script_approval_id: string
          script_approval_revision: number
          state: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expected_prompt_revision?: number
          expected_prompt_revision_id?: string | null
          failed_stage?: string | null
          failure_code?: string | null
          failure_message?: string | null
          image_map_revision?: number
          image_map_revision_id?: string
          image_moment_id?: string
          normalized_inputs_json?: Json
          operation_fingerprint?: string
          operation_id?: string
          operation_type?: string
          provider_response_hash?: string | null
          provider_response_json?: Json | null
          receipt_json?: Json | null
          result_revision?: number | null
          result_revision_id?: string | null
          script_approval_id?: string
          script_approval_revision?: number
          state?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "image_map_prompt_operation_re_expected_prompt_revision_id__fkey"
            columns: [
              "expected_prompt_revision_id",
              "workspace_id",
              "workpiece_id",
              "image_moment_id",
              "expected_prompt_revision",
            ]
            referencedRelation: "image_map_prompt_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "image_moment_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "image_map_prompt_operation_re_image_map_revision_id_worksp_fkey"
            columns: [
              "image_map_revision_id",
              "workspace_id",
              "workpiece_id",
              "image_map_revision",
            ]
            referencedRelation: "image_map_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "image_map_prompt_operation_re_result_revision_id_workspace_fkey"
            columns: [
              "result_revision_id",
              "workspace_id",
              "workpiece_id",
              "image_moment_id",
              "result_revision",
            ]
            referencedRelation: "image_map_prompt_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "image_moment_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "image_map_prompt_operation_re_script_approval_id_workspace_fkey"
            columns: [
              "script_approval_id",
              "workspace_id",
              "workpiece_id",
              "script_approval_revision",
            ]
            referencedRelation: "script_approval_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "approval_revision",
            ]
          },
          {
            foreignKeyName: "image_map_prompt_operation_recei_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "image_map_prompt_operation_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      image_map_prompt_revisions: {
        Row: {
          ai_synthesized_prompt: string
          content_hash: string
          created_at: string
          created_by: string
          creator_direction: string
          final_prompt: string
          id: string
          image_map_revision: number
          image_map_revision_id: string
          image_moment_id: string
          immutable_revision_hash: string
          interpretation_contract_version: string
          interpretation_model: string
          interpretation_request_json: Json
          interpretation_response_json: Json
          previous_revision: number | null
          previous_revision_id: string | null
          prompt_source: string
          revision: number
          script_approval_id: string
          script_approval_revision: number
          source_context_json: Json
          synthesis_contract_version: string
          validator_version: string
          visual_brief_json: Json
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          ai_synthesized_prompt: string
          content_hash: string
          created_at?: string
          created_by: string
          creator_direction: string
          final_prompt: string
          id?: string
          image_map_revision: number
          image_map_revision_id: string
          image_moment_id: string
          immutable_revision_hash: string
          interpretation_contract_version: string
          interpretation_model: string
          interpretation_request_json: Json
          interpretation_response_json: Json
          previous_revision?: number | null
          previous_revision_id?: string | null
          prompt_source: string
          revision: number
          script_approval_id: string
          script_approval_revision: number
          source_context_json: Json
          synthesis_contract_version: string
          validator_version: string
          visual_brief_json: Json
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          ai_synthesized_prompt?: string
          content_hash?: string
          created_at?: string
          created_by?: string
          creator_direction?: string
          final_prompt?: string
          id?: string
          image_map_revision?: number
          image_map_revision_id?: string
          image_moment_id?: string
          immutable_revision_hash?: string
          interpretation_contract_version?: string
          interpretation_model?: string
          interpretation_request_json?: Json
          interpretation_response_json?: Json
          previous_revision?: number | null
          previous_revision_id?: string | null
          prompt_source?: string
          revision?: number
          script_approval_id?: string
          script_approval_revision?: number
          source_context_json?: Json
          synthesis_contract_version?: string
          validator_version?: string
          visual_brief_json?: Json
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "image_map_prompt_revisions_image_map_revision_id_workspace_fkey"
            columns: [
              "image_map_revision_id",
              "workspace_id",
              "workpiece_id",
              "image_map_revision",
            ]
            referencedRelation: "image_map_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "image_map_prompt_revisions_previous_revision_id_workspace__fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "image_moment_id",
              "previous_revision",
            ]
            referencedRelation: "image_map_prompt_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "image_moment_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "image_map_prompt_revisions_script_approval_id_workspace_id_fkey"
            columns: [
              "script_approval_id",
              "workspace_id",
              "workpiece_id",
              "script_approval_revision",
            ]
            referencedRelation: "script_approval_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "approval_revision",
            ]
          },
          {
            foreignKeyName: "image_map_prompt_revisions_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "image_map_prompt_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      image_map_prompt_sequences: {
        Row: {
          current_prompt_revision: number
          current_prompt_revision_id: string | null
          image_moment_id: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          current_prompt_revision?: number
          current_prompt_revision_id?: string | null
          image_moment_id: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          current_prompt_revision?: number
          current_prompt_revision_id?: string | null
          image_moment_id?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "image_map_prompt_sequences_current_prompt_revision_id_work_fkey"
            columns: [
              "current_prompt_revision_id",
              "workspace_id",
              "workpiece_id",
              "image_moment_id",
              "current_prompt_revision",
            ]
            referencedRelation: "image_map_prompt_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "image_moment_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "image_map_prompt_sequences_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "image_map_prompt_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      image_map_revisions: {
        Row: {
          anchor_contract_version: string
          created_at: string
          created_by: string
          document_content_hash: string
          document_json: Json
          id: string
          immutable_revision_hash: string
          previous_revision: number | null
          previous_revision_id: string | null
          provenance_state: string
          revision: number
          semantic_state_hash: string
          source_script_approval_id: string | null
          source_script_approval_revision: number | null
          source_script_content_hash: string | null
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          anchor_contract_version: string
          created_at?: string
          created_by: string
          document_content_hash: string
          document_json: Json
          id?: string
          immutable_revision_hash: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          provenance_state: string
          revision: number
          semantic_state_hash: string
          source_script_approval_id?: string | null
          source_script_approval_revision?: number | null
          source_script_content_hash?: string | null
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          anchor_contract_version?: string
          created_at?: string
          created_by?: string
          document_content_hash?: string
          document_json?: Json
          id?: string
          immutable_revision_hash?: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          provenance_state?: string
          revision?: number
          semantic_state_hash?: string
          source_script_approval_id?: string | null
          source_script_approval_revision?: number | null
          source_script_content_hash?: string | null
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "image_map_revisions_previous_revision_id_workspace_id_work_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "previous_revision",
            ]
            referencedRelation: "image_map_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "image_map_revisions_source_script_approval_id_workspace_id_fkey"
            columns: [
              "source_script_approval_id",
              "workspace_id",
              "workpiece_id",
              "source_script_approval_revision",
            ]
            referencedRelation: "script_approval_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "approval_revision",
            ]
          },
          {
            foreignKeyName: "image_map_revisions_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "image_map_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "orgs"
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
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quench_destination_capability_revisions: {
        Row: {
          adapter_version: string
          capabilities_json: Json
          content_hash: string
          contract_version: string
          created_at: string
          created_by: string | null
          destination_scope_id: string
          effective_at: string
          id: string
          revision: number
        }
        Insert: {
          adapter_version: string
          capabilities_json: Json
          content_hash: string
          contract_version: string
          created_at?: string
          created_by?: string | null
          destination_scope_id: string
          effective_at?: string
          id?: string
          revision: number
        }
        Update: {
          adapter_version?: string
          capabilities_json?: Json
          content_hash?: string
          contract_version?: string
          created_at?: string
          created_by?: string | null
          destination_scope_id?: string
          effective_at?: string
          id?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "quench_destination_capability_revisio_destination_scope_id_fkey"
            columns: ["destination_scope_id"]
            referencedRelation: "quench_destination_scopes"
            referencedColumns: ["id"]
          },
        ]
      }
      quench_destination_scopes: {
        Row: {
          adapter_id: string
          connection_ref: string | null
          created_at: string
          created_by: string | null
          current_capability_revision_id: string | null
          execution_context: string
          id: string
          platform: string
          scope_key: string
          state: string
          workspace_id: string | null
        }
        Insert: {
          adapter_id: string
          connection_ref?: string | null
          created_at?: string
          created_by?: string | null
          current_capability_revision_id?: string | null
          execution_context: string
          id?: string
          platform: string
          scope_key: string
          state?: string
          workspace_id?: string | null
        }
        Update: {
          adapter_id?: string
          connection_ref?: string | null
          created_at?: string
          created_by?: string | null
          current_capability_revision_id?: string | null
          execution_context?: string
          id?: string
          platform?: string
          scope_key?: string
          state?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quench_destination_scope_capability_fk"
            columns: ["current_capability_revision_id", "id"]
            referencedRelation: "quench_destination_capability_revisions"
            referencedColumns: ["id", "destination_scope_id"]
          },
          {
            foreignKeyName: "quench_destination_scopes_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quench_release_candidate_assignments: {
        Row: {
          allocation_basis_points: number | null
          assignment_ordinal: number
          assignment_role: string
          candidate_binding_id: string
          candidate_binding_revision: number
          candidate_revision_id: string
          candidate_set_id: string
          composite_asset_id: string
          composite_content_hash: string
          created_at: string
          decision_id: string
          destination_scope_id: string
          id: string
          readability_evidence_hash: string
          recipe_hash: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          allocation_basis_points?: number | null
          assignment_ordinal: number
          assignment_role: string
          candidate_binding_id: string
          candidate_binding_revision: number
          candidate_revision_id: string
          candidate_set_id: string
          composite_asset_id: string
          composite_content_hash: string
          created_at?: string
          decision_id: string
          destination_scope_id: string
          id?: string
          readability_evidence_hash: string
          recipe_hash: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          allocation_basis_points?: number | null
          assignment_ordinal?: number
          assignment_role?: string
          candidate_binding_id?: string
          candidate_binding_revision?: number
          candidate_revision_id?: string
          candidate_set_id?: string
          composite_asset_id?: string
          composite_content_hash?: string
          created_at?: string
          decision_id?: string
          destination_scope_id?: string
          id?: string
          readability_evidence_hash?: string
          recipe_hash?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quench_release_candidate_assi_candidate_set_id_candidate_r_fkey"
            columns: [
              "candidate_set_id",
              "candidate_revision_id",
              "workspace_id",
              "workpiece_id",
            ]
            referencedRelation: "thumbnail_candidate_set_members"
            referencedColumns: [
              "candidate_set_id",
              "candidate_revision_id",
              "workspace_id",
              "workpiece_id",
            ]
          },
          {
            foreignKeyName: "quench_release_candidate_assi_decision_id_workspace_id_wor_fkey"
            columns: [
              "decision_id",
              "workspace_id",
              "workpiece_id",
              "destination_scope_id",
            ]
            referencedRelation: "quench_release_decision_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "destination_scope_id",
            ]
          },
          {
            foreignKeyName: "quench_release_candidate_assignments_candidate_binding_id_fkey"
            columns: ["candidate_binding_id"]
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_candidate_assignments_composite_asset_id_fkey"
            columns: ["composite_asset_id"]
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      quench_release_decision_revisions: {
        Row: {
          active_binding_id: string
          active_binding_revision: number
          allocation_unit: string | null
          candidate_set_content_hash: string
          candidate_set_id: string
          candidate_set_revision: number
          capability_content_hash: string
          capability_revision_id: string
          created_at: string
          created_by: string | null
          decision_content_hash: string
          decision_kind: string
          destination_scope_id: string
          id: string
          intent_state: string
          manifest_content_hash: string
          manifest_snapshot_id: string
          metadata_content_hash: string
          metadata_revision: number
          metadata_snapshot_json: Json
          previous_decision_id: string | null
          revision: number
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          active_binding_id: string
          active_binding_revision: number
          allocation_unit?: string | null
          candidate_set_content_hash: string
          candidate_set_id: string
          candidate_set_revision: number
          capability_content_hash: string
          capability_revision_id: string
          created_at?: string
          created_by?: string | null
          decision_content_hash: string
          decision_kind: string
          destination_scope_id: string
          id?: string
          intent_state: string
          manifest_content_hash: string
          manifest_snapshot_id: string
          metadata_content_hash: string
          metadata_revision: number
          metadata_snapshot_json: Json
          previous_decision_id?: string | null
          revision: number
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          active_binding_id?: string
          active_binding_revision?: number
          allocation_unit?: string | null
          candidate_set_content_hash?: string
          candidate_set_id?: string
          candidate_set_revision?: number
          capability_content_hash?: string
          capability_revision_id?: string
          created_at?: string
          created_by?: string | null
          decision_content_hash?: string
          decision_kind?: string
          destination_scope_id?: string
          id?: string
          intent_state?: string
          manifest_content_hash?: string
          manifest_snapshot_id?: string
          metadata_content_hash?: string
          metadata_revision?: number
          metadata_snapshot_json?: Json
          previous_decision_id?: string | null
          revision?: number
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quench_decision_previous_same_scope_fk"
            columns: [
              "previous_decision_id",
              "workspace_id",
              "workpiece_id",
              "destination_scope_id",
            ]
            referencedRelation: "quench_release_decision_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "destination_scope_id",
            ]
          },
          {
            foreignKeyName: "quench_release_decision_revis_candidate_set_id_workspace_i_fkey"
            columns: ["candidate_set_id", "workspace_id", "workpiece_id"]
            referencedRelation: "thumbnail_candidate_sets"
            referencedColumns: ["id", "workspace_id", "workpiece_id"]
          },
          {
            foreignKeyName: "quench_release_decision_revis_capability_revision_id_desti_fkey"
            columns: ["capability_revision_id", "destination_scope_id"]
            referencedRelation: "quench_destination_capability_revisions"
            referencedColumns: ["id", "destination_scope_id"]
          },
          {
            foreignKeyName: "quench_release_decision_revis_manifest_snapshot_id_workspa_fkey"
            columns: ["manifest_snapshot_id", "workspace_id", "workpiece_id"]
            referencedRelation: "quench_release_manifest_snapshots"
            referencedColumns: ["id", "workspace_id", "workpiece_id"]
          },
          {
            foreignKeyName: "quench_release_decision_revisions_active_binding_id_fkey"
            columns: ["active_binding_id"]
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_decision_revisions_destination_scope_id_fkey"
            columns: ["destination_scope_id"]
            referencedRelation: "quench_destination_scopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_decision_revisions_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_decision_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quench_release_decision_sequences: {
        Row: {
          created_at: string
          current_decision_id: string | null
          current_revision: number
          destination_scope_id: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          current_decision_id?: string | null
          current_revision?: number
          destination_scope_id: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          current_decision_id?: string | null
          current_revision?: number
          destination_scope_id?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quench_release_decision_seque_current_decision_id_workspac_fkey"
            columns: [
              "current_decision_id",
              "workspace_id",
              "workpiece_id",
              "destination_scope_id",
            ]
            referencedRelation: "quench_release_decision_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "destination_scope_id",
            ]
          },
          {
            foreignKeyName: "quench_release_decision_sequences_destination_scope_id_fkey"
            columns: ["destination_scope_id"]
            referencedRelation: "quench_destination_scopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_decision_sequences_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_decision_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quench_release_manifest_snapshots: {
        Row: {
          canonical_readiness_status: string
          id: string
          manifest_bytes: string
          manifest_content_hash: string
          manifest_version: number
          parsed_manifest_json: Json
          ready_for_quench: boolean
          snapshotted_at: string
          snapshotted_by: string | null
          source_file_path: string
          source_file_revision: number
          source_storage_bucket: string
          source_storage_key: string
          validation_contract_version: string
          validation_result_json: Json
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          canonical_readiness_status: string
          id?: string
          manifest_bytes: string
          manifest_content_hash: string
          manifest_version: number
          parsed_manifest_json: Json
          ready_for_quench: boolean
          snapshotted_at?: string
          snapshotted_by?: string | null
          source_file_path: string
          source_file_revision: number
          source_storage_bucket: string
          source_storage_key: string
          validation_contract_version: string
          validation_result_json: Json
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          canonical_readiness_status?: string
          id?: string
          manifest_bytes?: string
          manifest_content_hash?: string
          manifest_version?: number
          parsed_manifest_json?: Json
          ready_for_quench?: boolean
          snapshotted_at?: string
          snapshotted_by?: string | null
          source_file_path?: string
          source_file_revision?: number
          source_storage_bucket?: string
          source_storage_key?: string
          validation_contract_version?: string
          validation_result_json?: Json
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quench_release_manifest_snapshots_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_manifest_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quench_release_operation_receipts: {
        Row: {
          created_at: string
          created_by: string | null
          decision_id: string
          decision_revision: number
          destination_scope_id: string
          immutable_result_json: Json
          mutation_kind: string
          operation_fingerprint: string
          operation_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decision_id: string
          decision_revision: number
          destination_scope_id: string
          immutable_result_json: Json
          mutation_kind: string
          operation_fingerprint: string
          operation_id: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decision_id?: string
          decision_revision?: number
          destination_scope_id?: string
          immutable_result_json?: Json
          mutation_kind?: string
          operation_fingerprint?: string
          operation_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quench_release_operation_rece_decision_id_workspace_id_wor_fkey"
            columns: [
              "decision_id",
              "workspace_id",
              "workpiece_id",
              "destination_scope_id",
            ]
            referencedRelation: "quench_release_decision_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "destination_scope_id",
            ]
          },
          {
            foreignKeyName: "quench_release_operation_receipts_destination_scope_id_fkey"
            columns: ["destination_scope_id"]
            referencedRelation: "quench_destination_scopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_operation_receipts_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_operation_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "canonical_recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_revisions_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
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
            foreignKeyName: "recording_session_episodes_episode_id_fkey"
            columns: ["episode_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_session_episodes_recording_session_id_fkey"
            columns: ["recording_session_id"]
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_session_items_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "recording_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_sessions: {
        Row: {
          calendar_event_id: string | null
          created_at: string
          created_by: string
          ends_at: string | null
          id: string
          starts_at: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          created_at?: string
          created_by: string
          ends_at?: string | null
          id?: string
          starts_at: string
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string
          ends_at?: string | null
          id?: string
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recording_sessions_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      script_approval_revisions: {
        Row: {
          approval_contract_version: string
          approval_revision: number
          created_at: string
          created_by: string
          creator_version_label: string | null
          id: string
          immutable_revision_hash: string
          script_content_hash: string
          script_text: string
          semantic_state_hash: string
          source_file_path: string
          source_file_revision: number
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          approval_contract_version: string
          approval_revision: number
          created_at?: string
          created_by: string
          creator_version_label?: string | null
          id?: string
          immutable_revision_hash: string
          script_content_hash: string
          script_text: string
          semantic_state_hash: string
          source_file_path: string
          source_file_revision: number
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          approval_contract_version?: string
          approval_revision?: number
          created_at?: string
          created_by?: string
          creator_version_label?: string | null
          id?: string
          immutable_revision_hash?: string
          script_content_hash?: string
          script_text?: string
          semantic_state_hash?: string
          source_file_path?: string
          source_file_revision?: number
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_approval_revisions_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "script_approval_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
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
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_brand_setup_operations: {
        Row: {
          created_at: string
          created_by: string
          expected_binding_revision: number
          failed_stage: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          logo_asset_revision_id: string
          logo_content_hash: string | null
          logo_role: string
          operation_fingerprint: string
          operation_id: string
          previous_binding_id: string | null
          previous_binding_revision: number | null
          prior_candidate_content_hash: string | null
          prior_candidate_count: number
          prior_candidate_set_id: string | null
          prior_candidate_set_revision: number | null
          prior_thumbnail_count: number
          prior_thumbnail_identity_hash: string
          profile_content_hash: string | null
          profile_id: string
          profile_revision: number | null
          profile_revision_id: string | null
          receipt_json: Json | null
          renderer_verified_logo_revision_id: string | null
          renderer_verified_storage_bucket: string | null
          renderer_verified_storage_key: string | null
          requested_rules_json: Json
          resolved_style_source: string | null
          resulting_binding_id: string | null
          resulting_binding_revision: number | null
          state: string
          storage_bucket: string
          storage_key: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expected_binding_revision: number
          failed_stage?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          logo_asset_revision_id: string
          logo_content_hash?: string | null
          logo_role: string
          operation_fingerprint: string
          operation_id: string
          previous_binding_id?: string | null
          previous_binding_revision?: number | null
          prior_candidate_content_hash?: string | null
          prior_candidate_count?: number
          prior_candidate_set_id?: string | null
          prior_candidate_set_revision?: number | null
          prior_thumbnail_count?: number
          prior_thumbnail_identity_hash: string
          profile_content_hash?: string | null
          profile_id: string
          profile_revision?: number | null
          profile_revision_id?: string | null
          receipt_json?: Json | null
          renderer_verified_logo_revision_id?: string | null
          renderer_verified_storage_bucket?: string | null
          renderer_verified_storage_key?: string | null
          requested_rules_json: Json
          resolved_style_source?: string | null
          resulting_binding_id?: string | null
          resulting_binding_revision?: number | null
          state?: string
          storage_bucket: string
          storage_key: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expected_binding_revision?: number
          failed_stage?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          logo_asset_revision_id?: string
          logo_content_hash?: string | null
          logo_role?: string
          operation_fingerprint?: string
          operation_id?: string
          previous_binding_id?: string | null
          previous_binding_revision?: number | null
          prior_candidate_content_hash?: string | null
          prior_candidate_count?: number
          prior_candidate_set_id?: string | null
          prior_candidate_set_revision?: number | null
          prior_thumbnail_count?: number
          prior_thumbnail_identity_hash?: string
          profile_content_hash?: string | null
          profile_id?: string
          profile_revision?: number | null
          profile_revision_id?: string | null
          receipt_json?: Json | null
          renderer_verified_logo_revision_id?: string | null
          renderer_verified_storage_bucket?: string | null
          renderer_verified_storage_key?: string | null
          requested_rules_json?: Json
          resolved_style_source?: string | null
          resulting_binding_id?: string | null
          resulting_binding_revision?: number | null
          state?: string
          storage_bucket?: string
          storage_key?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_brand_setup_operati_renderer_verified_logo_revis_fkey"
            columns: ["renderer_verified_logo_revision_id"]
            referencedRelation: "brand_asset_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_logo_asset_revision_id_fkey"
            columns: ["logo_asset_revision_id"]
            referencedRelation: "brand_asset_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_previous_binding_id_fkey"
            columns: ["previous_binding_id"]
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_prior_candidate_set_id_fkey"
            columns: ["prior_candidate_set_id"]
            referencedRelation: "thumbnail_candidate_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_profile_revision_id_fkey"
            columns: ["profile_revision_id"]
            referencedRelation: "brand_profile_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_resulting_binding_id_fkey"
            columns: ["resulting_binding_id"]
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_candidate_brand_decision_operations: {
        Row: {
          created_at: string
          created_by: string | null
          decision_id: string | null
          disposition: string
          id: string
          operation_fingerprint: string
          operation_id: string
          result_json: Json
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decision_id?: string | null
          disposition: string
          id?: string
          operation_fingerprint: string
          operation_id: string
          result_json: Json
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decision_id?: string | null
          disposition?: string
          id?: string
          operation_fingerprint?: string
          operation_id?: string
          result_json?: Json
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_candidate_brand_decision_operations_decision_id_fkey"
            columns: ["decision_id"]
            referencedRelation: "thumbnail_candidate_brand_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_brand_decision_operations_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_brand_decision_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_candidate_brand_decisions: {
        Row: {
          active_binding_id: string
          active_binding_revision: number
          candidate_binding_id: string
          candidate_binding_revision: number
          candidate_revision_id: string
          candidate_set_id: string | null
          composite_asset_id: string
          composite_content_hash: string
          created_at: string
          created_by: string | null
          decision: string
          decision_revision: number
          id: string
          operation_fingerprint: string
          operation_id: string
          previous_decision_id: string | null
          reason: string
          recipe_hash: string
          recipe_id: string
          recipe_revision: number
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          active_binding_id: string
          active_binding_revision: number
          candidate_binding_id: string
          candidate_binding_revision: number
          candidate_revision_id: string
          candidate_set_id?: string | null
          composite_asset_id: string
          composite_content_hash: string
          created_at?: string
          created_by?: string | null
          decision: string
          decision_revision: number
          id?: string
          operation_fingerprint: string
          operation_id: string
          previous_decision_id?: string | null
          reason: string
          recipe_hash: string
          recipe_id: string
          recipe_revision: number
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          active_binding_id?: string
          active_binding_revision?: number
          candidate_binding_id?: string
          candidate_binding_revision?: number
          candidate_revision_id?: string
          candidate_set_id?: string | null
          composite_asset_id?: string
          composite_content_hash?: string
          created_at?: string
          created_by?: string | null
          decision?: string
          decision_revision?: number
          id?: string
          operation_fingerprint?: string
          operation_id?: string
          previous_decision_id?: string | null
          reason?: string
          recipe_hash?: string
          recipe_id?: string
          recipe_revision?: number
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_candidate_brand_dec_candidate_revision_id_worksp_fkey"
            columns: ["candidate_revision_id", "workspace_id", "workpiece_id"]
            referencedRelation: "thumbnail_candidate_revisions"
            referencedColumns: ["id", "workspace_id", "workpiece_id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_brand_decisions_active_binding_id_fkey"
            columns: ["active_binding_id"]
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_brand_decisions_candidate_binding_id_fkey"
            columns: ["candidate_binding_id"]
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_brand_decisions_candidate_set_id_fkey"
            columns: ["candidate_set_id"]
            referencedRelation: "thumbnail_candidate_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_brand_decisions_composite_asset_id_fkey"
            columns: ["composite_asset_id"]
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_brand_decisions_previous_decision_id_fkey"
            columns: ["previous_decision_id"]
            referencedRelation: "thumbnail_candidate_brand_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_candidate_revisions: {
        Row: {
          base_artwork_asset_id: string
          base_artwork_content_hash: string
          candidate_binding_content_hash: string | null
          candidate_binding_id: string
          candidate_binding_revision: number
          canonical_content_hash: string
          canonical_hash_version: string
          committed_at: string
          committed_by: string | null
          composite_asset_id: string
          composite_content_hash: string
          compositor_version: string
          concept_revision_id: string
          id: string
          readability_contract_version: string
          readability_evaluator_version: string
          readability_evidence_hash: string
          recipe_hash: string
          recipe_id: string
          recipe_revision: number
          structural_composition_fingerprint: string
          structural_fingerprint_version: string
          style_provenance_hash: string
          style_source: string
          title_revision: number
          title_revision_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          base_artwork_asset_id: string
          base_artwork_content_hash: string
          candidate_binding_content_hash?: string | null
          candidate_binding_id: string
          candidate_binding_revision: number
          canonical_content_hash: string
          canonical_hash_version?: string
          committed_at?: string
          committed_by?: string | null
          composite_asset_id: string
          composite_content_hash: string
          compositor_version: string
          concept_revision_id: string
          id?: string
          readability_contract_version: string
          readability_evaluator_version: string
          readability_evidence_hash: string
          recipe_hash: string
          recipe_id: string
          recipe_revision: number
          structural_composition_fingerprint: string
          structural_fingerprint_version: string
          style_provenance_hash: string
          style_source: string
          title_revision: number
          title_revision_id: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          base_artwork_asset_id?: string
          base_artwork_content_hash?: string
          candidate_binding_content_hash?: string | null
          candidate_binding_id?: string
          candidate_binding_revision?: number
          canonical_content_hash?: string
          canonical_hash_version?: string
          committed_at?: string
          committed_by?: string | null
          composite_asset_id?: string
          composite_content_hash?: string
          compositor_version?: string
          concept_revision_id?: string
          id?: string
          readability_contract_version?: string
          readability_evaluator_version?: string
          readability_evidence_hash?: string
          recipe_hash?: string
          recipe_id?: string
          recipe_revision?: number
          structural_composition_fingerprint?: string
          structural_fingerprint_version?: string
          style_provenance_hash?: string
          style_source?: string
          title_revision?: number
          title_revision_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_candidate_revisions_base_artwork_asset_id_fkey"
            columns: ["base_artwork_asset_id"]
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_revisions_candidate_binding_id_fkey"
            columns: ["candidate_binding_id"]
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_revisions_composite_asset_id_fkey"
            columns: ["composite_asset_id"]
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_revisions_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_candidate_set_members: {
        Row: {
          candidate_ordinal: number
          candidate_revision_id: string
          candidate_set_id: string
          created_at: string
          created_by: string | null
          id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          candidate_ordinal: number
          candidate_revision_id: string
          candidate_set_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          candidate_ordinal?: number
          candidate_revision_id?: string
          candidate_set_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_candidate_set_membe_candidate_revision_id_worksp_fkey"
            columns: ["candidate_revision_id", "workspace_id", "workpiece_id"]
            referencedRelation: "thumbnail_candidate_revisions"
            referencedColumns: ["id", "workspace_id", "workpiece_id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_set_membe_candidate_set_id_workspace_i_fkey"
            columns: ["candidate_set_id", "workspace_id", "workpiece_id"]
            referencedRelation: "thumbnail_candidate_sets"
            referencedColumns: ["id", "workspace_id", "workpiece_id"]
          },
        ]
      }
      thumbnail_candidate_set_operations: {
        Row: {
          candidate_set_id: string | null
          created_at: string
          created_by: string | null
          disposition: string
          id: string
          operation_fingerprint: string
          operation_id: string
          result_json: Json
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          candidate_set_id?: string | null
          created_at?: string
          created_by?: string | null
          disposition: string
          id?: string
          operation_fingerprint: string
          operation_id: string
          result_json: Json
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          candidate_set_id?: string | null
          created_at?: string
          created_by?: string | null
          disposition?: string
          id?: string
          operation_fingerprint?: string
          operation_id?: string
          result_json?: Json
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_candidate_set_operations_candidate_set_id_fkey"
            columns: ["candidate_set_id"]
            referencedRelation: "thumbnail_candidate_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_set_operations_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_set_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_candidate_sets: {
        Row: {
          candidate_count: number
          committed_at: string
          committed_by: string | null
          content_hash: string
          distinction_contract_version: string
          id: string
          operation_fingerprint: string
          operation_id: string
          previous_candidate_set_id: string | null
          revision: number
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          candidate_count: number
          committed_at?: string
          committed_by?: string | null
          content_hash: string
          distinction_contract_version: string
          id?: string
          operation_fingerprint: string
          operation_id: string
          previous_candidate_set_id?: string | null
          revision: number
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          candidate_count?: number
          committed_at?: string
          committed_by?: string | null
          content_hash?: string
          distinction_contract_version?: string
          id?: string
          operation_fingerprint?: string
          operation_id?: string
          previous_candidate_set_id?: string | null
          revision?: number
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_candidate_sets_previous_candidate_set_id_fkey"
            columns: ["previous_candidate_set_id"]
            referencedRelation: "thumbnail_candidate_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_sets_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_sets_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_launch_experiments: {
        Row: {
          content_hash: string
          created_at: string
          created_by: string
          experiment_identity: string
          experiment_json: Json
          guardrail_metrics: string[]
          hypothesis: string
          id: string
          launch_snapshot_hashes: string[]
          primary_metric: string
          publication_id: string
          revision: number
          state: string
          stopping_conditions: string[]
          window_kind: string
          workspace_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          created_by: string
          experiment_identity: string
          experiment_json: Json
          guardrail_metrics: string[]
          hypothesis: string
          id?: string
          launch_snapshot_hashes: string[]
          primary_metric: string
          publication_id: string
          revision: number
          state: string
          stopping_conditions: string[]
          window_kind: string
          workspace_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          created_by?: string
          experiment_identity?: string
          experiment_json?: Json
          guardrail_metrics?: string[]
          hypothesis?: string
          id?: string
          launch_snapshot_hashes?: string[]
          primary_metric?: string
          publication_id?: string
          revision?: number
          state?: string
          stopping_conditions?: string[]
          window_kind?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_launch_experiments_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_launch_facts: {
        Row: {
          destination: string | null
          fact_json: Json
          id: string
          launch_identity: string
          launch_snapshot_hash: string
          published_at: string | null
          recorded_at: string
          recorded_by: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          destination?: string | null
          fact_json: Json
          id?: string
          launch_identity: string
          launch_snapshot_hash: string
          published_at?: string | null
          recorded_at?: string
          recorded_by: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          destination?: string | null
          fact_json?: Json
          id?: string
          launch_identity?: string
          launch_snapshot_hash?: string
          published_at?: string | null
          recorded_at?: string
          recorded_by?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_launch_facts_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_launch_facts_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_launch_intervals: {
        Row: {
          attribution_json: Json
          content_hash: string
          created_at: string
          created_by: string
          ended_at: string | null
          id: string
          launch_identity: string
          launch_snapshot_hash: string
          platform: string
          predecessor_interval_id: string | null
          publication_id: string
          started_at: string
          state: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          attribution_json: Json
          content_hash: string
          created_at?: string
          created_by: string
          ended_at?: string | null
          id?: string
          launch_identity: string
          launch_snapshot_hash: string
          platform: string
          predecessor_interval_id?: string | null
          publication_id: string
          started_at: string
          state: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          attribution_json?: Json
          content_hash?: string
          created_at?: string
          created_by?: string
          ended_at?: string | null
          id?: string
          launch_identity?: string
          launch_snapshot_hash?: string
          platform?: string
          predecessor_interval_id?: string | null
          publication_id?: string
          started_at?: string
          state?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_launch_intervals_predecessor_interval_id_fkey"
            columns: ["predecessor_interval_id"]
            referencedRelation: "thumbnail_launch_intervals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_launch_intervals_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_launch_intervals_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_ledger_analyses: {
        Row: {
          analysis_identity: string
          analysis_json: Json
          analysis_type: string
          analysis_version: string
          confidence: string
          content_hash: string
          created_at: string
          created_by: string
          evidence_class: string
          id: string
          launch_identities: string[]
          observation_ids: string[]
          workspace_id: string
        }
        Insert: {
          analysis_identity: string
          analysis_json: Json
          analysis_type: string
          analysis_version: string
          confidence: string
          content_hash: string
          created_at?: string
          created_by: string
          evidence_class: string
          id?: string
          launch_identities?: string[]
          observation_ids?: string[]
          workspace_id: string
        }
        Update: {
          analysis_identity?: string
          analysis_json?: Json
          analysis_type?: string
          analysis_version?: string
          confidence?: string
          content_hash?: string
          created_at?: string
          created_by?: string
          evidence_class?: string
          id?: string
          launch_identities?: string[]
          observation_ids?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_ledger_analyses_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_ledger_ingestion_cursors: {
        Row: {
          created_by: string
          cursor_identity: string
          cursor_json: Json
          id: string
          last_error: string | null
          last_success_at: string | null
          provider: string
          publication_id: string
          recorded_at: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_by: string
          cursor_identity: string
          cursor_json: Json
          id?: string
          last_error?: string | null
          last_success_at?: string | null
          provider: string
          publication_id: string
          recorded_at?: string
          status: string
          workspace_id: string
        }
        Update: {
          created_by?: string
          cursor_identity?: string
          cursor_json?: Json
          id?: string
          last_error?: string | null
          last_success_at?: string | null
          provider?: string
          publication_id?: string
          recorded_at?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_ledger_ingestion_cursors_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_memory_interpretations: {
        Row: {
          created_at: string
          created_by: string
          evidence_launch_identities: string[]
          id: string
          interpretation_json: Json
          interpretation_key: string
          observation_type: string
          revision: number
          supersedes_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          evidence_launch_identities?: string[]
          id?: string
          interpretation_json: Json
          interpretation_key: string
          observation_type: string
          revision: number
          supersedes_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          evidence_launch_identities?: string[]
          id?: string
          interpretation_json?: Json
          interpretation_key?: string
          observation_type?: string
          revision?: number
          supersedes_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_memory_interpretations_supersedes_id_fkey"
            columns: ["supersedes_id"]
            referencedRelation: "thumbnail_memory_interpretations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_memory_interpretations_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_performance_observations: {
        Row: {
          audience_segment: string | null
          collected_at: string
          content_hash: string
          created_at: string
          created_by: string
          id: string
          metrics_json: Json
          observed_from: string
          observed_to: string
          provider: string
          provider_observation_id: string
          provider_schema_version: string
          publication_id: string
          raw_observation: Json
          source_payload_hash: string
          supersedes_observation_id: string | null
          timezone: string
          traffic_source: string | null
          workspace_id: string
        }
        Insert: {
          audience_segment?: string | null
          collected_at: string
          content_hash: string
          created_at?: string
          created_by: string
          id?: string
          metrics_json: Json
          observed_from: string
          observed_to: string
          provider: string
          provider_observation_id: string
          provider_schema_version: string
          publication_id: string
          raw_observation: Json
          source_payload_hash: string
          supersedes_observation_id?: string | null
          timezone: string
          traffic_source?: string | null
          workspace_id: string
        }
        Update: {
          audience_segment?: string | null
          collected_at?: string
          content_hash?: string
          created_at?: string
          created_by?: string
          id?: string
          metrics_json?: Json
          observed_from?: string
          observed_to?: string
          provider?: string
          provider_observation_id?: string
          provider_schema_version?: string
          publication_id?: string
          raw_observation?: Json
          source_payload_hash?: string
          supersedes_observation_id?: string | null
          timezone?: string
          traffic_source?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_performance_observatio_supersedes_observation_id_fkey"
            columns: ["supersedes_observation_id"]
            referencedRelation: "thumbnail_performance_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_performance_observations_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
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
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workpiece_brand_binding_operations: {
        Row: {
          binding_id: string | null
          created_at: string
          created_by: string
          disposition: string
          id: string
          intent: string
          operation_fingerprint: string
          operation_id: string
          result_json: Json
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          binding_id?: string | null
          created_at?: string
          created_by: string
          disposition: string
          id?: string
          intent: string
          operation_fingerprint: string
          operation_id: string
          result_json: Json
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          binding_id?: string | null
          created_at?: string
          created_by?: string
          disposition?: string
          id?: string
          intent?: string
          operation_fingerprint?: string
          operation_id?: string
          result_json?: Json
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workpiece_brand_binding_operations_binding_id_fkey"
            columns: ["binding_id"]
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_brand_binding_operations_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_brand_binding_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workpiece_brand_bindings: {
        Row: {
          asset_revision_ids: string[]
          created_at: string
          created_by: string
          id: string
          mutation_reason: string
          operation_fingerprint: string
          operation_id: string
          previous_binding_id: string | null
          profile_content_hash: string | null
          profile_id: string | null
          profile_revision: number | null
          profile_revision_id: string | null
          revision: number
          state: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          asset_revision_ids?: string[]
          created_at?: string
          created_by: string
          id?: string
          mutation_reason: string
          operation_fingerprint: string
          operation_id: string
          previous_binding_id?: string | null
          profile_content_hash?: string | null
          profile_id?: string | null
          profile_revision?: number | null
          profile_revision_id?: string | null
          revision: number
          state: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          asset_revision_ids?: string[]
          created_at?: string
          created_by?: string
          id?: string
          mutation_reason?: string
          operation_fingerprint?: string
          operation_id?: string
          previous_binding_id?: string | null
          profile_content_hash?: string | null
          profile_id?: string | null
          profile_revision?: number | null
          profile_revision_id?: string | null
          revision?: number
          state?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workpiece_brand_bindings_previous_binding_id_fkey"
            columns: ["previous_binding_id"]
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_brand_bindings_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_brand_bindings_profile_revision_id_fkey"
            columns: ["profile_revision_id"]
            referencedRelation: "brand_profile_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_brand_bindings_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_brand_bindings_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      workpiece_image_map_sequences: {
        Row: {
          current_revision: number
          current_revision_id: string | null
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          current_revision?: number
          current_revision_id?: string | null
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          current_revision?: number
          current_revision_id?: string | null
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workpiece_image_map_sequences_current_revision_id_workspac_fkey"
            columns: [
              "current_revision_id",
              "workspace_id",
              "workpiece_id",
              "current_revision",
            ]
            referencedRelation: "image_map_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "workpiece_image_map_sequences_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "workpiece_image_map_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "workpiece_ready_transition_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_ready_script_meta_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_ready_script_meta_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_ready_transition_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workpiece_script_approval_sequences: {
        Row: {
          current_approval_id: string | null
          current_revision: number
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          current_approval_id?: string | null
          current_revision?: number
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          current_approval_id?: string | null
          current_revision?: number
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workpiece_script_approval_seq_current_approval_id_workspac_fkey"
            columns: [
              "current_approval_id",
              "workspace_id",
              "workpiece_id",
              "current_revision",
            ]
            referencedRelation: "script_approval_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "approval_revision",
            ]
          },
          {
            foreignKeyName: "workpiece_script_approval_sequen_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "workpiece_script_approval_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_default_brand_profiles: {
        Row: {
          profile_id: string
          selected_at: string
          selected_by: string
          workspace_id: string
        }
        Insert: {
          profile_id: string
          selected_at?: string
          selected_by: string
          workspace_id: string
        }
        Update: {
          profile_id?: string
          selected_at?: string
          selected_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_default_brand_profiles_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_default_brand_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_grants_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_ready_queue_state_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_style_samples_workspace_id_fkey"
            columns: ["workspace_id"]
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
        }
        Insert: {
          adaptive_style_ai_accelerate_enabled?: boolean
          adaptive_style_alignment_enabled?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id: string
        }
        Update: {
          adaptive_style_ai_accelerate_enabled?: boolean
          adaptive_style_alignment_enabled?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_org_id_fkey"
            columns: ["org_id"]
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
            referencedRelation: "workpiece_ready_transition_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_ready_script_meta_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_ready_script_meta_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "workpiece_ready_transition_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anvil_recording_completion_requests_workpiece_id_fkey"
            columns: ["workpiece_id"]
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anvil_recording_completion_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ai_keys_safe: {
        Row: {
          created_at: string | null
          key_label: string | null
          key_version: number | null
          last_used_at: string | null
          last_validated_at: string | null
          last_validation_status: string | null
          provider: string | null
          provider_account_id: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
          validation_mode: string | null
        }
        Insert: {
          created_at?: string | null
          key_label?: string | null
          key_version?: number | null
          last_used_at?: string | null
          last_validated_at?: string | null
          last_validation_status?: string | null
          provider?: string | null
          provider_account_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          validation_mode?: string | null
        }
        Update: {
          created_at?: string | null
          key_label?: string | null
          key_version?: number | null
          last_used_at?: string | null
          last_validated_at?: string | null
          last_validation_status?: string | null
          provider?: string | null
          provider_account_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          validation_mode?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _insert_missing_org_members_from_teams: {
        Args: { p_org_id?: string }
        Returns: number
      }
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
      append_brand_profile_revision: {
        Args: {
          p_operation_id: string
          p_profile_id: string
          p_rules: Json
          p_workspace_id: string
        }
        Returns: Json
      }
      append_thumbnail_launch_experiment: {
        Args: {
          p_content_hash: string
          p_experiment_identity: string
          p_experiment_json: Json
          p_guardrail_metrics: string[]
          p_hypothesis: string
          p_launch_snapshot_hashes: string[]
          p_primary_metric: string
          p_publication_id: string
          p_state: string
          p_stopping_conditions: string[]
          p_window_kind: string
          p_workspace_id: string
        }
        Returns: {
          experiment_id: string
          revision: number
        }[]
      }
      append_thumbnail_launch_fact: {
        Args: {
          p_destination: string
          p_fact_json: Json
          p_launch_identity: string
          p_launch_snapshot_hash: string
          p_published_at: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: {
          disposition: string
          fact_id: string
        }[]
      }
      append_thumbnail_launch_interval: {
        Args: {
          p_attribution_json: Json
          p_content_hash: string
          p_launch_identity: string
          p_launch_snapshot_hash: string
          p_platform: string
          p_publication_id: string
          p_started_at: string
          p_state: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: {
          disposition: string
          interval_id: string
        }[]
      }
      append_thumbnail_ledger_analysis: {
        Args: {
          p_analysis_identity: string
          p_analysis_json: Json
          p_analysis_type: string
          p_analysis_version: string
          p_confidence: string
          p_content_hash: string
          p_evidence_class: string
          p_launch_identities: string[]
          p_observation_ids: string[]
          p_workspace_id: string
        }
        Returns: {
          analysis_id: string
          disposition: string
        }[]
      }
      append_thumbnail_ledger_ingestion_cursor: {
        Args: {
          p_cursor_identity: string
          p_cursor_json: Json
          p_last_error: string
          p_last_success_at: string
          p_provider: string
          p_publication_id: string
          p_status: string
          p_workspace_id: string
        }
        Returns: {
          cursor_id: string
          disposition: string
        }[]
      }
      append_thumbnail_memory_interpretation: {
        Args: {
          p_evidence_launch_identities: string[]
          p_interpretation_json: Json
          p_interpretation_key: string
          p_observation_type: string
          p_workspace_id: string
        }
        Returns: {
          interpretation_id: string
          revision: number
        }[]
      }
      apply_ai_token_delta: {
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
      begin_broll_operation: {
        Args: {
          p_actor_id: string
          p_beat_id: string
          p_inputs: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_operation_type: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      begin_image_prompt_interpretation: {
        Args: {
          p_actor_id: string
          p_expected_prompt_revision: number
          p_expected_prompt_revision_id: string
          p_image_map_revision_id: string
          p_image_moment_id: string
          p_normalized_inputs_json: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_script_approval_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      begin_thumbnail_brand_setup: {
        Args: {
          p_asset_id: string
          p_expected_binding_revision: number
          p_filename: string
          p_internal_label: string
          p_logo_role: string
          p_mime_type: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_profile_id: string
          p_requested_rules: Json
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      billing_item_is_plan: { Args: { p_item_id: string }; Returns: boolean }
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
      brand_binding_json: { Args: { p_id: string }; Returns: Json }
      brand_revision_is_bindable: {
        Args: {
          p_profile_id: string
          p_revision_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      brand_rule_errors: { Args: { p_rules: Json }; Returns: string[] }
      brand_rules_hash: { Args: { p_rules: Json }; Returns: string }
      can_access_workpiece: {
        Args: { _workpiece_id: string }
        Returns: boolean
      }
      can_access_workspace: {
        Args: { _workspace_id: string }
        Returns: boolean
      }
      clear_workspace_default_brand_profile: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      commit_broll_candidate: {
        Args: {
          p_actor_id: string
          p_license_json: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_prompt_revision_id: string
          p_provenance_json: Json
          p_source_kind: string
        }
        Returns: Json
      }
      commit_broll_plan: {
        Args: {
          p_actor_id: string
          p_beats: Json
          p_expected_revision: number
          p_expected_revision_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_script_approval_id: string
          p_source_context_contract_version: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_broll_prompt_creator_edit: {
        Args: {
          p_actor_id: string
          p_beat_id: string
          p_expected_prompt_revision: number
          p_expected_prompt_revision_id: string
          p_final_prompt: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_broll_prompt_interpretation: {
        Args: {
          p_actor_id: string
          p_final_prompt: string
          p_interpretation_contract_version: string
          p_motion_brief: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_source_beat_revision_id: string
          p_synthesis_contract_version: string
          p_validator_version: string
        }
        Returns: Json
      }
      commit_image_map_revision: {
        Args: {
          p_actor_id: string
          p_affected_entry_ids: string[]
          p_anchor_contract_version: string
          p_document_json: Json
          p_expected_current_revision: number
          p_expected_current_revision_id: string
          p_mutation_kind: string
          p_normalized_mutation_inputs: Json
          p_operation_contract_version: string
          p_operation_id: string
          p_target_script_approval_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_image_prompt_creator_edit: {
        Args: {
          p_actor_id: string
          p_expected_prompt_revision: number
          p_expected_prompt_revision_id: string
          p_final_prompt: string
          p_image_moment_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_image_prompt_interpretation: {
        Args: {
          p_actor_id: string
          p_ai_synthesized_prompt: string
          p_final_prompt: string
          p_interpretation_contract_version: string
          p_interpretation_model: string
          p_interpretation_request_json: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_synthesis_contract_version: string
          p_validator_version: string
          p_visual_brief_json: Json
        }
        Returns: Json
      }
      commit_quench_release_decision: {
        Args: {
          p_active_binding_id: string
          p_assignments: Json
          p_candidate_set_id: string
          p_capability_revision_id: string
          p_decision_kind: string
          p_destination_scope_id: string
          p_expected_decision_id: string
          p_expected_revision: number
          p_intent_state: string
          p_manifest_snapshot_id: string
          p_metadata_hash: string
          p_metadata_revision: number
          p_operation_fingerprint: string
          p_operation_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_script_approval_snapshot: {
        Args: {
          p_actor_id: string
          p_approval_contract_version: string
          p_creator_version_label: string
          p_expected_current_revision: number
          p_operation_id: string
          p_script_text: string
          p_source_file_path: string
          p_source_file_revision: number
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_thumbnail_brand_binding_stage: {
        Args: {
          p_operation_fingerprint: string
          p_operation_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_thumbnail_brand_profile_stage: {
        Args: {
          p_operation_fingerprint: string
          p_operation_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_thumbnail_candidate_set: {
        Args: {
          p_candidates: Json
          p_expected_current_revision: number
          p_operation_fingerprint: string
          p_operation_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
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
      create_brand_profile: {
        Args: {
          p_internal_label: string
          p_operation_id: string
          p_rules: Json
          p_workspace_id: string
        }
        Returns: Json
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
          created_by: string
          ends_at: string | null
          id: string
          starts_at: string
          status: string
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
      decide_thumbnail_candidate_historical_brand: {
        Args: {
          p_active_binding_id: string
          p_candidate_revision_id: string
          p_candidate_set_id: string
          p_decision: string
          p_expected_current_decision_id: string
          p_expected_current_decision_revision: number
          p_operation_fingerprint: string
          p_operation_id: string
          p_reason: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
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
      fail_broll_operation: {
        Args: {
          p_failed_stage: string
          p_failure_code: string
          p_failure_message: string
          p_operation_fingerprint: string
          p_operation_id: string
        }
        Returns: Json
      }
      fail_image_prompt_operation: {
        Args: {
          p_failed_stage: string
          p_failure_code: string
          p_failure_message: string
          p_operation_fingerprint: string
          p_operation_id: string
        }
        Returns: Json
      }
      finalize_brand_asset_revision: {
        Args: {
          p_bytes: number
          p_content_hash: string
          p_duration_ms?: number
          p_has_audio?: boolean
          p_height?: number
          p_operation_id: string
          p_revision_id: string
          p_width?: number
          p_workspace_id: string
        }
        Returns: Json
      }
      get_brand_asset_revision_for_inspection: {
        Args: { p_revision_id: string }
        Returns: Json
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
      get_thumbnail_brand_setup_receipt: {
        Args: { p_operation_id: string; p_workspace_id: string }
        Returns: Json
      }
      get_thumbnail_candidate_set_projection: {
        Args: { p_workpiece_id: string; p_workspace_id: string }
        Returns: Json
      }
      get_thumbnail_ledger_ingestion_cursor: {
        Args: {
          p_provider: string
          p_publication_id: string
          p_workspace_id: string
        }
        Returns: Json
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
      get_workpiece_brand_binding: {
        Args: { p_workpiece_id: string; p_workspace_id: string }
        Returns: Json
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
      has_workspace_role: {
        Args: { _min_role: string; _workspace_id: string }
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
      image_map_plan_provenance: { Args: { p_document: Json }; Returns: string }
      ingest_thumbnail_performance_observation: {
        Args: {
          p_audience_segment: string
          p_collected_at: string
          p_content_hash: string
          p_metrics_json: Json
          p_observed_from: string
          p_observed_to: string
          p_provider: string
          p_provider_observation_id: string
          p_provider_schema_version: string
          p_publication_id: string
          p_raw_observation: Json
          p_source_payload_hash: string
          p_supersedes_observation_id: string
          p_timezone: string
          p_traffic_source: string
          p_workspace_id: string
        }
        Returns: {
          disposition: string
          observation_id: string
        }[]
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
      list_thumbnail_ledger_intelligence: {
        Args: { p_limit?: number; p_workspace_id: string }
        Returns: {
          analyses: Json
          experiments: Json
          freshness: Json
          launch_intervals: Json
          performance_observations: Json
        }[]
      }
      list_thumbnail_memory_projection: {
        Args: { p_limit?: number; p_workspace_id: string }
        Returns: {
          active_interpretations: Json
          launch_facts: Json
        }[]
      }
      list_workspace_brand_library: {
        Args: { p_include_archived?: boolean; p_workspace_id: string }
        Returns: Json
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
      mark_thumbnail_brand_asset_ready: {
        Args: {
          p_actor_id: string
          p_bytes: number
          p_content_hash: string
          p_height?: number
          p_operation_fingerprint: string
          p_operation_id: string
          p_width?: number
          p_workspace_id: string
        }
        Returns: Json
      }
      mutate_workpiece_brand_binding: {
        Args: {
          p_expected_current_revision: number
          p_intent: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_profile_id?: string
          p_profile_revision_id?: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      org_role_rank: { Args: { p_role: string }; Returns: number }
      plan_included_ai_credits: {
        Args: { p_plan_item_id: string }
        Returns: number
      }
      quench_release_decision_applicability: {
        Args: { p_decision_id: string }
        Returns: Json
      }
      read_broll_operation_receipt: {
        Args: { p_operation_id: string; p_workspace_id: string }
        Returns: Json
      }
      read_current_broll_plan: {
        Args: { p_workpiece_id: string; p_workspace_id: string }
        Returns: Json
      }
      read_current_image_prompt: {
        Args: {
          p_image_moment_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_image_prompt_operation_receipt: {
        Args: { p_operation_id: string; p_workspace_id: string }
        Returns: Json
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
      record_broll_provider_or_upload_result: {
        Args: {
          p_operation_fingerprint: string
          p_operation_id: string
          p_result: Json
        }
        Returns: Json
      }
      record_hearth_event: {
        Args: { p_episode_id?: string; p_event_type: string; p_payload?: Json }
        Returns: string
      }
      record_image_prompt_provider_response: {
        Args: {
          p_operation_fingerprint: string
          p_operation_id: string
          p_provider_response_json: Json
        }
        Returns: Json
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
      rename_brand_profile: {
        Args: {
          p_internal_label: string
          p_profile_id: string
          p_workspace_id: string
        }
        Returns: Json
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
      reserve_brand_asset_revision: {
        Args: {
          p_asset_id: string
          p_filename: string
          p_internal_label: string
          p_mime_type: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_profile_id: string
          p_role: string
          p_workspace_id: string
        }
        Returns: Json
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
      resolve_workpiece_brand_default: {
        Args: {
          p_operation_fingerprint: string
          p_operation_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
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
      select_broll_candidate: {
        Args: {
          p_actor_id: string
          p_beat_id: string
          p_candidate_revision_id: string
          p_expected_plan_revision: number
          p_expected_plan_revision_id: string
          p_expected_selection_revision: number
          p_operation_fingerprint: string
          p_operation_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      select_image_map_candidate: {
        Args: {
          p_actor_id: string
          p_candidate_asset_id: string
          p_expected_current_revision: number
          p_expected_current_revision_id: string
          p_image_map_entry_id: string
          p_operation_contract_version: string
          p_operation_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
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
      set_brand_profile_archived: {
        Args: {
          p_archived: boolean
          p_clear_default?: boolean
          p_profile_id: string
          p_replacement_profile_id?: string
          p_workspace_id: string
        }
        Returns: Json
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
      set_workspace_default_brand_profile: {
        Args: { p_profile_id: string; p_workspace_id: string }
        Returns: Json
      }
      snapshot_quench_release_manifest: {
        Args: {
          p_manifest_bytes: string
          p_manifest_hash: string
          p_parsed: Json
          p_ready: boolean
          p_source_revision: number
          p_status: string
          p_validation: Json
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      sync_legacy_profile_from_account_balance: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      thumbnail_brand_setup_asset_hash: {
        Args: { p_workpiece_id: string; p_workspace_id: string }
        Returns: string
      }
      thumbnail_brand_setup_json: { Args: { p_id: string }; Returns: Json }
      thumbnail_candidate_eligibility: {
        Args: { p_active_binding_id: string; p_candidate_id: string }
        Returns: string
      }
      thumbnail_structural_fingerprint: {
        Args: { p_value: Json }
        Returns: string
      }
      thumbnail_title_revision_identity: {
        Args: { p_recipe: Json }
        Returns: string
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
      validate_image_map_visual_brief: {
        Args: { p_brief: Json }
        Returns: string[]
      }
      verify_broll_operation_asset: {
        Args: {
          p_asset_id: string
          p_operation_fingerprint: string
          p_operation_id: string
        }
        Returns: Json
      }
      verify_broll_operation_poster: {
        Args: {
          p_operation_fingerprint: string
          p_operation_id: string
          p_poster_asset_id: string
        }
        Returns: Json
      }
      verify_thumbnail_brand_setup: {
        Args: {
          p_actor_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_workspace_id: string
        }
        Returns: Json
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
  public: {
    Enums: {},
  },
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
    },
  },
} as const
