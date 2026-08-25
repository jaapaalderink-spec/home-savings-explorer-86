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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          categories: string[]
          created_at: string
          id: string
          join_code: string
          monthly_lead_limit: number
          name: string
          plan_name: string
          updated_at: string
        }
        Insert: {
          categories?: string[]
          created_at?: string
          id?: string
          join_code?: string
          monthly_lead_limit?: number
          name: string
          plan_name?: string
          updated_at?: string
        }
        Update: {
          categories?: string[]
          created_at?: string
          id?: string
          join_code?: string
          monthly_lead_limit?: number
          name?: string
          plan_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_purchases: {
        Row: {
          company_id: string
          created_at: string
          id: string
          lead_id: string
          note: string | null
          purchased_by: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          lead_id: string
          note?: string | null
          purchased_by?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          lead_id?: string
          note?: string | null
          purchased_by?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_purchases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_purchases_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          airco_rooms: number | null
          annual_consumption_kwh: number | null
          annual_feedin_kwh: number | null
          annual_km: number | null
          battery_goals: string[]
          build_year: number | null
          categories: string[]
          city: string | null
          contract_type: string | null
          created_at: string
          current_heating: string | null
          email: string
          estimated_savings: number
          ev_status: string | null
          first_name: string
          house_number: string | null
          house_type: string | null
          id: string
          last_name: string
          max_partners: number
          notes: string | null
          panel_count: number | null
          phone: string
          postcode: string
          purchase_count: number
          smart_devices: string[]
        }
        Insert: {
          airco_rooms?: number | null
          annual_consumption_kwh?: number | null
          annual_feedin_kwh?: number | null
          annual_km?: number | null
          battery_goals?: string[]
          build_year?: number | null
          categories?: string[]
          city?: string | null
          contract_type?: string | null
          created_at?: string
          current_heating?: string | null
          email: string
          estimated_savings?: number
          ev_status?: string | null
          first_name: string
          house_number?: string | null
          house_type?: string | null
          id?: string
          last_name: string
          max_partners?: number
          notes?: string | null
          panel_count?: number | null
          phone: string
          postcode: string
          purchase_count?: number
          smart_devices?: string[]
        }
        Update: {
          airco_rooms?: number | null
          annual_consumption_kwh?: number | null
          annual_feedin_kwh?: number | null
          annual_km?: number | null
          battery_goals?: string[]
          build_year?: number | null
          categories?: string[]
          city?: string | null
          contract_type?: string | null
          created_at?: string
          current_heating?: string | null
          email?: string
          estimated_savings?: number
          ev_status?: string | null
          first_name?: string
          house_number?: string | null
          house_type?: string | null
          id?: string
          last_name?: string
          max_partners?: number
          notes?: string | null
          panel_count?: number | null
          phone?: string
          postcode?: string
          purchase_count?: number
          smart_devices?: string[]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_company_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "owner" | "account_manager"
      lead_status: "new" | "contacted" | "quoted" | "won" | "lost"
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
    Enums: {
      app_role: ["admin", "owner", "account_manager"],
      lead_status: ["new", "contacted", "quoted", "won", "lost"],
    },
  },
} as const
