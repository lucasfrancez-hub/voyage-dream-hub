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
      order_item_financials: {
        Row: {
          commission_pct: number
          commission_value: number
          created_at: string
          discount_value: number
          due_date: string | null
          exchange_rate: number
          id: string
          notes: string | null
          order_item_id: string
          sale_value: number
          sort_order: number
          supplier_name: string | null
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
          notes?: string | null
          order_item_id: string
          sale_value?: number
          sort_order?: number
          supplier_name?: string | null
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
          notes?: string | null
          order_item_id?: string
          sale_value?: number
          sort_order?: number
          supplier_name?: string | null
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
          document: string | null
          full_name: string
          id: string
          order_id: string
          passenger_type: string
          sort_order: number
          ticket_number: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          document?: string | null
          full_name: string
          id?: string
          order_id: string
          passenger_type?: string
          sort_order?: number
          ticket_number?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          document?: string | null
          full_name?: string
          id?: string
          order_id?: string
          passenger_type?: string
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
      orders: {
        Row: {
          adults: number
          airline_locator: string | null
          birth_date: string | null
          children: number
          cpf: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          notes: string | null
          order_number: string
          package_id: string | null
          package_snapshot: Json
          payment_method: string
          phone: string
          status: string
          supplier_name: string | null
          supplier_order_number: string | null
          total_price: number
        }
        Insert: {
          adults?: number
          airline_locator?: string | null
          birth_date?: string | null
          children?: number
          cpf?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          notes?: string | null
          order_number?: string
          package_id?: string | null
          package_snapshot: Json
          payment_method: string
          phone: string
          status?: string
          supplier_name?: string | null
          supplier_order_number?: string | null
          total_price: number
        }
        Update: {
          adults?: number
          airline_locator?: string | null
          birth_date?: string | null
          children?: number
          cpf?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          notes?: string | null
          order_number?: string
          package_id?: string | null
          package_snapshot?: Json
          payment_method?: string
          phone?: string
          status?: string
          supplier_name?: string | null
          supplier_order_number?: string | null
          total_price?: number
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
      generate_order_number: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      materialize_order_from_snapshot: {
        Args: { _order_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
