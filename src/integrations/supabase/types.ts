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
      flight_import_staging: {
        Row: {
          airline_hint: string | null
          consumed_at: string | null
          created_at: string
          created_by: string | null
          error: string | null
          expires_at: string
          order_id: string
          parsed: Json | null
          raw_text: string | null
          source_url: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          airline_hint?: string | null
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          expires_at?: string
          order_id: string
          parsed?: Json | null
          raw_text?: string | null
          source_url?: string | null
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          airline_hint?: string | null
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          expires_at?: string
          order_id?: string
          parsed?: Json | null
          raw_text?: string | null
          source_url?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_import_staging_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_financials: {
        Row: {
          commission_pct: number
          commission_value: number
          created_at: string
          discount_value: number
          due_date: string | null
          exchange_rate: number
          id: string
          is_commissionable: boolean
          notes: string | null
          order_item_id: string
          rav_value: number
          sale_value: number
          sort_order: number
          supplier_name: string | null
          tax_value: number
          total: number
          updated_at: string
        }
        Insert: {
          commission_pct?: number
          commission_value?: number
          created_at?: string
          discount_value?: number
          due_date?: string | null
          exchange_rate?: number
          id?: string
          is_commissionable?: boolean
          notes?: string | null
          order_item_id: string
          rav_value?: number
          sale_value?: number
          sort_order?: number
          supplier_name?: string | null
          tax_value?: number
          total?: number
          updated_at?: string
        }
        Update: {
          commission_pct?: number
          commission_value?: number
          created_at?: string
          discount_value?: number
          due_date?: string | null
          exchange_rate?: number
          id?: string
          is_commissionable?: boolean
          notes?: string | null
          order_item_id?: string
          rav_value?: number
          sale_value?: number
          sort_order?: number
          supplier_name?: string | null
          tax_value?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_financials_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_passengers: {
        Row: {
          created_at: string
          id: string
          order_id: string
          order_item_id: string
          passenger_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          order_item_id: string
          passenger_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          order_item_id?: string
          passenger_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_passengers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_passengers_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_passengers_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "order_passengers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          details: Json
          id: string
          kind: string
          order_id: string
          sort_order: number
          status: string
          supplier_locator: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          kind: string
          order_id: string
          sort_order?: number
          status?: string
          supplier_locator?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          order_id?: string
          sort_order?: number
          status?: string
          supplier_locator?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_passengers: {
        Row: {
          birth_date: string | null
          cpf: string | null
          created_at: string
          doc_type: string
          document: string | null
          full_name: string
          id: string
          order_id: string
          passenger_type: string
          passport_expiry_date: string | null
          passport_issue_date: string | null
          passport_number: string | null
          sort_order: number
          ticket_number: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          doc_type?: string
          document?: string | null
          full_name: string
          id?: string
          order_id: string
          passenger_type?: string
          passport_expiry_date?: string | null
          passport_issue_date?: string | null
          passport_number?: string | null
          sort_order?: number
          ticket_number?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          doc_type?: string
          document?: string | null
          full_name?: string
          id?: string
          order_id?: string
          passenger_type?: string
          passport_expiry_date?: string | null
          passport_issue_date?: string | null
          passport_number?: string | null
          sort_order?: number
          ticket_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_passengers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          added_by_name: string | null
          amount: number
          authorization_code: string | null
          card_brand: string | null
          card_last4: string | null
          cashier_number: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          installment_amount: number | null
          installments: number | null
          method: string
          notes: string | null
          order_id: string
          paid_at: string | null
          proposal_number: string | null
          provider: string | null
          status: string
          updated_at: string
        }
        Insert: {
          added_by_name?: string | null
          amount: number
          authorization_code?: string | null
          card_brand?: string | null
          card_last4?: string | null
          cashier_number?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          installment_amount?: number | null
          installments?: number | null
          method: string
          notes?: string | null
          order_id: string
          paid_at?: string | null
          proposal_number?: string | null
          provider?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          added_by_name?: string | null
          amount?: number
          authorization_code?: string | null
          card_brand?: string | null
          card_last4?: string | null
          cashier_number?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          installment_amount?: number | null
          installments?: number | null
          method?: string
          notes?: string | null
          order_id?: string
          paid_at?: string | null
          proposal_number?: string | null
          provider?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          adults: number
          airline_locator: string | null
          birth_date: string | null
          children: number
          coupon: string | null
          cpf: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          notes: string | null
          notes_log: Json
          order_number: string
          owner_user_id: string | null
          package_id: string | null
          package_snapshot: Json
          payer_address: string | null
          payer_city: string | null
          payer_cpf: string | null
          payer_district: string | null
          payer_email: string | null
          payer_full_name: string | null
          payer_ie_rg: string | null
          payer_number: string | null
          payer_phone: string | null
          payer_state: string | null
          payer_zip: string | null
          payment_method: string
          phone: string
          quote_config: Json | null
          seller_email: string | null
          seller_name: string | null
          seller_phone: string | null
          status: string
          supplier_logo_url: string | null
          supplier_name: string | null
          supplier_order_number: string | null
          total_price: number
          travel_reason: string | null
          travel_reason_log: Json
          trip_title: string | null
        }
        Insert: {
          adults?: number
          airline_locator?: string | null
          birth_date?: string | null
          children?: number
          coupon?: string | null
          cpf?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          notes?: string | null
          notes_log?: Json
          order_number?: string
          owner_user_id?: string | null
          package_id?: string | null
          package_snapshot: Json
          payer_address?: string | null
          payer_city?: string | null
          payer_cpf?: string | null
          payer_district?: string | null
          payer_email?: string | null
          payer_full_name?: string | null
          payer_ie_rg?: string | null
          payer_number?: string | null
          payer_phone?: string | null
          payer_state?: string | null
          payer_zip?: string | null
          payment_method: string
          phone: string
          quote_config?: Json | null
          seller_email?: string | null
          seller_name?: string | null
          seller_phone?: string | null
          status?: string
          supplier_logo_url?: string | null
          supplier_name?: string | null
          supplier_order_number?: string | null
          total_price: number
          travel_reason?: string | null
          travel_reason_log?: Json
          trip_title?: string | null
        }
        Update: {
          adults?: number
          airline_locator?: string | null
          birth_date?: string | null
          children?: number
          coupon?: string | null
          cpf?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          notes?: string | null
          notes_log?: Json
          order_number?: string
          owner_user_id?: string | null
          package_id?: string | null
          package_snapshot?: Json
          payer_address?: string | null
          payer_city?: string | null
          payer_cpf?: string | null
          payer_district?: string | null
          payer_email?: string | null
          payer_full_name?: string | null
          payer_ie_rg?: string | null
          payer_number?: string | null
          payer_phone?: string | null
          payer_state?: string | null
          payer_zip?: string | null
          payment_method?: string
          phone?: string
          quote_config?: Json | null
          seller_email?: string | null
          seller_name?: string | null
          seller_phone?: string | null
          status?: string
          supplier_logo_url?: string | null
          supplier_name?: string | null
          supplier_order_number?: string | null
          total_price?: number
          travel_reason?: string | null
          travel_reason_log?: Json
          trip_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          base_occupancy: number
          created_at: string
          destination: string
          going_date: string | null
          hotel_name: string | null
          hotel_stars: number | null
          id: string
          image_url: string | null
          includes: string[] | null
          is_active: boolean
          itinerary: string | null
          meal_plan: string | null
          nights: number | null
          origin: string | null
          outbound_flight: Json | null
          price_per_person: number
          return_date: string | null
          return_flight: Json | null
          slug: string
          sort_order: number
          summary: string | null
          supplier_name: string | null
          taxes: number | null
          title: string
          tripadvisor_address: string | null
          tripadvisor_location_id: string | null
          tripadvisor_photos: Json | null
          tripadvisor_url: string | null
          updated_at: string
        }
        Insert: {
          base_occupancy?: number
          created_at?: string
          destination: string
          going_date?: string | null
          hotel_name?: string | null
          hotel_stars?: number | null
          id?: string
          image_url?: string | null
          includes?: string[] | null
          is_active?: boolean
          itinerary?: string | null
          meal_plan?: string | null
          nights?: number | null
          origin?: string | null
          outbound_flight?: Json | null
          price_per_person: number
          return_date?: string | null
          return_flight?: Json | null
          slug: string
          sort_order?: number
          summary?: string | null
          supplier_name?: string | null
          taxes?: number | null
          title: string
          tripadvisor_address?: string | null
          tripadvisor_location_id?: string | null
          tripadvisor_photos?: Json | null
          tripadvisor_url?: string | null
          updated_at?: string
        }
        Update: {
          base_occupancy?: number
          created_at?: string
          destination?: string
          going_date?: string | null
          hotel_name?: string | null
          hotel_stars?: number | null
          id?: string
          image_url?: string | null
          includes?: string[] | null
          is_active?: boolean
          itinerary?: string | null
          meal_plan?: string | null
          nights?: number | null
          origin?: string | null
          outbound_flight?: Json | null
          price_per_person?: number
          return_date?: string | null
          return_flight?: Json | null
          slug?: string
          sort_order?: number
          summary?: string | null
          supplier_name?: string | null
          taxes?: number | null
          title?: string
          tripadvisor_address?: string | null
          tripadvisor_location_id?: string | null
          tripadvisor_photos?: Json | null
          tripadvisor_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      partner_agencies: {
        Row: {
          agency_cnpj: string | null
          agency_email: string | null
          agency_name: string
          agency_phone: string | null
          brand_primary: string | null
          brand_secondary: string | null
          created_at: string
          id: string
          logo_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agency_cnpj?: string | null
          agency_email?: string | null
          agency_name: string
          agency_phone?: string | null
          brand_primary?: string | null
          brand_secondary?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agency_cnpj?: string | null
          agency_email?: string | null
          agency_name?: string
          agency_phone?: string | null
          brand_primary?: string | null
          brand_secondary?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pedido_assinatura_signers: {
        Row: {
          assinatura_id: string
          clicksign_request_signature_key: string | null
          clicksign_signer_key: string | null
          cpf: string | null
          created_at: string
          email: string
          id: string
          nascimento: string | null
          nome: string
          papel: string
          refused_at: string | null
          signed_at: string | null
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          assinatura_id: string
          clicksign_request_signature_key?: string | null
          clicksign_signer_key?: string | null
          cpf?: string | null
          created_at?: string
          email: string
          id?: string
          nascimento?: string | null
          nome: string
          papel: string
          refused_at?: string | null
          signed_at?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          assinatura_id?: string
          clicksign_request_signature_key?: string | null
          clicksign_signer_key?: string | null
          cpf?: string | null
          created_at?: string
          email?: string
          id?: string
          nascimento?: string | null
          nome?: string
          papel?: string
          refused_at?: string | null
          signed_at?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_assinatura_signers_assinatura_id_fkey"
            columns: ["assinatura_id"]
            isOneToOne: false
            referencedRelation: "pedido_assinaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_assinaturas: {
        Row: {
          clicksign_document_key: string | null
          created_at: string
          created_by: string | null
          deadline_at: string | null
          id: string
          pedido_id: string
          raw_last_event: Json | null
          signed_pdf_path: string | null
          signed_pdf_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          clicksign_document_key?: string | null
          created_at?: string
          created_by?: string | null
          deadline_at?: string | null
          id?: string
          pedido_id: string
          raw_last_event?: Json | null
          signed_pdf_path?: string | null
          signed_pdf_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          clicksign_document_key?: string | null
          created_at?: string
          created_by?: string | null
          deadline_at?: string | null
          id?: string
          pedido_id?: string
          raw_last_event?: Json | null
          signed_pdf_path?: string | null
          signed_pdf_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_assinaturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          address: string | null
          birth_date: string | null
          business_phone: string | null
          charge_boleto_fee: boolean
          city: string | null
          cnpj: string | null
          code: number
          complement: string | null
          country: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          district: string | null
          email: string | null
          foundation_date: string | null
          gender: string | null
          id: string
          is_foreign: boolean
          kind: string
          legal_name: string | null
          mobile_phone: string | null
          monde_id: string | null
          municipal_registration: string | null
          name: string
          notes: string | null
          number: string | null
          passport_expiration: string | null
          passport_number: string | null
          phone: string | null
          rg: string | null
          seller_name: string | null
          state: string | null
          state_registration: string | null
          updated_at: string
          website: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          business_phone?: string | null
          charge_boleto_fee?: boolean
          city?: string | null
          cnpj?: string | null
          code?: number
          complement?: string | null
          country?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          district?: string | null
          email?: string | null
          foundation_date?: string | null
          gender?: string | null
          id?: string
          is_foreign?: boolean
          kind: string
          legal_name?: string | null
          mobile_phone?: string | null
          monde_id?: string | null
          municipal_registration?: string | null
          name: string
          notes?: string | null
          number?: string | null
          passport_expiration?: string | null
          passport_number?: string | null
          phone?: string | null
          rg?: string | null
          seller_name?: string | null
          state?: string | null
          state_registration?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          business_phone?: string | null
          charge_boleto_fee?: boolean
          city?: string | null
          cnpj?: string | null
          code?: number
          complement?: string | null
          country?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          district?: string | null
          email?: string | null
          foundation_date?: string | null
          gender?: string | null
          id?: string
          is_foreign?: boolean
          kind?: string
          legal_name?: string | null
          mobile_phone?: string | null
          monde_id?: string | null
          municipal_registration?: string | null
          name?: string
          notes?: string | null
          number?: string | null
          passport_expiration?: string | null
          passport_number?: string | null
          phone?: string | null
          rg?: string | null
          seller_name?: string | null
          state?: string | null
          state_registration?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      people_cards: {
        Row: {
          brand: string | null
          created_at: string
          expiry: string | null
          holder_name: string | null
          id: string
          is_travel_card: boolean
          last4: string | null
          nickname: string | null
          number_ciphertext: string
          person_id: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          expiry?: string | null
          holder_name?: string | null
          id?: string
          is_travel_card?: boolean
          last4?: string | null
          nickname?: string | null
          number_ciphertext: string
          person_id: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          expiry?: string | null
          holder_name?: string | null
          id?: string
          is_travel_card?: boolean
          last4?: string | null
          nickname?: string | null
          number_ciphertext?: string
          person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_cards_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
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
      detect_card_brand: { Args: { num: string }; Returns: string }
      generate_order_number: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_partner_order_owner: { Args: { _order_id: string }; Returns: boolean }
      materialize_order_from_snapshot: {
        Args: { _order_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user" | "partner"
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
      app_role: ["admin", "user", "partner"],
    },
  },
} as const
