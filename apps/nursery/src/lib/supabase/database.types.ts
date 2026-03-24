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
  public: {
    Tables: {
      account_balances: {
        Row: {
          active_plan_code: string | null
          active_plan_status: string | null
          active_storage_level: string | null
          ai_credit_balance: number
          created_at: string
          founders_club: boolean
          has_founder_discount: boolean
          seat_count_entitled: number
          storage_bytes_entitled: number
          storage_bytes_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active_plan_code?: string | null
          active_plan_status?: string | null
          active_storage_level?: string | null
          ai_credit_balance?: number
          created_at?: string
          founders_club?: boolean
          has_founder_discount?: boolean
          seat_count_entitled?: number
          storage_bytes_entitled?: number
          storage_bytes_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active_plan_code?: string | null
          active_plan_status?: string | null
          active_storage_level?: string | null
          ai_credit_balance?: number
          created_at?: string
          founders_club?: boolean
          has_founder_discount?: boolean
          seat_count_entitled?: number
          storage_bytes_entitled?: number
          storage_bytes_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "account_overview_v"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ai_credit_packs: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          stripe_price_id: string
          token_grant: number
        }
        Insert: {
          created_at?: string
          id: string
          is_active?: boolean
          stripe_price_id: string
          token_grant: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          stripe_price_id?: string
          token_grant?: number
        }
        Relationships: []
      }
      ai_credit_topups: {
        Row: {
          created_at: string
          id: number
          stripe_event_id: string
          stripe_payment_intent_id: string | null
          stripe_price_id: string
          stripe_session_id: string | null
          token_grant: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          stripe_event_id: string
          stripe_payment_intent_id?: string | null
          stripe_price_id: string
          stripe_session_id?: string | null
          token_grant: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          stripe_event_id?: string
          stripe_payment_intent_id?: string | null
          stripe_price_id?: string
          stripe_session_id?: string | null
          token_grant?: number
          user_id?: string
        }
        Relationships: []
      }
      billing_catalog: {
        Row: {
          active: boolean
          ai_credits: number | null
          bytes_entitled: number | null
          coupon_duration: string | null
          coupon_scope: string | null
          created_at: string
          forge_addon: string | null
          forge_interval: string | null
          forge_key: string
          forge_pack_id: string | null
          forge_pack_type: string | null
          forge_plan_id: string | null
          forge_storage_level: string | null
          id: string
          kind: string
          metadata: Json
          percent_off: number | null
          seat_quantity: number | null
          stripe_coupon_id: string | null
          stripe_env: string
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          ai_credits?: number | null
          bytes_entitled?: number | null
          coupon_duration?: string | null
          coupon_scope?: string | null
          created_at?: string
          forge_addon?: string | null
          forge_interval?: string | null
          forge_key: string
          forge_pack_id?: string | null
          forge_pack_type?: string | null
          forge_plan_id?: string | null
          forge_storage_level?: string | null
          id?: string
          kind: string
          metadata?: Json
          percent_off?: number | null
          seat_quantity?: number | null
          stripe_coupon_id?: string | null
          stripe_env: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          ai_credits?: number | null
          bytes_entitled?: number | null
          coupon_duration?: string | null
          coupon_scope?: string | null
          created_at?: string
          forge_addon?: string | null
          forge_interval?: string | null
          forge_key?: string
          forge_pack_id?: string | null
          forge_pack_type?: string | null
          forge_plan_id?: string | null
          forge_storage_level?: string | null
          id?: string
          kind?: string
          metadata?: Json
          percent_off?: number | null
          seat_quantity?: number | null
          stripe_coupon_id?: string | null
          stripe_env?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      billing_customers: {
        Row: {
          created_at: string
          email: string | null
          stripe_customer_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          stripe_customer_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          stripe_customer_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "account_overview_v"
            referencedColumns: ["user_id"]
          },
        ]
      }
      billing_events: {
        Row: {
          created_at: string
          error_text: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          status: string
          stripe_env: string
          stripe_event_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_text?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          status?: string
          stripe_env?: string
          stripe_event_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_text?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          status?: string
          stripe_env?: string
          stripe_event_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "account_overview_v"
            referencedColumns: ["user_id"]
          },
        ]
      }
      billing_one_time_purchases: {
        Row: {
          amount_paid_cents: number | null
          created_at: string
          currency: string | null
          id: string
          metadata: Json
          pack_code: string | null
          purchase_kind: string
          quantity: number
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_env: string
          stripe_payment_intent_id: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paid_cents?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          metadata?: Json
          pack_code?: string | null
          purchase_kind: string
          quantity?: number
          status: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_env?: string
          stripe_payment_intent_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paid_cents?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          metadata?: Json
          pack_code?: string | null
          purchase_kind?: string
          quantity?: number
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_env?: string
          stripe_payment_intent_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_one_time_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "account_overview_v"
            referencedColumns: ["user_id"]
          },
        ]
      }
      billing_subscriptions: {
        Row: {
          addon_code: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          interval_code: string
          metadata: Json
          plan_code: string | null
          quantity: number
          status: string
          storage_level: string | null
          stripe_customer_id: string | null
          stripe_env: string
          stripe_price_id: string
          stripe_product_id: string | null
          stripe_subscription_id: string
          stripe_subscription_item_id: string | null
          subscription_kind: string
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          addon_code?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          interval_code: string
          metadata?: Json
          plan_code?: string | null
          quantity?: number
          status: string
          storage_level?: string | null
          stripe_customer_id?: string | null
          stripe_env?: string
          stripe_price_id: string
          stripe_product_id?: string | null
          stripe_subscription_id: string
          stripe_subscription_item_id?: string | null
          subscription_kind: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          addon_code?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          interval_code?: string
          metadata?: Json
          plan_code?: string | null
          quantity?: number
          status?: string
          storage_level?: string | null
          stripe_customer_id?: string | null
          stripe_env?: string
          stripe_price_id?: string
          stripe_product_id?: string | null
          stripe_subscription_id?: string
          stripe_subscription_item_id?: string | null
          subscription_kind?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "account_overview_v"
            referencedColumns: ["user_id"]
          },
        ]
      }
      display_pair_sessions: {
        Row: {
          consumed_at: string | null
          consumed_by: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          metadata: Json
          token: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_by?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          metadata?: Json
          token: string
        }
        Update: {
          consumed_at?: string | null
          consumed_by?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          metadata?: Json
          token?: string
        }
        Relationships: []
      }
      forge_memberships: {
        Row: {
          created_at: string
          current_period_end: string | null
          last_stripe_event_id: string | null
          stripe_customer_id: string | null
          stripe_mode: string
          stripe_price_id: string | null
          stripe_status: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          last_stripe_event_id?: string | null
          stripe_customer_id?: string | null
          stripe_mode?: string
          stripe_price_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          last_stripe_event_id?: string | null
          stripe_customer_id?: string | null
          stripe_mode?: string
          stripe_price_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forge_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "account_overview_v"
            referencedColumns: ["user_id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          id: string
          iron_mine_access: boolean
          is_active: boolean
          is_public: boolean
          max_projects: number
          max_recording_minutes_per_month: number | null
          name: string
          notes: string | null
          price_monthly_cents: number | null
          price_yearly_cents: number | null
          sort_order: number
          stripe_price_monthly_id: string | null
          stripe_price_quarterly_id: string | null
        }
        Insert: {
          created_at?: string
          id: string
          iron_mine_access?: boolean
          is_active?: boolean
          is_public?: boolean
          max_projects?: number
          max_recording_minutes_per_month?: number | null
          name: string
          notes?: string | null
          price_monthly_cents?: number | null
          price_yearly_cents?: number | null
          sort_order?: number
          stripe_price_monthly_id?: string | null
          stripe_price_quarterly_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          iron_mine_access?: boolean
          is_active?: boolean
          is_public?: boolean
          max_projects?: number
          max_recording_minutes_per_month?: number | null
          name?: string
          notes?: string | null
          price_monthly_cents?: number | null
          price_yearly_cents?: number | null
          sort_order?: number
          stripe_price_monthly_id?: string | null
          stripe_price_quarterly_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          anvil_paid: boolean
          asr_calibration_profiles: Json
          asr_settings: Json
          asr_updated_at: string
          avatar_url: string | null
          created_at: string
          current_period_end: string | null
          display_name: string | null
          email: string | null
          id: number
          is_legacy: boolean
          settings: Json
          settings_rev: number
          settings_updated_at: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          tier: string
          user_id: string
        }
        Insert: {
          anvil_paid?: boolean
          asr_calibration_profiles?: Json
          asr_settings?: Json
          asr_updated_at?: string
          avatar_url?: string | null
          created_at?: string
          current_period_end?: string | null
          display_name?: string | null
          email?: string | null
          id?: number
          is_legacy?: boolean
          settings?: Json
          settings_rev?: number
          settings_updated_at?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          tier?: string
          user_id?: string
        }
        Update: {
          anvil_paid?: boolean
          asr_calibration_profiles?: Json
          asr_settings?: Json
          asr_updated_at?: string
          avatar_url?: string | null
          created_at?: string
          current_period_end?: string | null
          display_name?: string | null
          email?: string | null
          id?: number
          is_legacy?: boolean
          settings?: Json
          settings_rev?: number
          settings_updated_at?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          tier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "account_overview_v"
            referencedColumns: ["user_id"]
          },
        ]
      }
      stripe_event_log: {
        Row: {
          event_id: string
          event_type: string | null
          livemode: boolean | null
          processed_at: string
          received_at: string | null
        }
        Insert: {
          event_id: string
          event_type?: string | null
          livemode?: boolean | null
          processed_at?: string
          received_at?: string | null
        }
        Update: {
          event_id?: string
          event_type?: string | null
          livemode?: boolean | null
          processed_at?: string
          received_at?: string | null
        }
        Relationships: []
      }
      tp_profiles: {
        Row: {
          created_at: string
          profile: Json
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          profile?: Json
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          profile?: Json
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tp_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "account_overview_v"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_plans: {
        Row: {
          ends_at: string | null
          founder_discount_notes: string | null
          founder_discount_percent: number | null
          is_founder: boolean
          plan_id: string
          started_at: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ends_at?: string | null
          founder_discount_notes?: string | null
          founder_discount_percent?: number | null
          is_founder?: boolean
          plan_id: string
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ends_at?: string | null
          founder_discount_notes?: string | null
          founder_discount_percent?: number | null
          is_founder?: boolean
          plan_id?: string
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_plans_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "account_overview_v"
            referencedColumns: ["user_id"]
          },
        ]
      }
      workpiece_events: {
        Row: {
          actor_display_name: string | null
          actor_user_id: string | null
          correlation_id: string | null
          event_id: string
          event_name: string
          payload: Json
          timestamp: string
          tool_name: string
          tool_version: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          actor_display_name?: string | null
          actor_user_id?: string | null
          correlation_id?: string | null
          event_id?: string
          event_name: string
          payload?: Json
          timestamp?: string
          tool_name: string
          tool_version: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          actor_display_name?: string | null
          actor_user_id?: string | null
          correlation_id?: string | null
          event_id?: string
          event_name?: string
          payload?: Json
          timestamp?: string
          tool_name?: string
          tool_version?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workpiece_files: {
        Row: {
          bytes: number
          content_type: string
          deleted_at: string | null
          hash_algo: string
          hash_value: string
          lane: string
          path: string
          type: string
          updated_at: string
          workpiece_id: string
          workspace_id: string
          written_by_tool: string
          written_by_version: string
        }
        Insert: {
          bytes?: number
          content_type: string
          deleted_at?: string | null
          hash_algo?: string
          hash_value: string
          lane?: string
          path: string
          type: string
          updated_at?: string
          workpiece_id: string
          workspace_id: string
          written_by_tool: string
          written_by_version: string
        }
        Update: {
          bytes?: number
          content_type?: string
          deleted_at?: string | null
          hash_algo?: string
          hash_value?: string
          lane?: string
          path?: string
          type?: string
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
          written_by_tool?: string
          written_by_version?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      account_overview_v: {
        Row: {
          active_plan_code: string | null
          active_plan_status: string | null
          active_storage_level: string | null
          ai_credit_balance: number | null
          avatar_url: string | null
          display_name: string | null
          email: string | null
          founders_club: boolean | null
          has_founder_discount: boolean | null
          profile_created_at: string | null
          seat_count_entitled: number | null
          storage_bytes_entitled: number | null
          storage_bytes_remaining: number | null
          storage_bytes_used: number | null
          stripe_customer_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
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
      ensure_account_balance_row: {
        Args: { p_user_id: string }
        Returns: {
          active_plan_code: string | null
          active_plan_status: string | null
          active_storage_level: string | null
          ai_credit_balance: number
          created_at: string
          founders_club: boolean
          has_founder_discount: boolean
          seat_count_entitled: number
          storage_bytes_entitled: number
          storage_bytes_used: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_balances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_profile_for_user: {
        Args: { p_email?: string; p_user_id: string }
        Returns: {
          anvil_paid: boolean
          asr_calibration_profiles: Json
          asr_settings: Json
          asr_updated_at: string
          avatar_url: string | null
          created_at: string
          current_period_end: string | null
          display_name: string | null
          email: string | null
          id: number
          is_legacy: boolean
          settings: Json
          settings_rev: number
          settings_updated_at: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          tier: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_plan: {
        Args: never
        Returns: {
          ends_at: string
          founder_discount_percent: number
          iron_mine_access: boolean
          is_founder: boolean
          max_projects: number
          max_recording_minutes_per_month: number
          plan_id: string
          plan_name: string
          price_monthly_cents: number
          price_yearly_cents: number
          status: string
        }[]
      }
      recompute_account_balances: {
        Args: { p_user_id: string }
        Returns: {
          active_plan_code: string | null
          active_plan_status: string | null
          active_storage_level: string | null
          ai_credit_balance: number
          created_at: string
          founders_club: boolean
          has_founder_discount: boolean
          seat_count_entitled: number
          storage_bytes_entitled: number
          storage_bytes_used: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_balances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_billing_event: {
        Args: {
          p_error_text?: string
          p_event_type?: string
          p_payload?: Json
          p_processed_at?: string
          p_status?: string
          p_stripe_env?: string
          p_stripe_event_id?: string
          p_user_id?: string
        }
        Returns: {
          created_at: string
          error_text: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          status: string
          stripe_env: string
          stripe_event_id: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "billing_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_billing_customer: {
        Args: {
          p_email?: string
          p_stripe_customer_id: string
          p_user_id: string
        }
        Returns: {
          created_at: string
          email: string | null
          stripe_customer_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "billing_customers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_billing_one_time_purchase: {
        Args: {
          p_amount_paid_cents?: number
          p_currency?: string
          p_metadata?: Json
          p_quantity?: number
          p_status?: string
          p_stripe_checkout_session_id?: string
          p_stripe_customer_id?: string
          p_stripe_env?: string
          p_stripe_payment_intent_id?: string
          p_stripe_price_id?: string
          p_stripe_product_id?: string
          p_user_id: string
        }
        Returns: {
          amount_paid_cents: number | null
          created_at: string
          currency: string | null
          id: string
          metadata: Json
          pack_code: string | null
          purchase_kind: string
          quantity: number
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_env: string
          stripe_payment_intent_id: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "billing_one_time_purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_billing_subscription: {
        Args: {
          p_cancel_at_period_end?: boolean
          p_canceled_at?: string
          p_current_period_end?: string
          p_current_period_start?: string
          p_metadata?: Json
          p_quantity?: number
          p_status?: string
          p_stripe_customer_id?: string
          p_stripe_env?: string
          p_stripe_price_id?: string
          p_stripe_product_id?: string
          p_stripe_subscription_id?: string
          p_stripe_subscription_item_id?: string
          p_trial_end?: string
          p_trial_start?: string
          p_user_id: string
        }
        Returns: {
          addon_code: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          interval_code: string
          metadata: Json
          plan_code: string | null
          quantity: number
          status: string
          storage_level: string | null
          stripe_customer_id: string | null
          stripe_env: string
          stripe_price_id: string
          stripe_product_id: string | null
          stripe_subscription_id: string
          stripe_subscription_item_id: string | null
          subscription_kind: string
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "billing_subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
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
} as const
