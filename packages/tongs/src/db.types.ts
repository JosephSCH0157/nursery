export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          anvil_paid: boolean | null
          asr_calibration_profiles: Json | null
          asr_settings: Json | null
          current_period_end: string | null
          display_name: string | null
          settings: Json | null
          settings_rev: number | null
          settings_updated_at: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          tier: string | null
          user_id: string
          asr_updated_at: string | null
        }
        Insert: {
          anvil_paid?: boolean | null
          asr_calibration_profiles?: Json | null
          asr_settings?: Json | null
          current_period_end?: string | null
          display_name?: string | null
          settings?: Json | null
          settings_rev?: number | null
          settings_updated_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          tier?: string | null
          user_id: string
          asr_updated_at?: string | null
        }
        Update: {
          anvil_paid?: boolean | null
          asr_calibration_profiles?: Json | null
          asr_settings?: Json | null
          current_period_end?: string | null
          display_name?: string | null
          settings?: Json | null
          settings_rev?: number | null
          settings_updated_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          tier?: string | null
          user_id?: string
          asr_updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
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
      assets: {
        Row: {
          asset_kind: string
          id: string
          bytes: number
          created_by: string
          created_at: string
          metadata_json: Json
          mime_type: string
          path: string
          prompt: string | null
          provider: string
          provider_request_id: string | null
          request_id: string | null
          status: string
          storage_bucket: string
          storage_key: string
          supersedes_asset_id: string | null
          updated_at: string
          workpiece_id: string
          workspace_id: string
        }
        Insert: {
          asset_kind?: string
          id?: string
          bytes: number
          created_by: string
          created_at?: string
          metadata_json?: Json
          mime_type: string
          path: string
          prompt?: string | null
          provider: string
          provider_request_id?: string | null
          request_id?: string | null
          status?: string
          storage_bucket?: string
          storage_key: string
          supersedes_asset_id?: string | null
          updated_at?: string
          workpiece_id: string
          workspace_id: string
        }
        Update: {
          asset_kind?: string
          id?: string
          bytes?: number
          created_by?: string
          created_at?: string
          metadata_json?: Json
          mime_type?: string
          path?: string
          prompt?: string | null
          provider?: string
          provider_request_id?: string | null
          request_id?: string | null
          status?: string
          storage_bucket?: string
          storage_key?: string
          supersedes_asset_id?: string | null
          updated_at?: string
          workpiece_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          id: string
          workspace_id: string
          assignment_id: string | null
          session_id: string | null
          title: string
          start_at: string
          end_at: string | null
          all_day: boolean
          description: string | null
          location: string | null
          created_at: string
          created_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          assignment_id?: string | null
          session_id?: string | null
          title: string
          start_at: string
          end_at?: string | null
          all_day?: boolean
          description?: string | null
          location?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          assignment_id?: string | null
          session_id?: string | null
          title?: string
          start_at?: string
          end_at?: string | null
          all_day?: boolean
          description?: string | null
          location?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string
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
      calendar_event_assignments: {
        Row: {
          event_id: string
          assignment_id: string
          workspace_id: string
          created_at: string
          created_by: string | null
        }
        Insert: {
          event_id: string
          assignment_id: string
          workspace_id: string
          created_at?: string
          created_by?: string | null
        }
        Update: {
          event_id?: string
          assignment_id?: string
          workspace_id?: string
          created_at?: string
          created_by?: string | null
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
      episodes: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          id: string
          workspace_id: string
          label: string
          created_at: string
          updated_at: string
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          id?: string
          workspace_id: string
          label: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          id?: string
          workspace_id?: string
          label?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hearth_workpiece_presence: {
        Row: {
          workspace_id: string
          workpiece_id: string
          user_id: string
          display_name: string | null
          mode: string
          last_seen_at: string
          created_at: string
        }
        Insert: {
          workspace_id: string
          workpiece_id: string
          user_id: string
          display_name?: string | null
          mode?: string
          last_seen_at?: string
          created_at?: string
        }
        Update: {
          workspace_id?: string
          workpiece_id?: string
          user_id?: string
          display_name?: string | null
          mode?: string
          last_seen_at?: string
          created_at?: string
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
      hammer_workpiece_presence: {
        Row: {
          workspace_id: string
          workpiece_id: string
          user_id: string
          session_id: string | null
          display_name: string | null
          mode: string
          last_seen_at: string
          created_at: string
        }
        Insert: {
          workspace_id: string
          workpiece_id: string
          user_id: string
          session_id?: string | null
          display_name?: string | null
          mode?: string
          last_seen_at?: string
          created_at?: string
        }
        Update: {
          workspace_id?: string
          workpiece_id?: string
          user_id?: string
          session_id?: string | null
          display_name?: string | null
          mode?: string
          last_seen_at?: string
          created_at?: string
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
          workspace_id: string
          workpiece_id: string
          active_session_id: string | null
          current_pass: string
          pass_order_version: number
          pass_status: Json
          editor_session_path: string | null
          transcript_artifact_path: string | null
          transcript_versions_artifact_path: string | null
          speaker_map_artifact_path: string | null
          visual_placement_artifact_path: string | null
          audio_polish_artifact_path: string | null
          edit_plan_artifact_path: string | null
          edit_plan_signature: string | null
          prep_status: string
          alignment_status: string
          macro_recipe_ref: string | null
          last_macro_run_ref: string | null
          last_opened_at: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          workspace_id: string
          workpiece_id: string
          active_session_id?: string | null
          current_pass?: string
          pass_order_version?: number
          pass_status?: Json
          editor_session_path?: string | null
          transcript_artifact_path?: string | null
          transcript_versions_artifact_path?: string | null
          speaker_map_artifact_path?: string | null
          visual_placement_artifact_path?: string | null
          audio_polish_artifact_path?: string | null
          edit_plan_artifact_path?: string | null
          edit_plan_signature?: string | null
          prep_status?: string
          alignment_status?: string
          macro_recipe_ref?: string | null
          last_macro_run_ref?: string | null
          last_opened_at?: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          workspace_id?: string
          workpiece_id?: string
          active_session_id?: string | null
          current_pass?: string
          pass_order_version?: number
          pass_status?: Json
          editor_session_path?: string | null
          transcript_artifact_path?: string | null
          transcript_versions_artifact_path?: string | null
          speaker_map_artifact_path?: string | null
          visual_placement_artifact_path?: string | null
          audio_polish_artifact_path?: string | null
          edit_plan_artifact_path?: string | null
          edit_plan_signature?: string | null
          prep_status?: string
          alignment_status?: string
          macro_recipe_ref?: string | null
          last_macro_run_ref?: string | null
          last_opened_at?: string
          updated_at?: string
          updated_by?: string
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
      project_cradles: {
        Row: {
          id: string
          workspace_id: string
          status: string
          manifest_path: string
          metadata: Json
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          status?: string
          manifest_path?: string
          metadata?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          status?: string
          manifest_path?: string
          metadata?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
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
      workpiece_ready_script_meta: {
        Row: {
          workspace_id: string
          workpiece_id: string
          script_path: string
          script_revision: number | null
          script_hash: string | null
          transition_id: string | null
          publish_evidence: Json | null
          marked_ready_by: string
          marked_ready_at: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          workspace_id: string
          workpiece_id: string
          script_path: string
          script_revision?: number | null
          script_hash?: string | null
          transition_id?: string | null
          publish_evidence?: Json | null
          marked_ready_by: string
          marked_ready_at?: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          workspace_id?: string
          workpiece_id?: string
          script_path?: string
          script_revision?: number | null
          script_hash?: string | null
          transition_id?: string | null
          publish_evidence?: Json | null
          marked_ready_by?: string
          marked_ready_at?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "workpiece_ready_script_meta_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpiece_ready_script_meta_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_ready_queue_state: {
        Row: {
          workspace_id: string
          workpiece_id: string
          queue_rank: number | null
          hidden_at: string | null
          hidden_by: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          workspace_id: string
          workpiece_id: string
          queue_rank?: number | null
          hidden_at?: string | null
          hidden_by?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          workspace_id?: string
          workpiece_id?: string
          queue_rank?: number | null
          hidden_at?: string | null
          hidden_by?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_ready_queue_state_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_ready_queue_state_workpiece_id_fkey"
            columns: ["workpiece_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_session_episodes: {
        Row: {
          recording_session_id: string
          episode_id: string
          position: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          recording_session_id: string
          episode_id: string
          position?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          recording_session_id?: string
          episode_id?: string
          position?: number
          notes?: string | null
          created_at?: string
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
          id: string
          session_id: string
          position: number
          episode_id: string
          script_path: string
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          position: number
          episode_id: string
          script_path: string
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          position?: number
          episode_id?: string
          script_path?: string
          created_at?: string
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
          id: string
          workspace_id: string
          title: string
          calendar_event_id: string | null
          starts_at: string
          ends_at: string | null
          status: string
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          title: string
          calendar_event_id?: string | null
          starts_at: string
          ends_at?: string | null
          status?: string
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          title?: string
          calendar_event_id?: string | null
          starts_at?: string
          ends_at?: string | null
          status?: string
          created_by?: string
          created_at?: string
          updated_at?: string
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
      workpiece_events: {
        Row: {
          id: number
          workpiece_id: string
          event_name: string
          payload: Json
          correlation_id: string | null
          written_by_tool: string
          written_by_tool_version: string
          written_by_lane: string
          created_at: string
        }
        Insert: {
          id?: number
          workpiece_id: string
          event_name: string
          payload?: Json
          correlation_id?: string | null
          written_by_tool: string
          written_by_tool_version: string
          written_by_lane: string
          created_at?: string
        }
        Update: {
          id?: number
          workpiece_id?: string
          event_name?: string
          payload?: Json
          correlation_id?: string | null
          written_by_tool?: string
          written_by_tool_version?: string
          written_by_lane?: string
          created_at?: string
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
      workpiece_jobs: {
        Row: {
          id: string
          workspace_id: string
          workpiece_id: string
          job_type: string
          status: string
          requested_by: string
          payload_json: Json
          result_json: Json | null
          error_code: string | null
          error_message: string | null
          progress_percent: number | null
          attempt_count: number
          runner_id: string | null
          lease_expires_at: string | null
          heartbeat_at: string | null
          started_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          workpiece_id: string
          job_type: string
          status: string
          requested_by: string
          payload_json?: Json
          result_json?: Json | null
          error_code?: string | null
          error_message?: string | null
          progress_percent?: number | null
          attempt_count?: number
          runner_id?: string | null
          lease_expires_at?: string | null
          heartbeat_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          workpiece_id?: string
          job_type?: string
          status?: string
          requested_by?: string
          payload_json?: Json
          result_json?: Json | null
          error_code?: string | null
          error_message?: string | null
          progress_percent?: number | null
          attempt_count?: number
          runner_id?: string | null
          lease_expires_at?: string | null
          heartbeat_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
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
      workpiece_files: {
        Row: {
          workpiece_id: string
          path: string
          file_type: string
          content_type: string
          bytes: number
          hash_algo: string
          hash_value: string
          storage_bucket: string
          storage_key: string
          written_by_tool: string
          written_by_tool_version: string
          written_by_lane: string
          created_at: string
          updated_at: string
          revision: number
        }
        Insert: {
          workpiece_id: string
          path: string
          file_type?: string
          content_type: string
          bytes: number
          hash_algo?: string
          hash_value: string
          storage_bucket?: string
          storage_key: string
          written_by_tool: string
          written_by_tool_version: string
          written_by_lane: string
          created_at?: string
          updated_at?: string
          revision?: number
        }
        Update: {
          workpiece_id?: string
          path?: string
          file_type?: string
          content_type?: string
          bytes?: number
          hash_algo?: string
          hash_value?: string
          storage_bucket?: string
          storage_key?: string
          written_by_tool?: string
          written_by_tool_version?: string
          written_by_lane?: string
          created_at?: string
          updated_at?: string
          revision?: number
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
      workspaces: {
        Row: {
          id: string
          name: string
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          name?: string
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      current_workpiece_recorded_takes: {
        Row: {
          workspace_id: string
          workpiece_id: string
          capture_session_id: string
          completion_id: string
          keep_id: string
          ready_transition_id: string
          script_revision: number
          script_hash: string
          media_path: string
          media_revision: number
          media_hash: string
          completion_evidence: Json
          decision_evidence: Json
          completed_at: string
          kept_at: string
          completed_by: string
          kept_by: string
        }
        Relationships: []
      }
      current_workpiece_ready_scripts: {
        Row: {
          workspace_id: string
          workpiece_id: string
          script_path: string
          script_revision: number
          script_hash: string
          transition_id: string
          marked_ready_by: string | null
          marked_ready_at: string | null
          publish_evidence: Json | null
          script_updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      append_bellows_session_checkpoint: {
        Args: {
          p_acting_authority_state?: string | null
          p_acting_host_participant_id?: string | null
          p_actor_id?: string | null
          p_actor_type?: string | null
          p_archived_at?: string | null
          p_broadcast_state?: string | null
          p_checkpoint_kind: string
          p_co_host_participant_ids?: string[] | null
          p_delta?: Json | null
          p_effect_type?: string | null
          p_ended_at?: string | null
          p_event_count?: number | null
          p_follow_up_action_source?: string | null
          p_follow_up_action_type?: string | null
          p_host_participant_id?: string | null
          p_integrity_flags?: string[] | null
          p_lifecycle_state?: string | null
          p_occurred_at?: string | null
          p_offset_ms?: number | null
          p_outcome?: string | null
          p_recording_state?: string | null
          p_seal_state?: string | null
          p_sealed_at?: string | null
          p_session_id: string
          p_session_snapshot?: Json | null
          p_snapshot_schema_version?: number | null
          p_started_at?: string | null
          p_trigger_action_source: string
          p_trigger_action_type: string
          p_upload_state?: string | null
        }
        Returns: Database["tongs"]["Tables"]["bellows_session_checkpoints"]["Row"]
      }
      create_bellows_join_link: {
        Args: {
          p_created_by_user_id?: string | null
          p_expires_hours?: number | null
          p_max_uses?: number | null
          p_role_code?: string | null
          p_session_id: string
        }
        Returns: {
          created_at: string
          expires_at: string
          join_link_id: string
          last_used_at: string | null
          max_uses: number
          revoked_at: string | null
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
          p_acting_host_participant_id?: string | null
          p_archived_at?: string | null
          p_broadcast_state?: string
          p_calendar_event_id?: string | null
          p_co_host_participant_ids?: string[]
          p_ended_at?: string | null
          p_host_participant_id?: string | null
          p_host_user_id: string
          p_integrity_flags?: string[]
          p_lifecycle_state?: string
          p_mode: string
          p_outcome?: string | null
          p_recording_session_id?: string | null
          p_recording_state?: string
          p_seal_state?: string
          p_sealed_at?: string | null
          p_session_id: string
          p_session_type: string
          p_snapshot_schema_version?: number
          p_started_at?: string | null
          p_title: string
          p_upload_state?: string
          p_workspace_id: string
        }
        Returns: Database["tongs"]["Tables"]["bellows_sessions"]["Row"]
      }
      mark_bellows_session_latest_checkpoint: {
        Args: {
          p_checkpoint_id: string
          p_session_id: string
        }
        Returns: Database["tongs"]["Tables"]["bellows_sessions"]["Row"]
      }
      resolve_bellows_join_link: {
        Args: {
          p_session_id: string
          p_token: string
        }
        Returns: {
          expires_at: string
          host_user_id: string
          join_link_id: string
          last_used_at: string | null
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
      revoke_bellows_join_link: {
        Args: {
          p_join_link_id: string
        }
        Returns: {
          join_link_id: string
          revoked: boolean
        }[]
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  tongs: {
    Enums: {},
  },
} as const
