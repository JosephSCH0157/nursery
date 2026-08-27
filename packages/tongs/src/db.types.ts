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
      ai_credit_corrections: {
        Row: {
          actor_id: string | null
          amount: number
          correction_type: string
          created_at: string
          id: string
          metadata_json: Json
          reason_code: string
          settlement_event_id: number | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          amount: number
          correction_type: string
          created_at?: string
          id: string
          metadata_json?: Json
          reason_code: string
          settlement_event_id?: number | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          amount?: number
          correction_type?: string
          created_at?: string
          id?: string
          metadata_json?: Json
          reason_code?: string
          settlement_event_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_credit_corrections_settlement_event_id_fkey"
            columns: ["settlement_event_id"]
            isOneToOne: false
            referencedRelation: "ai_credit_reservation_events"
            referencedColumns: ["id"]
          },
        ]
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
      ai_credit_quote_usage_components: {
        Row: {
          component_kind: string
          content_hash: string
          created_at: string
          currency: string
          estimated_quantity: number
          id: string
          maximum_quantity: number
          pricing_rate_component_id: string
          quote_id: string
          rate_denominator: number
          rate_numerator: number
          unit_kind: string
        }
        Insert: {
          component_kind: string
          content_hash: string
          created_at?: string
          currency: string
          estimated_quantity: number
          id?: string
          maximum_quantity: number
          pricing_rate_component_id: string
          quote_id: string
          rate_denominator: number
          rate_numerator: number
          unit_kind: string
        }
        Update: {
          component_kind?: string
          content_hash?: string
          created_at?: string
          currency?: string
          estimated_quantity?: number
          id?: string
          maximum_quantity?: number
          pricing_rate_component_id?: string
          quote_id?: string
          rate_denominator?: number
          rate_numerator?: number
          unit_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_credit_quote_usage_components_pricing_rate_component_id_fkey"
            columns: ["pricing_rate_component_id"]
            isOneToOne: false
            referencedRelation: "ai_pricing_rate_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_credit_quote_usage_components_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "ai_credit_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_credit_quotes: {
        Row: {
          authorization_policy_revision: number | null
          authorization_policy_revision_id: string | null
          authorization_provider_expense_basis_micros: number | null
          authorization_text_contingency_micros: number | null
          authorized_customer_ceiling: number | null
          created_at: string
          customer_credit_charge: number
          effective_at: string
          estimated_customer_credit_charge: number | null
          estimated_provider_expense_denominator: number | null
          estimated_provider_expense_micros: number
          estimated_provider_expense_numerator: number | null
          expires_at: string | null
          generation_mode: string
          id: string
          known_image_output_expense_micros: number | null
          known_image_output_tokens: number | null
          maximum_customer_credit_charge: number | null
          maximum_provider_expense_denominator: number | null
          maximum_provider_expense_numerator: number | null
          media_kind: string
          model: string
          operation_id: string
          pricing_contract_version: string
          pricing_policy_revision: number
          pricing_policy_revision_id: string
          prompt_content_hash: string | null
          prompt_revision_id: string | null
          prompt_utf8_bytes: number | null
          provider: string
          provider_billable_units: number
          provider_currency: string
          request_fingerprint: string
          request_parameters: Json
          requested_output_count: number
          reservation_amount: number
          tool: string
          user_id: string
          workpiece_id: string | null
          workspace_id: string | null
        }
        Insert: {
          authorization_policy_revision?: number | null
          authorization_policy_revision_id?: string | null
          authorization_provider_expense_basis_micros?: number | null
          authorization_text_contingency_micros?: number | null
          authorized_customer_ceiling?: number | null
          created_at?: string
          customer_credit_charge: number
          effective_at: string
          estimated_customer_credit_charge?: number | null
          estimated_provider_expense_denominator?: number | null
          estimated_provider_expense_micros: number
          estimated_provider_expense_numerator?: number | null
          expires_at?: string | null
          generation_mode: string
          id: string
          known_image_output_expense_micros?: number | null
          known_image_output_tokens?: number | null
          maximum_customer_credit_charge?: number | null
          maximum_provider_expense_denominator?: number | null
          maximum_provider_expense_numerator?: number | null
          media_kind: string
          model: string
          operation_id: string
          pricing_contract_version?: string
          pricing_policy_revision: number
          pricing_policy_revision_id: string
          prompt_content_hash?: string | null
          prompt_revision_id?: string | null
          prompt_utf8_bytes?: number | null
          provider: string
          provider_billable_units: number
          provider_currency: string
          request_fingerprint: string
          request_parameters: Json
          requested_output_count: number
          reservation_amount: number
          tool: string
          user_id: string
          workpiece_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          authorization_policy_revision?: number | null
          authorization_policy_revision_id?: string | null
          authorization_provider_expense_basis_micros?: number | null
          authorization_text_contingency_micros?: number | null
          authorized_customer_ceiling?: number | null
          created_at?: string
          customer_credit_charge?: number
          effective_at?: string
          estimated_customer_credit_charge?: number | null
          estimated_provider_expense_denominator?: number | null
          estimated_provider_expense_micros?: number
          estimated_provider_expense_numerator?: number | null
          expires_at?: string | null
          generation_mode?: string
          id?: string
          known_image_output_expense_micros?: number | null
          known_image_output_tokens?: number | null
          maximum_customer_credit_charge?: number | null
          maximum_provider_expense_denominator?: number | null
          maximum_provider_expense_numerator?: number | null
          media_kind?: string
          model?: string
          operation_id?: string
          pricing_contract_version?: string
          pricing_policy_revision?: number
          pricing_policy_revision_id?: string
          prompt_content_hash?: string | null
          prompt_revision_id?: string | null
          prompt_utf8_bytes?: number | null
          provider?: string
          provider_billable_units?: number
          provider_currency?: string
          request_fingerprint?: string
          request_parameters?: Json
          requested_output_count?: number
          reservation_amount?: number
          tool?: string
          user_id?: string
          workpiece_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_credit_quotes_authorization_policy_revision_id_fkey"
            columns: ["authorization_policy_revision_id"]
            isOneToOne: false
            referencedRelation: "ai_media_authorization_policy_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_credit_quotes_pricing_policy_revision_id_fkey"
            columns: ["pricing_policy_revision_id"]
            isOneToOne: false
            referencedRelation: "ai_pricing_policy_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_credit_quotes_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_credit_quotes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_credit_reservation_events: {
        Row: {
          actor_id: string | null
          amount: number
          created_at: string
          event_type: string
          id: number
          idempotency_key: string
          metadata_json: Json
          reason: string
          reservation_id: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          amount: number
          created_at?: string
          event_type: string
          id?: number
          idempotency_key: string
          metadata_json?: Json
          reason: string
          reservation_id: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          amount?: number
          created_at?: string
          event_type?: string
          id?: number
          idempotency_key?: string
          metadata_json?: Json
          reason?: string
          reservation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_credit_reservation_events_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "ai_credit_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_credit_reservations: {
        Row: {
          amount: number
          authorization_json: Json
          created_at: string
          id: string
          media_class: string | null
          operation_id: string
          purpose: string
          request_fingerprint: string
          tool: string
          user_id: string
        }
        Insert: {
          amount: number
          authorization_json: Json
          created_at?: string
          id?: string
          media_class?: string | null
          operation_id: string
          purpose: string
          request_fingerprint: string
          tool: string
          user_id: string
        }
        Update: {
          amount?: number
          authorization_json?: Json
          created_at?: string
          id?: string
          media_class?: string | null
          operation_id?: string
          purpose?: string
          request_fingerprint?: string
          tool?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_credit_unfunded_expenses: {
        Row: {
          attempted_charge: number
          created_at: string
          evidence_json: Json
          id: string
          provider_request_id: string | null
          reason_code: string
          user_id: string
        }
        Insert: {
          attempted_charge: number
          created_at?: string
          evidence_json?: Json
          id: string
          provider_request_id?: string | null
          reason_code: string
          user_id: string
        }
        Update: {
          attempted_charge?: number
          created_at?: string
          evidence_json?: Json
          id?: string
          provider_request_id?: string | null
          reason_code?: string
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
      ai_image_output_token_schedules: {
        Row: {
          authorization_policy_revision_id: string
          calculation_evidence_json: Json
          content_hash: string
          created_at: string
          height: number
          id: string
          output_tokens_per_image: number
          quality: string
          size: string
          width: number
        }
        Insert: {
          authorization_policy_revision_id: string
          calculation_evidence_json: Json
          content_hash: string
          created_at?: string
          height: number
          id: string
          output_tokens_per_image: number
          quality: string
          size: string
          width: number
        }
        Update: {
          authorization_policy_revision_id?: string
          calculation_evidence_json?: Json
          content_hash?: string
          created_at?: string
          height?: number
          id?: string
          output_tokens_per_image?: number
          quality?: string
          size?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_image_output_token_schedul_authorization_policy_revisio_fkey"
            columns: ["authorization_policy_revision_id"]
            isOneToOne: false
            referencedRelation: "ai_media_authorization_policy_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_media_authorization_policies: {
        Row: {
          created_at: string
          id: string
          policy_code: string
        }
        Insert: {
          created_at?: string
          id?: string
          policy_code: string
        }
        Update: {
          created_at?: string
          id?: string
          policy_code?: string
        }
        Relationships: []
      }
      ai_media_authorization_policy_revisions: {
        Row: {
          actor_id: string | null
          allowed_request_shapes: Json
          authorization_text_contingency_micros: number
          content_hash: string
          contract_version: string
          created_at: string
          effective_from: string
          effective_through: string | null
          endpoint: string
          id: string
          is_active: boolean
          model_alias: string
          model_snapshot: string
          output_cost_contract_version: string
          policy_id: string
          previous_revision_id: string | null
          prompt_max_utf8_bytes: number
          provenance_json: Json
          provider: string
          request_kind: string
          revision: number
        }
        Insert: {
          actor_id?: string | null
          allowed_request_shapes: Json
          authorization_text_contingency_micros: number
          content_hash: string
          contract_version: string
          created_at?: string
          effective_from: string
          effective_through?: string | null
          endpoint: string
          id: string
          is_active: boolean
          model_alias: string
          model_snapshot: string
          output_cost_contract_version: string
          policy_id: string
          previous_revision_id?: string | null
          prompt_max_utf8_bytes: number
          provenance_json: Json
          provider: string
          request_kind: string
          revision: number
        }
        Update: {
          actor_id?: string | null
          allowed_request_shapes?: Json
          authorization_text_contingency_micros?: number
          content_hash?: string
          contract_version?: string
          created_at?: string
          effective_from?: string
          effective_through?: string | null
          endpoint?: string
          id?: string
          is_active?: boolean
          model_alias?: string
          model_snapshot?: string
          output_cost_contract_version?: string
          policy_id?: string
          previous_revision_id?: string | null
          prompt_max_utf8_bytes?: number
          provenance_json?: Json
          provider?: string
          request_kind?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_media_authorization_policy_revisio_previous_revision_id_fkey"
            columns: ["previous_revision_id"]
            isOneToOne: false
            referencedRelation: "ai_media_authorization_policy_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_media_authorization_policy_revisions_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "ai_media_authorization_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_media_authorization_policy_sequences: {
        Row: {
          current_revision: number
          current_revision_id: string
          policy_id: string
          updated_at: string
        }
        Insert: {
          current_revision: number
          current_revision_id: string
          policy_id: string
          updated_at?: string
        }
        Update: {
          current_revision?: number
          current_revision_id?: string
          policy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_media_authorization_policy_sequence_current_revision_id_fkey"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "ai_media_authorization_policy_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_media_authorization_policy_sequences_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: true
            referencedRelation: "ai_media_authorization_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pricing_policies: {
        Row: {
          created_at: string
          id: string
          policy_code: string
        }
        Insert: {
          created_at?: string
          id?: string
          policy_code: string
        }
        Update: {
          created_at?: string
          id?: string
          policy_code?: string
        }
        Relationships: []
      }
      ai_pricing_policy_revisions: {
        Row: {
          actor_id: string | null
          addon_credits: number
          billable_dimensions: Json
          content_hash: string
          created_at: string
          customer_rounding_rule: string
          effective_from: string
          effective_through: string | null
          endpoint: string | null
          forge_credit_conversion_denominator: number
          forge_credit_conversion_numerator: number
          generation_mode: string
          id: string
          is_active: boolean
          markup_denominator: number
          markup_numerator: number
          media_kind: string
          model: string
          model_snapshot: string | null
          policy_id: string
          previous_revision_id: string | null
          price_source_reference: string
          price_source_type: string
          price_source_version: string | null
          pricing_contract_version: string
          provider: string
          provider_billing_unit: string
          provider_currency: string
          provider_price_micros_per_unit: number
          revision: number
        }
        Insert: {
          actor_id?: string | null
          addon_credits?: number
          billable_dimensions: Json
          content_hash: string
          created_at?: string
          customer_rounding_rule?: string
          effective_from: string
          effective_through?: string | null
          endpoint?: string | null
          forge_credit_conversion_denominator: number
          forge_credit_conversion_numerator: number
          generation_mode: string
          id?: string
          is_active: boolean
          markup_denominator: number
          markup_numerator: number
          media_kind: string
          model: string
          model_snapshot?: string | null
          policy_id: string
          previous_revision_id?: string | null
          price_source_reference: string
          price_source_type: string
          price_source_version?: string | null
          pricing_contract_version?: string
          provider: string
          provider_billing_unit: string
          provider_currency: string
          provider_price_micros_per_unit: number
          revision: number
        }
        Update: {
          actor_id?: string | null
          addon_credits?: number
          billable_dimensions?: Json
          content_hash?: string
          created_at?: string
          customer_rounding_rule?: string
          effective_from?: string
          effective_through?: string | null
          endpoint?: string | null
          forge_credit_conversion_denominator?: number
          forge_credit_conversion_numerator?: number
          generation_mode?: string
          id?: string
          is_active?: boolean
          markup_denominator?: number
          markup_numerator?: number
          media_kind?: string
          model?: string
          model_snapshot?: string | null
          policy_id?: string
          previous_revision_id?: string | null
          price_source_reference?: string
          price_source_type?: string
          price_source_version?: string | null
          pricing_contract_version?: string
          provider?: string
          provider_billing_unit?: string
          provider_currency?: string
          provider_price_micros_per_unit?: number
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_pricing_policy_revisions_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "ai_pricing_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_pricing_policy_revisions_previous_revision_id_fkey"
            columns: ["previous_revision_id"]
            isOneToOne: false
            referencedRelation: "ai_pricing_policy_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pricing_policy_sequences: {
        Row: {
          current_revision: number
          current_revision_id: string
          policy_id: string
          updated_at: string
        }
        Insert: {
          current_revision: number
          current_revision_id: string
          policy_id: string
          updated_at?: string
        }
        Update: {
          current_revision?: number
          current_revision_id?: string
          policy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_pricing_policy_sequences_current_revision_id_fkey"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "ai_pricing_policy_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_pricing_policy_sequences_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: true
            referencedRelation: "ai_pricing_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pricing_rate_components: {
        Row: {
          component_kind: string
          content_hash: string
          created_at: string
          currency: string
          id: string
          metadata_json: Json
          ordinal: number
          pricing_policy_revision_id: string
          rate_denominator: number
          rate_numerator: number
          unit_kind: string
        }
        Insert: {
          component_kind: string
          content_hash: string
          created_at?: string
          currency: string
          id: string
          metadata_json?: Json
          ordinal: number
          pricing_policy_revision_id: string
          rate_denominator: number
          rate_numerator: number
          unit_kind: string
        }
        Update: {
          component_kind?: string
          content_hash?: string
          created_at?: string
          currency?: string
          id?: string
          metadata_json?: Json
          ordinal?: number
          pricing_policy_revision_id?: string
          rate_denominator?: number
          rate_numerator?: number
          unit_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_pricing_rate_components_pricing_policy_revision_id_fkey"
            columns: ["pricing_policy_revision_id"]
            isOneToOne: false
            referencedRelation: "ai_pricing_policy_revisions"
            referencedColumns: ["id"]
          },
        ]
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
      anvil_capture_authorities: {
        Row: { capture_session_id: string; established_at: string; established_by: string; id: string; operation_key: string; provenance: string; ready_transition_id: string | null; recording_session_id: string | null; script_hash: string; script_path: string; script_revision: number; workpiece_id: string; workspace_id: string }
        Insert: { capture_session_id: string; established_at?: string; established_by: string; id?: string; operation_key: string; provenance: string; ready_transition_id?: string | null; recording_session_id?: string | null; script_hash: string; script_path: string; script_revision: number; workpiece_id: string; workspace_id: string }
        Update: { capture_session_id?: string; established_at?: string; established_by?: string; id?: string; operation_key?: string; provenance?: string; ready_transition_id?: string | null; recording_session_id?: string | null; script_hash?: string; script_path?: string; script_revision?: number; workpiece_id?: string; workspace_id?: string }
        Relationships: []
      }
      anvil_recording_completion_requests: {
        Row: {
          capture_session_id: string
          capture_authority_id: string | null
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
          capture_authority_id?: string | null
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
          capture_authority_id?: string | null
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
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      barstock_project_episode_links: {
        Row: {
          created_at: string
          created_by: string | null
          creation_operation_key: string | null
          id: string
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
          {
            foreignKeyName: "barstock_project_episode_links_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barstock_project_episode_links_workspace_id_fkey"
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
            isOneToOne: false
            referencedRelation: "barstock_assignments"
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
            isOneToOne: false
            referencedRelation: "brand_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_asset_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_profile_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "broll_beat_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broll_candidate_revisions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "broll_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broll_candidate_revisions_poster_asset_id_fkey"
            columns: ["poster_asset_id"]
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "broll_candidates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      broll_operation_receipts: {
        Row: {
          ambiguity_reason: string | null
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
          provider_completed_at: string | null
          provider_completed_hash: string | null
          provider_completed_json: Json | null
          provider_last_poll_json: Json | null
          provider_last_polled_at: string | null
          provider_next_poll_at: string | null
          provider_poll_attempt: number
          provider_response_hash: string | null
          provider_response_json: Json | null
          provider_submission_hash: string | null
          provider_submission_json: Json | null
          provider_submitted_at: string | null
          provider_task_id: string | null
          receipt_json: Json | null
          reconciled_at: string | null
          reconciled_by: string | null
          reconciliation_decision: string | null
          resubmission_authorized_at: string | null
          resubmission_authorized_by: string | null
          result_candidate_revision_id: string | null
          result_plan_revision_id: string | null
          result_prompt_revision_id: string | null
          result_selection_id: string | null
          state: string
          submission_attempt_id: string | null
          submission_unknown_at: string | null
          submitting_at: string | null
          transport_evidence_json: Json | null
          updated_at: string
          verified_asset_id: string | null
          verified_poster_asset_id: string | null
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          ambiguity_reason?: string | null
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
          provider_completed_at?: string | null
          provider_completed_hash?: string | null
          provider_completed_json?: Json | null
          provider_last_poll_json?: Json | null
          provider_last_polled_at?: string | null
          provider_next_poll_at?: string | null
          provider_poll_attempt?: number
          provider_response_hash?: string | null
          provider_response_json?: Json | null
          provider_submission_hash?: string | null
          provider_submission_json?: Json | null
          provider_submitted_at?: string | null
          provider_task_id?: string | null
          receipt_json?: Json | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_decision?: string | null
          resubmission_authorized_at?: string | null
          resubmission_authorized_by?: string | null
          result_candidate_revision_id?: string | null
          result_plan_revision_id?: string | null
          result_prompt_revision_id?: string | null
          result_selection_id?: string | null
          state: string
          submission_attempt_id?: string | null
          submission_unknown_at?: string | null
          submitting_at?: string | null
          transport_evidence_json?: Json | null
          updated_at?: string
          verified_asset_id?: string | null
          verified_poster_asset_id?: string | null
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          ambiguity_reason?: string | null
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
          provider_completed_at?: string | null
          provider_completed_hash?: string | null
          provider_completed_json?: Json | null
          provider_last_poll_json?: Json | null
          provider_last_polled_at?: string | null
          provider_next_poll_at?: string | null
          provider_poll_attempt?: number
          provider_response_hash?: string | null
          provider_response_json?: Json | null
          provider_submission_hash?: string | null
          provider_submission_json?: Json | null
          provider_submitted_at?: string | null
          provider_task_id?: string | null
          receipt_json?: Json | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_decision?: string | null
          resubmission_authorized_at?: string | null
          resubmission_authorized_by?: string | null
          result_candidate_revision_id?: string | null
          result_plan_revision_id?: string | null
          result_prompt_revision_id?: string | null
          result_selection_id?: string | null
          state?: string
          submission_attempt_id?: string | null
          submission_unknown_at?: string | null
          submitting_at?: string | null
          transport_evidence_json?: Json | null
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
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broll_operation_receipts_verified_poster_asset_id_fkey"
            columns: ["verified_poster_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broll_operation_receipts_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "broll_operation_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "broll_plan_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "broll_plan_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      broll_prompt_revisions: {
        Row: {
          authority_status: string
          beat_id: string
          content_hash: string
          created_at: string
          created_by: string
          creative_input_hash: string | null
          creator_direction: string | null
          final_prompt: string
          id: string
          immutable_revision_hash: string
          interpretation_contract_version: string
          interpretation_model: string | null
          interpretation_provider: string | null
          interpretation_request_json: Json | null
          motion_brief_json: Json
          origin_operation_fingerprint: string | null
          origin_operation_id: string | null
          previous_revision: number | null
          previous_revision_id: string | null
          prompt_source: string
          provider_response_json: Json | null
          revision: number
          script_approval_id: string | null
          script_approval_revision: number | null
          script_content_hash: string | null
          source_beat_revision: number
          source_beat_revision_id: string
          source_context_json: Json | null
          source_plan_revision: number | null
          source_plan_revision_id: string | null
          synthesis_contract_version: string
          validator_version: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          authority_status?: string
          beat_id: string
          content_hash: string
          created_at?: string
          created_by: string
          creative_input_hash?: string | null
          creator_direction?: string | null
          final_prompt: string
          id?: string
          immutable_revision_hash: string
          interpretation_contract_version: string
          interpretation_model?: string | null
          interpretation_provider?: string | null
          interpretation_request_json?: Json | null
          motion_brief_json: Json
          origin_operation_fingerprint?: string | null
          origin_operation_id?: string | null
          previous_revision?: number | null
          previous_revision_id?: string | null
          prompt_source: string
          provider_response_json?: Json | null
          revision: number
          script_approval_id?: string | null
          script_approval_revision?: number | null
          script_content_hash?: string | null
          source_beat_revision: number
          source_beat_revision_id: string
          source_context_json?: Json | null
          source_plan_revision?: number | null
          source_plan_revision_id?: string | null
          synthesis_contract_version: string
          validator_version: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          authority_status?: string
          beat_id?: string
          content_hash?: string
          created_at?: string
          created_by?: string
          creative_input_hash?: string | null
          creator_direction?: string | null
          final_prompt?: string
          id?: string
          immutable_revision_hash?: string
          interpretation_contract_version?: string
          interpretation_model?: string | null
          interpretation_provider?: string | null
          interpretation_request_json?: Json | null
          motion_brief_json?: Json
          origin_operation_fingerprint?: string | null
          origin_operation_id?: string | null
          previous_revision?: number | null
          previous_revision_id?: string | null
          prompt_source?: string
          provider_response_json?: Json | null
          revision?: number
          script_approval_id?: string | null
          script_approval_revision?: number | null
          script_content_hash?: string | null
          source_beat_revision?: number
          source_beat_revision_id?: string
          source_context_json?: Json | null
          source_plan_revision?: number | null
          source_plan_revision_id?: string | null
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
            isOneToOne: false
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
            foreignKeyName: "broll_prompt_revisions_script_approval_id_workspace_id_wor_fkey"
            columns: [
              "script_approval_id",
              "workspace_id",
              "workpiece_id",
              "script_approval_revision",
            ]
            isOneToOne: false
            referencedRelation: "script_approval_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "approval_revision",
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
            isOneToOne: false
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
            foreignKeyName: "broll_prompt_revisions_source_plan_revision_id_workspace_i_fkey"
            columns: [
              "source_plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "source_plan_revision",
            ]
            isOneToOne: false
            referencedRelation: "broll_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "broll_prompt_revisions_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "broll_prompt_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      broll_prompt_sequences: {
        Row: {
          beat_id: string
          creator_direction: string
          creator_direction_revision: number
          current_prompt_revision: number
          current_prompt_revision_id: string | null
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          beat_id: string
          creator_direction?: string
          creator_direction_revision?: number
          current_prompt_revision?: number
          current_prompt_revision_id?: string | null
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          beat_id?: string
          creator_direction?: string
          creator_direction_revision?: number
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
          {
            foreignKeyName: "episodes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hammer_history_epoch_atomic_parent_evidence: {
        Row: {
          created_at: string
          idempotency_key: string
          parent_bytes: number
          recording_revision_id: string
          transition_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          creation_operation_key?: string | null
          id?: string
          idempotency_key: string
          parent_bytes: number
          recording_revision_id: string
          transition_id: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          creation_operation_key?: string | null
          id?: string
          idempotency_key?: string
          parent_bytes?: number
          recording_revision_id?: string
          transition_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hammer_history_epoch_atomic_parent_evidence_transition_id_fkey"
            columns: ["transition_id"]
            isOneToOne: true
            referencedRelation: "hammer_history_epoch_head_transitions"
            referencedColumns: ["transition_id"]
          },
        ]
      }
      hammer_history_epoch_head_transitions: {
        Row: {
          canonical_recording_id: string
          committed_at: string
          committed_history_path: string
          committed_revision_updated_at: string
          envelope: Json
          epoch_id: string
          expected_history_path: string
          expected_revision_updated_at: string
          head_bytes: number
          head_id: string
          head_registry_revision: number
          head_registry_updated_at: string
          head_sha256: string
          idempotency_key: string
          initiated_by: string
          operation_fingerprint: string
          outcome: string
          parent_head_id: string | null
          parent_registry_revision: number
          parent_registry_updated_at: string
          parent_sha256: string
          recording_revision_id: string
          result_component_authority: Json
          result_editor_state_hash: string
          sequence: number
          transition_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          canonical_recording_id: string
          committed_at?: string
          committed_history_path: string
          committed_revision_updated_at: string
          envelope: Json
          epoch_id: string
          expected_history_path: string
          expected_revision_updated_at: string
          head_bytes: number
          head_id: string
          head_registry_revision: number
          head_registry_updated_at: string
          head_sha256: string
          idempotency_key: string
          initiated_by: string
          operation_fingerprint: string
          outcome: string
          parent_head_id?: string | null
          parent_registry_revision: number
          parent_registry_updated_at: string
          parent_sha256: string
          recording_revision_id: string
          result_component_authority: Json
          result_editor_state_hash: string
          sequence: number
          transition_id?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          canonical_recording_id?: string
          committed_at?: string
          committed_history_path?: string
          committed_revision_updated_at?: string
          envelope?: Json
          epoch_id?: string
          expected_history_path?: string
          expected_revision_updated_at?: string
          head_bytes?: number
          head_id?: string
          head_registry_revision?: number
          head_registry_updated_at?: string
          head_sha256?: string
          idempotency_key?: string
          initiated_by?: string
          operation_fingerprint?: string
          outcome?: string
          parent_head_id?: string | null
          parent_registry_revision?: number
          parent_registry_updated_at?: string
          parent_sha256?: string
          recording_revision_id?: string
          result_component_authority?: Json
          result_editor_state_hash?: string
          sequence?: number
          transition_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hammer_history_epoch_head_transitions_head_identity_fkey"
            columns: [
              "head_id",
              "epoch_id",
              "workspace_id",
              "workpiece_id",
              "canonical_recording_id",
              "recording_revision_id",
            ]
            isOneToOne: false
            referencedRelation: "hammer_history_epoch_heads"
            referencedColumns: [
              "head_id",
              "epoch_id",
              "workspace_id",
              "workpiece_id",
              "canonical_recording_id",
              "recording_revision_id",
            ]
          },
        ]
      }
      hammer_history_epoch_heads: {
        Row: {
          artifact_bytes: number
          artifact_path: string
          artifact_registry_revision: number
          artifact_registry_updated_at: string
          artifact_sha256: string
          base_component_sha256: Json
          base_editor_state_hash: string
          canonical_recording_id: string
          created_at: string
          epoch_id: string
          head_id: string
          initiated_by: string
          parent_head_id: string | null
          parent_kind: string
          parent_path: string
          parent_registry_revision: number
          parent_registry_updated_at: string
          parent_sha256: string
          recording_revision_id: string
          result_component_authority: Json
          result_editor_state_hash: string
          schema_version: number
          sequence: number
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          artifact_bytes: number
          artifact_path: string
          artifact_registry_revision: number
          artifact_registry_updated_at: string
          artifact_sha256: string
          base_component_sha256: Json
          base_editor_state_hash: string
          canonical_recording_id: string
          created_at?: string
          epoch_id: string
          head_id: string
          initiated_by: string
          parent_head_id?: string | null
          parent_kind: string
          parent_path: string
          parent_registry_revision: number
          parent_registry_updated_at: string
          parent_sha256: string
          recording_revision_id: string
          result_component_authority: Json
          result_editor_state_hash: string
          schema_version?: number
          sequence: number
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          artifact_bytes?: number
          artifact_path?: string
          artifact_registry_revision?: number
          artifact_registry_updated_at?: string
          artifact_sha256?: string
          base_component_sha256?: Json
          base_editor_state_hash?: string
          canonical_recording_id?: string
          created_at?: string
          epoch_id?: string
          head_id?: string
          initiated_by?: string
          parent_head_id?: string | null
          parent_kind?: string
          parent_path?: string
          parent_registry_revision?: number
          parent_registry_updated_at?: string
          parent_sha256?: string
          recording_revision_id?: string
          result_component_authority?: Json
          result_editor_state_hash?: string
          schema_version?: number
          sequence?: number
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hammer_history_epoch_heads_epoch_identity_fkey"
            columns: [
              "epoch_id",
              "workspace_id",
              "workpiece_id",
              "canonical_recording_id",
              "recording_revision_id",
            ]
            isOneToOne: false
            referencedRelation: "hammer_history_epochs"
            referencedColumns: [
              "epoch_id",
              "workspace_id",
              "workpiece_id",
              "canonical_recording_id",
              "recording_revision_id",
            ]
          },
        ]
      }
      hammer_history_epoch_transitions: {
        Row: {
          archive_registry_revision: number
          archive_registry_updated_at: string
          canonical_recording_id: string
          committed_at: string
          committed_history_path: string
          committed_revision_updated_at: string
          epoch_artifact_bytes: number
          epoch_artifact_sha256: string
          epoch_id: string
          epoch_registry_revision: number
          epoch_registry_updated_at: string
          expected_history_path: string
          expected_revision_updated_at: string
          idempotency_key: string
          initiated_by: string
          operation_fingerprint: string
          outcome: string
          predecessor_archive_path: string
          predecessor_bytes: number
          predecessor_original_path: string
          predecessor_registry_revision: number
          predecessor_registry_updated_at: string
          predecessor_sha256: string
          recording_revision_id: string
          transition_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          archive_registry_revision: number
          archive_registry_updated_at: string
          canonical_recording_id: string
          committed_at?: string
          committed_history_path: string
          committed_revision_updated_at: string
          epoch_artifact_bytes: number
          epoch_artifact_sha256: string
          epoch_id: string
          epoch_registry_revision: number
          epoch_registry_updated_at: string
          expected_history_path: string
          expected_revision_updated_at: string
          idempotency_key: string
          initiated_by: string
          operation_fingerprint: string
          outcome: string
          predecessor_archive_path: string
          predecessor_bytes: number
          predecessor_original_path: string
          predecessor_registry_revision: number
          predecessor_registry_updated_at: string
          predecessor_sha256: string
          recording_revision_id: string
          transition_id?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          archive_registry_revision?: number
          archive_registry_updated_at?: string
          canonical_recording_id?: string
          committed_at?: string
          committed_history_path?: string
          committed_revision_updated_at?: string
          epoch_artifact_bytes?: number
          epoch_artifact_sha256?: string
          epoch_id?: string
          epoch_registry_revision?: number
          epoch_registry_updated_at?: string
          expected_history_path?: string
          expected_revision_updated_at?: string
          idempotency_key?: string
          initiated_by?: string
          operation_fingerprint?: string
          outcome?: string
          predecessor_archive_path?: string
          predecessor_bytes?: number
          predecessor_original_path?: string
          predecessor_registry_revision?: number
          predecessor_registry_updated_at?: string
          predecessor_sha256?: string
          recording_revision_id?: string
          transition_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hammer_history_epoch_transitions_epoch_identity_fkey"
            columns: [
              "epoch_id",
              "workspace_id",
              "workpiece_id",
              "canonical_recording_id",
              "recording_revision_id",
            ]
            isOneToOne: false
            referencedRelation: "hammer_history_epochs"
            referencedColumns: [
              "epoch_id",
              "workspace_id",
              "workpiece_id",
              "canonical_recording_id",
              "recording_revision_id",
            ]
          },
        ]
      }
      hammer_history_epochs: {
        Row: {
          archive_registry_revision: number
          archive_registry_updated_at: string
          artifact_bytes: number
          artifact_path: string
          artifact_registry_revision: number
          artifact_registry_updated_at: string
          artifact_sha256: string
          base_component_sha256: Json
          base_editor_state_hash: string
          canonical_recording_id: string
          created_at: string
          creation_reason: string
          epoch_id: string
          initiating_user_id: string
          predecessor_archive_path: string
          predecessor_bytes: number
          predecessor_original_path: string
          predecessor_registry_revision: number
          predecessor_registry_updated_at: string
          predecessor_sha256: string
          recording_revision_id: string
          schema_version: number
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          archive_registry_revision: number
          archive_registry_updated_at: string
          artifact_bytes: number
          artifact_path: string
          artifact_registry_revision: number
          artifact_registry_updated_at: string
          artifact_sha256: string
          base_component_sha256: Json
          base_editor_state_hash: string
          canonical_recording_id: string
          created_at?: string
          creation_reason: string
          epoch_id: string
          initiating_user_id: string
          predecessor_archive_path: string
          predecessor_bytes: number
          predecessor_original_path: string
          predecessor_registry_revision: number
          predecessor_registry_updated_at: string
          predecessor_sha256: string
          recording_revision_id: string
          schema_version?: number
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          archive_registry_revision?: number
          archive_registry_updated_at?: string
          artifact_bytes?: number
          artifact_path?: string
          artifact_registry_revision?: number
          artifact_registry_updated_at?: string
          artifact_sha256?: string
          base_component_sha256?: Json
          base_editor_state_hash?: string
          canonical_recording_id?: string
          created_at?: string
          creation_reason?: string
          epoch_id?: string
          initiating_user_id?: string
          predecessor_archive_path?: string
          predecessor_bytes?: number
          predecessor_original_path?: string
          predecessor_registry_revision?: number
          predecessor_registry_updated_at?: string
          predecessor_sha256?: string
          recording_revision_id?: string
          schema_version?: number
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hammer_history_epochs_canonical_recording_id_fkey"
            columns: ["canonical_recording_id"]
            isOneToOne: false
            referencedRelation: "canonical_recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hammer_history_epochs_recording_revision_id_fkey"
            columns: ["recording_revision_id"]
            isOneToOne: false
            referencedRelation: "recording_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hammer_history_epochs_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hammer_history_epochs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
          editorial_authority_fingerprint: string | null
          editorial_authority_path: string | null
          editorial_authority_revision: number
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
          editorial_authority_fingerprint?: string | null
          editorial_authority_path?: string | null
          editorial_authority_revision?: number
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
          editorial_authority_fingerprint?: string | null
          editorial_authority_path?: string | null
          editorial_authority_revision?: number
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "hearth_authority_operation_receipts_workspace_id_fkey"
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "image_map_prompt_operation_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "image_map_prompt_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "image_map_prompt_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "image_map_revisions_workspace_id_fkey"
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
      paid_media_actual_usage_components: {
        Row: {
          component_kind: string
          created_at: string
          evidence_json: Json
          expense_denominator: number
          expense_numerator: number
          id: string
          provider_attempt_id: string
          quantity: number
          rate_denominator: number
          rate_numerator: number
        }
        Insert: {
          component_kind: string
          created_at?: string
          evidence_json?: Json
          expense_denominator: number
          expense_numerator: number
          id?: string
          provider_attempt_id: string
          quantity: number
          rate_denominator: number
          rate_numerator: number
        }
        Update: {
          component_kind?: string
          created_at?: string
          evidence_json?: Json
          expense_denominator?: number
          expense_numerator?: number
          id?: string
          provider_attempt_id?: string
          quantity?: number
          rate_denominator?: number
          rate_numerator?: number
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_actual_usage_components_provider_attempt_id_fkey"
            columns: ["provider_attempt_id"]
            isOneToOne: false
            referencedRelation: "paid_media_provider_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_media_operation_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_ordinal: number
          event_type: string
          evidence_json: Json
          id: string
          paid_media_operation_id: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_ordinal: number
          event_type: string
          evidence_json?: Json
          id: string
          paid_media_operation_id: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_ordinal?: number
          event_type?: string
          evidence_json?: Json
          id?: string
          paid_media_operation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_operation_events_paid_media_operation_id_fkey"
            columns: ["paid_media_operation_id"]
            isOneToOne: false
            referencedRelation: "paid_media_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_media_operations: {
        Row: {
          active_attempt_id: string | null
          actor_id: string
          authorization_policy_revision_id: string
          authorized_customer_ceiling: number
          contract_version: string
          created_at: string
          creator_approval_json: Json
          failure_code: string | null
          failure_message: string | null
          id: string
          media_kind: string
          model_snapshot: string
          operation_fingerprint: string
          operation_id: string
          originating_entity_id: string | null
          originating_tool: string
          pricing_policy_revision_id: string
          prompt_content_hash: string
          prompt_revision_id: string | null
          provider: string
          quote_id: string
          reconciliation_required: boolean
          request_parameters: Json
          reservation_id: string | null
          state: string
          terminal_receipt_json: Json | null
          updated_at: string
          user_id: string
          workpiece_id: string | null
          workspace_id: string | null
        }
        Insert: {
          active_attempt_id?: string | null
          actor_id: string
          authorization_policy_revision_id: string
          authorized_customer_ceiling: number
          contract_version: string
          created_at?: string
          creator_approval_json: Json
          failure_code?: string | null
          failure_message?: string | null
          id: string
          media_kind: string
          model_snapshot: string
          operation_fingerprint: string
          operation_id: string
          originating_entity_id?: string | null
          originating_tool: string
          pricing_policy_revision_id: string
          prompt_content_hash: string
          prompt_revision_id?: string | null
          provider: string
          quote_id: string
          reconciliation_required?: boolean
          request_parameters: Json
          reservation_id?: string | null
          state: string
          terminal_receipt_json?: Json | null
          updated_at?: string
          user_id: string
          workpiece_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          active_attempt_id?: string | null
          actor_id?: string
          authorization_policy_revision_id?: string
          authorized_customer_ceiling?: number
          contract_version?: string
          created_at?: string
          creator_approval_json?: Json
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          media_kind?: string
          model_snapshot?: string
          operation_fingerprint?: string
          operation_id?: string
          originating_entity_id?: string | null
          originating_tool?: string
          pricing_policy_revision_id?: string
          prompt_content_hash?: string
          prompt_revision_id?: string | null
          provider?: string
          quote_id?: string
          reconciliation_required?: boolean
          request_parameters?: Json
          reservation_id?: string | null
          state?: string
          terminal_receipt_json?: Json | null
          updated_at?: string
          user_id?: string
          workpiece_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_active_attempt_fk"
            columns: ["active_attempt_id"]
            isOneToOne: false
            referencedRelation: "paid_media_provider_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_operations_authorization_policy_revision_id_fkey"
            columns: ["authorization_policy_revision_id"]
            isOneToOne: false
            referencedRelation: "ai_media_authorization_policy_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_operations_pricing_policy_revision_id_fkey"
            columns: ["pricing_policy_revision_id"]
            isOneToOne: false
            referencedRelation: "ai_pricing_policy_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_operations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "ai_credit_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_operations_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "ai_credit_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_operations_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_media_pricing_overages: {
        Row: {
          amount_credits: number
          created_at: string
          evidence_json: Json
          id: string
          paid_media_operation_id: string
          provider_expense_denominator: number
          provider_expense_numerator: number
          reason_code: string
          user_id: string
        }
        Insert: {
          amount_credits: number
          created_at?: string
          evidence_json?: Json
          id: string
          paid_media_operation_id: string
          provider_expense_denominator: number
          provider_expense_numerator: number
          reason_code: string
          user_id: string
        }
        Update: {
          amount_credits?: number
          created_at?: string
          evidence_json?: Json
          id?: string
          paid_media_operation_id?: string
          provider_expense_denominator?: number
          provider_expense_numerator?: number
          reason_code?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_pricing_overages_paid_media_operation_id_fkey"
            columns: ["paid_media_operation_id"]
            isOneToOne: true
            referencedRelation: "paid_media_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_media_provider_attempts: {
        Row: {
          completed_at: string | null
          created_at: string
          endpoint: string
          id: string
          model_snapshot: string
          ordinal: number
          paid_media_operation_id: string
          provider: string
          provider_request_id: string | null
          provider_response_id: string | null
          provider_response_json: Json | null
          request_evidence_json: Json
          request_payload_hash: string
          state: string
          submitted_at: string
          transmitted: boolean | null
          transport_evidence_json: Json
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          endpoint: string
          id: string
          model_snapshot: string
          ordinal: number
          paid_media_operation_id: string
          provider: string
          provider_request_id?: string | null
          provider_response_id?: string | null
          provider_response_json?: Json | null
          request_evidence_json: Json
          request_payload_hash: string
          state: string
          submitted_at: string
          transmitted?: boolean | null
          transport_evidence_json?: Json
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          model_snapshot?: string
          ordinal?: number
          paid_media_operation_id?: string
          provider?: string
          provider_request_id?: string | null
          provider_response_id?: string | null
          provider_response_json?: Json | null
          request_evidence_json?: Json
          request_payload_hash?: string
          state?: string
          submitted_at?: string
          transmitted?: boolean | null
          transport_evidence_json?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_provider_attempts_paid_media_operation_id_fkey"
            columns: ["paid_media_operation_id"]
            isOneToOne: false
            referencedRelation: "paid_media_operations"
            referencedColumns: ["id"]
          },
        ]
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "quench_destination_capability_revisions"
            referencedColumns: ["id", "destination_scope_id"]
          },
          {
            foreignKeyName: "quench_destination_scopes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_candidate_assignments_composite_asset_id_fkey"
            columns: ["composite_asset_id"]
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "thumbnail_candidate_sets"
            referencedColumns: ["id", "workspace_id", "workpiece_id"]
          },
          {
            foreignKeyName: "quench_release_decision_revis_capability_revision_id_desti_fkey"
            columns: ["capability_revision_id", "destination_scope_id"]
            isOneToOne: false
            referencedRelation: "quench_destination_capability_revisions"
            referencedColumns: ["id", "destination_scope_id"]
          },
          {
            foreignKeyName: "quench_release_decision_revis_manifest_snapshot_id_workspa_fkey"
            columns: ["manifest_snapshot_id", "workspace_id", "workpiece_id"]
            isOneToOne: false
            referencedRelation: "quench_release_manifest_snapshots"
            referencedColumns: ["id", "workspace_id", "workpiece_id"]
          },
          {
            foreignKeyName: "quench_release_decision_revisions_active_binding_id_fkey"
            columns: ["active_binding_id"]
            isOneToOne: false
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_decision_revisions_destination_scope_id_fkey"
            columns: ["destination_scope_id"]
            isOneToOne: false
            referencedRelation: "quench_destination_scopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_decision_revisions_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_decision_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "quench_destination_scopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_decision_sequences_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_decision_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_manifest_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "quench_destination_scopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_operation_receipts_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quench_release_operation_receipts_workspace_id_fkey"
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
            foreignKeyName: "recording_session_episodes_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_session_episodes_recording_session_id_fkey"
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
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_clip_acquisition_operations: {
        Row: {
          acquisition_type: string
          created_at: string
          created_by: string
          failed_stage: string | null
          failure_code: string | null
          failure_evidence_json: Json | null
          failure_message: string | null
          normalized_inputs_json: Json
          operation_fingerprint: string
          operation_id: string
          opportunity_id: string
          opportunity_revision: number
          opportunity_revision_id: string
          plan_revision: number
          plan_revision_id: string
          receipt_json: Json | null
          result_candidate_revision_id: string | null
          source_evidence_hash: string | null
          source_evidence_json: Json | null
          state: string
          updated_at: string
          verified_poster_asset_id: string | null
          verified_video_asset_id: string | null
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          acquisition_type: string
          created_at?: string
          created_by: string
          failed_stage?: string | null
          failure_code?: string | null
          failure_evidence_json?: Json | null
          failure_message?: string | null
          normalized_inputs_json: Json
          operation_fingerprint: string
          operation_id: string
          opportunity_id: string
          opportunity_revision: number
          opportunity_revision_id: string
          plan_revision: number
          plan_revision_id: string
          receipt_json?: Json | null
          result_candidate_revision_id?: string | null
          source_evidence_hash?: string | null
          source_evidence_json?: Json | null
          state: string
          updated_at?: string
          verified_poster_asset_id?: string | null
          verified_video_asset_id?: string | null
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          acquisition_type?: string
          created_at?: string
          created_by?: string
          failed_stage?: string | null
          failure_code?: string | null
          failure_evidence_json?: Json | null
          failure_message?: string | null
          normalized_inputs_json?: Json
          operation_fingerprint?: string
          operation_id?: string
          opportunity_id?: string
          opportunity_revision?: number
          opportunity_revision_id?: string
          plan_revision?: number
          plan_revision_id?: string
          receipt_json?: Json | null
          result_candidate_revision_id?: string | null
          source_evidence_hash?: string | null
          source_evidence_json?: Json | null
          state?: string
          updated_at?: string
          verified_poster_asset_id?: string | null
          verified_video_asset_id?: string | null
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_clip_acquisition_op_opportunity_revision_id_work_fkey"
            columns: [
              "opportunity_revision_id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
              "opportunity_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_clip_opportunity_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_clip_acquisition_op_plan_revision_id_workspace_i_fkey"
            columns: [
              "plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "plan_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_clip_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_clip_acquisition_op_result_candidate_revision_id_fkey"
            columns: ["result_candidate_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_clip_candidate_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_clip_acquisition_operat_verified_poster_asset_id_fkey"
            columns: ["verified_poster_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_clip_acquisition_operati_verified_video_asset_id_fkey"
            columns: ["verified_video_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_clip_candidate_revisions: {
        Row: {
          asset_content_hash: string
          asset_id: string
          asset_path: string
          attribution_required: boolean
          attribution_text: string | null
          candidate_id: string
          content_hash: string
          created_at: string
          created_by: string
          duration_ms: number
          expires_at: string | null
          id: string
          immutable_revision_hash: string
          license_identifier: string | null
          license_url: string | null
          mime_type: string
          opportunity_id: string
          opportunity_revision: number
          opportunity_revision_id: string
          poster_asset_id: string | null
          provenance_json: Json
          revision: number
          rights_basis: string
          rights_evidence_json: Json
          rights_holder: string | null
          source_revision: number
          source_revision_id: string
          storage_bucket: string
          storage_key: string
          territories: string[] | null
          workpiece_id: string
          workpiece_source_link_revision: number
          workpiece_source_link_revision_id: string
          workspace_id: string
        }
        Insert: {
          asset_content_hash: string
          asset_id: string
          asset_path: string
          attribution_required?: boolean
          attribution_text?: string | null
          candidate_id: string
          content_hash: string
          created_at?: string
          created_by: string
          duration_ms: number
          expires_at?: string | null
          id?: string
          immutable_revision_hash: string
          license_identifier?: string | null
          license_url?: string | null
          mime_type: string
          opportunity_id: string
          opportunity_revision: number
          opportunity_revision_id: string
          poster_asset_id?: string | null
          provenance_json?: Json
          revision: number
          rights_basis: string
          rights_evidence_json?: Json
          rights_holder?: string | null
          source_revision: number
          source_revision_id: string
          storage_bucket: string
          storage_key: string
          territories?: string[] | null
          workpiece_id: string
          workpiece_source_link_revision: number
          workpiece_source_link_revision_id: string
          workspace_id: string
        }
        Update: {
          asset_content_hash?: string
          asset_id?: string
          asset_path?: string
          attribution_required?: boolean
          attribution_text?: string | null
          candidate_id?: string
          content_hash?: string
          created_at?: string
          created_by?: string
          duration_ms?: number
          expires_at?: string | null
          id?: string
          immutable_revision_hash?: string
          license_identifier?: string | null
          license_url?: string | null
          mime_type?: string
          opportunity_id?: string
          opportunity_revision?: number
          opportunity_revision_id?: string
          poster_asset_id?: string | null
          provenance_json?: Json
          revision?: number
          rights_basis?: string
          rights_evidence_json?: Json
          rights_holder?: string | null
          source_revision?: number
          source_revision_id?: string
          storage_bucket?: string
          storage_key?: string
          territories?: string[] | null
          workpiece_id?: string
          workpiece_source_link_revision?: number
          workpiece_source_link_revision_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_clip_candidate_revi_candidate_id_workspace_id_wo_fkey"
            columns: [
              "candidate_id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
            ]
            isOneToOne: false
            referencedRelation: "reference_clip_candidates"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
            ]
          },
          {
            foreignKeyName: "reference_clip_candidate_revi_opportunity_revision_id_work_fkey"
            columns: [
              "opportunity_revision_id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
              "opportunity_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_clip_opportunity_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_clip_candidate_revi_workpiece_source_link_revisi_fkey"
            columns: ["workpiece_source_link_revision_id"]
            isOneToOne: false
            referencedRelation: "workpiece_source_link_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_clip_candidate_revisions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_clip_candidate_revisions_poster_asset_id_fkey"
            columns: ["poster_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_clip_candidate_revisions_source_revision_id_fkey"
            columns: ["source_revision_id"]
            isOneToOne: false
            referencedRelation: "source_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_clip_candidates: {
        Row: {
          created_at: string
          created_by: string
          id: string
          opportunity_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          opportunity_id: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          opportunity_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      reference_clip_operation_receipts: {
        Row: {
          created_at: string
          created_by: string
          normalized_inputs_json: Json
          operation_fingerprint: string
          operation_id: string
          operation_type: string
          opportunity_id: string | null
          receipt_json: Json
          result_candidate_revision_id: string | null
          result_plan_revision_id: string | null
          result_selection_id: string | null
          state: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          normalized_inputs_json?: Json
          operation_fingerprint: string
          operation_id: string
          operation_type: string
          opportunity_id?: string | null
          receipt_json: Json
          result_candidate_revision_id?: string | null
          result_plan_revision_id?: string | null
          result_selection_id?: string | null
          state: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          normalized_inputs_json?: Json
          operation_fingerprint?: string
          operation_id?: string
          operation_type?: string
          opportunity_id?: string | null
          receipt_json?: Json
          result_candidate_revision_id?: string | null
          result_plan_revision_id?: string | null
          result_selection_id?: string | null
          state?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      reference_clip_opportunity_revisions: {
        Row: {
          citation_anchor_json: Json
          content_hash: string
          context_after: string
          context_before: string
          context_focus: string
          created_at: string
          created_by: string
          creator_direction: string | null
          desired_material: string | null
          duration_target_ms: number
          editorial_reason: string | null
          id: string
          immutable_revision_hash: string
          media_range_json: Json
          narrative_purpose: string
          opportunity_id: string
          placement_hint: string
          previous_revision: number | null
          previous_revision_id: string | null
          revision: number
          script_approval_id: string
          script_approval_revision: number
          search_terms: string[]
          source_id: string | null
          source_plan_revision: number
          source_plan_revision_id: string
          source_revision: number | null
          source_revision_id: string | null
          source_status: string
          workpiece_id: string
          workpiece_source_link_id: string | null
          workpiece_source_link_revision: number | null
          workpiece_source_link_revision_id: string | null
          workspace_id: string
        }
        Insert: {
          citation_anchor_json?: Json
          content_hash: string
          context_after?: string
          context_before?: string
          context_focus: string
          created_at?: string
          created_by: string
          creator_direction?: string | null
          desired_material?: string | null
          duration_target_ms: number
          editorial_reason?: string | null
          id?: string
          immutable_revision_hash: string
          media_range_json?: Json
          narrative_purpose: string
          opportunity_id: string
          placement_hint: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          revision: number
          script_approval_id: string
          script_approval_revision: number
          search_terms?: string[]
          source_id?: string | null
          source_plan_revision: number
          source_plan_revision_id: string
          source_revision?: number | null
          source_revision_id?: string | null
          source_status?: string
          workpiece_id: string
          workpiece_source_link_id?: string | null
          workpiece_source_link_revision?: number | null
          workpiece_source_link_revision_id?: string | null
          workspace_id: string
        }
        Update: {
          citation_anchor_json?: Json
          content_hash?: string
          context_after?: string
          context_before?: string
          context_focus?: string
          created_at?: string
          created_by?: string
          creator_direction?: string | null
          desired_material?: string | null
          duration_target_ms?: number
          editorial_reason?: string | null
          id?: string
          immutable_revision_hash?: string
          media_range_json?: Json
          narrative_purpose?: string
          opportunity_id?: string
          placement_hint?: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          revision?: number
          script_approval_id?: string
          script_approval_revision?: number
          search_terms?: string[]
          source_id?: string | null
          source_plan_revision?: number
          source_plan_revision_id?: string
          source_revision?: number | null
          source_revision_id?: string | null
          source_status?: string
          workpiece_id?: string
          workpiece_source_link_id?: string | null
          workpiece_source_link_revision?: number | null
          workpiece_source_link_revision_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_clip_opportunity_re_previous_revision_id_workspa_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
              "previous_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_clip_opportunity_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_clip_opportunity_re_source_plan_revision_id_work_fkey"
            columns: [
              "source_plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "source_plan_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_clip_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_clip_opportunity_re_source_revision_id_workspace_fkey"
            columns: [
              "source_revision_id",
              "workspace_id",
              "source_id",
              "source_revision",
            ]
            isOneToOne: false
            referencedRelation: "source_revisions"
            referencedColumns: ["id", "workspace_id", "source_id", "revision"]
          },
          {
            foreignKeyName: "reference_clip_opportunity_re_workpiece_source_link_revisi_fkey"
            columns: [
              "workpiece_source_link_revision_id",
              "workspace_id",
              "workpiece_id",
              "workpiece_source_link_id",
              "workpiece_source_link_revision",
            ]
            isOneToOne: false
            referencedRelation: "workpiece_source_link_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "link_id",
              "revision",
            ]
          },
        ]
      }
      reference_clip_plan_membership: {
        Row: {
          opportunity_id: string
          opportunity_revision: number
          opportunity_revision_id: string
          ordinal: number
          plan_revision: number
          plan_revision_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          opportunity_id: string
          opportunity_revision: number
          opportunity_revision_id: string
          ordinal: number
          plan_revision: number
          plan_revision_id: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          opportunity_id?: string
          opportunity_revision?: number
          opportunity_revision_id?: string
          ordinal?: number
          plan_revision?: number
          plan_revision_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_clip_plan_membershi_opportunity_revision_id_work_fkey"
            columns: [
              "opportunity_revision_id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
              "opportunity_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_clip_opportunity_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_clip_plan_membershi_plan_revision_id_workspace_i_fkey"
            columns: [
              "plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "plan_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_clip_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
        ]
      }
      reference_clip_plan_revisions: {
        Row: {
          content_hash: string
          contract_version: string
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
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          content_hash: string
          contract_version: string
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
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          content_hash?: string
          contract_version?: string
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
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_clip_plan_revisions_previous_revision_id_workspa_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "previous_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_clip_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_clip_plan_revisions_script_approval_id_workspace_fkey"
            columns: [
              "script_approval_id",
              "workspace_id",
              "workpiece_id",
              "script_approval_revision",
            ]
            isOneToOne: false
            referencedRelation: "script_approval_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "approval_revision",
            ]
          },
          {
            foreignKeyName: "reference_clip_plan_revisions_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "reference_clip_plan_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_clip_plan_sequences: {
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
            foreignKeyName: "reference_clip_plan_sequences_current_plan_revision_id_wor_fkey"
            columns: [
              "current_plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "current_plan_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_clip_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_clip_plan_sequences_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      reference_clip_selections: {
        Row: {
          candidate_revision: number
          candidate_revision_id: string
          created_at: string
          created_by: string
          id: string
          operation_fingerprint: string
          operation_id: string
          opportunity_id: string
          opportunity_revision: number
          opportunity_revision_id: string
          plan_revision: number
          plan_revision_id: string
          previous_revision: number | null
          previous_selection_id: string | null
          revision: number
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          candidate_revision: number
          candidate_revision_id: string
          created_at?: string
          created_by: string
          id?: string
          operation_fingerprint: string
          operation_id: string
          opportunity_id: string
          opportunity_revision: number
          opportunity_revision_id: string
          plan_revision: number
          plan_revision_id: string
          previous_revision?: number | null
          previous_selection_id?: string | null
          revision: number
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          candidate_revision?: number
          candidate_revision_id?: string
          created_at?: string
          created_by?: string
          id?: string
          operation_fingerprint?: string
          operation_id?: string
          opportunity_id?: string
          opportunity_revision?: number
          opportunity_revision_id?: string
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
            foreignKeyName: "reference_clip_selections_candidate_revision_id_fkey"
            columns: ["candidate_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_clip_candidate_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_clip_selections_plan_revision_id_workspace_id_wo_fkey"
            columns: [
              "plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "plan_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_clip_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
        ]
      }
      reference_visual_acquisition_operations: {
        Row: {
          acquisition_type: string
          created_at: string
          created_by: string
          failed_stage: string | null
          failure_code: string | null
          failure_message: string | null
          operation_fingerprint: string
          operation_id: string
          opportunity_revision_id: string
          receipt_json: Json | null
          result_candidate_revision_id: string | null
          rights_declaration_revision_id: string
          source_evidence_json: Json | null
          state: string
          updated_at: string
          verified_asset_id: string | null
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          acquisition_type: string
          created_at?: string
          created_by: string
          failed_stage?: string | null
          failure_code?: string | null
          failure_message?: string | null
          operation_fingerprint: string
          operation_id: string
          opportunity_revision_id: string
          receipt_json?: Json | null
          result_candidate_revision_id?: string | null
          rights_declaration_revision_id: string
          source_evidence_json?: Json | null
          state?: string
          updated_at?: string
          verified_asset_id?: string | null
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          acquisition_type?: string
          created_at?: string
          created_by?: string
          failed_stage?: string | null
          failure_code?: string | null
          failure_message?: string | null
          operation_fingerprint?: string
          operation_id?: string
          opportunity_revision_id?: string
          receipt_json?: Json | null
          result_candidate_revision_id?: string | null
          rights_declaration_revision_id?: string
          source_evidence_json?: Json | null
          state?: string
          updated_at?: string
          verified_asset_id?: string | null
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_acquisition__result_candidate_revision_id_fkey"
            columns: ["result_candidate_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_visual_candidate_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_acquisition__rights_declaration_revision__fkey"
            columns: ["rights_declaration_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_visual_rights_declaration_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_acquisition_operations_verified_asset_id_fkey"
            columns: ["verified_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_visual_asset_restriction_revisions: {
        Row: {
          acted_at: string
          acted_by: string
          asset_id: string
          availability_state: string
          content_hash: string
          decision_note: string | null
          id: string
          immutable_revision_hash: string
          notice_reference: string | null
          previous_revision: number | null
          previous_revision_id: string | null
          reason_code: string
          restriction_id: string
          revision: number
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          acted_at?: string
          acted_by: string
          asset_id: string
          availability_state: string
          content_hash: string
          decision_note?: string | null
          id?: string
          immutable_revision_hash: string
          notice_reference?: string | null
          previous_revision?: number | null
          previous_revision_id?: string | null
          reason_code: string
          restriction_id: string
          revision: number
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          acted_at?: string
          acted_by?: string
          asset_id?: string
          availability_state?: string
          content_hash?: string
          decision_note?: string | null
          id?: string
          immutable_revision_hash?: string
          notice_reference?: string | null
          previous_revision?: number | null
          previous_revision_id?: string | null
          reason_code?: string
          restriction_id?: string
          revision?: number
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_asset_restri_previous_revision_id_workspa_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "restriction_id",
              "previous_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_asset_restriction_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "restriction_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_visual_asset_restriction_revisions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_visual_asset_restriction_sequences: {
        Row: {
          asset_id: string
          current_restriction_revision: number
          current_restriction_revision_id: string
          restriction_id: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          asset_id: string
          current_restriction_revision: number
          current_restriction_revision_id: string
          restriction_id: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          asset_id?: string
          current_restriction_revision?: number
          current_restriction_revision_id?: string
          restriction_id?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_asset_restri_current_restriction_revision_fkey"
            columns: [
              "current_restriction_revision_id",
              "workspace_id",
              "workpiece_id",
              "restriction_id",
              "current_restriction_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_asset_restriction_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "restriction_id",
              "revision",
            ]
          },
        ]
      }
      reference_visual_candidate_revisions: {
        Row: {
          asset_id: string | null
          candidate_id: string
          candidate_kind: string
          canonical_render_hash: string | null
          content_hash: string
          created_at: string
          created_by: string
          id: string
          immutable_revision_hash: string
          opportunity_id: string
          opportunity_revision: number
          opportunity_revision_id: string
          provenance_json: Json
          recipe_revision: number | null
          recipe_revision_id: string | null
          render_receipt_json: Json
          renderer_name: string | null
          renderer_version: string | null
          revision: number
          rights_declaration_revision_id: string | null
          sequence_revision_id: string | null
          source_use_revision_id: string | null
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          asset_id?: string | null
          candidate_id: string
          candidate_kind: string
          canonical_render_hash?: string | null
          content_hash: string
          created_at?: string
          created_by: string
          id?: string
          immutable_revision_hash: string
          opportunity_id: string
          opportunity_revision: number
          opportunity_revision_id: string
          provenance_json?: Json
          recipe_revision?: number | null
          recipe_revision_id?: string | null
          render_receipt_json?: Json
          renderer_name?: string | null
          renderer_version?: string | null
          revision: number
          rights_declaration_revision_id?: string | null
          sequence_revision_id?: string | null
          source_use_revision_id?: string | null
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          asset_id?: string | null
          candidate_id?: string
          candidate_kind?: string
          canonical_render_hash?: string | null
          content_hash?: string
          created_at?: string
          created_by?: string
          id?: string
          immutable_revision_hash?: string
          opportunity_id?: string
          opportunity_revision?: number
          opportunity_revision_id?: string
          provenance_json?: Json
          recipe_revision?: number | null
          recipe_revision_id?: string | null
          render_receipt_json?: Json
          renderer_name?: string | null
          renderer_version?: string | null
          revision?: number
          rights_declaration_revision_id?: string | null
          sequence_revision_id?: string | null
          source_use_revision_id?: string | null
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_candidate_re_candidate_id_workspace_id_wo_fkey"
            columns: [
              "candidate_id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_candidates"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
            ]
          },
          {
            foreignKeyName: "reference_visual_candidate_re_rights_declaration_revision__fkey"
            columns: ["rights_declaration_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_visual_rights_declaration_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_candidate_revision_source_use_revision_id_fkey"
            columns: ["source_use_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_visual_source_use_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_candidate_revisions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_candidate_revisions_recipe_revision_id_fkey"
            columns: ["recipe_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_visual_recipe_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_candidate_revisions_sequence_revision_id_fkey"
            columns: ["sequence_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_visual_sequence_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_visual_candidates: {
        Row: {
          created_at: string
          created_by: string
          id: string
          opportunity_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          opportunity_id: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          opportunity_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      reference_visual_evidence_revisions: {
        Row: {
          category: string | null
          citation_anchor_json: Json
          confirmation_state: string
          confirmed_at: string | null
          confirmed_by: string | null
          content_hash: string
          created_at: string
          created_by: string
          derivation_formula: string | null
          document_locator_json: Json
          evidence_date: string | null
          evidence_id: string
          evidence_role: string
          excerpt_content_hash: string | null
          id: string
          immutable_revision_hash: string
          label: string | null
          media_range_json: Json
          numeric_value: number | null
          opportunity_id: string
          origin: string
          previous_revision: number | null
          previous_revision_id: string | null
          raw_excerpt: string | null
          revision: number
          rounding_rule: string | null
          source_revision: number
          source_revision_id: string
          unit: string | null
          workpiece_id: string
          workpiece_source_link_revision: number
          workpiece_source_link_revision_id: string
          workspace_id: string
        }
        Insert: {
          category?: string | null
          citation_anchor_json?: Json
          confirmation_state: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          content_hash: string
          created_at?: string
          created_by: string
          derivation_formula?: string | null
          document_locator_json?: Json
          evidence_date?: string | null
          evidence_id: string
          evidence_role: string
          excerpt_content_hash?: string | null
          id?: string
          immutable_revision_hash: string
          label?: string | null
          media_range_json?: Json
          numeric_value?: number | null
          opportunity_id: string
          origin: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          raw_excerpt?: string | null
          revision: number
          rounding_rule?: string | null
          source_revision: number
          source_revision_id: string
          unit?: string | null
          workpiece_id: string
          workpiece_source_link_revision: number
          workpiece_source_link_revision_id: string
          workspace_id: string
        }
        Update: {
          category?: string | null
          citation_anchor_json?: Json
          confirmation_state?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          content_hash?: string
          created_at?: string
          created_by?: string
          derivation_formula?: string | null
          document_locator_json?: Json
          evidence_date?: string | null
          evidence_id?: string
          evidence_role?: string
          excerpt_content_hash?: string | null
          id?: string
          immutable_revision_hash?: string
          label?: string | null
          media_range_json?: Json
          numeric_value?: number | null
          opportunity_id?: string
          origin?: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          raw_excerpt?: string | null
          revision?: number
          rounding_rule?: string | null
          source_revision?: number
          source_revision_id?: string
          unit?: string | null
          workpiece_id?: string
          workpiece_source_link_revision?: number
          workpiece_source_link_revision_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_evidence_rev_previous_revision_id_workspa_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "evidence_id",
              "previous_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_evidence_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "evidence_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_visual_evidence_rev_workpiece_source_link_revisi_fkey"
            columns: ["workpiece_source_link_revision_id"]
            isOneToOne: false
            referencedRelation: "workpiece_source_link_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_evidence_revisions_source_revision_id_fkey"
            columns: ["source_revision_id"]
            isOneToOne: false
            referencedRelation: "source_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_visual_evidence_sequences: {
        Row: {
          current_evidence_revision: number
          current_evidence_revision_id: string
          evidence_id: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          current_evidence_revision: number
          current_evidence_revision_id: string
          evidence_id: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          current_evidence_revision?: number
          current_evidence_revision_id?: string
          evidence_id?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_evidence_seq_current_evidence_revision_id_fkey"
            columns: [
              "current_evidence_revision_id",
              "workspace_id",
              "workpiece_id",
              "evidence_id",
              "current_evidence_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_evidence_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "evidence_id",
              "revision",
            ]
          },
        ]
      }
      reference_visual_operation_receipts: {
        Row: {
          created_at: string
          created_by: string
          operation_fingerprint: string
          operation_id: string
          operation_type: string
          receipt_json: Json | null
          result_revision_id: string | null
          state: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          operation_fingerprint: string
          operation_id: string
          operation_type: string
          receipt_json?: Json | null
          result_revision_id?: string | null
          state: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          operation_fingerprint?: string
          operation_id?: string
          operation_type?: string
          receipt_json?: Json | null
          result_revision_id?: string | null
          state?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      reference_visual_opportunity_revisions: {
        Row: {
          citation_anchor_json: Json
          content_hash: string
          context_after: string
          context_before: string
          context_focus: string
          created_at: string
          created_by: string
          creator_direction: string | null
          creator_request_json: Json
          derived_from_opportunity_revision_id: string | null
          desired_material: string
          document_locator_json: Json
          duration_target_ms: number
          editorial_reason: string
          id: string
          immutable_revision_hash: string
          media_range_json: Json
          opportunity_id: string
          opportunity_origin: string
          placement_hint: string
          previous_revision: number | null
          previous_revision_id: string | null
          revision: number
          script_approval_id: string
          script_approval_revision: number
          search_terms: Json
          source_plan_revision: number
          source_plan_revision_id: string
          source_revision: number | null
          source_revision_id: string | null
          source_status: string
          visual_subtype: string
          workpiece_id: string
          workpiece_source_link_revision: number | null
          workpiece_source_link_revision_id: string | null
          workspace_id: string
        }
        Insert: {
          citation_anchor_json?: Json
          content_hash: string
          context_after?: string
          context_before?: string
          context_focus: string
          created_at?: string
          created_by: string
          creator_direction?: string | null
          creator_request_json?: Json
          derived_from_opportunity_revision_id?: string | null
          desired_material: string
          document_locator_json?: Json
          duration_target_ms: number
          editorial_reason: string
          id?: string
          immutable_revision_hash: string
          media_range_json?: Json
          opportunity_id: string
          opportunity_origin?: string
          placement_hint: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          revision: number
          script_approval_id: string
          script_approval_revision: number
          search_terms?: Json
          source_plan_revision: number
          source_plan_revision_id: string
          source_revision?: number | null
          source_revision_id?: string | null
          source_status: string
          visual_subtype: string
          workpiece_id: string
          workpiece_source_link_revision?: number | null
          workpiece_source_link_revision_id?: string | null
          workspace_id: string
        }
        Update: {
          citation_anchor_json?: Json
          content_hash?: string
          context_after?: string
          context_before?: string
          context_focus?: string
          created_at?: string
          created_by?: string
          creator_direction?: string | null
          creator_request_json?: Json
          derived_from_opportunity_revision_id?: string | null
          desired_material?: string
          document_locator_json?: Json
          duration_target_ms?: number
          editorial_reason?: string
          id?: string
          immutable_revision_hash?: string
          media_range_json?: Json
          opportunity_id?: string
          opportunity_origin?: string
          placement_hint?: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          revision?: number
          script_approval_id?: string
          script_approval_revision?: number
          search_terms?: Json
          source_plan_revision?: number
          source_plan_revision_id?: string
          source_revision?: number | null
          source_revision_id?: string | null
          source_status?: string
          visual_subtype?: string
          workpiece_id?: string
          workpiece_source_link_revision?: number | null
          workpiece_source_link_revision_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_opportunity__previous_revision_id_workspa_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
              "previous_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_opportunity_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_visual_opportunity__source_plan_revision_id_work_fkey"
            columns: [
              "source_plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "source_plan_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_visual_opportunity__workpiece_source_link_revisi_fkey"
            columns: ["workpiece_source_link_revision_id"]
            isOneToOne: false
            referencedRelation: "workpiece_source_link_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_opportunity_lineage_fkey"
            columns: ["derived_from_opportunity_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_visual_opportunity_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_opportunity_revisions_source_revision_id_fkey"
            columns: ["source_revision_id"]
            isOneToOne: false
            referencedRelation: "source_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_visual_plan_membership: {
        Row: {
          opportunity_id: string
          opportunity_revision: number
          opportunity_revision_id: string
          ordinal: number
          plan_revision: number
          plan_revision_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          opportunity_id: string
          opportunity_revision: number
          opportunity_revision_id: string
          ordinal: number
          plan_revision: number
          plan_revision_id: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          opportunity_id?: string
          opportunity_revision?: number
          opportunity_revision_id?: string
          ordinal?: number
          plan_revision?: number
          plan_revision_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_plan_members_opportunity_revision_id_work_fkey"
            columns: [
              "opportunity_revision_id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
              "opportunity_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_opportunity_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "opportunity_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_visual_plan_members_plan_revision_id_workspace_i_fkey"
            columns: [
              "plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "plan_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
        ]
      }
      reference_visual_plan_revisions: {
        Row: {
          content_hash: string
          contract_version: string
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
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          content_hash: string
          contract_version: string
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
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          content_hash?: string
          contract_version?: string
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
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_plan_revisio_previous_revision_id_workspa_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "previous_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_visual_plan_revisions_script_approval_id_fkey"
            columns: ["script_approval_id"]
            isOneToOne: false
            referencedRelation: "script_approval_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_plan_revisions_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "reference_visual_plan_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_visual_plan_sequences: {
        Row: {
          current_plan_revision: number
          current_plan_revision_id: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          current_plan_revision: number
          current_plan_revision_id: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          current_plan_revision?: number
          current_plan_revision_id?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_plan_sequenc_current_plan_revision_id_wor_fkey"
            columns: [
              "current_plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "current_plan_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_visual_plan_sequences_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      reference_visual_recipe_revisions: {
        Row: {
          accessibility_text: string
          animation_hints_json: Json
          aspect_ratio: string
          attribution_text: string
          brand_treatment_json: Json
          content_hash: string
          created_at: string
          created_by: string
          evidence_revision_ids: string[]
          id: string
          immutable_revision_hash: string
          opportunity_id: string
          previous_revision: number | null
          previous_revision_id: string | null
          prompt_source: string
          recipe_id: string
          recipe_json: Json
          renderer_contract_version: string
          revision: number
          safe_areas_json: Json
          subtitle: string | null
          title: string
          visual_subtype: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          accessibility_text: string
          animation_hints_json?: Json
          aspect_ratio: string
          attribution_text: string
          brand_treatment_json?: Json
          content_hash: string
          created_at?: string
          created_by: string
          evidence_revision_ids: string[]
          id?: string
          immutable_revision_hash: string
          opportunity_id: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          prompt_source: string
          recipe_id: string
          recipe_json: Json
          renderer_contract_version: string
          revision: number
          safe_areas_json?: Json
          subtitle?: string | null
          title: string
          visual_subtype: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          accessibility_text?: string
          animation_hints_json?: Json
          aspect_ratio?: string
          attribution_text?: string
          brand_treatment_json?: Json
          content_hash?: string
          created_at?: string
          created_by?: string
          evidence_revision_ids?: string[]
          id?: string
          immutable_revision_hash?: string
          opportunity_id?: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          prompt_source?: string
          recipe_id?: string
          recipe_json?: Json
          renderer_contract_version?: string
          revision?: number
          safe_areas_json?: Json
          subtitle?: string | null
          title?: string
          visual_subtype?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_recipe_revis_previous_revision_id_workspa_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "recipe_id",
              "previous_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_recipe_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "recipe_id",
              "revision",
            ]
          },
        ]
      }
      reference_visual_recipe_sequences: {
        Row: {
          current_recipe_revision: number
          current_recipe_revision_id: string
          opportunity_id: string
          recipe_id: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          current_recipe_revision: number
          current_recipe_revision_id: string
          opportunity_id: string
          recipe_id: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          current_recipe_revision?: number
          current_recipe_revision_id?: string
          opportunity_id?: string
          recipe_id?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_recipe_seque_current_recipe_revision_id_w_fkey"
            columns: [
              "current_recipe_revision_id",
              "workspace_id",
              "workpiece_id",
              "recipe_id",
              "current_recipe_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_recipe_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "recipe_id",
              "revision",
            ]
          },
        ]
      }
      reference_visual_render_operations: {
        Row: {
          created_at: string
          created_by: string
          failed_stage: string | null
          failure_code: string | null
          failure_message: string | null
          operation_fingerprint: string
          operation_id: string
          opportunity_revision_id: string
          output_asset_id: string | null
          receipt_json: Json | null
          recipe_revision_id: string
          render_evidence_json: Json | null
          renderer_name: string
          renderer_version: string
          result_candidate_revision_id: string | null
          rights_declaration_revision_id: string | null
          source_use_revision_id: string | null
          state: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          failed_stage?: string | null
          failure_code?: string | null
          failure_message?: string | null
          operation_fingerprint: string
          operation_id: string
          opportunity_revision_id: string
          output_asset_id?: string | null
          receipt_json?: Json | null
          recipe_revision_id: string
          render_evidence_json?: Json | null
          renderer_name: string
          renderer_version: string
          result_candidate_revision_id?: string | null
          rights_declaration_revision_id?: string | null
          source_use_revision_id?: string | null
          state?: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          failed_stage?: string | null
          failure_code?: string | null
          failure_message?: string | null
          operation_fingerprint?: string
          operation_id?: string
          opportunity_revision_id?: string
          output_asset_id?: string | null
          receipt_json?: Json | null
          recipe_revision_id?: string
          render_evidence_json?: Json | null
          renderer_name?: string
          renderer_version?: string
          result_candidate_revision_id?: string | null
          rights_declaration_revision_id?: string | null
          source_use_revision_id?: string | null
          state?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_render_opera_result_candidate_revision_id_fkey"
            columns: ["result_candidate_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_visual_candidate_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_render_opera_rights_declaration_revision__fkey"
            columns: ["rights_declaration_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_visual_rights_declaration_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_render_operations_output_asset_id_fkey"
            columns: ["output_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_render_operations_source_use_revision_id_fkey"
            columns: ["source_use_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_visual_source_use_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_visual_rights_declaration_revisions: {
        Row: {
          access_controls_bypassed: boolean
          asserted_at: string
          asserted_by: string
          attribution_required: boolean
          attribution_text: string | null
          content_hash: string
          created_at: string
          creator_acknowledged_responsibility: boolean
          declaration_id: string
          expires_at: string | null
          fair_use_rationale: string | null
          id: string
          immutable_revision_hash: string
          license_identifier: string | null
          license_url: string | null
          opportunity_id: string
          permission_evidence_json: Json
          platform_terms_json: Json
          previous_revision: number | null
          previous_revision_id: string | null
          provenance_json: Json
          revision: number
          rights_holder: string | null
          rights_status: string
          territories: string[] | null
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          access_controls_bypassed?: boolean
          asserted_at?: string
          asserted_by: string
          attribution_required?: boolean
          attribution_text?: string | null
          content_hash: string
          created_at?: string
          creator_acknowledged_responsibility: boolean
          declaration_id: string
          expires_at?: string | null
          fair_use_rationale?: string | null
          id?: string
          immutable_revision_hash: string
          license_identifier?: string | null
          license_url?: string | null
          opportunity_id: string
          permission_evidence_json?: Json
          platform_terms_json?: Json
          previous_revision?: number | null
          previous_revision_id?: string | null
          provenance_json?: Json
          revision: number
          rights_holder?: string | null
          rights_status: string
          territories?: string[] | null
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          access_controls_bypassed?: boolean
          asserted_at?: string
          asserted_by?: string
          attribution_required?: boolean
          attribution_text?: string | null
          content_hash?: string
          created_at?: string
          creator_acknowledged_responsibility?: boolean
          declaration_id?: string
          expires_at?: string | null
          fair_use_rationale?: string | null
          id?: string
          immutable_revision_hash?: string
          license_identifier?: string | null
          license_url?: string | null
          opportunity_id?: string
          permission_evidence_json?: Json
          platform_terms_json?: Json
          previous_revision?: number | null
          previous_revision_id?: string | null
          provenance_json?: Json
          revision?: number
          rights_holder?: string | null
          rights_status?: string
          territories?: string[] | null
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_rights_decla_previous_revision_id_workspa_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "declaration_id",
              "previous_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_rights_declaration_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "declaration_id",
              "revision",
            ]
          },
        ]
      }
      reference_visual_rights_declaration_sequences: {
        Row: {
          current_declaration_revision: number
          current_declaration_revision_id: string
          declaration_id: string
          opportunity_id: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          current_declaration_revision: number
          current_declaration_revision_id: string
          declaration_id: string
          opportunity_id: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          current_declaration_revision?: number
          current_declaration_revision_id?: string
          declaration_id?: string
          opportunity_id?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_rights_decla_current_declaration_revision_fkey"
            columns: [
              "current_declaration_revision_id",
              "workspace_id",
              "workpiece_id",
              "declaration_id",
              "current_declaration_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_rights_declaration_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "declaration_id",
              "revision",
            ]
          },
        ]
      }
      reference_visual_selections: {
        Row: {
          candidate_revision_id: string
          created_at: string
          created_by: string
          id: string
          operation_fingerprint: string
          operation_id: string
          opportunity_id: string
          plan_revision: number
          plan_revision_id: string
          previous_revision: number | null
          previous_selection_id: string | null
          revision: number
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          candidate_revision_id: string
          created_at?: string
          created_by: string
          id?: string
          operation_fingerprint: string
          operation_id: string
          opportunity_id: string
          plan_revision: number
          plan_revision_id: string
          previous_revision?: number | null
          previous_selection_id?: string | null
          revision: number
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          candidate_revision_id?: string
          created_at?: string
          created_by?: string
          id?: string
          operation_fingerprint?: string
          operation_id?: string
          opportunity_id?: string
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
            foreignKeyName: "reference_visual_selections_candidate_revision_id_fkey"
            columns: ["candidate_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_visual_candidate_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_selections_plan_revision_id_workspace_id__fkey"
            columns: [
              "plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "plan_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
        ]
      }
      reference_visual_sequence_membership: {
        Row: {
          asset_id: string
          duration_ms: number | null
          ordinal: number
          sequence_revision_id: string
          source_revision_id: string
          transition_hints_json: Json
          workpiece_id: string
          workpiece_source_link_revision_id: string
          workspace_id: string
        }
        Insert: {
          asset_id: string
          duration_ms?: number | null
          ordinal: number
          sequence_revision_id: string
          source_revision_id: string
          transition_hints_json?: Json
          workpiece_id: string
          workpiece_source_link_revision_id: string
          workspace_id: string
        }
        Update: {
          asset_id?: string
          duration_ms?: number | null
          ordinal?: number
          sequence_revision_id?: string
          source_revision_id?: string
          transition_hints_json?: Json
          workpiece_id?: string
          workpiece_source_link_revision_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_sequence_mem_workpiece_source_link_revisi_fkey"
            columns: ["workpiece_source_link_revision_id"]
            isOneToOne: false
            referencedRelation: "workpiece_source_link_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_sequence_membership_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_sequence_membership_sequence_revision_id_fkey"
            columns: ["sequence_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_visual_sequence_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_sequence_membership_source_revision_id_fkey"
            columns: ["source_revision_id"]
            isOneToOne: false
            referencedRelation: "source_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_visual_sequence_revisions: {
        Row: {
          content_hash: string
          created_at: string
          created_by: string
          id: string
          immutable_revision_hash: string
          opportunity_id: string
          previous_revision: number | null
          previous_revision_id: string | null
          revision: number
          sequence_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          created_by: string
          id?: string
          immutable_revision_hash: string
          opportunity_id: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          revision: number
          sequence_id: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          created_by?: string
          id?: string
          immutable_revision_hash?: string
          opportunity_id?: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          revision?: number
          sequence_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_sequence_rev_previous_revision_id_workspa_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "sequence_id",
              "previous_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_sequence_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "sequence_id",
              "revision",
            ]
          },
        ]
      }
      reference_visual_sequence_sequences: {
        Row: {
          current_sequence_revision: number
          current_sequence_revision_id: string
          opportunity_id: string
          sequence_id: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          current_sequence_revision: number
          current_sequence_revision_id: string
          opportunity_id: string
          sequence_id: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          current_sequence_revision?: number
          current_sequence_revision_id?: string
          opportunity_id?: string
          sequence_id?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_sequence_seq_current_sequence_revision_id_fkey"
            columns: [
              "current_sequence_revision_id",
              "workspace_id",
              "workpiece_id",
              "sequence_id",
              "current_sequence_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_sequence_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "sequence_id",
              "revision",
            ]
          },
        ]
      }
      reference_visual_source_use_revisions: {
        Row: {
          confirmation_note: string | null
          content_hash: string
          created_at: string
          created_by: string
          creator_confirmed: boolean
          id: string
          immutable_revision_hash: string
          opportunity_id: string
          opportunity_revision_id: string
          previous_revision: number | null
          previous_revision_id: string | null
          provenance_json: Json
          revision: number
          source_revision_id: string
          use_classification: string
          use_id: string
          workpiece_id: string
          workpiece_source_link_revision_id: string
          workspace_id: string
        }
        Insert: {
          confirmation_note?: string | null
          content_hash: string
          created_at?: string
          created_by: string
          creator_confirmed: boolean
          id?: string
          immutable_revision_hash: string
          opportunity_id: string
          opportunity_revision_id: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          provenance_json?: Json
          revision: number
          source_revision_id: string
          use_classification: string
          use_id: string
          workpiece_id: string
          workpiece_source_link_revision_id: string
          workspace_id: string
        }
        Update: {
          confirmation_note?: string | null
          content_hash?: string
          created_at?: string
          created_by?: string
          creator_confirmed?: boolean
          id?: string
          immutable_revision_hash?: string
          opportunity_id?: string
          opportunity_revision_id?: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          provenance_json?: Json
          revision?: number
          source_revision_id?: string
          use_classification?: string
          use_id?: string
          workpiece_id?: string
          workpiece_source_link_revision_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_source_use_r_previous_revision_id_workspa_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "use_id",
              "previous_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_source_use_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "use_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "reference_visual_source_use_r_workpiece_source_link_revisi_fkey"
            columns: ["workpiece_source_link_revision_id"]
            isOneToOne: false
            referencedRelation: "workpiece_source_link_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_source_use_revisi_opportunity_revision_id_fkey"
            columns: ["opportunity_revision_id"]
            isOneToOne: false
            referencedRelation: "reference_visual_opportunity_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_visual_source_use_revisions_source_revision_id_fkey"
            columns: ["source_revision_id"]
            isOneToOne: false
            referencedRelation: "source_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_visual_source_use_sequences: {
        Row: {
          current_use_revision: number
          current_use_revision_id: string
          opportunity_id: string
          updated_at: string
          use_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          current_use_revision: number
          current_use_revision_id: string
          opportunity_id: string
          updated_at?: string
          use_id: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          current_use_revision?: number
          current_use_revision_id?: string
          opportunity_id?: string
          updated_at?: string
          use_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_visual_source_use_s_current_use_revision_id_work_fkey"
            columns: [
              "current_use_revision_id",
              "workspace_id",
              "workpiece_id",
              "use_id",
              "current_use_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_source_use_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "use_id",
              "revision",
            ]
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
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "script_approval_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      source_operation_receipts: {
        Row: {
          created_at: string
          created_by: string
          failure_code: string | null
          failure_message: string | null
          link_id: string | null
          normalized_inputs_json: Json
          operation_fingerprint: string
          operation_id: string
          operation_type: string
          receipt_json: Json | null
          result_link_revision_id: string | null
          result_source_revision_id: string | null
          source_id: string | null
          state: string
          updated_at: string
          workpiece_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          failure_code?: string | null
          failure_message?: string | null
          link_id?: string | null
          normalized_inputs_json: Json
          operation_fingerprint: string
          operation_id: string
          operation_type: string
          receipt_json?: Json | null
          result_link_revision_id?: string | null
          result_source_revision_id?: string | null
          source_id?: string | null
          state: string
          updated_at?: string
          workpiece_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          failure_code?: string | null
          failure_message?: string | null
          link_id?: string | null
          normalized_inputs_json?: Json
          operation_fingerprint?: string
          operation_id?: string
          operation_type?: string
          receipt_json?: Json | null
          result_link_revision_id?: string | null
          result_source_revision_id?: string | null
          source_id?: string | null
          state?: string
          updated_at?: string
          workpiece_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_operation_receipts_source_id_workspace_id_fkey"
            columns: ["source_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "source_operation_receipts_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "source_operation_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      source_revisions: {
        Row: {
          author_creator: string | null
          canonical_asset_content_hash: string | null
          canonical_asset_revision_id: string | null
          canonical_url: string | null
          content_hash: string
          created_at: string
          created_by: string
          document_identity: string | null
          id: string
          immutable_revision_hash: string
          metadata_contract_version: string
          metadata_json: Json
          previous_revision: number | null
          previous_revision_id: string | null
          provenance_contract_version: string
          provenance_json: Json
          published_at: string | null
          publisher: string | null
          revision: number
          source_id: string
          source_type: string
          title: string
          workspace_id: string
        }
        Insert: {
          author_creator?: string | null
          canonical_asset_content_hash?: string | null
          canonical_asset_revision_id?: string | null
          canonical_url?: string | null
          content_hash: string
          created_at?: string
          created_by: string
          document_identity?: string | null
          id?: string
          immutable_revision_hash: string
          metadata_contract_version: string
          metadata_json?: Json
          previous_revision?: number | null
          previous_revision_id?: string | null
          provenance_contract_version: string
          provenance_json?: Json
          published_at?: string | null
          publisher?: string | null
          revision: number
          source_id: string
          source_type: string
          title: string
          workspace_id: string
        }
        Update: {
          author_creator?: string | null
          canonical_asset_content_hash?: string | null
          canonical_asset_revision_id?: string | null
          canonical_url?: string | null
          content_hash?: string
          created_at?: string
          created_by?: string
          document_identity?: string | null
          id?: string
          immutable_revision_hash?: string
          metadata_contract_version?: string
          metadata_json?: Json
          previous_revision?: number | null
          previous_revision_id?: string | null
          provenance_contract_version?: string
          provenance_json?: Json
          published_at?: string | null
          publisher?: string | null
          revision?: number
          source_id?: string
          source_type?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_revisions_canonical_asset_revision_id_fkey"
            columns: ["canonical_asset_revision_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_revisions_previous_revision_id_workspace_id_source__fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "source_id",
              "previous_revision",
            ]
            isOneToOne: false
            referencedRelation: "source_revisions"
            referencedColumns: ["id", "workspace_id", "source_id", "revision"]
          },
          {
            foreignKeyName: "source_revisions_source_id_workspace_id_fkey"
            columns: ["source_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      source_sequences: {
        Row: {
          current_source_revision: number
          current_source_revision_id: string
          source_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          current_source_revision: number
          current_source_revision_id: string
          source_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          current_source_revision?: number
          current_source_revision_id?: string
          source_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_sequences_current_source_revision_id_workspace_id_s_fkey"
            columns: [
              "current_source_revision_id",
              "workspace_id",
              "source_id",
              "current_source_revision",
            ]
            isOneToOne: false
            referencedRelation: "source_revisions"
            referencedColumns: ["id", "workspace_id", "source_id", "revision"]
          },
          {
            foreignKeyName: "source_sequences_source_id_workspace_id_fkey"
            columns: ["source_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "source_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          created_at: string
          created_by: string
          id: string
          stable_key: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          stable_key: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          stable_key?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "brand_asset_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_logo_asset_revision_id_fkey"
            columns: ["logo_asset_revision_id"]
            isOneToOne: false
            referencedRelation: "brand_asset_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_previous_binding_id_fkey"
            columns: ["previous_binding_id"]
            isOneToOne: false
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_prior_candidate_set_id_fkey"
            columns: ["prior_candidate_set_id"]
            isOneToOne: false
            referencedRelation: "thumbnail_candidate_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_profile_revision_id_fkey"
            columns: ["profile_revision_id"]
            isOneToOne: false
            referencedRelation: "brand_profile_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_resulting_binding_id_fkey"
            columns: ["resulting_binding_id"]
            isOneToOne: false
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_brand_setup_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "thumbnail_candidate_brand_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_brand_decision_operations_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_brand_decision_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "thumbnail_candidate_revisions"
            referencedColumns: ["id", "workspace_id", "workpiece_id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_brand_decisions_active_binding_id_fkey"
            columns: ["active_binding_id"]
            isOneToOne: false
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_brand_decisions_candidate_binding_id_fkey"
            columns: ["candidate_binding_id"]
            isOneToOne: false
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_brand_decisions_candidate_set_id_fkey"
            columns: ["candidate_set_id"]
            isOneToOne: false
            referencedRelation: "thumbnail_candidate_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_brand_decisions_composite_asset_id_fkey"
            columns: ["composite_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_brand_decisions_previous_decision_id_fkey"
            columns: ["previous_decision_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_revisions_candidate_binding_id_fkey"
            columns: ["candidate_binding_id"]
            isOneToOne: false
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_revisions_composite_asset_id_fkey"
            columns: ["composite_asset_id"]
            isOneToOne: true
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_revisions_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "thumbnail_candidate_revisions"
            referencedColumns: ["id", "workspace_id", "workpiece_id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_set_membe_candidate_set_id_workspace_i_fkey"
            columns: ["candidate_set_id", "workspace_id", "workpiece_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "thumbnail_candidate_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_set_operations_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_set_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "thumbnail_candidate_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_sets_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_candidate_sets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_launch_facts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "thumbnail_launch_intervals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_launch_intervals_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_launch_intervals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "thumbnail_memory_interpretations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_memory_interpretations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "thumbnail_performance_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thumbnail_performance_observations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_visual_plan_operations: {
        Row: {
          broll_plan_content_hash: string | null
          broll_plan_empty: boolean | null
          broll_plan_revision: number | null
          broll_plan_revision_id: string | null
          child_membership_evidence_json: Json
          contract_version: string
          created_at: string
          created_by: string
          expected_reference_visual_revision: number | null
          expected_reference_visual_revision_id: string | null
          failed_stage: string | null
          failure_code: string | null
          failure_message: string | null
          image_map_revision: number | null
          image_map_revision_id: string | null
          image_plan_content_hash: string | null
          image_plan_empty: boolean | null
          normalized_inputs_json: Json
          operation_fingerprint: string
          operation_id: string
          provider_response_hash: string | null
          provider_response_json: Json | null
          receipt_json: Json | null
          reference_clip_plan_content_hash: string | null
          reference_clip_plan_empty: boolean | null
          reference_clip_plan_revision: number | null
          reference_clip_plan_revision_id: string | null
          reference_visual_plan_content_hash: string | null
          reference_visual_plan_empty: boolean | null
          reference_visual_plan_revision: number | null
          reference_visual_plan_revision_id: string | null
          script_approval_id: string
          script_approval_revision: number
          script_content_hash: string
          state: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          broll_plan_content_hash?: string | null
          broll_plan_empty?: boolean | null
          broll_plan_revision?: number | null
          broll_plan_revision_id?: string | null
          child_membership_evidence_json?: Json
          contract_version?: string
          created_at?: string
          created_by: string
          expected_reference_visual_revision?: number | null
          expected_reference_visual_revision_id?: string | null
          failed_stage?: string | null
          failure_code?: string | null
          failure_message?: string | null
          image_map_revision?: number | null
          image_map_revision_id?: string | null
          image_plan_content_hash?: string | null
          image_plan_empty?: boolean | null
          normalized_inputs_json: Json
          operation_fingerprint: string
          operation_id: string
          provider_response_hash?: string | null
          provider_response_json?: Json | null
          receipt_json?: Json | null
          reference_clip_plan_content_hash?: string | null
          reference_clip_plan_empty?: boolean | null
          reference_clip_plan_revision?: number | null
          reference_clip_plan_revision_id?: string | null
          reference_visual_plan_content_hash?: string | null
          reference_visual_plan_empty?: boolean | null
          reference_visual_plan_revision?: number | null
          reference_visual_plan_revision_id?: string | null
          script_approval_id: string
          script_approval_revision: number
          script_content_hash: string
          state?: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          broll_plan_content_hash?: string | null
          broll_plan_empty?: boolean | null
          broll_plan_revision?: number | null
          broll_plan_revision_id?: string | null
          child_membership_evidence_json?: Json
          contract_version?: string
          created_at?: string
          created_by?: string
          expected_reference_visual_revision?: number | null
          expected_reference_visual_revision_id?: string | null
          failed_stage?: string | null
          failure_code?: string | null
          failure_message?: string | null
          image_map_revision?: number | null
          image_map_revision_id?: string | null
          image_plan_content_hash?: string | null
          image_plan_empty?: boolean | null
          normalized_inputs_json?: Json
          operation_fingerprint?: string
          operation_id?: string
          provider_response_hash?: string | null
          provider_response_json?: Json | null
          receipt_json?: Json | null
          reference_clip_plan_content_hash?: string | null
          reference_clip_plan_empty?: boolean | null
          reference_clip_plan_revision?: number | null
          reference_clip_plan_revision_id?: string | null
          reference_visual_plan_content_hash?: string | null
          reference_visual_plan_empty?: boolean | null
          reference_visual_plan_revision?: number | null
          reference_visual_plan_revision_id?: string | null
          script_approval_id?: string
          script_approval_revision?: number
          script_content_hash?: string
          state?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unified_visual_plan_operation_script_approval_id_workspace_fkey"
            columns: [
              "script_approval_id",
              "workspace_id",
              "workpiece_id",
              "script_approval_revision",
            ]
            isOneToOne: false
            referencedRelation: "script_approval_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "approval_revision",
            ]
          },
          {
            foreignKeyName: "unified_visual_plan_operations_reference_visual_plan_fkey"
            columns: [
              "reference_visual_plan_revision_id",
              "workspace_id",
              "workpiece_id",
              "reference_visual_plan_revision",
            ]
            isOneToOne: false
            referencedRelation: "reference_visual_plan_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "unified_visual_plan_operations_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
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
      visual_opportunity_disposition_revisions: {
        Row: {
          child_kind: string
          child_plan_revision: number
          child_plan_revision_id: string
          content_hash: string
          created_at: string
          created_by: string
          creator_note: string | null
          disposition: string
          id: string
          operation_fingerprint: string
          operation_id: string
          opportunity_id: string
          opportunity_revision_identity: string
          previous_revision: number | null
          previous_revision_id: string | null
          revision: number
          skip_reason: string | null
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          child_kind: string
          child_plan_revision: number
          child_plan_revision_id: string
          content_hash: string
          created_at?: string
          created_by: string
          creator_note?: string | null
          disposition: string
          id?: string
          operation_fingerprint: string
          operation_id: string
          opportunity_id: string
          opportunity_revision_identity: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          revision: number
          skip_reason?: string | null
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          child_kind?: string
          child_plan_revision?: number
          child_plan_revision_id?: string
          content_hash?: string
          created_at?: string
          created_by?: string
          creator_note?: string | null
          disposition?: string
          id?: string
          operation_fingerprint?: string
          operation_id?: string
          opportunity_id?: string
          opportunity_revision_identity?: string
          previous_revision?: number | null
          previous_revision_id?: string | null
          revision?: number
          skip_reason?: string | null
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_opportunity_dispositio_previous_revision_id_workspa_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "child_kind",
              "opportunity_id",
              "previous_revision",
            ]
            isOneToOne: false
            referencedRelation: "visual_opportunity_disposition_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "child_kind",
              "opportunity_id",
              "revision",
            ]
          },
        ]
      }
      visual_opportunity_disposition_sequences: {
        Row: {
          child_kind: string
          current_revision: number
          current_revision_id: string
          opportunity_id: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          child_kind: string
          current_revision: number
          current_revision_id: string
          opportunity_id: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          child_kind?: string
          current_revision?: number
          current_revision_id?: string
          opportunity_id?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_opportunity_dispositio_current_revision_id_workspac_fkey"
            columns: [
              "current_revision_id",
              "workspace_id",
              "workpiece_id",
              "child_kind",
              "opportunity_id",
              "current_revision",
            ]
            isOneToOne: false
            referencedRelation: "visual_opportunity_disposition_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "child_kind",
              "opportunity_id",
              "revision",
            ]
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
            isOneToOne: false
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_brand_binding_operations_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_brand_binding_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "workpiece_brand_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_brand_bindings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_brand_bindings_profile_revision_id_fkey"
            columns: ["profile_revision_id"]
            isOneToOne: false
            referencedRelation: "brand_profile_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_brand_bindings_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_brand_bindings_workspace_id_fkey"
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "workpiece_image_map_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
            isOneToOne: false
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
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "workpiece_script_approval_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workpiece_source_link_revisions: {
        Row: {
          citation_anchor_json: Json
          content_hash: string
          created_at: string
          created_by: string
          document_locator_json: Json
          id: string
          immutable_revision_hash: string
          link_id: string
          media_range_json: Json
          previous_revision: number | null
          previous_revision_id: string | null
          provenance_json: Json
          quotation_excerpt_hash: string | null
          relationship_note: string | null
          relationship_type: string
          revision: number
          script_approval_id: string | null
          script_approval_revision: number | null
          source_id: string
          source_revision: number
          source_revision_id: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          citation_anchor_json?: Json
          content_hash: string
          created_at?: string
          created_by: string
          document_locator_json?: Json
          id?: string
          immutable_revision_hash: string
          link_id: string
          media_range_json?: Json
          previous_revision?: number | null
          previous_revision_id?: string | null
          provenance_json?: Json
          quotation_excerpt_hash?: string | null
          relationship_note?: string | null
          relationship_type: string
          revision: number
          script_approval_id?: string | null
          script_approval_revision?: number | null
          source_id: string
          source_revision: number
          source_revision_id: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          citation_anchor_json?: Json
          content_hash?: string
          created_at?: string
          created_by?: string
          document_locator_json?: Json
          id?: string
          immutable_revision_hash?: string
          link_id?: string
          media_range_json?: Json
          previous_revision?: number | null
          previous_revision_id?: string | null
          provenance_json?: Json
          quotation_excerpt_hash?: string | null
          relationship_note?: string | null
          relationship_type?: string
          revision?: number
          script_approval_id?: string | null
          script_approval_revision?: number | null
          source_id?: string
          source_revision?: number
          source_revision_id?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workpiece_source_link_revisio_previous_revision_id_workspa_fkey"
            columns: [
              "previous_revision_id",
              "workspace_id",
              "workpiece_id",
              "link_id",
              "previous_revision",
            ]
            isOneToOne: false
            referencedRelation: "workpiece_source_link_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "link_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "workpiece_source_link_revisio_script_approval_id_workspace_fkey"
            columns: [
              "script_approval_id",
              "workspace_id",
              "workpiece_id",
              "script_approval_revision",
            ]
            isOneToOne: false
            referencedRelation: "script_approval_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "approval_revision",
            ]
          },
          {
            foreignKeyName: "workpiece_source_link_revisio_source_revision_id_workspace_fkey"
            columns: [
              "source_revision_id",
              "workspace_id",
              "source_id",
              "source_revision",
            ]
            isOneToOne: false
            referencedRelation: "source_revisions"
            referencedColumns: ["id", "workspace_id", "source_id", "revision"]
          },
          {
            foreignKeyName: "workpiece_source_link_revisions_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      workpiece_source_link_sequences: {
        Row: {
          current_link_revision: number
          current_link_revision_id: string
          link_id: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          current_link_revision: number
          current_link_revision_id: string
          link_id: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          current_link_revision?: number
          current_link_revision_id?: string
          link_id?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workpiece_source_link_sequenc_current_link_revision_id_wor_fkey"
            columns: [
              "current_link_revision_id",
              "workspace_id",
              "workpiece_id",
              "link_id",
              "current_link_revision",
            ]
            isOneToOne: false
            referencedRelation: "workpiece_source_link_revisions"
            referencedColumns: [
              "id",
              "workspace_id",
              "workpiece_id",
              "link_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "workpiece_source_link_sequences_workpiece_id_workspace_id_fkey"
            columns: ["workpiece_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "workspace_id"]
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
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_default_brand_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
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
      establish_anvil_capture_authority: { Args: { p_capture_session_id: string; p_operation_key: string; p_recording_session_id?: string | null; p_workpiece_id: string; p_workspace_id: string }; Returns: Json }
      anvil_transition_take_completed_v3: { Args: { p_capture_authority_id: string; p_completion_evidence: Json; p_expected_media_bytes: number; p_expected_media_content_type: string; p_expected_media_hash: string; p_expected_media_revision: number; p_idempotency_key: string; p_media_path: string; p_storage_bucket: string; p_storage_key: string }; Returns: Json }
      anvil_transition_take_decision_v2: { Args: { p_capture_authority_id: string; p_completion_id: string; p_decision: string; p_decision_evidence: Json; p_idempotency_key: string }; Returns: Json }
      acknowledge_hammer_editorial_authority: {
        Args: {
          p_canonical_recording_id: string
          p_expected_authority_path: string | null
          p_expected_authority_revision: number
          p_expected_revision_updated_at: string
          p_fingerprint: string
          p_path: string
          p_revision_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      _ai_credit_active_holds: { Args: { p_user_id: string }; Returns: number }
      _ai_pricing_ceil_fraction: {
        Args: { p_denominator: number; p_numerator: number }
        Returns: number
      }
      _ai_pricing_gcd: {
        Args: { p_left: number; p_right: number }
        Returns: number
      }
      _gpt_image_2_output_tokens: {
        Args: { p_height: number; p_quality: string; p_width: number }
        Returns: number
      }
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
      adopt_creator_amended_reference_visual_plan: {
        Args: { p_operation_fingerprint: string; p_operation_id: string }
        Returns: Json
      }
      adopt_legacy_source: {
        Args: {
          p_actor_id: string
          p_author_creator: string
          p_canonical_url: string
          p_citation_anchor_json: Json
          p_document_identity: string
          p_document_locator_json: Json
          p_legacy_links_hash: string
          p_legacy_links_path: string
          p_legacy_links_revision: number
          p_legacy_source_hash: string
          p_legacy_source_id: string
          p_legacy_source_path: string
          p_legacy_source_revision: number
          p_media_range_json: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_published_at: string
          p_publisher: string
          p_quotation_excerpt_hash: string
          p_relationship_note: string
          p_relationship_type: string
          p_script_approval_id: string
          p_script_approval_revision: number
          p_source_type: string
          p_title: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      adopt_repaired_image_map_for_unified_operation: {
        Args: { p_operation_fingerprint: string; p_operation_id: string }
        Returns: Json
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
      append_reference_visual_opportunity: {
        Args: {
          p_actor_id: string
          p_citation_anchor_json: Json
          p_context_after: string
          p_context_before: string
          p_context_focus: string
          p_creator_direction: string
          p_creator_request_json: Json
          p_derived_from_opportunity_revision_id: string
          p_desired_material: string
          p_duration_target_ms: number
          p_editorial_reason: string
          p_expected_plan_revision: number
          p_expected_plan_revision_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_placement_hint: string
          p_script_approval_id: string
          p_script_approval_revision: number
          p_script_content_hash: string
          p_search_terms: Json
          p_visual_subtype: string
          p_workpiece_id: string
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
      apply_ai_credit_correction: {
        Args: {
          p_actor_id: string
          p_amount: number
          p_correction_id: string
          p_correction_type: string
          p_metadata_json?: Json
          p_reason_code: string
          p_settlement_event_id: number
          p_user_id: string
        }
        Returns: Json
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
      approve_and_reserve_paid_media_operation: {
        Args: {
          p_actor_id: string
          p_contract_version: string
          p_creator_approval_json: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_paid_media_operation_id: string
          p_quote_id: string
          p_reservation_id: string
        }
        Returns: Json
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
      assert_current_broll_prompt: {
        Args: {
          p_beat_id: string
          p_prompt_content_hash: string
          p_prompt_revision: number
          p_prompt_revision_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
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
      begin_broll_prompt_interpretation: {
        Args: {
          p_actor_id: string
          p_beat_id: string
          p_creative_input_hash: string
          p_creator_direction: string
          p_expected_prompt_revision: number
          p_expected_prompt_revision_id: string
          p_interpretation_contract_version: string
          p_interpretation_model: string
          p_interpretation_provider: string
          p_interpretation_request: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_synthesis_contract_version: string
          p_validator_version: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      begin_broll_runway_submission: {
        Args: {
          p_actor_id: string
          p_duration_seconds: number
          p_model: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_prompt_content_hash: string
          p_prompt_revision: number
          p_prompt_revision_id: string
          p_ratio: string
          p_submission_attempt_id: string
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
      begin_paid_media_provider_attempt: {
        Args: {
          p_attempt_id: string
          p_operation_fingerprint: string
          p_paid_media_operation_id: string
          p_request_evidence_json: Json
          p_request_payload_hash: string
        }
        Returns: Json
      }
      begin_reference_clip_acquisition: {
        Args: {
          p_acquisition_type: string
          p_actor_id: string
          p_inputs: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_id: string
          p_opportunity_revision: number
          p_opportunity_revision_id: string
          p_plan_revision: number
          p_plan_revision_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      begin_reference_visual_acquisition: {
        Args: {
          p_acquisition_type: string
          p_actor_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_revision_id: string
          p_rights_declaration_revision_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      begin_reference_visual_render: {
        Args: {
          p_actor_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_revision_id: string
          p_recipe_revision_id: string
          p_renderer_name: string
          p_renderer_version: string
          p_rights_declaration_revision_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      begin_reference_visual_render_v2: {
        Args: {
          p_actor_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_revision_id: string
          p_recipe_revision_id: string
          p_renderer_name: string
          p_renderer_version: string
          p_rights_declaration_revision_id: string
          p_source_use_revision_id: string
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
      begin_unified_visual_plan: {
        Args: {
          p_actor_id: string
          p_expected_broll_revision: number
          p_expected_broll_revision_id: string
          p_expected_image_revision: number
          p_expected_image_revision_id: string
          p_expected_reference_revision: number
          p_expected_reference_revision_id: string
          p_expected_reference_visual_revision: number
          p_expected_reference_visual_revision_id: string
          p_normalized_inputs_json: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_script_approval_id: string
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
      broll_current_creative_input: {
        Args: {
          p_beat_id: string
          p_creator_direction: string
          p_interpretation_contract_version: string
          p_synthesis_contract_version: string
          p_workpiece_id: string
          p_workspace_id: string
        }
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
      claim_broll_runway_poll: {
        Args: {
          p_operation_fingerprint: string
          p_operation_id: string
          p_provider_task_id: string
        }
        Returns: Json
      }
      clear_workspace_default_brand_profile: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      commit_ai_pricing_policy_revision: {
        Args: {
          p_actor_id: string
          p_addon_credits: number
          p_billable_dimensions: Json
          p_effective_from: string
          p_effective_through: string
          p_expected_revision: number
          p_forge_credit_conversion_denominator: number
          p_forge_credit_conversion_numerator: number
          p_generation_mode: string
          p_is_active: boolean
          p_markup_denominator: number
          p_markup_numerator: number
          p_media_kind: string
          p_model: string
          p_policy_code: string
          p_price_source_reference: string
          p_price_source_type: string
          p_price_source_version: string
          p_provider: string
          p_provider_billing_unit: string
          p_provider_currency: string
          p_provider_price_micros_per_unit: number
          p_revision_id: string
        }
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
      commit_broll_operation_asset: {
        Args: {
          p_asset_kind: string
          p_byte_size: number
          p_content_hash: string
          p_duration_ms: number
          p_height: number
          p_mime_type: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_path: string
          p_provider: string
          p_provider_request_id: string
          p_storage_bucket: string
          p_storage_key: string
          p_width: number
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
      commit_compound_ai_pricing_policy_revision: {
        Args: {
          p_actor_id: string
          p_addon_credits: number
          p_billable_dimensions: Json
          p_customer_rounding_rule: string
          p_effective_from: string
          p_effective_through: string
          p_endpoint: string
          p_expected_revision: number
          p_forge_credit_conversion_denominator: number
          p_forge_credit_conversion_numerator: number
          p_generation_mode: string
          p_is_active: boolean
          p_markup_denominator: number
          p_markup_numerator: number
          p_media_kind: string
          p_model: string
          p_model_snapshot: string
          p_policy_code: string
          p_price_source_reference: string
          p_price_source_type: string
          p_price_source_version: string
          p_provider: string
          p_provider_currency: string
          p_rate_components: Json
          p_revision_id: string
        }
        Returns: Json
      }
      commit_hammer_history_epoch: {
        Args: {
          p_archive_path: string
          p_archive_registry_revision: number
          p_archive_registry_updated_at: string
          p_base_component_sha256: Json
          p_base_editor_state_hash: string
          p_canonical_recording_id: string
          p_epoch_bytes: number
          p_epoch_id: string
          p_epoch_path: string
          p_epoch_registry_revision: number
          p_epoch_registry_updated_at: string
          p_epoch_sha256: string
          p_expected_history_path: string
          p_expected_revision_updated_at: string
          p_idempotency_key: string
          p_operation_fingerprint: string
          p_predecessor_bytes: number
          p_predecessor_registry_revision: number
          p_predecessor_registry_updated_at: string
          p_predecessor_sha256: string
          p_revision_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      anvil_transition_take_discarded: {
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
      create_hearth_project_episode: {
        Args: {
          p_operation_key: string
          p_project_id: string
          p_title: string
          p_workspace_id: string
        }
        Returns: Json
      }
      list_hearth_project_episodes: {
        Args: { p_project_id: string; p_workspace_id: string }
        Returns: Json
      }
      validate_hearth_project_episode: {
        Args: { p_project_id: string; p_workpiece_id: string; p_workspace_id: string }
        Returns: Json
      }
      read_anvil_pending_take_decisions: {
        Args: { p_workpiece_id: string; p_workspace_id: string }
        Returns: Json
      }
      commit_hammer_history_epoch_head: {
        Args: {
          p_canonical_recording_id: string
          p_envelope: Json
          p_epoch_id: string
          p_expected_history_path: string
          p_expected_revision_updated_at: string
          p_head_bytes: number
          p_head_id: string
          p_head_path: string
          p_head_registry_revision: number
          p_head_registry_updated_at: string
          p_head_sha256: string
          p_idempotency_key: string
          p_operation_fingerprint: string
          p_parent_head_id: string
          p_parent_registry_revision: number
          p_parent_registry_updated_at: string
          p_parent_sha256: string
          p_result_component_authority: Json
          p_result_editor_state_hash: string
          p_revision_id: string
          p_sequence: number
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_hammer_history_epoch_head_with_components: {
        Args: {
          p_canonical_recording_id: string
          p_component_changes: Json
          p_envelope: Json
          p_epoch_id: string
          p_expected_history_path: string
          p_expected_revision_updated_at: string
          p_head_bytes: number
          p_head_id: string
          p_head_path: string
          p_head_registry_revision: number
          p_head_registry_updated_at: string
          p_head_sha256: string
          p_head_storage_bucket: string
          p_head_storage_key: string
          p_idempotency_key: string
          p_operation_fingerprint: string
          p_parent_bytes: number
          p_parent_head_id: string
          p_parent_registry_revision: number
          p_parent_registry_updated_at: string
          p_parent_sha256: string
          p_result_component_authority: Json
          p_result_editor_state_hash: string
          p_revision_id: string
          p_sequence: number
          p_workpiece_id: string
          p_workspace_id: string
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
      commit_reference_clip_acquisition_asset: {
        Args: {
          p_asset_kind: string
          p_byte_size: number
          p_content_hash: string
          p_duration_ms: number
          p_height: number
          p_mime_type: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_path: string
          p_provider: string
          p_provider_request_id: string
          p_storage_bucket: string
          p_storage_key: string
          p_width: number
        }
        Returns: Json
      }
      commit_reference_clip_acquisition_candidate: {
        Args: {
          p_actor_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_provenance: Json
          p_rights: Json
        }
        Returns: Json
      }
      commit_reference_clip_candidate: {
        Args: {
          p_actor_id: string
          p_asset_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_id: string
          p_opportunity_revision_id: string
          p_poster_asset_id: string
          p_provenance: Json
          p_rights: Json
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_reference_clip_plan: {
        Args: {
          p_actor_id: string
          p_contract_version: string
          p_expected_revision: number
          p_expected_revision_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunities: Json
          p_script_approval_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_reference_visual_acquisition: {
        Args: {
          p_byte_size: number
          p_content_hash: string
          p_height: number
          p_mime_type: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_path: string
          p_provenance: Json
          p_storage_bucket: string
          p_storage_key: string
          p_width: number
        }
        Returns: Json
      }
      commit_reference_visual_asset_restriction: {
        Args: {
          p_actor_id: string
          p_asset_id: string
          p_availability_state: string
          p_decision_note: string
          p_expected_revision: number
          p_notice_reference: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_reason_code: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_reference_visual_evidence: {
        Args: {
          p_actor_id: string
          p_confirmation_state: string
          p_evidence: Json
          p_evidence_id: string
          p_expected_revision: number
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_id: string
          p_source_revision_id: string
          p_workpiece_id: string
          p_workpiece_source_link_revision_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_reference_visual_plan: {
        Args: {
          p_actor_id: string
          p_contract_version: string
          p_expected_revision: number
          p_expected_revision_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunities: Json
          p_script_approval_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_reference_visual_recipe: {
        Args: {
          p_accessibility_text: string
          p_actor_id: string
          p_animation_hints: Json
          p_aspect_ratio: string
          p_attribution_text: string
          p_brand_treatment: Json
          p_evidence_revision_ids: string[]
          p_expected_revision: number
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_id: string
          p_prompt_source: string
          p_recipe_id: string
          p_recipe_json: Json
          p_renderer_contract_version: string
          p_safe_areas: Json
          p_subtitle: string
          p_title: string
          p_visual_subtype: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_reference_visual_render: {
        Args: {
          p_byte_size: number
          p_content_hash: string
          p_height: number
          p_mime_type: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_path: string
          p_render_evidence: Json
          p_storage_bucket: string
          p_storage_key: string
          p_width: number
        }
        Returns: Json
      }
      commit_reference_visual_rights_declaration: {
        Args: {
          p_actor_id: string
          p_declaration: Json
          p_declaration_id: string
          p_expected_revision: number
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_id: string
          p_rights_status: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_reference_visual_sequence: {
        Args: {
          p_actor_id: string
          p_expected_revision: number
          p_members: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_revision_id: string
          p_rights_declaration_revision_id: string
          p_sequence_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_reference_visual_source_use: {
        Args: {
          p_actor_id: string
          p_confirmation_note: string
          p_creator_confirmed: boolean
          p_expected_opportunity_revision_id: string
          p_expected_revision: number
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_id: string
          p_provenance_json: Json
          p_source_revision_id: string
          p_use_classification: string
          p_use_id: string
          p_workpiece_id: string
          p_workpiece_source_link_revision_id: string
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
      commit_source_revision: {
        Args: {
          p_actor_id: string
          p_author_creator: string
          p_canonical_asset_content_hash: string
          p_canonical_asset_revision_id: string
          p_canonical_url: string
          p_document_identity: string
          p_expected_revision: number
          p_metadata_contract_version: string
          p_metadata_json: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_provenance_contract_version: string
          p_provenance_json: Json
          p_published_at: string
          p_publisher: string
          p_source_id: string
          p_source_type: string
          p_stable_key: string
          p_title: string
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
      commit_workpiece_source_link_revision: {
        Args: {
          p_actor_id: string
          p_citation_anchor_json: Json
          p_document_locator_json: Json
          p_expected_revision: number
          p_link_id: string
          p_media_range_json: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_provenance_json: Json
          p_quotation_excerpt_hash: string
          p_relationship_note: string
          p_relationship_type: string
          p_script_approval_id: string
          p_script_approval_revision: number
          p_source_revision: number
          p_source_revision_id: string
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
      create_ai_credit_quote: {
        Args: {
          p_effective_at: string
          p_expires_at: string
          p_operation_id: string
          p_pricing_policy_revision_id: string
          p_provider_billable_units: number
          p_quote_id: string
          p_request_fingerprint: string
          p_request_parameters: Json
          p_requested_output_count: number
          p_reservation_amount: number
          p_tool: string
          p_user_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
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
      create_compound_ai_credit_quote: {
        Args: {
          p_effective_at: string
          p_expires_at: string
          p_operation_id: string
          p_pricing_policy_revision_id: string
          p_quote_id: string
          p_request_fingerprint: string
          p_request_parameters: Json
          p_requested_output_count: number
          p_reservation_amount: number
          p_tool: string
          p_usage_estimates: Json
          p_user_id: string
          p_workpiece_id: string
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
      create_paid_image_authorization_quote: {
        Args: {
          p_effective_at: string
          p_expires_at: string
          p_operation_id: string
          p_originating_entity_id: string
          p_output_count: number
          p_prompt: string
          p_prompt_content_hash: string
          p_prompt_revision_id: string
          p_quality: string
          p_quote_id: string
          p_request_fingerprint: string
          p_request_metadata: Json
          p_size: string
          p_tool: string
          p_user_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
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
      fail_reference_clip_acquisition: {
        Args: {
          p_failed_stage: string
          p_failure_code: string
          p_failure_evidence: Json
          p_failure_message: string
          p_operation_fingerprint: string
          p_operation_id: string
        }
        Returns: Json
      }
      fail_reference_visual_operation: {
        Args: {
          p_failed_stage: string
          p_failure_code: string
          p_failure_message: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_operation_kind: string
        }
        Returns: Json
      }
      fail_unified_visual_plan: {
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
      fulfill_reference_clip_opportunity: {
        Args: {
          p_actor_id: string
          p_expected_opportunity_revision: number
          p_expected_opportunity_revision_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_id: string
          p_source_revision_id: string
          p_workpiece_id: string
          p_workpiece_source_link_revision_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      fulfill_reference_visual_opportunity: {
        Args: {
          p_actor_id: string
          p_expected_opportunity_revision: number
          p_expected_opportunity_revision_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_id: string
          p_source_revision_id: string
          p_workpiece_id: string
          p_workpiece_source_link_revision_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      get_brand_asset_revision_for_inspection: {
        Args: { p_revision_id: string }
        Returns: Json
      }
      get_my_ai_credit_account: {
        Args: never
        Returns: {
          available_balance: number
          billing_mode: string
          reserved_balance: number
          settled_balance: number
        }[]
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
      mark_broll_submission_unknown: {
        Args: {
          p_operation_fingerprint: string
          p_operation_id: string
          p_reason: string
          p_submission_attempt_id: string
          p_transport_evidence: Json
        }
        Returns: Json
      }
      mark_paid_media_delivery: {
        Args: {
          p_delivery_evidence_json: Json
          p_operation_fingerprint: string
          p_paid_media_operation_id: string
        }
        Returns: Json
      }
      mark_paid_media_submission_unknown: {
        Args: {
          p_attempt_id: string
          p_evidence_json: Json
          p_failure_code: string
          p_failure_message: string
          p_operation_fingerprint: string
          p_paid_media_operation_id: string
        }
        Returns: Json
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
      read_active_ai_pricing_policies: {
        Args: never
        Returns: {
          actor_id: string | null
          addon_credits: number
          billable_dimensions: Json
          content_hash: string
          created_at: string
          customer_rounding_rule: string
          effective_from: string
          effective_through: string | null
          endpoint: string | null
          forge_credit_conversion_denominator: number
          forge_credit_conversion_numerator: number
          generation_mode: string
          id: string
          is_active: boolean
          markup_denominator: number
          markup_numerator: number
          media_kind: string
          model: string
          model_snapshot: string | null
          policy_id: string
          previous_revision_id: string | null
          price_source_reference: string
          price_source_type: string
          price_source_version: string | null
          pricing_contract_version: string
          provider: string
          provider_billing_unit: string
          provider_currency: string
          provider_price_micros_per_unit: number
          revision: number
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_pricing_policy_revisions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_ai_pricing_policy: {
        Args: { p_pricing_policy_revision_id: string }
        Returns: Json
      }
      read_broll_operation_receipt: {
        Args: { p_operation_id: string; p_workspace_id: string }
        Returns: Json
      }
      read_broll_prompt_status: {
        Args: {
          p_beat_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_broll_runway_operation_status: {
        Args: {
          p_operation_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
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
      read_current_reference_clip_plan: {
        Args: { p_workpiece_id: string; p_workspace_id: string }
        Returns: Json
      }
      is_hammer_history_component_authority: {
        Args: { p_authority: Json }
        Returns: boolean
      }
      is_hammer_history_component_sha256: {
        Args: { p_hashes: Json }
        Returns: boolean
      }
      read_current_reference_visual_plan: {
        Args: { p_workpiece_id: string; p_workspace_id: string }
        Returns: Json
      }
      read_current_source: {
        Args: { p_source_id: string; p_workspace_id: string }
        Returns: Json
      }
      read_hammer_history_epoch_head_operation: {
        Args: {
          p_head_id?: string
          p_idempotency_key: string
          p_operation_fingerprint?: string
          p_revision_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_hammer_history_epoch_head_with_components_operation: {
        Args: {
          p_head_id?: string
          p_idempotency_key: string
          p_operation_fingerprint?: string
          p_revision_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_hammer_history_epoch_operation: {
        Args: {
          p_idempotency_key: string
          p_revision_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_image_prompt_operation_receipt: {
        Args: { p_operation_id: string; p_workspace_id: string }
        Returns: Json
      }
      read_my_ai_credit_quote: {
        Args: { p_quote_id: string }
        Returns: {
          authorization_policy_revision: number | null
          authorization_policy_revision_id: string | null
          authorization_provider_expense_basis_micros: number | null
          authorization_text_contingency_micros: number | null
          authorized_customer_ceiling: number | null
          created_at: string
          customer_credit_charge: number
          effective_at: string
          estimated_customer_credit_charge: number | null
          estimated_provider_expense_denominator: number | null
          estimated_provider_expense_micros: number
          estimated_provider_expense_numerator: number | null
          expires_at: string | null
          generation_mode: string
          id: string
          known_image_output_expense_micros: number | null
          known_image_output_tokens: number | null
          maximum_customer_credit_charge: number | null
          maximum_provider_expense_denominator: number | null
          maximum_provider_expense_numerator: number | null
          media_kind: string
          model: string
          operation_id: string
          pricing_contract_version: string
          pricing_policy_revision: number
          pricing_policy_revision_id: string
          prompt_content_hash: string | null
          prompt_revision_id: string | null
          prompt_utf8_bytes: number | null
          provider: string
          provider_billable_units: number
          provider_currency: string
          request_fingerprint: string
          request_parameters: Json
          requested_output_count: number
          reservation_amount: number
          tool: string
          user_id: string
          workpiece_id: string | null
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "ai_credit_quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      read_my_ai_credit_quote_v2: {
        Args: { p_quote_id: string }
        Returns: Json
      }
      read_my_ai_credit_reservation: {
        Args: { p_reservation_id: string }
        Returns: Json
      }
      read_my_paid_media_operation: {
        Args: { p_paid_media_operation_id: string }
        Returns: Json
      }
      read_reference_clip_acquisition: {
        Args: { p_operation_id: string; p_workspace_id: string }
        Returns: Json
      }
      read_reference_clip_operation_receipt: {
        Args: { p_operation_id: string; p_workspace_id: string }
        Returns: Json
      }
      read_reference_clip_visual_package: {
        Args: { p_workpiece_id: string; p_workspace_id: string }
        Returns: Json
      }
      read_reference_visual_visual_package: {
        Args: { p_workpiece_id: string; p_workspace_id: string }
        Returns: Json
      }
      read_source_operation_receipt: {
        Args: { p_operation_id: string; p_workspace_id: string }
        Returns: Json
      }
      read_unified_visual_plan_operation:
        | {
            Args: { p_operation_id: string; p_workspace_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_operation_id: string
              p_workpiece_id: string
              p_workspace_id: string
            }
            Returns: Json
          }
      read_visual_opportunity_dispositions: {
        Args: { p_workpiece_id: string; p_workspace_id: string }
        Returns: Json
      }
      read_workpiece_sources: {
        Args: { p_workpiece_id: string; p_workspace_id: string }
        Returns: Json
      }
      reassign_reference_clip_source: {
        Args: {
          p_actor_id: string
          p_expected_opportunity_revision: number
          p_expected_opportunity_revision_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_id: string
          p_source_revision_id: string
          p_workpiece_id: string
          p_workpiece_source_link_revision_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      reassign_reference_visual_source: {
        Args: {
          p_actor_id: string
          p_expected_opportunity_revision: number
          p_expected_opportunity_revision_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_id: string
          p_source_revision_id: string
          p_workpiece_id: string
          p_workpiece_source_link_revision_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      recompute_account_balance: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      reconcile_broll_runway_submission: {
        Args: {
          p_actor_id: string
          p_decision: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_provider_task_id: string
          p_task_evidence: Json
        }
        Returns: Json
      }
      record_ai_credit_unfunded_expense: {
        Args: {
          p_attempted_charge: number
          p_event_id: string
          p_evidence_json?: Json
          p_provider_request_id: string
          p_reason_code: string
          p_user_id: string
        }
        Returns: {
          attempted_charge: number
          created_at: string
          evidence_json: Json
          id: string
          provider_request_id: string | null
          reason_code: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_credit_unfunded_expenses"
          isOneToOne: true
          isSetofReturn: false
        }
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
      record_broll_runway_completion: {
        Args: {
          p_completed_response: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_provider_task_id: string
        }
        Returns: Json
      }
      record_broll_runway_pending: {
        Args: {
          p_operation_fingerprint: string
          p_operation_id: string
          p_poll_response: Json
          p_provider_task_id: string
        }
        Returns: Json
      }
      record_broll_runway_rejection: {
        Args: {
          p_operation_fingerprint: string
          p_operation_id: string
          p_rejection_evidence: Json
          p_submission_attempt_id: string
        }
        Returns: Json
      }
      record_broll_runway_task: {
        Args: {
          p_accepted_response: Json
          p_operation_fingerprint: string
          p_operation_id: string
          p_provider_task_id: string
          p_submission_attempt_id: string
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
      record_paid_media_definitive_rejection: {
        Args: {
          p_attempt_id: string
          p_evidence_json: Json
          p_failure_code: string
          p_failure_message: string
          p_operation_fingerprint: string
          p_paid_media_operation_id: string
          p_release_id: string
        }
        Returns: Json
      }
      record_paid_media_provider_reconciliation: {
        Args: {
          p_attempt_id: string
          p_failure_code: string
          p_failure_message: string
          p_operation_fingerprint: string
          p_paid_media_operation_id: string
          p_provider_request_id: string
          p_provider_response_id: string
          p_provider_response_json: Json
        }
        Returns: Json
      }
      record_paid_media_provider_result: {
        Args: {
          p_attempt_id: string
          p_operation_fingerprint: string
          p_paid_media_operation_id: string
          p_provider_request_id: string
          p_provider_response_id: string
          p_provider_response_json: Json
          p_usage_components: Json
        }
        Returns: Json
      }
      record_paid_media_terminal_failure: {
        Args: {
          p_attempt_id: string
          p_evidence_json: Json
          p_failure_code: string
          p_failure_kind: string
          p_failure_message: string
          p_operation_fingerprint: string
          p_paid_media_operation_id: string
          p_release_id: string
          p_usage_components: Json
        }
        Returns: Json
      }
      record_reference_clip_source_acquired: {
        Args: {
          p_operation_fingerprint: string
          p_operation_id: string
          p_source_evidence: Json
        }
        Returns: Json
      }
      record_reference_visual_source_acquired: {
        Args: {
          p_operation_fingerprint: string
          p_operation_id: string
          p_source_evidence: Json
        }
        Returns: Json
      }
      record_unified_visual_plan_child: {
        Args: {
          p_child_kind: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_revision: number
          p_revision_id: string
        }
        Returns: Json
      }
      record_unified_visual_plan_provider_response: {
        Args: {
          p_operation_fingerprint: string
          p_operation_id: string
          p_provider_response_json: Json
        }
        Returns: Json
      }
      reference_visual_candidate_assets_available: {
        Args: { p_candidate_revision_id: string }
        Returns: boolean
      }
      reference_visual_candidate_release_ready: {
        Args: { p_candidate_revision_id: string }
        Returns: boolean
      }
      release_ai_credit_reservation: {
        Args: {
          p_metadata_json?: Json
          p_reason: string
          p_release_id: string
          p_reservation_id: string
          p_user_id: string
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
      reserve_ai_credits: {
        Args: {
          p_amount: number
          p_authorization_json: Json
          p_media_class: string
          p_operation_id: string
          p_purpose: string
          p_request_fingerprint: string
          p_reservation_id: string
          p_tool: string
          p_user_id: string
        }
        Returns: Json
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
      resolve_active_compound_ai_pricing_policy: {
        Args: {
          p_effective_at?: string
          p_endpoint: string
          p_media_kind: string
          p_model: string
          p_model_snapshot: string
          p_provider: string
          p_quality: string
          p_size: string
        }
        Returns: Json
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
      retain_unified_reference_clip_selections: {
        Args: {
          p_operation_fingerprint: string
          p_operation_id: string
          p_provider_plan_revision_id: string
        }
        Returns: Json
      }
      retain_unified_visual_plan_selections: {
        Args: {
          p_child_kind: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_provider_plan_revision_id: string
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
      select_reference_clip_candidate: {
        Args: {
          p_actor_id: string
          p_candidate_revision_id: string
          p_expected_plan_revision: number
          p_expected_plan_revision_id: string
          p_expected_selection_revision: number
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_id: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      select_reference_visual_candidate: {
        Args: {
          p_actor_id: string
          p_candidate_revision_id: string
          p_expected_plan_revision: number
          p_expected_plan_revision_id: string
          p_expected_selection_revision: number
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_id: string
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
      set_broll_prompt_creator_direction: {
        Args: {
          p_actor_id: string
          p_beat_id: string
          p_creator_direction: string
          p_expected_direction_revision: number
          p_workpiece_id: string
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
      set_visual_opportunity_disposition: {
        Args: {
          p_actor_id: string
          p_child_kind: string
          p_child_plan_revision: number
          p_child_plan_revision_id: string
          p_creator_note: string
          p_disposition: string
          p_expected_disposition_revision: number
          p_expected_disposition_revision_id: string
          p_operation_fingerprint: string
          p_operation_id: string
          p_opportunity_id: string
          p_opportunity_revision_identity: string
          p_skip_reason: string
          p_workpiece_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      set_workspace_default_brand_profile: {
        Args: { p_profile_id: string; p_workspace_id: string }
        Returns: Json
      }
      settle_ai_credit_reservation: {
        Args: {
          p_customer_charge: number
          p_metadata_json?: Json
          p_provider_request_id: string
          p_reason: string
          p_reservation_id: string
          p_settlement_id: string
          p_user_id: string
        }
        Returns: Json
      }
      settle_paid_media_operation: {
        Args: {
          p_operation_fingerprint: string
          p_overage_id: string
          p_paid_media_operation_id: string
          p_settlement_id: string
        }
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
      verify_unified_visual_plan: {
        Args: { p_operation_fingerprint: string; p_operation_id: string }
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
