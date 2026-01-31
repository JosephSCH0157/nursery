export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  tongs: {
    Tables: {
      calendar_events: {
        Row: {
          id: string;
          workspace_id: string;
          kind: string | null;
          title: string | null;
          notes: string | null;
          status: string | null;
          start_at: string | null;
          end_at: string | null;
          all_day: boolean | null;
          meta: Json | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          kind?: string | null;
          title?: string | null;
          notes?: string | null;
          status?: string | null;
          start_at?: string | null;
          end_at?: string | null;
          all_day?: boolean | null;
          meta?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          kind?: string | null;
          title?: string | null;
          notes?: string | null;
          status?: string | null;
          start_at?: string | null;
          end_at?: string | null;
          all_day?: boolean | null;
          meta?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
