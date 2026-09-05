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
      audit_events: {
        Row: {
          actor_company_id: string | null
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["audit_entity"]
          event_type: Database["public"]["Enums"]["audit_event_type"]
          id: string
          metadata: Json
          source: Database["public"]["Enums"]["audit_source"]
        }
        Insert: {
          actor_company_id?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["audit_entity"]
          event_type: Database["public"]["Enums"]["audit_event_type"]
          id?: string
          metadata?: Json
          source?: Database["public"]["Enums"]["audit_source"]
        }
        Update: {
          actor_company_id?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["audit_entity"]
          event_type?: Database["public"]["Enums"]["audit_event_type"]
          id?: string
          metadata?: Json
          source?: Database["public"]["Enums"]["audit_source"]
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_company_id_fkey"
            columns: ["actor_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
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
      company_quality_scores: {
        Row: {
          calculated_at: string
          company_id: string
          complaint_score: number
          conversion_score: number
          created_at: string
          engagement_score: number
          metrics: Json
          overall_score: number
          quality_warning: boolean
          response_score: number
          sample_size: number
          updated_at: string
        }
        Insert: {
          calculated_at?: string
          company_id: string
          complaint_score?: number
          conversion_score?: number
          created_at?: string
          engagement_score?: number
          metrics?: Json
          overall_score?: number
          quality_warning?: boolean
          response_score?: number
          sample_size?: number
          updated_at?: string
        }
        Update: {
          calculated_at?: string
          company_id?: string
          complaint_score?: number
          conversion_score?: number
          created_at?: string
          engagement_score?: number
          metrics?: Json
          overall_score?: number
          quality_warning?: boolean
          response_score?: number
          sample_size?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_quality_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
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
      credit_note_lines: {
        Row: {
          complaint_id: string | null
          created_at: string
          credit_note_id: string
          description: string
          id: string
          lead_purchase_id: string | null
          line_total_ex_vat: number
          quantity: number
          unit_amount_ex_vat: number
          vat_rate: number
        }
        Insert: {
          complaint_id?: string | null
          created_at?: string
          credit_note_id: string
          description: string
          id?: string
          lead_purchase_id?: string | null
          line_total_ex_vat: number
          quantity?: number
          unit_amount_ex_vat: number
          vat_rate?: number
        }
        Update: {
          complaint_id?: string | null
          created_at?: string
          credit_note_id?: string
          description?: string
          id?: string
          lead_purchase_id?: string | null
          line_total_ex_vat?: number
          quantity?: number
          unit_amount_ex_vat?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_lines_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_lines_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_lines_lead_purchase_id_fkey"
            columns: ["lead_purchase_id"]
            isOneToOne: false
            referencedRelation: "lead_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          applied_at: string | null
          applied_to_invoice_id: string | null
          company_id: string
          complaint_id: string
          created_at: string
          created_by: string | null
          credit_number: string
          description: string | null
          id: string
          issued_at: string
          original_invoice_id: string | null
          purchase_id: string | null
          reason: string | null
          status: Database["public"]["Enums"]["credit_note_status"]
          subtotal_ex_vat: number
          total_inc_vat: number
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          applied_at?: string | null
          applied_to_invoice_id?: string | null
          company_id: string
          complaint_id: string
          created_at?: string
          created_by?: string | null
          credit_number: string
          description?: string | null
          id?: string
          issued_at?: string
          original_invoice_id?: string | null
          purchase_id?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["credit_note_status"]
          subtotal_ex_vat: number
          total_inc_vat: number
          updated_at?: string
          vat_amount: number
          vat_rate?: number
        }
        Update: {
          applied_at?: string | null
          applied_to_invoice_id?: string | null
          company_id?: string
          complaint_id?: string
          created_at?: string
          created_by?: string | null
          credit_number?: string
          description?: string | null
          id?: string
          issued_at?: string
          original_invoice_id?: string | null
          purchase_id?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["credit_note_status"]
          subtotal_ex_vat?: number
          total_inc_vat?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_applied_to_invoice_id_fkey"
            columns: ["applied_to_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: true
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_original_invoice_id_fkey"
            columns: ["original_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "lead_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_number_counters: {
        Row: {
          last_number: number
          year: number
        }
        Insert: {
          last_number?: number
          year: number
        }
        Update: {
          last_number?: number
          year?: number
        }
        Relationships: []
      }
      financial_events: {
        Row: {
          actor_id: string | null
          amount_inc_vat: number | null
          company_id: string | null
          complaint_id: string | null
          created_at: string
          credit_note_id: string | null
          detail: Json
          event_type: string
          id: string
          invoice_id: string | null
          purchase_id: string | null
        }
        Insert: {
          actor_id?: string | null
          amount_inc_vat?: number | null
          company_id?: string | null
          complaint_id?: string | null
          created_at?: string
          credit_note_id?: string | null
          detail?: Json
          event_type: string
          id?: string
          invoice_id?: string | null
          purchase_id?: string | null
        }
        Update: {
          actor_id?: string | null
          amount_inc_vat?: number | null
          company_id?: string | null
          complaint_id?: string | null
          created_at?: string
          credit_note_id?: string | null
          detail?: Json
          event_type?: string
          id?: string
          invoice_id?: string | null
          purchase_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_events_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_events_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_events_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
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
          vat_rate: number
        }
        Insert: {
          amount_ex_vat?: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          unit_price_ex_vat?: number
          vat_rate?: number
        }
        Update: {
          amount_ex_vat?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          unit_price_ex_vat?: number
          vat_rate?: number
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
          active_payment_id: string | null
          amount_due_inc_vat: number | null
          company_id: string
          created_at: string
          credit_applied_inc_vat: number
          due_date: string
          id: string
          invoice_number: string
          last_payment_attempt_at: string | null
          paid_at: string | null
          payment_review_required: boolean
          payment_status: Database["public"]["Enums"]["payment_status"]
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_ex_vat: number
          total_inc_vat: number
          updated_at: string
          vat_amount: number
        }
        Insert: {
          active_payment_id?: string | null
          amount_due_inc_vat?: number | null
          company_id: string
          created_at?: string
          credit_applied_inc_vat?: number
          due_date?: string
          id?: string
          invoice_number: string
          last_payment_attempt_at?: string | null
          paid_at?: string | null
          payment_review_required?: boolean
          payment_status?: Database["public"]["Enums"]["payment_status"]
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_ex_vat?: number
          total_inc_vat?: number
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          active_payment_id?: string | null
          amount_due_inc_vat?: number | null
          company_id?: string
          created_at?: string
          credit_applied_inc_vat?: number
          due_date?: string
          id?: string
          invoice_number?: string
          last_payment_attempt_at?: string | null
          paid_at?: string | null
          payment_review_required?: boolean
          payment_status?: Database["public"]["Enums"]["payment_status"]
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
            foreignKeyName: "invoices_active_payment_id_fkey"
            columns: ["active_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_purchase_status_history: {
        Row: {
          changed_by: string | null
          changed_by_role: string | null
          company_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["lead_status"] | null
          id: string
          lead_purchase_id: string
          note: string | null
          source: Database["public"]["Enums"]["audit_source"]
          to_status: Database["public"]["Enums"]["lead_status"]
        }
        Insert: {
          changed_by?: string | null
          changed_by_role?: string | null
          company_id: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["lead_status"] | null
          id?: string
          lead_purchase_id: string
          note?: string | null
          source?: Database["public"]["Enums"]["audit_source"]
          to_status: Database["public"]["Enums"]["lead_status"]
        }
        Update: {
          changed_by?: string | null
          changed_by_role?: string | null
          company_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["lead_status"] | null
          id?: string
          lead_purchase_id?: string
          note?: string | null
          source?: Database["public"]["Enums"]["audit_source"]
          to_status?: Database["public"]["Enums"]["lead_status"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_purchase_status_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_purchase_status_history_lead_purchase_id_fkey"
            columns: ["lead_purchase_id"]
            isOneToOne: false
            referencedRelation: "lead_purchases"
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
          is_trial: boolean
          lead_id: string
          note: string | null
          opened_at: string | null
          price_ex_vat: number
          purchased_by: string | null
          response_score: number
          source: Database["public"]["Enums"]["purchase_source"]
          status: Database["public"]["Enums"]["lead_status"]
          trial_sequence_number: number | null
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
          is_trial?: boolean
          lead_id: string
          note?: string | null
          opened_at?: string | null
          price_ex_vat?: number
          purchased_by?: string | null
          response_score?: number
          source?: Database["public"]["Enums"]["purchase_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          trial_sequence_number?: number | null
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
          is_trial?: boolean
          lead_id?: string
          note?: string | null
          opened_at?: string | null
          price_ex_vat?: number
          purchased_by?: string | null
          response_score?: number
          source?: Database["public"]["Enums"]["purchase_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          trial_sequence_number?: number | null
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
      lead_risk_events: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          metadata: Json
          score: number
          signal: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          metadata?: Json
          score?: number
          signal: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          metadata?: Json
          score?: number
          signal?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_risk_events_lead_id_fkey"
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
          duplicate_of_lead_id: string | null
          email: string
          email_normalized: string | null
          estimated_savings: number
          ev_status: string | null
          first_name: string
          fraud_score: number
          fraud_status: Database["public"]["Enums"]["lead_fraud_status"]
          house_number: string | null
          house_type: string | null
          id: string
          identity_fingerprint: string | null
          last_name: string
          lead_type: Database["public"]["Enums"]["lead_type"]
          max_partners: number
          notes: string | null
          panel_count: number | null
          phone: string
          phone_verified: boolean
          phone_verified_at: string | null
          postcode: string
          purchase_count: number
          region_code: string | null
          review_required: boolean
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
          duplicate_of_lead_id?: string | null
          email: string
          email_normalized?: string | null
          estimated_savings?: number
          ev_status?: string | null
          first_name: string
          fraud_score?: number
          fraud_status?: Database["public"]["Enums"]["lead_fraud_status"]
          house_number?: string | null
          house_type?: string | null
          id?: string
          identity_fingerprint?: string | null
          last_name: string
          lead_type?: Database["public"]["Enums"]["lead_type"]
          max_partners?: number
          notes?: string | null
          panel_count?: number | null
          phone: string
          phone_verified?: boolean
          phone_verified_at?: string | null
          postcode: string
          purchase_count?: number
          region_code?: string | null
          review_required?: boolean
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
          duplicate_of_lead_id?: string | null
          email?: string
          email_normalized?: string | null
          estimated_savings?: number
          ev_status?: string | null
          first_name?: string
          fraud_score?: number
          fraud_status?: Database["public"]["Enums"]["lead_fraud_status"]
          house_number?: string | null
          house_type?: string | null
          id?: string
          identity_fingerprint?: string | null
          last_name?: string
          lead_type?: Database["public"]["Enums"]["lead_type"]
          max_partners?: number
          notes?: string | null
          panel_count?: number | null
          phone?: string
          phone_verified?: boolean
          phone_verified_at?: string | null
          postcode?: string
          purchase_count?: number
          region_code?: string | null
          review_required?: boolean
          smart_devices?: string[]
          state?: Database["public"]["Enums"]["lead_state"]
        }
        Relationships: [
          {
            foreignKeyName: "leads_duplicate_of_lead_id_fkey"
            columns: ["duplicate_of_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          amount_mismatch: boolean
          checkout_url: string | null
          company_id: string
          created_at: string
          currency: string
          expires_at: string | null
          failed_at: string | null
          id: string
          invoice_id: string
          metadata: Json
          paid_at: string | null
          provider: string
          provider_payment_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          amount_mismatch?: boolean
          checkout_url?: string | null
          company_id: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          failed_at?: string | null
          id?: string
          invoice_id: string
          metadata?: Json
          paid_at?: string | null
          provider?: string
          provider_payment_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_mismatch?: boolean
          checkout_url?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          failed_at?: string | null
          id?: string
          invoice_id?: string
          metadata?: Json
          paid_at?: string | null
          provider?: string
          provider_payment_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_verifications: {
        Row: {
          attempts: number
          code_hash: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          last_sent_at: string
          lead_id: string | null
          phone: string
          send_count: number
          token: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code_hash?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          last_sent_at?: string
          lead_id?: string | null
          phone: string
          send_count?: number
          token?: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          last_sent_at?: string
          lead_id?: string | null
          phone?: string
          send_count?: number
          token?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_verifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
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
      allocate_lead_to_company: {
        Args: {
          p_company_id: string
          p_lead_id: string
          p_purchased_by?: string
          p_source?: Database["public"]["Enums"]["purchase_source"]
        }
        Returns: {
          billable: boolean
          is_trial: boolean
          price_ex_vat: number
          purchase_id: string
          result: string
          trial_sequence_number: number
        }[]
      }
      apply_open_credits: {
        Args: { p_company_id: string; p_invoice_id: string }
        Returns: number
      }
      audit_actor: { Args: never; Returns: string }
      audit_actor_role: { Args: { _user: string }; Returns: string }
      audit_partner_visible: {
        Args: { _type: Database["public"]["Enums"]["audit_event_type"] }
        Returns: boolean
      }
      audit_source_setting:
        | {
            Args: { _fallback?: Database["public"]["Enums"]["audit_source"] }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.audit_source_setting(_fallback => text), public.audit_source_setting(_fallback => audit_source). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { _fallback: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.audit_source_setting(_fallback => text), public.audit_source_setting(_fallback => audit_source). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      company_quality_metrics: {
        Args: { p_company_id?: string }
        Returns: {
          approved_complaints: number
          closed_count: number
          company_id: string
          contacted_count: number
          last_assigned_at: string
          leads_sla_eligible: number
          leads_total: number
          opened_count: number
          quoted_plus_count: number
          recent_7d: number
          untouched_count: number
          within_24h: number
          within_48h: number
          won_count: number
        }[]
      }
      current_company_id: { Args: never; Returns: string }
      ensure_credit_note_for_complaint: {
        Args: { p_actor?: string; p_complaint_id: string }
        Returns: {
          credit_note_id: string
          credit_number: string
          result: string
          total_inc_vat: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_audit_event:
        | {
            Args: {
              p_actor?: string
              p_company?: string
              p_entity: Database["public"]["Enums"]["audit_entity"]
              p_entity_id: string
              p_event: Database["public"]["Enums"]["audit_event_type"]
              p_metadata?: Json
              p_source?: Database["public"]["Enums"]["audit_source"]
            }
            Returns: string
          }
        | {
            Args: {
              p_actor?: string
              p_company?: string
              p_entity: string
              p_entity_id: string
              p_event: string
              p_metadata?: Json
              p_source?: string
            }
            Returns: string
          }
      mark_purchase_opened: {
        Args: { p_actor?: string; p_company_id: string; p_purchase_id: string }
        Returns: boolean
      }
      next_credit_number: { Args: never; Returns: string }
      review_complaint_with_credit: {
        Args: {
          p_actor?: string
          p_approve: boolean
          p_complaint_id: string
          p_note?: string
        }
        Returns: {
          credit_ex_vat: number
          credit_note_id: string
          credit_number: string
          result: string
          total_inc_vat: number
        }[]
      }
      set_purchase_status: {
        Args: {
          p_actor?: string
          p_company_id: string
          p_note?: string
          p_purchase_id: string
          p_source?: Database["public"]["Enums"]["audit_source"]
          p_status: Database["public"]["Enums"]["lead_status"]
        }
        Returns: {
          changed: boolean
          result: string
        }[]
      }
      trial_lead_allowance: { Args: never; Returns: number }
      update_company_commercial: {
        Args: {
          p_active?: boolean
          p_actor: string
          p_company_id: string
          p_monthly_fee_ex_vat?: number
          p_monthly_lead_limit?: number
          p_plan_name?: string
        }
        Returns: boolean
      }
      update_company_profile_audited: {
        Args: {
          p_actor: string
          p_address?: string
          p_billing_email?: string
          p_company_id: string
          p_name: string
          p_vat_number?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "owner" | "account_manager"
      audit_entity:
        | "lead"
        | "lead_purchase"
        | "company"
        | "complaint"
        | "invoice"
        | "credit_note"
        | "payment"
      audit_event_type:
        | "LEAD_CREATED"
        | "PHONE_VERIFIED"
        | "LEAD_FLAGGED"
        | "LEAD_BLOCKED"
        | "LEAD_ALLOCATED"
        | "LEAD_OPENED"
        | "LEAD_CONTACTED"
        | "LEAD_STATUS_CHANGED"
        | "COMPLAINT_CREATED"
        | "COMPLAINT_APPROVED"
        | "COMPLAINT_REJECTED"
        | "INVOICE_CREATED"
        | "PAYMENT_CREATED"
        | "PAYMENT_STATUS_CHANGED"
        | "INVOICE_PAID"
        | "CREDIT_NOTE_CREATED"
        | "CREDIT_APPLIED"
        | "COMPANY_PROFILE_UPDATED"
        | "COMPANY_COMMERCIAL_SETTINGS_UPDATED"
        | "COMPANY_ACTIVATED"
        | "COMPANY_DEACTIVATED"
        | "CURRENT_STATUS_SNAPSHOT"
        | "QUALITY_SCORE_RECALCULATED"
        | "QUALITY_WARNING_SET"
        | "QUALITY_WARNING_CLEARED"
      audit_source: "partner" | "admin" | "system" | "webhook"
      complaint_reason:
        | "unreachable"
        | "invalid_phone"
        | "duplicate"
        | "out_of_area"
        | "no_interest"
        | "spam"
      complaint_status: "pending" | "approved" | "rejected"
      credit_note_status: "open" | "applied" | "refunded"
      invoice_status:
        | "draft"
        | "issued"
        | "paid"
        | "overdue"
        | "cancelled"
        | "credited"
        | "open"
      lead_fraud_status: "clean" | "review" | "blocked"
      lead_state: "new" | "assigned" | "underfilled" | "cancelled"
      lead_status: "new" | "contacted" | "quoted" | "won" | "lost"
      lead_type: "shared_2" | "shared_4"
      payment_status:
        | "open"
        | "pending"
        | "paid"
        | "failed"
        | "expired"
        | "canceled"
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
      audit_entity: [
        "lead",
        "lead_purchase",
        "company",
        "complaint",
        "invoice",
        "credit_note",
        "payment",
      ],
      audit_event_type: [
        "LEAD_CREATED",
        "PHONE_VERIFIED",
        "LEAD_FLAGGED",
        "LEAD_BLOCKED",
        "LEAD_ALLOCATED",
        "LEAD_OPENED",
        "LEAD_CONTACTED",
        "LEAD_STATUS_CHANGED",
        "COMPLAINT_CREATED",
        "COMPLAINT_APPROVED",
        "COMPLAINT_REJECTED",
        "INVOICE_CREATED",
        "PAYMENT_CREATED",
        "PAYMENT_STATUS_CHANGED",
        "INVOICE_PAID",
        "CREDIT_NOTE_CREATED",
        "CREDIT_APPLIED",
        "COMPANY_PROFILE_UPDATED",
        "COMPANY_COMMERCIAL_SETTINGS_UPDATED",
        "COMPANY_ACTIVATED",
        "COMPANY_DEACTIVATED",
        "CURRENT_STATUS_SNAPSHOT",
        "QUALITY_SCORE_RECALCULATED",
        "QUALITY_WARNING_SET",
        "QUALITY_WARNING_CLEARED",
      ],
      audit_source: ["partner", "admin", "system", "webhook"],
      complaint_reason: [
        "unreachable",
        "invalid_phone",
        "duplicate",
        "out_of_area",
        "no_interest",
        "spam",
      ],
      complaint_status: ["pending", "approved", "rejected"],
      credit_note_status: ["open", "applied", "refunded"],
      invoice_status: [
        "draft",
        "issued",
        "paid",
        "overdue",
        "cancelled",
        "credited",
        "open",
      ],
      lead_fraud_status: ["clean", "review", "blocked"],
      lead_state: ["new", "assigned", "underfilled", "cancelled"],
      lead_status: ["new", "contacted", "quoted", "won", "lost"],
      lead_type: ["shared_2", "shared_4"],
      payment_status: [
        "open",
        "pending",
        "paid",
        "failed",
        "expired",
        "canceled",
      ],
      purchase_source: ["assigned", "market"],
    },
  },
} as const
