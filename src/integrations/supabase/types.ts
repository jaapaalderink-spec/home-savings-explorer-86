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
      companies: {
        Row: {
          active: boolean
          address: string | null
          billing_email: string | null
          categories: string[]
          created_at: string
          id: string
          join_code: string
          monthly_fee_ex_vat: number
          monthly_lead_limit: number
          name: string
          plan_name: string
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          billing_email?: string | null
          categories?: string[]
          created_at?: string
          id?: string
          join_code?: string
          monthly_fee_ex_vat?: number
          monthly_lead_limit?: number
          name: string
          plan_name?: string
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          billing_email?: string | null
          categories?: string[]
          created_at?: string
          id?: string
          join_code?: string
          monthly_fee_ex_vat?: number
          monthly_lead_limit?: number
          name?: string
          plan_name?: string
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      company_products: {
        Row: {
          active: boolean
          category: string
          company_id: string
          created_at: string
          id: string
          monthly_max: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          company_id: string
          created_at?: string
          id?: string
          monthly_max?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          company_id?: string
          created_at?: string
          id?: string
          monthly_max?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_regions: {
        Row: {
          company_id: string
          created_at: string
          id: string
          region_code: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          region_code: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          region_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_regions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_regions_region_code_fkey"
            columns: ["region_code"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["code"]
          },
        ]
      }
      complaints: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          credit_ex_vat: number
          details: string | null
          id: string
          purchase_id: string
          reason: Database["public"]["Enums"]["complaint_reason"]
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["complaint_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          credit_ex_vat?: number
          details?: string | null
          id?: string
          purchase_id: string
          reason: Database["public"]["Enums"]["complaint_reason"]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          credit_ex_vat?: number
          details?: string | null
          id?: string
          purchase_id?: string
          reason?: Database["public"]["Enums"]["complaint_reason"]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: true
            referencedRelation: "lead_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          amount_ex_vat: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          unit_price_ex_vat: number
        }
        Insert: {
          amount_ex_vat?: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          unit_price_ex_vat?: number
        }
        Update: {
          amount_ex_vat?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          unit_price_ex_vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          company_id: string
          created_at: string
          due_date: string
          id: string
          invoice_number: string
          paid_at: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_ex_vat: number
          total_inc_vat: number
          updated_at: string
          vat_amount: number
        }
        Insert: {
          company_id: string
          created_at?: string
          due_date?: string
          id?: string
          invoice_number: string
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_ex_vat?: number
          total_inc_vat?: number
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          due_date?: string
          id?: string
          invoice_number?: string
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_ex_vat?: number
          total_inc_vat?: number
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_purchases: {
        Row: {
          assigned_at: string
          assigned_to: string | null
          billable: boolean
          company_id: string
          contacted_within_24h: boolean | null
          contacted_within_48h: boolean | null
          created_at: string
          credited: boolean
          first_contact_at: string | null
          id: string
          invoice_id: string | null
          lead_id: string
          note: string | null
          opened_at: string | null
          price_ex_vat: number
          purchased_by: string | null
          response_score: number
          source: Database["public"]["Enums"]["purchase_source"]
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_to?: string | null
          billable?: boolean
          company_id: string
          contacted_within_24h?: boolean | null
          contacted_within_48h?: boolean | null
          created_at?: string
          credited?: boolean
          first_contact_at?: string | null
          id?: string
          invoice_id?: string | null
          lead_id: string
          note?: string | null
          opened_at?: string | null
          price_ex_vat?: number
          purchased_by?: string | null
          response_score?: number
          source?: Database["public"]["Enums"]["purchase_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_to?: string | null
          billable?: boolean
          company_id?: string
          contacted_within_24h?: boolean | null
          contacted_within_48h?: boolean | null
          created_at?: string
          credited?: boolean
          first_contact_at?: string | null
          id?: string
          invoice_id?: string | null
          lead_id?: string
          note?: string | null
          opened_at?: string | null
          price_ex_vat?: number
          purchased_by?: string | null
          response_score?: number
          source?: Database["public"]["Enums"]["purchase_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_purchases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_purchases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_purchases_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
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
          distributed_at: string | null
          email: string
          estimated_savings: number
          ev_status: string | null
          first_name: string
          house_number: string | null
          house_type: string | null
          id: string
          last_name: string
          lead_type: Database["public"]["Enums"]["lead_type"]
          max_partners: number
          notes: string | null
          panel_count: number | null
          phone: string
          phone_verified: boolean
          postcode: string
          purchase_count: number
          region_code: string | null
          smart_devices: string[]
          state: Database["public"]["Enums"]["lead_state"]
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
          distributed_at?: string | null
          email: string
          estimated_savings?: number
          ev_status?: string | null
          first_name: string
          house_number?: string | null
          house_type?: string | null
          id?: string
          last_name: string
          lead_type?: Database["public"]["Enums"]["lead_type"]
          max_partners?: number
          notes?: string | null
          panel_count?: number | null
          phone: string
          phone_verified?: boolean
          postcode: string
          purchase_count?: number
          region_code?: string | null
          smart_devices?: string[]
          state?: Database["public"]["Enums"]["lead_state"]
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
          distributed_at?: string | null
          email?: string
          estimated_savings?: number
          ev_status?: string | null
          first_name?: string
          house_number?: string | null
          house_type?: string | null
          id?: string
          last_name?: string
          lead_type?: Database["public"]["Enums"]["lead_type"]
          max_partners?: number
          notes?: string | null
          panel_count?: number | null
          phone?: string
          phone_verified?: boolean
          postcode?: string
          purchase_count?: number
          region_code?: string | null
          smart_devices?: string[]
          state?: Database["public"]["Enums"]["lead_state"]
        }
        Relationships: []
      }
      phone_verifications: {
        Row: {
          attempts: number
          created_at: string
          expires_at: string
          id: string
          phone: string
          token: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          phone: string
          token?: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          token?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      postcode_geo: {
        Row: {
          city: string | null
          created_at: string
          lat: number
          lng: number
          postcode: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          lat: number
          lng: number
          postcode: string
        }
        Update: {
          city?: string | null
          created_at?: string
          lat?: number
          lng?: number
          postcode?: string
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
      regions: {
        Row: {
          code: string
          name: string
        }
        Insert: {
          code: string
          name: string
        }
        Update: {
          code?: string
          name?: string
        }
        Relationships: []
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
      complaint_reason:
        | "unreachable"
        | "invalid_phone"
        | "duplicate"
        | "out_of_area"
        | "no_interest"
        | "spam"
      complaint_status: "pending" | "approved" | "rejected"
      invoice_status:
        | "draft"
        | "issued"
        | "paid"
        | "overdue"
        | "cancelled"
        | "credited"
      lead_state: "new" | "assigned" | "underfilled" | "cancelled"
      lead_status: "new" | "contacted" | "quoted" | "won" | "lost"
      lead_type: "shared_2" | "shared_4"
      purchase_source: "assigned" | "market"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      complaint_reason: [
        "unreachable",
        "invalid_phone",
        "duplicate",
        "out_of_area",
        "no_interest",
        "spam",
      ],
      complaint_status: ["pending", "approved", "rejected"],
      invoice_status: [
        "draft",
        "issued",
        "paid",
        "overdue",
        "cancelled",
        "credited",
      ],
      lead_state: ["new", "assigned", "underfilled", "cancelled"],
      lead_status: ["new", "contacted", "quoted", "won", "lost"],
      lead_type: ["shared_2", "shared_4"],
      purchase_source: ["assigned", "market"],
    },
  },
} as const
