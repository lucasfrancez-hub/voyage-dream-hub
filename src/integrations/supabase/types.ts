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
      ai_agents: {
        Row: {
          ativo: boolean
          avatar_url: string | null
          created_at: string
          horario_fim: string
          horario_inicio: string
          id: string
          mensagem_ausencia: string | null
          nome: string
          slug: string
          system_prompt: string
          temas_proibidos: string[]
          timezone: string
          tom_voz: string | null
          tools_habilitadas: Json
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string
          horario_fim?: string
          horario_inicio?: string
          id?: string
          mensagem_ausencia?: string | null
          nome: string
          slug: string
          system_prompt: string
          temas_proibidos?: string[]
          timezone?: string
          tom_voz?: string | null
          tools_habilitadas?: Json
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string
          horario_fim?: string
          horario_inicio?: string
          id?: string
          mensagem_ausencia?: string | null
          nome?: string
          slug?: string
          system_prompt?: string
          temas_proibidos?: string[]
          timezone?: string
          tom_voz?: string | null
          tools_habilitadas?: Json
          updated_at?: string
        }
        Relationships: []
      }
      broadcast_suggestions: {
        Row: {
          approved_by: string | null
          campaign_id: string | null
          created_at: string
          created_by: string | null
          destination: string
          id: string
          origin: string
          package_id: string | null
          reasoning: string | null
          status: string
          suggested_channels: string[]
          suggested_day: string | null
          suggested_time: string | null
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          destination: string
          id?: string
          origin: string
          package_id?: string | null
          reasoning?: string | null
          status?: string
          suggested_channels?: string[]
          suggested_day?: string | null
          suggested_time?: string | null
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string
          id?: string
          origin?: string
          package_id?: string | null
          reasoning?: string | null
          status?: string
          suggested_channels?: string[]
          suggested_day?: string | null
          suggested_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_suggestions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_broadcast_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_suggestions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_availabilities: {
        Row: {
          available: boolean
          created_at: string
          details: Json
          id: string
          period_end: string
          period_start: string
          product_id: string
          searched_at: string
          updated_at: string
        }
        Insert: {
          available?: boolean
          created_at?: string
          details?: Json
          id?: string
          period_end: string
          period_start: string
          product_id: string
          searched_at?: string
          updated_at?: string
        }
        Update: {
          available?: boolean
          created_at?: string
          details?: Json
          id?: string
          period_end?: string
          period_start?: string
          product_id?: string
          searched_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_availabilities_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_categories: {
        Row: {
          created_at: string
          external_code: string | null
          id: string
          name: string
          operator_id: string | null
          subcategory: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_code?: string | null
          id?: string
          name: string
          operator_id?: string | null
          subcategory?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_code?: string | null
          id?: string
          name?: string
          operator_id?: string | null
          subcategory?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_categories_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "catalog_operators"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_destinations: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          external_code: string | null
          id: string
          name: string
          state: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          external_code?: string | null
          id?: string
          name: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          external_code?: string | null
          id?: string
          name?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      catalog_import_logs: {
        Row: {
          context: Json
          created_at: string
          id: string
          level: string
          message: string
          run_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          level?: string
          message: string
          run_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          level?: string
          message?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_import_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "catalog_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_import_runs: {
        Row: {
          category: string | null
          config: Json
          created_at: string
          created_by: string | null
          destination: string | null
          finished_at: string | null
          id: string
          operator_slug: string | null
          progress: Json
          report: Json
          started_at: string
          status: string
          total_errors: number
          total_found: number
          total_new: number
          total_updated: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          destination?: string | null
          finished_at?: string | null
          id?: string
          operator_slug?: string | null
          progress?: Json
          report?: Json
          started_at?: string
          status?: string
          total_errors?: number
          total_found?: number
          total_new?: number
          total_updated?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          destination?: string | null
          finished_at?: string | null
          id?: string
          operator_slug?: string | null
          progress?: Json
          report?: Json
          started_at?: string
          status?: string
          total_errors?: number
          total_found?: number
          total_new?: number
          total_updated?: number
          updated_at?: string
        }
        Relationships: []
      }
      catalog_operators: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          portal: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          portal?: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          portal?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalog_product_history: {
        Row: {
          change_type: string
          created_at: string
          id: string
          product_id: string
          run_id: string | null
          snapshot: Json
        }
        Insert: {
          change_type?: string
          created_at?: string
          id?: string
          product_id: string
          run_id?: string | null
          snapshot?: Json
        }
        Update: {
          change_type?: string
          created_at?: string
          id?: string
          product_id?: string
          run_id?: string | null
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_product_history_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "catalog_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_images: {
        Row: {
          created_at: string
          id: string
          position: number
          product_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          product_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          product_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_products: {
        Row: {
          available_days: Json
          cancellation_policy: string | null
          category_id: string | null
          change_policy: string | null
          city: string | null
          country: string | null
          created_at: string
          currency: string | null
          departure_place: string | null
          description: string | null
          destination_id: string | null
          destination_label: string | null
          duration: string | null
          external_code: string
          fingerprint: string | null
          highlights: Json
          id: string
          important_info: string | null
          imported_at: string
          includes: Json
          internal_code: string | null
          language: string | null
          last_seen_at: string
          meeting_point: string | null
          name: string
          not_includes: Json
          notes: string | null
          operator_id: string
          price: number | null
          product_url: string | null
          raw: Json
          requirements: string | null
          return_place: string | null
          schedules: Json
          service_type: string | null
          state: string | null
          status: string
          subtitle: string | null
          summary: string | null
          supplier: string | null
          updated_at: string
        }
        Insert: {
          available_days?: Json
          cancellation_policy?: string | null
          category_id?: string | null
          change_policy?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          departure_place?: string | null
          description?: string | null
          destination_id?: string | null
          destination_label?: string | null
          duration?: string | null
          external_code: string
          fingerprint?: string | null
          highlights?: Json
          id?: string
          important_info?: string | null
          imported_at?: string
          includes?: Json
          internal_code?: string | null
          language?: string | null
          last_seen_at?: string
          meeting_point?: string | null
          name: string
          not_includes?: Json
          notes?: string | null
          operator_id: string
          price?: number | null
          product_url?: string | null
          raw?: Json
          requirements?: string | null
          return_place?: string | null
          schedules?: Json
          service_type?: string | null
          state?: string | null
          status?: string
          subtitle?: string | null
          summary?: string | null
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          available_days?: Json
          cancellation_policy?: string | null
          category_id?: string | null
          change_policy?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          departure_place?: string | null
          description?: string | null
          destination_id?: string | null
          destination_label?: string | null
          duration?: string | null
          external_code?: string
          fingerprint?: string | null
          highlights?: Json
          id?: string
          important_info?: string | null
          imported_at?: string
          includes?: Json
          internal_code?: string | null
          language?: string | null
          last_seen_at?: string
          meeting_point?: string | null
          name?: string
          not_includes?: Json
          notes?: string | null
          operator_id?: string
          price?: number | null
          product_url?: string | null
          raw?: Json
          requirements?: string | null
          return_place?: string | null
          schedules?: Json
          service_type?: string | null
          state?: string | null
          status?: string
          subtitle?: string | null
          summary?: string | null
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "catalog_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "catalog_operators"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_rates: {
        Row: {
          amount: number | null
          availability_id: string | null
          created_at: string
          currency: string
          details: Json
          id: string
          label: string | null
          product_id: string
          rate_type: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          availability_id?: string | null
          created_at?: string
          currency?: string
          details?: Json
          id?: string
          label?: string | null
          product_id: string
          rate_type?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          availability_id?: string | null
          created_at?: string
          currency?: string
          details?: Json
          id?: string
          label?: string | null
          product_id?: string
          rate_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_rates_availability_id_fkey"
            columns: ["availability_id"]
            isOneToOne: false
            referencedRelation: "catalog_availabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_rates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_training_scripts: {
        Row: {
          airline: string
          annotations: Json
          created_at: string
          created_by: string | null
          id: string
          initial_url: string
          name: string
          pax_count: number | null
          steps: Json
          updated_at: string
          viewport_height: number
          viewport_width: number
        }
        Insert: {
          airline: string
          annotations?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          initial_url: string
          name: string
          pax_count?: number | null
          steps?: Json
          updated_at?: string
          viewport_height?: number
          viewport_width?: number
        }
        Update: {
          airline?: string
          annotations?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          initial_url?: string
          name?: string
          pax_count?: number | null
          steps?: Json
          updated_at?: string
          viewport_height?: number
          viewport_width?: number
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      financial_categories: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
        }
        Relationships: []
      }
      financial_entries: {
        Row: {
          amount: number
          auto_generated: boolean
          category: string | null
          counterparty: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string | null
          id: string
          kind: string
          notes: string | null
          order_id: string | null
          paid_date: string | null
          payment_method: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          auto_generated?: boolean
          category?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date?: string | null
          id?: string
          kind: string
          notes?: string | null
          order_id?: string | null
          paid_date?: string | null
          payment_method?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          auto_generated?: boolean
          category?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          id?: string
          kind?: string
          notes?: string | null
          order_id?: string | null
          paid_date?: string | null
          payment_method?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_change_alerts: {
        Row: {
          admin_email_sent_at: string | null
          admin_seen_at: string | null
          created_at: string
          flight_number: string
          id: string
          new_arrive_at: string | null
          new_depart_at: string | null
          new_status: string | null
          old_arrive_at: string | null
          old_depart_at: string | null
          old_status: string | null
          order_id: string
          order_item_id: string
          responded_at: string | null
          response: string | null
          severity: string | null
          summary: string | null
          updated_at: string
          wa_button_message_id: string | null
          wa_phone: string | null
        }
        Insert: {
          admin_email_sent_at?: string | null
          admin_seen_at?: string | null
          created_at?: string
          flight_number: string
          id?: string
          new_arrive_at?: string | null
          new_depart_at?: string | null
          new_status?: string | null
          old_arrive_at?: string | null
          old_depart_at?: string | null
          old_status?: string | null
          order_id: string
          order_item_id: string
          responded_at?: string | null
          response?: string | null
          severity?: string | null
          summary?: string | null
          updated_at?: string
          wa_button_message_id?: string | null
          wa_phone?: string | null
        }
        Update: {
          admin_email_sent_at?: string | null
          admin_seen_at?: string | null
          created_at?: string
          flight_number?: string
          id?: string
          new_arrive_at?: string | null
          new_depart_at?: string | null
          new_status?: string | null
          old_arrive_at?: string | null
          old_depart_at?: string | null
          old_status?: string | null
          order_id?: string
          order_item_id?: string
          responded_at?: string | null
          response?: string | null
          severity?: string | null
          summary?: string | null
          updated_at?: string
          wa_button_message_id?: string | null
          wa_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_change_alerts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_change_alerts_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_checkins: {
        Row: {
          attempts: number
          boarding_pass_path: string | null
          boarding_pass_url: string | null
          boarding_passes: Json
          cia: string
          completed_at: string | null
          created_at: string
          delivered_email_at: string | null
          delivered_wa_at: string | null
          departure_at: string | null
          error: string | null
          flight_number: string | null
          id: string
          last_attempt_at: string | null
          locator: string
          mode: string
          order_id: string
          order_item_id: string
          passenger_id: string | null
          pnr_surname: string | null
          run_duration_ms: number | null
          scheduled_for: string | null
          status: string
          updated_at: string
          vision_cost_cents: number | null
        }
        Insert: {
          attempts?: number
          boarding_pass_path?: string | null
          boarding_pass_url?: string | null
          boarding_passes?: Json
          cia: string
          completed_at?: string | null
          created_at?: string
          delivered_email_at?: string | null
          delivered_wa_at?: string | null
          departure_at?: string | null
          error?: string | null
          flight_number?: string | null
          id?: string
          last_attempt_at?: string | null
          locator: string
          mode?: string
          order_id: string
          order_item_id: string
          passenger_id?: string | null
          pnr_surname?: string | null
          run_duration_ms?: number | null
          scheduled_for?: string | null
          status?: string
          updated_at?: string
          vision_cost_cents?: number | null
        }
        Update: {
          attempts?: number
          boarding_pass_path?: string | null
          boarding_pass_url?: string | null
          boarding_passes?: Json
          cia?: string
          completed_at?: string | null
          created_at?: string
          delivered_email_at?: string | null
          delivered_wa_at?: string | null
          departure_at?: string | null
          error?: string | null
          flight_number?: string | null
          id?: string
          last_attempt_at?: string | null
          locator?: string
          mode?: string
          order_id?: string
          order_item_id?: string
          passenger_id?: string | null
          pnr_surname?: string | null
          run_duration_ms?: number | null
          scheduled_for?: string | null
          status?: string
          updated_at?: string
          vision_cost_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_checkins_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_checkins_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_checkins_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "order_passengers"
            referencedColumns: ["id"]
          },
        ]
      }
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
      frt_credentials: {
        Row: {
          cookie: string
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cookie: string
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cookie?: string
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      instagram_accounts: {
        Row: {
          access_token: string | null
          active: boolean
          created_at: string
          display_name: string | null
          id: string
          ig_user_id: string
          is_default: boolean
          metadata: Json
          page_id: string | null
          profile_picture_url: string | null
          token_expires_at: string | null
          updated_at: string
          username: string
          webhook_verify_token: string | null
        }
        Insert: {
          access_token?: string | null
          active?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          ig_user_id: string
          is_default?: boolean
          metadata?: Json
          page_id?: string | null
          profile_picture_url?: string | null
          token_expires_at?: string | null
          updated_at?: string
          username: string
          webhook_verify_token?: string | null
        }
        Update: {
          access_token?: string | null
          active?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          ig_user_id?: string
          is_default?: boolean
          metadata?: Json
          page_id?: string | null
          profile_picture_url?: string | null
          token_expires_at?: string | null
          updated_at?: string
          username?: string
          webhook_verify_token?: string | null
        }
        Relationships: []
      }
      instagram_comments: {
        Row: {
          account_id: string
          auto_dm_sent_at: string | null
          auto_replied_at: string | null
          auto_reply_status: string
          auto_reply_text: string | null
          comment_id: string
          created_at: string
          from_ig_id: string | null
          from_username: string | null
          id: string
          media_id: string
          media_permalink: string | null
          metadata: Json
          parent_comment_id: string | null
          text: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          auto_dm_sent_at?: string | null
          auto_replied_at?: string | null
          auto_reply_status?: string
          auto_reply_text?: string | null
          comment_id: string
          created_at?: string
          from_ig_id?: string | null
          from_username?: string | null
          id?: string
          media_id: string
          media_permalink?: string | null
          metadata?: Json
          parent_comment_id?: string | null
          text?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          auto_dm_sent_at?: string | null
          auto_replied_at?: string | null
          auto_reply_status?: string
          auto_reply_text?: string | null
          comment_id?: string
          created_at?: string
          from_ig_id?: string | null
          from_username?: string | null
          id?: string
          media_id?: string
          media_permalink?: string | null
          metadata?: Json
          parent_comment_id?: string | null
          text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_comments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_conversations: {
        Row: {
          account_id: string
          archived_at: string | null
          assigned_agent_slug: string | null
          assigned_to: string | null
          contact_ig_id: string
          contact_name: string | null
          contact_profile_pic: string | null
          contact_username: string | null
          created_at: string
          funnel_stage: string | null
          id: string
          ig_thread_id: string | null
          last_message_at: string | null
          last_message_preview: string | null
          metadata: Json
          status: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          account_id: string
          archived_at?: string | null
          assigned_agent_slug?: string | null
          assigned_to?: string | null
          contact_ig_id: string
          contact_name?: string | null
          contact_profile_pic?: string | null
          contact_username?: string | null
          created_at?: string
          funnel_stage?: string | null
          id?: string
          ig_thread_id?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          metadata?: Json
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          archived_at?: string | null
          assigned_agent_slug?: string | null
          assigned_to?: string | null
          contact_ig_id?: string
          contact_name?: string | null
          contact_profile_pic?: string | null
          contact_username?: string | null
          created_at?: string
          funnel_stage?: string | null
          id?: string
          ig_thread_id?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          metadata?: Json
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_conversations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_media: {
        Row: {
          account_id: string
          caption: string | null
          container_id: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          error: string | null
          id: string
          ig_media_id: string | null
          image_urls: string[]
          media_type: string
          metadata: Json
          package_id: string | null
          permalink: string | null
          published_at: string | null
          scheduled_for: string | null
          status: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          account_id: string
          caption?: string | null
          container_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          error?: string | null
          id?: string
          ig_media_id?: string | null
          image_urls?: string[]
          media_type: string
          metadata?: Json
          package_id?: string | null
          permalink?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          account_id?: string
          caption?: string | null
          container_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          error?: string | null
          id?: string
          ig_media_id?: string | null
          image_urls?: string[]
          media_type?: string
          metadata?: Json
          package_id?: string | null
          permalink?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_media_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_media_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_messages: {
        Row: {
          attachment_type: string | null
          attachment_url: string | null
          conversation_id: string
          created_at: string
          direction: string
          error: string | null
          id: string
          ig_message_id: string | null
          is_deleted: boolean
          message_type: string
          metadata: Json
          reply_to_ig_message_id: string | null
          sent_by: string | null
          sent_by_agent_slug: string | null
          status: string
          text: string | null
          updated_at: string
        }
        Insert: {
          attachment_type?: string | null
          attachment_url?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          ig_message_id?: string | null
          is_deleted?: boolean
          message_type?: string
          metadata?: Json
          reply_to_ig_message_id?: string | null
          sent_by?: string | null
          sent_by_agent_slug?: string | null
          status?: string
          text?: string | null
          updated_at?: string
        }
        Update: {
          attachment_type?: string | null
          attachment_url?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          ig_message_id?: string | null
          is_deleted?: boolean
          message_type?: string
          metadata?: Json
          reply_to_ig_message_id?: string | null
          sent_by?: string | null
          sent_by_agent_slug?: string | null
          status?: string
          text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "instagram_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      login_email_codes: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      monde_sync_state: {
        Row: {
          error: string | null
          id: string
          imported_count: number
          last_page: number | null
          last_synced_at: string | null
          status: string
          total_records: number | null
          updated_at: string
          updated_count: number
        }
        Insert: {
          error?: string | null
          id: string
          imported_count?: number
          last_page?: number | null
          last_synced_at?: string | null
          status?: string
          total_records?: number | null
          updated_at?: string
          updated_count?: number
        }
        Update: {
          error?: string | null
          id?: string
          imported_count?: number
          last_page?: number | null
          last_synced_at?: string | null
          status?: string
          total_records?: number | null
          updated_at?: string
          updated_count?: number
        }
        Relationships: []
      }
      nfse_config: {
        Row: {
          aliquota_iss: number
          ambiente: string
          atendenet_password: string | null
          atendenet_usuario: string | null
          ativo: boolean
          bairro: string | null
          cep: string | null
          cert_password: string | null
          cert_pfx_base64: string | null
          cnae_principal: string | null
          cnpj: string
          codigo_tributario_municipio: string | null
          codigo_tributario_nacional: string | null
          created_at: string
          descricao_padrao: string | null
          email: string | null
          id: string
          inscricao_municipal: string
          ipm_codigo_atividade: string | null
          ipm_codigo_servico: string | null
          ipm_endpoint: string
          iss_retido: boolean
          item_lista_servico: string
          logradouro: string | null
          municipio_prestacao: string
          nome_fantasia: string | null
          numero: string | null
          padrao: boolean
          provedor: string
          proximo_numero_rps: number
          razao_social: string
          regime_tributario: string
          serie_rps: string
          telefone: string | null
          uf_prestacao: string
          updated_at: string
        }
        Insert: {
          aliquota_iss?: number
          ambiente?: string
          atendenet_password?: string | null
          atendenet_usuario?: string | null
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cert_password?: string | null
          cert_pfx_base64?: string | null
          cnae_principal?: string | null
          cnpj: string
          codigo_tributario_municipio?: string | null
          codigo_tributario_nacional?: string | null
          created_at?: string
          descricao_padrao?: string | null
          email?: string | null
          id?: string
          inscricao_municipal: string
          ipm_codigo_atividade?: string | null
          ipm_codigo_servico?: string | null
          ipm_endpoint?: string
          iss_retido?: boolean
          item_lista_servico?: string
          logradouro?: string | null
          municipio_prestacao?: string
          nome_fantasia?: string | null
          numero?: string | null
          padrao?: boolean
          provedor?: string
          proximo_numero_rps?: number
          razao_social?: string
          regime_tributario?: string
          serie_rps?: string
          telefone?: string | null
          uf_prestacao?: string
          updated_at?: string
        }
        Update: {
          aliquota_iss?: number
          ambiente?: string
          atendenet_password?: string | null
          atendenet_usuario?: string | null
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cert_password?: string | null
          cert_pfx_base64?: string | null
          cnae_principal?: string | null
          cnpj?: string
          codigo_tributario_municipio?: string | null
          codigo_tributario_nacional?: string | null
          created_at?: string
          descricao_padrao?: string | null
          email?: string | null
          id?: string
          inscricao_municipal?: string
          ipm_codigo_atividade?: string | null
          ipm_codigo_servico?: string | null
          ipm_endpoint?: string
          iss_retido?: boolean
          item_lista_servico?: string
          logradouro?: string | null
          municipio_prestacao?: string
          nome_fantasia?: string | null
          numero?: string | null
          padrao?: boolean
          provedor?: string
          proximo_numero_rps?: number
          razao_social?: string
          regime_tributario?: string
          serie_rps?: string
          telefone?: string | null
          uf_prestacao?: string
          updated_at?: string
        }
        Relationships: []
      }
      nfse_emissoes: {
        Row: {
          aliquota_iss: number | null
          base_calculo: number | null
          cancelada_em: string | null
          chave_acesso: string | null
          codigo_verificacao: string | null
          created_at: string
          created_by: string | null
          credito_tributario: number
          data_emissao: string | null
          desconto_condicional: number
          desconto_incondicional: number
          discriminacao: string
          focus_ref: string | null
          focus_response: Json | null
          focus_status: string | null
          id: string
          motivo_cancelamento: string | null
          numero_nfse: string | null
          numero_rps: number | null
          order_id: string | null
          outras_retencoes: number
          prestador: Json | null
          prestador_id: string | null
          reference: string
          serie: string | null
          status: string
          tomador: Json
          tributos_estaduais: number
          tributos_federais: number
          tributos_municipais: number
          updated_at: string
          url_pdf: string | null
          url_xml: string | null
          valor_cofins: number
          valor_csll: number
          valor_deducoes: number
          valor_inss: number
          valor_ir: number
          valor_iss: number | null
          valor_iss_retido: number
          valor_liquido: number | null
          valor_pis: number
          valor_servicos: number
        }
        Insert: {
          aliquota_iss?: number | null
          base_calculo?: number | null
          cancelada_em?: string | null
          chave_acesso?: string | null
          codigo_verificacao?: string | null
          created_at?: string
          created_by?: string | null
          credito_tributario?: number
          data_emissao?: string | null
          desconto_condicional?: number
          desconto_incondicional?: number
          discriminacao: string
          focus_ref?: string | null
          focus_response?: Json | null
          focus_status?: string | null
          id?: string
          motivo_cancelamento?: string | null
          numero_nfse?: string | null
          numero_rps?: number | null
          order_id?: string | null
          outras_retencoes?: number
          prestador?: Json | null
          prestador_id?: string | null
          reference: string
          serie?: string | null
          status?: string
          tomador: Json
          tributos_estaduais?: number
          tributos_federais?: number
          tributos_municipais?: number
          updated_at?: string
          url_pdf?: string | null
          url_xml?: string | null
          valor_cofins?: number
          valor_csll?: number
          valor_deducoes?: number
          valor_inss?: number
          valor_ir?: number
          valor_iss?: number | null
          valor_iss_retido?: number
          valor_liquido?: number | null
          valor_pis?: number
          valor_servicos: number
        }
        Update: {
          aliquota_iss?: number | null
          base_calculo?: number | null
          cancelada_em?: string | null
          chave_acesso?: string | null
          codigo_verificacao?: string | null
          created_at?: string
          created_by?: string | null
          credito_tributario?: number
          data_emissao?: string | null
          desconto_condicional?: number
          desconto_incondicional?: number
          discriminacao?: string
          focus_ref?: string | null
          focus_response?: Json | null
          focus_status?: string | null
          id?: string
          motivo_cancelamento?: string | null
          numero_nfse?: string | null
          numero_rps?: number | null
          order_id?: string | null
          outras_retencoes?: number
          prestador?: Json | null
          prestador_id?: string | null
          reference?: string
          serie?: string | null
          status?: string
          tomador?: Json
          tributos_estaduais?: number
          tributos_federais?: number
          tributos_municipais?: number
          updated_at?: string
          url_pdf?: string | null
          url_xml?: string | null
          valor_cofins?: number
          valor_csll?: number
          valor_deducoes?: number
          valor_inss?: number
          valor_ir?: number
          valor_iss?: number | null
          valor_iss_retido?: number
          valor_liquido?: number | null
          valor_pis?: number
          valor_servicos?: number
        }
        Relationships: [
          {
            foreignKeyName: "nfse_emissoes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_emissoes_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "nfse_config"
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
          tickets: Json
          updated_at: string
          whatsapp: string | null
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
          tickets?: Json
          updated_at?: string
          whatsapp?: string | null
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
          tickets?: Json
          updated_at?: string
          whatsapp?: string | null
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
          card_bin: string | null
          card_brand: string | null
          card_expiry: string | null
          card_last4: string | null
          card_number_enc: string | null
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
          order_item_ids: string[] | null
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
          card_bin?: string | null
          card_brand?: string | null
          card_expiry?: string | null
          card_last4?: string | null
          card_number_enc?: string | null
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
          order_item_ids?: string[] | null
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
          card_bin?: string | null
          card_brand?: string | null
          card_expiry?: string | null
          card_last4?: string | null
          card_number_enc?: string | null
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
          order_item_ids?: string[] | null
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
          cnpj: string | null
          coupon: string | null
          cpf: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          email: string | null
          expected_total: number | null
          full_name: string | null
          id: string
          monde_sale_id: string | null
          notes: string | null
          notes_log: Json
          order_number: string
          owner_user_id: string | null
          package_id: string | null
          package_snapshot: Json
          payer_address: string | null
          payer_birth_date: string | null
          payer_city: string | null
          payer_cnpj: string | null
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
          person_id: string | null
          phone: string | null
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
          cnpj?: string | null
          coupon?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          email?: string | null
          expected_total?: number | null
          full_name?: string | null
          id?: string
          monde_sale_id?: string | null
          notes?: string | null
          notes_log?: Json
          order_number?: string
          owner_user_id?: string | null
          package_id?: string | null
          package_snapshot: Json
          payer_address?: string | null
          payer_birth_date?: string | null
          payer_city?: string | null
          payer_cnpj?: string | null
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
          person_id?: string | null
          phone?: string | null
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
          cnpj?: string | null
          coupon?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          email?: string | null
          expected_total?: number | null
          full_name?: string | null
          id?: string
          monde_sale_id?: string | null
          notes?: string | null
          notes_log?: Json
          order_number?: string
          owner_user_id?: string | null
          package_id?: string | null
          package_snapshot?: Json
          payer_address?: string | null
          payer_birth_date?: string | null
          payer_city?: string | null
          payer_cnpj?: string | null
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
          person_id?: string | null
          phone?: string | null
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
          {
            foreignKeyName: "orders_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      package_ai_copy: {
        Row: {
          channel: string
          package_id: string
          text: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          channel: string
          package_id: string
          text: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          channel?: string
          package_id?: string
          text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_ai_copy_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_date_prices: {
        Row: {
          created_at: string
          date: string
          id: string
          is_available: boolean
          modality: string
          note: string | null
          package_id: string
          price_per_person: number
          seats: number | null
          taxes: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_available?: boolean
          modality?: string
          note?: string | null
          package_id: string
          price_per_person?: number
          seats?: number | null
          taxes?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_available?: boolean
          modality?: string
          note?: string | null
          package_id?: string
          price_per_person?: number
          seats?: number | null
          taxes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_date_prices_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          ai_summary: string | null
          base_occupancy: number
          bed_type: string | null
          created_at: string
          cruise_details: Json | null
          date_mode: string
          destination: string
          flexible_dates: boolean
          going_date: string | null
          hotel_name: string | null
          hotel_stars: number | null
          id: string
          image_url: string | null
          includes: string[] | null
          is_active: boolean
          itinerary: string | null
          kind: string
          max_units: number
          meal_plan: string | null
          meeting_point: string | null
          nights: number | null
          origin: string | null
          outbound_flight: Json | null
          price_per_person: number
          pricing_mode: string
          return_date: string | null
          return_flight: Json | null
          room_category: string | null
          room_type: string | null
          services: Json
          slug: string
          sort_order: number
          summary: string | null
          supplier_name: string | null
          taxes: number | null
          title: string
          tour_modalities: string[]
          tour_times: string[]
          tripadvisor_address: string | null
          tripadvisor_location_id: string | null
          tripadvisor_photos: Json | null
          tripadvisor_url: string | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          base_occupancy?: number
          bed_type?: string | null
          created_at?: string
          cruise_details?: Json | null
          date_mode?: string
          destination: string
          flexible_dates?: boolean
          going_date?: string | null
          hotel_name?: string | null
          hotel_stars?: number | null
          id?: string
          image_url?: string | null
          includes?: string[] | null
          is_active?: boolean
          itinerary?: string | null
          kind?: string
          max_units?: number
          meal_plan?: string | null
          meeting_point?: string | null
          nights?: number | null
          origin?: string | null
          outbound_flight?: Json | null
          price_per_person: number
          pricing_mode?: string
          return_date?: string | null
          return_flight?: Json | null
          room_category?: string | null
          room_type?: string | null
          services?: Json
          slug: string
          sort_order?: number
          summary?: string | null
          supplier_name?: string | null
          taxes?: number | null
          title: string
          tour_modalities?: string[]
          tour_times?: string[]
          tripadvisor_address?: string | null
          tripadvisor_location_id?: string | null
          tripadvisor_photos?: Json | null
          tripadvisor_url?: string | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          base_occupancy?: number
          bed_type?: string | null
          created_at?: string
          cruise_details?: Json | null
          date_mode?: string
          destination?: string
          flexible_dates?: boolean
          going_date?: string | null
          hotel_name?: string | null
          hotel_stars?: number | null
          id?: string
          image_url?: string | null
          includes?: string[] | null
          is_active?: boolean
          itinerary?: string | null
          kind?: string
          max_units?: number
          meal_plan?: string | null
          meeting_point?: string | null
          nights?: number | null
          origin?: string | null
          outbound_flight?: Json | null
          price_per_person?: number
          pricing_mode?: string
          return_date?: string | null
          return_flight?: Json | null
          room_category?: string | null
          room_type?: string | null
          services?: Json
          slug?: string
          sort_order?: number
          summary?: string | null
          supplier_name?: string | null
          taxes?: number | null
          title?: string
          tour_modalities?: string[]
          tour_times?: string[]
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
      pending_authorization_signatures: {
        Row: {
          clicksign_document_key: string
          clicksign_request_signature_key: string
          clicksign_signer_key: string
          consumed_order_id: string | null
          created_at: string
          id: string
          raw_last_event: Json | null
          signed_at: string | null
          signed_pdf_path: string | null
          snapshot: Json
          status: string
          updated_at: string
        }
        Insert: {
          clicksign_document_key: string
          clicksign_request_signature_key: string
          clicksign_signer_key: string
          consumed_order_id?: string | null
          created_at?: string
          id?: string
          raw_last_event?: Json | null
          signed_at?: string | null
          signed_pdf_path?: string | null
          snapshot?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          clicksign_document_key?: string
          clicksign_request_signature_key?: string
          clicksign_signer_key?: string
          consumed_order_id?: string | null
          created_at?: string
          id?: string
          raw_last_event?: Json | null
          signed_at?: string | null
          signed_pdf_path?: string | null
          snapshot?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_authorization_signatures_consumed_order_id_fkey"
            columns: ["consumed_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          address: string | null
          birth_certificate: string | null
          birth_date: string | null
          birth_place: string | null
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
          marital_status: string | null
          mobile_phone: string | null
          monde_id: string | null
          mother_name: string | null
          municipal_registration: string | null
          name: string
          notes: string | null
          number: string | null
          passport_expiration: string | null
          passport_number: string | null
          phone: string | null
          rg: string | null
          rg_issued_at: string | null
          rg_issuer: string | null
          seller_name: string | null
          state: string | null
          state_registration: string | null
          updated_at: string
          website: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          birth_certificate?: string | null
          birth_date?: string | null
          birth_place?: string | null
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
          marital_status?: string | null
          mobile_phone?: string | null
          monde_id?: string | null
          mother_name?: string | null
          municipal_registration?: string | null
          name: string
          notes?: string | null
          number?: string | null
          passport_expiration?: string | null
          passport_number?: string | null
          phone?: string | null
          rg?: string | null
          rg_issued_at?: string | null
          rg_issuer?: string | null
          seller_name?: string | null
          state?: string | null
          state_registration?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          birth_certificate?: string | null
          birth_date?: string | null
          birth_place?: string | null
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
          marital_status?: string | null
          mobile_phone?: string | null
          monde_id?: string | null
          mother_name?: string | null
          municipal_registration?: string | null
          name?: string
          notes?: string | null
          number?: string | null
          passport_expiration?: string | null
          passport_number?: string | null
          phone?: string | null
          rg?: string | null
          rg_issued_at?: string | null
          rg_issuer?: string | null
          seller_name?: string | null
          state?: string | null
          state_registration?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      people_attachments: {
        Row: {
          created_at: string
          description: string
          id: string
          mime_type: string | null
          person_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
          uploaded_by_name: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          mime_type?: string | null
          person_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          mime_type?: string | null
          person_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_attachments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
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
          operator: string | null
          person_id: string
          security_code_hint: string | null
          travel_card_type: string | null
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
          operator?: string | null
          person_id: string
          security_code_hint?: string | null
          travel_card_type?: string | null
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
          operator?: string | null
          person_id?: string
          security_code_hint?: string | null
          travel_card_type?: string | null
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
      people_custom_fields: {
        Row: {
          created_at: string
          field_key: string
          field_value: string | null
          id: string
          person_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_value?: string | null
          id?: string
          person_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_value?: string | null
          id?: string
          person_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_custom_fields_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      people_emails: {
        Row: {
          address: string
          created_at: string
          id: string
          is_primary: boolean
          kind: string
          notes: string | null
          person_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: string
          notes?: string | null
          person_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: string
          notes?: string | null
          person_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_emails_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      people_phones: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          kind: string
          notes: string | null
          number: string
          person_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: string
          notes?: string | null
          number: string
          person_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: string
          notes?: string | null
          number?: string
          person_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_phones_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      people_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          label: string
          person_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          label: string
          person_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          label?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_tags_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_cobrancas: {
        Row: {
          created_at: string
          e2eid: string | null
          expira_em: string
          id: string
          order_id: string | null
          pago_em: string | null
          payer_document: string | null
          payer_name: string | null
          qr_code: string
          qr_code_image: string | null
          raw_response: Json | null
          status: string
          txid: string
          updated_at: string
          valor: number
          webhook_payload: Json | null
        }
        Insert: {
          created_at?: string
          e2eid?: string | null
          expira_em: string
          id?: string
          order_id?: string | null
          pago_em?: string | null
          payer_document?: string | null
          payer_name?: string | null
          qr_code: string
          qr_code_image?: string | null
          raw_response?: Json | null
          status?: string
          txid: string
          updated_at?: string
          valor: number
          webhook_payload?: Json | null
        }
        Update: {
          created_at?: string
          e2eid?: string | null
          expira_em?: string
          id?: string
          order_id?: string | null
          pago_em?: string | null
          payer_document?: string | null
          payer_name?: string | null
          qr_code?: string
          qr_code_image?: string | null
          raw_response?: Json | null
          status?: string
          txid?: string
          updated_at?: string
          valor?: number
          webhook_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pix_cobrancas_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      protocol_verifications: {
        Row: {
          closed_at: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          generated_at: string
          generated_by: string | null
          hash: string
          message_count: number
          numero: string | null
          opened_at: string | null
          protocolo_id: string
        }
        Insert: {
          closed_at?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          hash: string
          message_count?: number
          numero?: string | null
          opened_at?: string | null
          protocolo_id: string
        }
        Update: {
          closed_at?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          hash?: string
          message_count?: number
          numero?: string | null
          opened_at?: string | null
          protocolo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocol_verifications_protocolo_id_fkey"
            columns: ["protocolo_id"]
            isOneToOne: false
            referencedRelation: "wa_protocolos"
            referencedColumns: ["id"]
          },
        ]
      }
      short_links: {
        Row: {
          click_count: number
          created_at: string
          created_by: string | null
          label: string | null
          last_click_at: string | null
          slug: string
          target_url: string
        }
        Insert: {
          click_count?: number
          created_at?: string
          created_by?: string | null
          label?: string | null
          last_click_at?: string | null
          slug: string
          target_url: string
        }
        Update: {
          click_count?: number
          created_at?: string
          created_by?: string | null
          label?: string | null
          last_click_at?: string | null
          slug?: string
          target_url?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      trusted_devices: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          ip_address: string | null
          label: string | null
          last_used_at: string
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          ip_address?: string | null
          label?: string | null
          last_used_at?: string
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          label?: string | null
          last_used_at?: string
          token_hash?: string
          user_agent?: string | null
          user_id?: string
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
      wa_broadcast_campanhas: {
        Row: {
          aprovada_por: string | null
          created_at: string
          criado_por: string | null
          destino_ids: string[]
          id: string
          metrics: Json
          nome: string
          observacoes_marketing: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          aprovada_por?: string | null
          created_at?: string
          criado_por?: string | null
          destino_ids?: string[]
          id?: string
          metrics?: Json
          nome: string
          observacoes_marketing?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          aprovada_por?: string | null
          created_at?: string
          criado_por?: string | null
          destino_ids?: string[]
          id?: string
          metrics?: Json
          nome?: string
          observacoes_marketing?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      wa_broadcast_destinos: {
        Row: {
          ativo: boolean
          created_at: string
          foto_url: string | null
          id: string
          is_admin: boolean
          jid: string
          nome: string
          participantes: number | null
          pode_postar: boolean
          tags: string[]
          tipo: string
          ultima_sync: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          foto_url?: string | null
          id?: string
          is_admin?: boolean
          jid: string
          nome: string
          participantes?: number | null
          pode_postar?: boolean
          tags?: string[]
          tipo: string
          ultima_sync?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          foto_url?: string | null
          id?: string
          is_admin?: boolean
          jid?: string
          nome?: string
          participantes?: number | null
          pode_postar?: boolean
          tags?: string[]
          tipo?: string
          ultima_sync?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      wa_broadcast_envios: {
        Row: {
          campanha_id: string
          created_at: string
          delivered_at: string | null
          destino_id: string
          error: string | null
          id: string
          mensagem_id: string
          read_at: string | null
          sent_at: string | null
          status: string
          updated_at: string
          wa_message_id: string | null
        }
        Insert: {
          campanha_id: string
          created_at?: string
          delivered_at?: string | null
          destino_id: string
          error?: string | null
          id?: string
          mensagem_id: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          wa_message_id?: string | null
        }
        Update: {
          campanha_id?: string
          created_at?: string
          delivered_at?: string | null
          destino_id?: string
          error?: string | null
          id?: string
          mensagem_id?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_broadcast_envios_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "wa_broadcast_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_broadcast_envios_destino_id_fkey"
            columns: ["destino_id"]
            isOneToOne: false
            referencedRelation: "wa_broadcast_destinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_broadcast_envios_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "wa_broadcast_mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_broadcast_mensagens: {
        Row: {
          botoes: Json | null
          campanha_id: string
          created_at: string
          id: string
          midia_caption: string | null
          midia_filename: string | null
          midia_url: string | null
          ordem: number
          scheduled_at: string | null
          texto: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          botoes?: Json | null
          campanha_id: string
          created_at?: string
          id?: string
          midia_caption?: string | null
          midia_filename?: string | null
          midia_url?: string | null
          ordem?: number
          scheduled_at?: string | null
          texto?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          botoes?: Json | null
          campanha_id?: string
          created_at?: string
          id?: string
          midia_caption?: string | null
          midia_filename?: string | null
          midia_url?: string | null
          ordem?: number
          scheduled_at?: string | null
          texto?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_broadcast_mensagens_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "wa_broadcast_campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_conversations: {
        Row: {
          agent_slug: string | null
          ai_debounce_until: string | null
          ai_instruction: string | null
          ai_instruction_at: string | null
          ai_instruction_by: string | null
          ai_paused: boolean
          assigned_to: string | null
          created_at: string
          display_name: string | null
          funnel_stage: string | null
          id: string
          identity_verified_at: string | null
          identity_verified_cpf: string | null
          is_group: boolean
          last_message_at: string
          last_message_preview: string | null
          meta: Json
          mode: string
          person_id: string | null
          priority: string
          protocolo_ativo_id: string | null
          tags: string[]
          unread_count: number
          updated_at: string
          wa_phone: string
        }
        Insert: {
          agent_slug?: string | null
          ai_debounce_until?: string | null
          ai_instruction?: string | null
          ai_instruction_at?: string | null
          ai_instruction_by?: string | null
          ai_paused?: boolean
          assigned_to?: string | null
          created_at?: string
          display_name?: string | null
          funnel_stage?: string | null
          id?: string
          identity_verified_at?: string | null
          identity_verified_cpf?: string | null
          is_group?: boolean
          last_message_at?: string
          last_message_preview?: string | null
          meta?: Json
          mode?: string
          person_id?: string | null
          priority?: string
          protocolo_ativo_id?: string | null
          tags?: string[]
          unread_count?: number
          updated_at?: string
          wa_phone: string
        }
        Update: {
          agent_slug?: string | null
          ai_debounce_until?: string | null
          ai_instruction?: string | null
          ai_instruction_at?: string | null
          ai_instruction_by?: string | null
          ai_paused?: boolean
          assigned_to?: string | null
          created_at?: string
          display_name?: string | null
          funnel_stage?: string | null
          id?: string
          identity_verified_at?: string | null
          identity_verified_cpf?: string | null
          is_group?: boolean
          last_message_at?: string
          last_message_preview?: string | null
          meta?: Json
          mode?: string
          person_id?: string | null
          priority?: string
          protocolo_ativo_id?: string | null
          tags?: string[]
          unread_count?: number
          updated_at?: string
          wa_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_protocolo_ativo_id_fkey"
            columns: ["protocolo_ativo_id"]
            isOneToOne: false
            referencedRelation: "wa_protocolos"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_disparo_config: {
        Row: {
          connected_number: string | null
          created_at: string
          display_name: string | null
          id: string
          instance_name: string
          last_qr_at: string | null
          last_qr_base64: string | null
          last_status_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          connected_number?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          instance_name: string
          last_qr_at?: string | null
          last_qr_base64?: string | null
          last_status_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          connected_number?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          instance_name?: string
          last_qr_at?: string | null
          last_qr_base64?: string | null
          last_status_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      wa_disparo_envios: {
        Row: {
          bulk_batch_id: string | null
          created_at: string
          error_message: string | null
          id: string
          media_filename: string | null
          media_kind: string | null
          media_url: string | null
          message: string
          order_id: string | null
          passenger_id: string | null
          provider_message_id: string | null
          sent_at: string | null
          sent_by: string | null
          status: string
          template_id: string | null
          to_name: string | null
          to_number: string
        }
        Insert: {
          bulk_batch_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          media_filename?: string | null
          media_kind?: string | null
          media_url?: string | null
          message: string
          order_id?: string | null
          passenger_id?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          template_id?: string | null
          to_name?: string | null
          to_number: string
        }
        Update: {
          bulk_batch_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          media_filename?: string | null
          media_kind?: string | null
          media_url?: string | null
          message?: string
          order_id?: string | null
          passenger_id?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          template_id?: string | null
          to_name?: string | null
          to_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_disparo_envios_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_disparo_envios_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "order_passengers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_disparo_envios_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "wa_disparo_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_disparo_templates: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      wa_flight_quotes: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          payload: Json
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          payload: Json
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      wa_handoff_events: {
        Row: {
          actor: string | null
          briefing: string | null
          conversation_id: string
          created_at: string
          from_mode: string
          id: string
          reason: string | null
          to_mode: string
        }
        Insert: {
          actor?: string | null
          briefing?: string | null
          conversation_id: string
          created_at?: string
          from_mode: string
          id?: string
          reason?: string | null
          to_mode: string
        }
        Update: {
          actor?: string | null
          briefing?: string | null
          conversation_id?: string
          created_at?: string
          from_mode?: string
          id?: string
          reason?: string | null
          to_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_handoff_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_messages: {
        Row: {
          agent_slug: string | null
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_by_customer: boolean
          direction: string
          error: string | null
          id: string
          media_type: string | null
          media_url: string | null
          protocolo_id: string | null
          reply_to_sender: string | null
          reply_to_snippet: string | null
          reply_to_wa_id: string | null
          sender: string
          sender_user_id: string | null
          tool_calls: Json | null
          wa_message_id: string | null
        }
        Insert: {
          agent_slug?: string | null
          content: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by_customer?: boolean
          direction: string
          error?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          protocolo_id?: string | null
          reply_to_sender?: string | null
          reply_to_snippet?: string | null
          reply_to_wa_id?: string | null
          sender: string
          sender_user_id?: string | null
          tool_calls?: Json | null
          wa_message_id?: string | null
        }
        Update: {
          agent_slug?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by_customer?: boolean
          direction?: string
          error?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          protocolo_id?: string | null
          reply_to_sender?: string | null
          reply_to_snippet?: string | null
          reply_to_wa_id?: string | null
          sender?: string
          sender_user_id?: string | null
          tool_calls?: Json | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_messages_protocolo_id_fkey"
            columns: ["protocolo_id"]
            isOneToOne: false
            referencedRelation: "wa_protocolos"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_protocolos: {
        Row: {
          assunto_resumo: string | null
          closed_at: string | null
          conversation_id: string
          created_at: string
          funnel_stage_final: string | null
          id: string
          inactivity_warned_at: string | null
          last_activity_at: string
          numero: string
          numero_pedido: string | null
          numero_reserva: string | null
          opened_at: string
          resumo_conversa: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assunto_resumo?: string | null
          closed_at?: string | null
          conversation_id: string
          created_at?: string
          funnel_stage_final?: string | null
          id?: string
          inactivity_warned_at?: string | null
          last_activity_at?: string
          numero?: string
          numero_pedido?: string | null
          numero_reserva?: string | null
          opened_at?: string
          resumo_conversa?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assunto_resumo?: string | null
          closed_at?: string | null
          conversation_id?: string
          created_at?: string
          funnel_stage_final?: string | null
          id?: string
          inactivity_warned_at?: string | null
          last_activity_at?: string
          numero?: string
          numero_pedido?: string | null
          numero_reserva?: string | null
          opened_at?: string
          resumo_conversa?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_protocolos_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _iata_city: { Args: { code: string }; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      detect_card_brand: { Args: { num: string }; Returns: string }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      generate_order_number: { Args: never; Returns: string }
      gerar_numero_protocolo: { Args: never; Returns: string }
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
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      nfse_next_rps: { Args: { _prestador_id?: string }; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      verify_protocol_hash: {
        Args: { _hash: string }
        Returns: {
          closed_at: string
          contact_name: string
          contact_phone: string
          generated_at: string
          generated_by: string
          message_count: number
          numero: string
          opened_at: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "partner" | "marketing"
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
      app_role: ["admin", "user", "partner", "marketing"],
    },
  },
} as const
