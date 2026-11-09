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
      authority_to_sell: {
        Row: {
          id: string
          created_at: string
          agreement_date: string | null
          customer_name: string
          customer_address: string | null
          customer_phone: string | null
          customer_id_type: string | null
          vehicle_make: string
          vehicle_year_model: string | null
          vehicle_color: string | null
          vehicle_engine_number: string | null
          vehicle_chassis: string | null
          valid_until: string | null
          note: string | null
          signature: string | null
          rep_name: string | null
          owner_rep_name: string | null
          rep_signature: string | null
          rep_signature_date: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          agreement_date?: string | null
          customer_name: string
          customer_address?: string | null
          customer_phone?: string | null
          customer_id_type?: string | null
          vehicle_make: string
          vehicle_year_model?: string | null
          vehicle_color?: string | null
          vehicle_engine_number?: string | null
          vehicle_chassis?: string | null
          valid_until?: string | null
          note?: string | null
          signature?: string | null
          rep_name?: string | null
          owner_rep_name?: string | null
          rep_signature?: string | null
          rep_signature_date?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          agreement_date?: string | null
          customer_name?: string
          customer_address?: string | null
          customer_phone?: string | null
          customer_id_type?: string | null
          vehicle_make?: string
          vehicle_year_model?: string | null
          vehicle_color?: string | null
          vehicle_engine_number?: string | null
          vehicle_chassis?: string | null
          valid_until?: string | null
          note?: string | null
          signature?: string | null
          rep_name?: string | null
          owner_rep_name?: string | null
          rep_signature?: string | null
          rep_signature_date?: string | null
          created_by?: string | null
        }
        Relationships: []
      }
      sales_agreements: {
        Row: {
          id: string
          created_at: string
          agreement_date: string | null
          seller_name: string
          seller_address: string | null
          seller_phone: string | null
          seller_id_type: string | null
          buyer_name: string
          buyer_address: string | null
          buyer_phone: string | null
          buyer_id_type: string | null
          vehicle_make: string
          vehicle_year_model: string | null
          vehicle_color: string | null
          vehicle_engine_number: string | null
          vehicle_chassis: string | null
          vehicle_plate_number: string | null
          sale_price: string | null
          payment_method: string | null
          note: string | null
          seller_signature: string | null
          buyer_signature: string | null
          seller_witness_name: string | null
          seller_witness_signature: string | null
          buyer_witness_name: string | null
          buyer_witness_signature: string | null
          rep_name: string | null
          rep_signature: string | null
          rep_signature_date: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          agreement_date?: string | null
          seller_name: string
          seller_address?: string | null
          seller_phone?: string | null
          seller_id_type?: string | null
          buyer_name: string
          buyer_address?: string | null
          buyer_phone?: string | null
          buyer_id_type?: string | null
          vehicle_make: string
          vehicle_year_model?: string | null
          vehicle_color?: string | null
          vehicle_engine_number?: string | null
          vehicle_chassis?: string | null
          vehicle_plate_number?: string | null
          sale_price?: string | null
          payment_method?: string | null
          note?: string | null
          seller_signature?: string | null
          buyer_signature?: string | null
          seller_witness_name?: string | null
          seller_witness_signature?: string | null
          buyer_witness_name?: string | null
          buyer_witness_signature?: string | null
          rep_name?: string | null
          rep_signature?: string | null
          rep_signature_date?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          agreement_date?: string | null
          seller_name?: string
          seller_address?: string | null
          seller_phone?: string | null
          seller_id_type?: string | null
          buyer_name?: string
          buyer_address?: string | null
          buyer_phone?: string | null
          buyer_id_type?: string | null
          vehicle_make?: string
          vehicle_year_model?: string | null
          vehicle_color?: string | null
          vehicle_engine_number?: string | null
          vehicle_chassis?: string | null
          vehicle_plate_number?: string | null
          sale_price?: string | null
          payment_method?: string | null
          note?: string | null
          seller_signature?: string | null
          buyer_signature?: string | null
          seller_witness_name?: string | null
          seller_witness_signature?: string | null
          buyer_witness_name?: string | null
          buyer_witness_signature?: string | null
          rep_name?: string | null
          rep_signature?: string | null
          rep_signature_date?: string | null
          created_by?: string | null
        }
        Relationships: []
      }
      performance_quotes: {
        Row: {
          id: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_email: string | null
          customer_address: string | null
          total_amount: number
          quote_date: string
          status: string
          notes: string | null
          quote_url: string | null
          bank_name: string | null
          account_number: string | null
          account_name: string | null
          vat_percentage: number | null
          vat_amount: number | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_email?: string | null
          customer_address?: string | null
          total_amount?: number
          quote_date?: string
          status?: string
          notes?: string | null
          quote_url?: string | null
          bank_name?: string | null
          account_number?: string | null
          account_name?: string | null
          vat_percentage?: number | null
          vat_amount?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_email?: string | null
          customer_address?: string | null
          total_amount?: number
          quote_date?: string
          status?: string
          notes?: string | null
          quote_url?: string | null
          bank_name?: string | null
          account_number?: string | null
          account_name?: string | null
          vat_percentage?: number | null
          vat_amount?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      performance_quote_items: {
        Row: {
          id: string
          quote_id: string
          vehicle_id: string | null
          vehicle_description: string | null
          vin: string | null
          base_price: number
          has_duty: boolean
          duty_price: number | null
          quantity: number
          condition: string | null
          transmission: string | null
          cylinders: string | null
          created_at: string
        }
        Insert: {
          id?: string
          quote_id: string
          vehicle_id?: string | null
          vehicle_description?: string | null
          vin?: string | null
          base_price?: number
          has_duty?: boolean
          duty_price?: number | null
          quantity?: number
          condition?: string | null
          transmission?: string | null
          cylinders?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          quote_id?: string
          vehicle_id?: string | null
          vehicle_description?: string | null
          vin?: string | null
          base_price?: number
          has_duty?: boolean
          duty_price?: number | null
          quantity?: number
          condition?: string | null
          transmission?: string | null
          cylinders?: string | null
          created_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          action?: string
          entity_type?: string
          entity_id?: string | null
          details?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          }
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          signature_data: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          signature_data?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          signature_data?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          message: string
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          message: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          message?: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          condition_at_pickup: string
          created_at: string
          id: string
          inspector_name: string
          pickup_date: string
          return_condition_notes: string | null
          return_date: string | null
          returned_in_good_condition: boolean
          signature_data: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          condition_at_pickup: string
          created_at?: string
          id?: string
          inspector_name: string
          pickup_date?: string
          return_condition_notes?: string | null
          return_date?: string | null
          returned_in_good_condition?: boolean
          signature_data?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          condition_at_pickup?: string
          created_at?: string
          id?: string
          inspector_name?: string
          pickup_date?: string
          return_condition_notes?: string | null
          return_date?: string | null
          returned_in_good_condition?: boolean
          signature_data?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_repairs: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          repair_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          repair_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          repair_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_repairs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_repairs_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "repairs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          customer_id: string
          due_date: string | null
          id: string
          invoice_number: string
          invoice_type: string
          notes: string | null
          sale_id: string | null
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          due_date?: string | null
          id?: string
          invoice_number: string
          invoice_type?: string
          notes?: string | null
          sale_id?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          invoice_type?: string
          notes?: string | null
          sale_id?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      property_intakes: {
        Row: {
          id: string
          created_at: string
          form_number: string | null
          form_date: string | null
          full_name: string
          phone_number: string | null
          residential_address: string | null
          property_type: string | null
          property_type_other: string | null
          property_location: string | null
          ownership_documents: string[] | null
          ownership_document_other: string | null
          property_specifications: string | null
          property_size: string | null
          plot_number: string | null
          price: number | null
          owner_relationship: string | null
          owner_relationship_other: string | null
          advert_placement: string[] | null
          inspected: string | null
          inspection_date: string | null
          inspection_time: string | null
          officer_assigned: string | null
          payment_status: string | null
          amount_paid: number | null
          receipt_number: string | null
          condition_remarks: string | null
          decision: string | null
          decline_reason: string | null
          manager_comments: string | null
          approved_by_name: string | null
          approved_by_signature: string | null
          approved_date: string | null
          agreement: string | null
          sign_one: string | null
          sign_two: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          form_number?: string | null
          form_date?: string | null
          full_name: string
          phone_number?: string | null
          residential_address?: string | null
          property_type?: string | null
          property_type_other?: string | null
          property_location?: string | null
          ownership_documents?: string[] | null
          ownership_document_other?: string | null
          property_specifications?: string | null
          property_size?: string | null
          plot_number?: string | null
          price?: number | null
          owner_relationship?: string | null
          owner_relationship_other?: string | null
          advert_placement?: string[] | null
          inspected?: string | null
          inspection_date?: string | null
          inspection_time?: string | null
          officer_assigned?: string | null
          payment_status?: string | null
          amount_paid?: number | null
          receipt_number?: string | null
          condition_remarks?: string | null
          decision?: string | null
          decline_reason?: string | null
          manager_comments?: string | null
          approved_by_name?: string | null
          approved_by_signature?: string | null
          approved_date?: string | null
          agreement?: string | null
          sign_one?: string | null
          sign_two?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          form_number?: string | null
          form_date?: string | null
          full_name?: string
          phone_number?: string | null
          residential_address?: string | null
          property_type?: string | null
          property_type_other?: string | null
          property_location?: string | null
          ownership_documents?: string[] | null
          ownership_document_other?: string | null
          property_specifications?: string | null
          property_size?: string | null
          plot_number?: string | null
          price?: number | null
          owner_relationship?: string | null
          owner_relationship_other?: string | null
          advert_placement?: string[] | null
          inspected?: string | null
          inspection_date?: string | null
          inspection_time?: string | null
          officer_assigned?: string | null
          payment_status?: string | null
          amount_paid?: number | null
          receipt_number?: string | null
          condition_remarks?: string | null
          decision?: string | null
          decline_reason?: string | null
          manager_comments?: string | null
          approved_by_name?: string | null
          approved_by_signature?: string | null
          approved_date?: string | null
          agreement?: string | null
          sign_one?: string | null
          sign_two?: string | null
          created_by?: string | null
        }
        Relationships: []
      }
      repairs: {
        Row: {
          brought_in_by: string | null
          company: string | null
          condition: string | null
          created_at: string
          customer_id: string | null
          damaged_parts: string | null
          deposit_amount: number | null
          handed_to: string | null
          id: string
          manual_make: string | null
          manual_model: string | null
          manual_year: string | null
          notes: string | null
          payment_status: string | null
          payment_type: string | null
          repair_cost: number | null
          replacement_parts: string | null
          rep_name: string | null
          rep_signature: string | null
          rep_signature_date: string | null
          respray_notes: string | null
          signature_data: string | null
          to_be_resprayed: boolean
          unit: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          brought_in_by?: string | null
          company?: string | null
          condition?: string | null
          created_at?: string
          customer_id?: string | null
          damaged_parts?: string | null
          deposit_amount?: number | null
          handed_to?: string | null
          id?: string
          manual_make?: string | null
          manual_model?: string | null
          manual_year?: string | null
          model_year?: number | null
          notes?: string | null
          payment_status?: string | null
          payment_type?: string | null
          repair_cost?: number | null
          replacement_parts?: string | null
          rep_name?: string | null
          rep_signature?: string | null
          rep_signature_date?: string | null
          respray_notes?: string | null
          signature_data?: string | null
          to_be_resprayed?: boolean
          unit?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          brought_in_by?: string | null
          company?: string | null
          condition?: string | null
          created_at?: string
          customer_id?: string | null
          damaged_parts?: string | null
          deposit_amount?: number | null
          handed_to?: string | null
          id?: string
          manual_make?: string | null
          manual_model?: string | null
          manual_year?: string | null
          model_year?: number | null
          notes?: string | null
          payment_status?: string | null
          payment_type?: string | null
          repair_cost?: number | null
          replacement_parts?: string | null
          rep_name?: string | null
          rep_signature?: string | null
          rep_signature_date?: string | null
          respray_notes?: string | null
          signature_data?: string | null
          to_be_resprayed?: boolean
          unit?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repairs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          buyer_signature: string | null
          buyer_signature_date: string | null
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          is_registered: boolean
          sale_number: number | null
          agreement_details: Json | null
          receipt_url: string | null
          payment_status: string | null
          payment_type: string | null
          rep_name: string | null
          rep_signature: string | null
          rep_signature_date: string | null
          sale_date: string
          sale_price: number
          salesperson_id: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          buyer_signature?: string | null
          buyer_signature_date?: string | null
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          is_registered?: boolean
          sale_number?: number | null
          agreement_details?: Json | null
          receipt_url?: string | null
          payment_status?: string | null
          payment_type?: string | null
          rep_name?: string | null
          rep_signature?: string | null
          rep_signature_date?: string | null
          sale_date?: string
          sale_price: number
          salesperson_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          buyer_signature?: string | null
          buyer_signature_date?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          is_registered?: boolean
          sale_number?: number | null
          agreement_details?: Json | null
          receipt_url?: string | null
          payment_status?: string | null
          payment_type?: string | null
          rep_name?: string | null
          rep_signature?: string | null
          rep_signature_date?: string | null
          sale_date?: string
          sale_price?: number
          salesperson_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          id: string
          sale_id: string | null
          amount: number
          payment_date: string | null
          payment_method: string | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          sale_id?: string | null
          amount: number
          payment_date?: string | null
          payment_method?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          sale_id?: string | null
          amount?: number
          payment_date?: string | null
          payment_method?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      sale_vehicles: {
        Row: {
          created_at: string
          id: string
          price: number | null
          sale_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          price?: number | null
          sale_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          price?: number | null
          sale_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_vehicles_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_vehicles_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_images: {
        Row: {
          created_at: string
          id: string
          image_url: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_images_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          color: string | null
          condition: string
          cost_price: number | null
          created_at: string
          created_by: string | null
          date_arrived: string | null
          date_stored: string | null
          description: string | null
          fuel_type: string | null
          id: string
          image_url: string | null
          make: string
          mileage: number | null
          model: string
          num_keys: number
          price: number
          source_company: string | null
          trim: string | null
          inventory_type: string
          source_company_phone: string | null
          source_rep_name: string | null
          source_rep_phone: string | null
          source_rep_signature: string | null
          accepted_by_name: string | null
          accepted_by_phone: string | null
          accepted_date: string | null
          accepted_signature: string | null
          status: string
          transmission: string | null
          updated_at: string
          vin: string | null
          year: number
        }
        Insert: {
          color?: string | null
          condition?: string
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          date_arrived?: string | null
          date_stored?: string | null
          description?: string | null
          fuel_type?: string | null
          id?: string
          image_url?: string | null
          make: string
          mileage?: number | null
          model: string
          num_keys?: number
          price?: number
          source_company?: string | null
          trim?: string | null
          inventory_type?: string
          source_company_phone?: string | null
          source_rep_name?: string | null
          source_rep_phone?: string | null
          source_rep_signature?: string | null
          accepted_by_name?: string | null
          accepted_by_phone?: string | null
          accepted_date?: string | null
          accepted_signature?: string | null
          status?: string
          transmission?: string | null
          updated_at?: string
          vin?: string | null
          year: number
        }
        Update: {
          color?: string | null
          condition?: string
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          date_arrived?: string | null
          date_stored?: string | null
          description?: string | null
          fuel_type?: string | null
          id?: string
          image_url?: string | null
          make?: string
          mileage?: number | null
          model?: string
          num_keys?: number
          price?: number
          source_company?: string | null
          trim?: string | null
          inventory_type?: string
          source_company_phone?: string | null
          source_rep_name?: string | null
          source_rep_phone?: string | null
          source_rep_signature?: string | null
          accepted_by_name?: string | null
          accepted_by_phone?: string | null
          accepted_date?: string | null
          accepted_signature?: string | null
          status?: string
          transmission?: string | null
          updated_at?: string
          vin?: string | null
          year?: number
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
