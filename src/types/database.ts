/**
 * Generated database types. Do not edit by hand.
 *
 * Regenerate after every migration:
 *
 *   npm run supabase:types
 *   # or, against the hosted project:
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 *
 * Generated from the applied schema, not written by hand — a hand-written
 * type here would be an assurance nobody checked (docs/database-migrations.md).
 */

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
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: number
          metadata: Json
          organization_id: string | null
          resource_id: string | null
          resource_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: never
          metadata?: Json
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: never
          metadata?: Json
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      awards: {
        Row: {
          award_date: string | null
          award_value_net: number | null
          bidder_count: number | null
          contracting_authority_id: string | null
          created_at: string
          currency: string
          external_id: string | null
          id: string
          is_demo: boolean
          source_id: string
          source_url: string | null
          tender_id: string | null
          updated_at: string
          winner_city: string | null
          winner_name: string
        }
        Insert: {
          award_date?: string | null
          award_value_net?: number | null
          bidder_count?: number | null
          contracting_authority_id?: string | null
          created_at?: string
          currency?: string
          external_id?: string | null
          id?: string
          is_demo?: boolean
          source_id: string
          source_url?: string | null
          tender_id?: string | null
          updated_at?: string
          winner_city?: string | null
          winner_name: string
        }
        Update: {
          award_date?: string | null
          award_value_net?: number | null
          bidder_count?: number | null
          contracting_authority_id?: string | null
          created_at?: string
          currency?: string
          external_id?: string | null
          id?: string
          is_demo?: boolean
          source_id?: string
          source_url?: string | null
          tender_id?: string | null
          updated_at?: string
          winner_city?: string | null
          winner_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "awards_contracting_authority_id_fkey"
            columns: ["contracting_authority_id"]
            isOneToOne: false
            referencedRelation: "contracting_authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      business_clients: {
        Row: {
          country: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          normalized_name: string
          notes: string | null
          organization_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          normalized_name: string
          notes?: string | null
          organization_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          normalized_name?: string
          notes?: string | null
          organization_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_profiles: {
        Row: {
          country_codes: string[]
          cpv_codes: string[]
          created_at: string
          description: string | null
          employee_count: number | null
          founded_year: number | null
          max_contract_value: number | null
          min_contract_value: number | null
          organization_id: string
          region_codes: string[]
          sectors: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          country_codes?: string[]
          cpv_codes?: string[]
          created_at?: string
          description?: string | null
          employee_count?: number | null
          founded_year?: number | null
          max_contract_value?: number | null
          min_contract_value?: number | null
          organization_id: string
          region_codes?: string[]
          sectors?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          country_codes?: string[]
          cpv_codes?: string[]
          created_at?: string
          description?: string | null
          employee_count?: number | null
          founded_year?: number | null
          max_contract_value?: number | null
          min_contract_value?: number | null
          organization_id?: string
          region_codes?: string[]
          sectors?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_runs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          items_failed: number
          items_found: number
          items_imported: number
          items_skipped: number
          source_id: string
          started_at: string
          status: Database["public"]["Enums"]["connector_run_status"]
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_failed?: number
          items_found?: number
          items_imported?: number
          items_skipped?: number
          source_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["connector_run_status"]
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_failed?: number
          items_found?: number
          items_imported?: number
          items_skipped?: number
          source_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["connector_run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "connector_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      contracting_authorities: {
        Row: {
          authority_type: string | null
          city: string | null
          country_code: string | null
          created_at: string
          dedupe_key: string
          email: string | null
          external_id: string | null
          id: string
          is_demo: boolean
          name: string
          phone: string | null
          postal_code: string | null
          region_code: string | null
          source_id: string
          street: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          authority_type?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          dedupe_key: string
          email?: string | null
          external_id?: string | null
          id?: string
          is_demo?: boolean
          name: string
          phone?: string | null
          postal_code?: string | null
          region_code?: string | null
          source_id: string
          street?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          authority_type?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          dedupe_key?: string
          email?: string | null
          external_id?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          phone?: string | null
          postal_code?: string | null
          region_code?: string | null
          source_id?: string
          street?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracting_authorities_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          note: string | null
          organization_id: string
          tender_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          organization_id: string
          tender_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          organization_id?: string
          tender_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      normalization_runs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          mapper_version: string
          raw_import_id: string
          source_id: string
          status: Database["public"]["Enums"]["normalization_run_status"]
          tender_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          mapper_version: string
          raw_import_id: string
          source_id: string
          status: Database["public"]["Enums"]["normalization_run_status"]
          tender_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          mapper_version?: string
          raw_import_id?: string
          source_id?: string
          status?: Database["public"]["Enums"]["normalization_run_status"]
          tender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "normalization_runs_raw_import_id_fkey"
            columns: ["raw_import_id"]
            isOneToOne: false
            referencedRelation: "raw_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalization_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_documents: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          bucket_id: string
          checksum: string | null
          confidentiality: Database["public"]["Enums"]["confidentiality_level"]
          created_at: string
          credential_type: Database["public"]["Enums"]["credential_type"]
          document_number: string | null
          file_name: string
          file_size: number | null
          id: string
          issuer: string | null
          lifecycle: Database["public"]["Enums"]["document_lifecycle"]
          mime_type: string | null
          note: string | null
          organization_id: string
          original_file_name: string | null
          review_status: Database["public"]["Enums"]["credential_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          scan_status: Database["public"]["Enums"]["document_scan_status"]
          storage_path: string
          title: string | null
          updated_at: string
          uploaded_by: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          bucket_id?: string
          checksum?: string | null
          confidentiality?: Database["public"]["Enums"]["confidentiality_level"]
          created_at?: string
          credential_type?: Database["public"]["Enums"]["credential_type"]
          document_number?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          issuer?: string | null
          lifecycle?: Database["public"]["Enums"]["document_lifecycle"]
          mime_type?: string | null
          note?: string | null
          organization_id: string
          original_file_name?: string | null
          review_status?: Database["public"]["Enums"]["credential_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          scan_status?: Database["public"]["Enums"]["document_scan_status"]
          storage_path: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          bucket_id?: string
          checksum?: string | null
          confidentiality?: Database["public"]["Enums"]["confidentiality_level"]
          created_at?: string
          credential_type?: Database["public"]["Enums"]["credential_type"]
          document_number?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          issuer?: string | null
          lifecycle?: Database["public"]["Enums"]["document_lifecycle"]
          mime_type?: string | null
          note?: string | null
          organization_id?: string
          original_file_name?: string | null
          review_status?: Database["public"]["Enums"]["credential_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          scan_status?: Database["public"]["Enums"]["document_scan_status"]
          storage_path?: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_documents_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          city: string | null
          country_code: string | null
          created_at: string
          id: string
          is_demo: boolean
          legal_form: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          legal_form?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          legal_form?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      partner_activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["partner_activity_type"]
          created_at: string
          created_by: string | null
          follow_up_at: string | null
          id: string
          next_action: string | null
          occurred_at: string
          organization_id: string
          outcome: string | null
          partner_company_id: string
          partner_contact_id: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["partner_activity_type"]
          created_at?: string
          created_by?: string | null
          follow_up_at?: string | null
          id?: string
          next_action?: string | null
          occurred_at?: string
          organization_id: string
          outcome?: string | null
          partner_company_id: string
          partner_contact_id?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["partner_activity_type"]
          created_at?: string
          created_by?: string | null
          follow_up_at?: string | null
          id?: string
          next_action?: string | null
          occurred_at?: string
          organization_id?: string
          outcome?: string | null
          partner_company_id?: string
          partner_contact_id?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_activities_company_fk"
            columns: ["partner_company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "partner_activities_contact_fk"
            columns: ["partner_contact_id"]
            isOneToOne: false
            referencedRelation: "partner_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_availability: {
        Row: {
          around_the_clock: boolean
          available_from: string | null
          available_staff: number | null
          available_until: string | null
          created_at: string
          id: string
          last_confirmed_at: string | null
          night_shift: boolean
          note: string | null
          organization_id: string
          partner_company_id: string
          service_category:
            | Database["public"]["Enums"]["partner_service_category"]
            | null
          shift_model: Database["public"]["Enums"]["shift_model"]
          short_notice: boolean
          status: Database["public"]["Enums"]["availability_status"]
          updated_at: string
          weekend: boolean
        }
        Insert: {
          around_the_clock?: boolean
          available_from?: string | null
          available_staff?: number | null
          available_until?: string | null
          created_at?: string
          id?: string
          last_confirmed_at?: string | null
          night_shift?: boolean
          note?: string | null
          organization_id: string
          partner_company_id: string
          service_category?:
            | Database["public"]["Enums"]["partner_service_category"]
            | null
          shift_model?: Database["public"]["Enums"]["shift_model"]
          short_notice?: boolean
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
          weekend?: boolean
        }
        Update: {
          around_the_clock?: boolean
          available_from?: string | null
          available_staff?: number | null
          available_until?: string | null
          created_at?: string
          id?: string
          last_confirmed_at?: string | null
          night_shift?: boolean
          note?: string | null
          organization_id?: string
          partner_company_id?: string
          service_category?:
            | Database["public"]["Enums"]["partner_service_category"]
            | null
          shift_model?: Database["public"]["Enums"]["shift_model"]
          short_notice?: boolean
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
          weekend?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "partner_availability_company_fk"
            columns: ["partner_company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_companies"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      partner_companies: {
        Row: {
          address: string | null
          archived_at: string | null
          blocked_reason: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          datacenter_experience_status: Database["public"]["Enums"]["datacenter_experience_status"]
          email: string | null
          first_observed_at: string | null
          further_subcontracting_status: Database["public"]["Enums"]["further_subcontracting_status"]
          id: string
          internal_notes: string | null
          internal_rating: number | null
          is_blocked: boolean
          is_preferred: boolean
          last_contact_at: string | null
          last_verified_at: string | null
          legal_name: string
          lei: string | null
          linked_business_client_id: string | null
          next_follow_up_at: string | null
          normalized_name: string
          organization_id: string
          partner_level: Database["public"]["Enums"]["partner_level"]
          phone: string | null
          postal_code: string | null
          region: string | null
          registry_name: string | null
          registry_number: string | null
          relationship_direction: Database["public"]["Enums"]["relationship_direction"]
          source_name: string | null
          source_type:
            | Database["public"]["Enums"]["observation_source_type"]
            | null
          source_url: string | null
          staff_model: Database["public"]["Enums"]["staff_model"]
          status: Database["public"]["Enums"]["partner_status"]
          trade_name: string | null
          updated_at: string
          vat_id: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
          website: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          blocked_reason?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          datacenter_experience_status?: Database["public"]["Enums"]["datacenter_experience_status"]
          email?: string | null
          first_observed_at?: string | null
          further_subcontracting_status?: Database["public"]["Enums"]["further_subcontracting_status"]
          id?: string
          internal_notes?: string | null
          internal_rating?: number | null
          is_blocked?: boolean
          is_preferred?: boolean
          last_contact_at?: string | null
          last_verified_at?: string | null
          legal_name: string
          lei?: string | null
          linked_business_client_id?: string | null
          next_follow_up_at?: string | null
          normalized_name: string
          organization_id: string
          partner_level?: Database["public"]["Enums"]["partner_level"]
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          registry_name?: string | null
          registry_number?: string | null
          relationship_direction?: Database["public"]["Enums"]["relationship_direction"]
          source_name?: string | null
          source_type?:
            | Database["public"]["Enums"]["observation_source_type"]
            | null
          source_url?: string | null
          staff_model?: Database["public"]["Enums"]["staff_model"]
          status?: Database["public"]["Enums"]["partner_status"]
          trade_name?: string | null
          updated_at?: string
          vat_id?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          website?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          blocked_reason?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          datacenter_experience_status?: Database["public"]["Enums"]["datacenter_experience_status"]
          email?: string | null
          first_observed_at?: string | null
          further_subcontracting_status?: Database["public"]["Enums"]["further_subcontracting_status"]
          id?: string
          internal_notes?: string | null
          internal_rating?: number | null
          is_blocked?: boolean
          is_preferred?: boolean
          last_contact_at?: string | null
          last_verified_at?: string | null
          legal_name?: string
          lei?: string | null
          linked_business_client_id?: string | null
          next_follow_up_at?: string | null
          normalized_name?: string
          organization_id?: string
          partner_level?: Database["public"]["Enums"]["partner_level"]
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          registry_name?: string | null
          registry_number?: string | null
          relationship_direction?: Database["public"]["Enums"]["relationship_direction"]
          source_name?: string | null
          source_type?:
            | Database["public"]["Enums"]["observation_source_type"]
            | null
          source_url?: string | null
          staff_model?: Database["public"]["Enums"]["staff_model"]
          status?: Database["public"]["Enums"]["partner_status"]
          trade_name?: string | null
          updated_at?: string
          vat_id?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_companies_linked_business_client_id_fkey"
            columns: ["linked_business_client_id"]
            isOneToOne: false
            referencedRelation: "business_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_contacts: {
        Row: {
          business_email: string | null
          business_phone: string | null
          created_at: string
          first_name: string | null
          id: string
          internal_note: string | null
          is_active: boolean
          last_name: string
          last_verified_at: string | null
          organization_id: string
          partner_company_id: string
          preferred_channel: Database["public"]["Enums"]["contact_channel"]
          role: string | null
          source_type:
            | Database["public"]["Enums"]["observation_source_type"]
            | null
          updated_at: string
        }
        Insert: {
          business_email?: string | null
          business_phone?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          internal_note?: string | null
          is_active?: boolean
          last_name: string
          last_verified_at?: string | null
          organization_id: string
          partner_company_id: string
          preferred_channel?: Database["public"]["Enums"]["contact_channel"]
          role?: string | null
          source_type?:
            | Database["public"]["Enums"]["observation_source_type"]
            | null
          updated_at?: string
        }
        Update: {
          business_email?: string | null
          business_phone?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          internal_note?: string | null
          is_active?: boolean
          last_name?: string
          last_verified_at?: string | null
          organization_id?: string
          partner_company_id?: string
          preferred_channel?: Database["public"]["Enums"]["contact_channel"]
          role?: string | null
          source_type?:
            | Database["public"]["Enums"]["observation_source_type"]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_contacts_company_fk"
            columns: ["partner_company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_companies"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      partner_documents: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          checksum: string | null
          confidentiality: Database["public"]["Enums"]["partner_confidentiality"]
          created_at: string
          credential_type: Database["public"]["Enums"]["credential_type"]
          file_name: string
          file_size: number | null
          id: string
          lifecycle: Database["public"]["Enums"]["document_lifecycle"]
          mime_type: string | null
          note: string | null
          organization_id: string
          original_file_name: string | null
          partner_company_id: string
          partner_qualification_id: string | null
          review_status: Database["public"]["Enums"]["credential_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          scan_status: Database["public"]["Enums"]["document_scan_status"]
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          checksum?: string | null
          confidentiality?: Database["public"]["Enums"]["partner_confidentiality"]
          created_at?: string
          credential_type?: Database["public"]["Enums"]["credential_type"]
          file_name: string
          file_size?: number | null
          id?: string
          lifecycle?: Database["public"]["Enums"]["document_lifecycle"]
          mime_type?: string | null
          note?: string | null
          organization_id: string
          original_file_name?: string | null
          partner_company_id: string
          partner_qualification_id?: string | null
          review_status?: Database["public"]["Enums"]["credential_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          scan_status?: Database["public"]["Enums"]["document_scan_status"]
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          checksum?: string | null
          confidentiality?: Database["public"]["Enums"]["partner_confidentiality"]
          created_at?: string
          credential_type?: Database["public"]["Enums"]["credential_type"]
          file_name?: string
          file_size?: number | null
          id?: string
          lifecycle?: Database["public"]["Enums"]["document_lifecycle"]
          mime_type?: string | null
          note?: string | null
          organization_id?: string
          original_file_name?: string | null
          partner_company_id?: string
          partner_qualification_id?: string | null
          review_status?: Database["public"]["Enums"]["credential_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          scan_status?: Database["public"]["Enums"]["document_scan_status"]
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_documents_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_documents_company_fk"
            columns: ["partner_company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "partner_documents_qualification_fk"
            columns: ["partner_qualification_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_qualifications"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "partner_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_import_rows: {
        Row: {
          created_at: string
          id: string
          imported_company_id: string | null
          normalized_data: Json
          organization_id: string
          partner_import_id: string
          raw_data: Json
          row_number: number
          validation_messages: Json
          validation_status: Database["public"]["Enums"]["import_row_validation_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          imported_company_id?: string | null
          normalized_data?: Json
          organization_id: string
          partner_import_id: string
          raw_data: Json
          row_number: number
          validation_messages?: Json
          validation_status?: Database["public"]["Enums"]["import_row_validation_status"]
        }
        Update: {
          created_at?: string
          id?: string
          imported_company_id?: string | null
          normalized_data?: Json
          organization_id?: string
          partner_import_id?: string
          raw_data?: Json
          row_number?: number
          validation_messages?: Json
          validation_status?: Database["public"]["Enums"]["import_row_validation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "partner_import_rows_company_fk"
            columns: ["imported_company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "partner_import_rows_import_fk"
            columns: ["partner_import_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_imports"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      partner_imports: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_rows: number
          file_name: string
          file_type: string
          id: string
          imported_rows: number
          organization_id: string
          status: Database["public"]["Enums"]["reference_import_status"]
          total_rows: number
          valid_rows: number
          warning_rows: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_rows?: number
          file_name: string
          file_type: string
          id?: string
          imported_rows?: number
          organization_id: string
          status?: Database["public"]["Enums"]["reference_import_status"]
          total_rows?: number
          valid_rows?: number
          warning_rows?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_rows?: number
          file_name?: string
          file_type?: string
          id?: string
          imported_rows?: number
          organization_id?: string
          status?: Database["public"]["Enums"]["reference_import_status"]
          total_rows?: number
          valid_rows?: number
          warning_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_imports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_qualifications: {
        Row: {
          created_at: string
          credential_type: Database["public"]["Enums"]["credential_type"]
          document_number: string | null
          id: string
          issuer: string | null
          note: string | null
          organization_id: string
          partner_company_id: string
          review_status: Database["public"]["Enums"]["credential_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          title: string | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          credential_type: Database["public"]["Enums"]["credential_type"]
          document_number?: string | null
          id?: string
          issuer?: string | null
          note?: string | null
          organization_id: string
          partner_company_id: string
          review_status?: Database["public"]["Enums"]["credential_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          title?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          credential_type?: Database["public"]["Enums"]["credential_type"]
          document_number?: string | null
          id?: string
          issuer?: string | null
          note?: string | null
          organization_id?: string
          partner_company_id?: string
          review_status?: Database["public"]["Enums"]["credential_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          title?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_qualifications_company_fk"
            columns: ["partner_company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "partner_qualifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_rates: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          internal_note: string | null
          negotiation_status: Database["public"]["Enums"]["negotiation_status"]
          net_amount: number | null
          organization_id: string
          partner_company_id: string
          rate_model: Database["public"]["Enums"]["rate_model"]
          region: string | null
          service_category:
            | Database["public"]["Enums"]["partner_service_category"]
            | null
          surcharges: string | null
          unit: string | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          internal_note?: string | null
          negotiation_status?: Database["public"]["Enums"]["negotiation_status"]
          net_amount?: number | null
          organization_id: string
          partner_company_id: string
          rate_model?: Database["public"]["Enums"]["rate_model"]
          region?: string | null
          service_category?:
            | Database["public"]["Enums"]["partner_service_category"]
            | null
          surcharges?: string | null
          unit?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          internal_note?: string | null
          negotiation_status?: Database["public"]["Enums"]["negotiation_status"]
          net_amount?: number | null
          organization_id?: string
          partner_company_id?: string
          rate_model?: Database["public"]["Enums"]["rate_model"]
          region?: string | null
          service_category?:
            | Database["public"]["Enums"]["partner_service_category"]
            | null
          surcharges?: string | null
          unit?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_rates_company_fk"
            columns: ["partner_company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "partner_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_service_regions: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          id: string
          is_confirmed: boolean
          nationwide: boolean
          note: string | null
          organization_id: string
          partner_company_id: string
          radius_km: number | null
          region: string | null
          updated_at: string
          willing_to_travel: boolean
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_confirmed?: boolean
          nationwide?: boolean
          note?: string | null
          organization_id: string
          partner_company_id: string
          radius_km?: number | null
          region?: string | null
          updated_at?: string
          willing_to_travel?: boolean
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_confirmed?: boolean
          nationwide?: boolean
          note?: string | null
          organization_id?: string
          partner_company_id?: string
          radius_km?: number | null
          region?: string | null
          updated_at?: string
          willing_to_travel?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "partner_service_regions_company_fk"
            columns: ["partner_company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_companies"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      partner_services: {
        Row: {
          available_staff: number | null
          capacity_note: string | null
          confirmation: Database["public"]["Enums"]["partner_service_confirmation"]
          confirmation_source: Database["public"]["Enums"]["partner_service_source"]
          created_at: string
          delivery_mode: Database["public"]["Enums"]["service_delivery_mode"]
          id: string
          note: string | null
          organization_id: string
          partner_company_id: string
          service_category: Database["public"]["Enums"]["partner_service_category"]
          service_label: string | null
          updated_at: string
        }
        Insert: {
          available_staff?: number | null
          capacity_note?: string | null
          confirmation?: Database["public"]["Enums"]["partner_service_confirmation"]
          confirmation_source?: Database["public"]["Enums"]["partner_service_source"]
          created_at?: string
          delivery_mode?: Database["public"]["Enums"]["service_delivery_mode"]
          id?: string
          note?: string | null
          organization_id: string
          partner_company_id: string
          service_category?: Database["public"]["Enums"]["partner_service_category"]
          service_label?: string | null
          updated_at?: string
        }
        Update: {
          available_staff?: number | null
          capacity_note?: string | null
          confirmation?: Database["public"]["Enums"]["partner_service_confirmation"]
          confirmation_source?: Database["public"]["Enums"]["partner_service_source"]
          created_at?: string
          delivery_mode?: Database["public"]["Enums"]["service_delivery_mode"]
          id?: string
          note?: string | null
          organization_id?: string
          partner_company_id?: string
          service_category?: Database["public"]["Enums"]["partner_service_category"]
          service_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_services_company_fk"
            columns: ["partner_company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_companies"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      partner_signals: {
        Row: {
          assigned_to: string | null
          city: string | null
          company_name_raw: string | null
          confidence: Database["public"]["Enums"]["signal_confidence"]
          country: string | null
          created_at: string
          created_by: string | null
          description: string | null
          follow_up_at: string | null
          id: string
          internal_note: string | null
          next_action: string | null
          observed_at: string
          organization_id: string
          partner_company_id: string | null
          project_name: string | null
          region: string | null
          service_category:
            | Database["public"]["Enums"]["partner_service_category"]
            | null
          signal_type: Database["public"]["Enums"]["partner_signal_type"]
          source_name: string | null
          source_type: Database["public"]["Enums"]["observation_source_type"]
          source_url: string | null
          status: Database["public"]["Enums"]["partner_signal_status"]
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          assigned_to?: string | null
          city?: string | null
          company_name_raw?: string | null
          confidence?: Database["public"]["Enums"]["signal_confidence"]
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          follow_up_at?: string | null
          id?: string
          internal_note?: string | null
          next_action?: string | null
          observed_at: string
          organization_id: string
          partner_company_id?: string | null
          project_name?: string | null
          region?: string | null
          service_category?:
            | Database["public"]["Enums"]["partner_service_category"]
            | null
          signal_type: Database["public"]["Enums"]["partner_signal_type"]
          source_name?: string | null
          source_type: Database["public"]["Enums"]["observation_source_type"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["partner_signal_status"]
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          assigned_to?: string | null
          city?: string | null
          company_name_raw?: string | null
          confidence?: Database["public"]["Enums"]["signal_confidence"]
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          follow_up_at?: string | null
          id?: string
          internal_note?: string | null
          next_action?: string | null
          observed_at?: string
          organization_id?: string
          partner_company_id?: string | null
          project_name?: string | null
          region?: string | null
          service_category?:
            | Database["public"]["Enums"]["partner_service_category"]
            | null
          signal_type?: Database["public"]["Enums"]["partner_signal_type"]
          source_name?: string | null
          source_type?: Database["public"]["Enums"]["observation_source_type"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["partner_signal_status"]
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_signals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_signals_company_fk"
            columns: ["partner_company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "partner_signals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_signals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_platform_admin: boolean
          job_title: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          job_title?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          job_title?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      raw_imports: {
        Row: {
          connector_run_id: string | null
          created_at: string
          external_id: string
          fetched_at: string
          id: string
          is_demo: boolean
          payload: Json
          payload_hash: string
          source_id: string
        }
        Insert: {
          connector_run_id?: string | null
          created_at?: string
          external_id: string
          fetched_at?: string
          id?: string
          is_demo?: boolean
          payload: Json
          payload_hash: string
          source_id: string
        }
        Update: {
          connector_run_id?: string | null
          created_at?: string
          external_id?: string
          fetched_at?: string
          id?: string
          is_demo?: boolean
          payload?: Json
          payload_hash?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_imports_connector_run_id_fkey"
            columns: ["connector_run_id"]
            isOneToOne: false
            referencedRelation: "connector_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_imports_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_documents: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          bucket_id: string
          business_client_id: string | null
          checksum: string | null
          confidentiality: Database["public"]["Enums"]["confidentiality_level"]
          created_at: string
          credential_type: Database["public"]["Enums"]["credential_type"]
          document_number: string | null
          file_name: string
          file_size: number | null
          id: string
          issuer: string | null
          lifecycle: Database["public"]["Enums"]["document_lifecycle"]
          mime_type: string | null
          note: string | null
          organization_id: string
          original_file_name: string | null
          reference_project_id: string | null
          review_status: Database["public"]["Enums"]["credential_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          scan_status: Database["public"]["Enums"]["document_scan_status"]
          storage_path: string
          title: string | null
          updated_at: string
          uploaded_by: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          bucket_id?: string
          business_client_id?: string | null
          checksum?: string | null
          confidentiality?: Database["public"]["Enums"]["confidentiality_level"]
          created_at?: string
          credential_type?: Database["public"]["Enums"]["credential_type"]
          document_number?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          issuer?: string | null
          lifecycle?: Database["public"]["Enums"]["document_lifecycle"]
          mime_type?: string | null
          note?: string | null
          organization_id: string
          original_file_name?: string | null
          reference_project_id?: string | null
          review_status?: Database["public"]["Enums"]["credential_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          scan_status?: Database["public"]["Enums"]["document_scan_status"]
          storage_path: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          bucket_id?: string
          business_client_id?: string | null
          checksum?: string | null
          confidentiality?: Database["public"]["Enums"]["confidentiality_level"]
          created_at?: string
          credential_type?: Database["public"]["Enums"]["credential_type"]
          document_number?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          issuer?: string | null
          lifecycle?: Database["public"]["Enums"]["document_lifecycle"]
          mime_type?: string | null
          note?: string | null
          organization_id?: string
          original_file_name?: string | null
          reference_project_id?: string | null
          review_status?: Database["public"]["Enums"]["credential_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          scan_status?: Database["public"]["Enums"]["document_scan_status"]
          storage_path?: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reference_documents_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_documents_client_fk"
            columns: ["business_client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "business_clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "reference_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_documents_project_fk"
            columns: ["reference_project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "reference_projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "reference_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_import_rows: {
        Row: {
          created_at: string
          id: string
          imported_project_id: string | null
          normalized_data: Json
          raw_data: Json
          reference_import_id: string
          row_number: number
          validation_messages: Json
          validation_status: Database["public"]["Enums"]["import_row_validation_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          imported_project_id?: string | null
          normalized_data?: Json
          raw_data: Json
          reference_import_id: string
          row_number: number
          validation_messages?: Json
          validation_status?: Database["public"]["Enums"]["import_row_validation_status"]
        }
        Update: {
          created_at?: string
          id?: string
          imported_project_id?: string | null
          normalized_data?: Json
          raw_data?: Json
          reference_import_id?: string
          row_number?: number
          validation_messages?: Json
          validation_status?: Database["public"]["Enums"]["import_row_validation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reference_import_rows_imported_project_id_fkey"
            columns: ["imported_project_id"]
            isOneToOne: false
            referencedRelation: "reference_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_import_rows_reference_import_id_fkey"
            columns: ["reference_import_id"]
            isOneToOne: false
            referencedRelation: "reference_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_imports: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_rows: number
          file_name: string
          file_type: string
          id: string
          imported_rows: number
          organization_id: string
          status: Database["public"]["Enums"]["reference_import_status"]
          total_rows: number
          valid_rows: number
          warning_rows: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_rows?: number
          file_name: string
          file_type: string
          id?: string
          imported_rows?: number
          organization_id: string
          status?: Database["public"]["Enums"]["reference_import_status"]
          total_rows?: number
          valid_rows?: number
          warning_rows?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_rows?: number
          file_name?: string
          file_type?: string
          id?: string
          imported_rows?: number
          organization_id?: string
          status?: Database["public"]["Enums"]["reference_import_status"]
          total_rows?: number
          valid_rows?: number
          warning_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "reference_imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_imports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_project_services: {
        Row: {
          classification_confidence: number | null
          classification_source: Database["public"]["Enums"]["classification_source"]
          confirmation_status: Database["public"]["Enums"]["service_confirmation_status"]
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_by_user: boolean
          created_at: string
          id: string
          notes: string | null
          reference_project_id: string
          service_category: Database["public"]["Enums"]["reference_service_category"]
          service_label: string | null
          updated_at: string
        }
        Insert: {
          classification_confidence?: number | null
          classification_source: Database["public"]["Enums"]["classification_source"]
          confirmation_status?: Database["public"]["Enums"]["service_confirmation_status"]
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_user?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          reference_project_id: string
          service_category?: Database["public"]["Enums"]["reference_service_category"]
          service_label?: string | null
          updated_at?: string
        }
        Update: {
          classification_confidence?: number | null
          classification_source?: Database["public"]["Enums"]["classification_source"]
          confirmation_status?: Database["public"]["Enums"]["service_confirmation_status"]
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_user?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          reference_project_id?: string
          service_category?: Database["public"]["Enums"]["reference_service_category"]
          service_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_project_services_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_project_services_reference_project_id_fkey"
            columns: ["reference_project_id"]
            isOneToOne: false
            referencedRelation: "reference_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_projects: {
        Row: {
          address: string | null
          business_client_id: string | null
          city: string | null
          confidentiality_level: Database["public"]["Enums"]["confidentiality_level"]
          country: string | null
          created_at: string
          description: string | null
          end_date: string | null
          external_object_number: string | null
          id: string
          invoice_status: Database["public"]["Enums"]["reference_invoice_status"]
          object_type: string | null
          organization_id: string
          postal_code: string | null
          project_name: string
          project_status: Database["public"]["Enums"]["reference_project_status"]
          region: string | null
          shift_summary_raw: string | null
          shift_values: number[] | null
          source_import_id: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_client_id?: string | null
          city?: string | null
          confidentiality_level?: Database["public"]["Enums"]["confidentiality_level"]
          country?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          external_object_number?: string | null
          id?: string
          invoice_status?: Database["public"]["Enums"]["reference_invoice_status"]
          object_type?: string | null
          organization_id: string
          postal_code?: string | null
          project_name: string
          project_status?: Database["public"]["Enums"]["reference_project_status"]
          region?: string | null
          shift_summary_raw?: string | null
          shift_values?: number[] | null
          source_import_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_client_id?: string | null
          city?: string | null
          confidentiality_level?: Database["public"]["Enums"]["confidentiality_level"]
          country?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          external_object_number?: string | null
          id?: string
          invoice_status?: Database["public"]["Enums"]["reference_invoice_status"]
          object_type?: string | null
          organization_id?: string
          postal_code?: string | null
          project_name?: string
          project_status?: Database["public"]["Enums"]["reference_project_status"]
          region?: string | null
          shift_summary_raw?: string | null
          shift_values?: number[] | null
          source_import_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_projects_business_client_id_fkey"
            columns: ["business_client_id"]
            isOneToOne: false
            referencedRelation: "business_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_projects_source_import_id_fkey"
            columns: ["source_import_id"]
            isOneToOne: false
            referencedRelation: "reference_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      search_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          filters: Json
          id: string
          name: string
          notifications_enabled: boolean
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          name: string
          notifications_enabled?: boolean
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          name?: string
          notifications_enabled?: boolean
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          config: Json
          country_code: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          key: string
          name: string
          poll_interval_seconds: number
          source_type: Database["public"]["Enums"]["source_type"]
          updated_at: string
          website_url: string | null
        }
        Insert: {
          config?: Json
          country_code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          key: string
          name: string
          poll_interval_seconds?: number
          source_type: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          config?: Json
          country_code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          key?: string
          name?: string
          poll_interval_seconds?: number
          source_type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      subcontractor_assignments: {
        Row: {
          chain_level: number
          contract_partner_company_id: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          further_subcontracting_allowed: Database["public"]["Enums"]["further_subcontracting_status"]
          id: string
          internal_rating: number | null
          need_id: string | null
          note: string | null
          organization_id: string
          parent_assignment_id: string | null
          partner_company_id: string
          reference_project_id: string | null
          role: Database["public"]["Enums"]["assignment_role"]
          scope: string | null
          staff_count: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["assignment_status"]
          updated_at: string
        }
        Insert: {
          chain_level?: number
          contract_partner_company_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          further_subcontracting_allowed?: Database["public"]["Enums"]["further_subcontracting_status"]
          id?: string
          internal_rating?: number | null
          need_id?: string | null
          note?: string | null
          organization_id: string
          parent_assignment_id?: string | null
          partner_company_id: string
          reference_project_id?: string | null
          role?: Database["public"]["Enums"]["assignment_role"]
          scope?: string | null
          staff_count?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
        }
        Update: {
          chain_level?: number
          contract_partner_company_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          further_subcontracting_allowed?: Database["public"]["Enums"]["further_subcontracting_status"]
          id?: string
          internal_rating?: number | null
          need_id?: string | null
          note?: string | null
          organization_id?: string
          parent_assignment_id?: string | null
          partner_company_id?: string
          reference_project_id?: string | null
          role?: Database["public"]["Enums"]["assignment_role"]
          scope?: string | null
          staff_count?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_assignments_company_fk"
            columns: ["partner_company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "subcontractor_assignments_contract_partner_fk"
            columns: ["contract_partner_company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "subcontractor_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_assignments_need_fk"
            columns: ["need_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "subcontractor_needs"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "subcontractor_assignments_parent_assignment_id_fkey"
            columns: ["parent_assignment_id"]
            isOneToOne: false
            referencedRelation: "subcontractor_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_assignments_reference_project_id_fkey"
            columns: ["reference_project_id"]
            isOneToOne: false
            referencedRelation: "reference_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractor_matches: {
        Row: {
          availability_score: number
          capacity_score: number
          created_at: string
          credential_score: number
          datacenter_score: number
          exclusion_reason: string | null
          id: string
          missing_information: string[]
          need_id: string
          organization_id: string
          partner_company_id: string
          reasoning: Json
          region_score: number
          reviewed_at: string | null
          reviewed_by: string | null
          score_version: string
          service_score: number
          status: Database["public"]["Enums"]["match_status"]
          total_score: number
          updated_at: string
        }
        Insert: {
          availability_score?: number
          capacity_score?: number
          created_at?: string
          credential_score?: number
          datacenter_score?: number
          exclusion_reason?: string | null
          id?: string
          missing_information?: string[]
          need_id: string
          organization_id: string
          partner_company_id: string
          reasoning?: Json
          region_score?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          score_version: string
          service_score?: number
          status?: Database["public"]["Enums"]["match_status"]
          total_score: number
          updated_at?: string
        }
        Update: {
          availability_score?: number
          capacity_score?: number
          created_at?: string
          credential_score?: number
          datacenter_score?: number
          exclusion_reason?: string | null
          id?: string
          missing_information?: string[]
          need_id?: string
          organization_id?: string
          partner_company_id?: string
          reasoning?: Json
          region_score?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          score_version?: string
          service_score?: number
          status?: Database["public"]["Enums"]["match_status"]
          total_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_matches_company_fk"
            columns: ["partner_company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "subcontractor_matches_need_fk"
            columns: ["need_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "subcontractor_needs"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "subcontractor_matches_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractor_needs: {
        Row: {
          around_the_clock: boolean
          city: string | null
          confidentiality: Database["public"]["Enums"]["partner_confidentiality"]
          country: string | null
          created_at: string
          created_by: string | null
          currency: string
          end_date: string | null
          further_subcontracting_allowed: Database["public"]["Enums"]["further_subcontracting_status"]
          id: string
          internal_note: string | null
          night_work: boolean
          organization_id: string
          project_type: string | null
          radius_km: number | null
          reference_project_id: string | null
          region: string | null
          required_credentials: Database["public"]["Enums"]["credential_type"][]
          required_qualifications: string[]
          required_staff: number | null
          service_category: Database["public"]["Enums"]["partner_service_category"]
          shift_model: Database["public"]["Enums"]["shift_model"]
          site_address: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["need_status"]
          target_budget: number | null
          tender_id: string | null
          title: string
          updated_at: string
          weekend_work: boolean
        }
        Insert: {
          around_the_clock?: boolean
          city?: string | null
          confidentiality?: Database["public"]["Enums"]["partner_confidentiality"]
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          end_date?: string | null
          further_subcontracting_allowed?: Database["public"]["Enums"]["further_subcontracting_status"]
          id?: string
          internal_note?: string | null
          night_work?: boolean
          organization_id: string
          project_type?: string | null
          radius_km?: number | null
          reference_project_id?: string | null
          region?: string | null
          required_credentials?: Database["public"]["Enums"]["credential_type"][]
          required_qualifications?: string[]
          required_staff?: number | null
          service_category: Database["public"]["Enums"]["partner_service_category"]
          shift_model?: Database["public"]["Enums"]["shift_model"]
          site_address?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["need_status"]
          target_budget?: number | null
          tender_id?: string | null
          title: string
          updated_at?: string
          weekend_work?: boolean
        }
        Update: {
          around_the_clock?: boolean
          city?: string | null
          confidentiality?: Database["public"]["Enums"]["partner_confidentiality"]
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          end_date?: string | null
          further_subcontracting_allowed?: Database["public"]["Enums"]["further_subcontracting_status"]
          id?: string
          internal_note?: string | null
          night_work?: boolean
          organization_id?: string
          project_type?: string | null
          radius_km?: number | null
          reference_project_id?: string | null
          region?: string | null
          required_credentials?: Database["public"]["Enums"]["credential_type"][]
          required_qualifications?: string[]
          required_staff?: number | null
          service_category?: Database["public"]["Enums"]["partner_service_category"]
          shift_model?: Database["public"]["Enums"]["shift_model"]
          site_address?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["need_status"]
          target_budget?: number | null
          tender_id?: string | null
          title?: string
          updated_at?: string
          weekend_work?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_needs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_needs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_needs_reference_project_id_fkey"
            columns: ["reference_project_id"]
            isOneToOne: false
            referencedRelation: "reference_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_needs_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_documents: {
        Row: {
          checksum: string | null
          created_at: string
          download_status: Database["public"]["Enums"]["document_download_status"]
          file_size_bytes: number | null
          file_type: string | null
          id: string
          is_demo: boolean
          source_url: string | null
          storage_path: string | null
          tender_id: string
          title: string
          updated_at: string
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          download_status?: Database["public"]["Enums"]["document_download_status"]
          file_size_bytes?: number | null
          file_type?: string | null
          id?: string
          is_demo?: boolean
          source_url?: string | null
          storage_path?: string | null
          tender_id: string
          title: string
          updated_at?: string
        }
        Update: {
          checksum?: string | null
          created_at?: string
          download_status?: Database["public"]["Enums"]["document_download_status"]
          file_size_bytes?: number | null
          file_type?: string | null
          id?: string
          is_demo?: boolean
          source_url?: string | null
          storage_path?: string | null
          tender_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_documents_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_duplicate_candidates: {
        Row: {
          created_at: string
          detection_method: string
          duplicate_of_id: string
          id: string
          similarity_score: number
          status: string
          tender_id: string
        }
        Insert: {
          created_at?: string
          detection_method: string
          duplicate_of_id: string
          id?: string
          similarity_score: number
          status?: string
          tender_id: string
        }
        Update: {
          created_at?: string
          detection_method?: string
          duplicate_of_id?: string
          id?: string
          similarity_score?: number
          status?: string
          tender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_duplicate_candidates_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_duplicate_candidates_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_lots: {
        Row: {
          cpv_codes: string[]
          created_at: string
          description: string | null
          estimated_value_net: number | null
          id: string
          lot_number: string
          tender_id: string
          title: string
        }
        Insert: {
          cpv_codes?: string[]
          created_at?: string
          description?: string | null
          estimated_value_net?: number | null
          id?: string
          lot_number: string
          tender_id: string
          title: string
        }
        Update: {
          cpv_codes?: string[]
          created_at?: string
          description?: string | null
          estimated_value_net?: number | null
          id?: string
          lot_number?: string
          tender_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_lots_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_requirements: {
        Row: {
          category: Database["public"]["Enums"]["requirement_category"]
          created_at: string
          description: string | null
          id: string
          label: string
          mandatory: boolean
          origin: string
          tender_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["requirement_category"]
          created_at?: string
          description?: string | null
          id?: string
          label: string
          mandatory?: boolean
          origin?: string
          tender_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["requirement_category"]
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          mandatory?: boolean
          origin?: string
          tender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_requirements_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tenders: {
        Row: {
          binding_period_end: string | null
          city: string | null
          contract_end: string | null
          contract_start: string | null
          contracting_authority_id: string | null
          country_code: string | null
          cpv_codes: string[]
          created_at: string
          currency: string
          dedupe_group_id: string | null
          description: string | null
          duration_months: number | null
          estimated_value_net: number | null
          external_id: string
          fingerprint: string
          id: string
          is_demo: boolean
          nuts_codes: string[]
          original_language: string
          postal_code: string | null
          procedure_type: Database["public"]["Enums"]["procedure_type"] | null
          procurement_type: Database["public"]["Enums"]["procurement_type"]
          publication_date: string | null
          question_deadline: string | null
          raw_import_id: string | null
          reference_number: string | null
          region_code: string | null
          search_vector: unknown
          sectors: string[]
          source_extras: Json
          source_id: string
          source_url: string | null
          status: Database["public"]["Enums"]["tender_status"]
          submission_deadline: string | null
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          binding_period_end?: string | null
          city?: string | null
          contract_end?: string | null
          contract_start?: string | null
          contracting_authority_id?: string | null
          country_code?: string | null
          cpv_codes?: string[]
          created_at?: string
          currency?: string
          dedupe_group_id?: string | null
          description?: string | null
          duration_months?: number | null
          estimated_value_net?: number | null
          external_id: string
          fingerprint: string
          id?: string
          is_demo?: boolean
          nuts_codes?: string[]
          original_language?: string
          postal_code?: string | null
          procedure_type?: Database["public"]["Enums"]["procedure_type"] | null
          procurement_type?: Database["public"]["Enums"]["procurement_type"]
          publication_date?: string | null
          question_deadline?: string | null
          raw_import_id?: string | null
          reference_number?: string | null
          region_code?: string | null
          search_vector?: unknown
          sectors?: string[]
          source_extras?: Json
          source_id: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["tender_status"]
          submission_deadline?: string | null
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          binding_period_end?: string | null
          city?: string | null
          contract_end?: string | null
          contract_start?: string | null
          contracting_authority_id?: string | null
          country_code?: string | null
          cpv_codes?: string[]
          created_at?: string
          currency?: string
          dedupe_group_id?: string | null
          description?: string | null
          duration_months?: number | null
          estimated_value_net?: number | null
          external_id?: string
          fingerprint?: string
          id?: string
          is_demo?: boolean
          nuts_codes?: string[]
          original_language?: string
          postal_code?: string | null
          procedure_type?: Database["public"]["Enums"]["procedure_type"] | null
          procurement_type?: Database["public"]["Enums"]["procurement_type"]
          publication_date?: string | null
          question_deadline?: string | null
          raw_import_id?: string | null
          reference_number?: string | null
          region_code?: string | null
          search_vector?: unknown
          sectors?: string[]
          source_extras?: Json
          source_id?: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["tender_status"]
          submission_deadline?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenders_contracting_authority_id_fkey"
            columns: ["contracting_authority_id"]
            isOneToOne: false
            referencedRelation: "contracting_authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenders_raw_import_id_fkey"
            columns: ["raw_import_id"]
            isOneToOne: false
            referencedRelation: "raw_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenders_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      watched_authorities: {
        Row: {
          contracting_authority_id: string
          created_at: string
          id: string
          organization_id: string
        }
        Insert: {
          contracting_authority_id: string
          created_at?: string
          id?: string
          organization_id: string
        }
        Update: {
          contracting_authority_id?: string
          created_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watched_authorities_contracting_authority_id_fkey"
            columns: ["contracting_authority_id"]
            isOneToOne: false
            referencedRelation: "contracting_authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watched_authorities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_first_organization: {
        Args: {
          p_city?: string
          p_country_code?: string
          p_legal_form?: string
          p_name: string
          p_slug: string
        }
        Returns: string
      }
      has_org_role: {
        Args: {
          allowed: Database["public"]["Enums"]["org_role"][]
          target_org: string
        }
        Returns: boolean
      }
      is_org_member: { Args: { target_org: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      needs_onboarding: { Args: never; Returns: boolean }
      reference_city_compare_form: { Args: { value: string }; Returns: string }
      reference_compare_form: { Args: { value: string }; Returns: string }
      search_partner_companies: {
        Args: {
          p_available_on?: string
          p_city?: string
          p_country?: string
          p_credential_state?: string
          p_datacenter?: string
          p_direction?: string
          p_directions?: string[]
          p_follow_up_before?: string
          p_has_open_demand_signal?: boolean
          p_include_archived?: boolean
          p_include_blocked?: boolean
          p_last_contact_before?: string
          p_limit?: number
          p_min_available_staff?: number
          p_min_radius_km?: number
          p_offset?: number
          p_only_blocked?: boolean
          p_only_preferred?: boolean
          p_organization_id: string
          p_query?: string
          p_region?: string
          p_services?: string[]
          p_sort?: string
          p_statuses?: string[]
          p_verification_statuses?: string[]
        }
        Returns: {
          id: string
          total_count: number
        }[]
      }
      search_reference_projects: {
        Args: {
          p_city?: string
          p_client_id?: string
          p_confirmation_status?: string
          p_direction?: string
          p_limit?: number
          p_object_type?: string
          p_offset?: number
          p_organization_id: string
          p_period_from?: string
          p_period_to?: string
          p_query?: string
          p_reference_status?: string
          p_region?: string
          p_services?: string[]
          p_sort?: string
          p_statuses?: string[]
        }
        Returns: {
          id: string
          total_count: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      storage_path_organization: {
        Args: { object_name: string }
        Returns: string
      }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      assignment_role:
        | "main_contractor"
        | "subcontractor"
        | "sub_subcontractor"
        | "supplier"
        | "other"
      assignment_status:
        | "planned"
        | "active"
        | "completed"
        | "terminated"
        | "cancelled"
      availability_status:
        | "available"
        | "partially_available"
        | "booked"
        | "unknown"
      classification_source: "name_rule" | "manual" | "import_column" | "ai"
      confidentiality_level: "internal" | "confidential" | "public_reference"
      connector_run_status: "running" | "success" | "partial" | "failed"
      contact_channel: "email" | "phone" | "mobile" | "unknown"
      credential_review_status: "pending" | "reviewed" | "accepted" | "rejected"
      credential_type:
        | "trade_registration"
        | "commercial_register"
        | "guard_permit"
        | "liability_insurance"
        | "tax_clearance"
        | "certificate"
        | "qualification"
        | "reference_proof"
        | "nda"
        | "other"
      datacenter_experience_status: "confirmed" | "claimed" | "none" | "unknown"
      document_download_status:
        | "pending"
        | "downloaded"
        | "failed"
        | "unavailable"
      document_lifecycle: "active" | "archived"
      document_owner_type:
        | "reference_project"
        | "business_client"
        | "partner_company"
        | "organization"
      document_scan_status: "not_scanned" | "clean" | "infected"
      further_subcontracting_status: "allowed" | "not_allowed" | "unknown"
      import_row_validation_status:
        | "valid"
        | "warning"
        | "error"
        | "skipped"
        | "imported"
      match_status:
        | "proposed"
        | "reviewed"
        | "shortlisted"
        | "contacted"
        | "rejected"
        | "selected"
        | "assigned"
      need_status:
        | "draft"
        | "active"
        | "in_review"
        | "filled"
        | "paused"
        | "cancelled"
        | "archived"
      negotiation_status:
        | "indicative"
        | "quoted"
        | "negotiated"
        | "agreed"
        | "expired"
      normalization_run_status: "success" | "failed"
      observation_source_type:
        | "phone_call"
        | "email"
        | "meeting"
        | "website"
        | "press"
        | "job_posting"
        | "tender_portal"
        | "trade_fair"
        | "referral"
        | "other"
      org_role: "super_admin" | "org_admin" | "bid_manager" | "viewer"
      partner_activity_type:
        | "call"
        | "email"
        | "meeting"
        | "quote_requested"
        | "documents_requested"
        | "documents_received"
        | "review"
        | "internal_note"
        | "follow_up"
        | "status_change"
        | "other"
      partner_confidentiality: "internal" | "confidential"
      partner_level:
        | "main_contractor"
        | "subcontractor"
        | "sub_subcontractor"
        | "further_subcontractor"
        | "unknown"
      partner_service_category:
        | "security"
        | "construction_site_security"
        | "property_protection"
        | "reception"
        | "datacenter_security"
        | "paramedic"
        | "cleaning"
        | "construction_support"
        | "warehouse_logistics"
        | "facility_management"
        | "fire_watch"
        | "other"
        | "unknown"
      partner_service_confirmation:
        | "proposed"
        | "confirmed"
        | "self_declared"
        | "rejected"
        | "unknown"
      partner_service_source:
        | "manual"
        | "import_column"
        | "partner_statement"
        | "document"
        | "name_rule"
      partner_signal_status:
        | "new"
        | "reviewed"
        | "relevant"
        | "contacted"
        | "done"
        | "discarded"
        | "expired"
      partner_signal_type:
        | "seeks_subcontractor"
        | "seeks_further_subcontractor"
        | "seeks_security"
        | "seeks_construction_support"
        | "seeks_cleaning"
        | "new_project"
        | "new_datacenter"
        | "new_location"
        | "growing_staff_demand"
        | "available_capacity"
        | "leadership_change"
        | "credential_expiring"
        | "other"
      partner_status:
        | "prospect"
        | "contacted"
        | "in_review"
        | "qualified"
        | "preferred"
        | "blocked"
        | "inactive"
        | "archived"
      procedure_type:
        | "open"
        | "restricted"
        | "negotiated"
        | "competitive_dialogue"
        | "direct_award"
        | "framework"
      procurement_type: "services" | "works" | "supplies"
      rate_model:
        | "hourly"
        | "daily"
        | "monthly"
        | "per_shift"
        | "per_object"
        | "flat"
        | "other"
      reference_import_status:
        | "draft"
        | "validated"
        | "dry_run"
        | "imported"
        | "failed"
        | "cancelled"
      reference_invoice_status:
        | "invoiced"
        | "not_invoiced"
        | "partially_invoiced"
        | "unknown"
      reference_project_status:
        | "planned"
        | "active"
        | "completed"
        | "cancelled"
        | "unknown"
      reference_service_category:
        | "security"
        | "paramedic"
        | "cleaning"
        | "warehouse"
        | "construction_support"
        | "facility_management"
        | "other"
        | "unknown"
      relationship_direction:
        | "can_work_for_us"
        | "may_hire_us"
        | "both"
        | "unknown"
      requirement_category:
        | "eligibility"
        | "staff"
        | "certificate"
        | "reference"
        | "other"
      service_confirmation_status:
        | "proposed"
        | "confirmed"
        | "manual"
        | "rejected"
        | "unknown"
      service_delivery_mode: "own" | "subcontracted" | "unknown"
      shift_model:
        | "day"
        | "night"
        | "two_shift"
        | "three_shift"
        | "around_the_clock"
        | "on_call"
        | "unknown"
      signal_confidence: "low" | "medium" | "high"
      source_type: "api" | "scraper" | "file_feed" | "manual"
      staff_model: "own_staff" | "mixed" | "further_subcontractors" | "unknown"
      tender_status:
        | "published"
        | "amended"
        | "closed"
        | "awarded"
        | "cancelled"
      verification_status:
        | "unverified"
        | "self_declared"
        | "documents_reviewed"
        | "verified"
        | "expired"
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
      assignment_role: [
        "main_contractor",
        "subcontractor",
        "sub_subcontractor",
        "supplier",
        "other",
      ],
      assignment_status: [
        "planned",
        "active",
        "completed",
        "terminated",
        "cancelled",
      ],
      availability_status: [
        "available",
        "partially_available",
        "booked",
        "unknown",
      ],
      classification_source: ["name_rule", "manual", "import_column", "ai"],
      confidentiality_level: ["internal", "confidential", "public_reference"],
      connector_run_status: ["running", "success", "partial", "failed"],
      contact_channel: ["email", "phone", "mobile", "unknown"],
      credential_review_status: ["pending", "reviewed", "accepted", "rejected"],
      credential_type: [
        "trade_registration",
        "commercial_register",
        "guard_permit",
        "liability_insurance",
        "tax_clearance",
        "certificate",
        "qualification",
        "reference_proof",
        "nda",
        "other",
      ],
      datacenter_experience_status: ["confirmed", "claimed", "none", "unknown"],
      document_download_status: [
        "pending",
        "downloaded",
        "failed",
        "unavailable",
      ],
      document_lifecycle: ["active", "archived"],
      document_owner_type: [
        "reference_project",
        "business_client",
        "partner_company",
        "organization",
      ],
      document_scan_status: ["not_scanned", "clean", "infected"],
      further_subcontracting_status: ["allowed", "not_allowed", "unknown"],
      import_row_validation_status: [
        "valid",
        "warning",
        "error",
        "skipped",
        "imported",
      ],
      match_status: [
        "proposed",
        "reviewed",
        "shortlisted",
        "contacted",
        "rejected",
        "selected",
        "assigned",
      ],
      need_status: [
        "draft",
        "active",
        "in_review",
        "filled",
        "paused",
        "cancelled",
        "archived",
      ],
      negotiation_status: [
        "indicative",
        "quoted",
        "negotiated",
        "agreed",
        "expired",
      ],
      normalization_run_status: ["success", "failed"],
      observation_source_type: [
        "phone_call",
        "email",
        "meeting",
        "website",
        "press",
        "job_posting",
        "tender_portal",
        "trade_fair",
        "referral",
        "other",
      ],
      org_role: ["super_admin", "org_admin", "bid_manager", "viewer"],
      partner_activity_type: [
        "call",
        "email",
        "meeting",
        "quote_requested",
        "documents_requested",
        "documents_received",
        "review",
        "internal_note",
        "follow_up",
        "status_change",
        "other",
      ],
      partner_confidentiality: ["internal", "confidential"],
      partner_level: [
        "main_contractor",
        "subcontractor",
        "sub_subcontractor",
        "further_subcontractor",
        "unknown",
      ],
      partner_service_category: [
        "security",
        "construction_site_security",
        "property_protection",
        "reception",
        "datacenter_security",
        "paramedic",
        "cleaning",
        "construction_support",
        "warehouse_logistics",
        "facility_management",
        "fire_watch",
        "other",
        "unknown",
      ],
      partner_service_confirmation: [
        "proposed",
        "confirmed",
        "self_declared",
        "rejected",
        "unknown",
      ],
      partner_service_source: [
        "manual",
        "import_column",
        "partner_statement",
        "document",
        "name_rule",
      ],
      partner_signal_status: [
        "new",
        "reviewed",
        "relevant",
        "contacted",
        "done",
        "discarded",
        "expired",
      ],
      partner_signal_type: [
        "seeks_subcontractor",
        "seeks_further_subcontractor",
        "seeks_security",
        "seeks_construction_support",
        "seeks_cleaning",
        "new_project",
        "new_datacenter",
        "new_location",
        "growing_staff_demand",
        "available_capacity",
        "leadership_change",
        "credential_expiring",
        "other",
      ],
      partner_status: [
        "prospect",
        "contacted",
        "in_review",
        "qualified",
        "preferred",
        "blocked",
        "inactive",
        "archived",
      ],
      procedure_type: [
        "open",
        "restricted",
        "negotiated",
        "competitive_dialogue",
        "direct_award",
        "framework",
      ],
      procurement_type: ["services", "works", "supplies"],
      rate_model: [
        "hourly",
        "daily",
        "monthly",
        "per_shift",
        "per_object",
        "flat",
        "other",
      ],
      reference_import_status: [
        "draft",
        "validated",
        "dry_run",
        "imported",
        "failed",
        "cancelled",
      ],
      reference_invoice_status: [
        "invoiced",
        "not_invoiced",
        "partially_invoiced",
        "unknown",
      ],
      reference_project_status: [
        "planned",
        "active",
        "completed",
        "cancelled",
        "unknown",
      ],
      reference_service_category: [
        "security",
        "paramedic",
        "cleaning",
        "warehouse",
        "construction_support",
        "facility_management",
        "other",
        "unknown",
      ],
      relationship_direction: [
        "can_work_for_us",
        "may_hire_us",
        "both",
        "unknown",
      ],
      requirement_category: [
        "eligibility",
        "staff",
        "certificate",
        "reference",
        "other",
      ],
      service_confirmation_status: [
        "proposed",
        "confirmed",
        "manual",
        "rejected",
        "unknown",
      ],
      service_delivery_mode: ["own", "subcontracted", "unknown"],
      shift_model: [
        "day",
        "night",
        "two_shift",
        "three_shift",
        "around_the_clock",
        "on_call",
        "unknown",
      ],
      signal_confidence: ["low", "medium", "high"],
      source_type: ["api", "scraper", "file_feed", "manual"],
      staff_model: ["own_staff", "mixed", "further_subcontractors", "unknown"],
      tender_status: ["published", "amended", "closed", "awarded", "cancelled"],
      verification_status: [
        "unverified",
        "self_declared",
        "documents_reviewed",
        "verified",
        "expired",
      ],
    },
  },
} as const
