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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          agent_type: string
          completed_at: string | null
          created_at: string
          custom_agent_id: string | null
          id: string
          position_x: number
          position_y: number
          scan_id: string
          started_at: string | null
          status: string
          summary: string | null
        }
        Insert: {
          agent_type: string
          completed_at?: string | null
          created_at?: string
          custom_agent_id?: string | null
          id?: string
          position_x?: number
          position_y?: number
          scan_id: string
          started_at?: string | null
          status?: string
          summary?: string | null
        }
        Update: {
          agent_type?: string
          completed_at?: string | null
          created_at?: string
          custom_agent_id?: string | null
          id?: string
          position_x?: number
          position_y?: number
          scan_id?: string
          started_at?: string | null
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_steps: {
        Row: {
          agent_run_id: string
          created_at: string
          error: string | null
          id: string
          kind: string
          step_index: number
          thought: string | null
          tool_input: Json | null
          tool_name: string | null
          tool_output: Json | null
        }
        Insert: {
          agent_run_id: string
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          step_index: number
          thought?: string | null
          tool_input?: Json | null
          tool_name?: string | null
          tool_output?: Json | null
        }
        Update: {
          agent_run_id?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          step_index?: number
          thought?: string | null
          tool_input?: Json | null
          tool_name?: string | null
          tool_output?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_steps_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_agents: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
          services: string[]
          system_prompt: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          services?: string[]
          system_prompt: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          services?: string[]
          system_prompt?: string
          user_id?: string
        }
        Relationships: []
      }
      findings: {
        Row: {
          agent_run_id: string | null
          created_at: string
          description: string | null
          evidence: Json | null
          id: string
          remediation: Json | null
          resource: string | null
          scan_id: string
          severity: string
          title: string
        }
        Insert: {
          agent_run_id?: string | null
          created_at?: string
          description?: string | null
          evidence?: Json | null
          id?: string
          remediation?: Json | null
          resource?: string | null
          scan_id: string
          severity: string
          title: string
        }
        Update: {
          agent_run_id?: string | null
          created_at?: string
          description?: string | null
          evidence?: Json | null
          id?: string
          remediation?: Json | null
          resource?: string | null
          scan_id?: string
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "findings_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "findings_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      scans: {
        Row: {
          aws_account_alias: string | null
          aws_account_id: string | null
          completed_at: string | null
          created_at: string
          custom_agent_ids: string[]
          error_message: string | null
          id: string
          name: string
          parent_scan_id: string | null
          region: string
          scheduled_scan_id: string | null
          selected_agents: string[]
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          aws_account_alias?: string | null
          aws_account_id?: string | null
          completed_at?: string | null
          created_at?: string
          custom_agent_ids?: string[]
          error_message?: string | null
          id?: string
          name: string
          parent_scan_id?: string | null
          region?: string
          scheduled_scan_id?: string | null
          selected_agents?: string[]
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          aws_account_alias?: string | null
          aws_account_id?: string | null
          completed_at?: string | null
          created_at?: string
          custom_agent_ids?: string[]
          error_message?: string | null
          id?: string
          name?: string
          parent_scan_id?: string | null
          region?: string
          scheduled_scan_id?: string | null
          selected_agents?: string[]
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_scans: {
        Row: {
          cadence_days: number
          created_at: string
          custom_agent_ids: string[]
          id: string
          last_run_scan_id: string | null
          name: string
          next_run_at: string
          region: string
          selected_agents: string[]
          user_id: string
        }
        Insert: {
          cadence_days?: number
          created_at?: string
          custom_agent_ids?: string[]
          id?: string
          last_run_scan_id?: string | null
          name: string
          next_run_at?: string
          region?: string
          selected_agents?: string[]
          user_id: string
        }
        Update: {
          cadence_days?: number
          created_at?: string
          custom_agent_ids?: string[]
          id?: string
          last_run_scan_id?: string | null
          name?: string
          next_run_at?: string
          region?: string
          selected_agents?: string[]
          user_id?: string
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
